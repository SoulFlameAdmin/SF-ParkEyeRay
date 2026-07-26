(()=>{
  'use strict';

  const app=window.SFV2;
  if(!app?.state||!app.startNavigation||!app.buildRoute||app.realNavigation)return;
  const s=app.state;
  const VOICE_KEY='sf_real_navigation_voice_v1';
  const MATCH_INTERVAL=12000;
  const routeColors=['#2f80ed','#7c3aed','#0891b2'];
  const state={
    voiceEnabled:localStorage.getItem(VOICE_KEY)!=='0',
    wakeLock:null,lastInstruction:'',lastBucket:Infinity,lastSpokenAt:0,
    trace:[],lastMatchAt:0,matching:false,match:null,engine:'OSRM · OpenStreetMap',
    routeOptions:[],activeRouteIndex:0
  };
  app.realNavigation=state;

  const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const formatDuration=seconds=>app.formatDuration?.(Number(seconds)||0)||`${Math.round((Number(seconds)||0)/60)} мин`;
  const formatDistance=meters=>app.formatDistance?.(Number(meters)||0)||`${Math.round(Number(meters)||0)} м`;
  const destinationPoint=()=>s.selected?.entrance||s.selected?.point||null;

  const ensureStyles=()=>{
    if(document.getElementById('sf-real-navigation-style'))return;
    const style=document.createElement('style');
    style.id='sf-real-navigation-style';
    style.textContent=`
      .sf-nav-tools{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:8px}
      .sf-nav-tools button,.sf-nav-engine{min-height:30px;padding:0 10px;border:1px solid #ffffff22;border-radius:999px;background:#ffffff12;color:#fff;font-size:9px;font-weight:900}
      .sf-nav-tools button.off{opacity:.62}.sf-nav-engine{display:inline-grid;place-items:center;color:#bfdbfe}
      .sf-route-alternatives{display:flex;gap:7px;margin:9px 0 0;overflow-x:auto;scrollbar-width:none}.sf-route-alternatives::-webkit-scrollbar{display:none}
      .sf-route-option{flex:0 0 auto;min-width:112px;padding:8px 10px;border:1px solid #dbe3ee;border-radius:12px;background:#f8fafc;color:#0f172a;text-align:left}
      .sf-route-option b,.sf-route-option small{display:block}.sf-route-option b{font-size:11px}.sf-route-option small{margin-top:3px;color:#64748b;font-size:9px}.sf-route-option.active{border-color:#2563eb;background:#dbeafe;box-shadow:inset 0 0 0 1px #2563eb}
      #sf-waze-route{background:#0ea5e9!important;color:#fff!important}.route-actions #external-route{background:#fff!important;color:#0f172a!important;border:1px solid #cbd5e1}
      .sf-route-source{margin-top:6px;color:#64748b;font-size:9px;text-align:center}
      @media(max-width:700px){.sf-nav-tools{margin-top:5px}.sf-route-option{min-width:104px;padding:7px 9px}}
    `;
    document.head.appendChild(style);
  };

  const ensureUi=()=>{
    ensureStyles();
    const hud=app.$?.('navigation-hud');
    if(hud&&!document.getElementById('sf-nav-tools')){
      const tools=document.createElement('div');
      tools.id='sf-nav-tools';tools.className='sf-nav-tools';
      tools.innerHTML=`<button id="sf-nav-voice" type="button" aria-pressed="${state.voiceEnabled}">${state.voiceEnabled?'🔊 Глас':'🔇 Без глас'}</button><span class="sf-nav-engine">${safe(state.engine)}</span>`;
      hud.appendChild(tools);
      tools.querySelector('#sf-nav-voice').addEventListener('click',()=>{
        state.voiceEnabled=!state.voiceEnabled;
        localStorage.setItem(VOICE_KEY,state.voiceEnabled?'1':'0');
        const button=tools.querySelector('#sf-nav-voice');
        button.textContent=state.voiceEnabled?'🔊 Глас':'🔇 Без глас';
        button.classList.toggle('off',!state.voiceEnabled);
        button.setAttribute('aria-pressed',String(state.voiceEnabled));
        if(state.voiceEnabled)speak('Гласовите инструкции са включени.',true);
        else speechSynthesis?.cancel?.();
      });
    }

    const actions=document.querySelector('.route-actions');
    if(actions&&!document.getElementById('sf-waze-route')){
      const google=app.$?.('external-route');
      if(google)google.textContent='Google';
      const waze=document.createElement('a');
      waze.id='sf-waze-route';waze.target='_blank';waze.rel='noopener';waze.textContent='Waze';waze.href='#';
      actions.appendChild(waze);
    }

    const routeCard=app.$?.('route-card');
    if(routeCard&&!document.getElementById('sf-route-alternatives')){
      const alternatives=document.createElement('div');
      alternatives.id='sf-route-alternatives';alternatives.className='sf-route-alternatives';alternatives.hidden=true;
      const actionsNode=routeCard.querySelector('.route-actions');
      routeCard.insertBefore(alternatives,actionsNode||null);
      const source=document.createElement('div');
      source.id='sf-route-source';source.className='sf-route-source';source.textContent='Маршрут: OSRM върху OpenStreetMap · трафик: отвори Waze';
      routeCard.appendChild(source);
    }
    updateExternalLinks();
  };

  const updateExternalLinks=()=>{
    const point=destinationPoint();
    if(!point)return;
    const origin=s.user?`&origin=${encodeURIComponent(`${s.user.lat},${s.user.lon}`)}`:'';
    const google=app.$?.('external-route');
    if(google)google.href=`https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(`${point.lat},${point.lon}`)}&travelmode=driving`;
    const waze=document.getElementById('sf-waze-route');
    if(waze)waze.href=`https://waze.com/ul?ll=${encodeURIComponent(`${point.lat},${point.lon}`)}&navigate=yes&utm_source=soulflame`;
  };

  const getBgVoice=()=>{
    const voices=speechSynthesis?.getVoices?.()||[];
    return voices.find(voice=>String(voice.lang||'').toLowerCase().startsWith('bg'))
      ||voices.find(voice=>String(voice.lang||'').toLowerCase().startsWith('en'))||null;
  };

  function speak(text,force=false){
    if(!state.voiceEnabled||!text||!('speechSynthesis'in window))return;
    const now=Date.now();
    if(!force&&now-state.lastSpokenAt<2200)return;
    state.lastSpokenAt=now;
    if(force)speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(String(text));
    utterance.lang='bg-BG';utterance.rate=1.02;utterance.pitch=1;utterance.volume=1;
    const voice=getBgVoice();if(voice)utterance.voice=voice;
    speechSynthesis.speak(utterance);
  }

  const parseDistance=text=>{
    const value=String(text||'').trim().replace(',','.');
    if(!value||value==='—')return Infinity;
    if(value.toLowerCase()==='сега')return 0;
    const number=Number.parseFloat(value);
    if(!Number.isFinite(number))return Infinity;
    return value.includes('km')||value.includes('км')?number*1000:number;
  };

  const bucketFor=meters=>{
    if(!Number.isFinite(meters))return Infinity;
    if(meters>1200)return 2000;
    if(meters>700)return 1200;
    if(meters>350)return 700;
    if(meters>160)return 350;
    if(meters>75)return 160;
    if(meters>30)return 75;
    return 30;
  };

  const maybeAnnounce=()=>{
    if(!s.navigationActive)return;
    const text=app.$?.('nav-maneuver-text')?.textContent?.trim();
    const distanceText=app.$?.('nav-maneuver-distance')?.textContent?.trim();
    if(!text||text==='Следвай маршрута')return;
    const meters=parseDistance(distanceText);
    const bucket=bucketFor(meters);
    const changed=text!==state.lastInstruction;
    const closer=bucket<state.lastBucket;
    if(changed||closer){
      state.lastInstruction=text;state.lastBucket=bucket;
      const phrase=meters<=30?text:`След ${distanceText}, ${text.toLowerCase()}`;
      speak(phrase,changed);
      if(meters<=75&&navigator.vibrate)navigator.vibrate(meters<=30?[120,70,120]:80);
    }
  };

  const acquireWakeLock=async()=>{
    if(!s.navigationActive||document.hidden||!navigator.wakeLock?.request)return;
    try{
      state.wakeLock=await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release',()=>{state.wakeLock=null},{once:true});
    }catch{}
  };
  const releaseWakeLock=async()=>{try{await state.wakeLock?.release?.()}catch{}state.wakeLock=null};

  const drawSelectedRoute=(item,route,index)=>{
    if(!route?.geometry?.coordinates)return;
    item.route=route;state.activeRouteIndex=index;
    s.routeLayer?.clearLayers?.();
    L.geoJSON(route.geometry,{style:{color:routeColors[index%routeColors.length],weight:7,opacity:.94}}).addTo(s.routeLayer);
    if(item.walkRoute?.geometry)L.geoJSON(item.walkRoute.geometry,{style:{color:'#f59e0b',weight:5,opacity:.95,dashArray:'8 8'}}).addTo(s.routeLayer);
    app.prepareNavigationRoute?.(route);
    app.$('drive-distance').textContent=formatDistance(route.distance);
    app.$('drive-time').textContent=formatDuration(route.duration);
    app.$('route-note').textContent=index===0?'Избран е най-бързият наличен маршрут.':`Избран е алтернативен маршрут ${index+1}.`;
    if(!s.navigationActive){
      const bounds=L.geoJSON(route.geometry).getBounds();
      if(bounds.isValid())s.map.fitBounds(bounds,{padding:[55,55]});
    }else if(s.user)app.updateNavigationProgress?.(s.user);
    renderAlternatives(item);
  };

  const renderAlternatives=item=>{
    ensureUi();
    const root=document.getElementById('sf-route-alternatives');
    if(!root)return;
    const primary=item?.route;
    const options=[primary,...(primary?._alternatives||[])].filter(route=>route?.geometry?.coordinates?.length);
    const unique=[];
    for(const route of options){
      if(!unique.some(other=>Math.abs(Number(other.distance)-Number(route.distance))<15&&Math.abs(Number(other.duration)-Number(route.duration))<10))unique.push(route);
    }
    state.routeOptions=unique.slice(0,3);
    if(state.routeOptions.length<2){root.hidden=true;root.innerHTML='';return}
    root.hidden=false;
    root.innerHTML=state.routeOptions.map((route,index)=>{
      const label=index===0?'Най-бърз':`Маршрут ${index+1}`;
      return `<button class="sf-route-option ${index===state.activeRouteIndex?'active':''}" type="button" data-route-option="${index}"><b>${safe(label)} · ${safe(formatDuration(route.duration))}</b><small>${safe(formatDistance(route.distance))}</small></button>`;
    }).join('');
    root.onclick=event=>{
      const button=event.target.closest('[data-route-option]');if(!button)return;
      const index=Number(button.dataset.routeOption),route=state.routeOptions[index];
      if(route)drawSelectedRoute(item,route,index);
    };
  };

  const originalRouteBetween=app.routeBetween;
  app.routeBetween=async(from,to,profile,signal)=>{
    const points=`${from.lat},${from.lon}|${to.lat},${to.lon}`;
    const query=new URLSearchParams({mode:'route',profile,points,steps:'true',alternatives:profile==='driving'?'true':'false'});
    const response=await fetch(`/api/routing?${query.toString()}`,{signal,cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.routes?.[0])throw new Error(data.error||'Route error');
    const route=data.routes[0];
    route._alternatives=data.routes.slice(1);
    route._engine=data.engine||'osrm';
    route._source=data.source||'openstreetmap';
    route._endpoint=data.endpoint||null;
    return route;
  };

  const originalBuildRoute=app.buildRoute;
  app.buildRoute=async(item,userStarted)=>{
    const result=await originalBuildRoute(item,userStarted);
    state.activeRouteIndex=0;
    updateExternalLinks();
    if(item?.route)renderAlternatives(item);
    return result;
  };

  const originalUpdateNext=app.updateNextManeuver;
  if(originalUpdateNext)app.updateNextManeuver=(...args)=>{const result=originalUpdateNext(...args);queueMicrotask(maybeAnnounce);return result};

  const originalReroute=app.requestNavigationReroute;
  if(originalReroute)app.requestNavigationReroute=async(...args)=>{
    speak('Преизчислявам маршрута.',true);
    return originalReroute(...args);
  };

  const originalStart=app.startNavigation;
  app.startNavigation=async(...args)=>{
    ensureUi();state.lastInstruction='';state.lastBucket=Infinity;
    const result=await originalStart(...args);
    if(s.navigationActive){
      await acquireWakeLock();
      updateExternalLinks();
      speak('Навигацията е стартирана. Следвай маршрута.',true);
    }
    return result;
  };

  const originalStop=app.stopNavigation;
  app.stopNavigation=(...args)=>{
    const result=originalStop(...args);
    releaseWakeLock();speechSynthesis?.cancel?.();state.trace=[];state.match=null;
    return result;
  };

  const requestRoadMatch=async()=>{
    if(!s.navigationActive||state.matching||state.trace.length<3||Date.now()-state.lastMatchAt<MATCH_INTERVAL)return;
    state.matching=true;state.lastMatchAt=Date.now();
    try{
      const trace=state.trace.slice(-10);
      const points=trace.map(point=>`${point.lat},${point.lon}`).join('|');
      const timestamps=trace.map(point=>Math.round(point.timestamp/1000)).join(';');
      const query=new URLSearchParams({mode:'match',profile:'driving',points,timestamps});
      const response=await fetch(`/api/routing?${query.toString()}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.matchings?.[0])return;
      const last=[...(data.tracepoints||[])].reverse().find(Boolean);
      state.match={
        confidence:Number(data.matchings[0].confidence||0),
        location:last?.location||null,
        at:Date.now(),endpoint:data.endpoint||null
      };
      s.navigationMapMatch=state.match;
      window.dispatchEvent(new CustomEvent('sf:navigation-map-match',{detail:state.match}));
    }catch{}finally{state.matching=false}
  };

  const originalApply=app.applyUserPosition;
  if(originalApply)app.applyUserPosition=(user,options={})=>{
    const accepted=originalApply(user,options);
    if(accepted&&Number.isFinite(user?.lat)&&Number.isFinite(user?.lon)){
      state.trace.push({lat:Number(user.lat),lon:Number(user.lon),timestamp:Number(user.timestamp||Date.now())});
      if(state.trace.length>20)state.trace.splice(0,state.trace.length-20);
      if(s.navigationActive&&(Number(user.speed)||0)>5)requestRoadMatch();
    }
    return accepted;
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)releaseWakeLock();
    else if(s.navigationActive)acquireWakeLock();
  });
  window.addEventListener('online',()=>{if(s.navigationActive&&s.selected)app.buildRoute(s.selected,false)});
  speechSynthesis?.addEventListener?.('voiceschanged',()=>getBgVoice());

  app.realNavigationDiagnostics=()=>({
    voiceEnabled:state.voiceEnabled,wakeLock:Boolean(state.wakeLock),
    routeOptions:state.routeOptions.length,activeRouteIndex:state.activeRouteIndex,
    mapMatch:state.match,engine:state.engine
  });

  ensureUi();
})();
