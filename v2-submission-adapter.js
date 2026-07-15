(()=>{
  'use strict';

  const STATUS='pending_soulflame';

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
      evidence:{note:String(proposal.evidence||'').trim(),capturedAt:proposal.capturedAt||null,uploadToken:null}
    };
  }

  async function submit(proposal,{endpoint='/api/v2/parking-proposals',fetchImpl=window.fetch,storage=window.localStorage}={}){
    const payload=toSubmission(proposal);
    try{
      const response=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(`submission_http_${response.status}`);
      const result=await response.json();
      if(result.status!==STATUS)throw new Error('invalid_submission_status');
      return {...result,delivery:'server'};
    }catch(error){
      const key='sf-v2-submission-outbox';
      const current=JSON.parse(storage.getItem(key)||'[]');
      current.unshift({payload,status:STATUS,queuedAt:new Date().toISOString(),lastError:String(error.message||error)});
      storage.setItem(key,JSON.stringify(current.slice(0,100)));
      return {id:payload.clientSubmissionId,status:STATUS,delivery:'local-outbox'};
    }
  }

  window.SFV2SubmissionAdapter={STATUS,toSubmission,submit};
})();
