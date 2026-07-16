(()=>{
  'use strict';
  const auth=window.SmartCityAuth;
  const client=auth?.client;
  const $=id=>document.getElementById(id);
  let statusFilter='pending_soulflame';
  let proposals=[];
  let selected=null;
  let map=null;
  let geometryLayer=null;

  const labels={pending_soulflame:'Чака SoulFlame',changes_requested:'Искани промени',approved:'Одобрено',rejected:'Отказано'};
  const accessLabels={public:'Обществен',customers:'За клиенти',private:'Частен',residents:'За живущи',unknown:'Неизвестен'};
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const date=value=>value?new Date(value).toLocaleString('bg-BG'):'—';

  function notice(text,type='info'){
    const node=$('action-notice');
    node.textContent=text||'';
    node.style.color=type==='error'?'#fecaca':type==='success'?'#bbf7d0':'#bfdbfe';
  }

  function setGate(message=''){
    $('login-gate').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    $('sign-out').classList.add('hidden');
    $('login-notice').textContent=message||'Влез, за да продължиш.';
  }

  async function enterDashboard(){
    const moderator=await auth.isModerator();
    if(!moderator){
      setGate('Профилът е валиден, но няма активно parking moderator право.');
      return;
    }
    $('login-gate').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('sign-out').classList.remove('hidden');
    await loadList();
  }

  async function reconcileSession(){
    try{
      await auth.ready;
      if(!auth.user)return setGate('Няма активна SoulFlame сесия.');
      await enterDashboard();
    }catch(error){
      console.error(error);
      setGate('Supabase входът временно не е достъпен.');
    }
  }

  async function loadList(){
    $('list-summary').textContent='Зареждам…';
    $('proposal-list').innerHTML='';
    const {data,error}=await client.from('parking_zones')
      .select('id,name,status,geometry,vehicle_entrance,pedestrian_exit,access,capacity,fee,opening_hours,created_by,created_at,updated_at,verified_at,verified_by')
      .eq('source','soulflame').eq('status',statusFilter).order('created_at',{ascending:true}).limit(100);
    if(error){
      console.error(error);$('list-summary').textContent='Грешка при зареждане';return;
    }
    proposals=Array.isArray(data)?data:[];
    $('list-summary').textContent=`${proposals.length} · ${labels[statusFilter]||statusFilter}`;
    renderList();
    if(selected&&!proposals.some(item=>item.id===selected.id))clearDetail();
  }

  function renderList(){
    const root=$('proposal-list');root.innerHTML='';
    if(!proposals.length){root.innerHTML='<div class="empty"><strong>Няма предложения</strong><span>Няма записи с този статус.</span></div>';return;}
    proposals.forEach(proposal=>{
      const button=document.createElement('button');button.type='button';button.className=`proposal-card${selected?.id===proposal.id?' active':''}`;
      button.innerHTML=`<b>${safe(proposal.name||'Паркинг зона')}</b><span>${safe(labels[proposal.status]||proposal.status)}</span><small>${safe(date(proposal.created_at))}${proposal.capacity?` · ${proposal.capacity} места`:''}</small>`;
      button.addEventListener('click',()=>selectProposal(proposal));root.appendChild(button);
    });
  }

  function normalizeGeometry(value){
    if(!value)return null;
    if(typeof value==='string'){try{return JSON.parse(value)}catch{return null}}
    return value;
  }

  function geometryPoints(geometry){
    const value=normalizeGeometry(geometry);
    const ring=value?.type==='Polygon'?value.coordinates?.[0]:value?.type==='MultiPolygon'?value.coordinates?.[0]?.[0]:null;
    return Array.isArray(ring)?ring.map(point=>[Number(point[1]),Number(point[0])]).filter(point=>point.every(Number.isFinite)):[];
  }

  function ensureMap(){
    if(map)return;
    map=L.map('proposal-map',{zoomControl:true,minZoom:6}).setView([42.7,25.4],7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  }

  function drawGeometry(proposal){
    ensureMap();
    if(geometryLayer){geometryLayer.remove();geometryLayer=null;}
    const points=geometryPoints(proposal.geometry);
    $('proposal-points').textContent=String(Math.max(0,points.length-(points.length>1?1:0)));
    if(points.length>=3){
      geometryLayer=L.polygon(points,{color:'#22c55e',weight:4,fillColor:'#22c55e',fillOpacity:.18}).addTo(map);
      map.fitBounds(geometryLayer.getBounds().pad(.3));
    }else map.setView([42.7,25.4],7);
    setTimeout(()=>map.invalidateSize(),80);
  }

  async function selectProposal(proposal){
    selected=proposal;renderList();
    $('empty').classList.add('hidden');$('detail').classList.add('active');
    $('proposal-name').textContent=proposal.name||'Паркинг зона';
    $('proposal-date').textContent=`Създадено ${date(proposal.created_at)} · Обновено ${date(proposal.updated_at)}`;
    $('proposal-status').textContent=labels[proposal.status]||proposal.status;
    $('proposal-status').className=`status ${proposal.status}`;
    $('proposal-access').textContent=accessLabels[proposal.access]||proposal.access||'—';
    $('proposal-capacity').textContent=proposal.capacity||'—';
    $('reason').value='';notice('');drawGeometry(proposal);
    const pending=proposal.status==='pending_soulflame';
    ['approve','request-changes','reject'].forEach(id=>$(id).disabled=!pending);
    await Promise.all([loadEvidence(proposal.id),loadHistory(proposal.id)]);
  }

  async function loadEvidence(proposalId){
    const root=$('evidence');root.innerHTML='<div class="evidence-item">Зареждам доказателствата…</div>';
    const {data,error}=await client.from('parking_evidence').select('id,storage_path,note,captured_at,created_at').eq('parking_zone_id',proposalId).order('created_at',{ascending:true});
    if(error){console.error(error);root.innerHTML='<div class="evidence-item">Доказателствата не се заредиха.</div>';return;}
    root.innerHTML='';
    if(!data?.length){root.innerHTML='<div class="evidence-item"><p>Няма приложено доказателство.</p></div>';return;}
    for(const evidence of data){
      const item=document.createElement('div');item.className='evidence-item';
      item.innerHTML=`<p>${safe(evidence.note||'Снимково доказателство')}</p><small>${safe(date(evidence.captured_at||evidence.created_at))}</small>`;
      if(evidence.storage_path){
        const {data:signed,error:signedError}=await client.storage.from('parking-evidence').createSignedUrl(evidence.storage_path,60);
        if(!signedError&&signed?.signedUrl){const image=document.createElement('img');image.src=signed.signedUrl;image.alt='Доказателство за паркинг зоната';item.appendChild(image);}
      }
      root.appendChild(item);
    }
  }

  async function loadHistory(proposalId){
    const root=$('history');root.innerHTML='';
    const {data,error}=await client.from('parking_moderation_events').select('id,action,from_status,to_status,reason,actor_id,created_at').eq('parking_zone_id',proposalId).order('created_at',{ascending:false});
    if(error){console.error(error);root.innerHTML='<div class="history-item">Историята не се зареди.</div>';return;}
    if(!data?.length){root.innerHTML='<div class="history-item"><b>Няма решение</b><small>Предложението още не е модерирано.</small></div>';return;}
    data.forEach(event=>{
      const item=document.createElement('div');item.className='history-item';
      item.innerHTML=`<b>${safe(labels[event.to_status]||event.action)}</b><small>${safe(date(event.created_at))}${event.reason?` · ${safe(event.reason)}`:''}</small>`;root.appendChild(item);
    });
  }

  function clearDetail(){selected=null;$('detail').classList.remove('active');$('empty').classList.remove('hidden');renderList();}

  async function moderate(nextStatus){
    if(!selected)return;
    const reason=$('reason').value.trim();
    if(nextStatus!=='approved'&&reason.length<3)return notice('Добави причина от поне 3 знака.','error');
    ['approve','request-changes','reject'].forEach(id=>$(id).disabled=true);
    notice('Записвам решението…');
    const {data,error}=await client.rpc('moderate_parking_proposal_auth',{proposal_id:selected.id,next_status:nextStatus,moderation_reason:reason||null});
    if(error){console.error(error);notice(error.message||'Решението не беше записано.','error');['approve','request-changes','reject'].forEach(id=>$(id).disabled=false);return;}
    notice(nextStatus==='approved'?'Зоната е одобрена и вече може да се публикува на картата.':'Решението е записано.','success');
    selected={...selected,...(Array.isArray(data)?data[0]:data),status:nextStatus};
    await loadHistory(selected.id);
    setTimeout(loadList,500);
  }

  $('google-login').addEventListener('click',async()=>{
    $('login-notice').textContent='Отварям Google вход…';
    try{await auth.signInWithGoogle(`${location.origin}/moderation`)}catch(error){console.error(error);$('login-notice').textContent='Google входът не стартира.';}
  });
  $('email-login').addEventListener('click',async()=>{
    $('login-notice').textContent='Изпращам magic link…';
    try{await auth.signInWithEmail($('email').value,`${location.origin}/moderation`);$('login-notice').textContent='Провери пощата си за вход.';}catch(error){console.error(error);$('login-notice').textContent='Magic link не беше изпратен.';}
  });
  $('sign-out').addEventListener('click',async()=>{await auth.signOut();setGate('Излезе от moderator профила.');});
  $('refresh').addEventListener('click',()=>auth.user?loadList():reconcileSession());
  $('filters').addEventListener('click',event=>{const button=event.target.closest('[data-status]');if(!button)return;statusFilter=button.dataset.status;document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item===button));clearDetail();loadList();});
  $('approve').addEventListener('click',()=>moderate('approved'));
  $('request-changes').addEventListener('click',()=>moderate('changes_requested'));
  $('reject').addEventListener('click',()=>moderate('rejected'));
  auth?.onChange(session=>{if(!session)setGate('Няма активна SoulFlame сесия.');});
  reconcileSession();
})();
