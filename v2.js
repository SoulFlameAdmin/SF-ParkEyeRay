(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  const onboardingDone=localStorage.getItem('smartcity_onboarding_version')==='3';
  const localAutomation=['localhost','127.0.0.1'].includes(location.hostname);
  if(!onboardingDone&&!localAutomation&&params.get('skipOnboarding')!=='1'){
    const next=`${location.pathname}${location.search}`;
    location.replace(`/intro.html?next=${encodeURIComponent(next)}`);
    return;
  }
  if(!document.querySelector('link[href="/v2-waze.css"]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/v2-waze.css';document.head.appendChild(style);
  }
  const modules=['/v2-core.js','/v2-ui.js','/v2-parking.js','/v2-destinations.js','/v2-parking-engine.js','/v2-layers.js','/v2-map-first.js','/v2-route.js','/v2-navigation.js','/v2-proposals.js','/v2-precision-gps.js','/v2-heading-pro.js','/v2-init.js'];

  const installNavigationIntelligence=()=>{
    const app=window.SFV2;
    if(!app||app.navigationIntelligence)return;
    const s=app.state;
    const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
    const state={
      startedAt:Date.now(),movingMs:0,lastTickAt:Date.now(),lastFixAt:0,lastSpeed:0,
      maxSpeed:0,weightedSpeed:0,weightedMs:0,averageSpeed:0,pace:null,
      navigationHealth:0,gpsHealth:0,speedHealth:0,headingHealth:0,routeHealth:0,
      freshnessHealth:0,lastMode:'unknown',samples:0,rejectedSamples:0,fps:60,
      frameCount:0,frameWindowAt:performance.now(),diagnostics:null,card:null
    };
    app.navigationIntelligence=state;

    const formatDistance=meters=>meters>=1000?`${(meters/1000).toFixed(2)} km`:`${Math.round(meters)} m`;
    const formatPace=speed=>{
      if(speed<1)return null;
      const seconds=Math.round(3600/speed);
      const minutes=Math.floor(seconds/60);
      return `${minutes}:${String(seconds%60).padStart(2,'0')}/km`;
    };
    const healthLevel=score=>score>=82?'excellent':score>=65?'good':score>=42?'fair':'weak';

    const ensureStyles=()=>{
      if(document.getElementById('sf-navigation-intelligence-style'))return;
      const style=document.createElement('style');
      style.id='sf-navigation-intelligence-style';
      style.textContent=`
        .sf-nav-health{position:fixed;z-index:1174;right:12px;bottom:18px;min-width:124px;padding:9px 10px;border:1px solid #ffffff24;border-radius:15px;background:rgba(8,17,31,.9);color:#fff;box-shadow:0 8px 24px #0005;backdrop-filter:blur(14px);pointer-events:none;transition:.2s ease}
        .sf-nav-health strong,.sf-nav-health small{display:block}.sf-nav-health strong{font-size:12px}.sf-nav-health small{margin-top:3px;font-size:9px;color:#cbd5e1}.sf-nav-health i{display:block;height:3px;margin-top:7px;border-radius:999px;background:#ffffff1f;overflow:hidden}.sf-nav-health i::after{content:'';display:block;width:calc(var(--health)*1%);height:100%;border-radius:inherit;background:#3b82f6;transition:width .35s ease}.sf-nav-health.good i::after{background:#22c55e}.sf-nav-health.weak i::after{background:#ef4444}
        .navigation-active .sf-nav-health{bottom:96px}.drawing-mode .sf-nav-health,.sheet-expanded .sf-nav-health{opacity:0;transform:translateY(8px)}
        .sf-nav-diagnostics{position:fixed;z-index:2000;left:8px;right:8px;top:8px;max-height:45vh;overflow:auto;padding:10px;border-radius:14px;background:rgba(2,6,23,.94);color:#dbeafe;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;box-shadow:0 12px 40px #0008}
        @media(max-width:560px){.sf-nav-health{right:8px;bottom:max(10px,env(safe-area-inset-bottom));min-width:116px;padding:8px 9px}}
      `;
      document.head.appendChild(style);
    };

    const ensureCard=()=>{
      if(state.card?.isConnected)return state.card;
      ensureStyles();
      const card=document.createElement('div');
      card.className='sf-nav-health';
      card.setAttribute('role','status');
      card.setAttribute('aria-live','polite');
      card.innerHTML='<strong>Navigation Health</strong><small>изчакване на GPS</small><i></i>';
      document.body.appendChild(card);
      state.card=card;
      return card;
    };

    const routeScore=()=>{
      if(!s.navigationActive)return 100;
      if(!s.navigationRoute)return 18;
      const engine=s.arrowEngine;
      if(engine?.isSnappedToRoute)return 96;
      if(s.offRouteCount>=2)return 38;
      return 78;
    };

    const calculateHealth=()=>{
      const user=s.user;
      const engine=s.arrowEngine||{};
      const accuracy=Math.max(1,Number(user?.accuracy||999));
      const age=state.lastFixAt?Date.now()-state.lastFixAt:99999;
      state.gpsHealth=Math.round(clamp(100-(accuracy-4)*1.7,0,100));
      state.freshnessHealth=Math.round(clamp(100-age/45,0,100));
      state.speedHealth=Math.round(clamp(Number(engine.speedConfidence||0),0,100));
      state.headingHealth=Math.round(clamp(Number(engine.headingConfidence||0),0,100));
      state.routeHealth=routeScore();
      const moving=Number(engine.smoothedSpeed||0)>3;
      const headingWeight=moving?.22:.13;
      const speedWeight=moving?.22:.14;
      const totalWeight=.3+.17+headingWeight+speedWeight+.09;
      state.navigationHealth=Math.round(clamp((state.gpsHealth*.3+state.freshnessHealth*.17+state.headingHealth*headingWeight+state.speedHealth*speedWeight+state.routeHealth*.09)/totalWeight,0,100));
      return state.navigationHealth;
    };

    const updateSession=()=>{
      const now=Date.now();
      const dt=clamp(now-state.lastTickAt,0,2000);
      state.lastTickAt=now;
      const engine=s.arrowEngine||{};
      const speed=Math.max(0,Number(engine.smoothedSpeed||0));
      if(speed>1.2){
        state.movingMs+=dt;
        state.weightedSpeed+=speed*dt;
        state.weightedMs+=dt;
      }
      state.maxSpeed=Math.max(state.maxSpeed,speed);
      state.averageSpeed=state.weightedMs?state.weightedSpeed/state.weightedMs:0;
      state.pace=['walking','running'].includes(engine.movementMode)?formatPace(speed):null;
      state.lastMode=engine.movementMode||'unknown';
      state.lastSpeed=speed;
    };

    const render=()=>{
      updateSession();
      const score=calculateHealth();
      const card=ensureCard();
      const engine=s.arrowEngine||{};
      const level=healthLevel(score);
      card.classList.toggle('good',score>=65);
      card.classList.toggle('weak',score<42);
      card.style.setProperty('--health',String(score));
      card.querySelector('strong').textContent=`Navigation ${score}%`;
      const distance=Number(engine.sessionDistance||0);
      const pace=state.pace?` · ${state.pace}`:'';
      card.querySelector('small').textContent=`${engine.movementMode||'GPS'} · ${formatDistance(distance)}${pace}`;
      card.setAttribute('aria-label',`Navigation Health ${score} процента, GPS ${state.gpsHealth}, скорост ${state.speedHealth}, посока ${state.headingHealth}`);

      if(state.diagnostics?.isConnected){
        const age=state.lastFixAt?Date.now()-state.lastFixAt:0;
        state.diagnostics.textContent=[
          `Navigation Health: ${score}% (${level})`,
          `GPS: ${state.gpsHealth}% · ±${Math.round(s.user?.accuracy||0)}m · age ${age}ms`,
          `Heading: ${state.headingHealth}% · Speed: ${state.speedHealth}%`,
          `Route: ${state.routeHealth}% · snapped ${Boolean(engine.isSnappedToRoute)}`,
          `Mode: ${engine.movementMode||'unknown'} · confidence ${engine.movementConfidence||0}%`,
          `Speed: ${(engine.displaySpeed||0).toFixed(1)} km/h · avg ${state.averageSpeed.toFixed(1)} · max ${state.maxSpeed.toFixed(1)}`,
          `Distance: ${formatDistance(engine.sessionDistance||0)} · moving ${(state.movingMs/1000).toFixed(0)}s`,
          `Acceleration: ${(engine.acceleration||0).toFixed(2)} · ${engine.accelerationState||'stable'}`,
          `Prediction: ${engine.lastPredictionAt?`${Math.round(performance.now()-engine.lastPredictionAt)}ms ago`:'off'}`,
          `FPS: ${state.fps}`
        ].join('\n');
      }
    };

    const originalApply=app.applyUserPosition;
    app.applyUserPosition=(user,options={})=>{
      const accepted=originalApply(user,options);
      if(accepted){
        state.lastFixAt=Date.now();
        state.samples+=1;
        queueMicrotask(render);
      }else state.rejectedSamples+=1;
      return accepted;
    };

    const frame=now=>{
      state.frameCount+=1;
      if(now-state.frameWindowAt>=1000){
        state.fps=Math.round(state.frameCount*1000/(now-state.frameWindowAt));
        state.frameCount=0;state.frameWindowAt=now;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    if(params.get('debug')==='1'){
      ensureStyles();
      state.diagnostics=document.createElement('pre');
      state.diagnostics.className='sf-nav-diagnostics';
      document.body.appendChild(state.diagnostics);
    }

    app.navigationHealth=()=>({
      score:state.navigationHealth,level:healthLevel(state.navigationHealth),gps:state.gpsHealth,
      freshness:state.freshnessHealth,speed:state.speedHealth,heading:state.headingHealth,route:state.routeHealth
    });
    app.sessionMetrics=()=>({
      distance:Number(s.arrowEngine?.sessionDistance||0),movingMs:state.movingMs,
      averageSpeed:state.averageSpeed,maxSpeed:state.maxSpeed,pace:state.pace,mode:state.lastMode
    });
    setInterval(render,500);
    render();
  };

  async function load(){
    for(const src of modules){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(`Failed to load ${src}`));document.body.appendChild(script);
      });
    }
    installNavigationIntelligence();
  }
  load().catch(error=>{
    console.error(error);
    const status=document.getElementById('status');if(status){status.textContent='SmartCity V2 не можа да се стартира. Презареди страницата.';status.className='status-pill error'}
    const retry=document.getElementById('global-retry');if(retry){retry.hidden=false;retry.textContent='Презареди';retry.onclick=()=>location.reload()}
  });
})();