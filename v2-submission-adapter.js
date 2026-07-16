(()=>{
  'use strict';

  const STATUS='pending_soulflame';
  const OUTBOX='sf-v2-submission-outbox';
  const MAX_PHOTO_BYTES=8*1024*1024;
  const PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);

  function closeRing(points){
    const ring=points.map(point=>[Number(point.lon),Number(point.lat)]);
    if(ring.length<3)throw new Error('Нужни са поне 3 точки.');
    const first=ring[0],last=ring[ring.length-1];
    if(first[0]!==last[0]||first[1]!==last[1])ring.push([...first]);
    return ring;
  }

  function toSubmission(proposal){
    if(!proposal||!Array.isArray(proposal.geometry))throw new Error('Липсва геометрия.');
    return {
      clientSubmissionId:String(proposal.id||`proposal-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g,'-'),
      name:String(proposal.name||'').trim(),
      geometry:{type:'Polygon',coordinates:[closeRing(proposal.geometry)]},
      vehicleEntrance:proposal.vehicleEntrance?{type:'Point',coordinates:[proposal.vehicleEntrance.lon,proposal.vehicleEntrance.lat]}:null,
      pedestrianExit:proposal.pedestrianExit?{type:'Point',coordinates:[proposal.pedestrianExit.lon,proposal.pedestrianExit.lat]}:null,
      access:proposal.access||'unknown',
      capacity:Number.isInteger(proposal.capacity)&&proposal.capacity>0?proposal.capacity:null,
      fee:proposal.fee||null,
      openingHours:proposal.openingHours||null,
      evidence:{note:String(proposal.evidence||'').trim(),capturedAt:proposal.capturedAt||new Date().toISOString()}
    };
  }

  function readOutbox(storage=window.localStorage){
    try{return JSON.parse(storage.getItem(OUTBOX)||'[]')}catch{return[]}
  }

  function writeOutbox(items,storage=window.localStorage){
    storage.setItem(OUTBOX,JSON.stringify(items.slice(0,100)));
  }

  function queue(payload,error,storage=window.localStorage){
    const current=readOutbox(storage);
    const duplicate=current.some(item=>item.payload?.clientSubmissionId===payload.clientSubmissionId);
    if(!duplicate)current.unshift({payload,status:STATUS,queuedAt:new Date().toISOString(),lastError:String(error?.message||error||'queued')});
    writeOutbox(current,storage);
    return {id:payload.clientSubmissionId,status:STATUS,delivery:'local-outbox'};
  }

  function extension(file){
    if(file.type==='image/jpeg')return'jpg';
    if(file.type==='image/png')return'png';
    if(file.type==='image/webp')return'webp';
    return'';
  }

  async function uploadPhoto(client,user,file){
    if(!file)return null;
    if(!PHOTO_TYPES.has(file.type))throw new Error('unsupported_photo_type');
    if(!Number.isInteger(file.size)||file.size<1||file.size>MAX_PHOTO_BYTES)throw new Error('invalid_photo_size');
    const path=`${user.id}/${crypto.randomUUID()}.${extension(file)}`;
    const {error}=await client.storage.from('parking-evidence').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
    if(error)throw error;
    return path;
  }

  async function findExisting(client,userId,externalId){
    const {data,error}=await client.from('parking_zones').select('id,status,created_at').eq('source','soulflame').eq('created_by',userId).eq('external_id',externalId).maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function ensureEvidence(client,userId,zoneId,payload,storagePath){
    const {data:existing,error:readError}=await client.from('parking_evidence').select('id').eq('parking_zone_id',zoneId).eq('created_by',userId).limit(1);
    if(readError)throw readError;
    if(existing?.length)return existing[0];
    const {data,error}=await client.from('parking_evidence').insert({
      parking_zone_id:zoneId,
      storage_path:storagePath,
      note:payload.evidence.note||null,
      captured_at:payload.evidence.capturedAt||null,
      created_by:userId
    }).select('id').single();
    if(error)throw error;
    return data;
  }

  async function submitPayload(payload,{file=null}={}){
    const auth=window.SmartCityAuth;
    const client=auth?.client;
    const user=auth?.user;
    if(!client||!user)throw new Error('authentication_required');

    let existing=await findExisting(client,user.id,payload.clientSubmissionId);
    let storagePath=null;
    if(file)storagePath=await uploadPhoto(client,user,file);

    if(!existing){
      const {data,error}=await client.from('parking_zones').insert({
        source:'soulflame',external_id:payload.clientSubmissionId,name:payload.name,
        geometry:payload.geometry,vehicle_entrance:payload.vehicleEntrance,pedestrian_exit:payload.pedestrianExit,
        access:payload.access,capacity:payload.capacity,fee:payload.fee,opening_hours:payload.openingHours,
        status:STATUS,created_by:user.id
      }).select('id,status,created_at').single();
      if(error){
        if(error.code==='23505')existing=await findExisting(client,user.id,payload.clientSubmissionId);
        else throw error;
      }else existing=data;
    }
    if(!existing)throw new Error('proposal_insert_failed');
    await ensureEvidence(client,user.id,existing.id,payload,storagePath);
    return {id:existing.id,status:existing.status||STATUS,idempotent:true,delivery:'server'};
  }

  async function submit(proposal,{file=null,storage=window.localStorage}={}){
    const payload=toSubmission(proposal);
    if(!navigator.onLine||!window.SmartCityAuth?.user)return queue(payload,new Error('authentication_or_network_required'),storage);
    try{return await submitPayload(payload,{file})}
    catch(error){console.error(error);return queue(payload,error,storage)}
  }

  function fromServer(row){
    const geometry=typeof row.geometry==='string'?JSON.parse(row.geometry):row.geometry;
    const ring=geometry?.type==='Polygon'?geometry.coordinates?.[0]:[];
    return {
      id:row.external_id||row.id,serverId:row.id,name:row.name,access:row.access||'unknown',capacity:row.capacity||null,
      evidence:'Записано в SoulFlame',photoName:null,
      geometry:(ring||[]).slice(0,-1).map(point=>({lat:Number(point[1]),lon:Number(point[0])})),
      status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,source:'soulflame',delivery:'server'
    };
  }

  async function syncMine(){
    const auth=window.SmartCityAuth;
    if(!auth?.user)return null;
    const {data,error}=await auth.client.from('parking_zones')
      .select('id,external_id,name,status,geometry,access,capacity,created_at,updated_at')
      .eq('source','soulflame').eq('created_by',auth.user.id).order('created_at',{ascending:false});
    if(error)throw error;
    return (data||[]).map(fromServer);
  }

  async function flushOutbox({storage=window.localStorage}={}){
    if(!navigator.onLine||!window.SmartCityAuth?.user)return{sent:0,remaining:readOutbox(storage).length};
    const pending=readOutbox(storage),remaining=[];
    let sent=0;
    for(const entry of pending){
      try{await submitPayload(entry.payload);sent+=1}
      catch(error){remaining.push({...entry,lastError:String(error?.message||error),lastTriedAt:new Date().toISOString()})}
    }
    writeOutbox(remaining,storage);
    return{sent,remaining:remaining.length};
  }

  window.SFV2SubmissionAdapter={STATUS,OUTBOX,MAX_PHOTO_BYTES,PHOTO_TYPES,toSubmission,submit,submitPayload,syncMine,flushOutbox,readOutbox};
})();
