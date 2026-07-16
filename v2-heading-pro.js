(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const EARTH_METERS_PER_DEGREE=111320;
  const MODE_ZOOM={stationary:18,walking:18,running:17,vehicle_slow:17,vehicle:16,vehicle_fast:15,unknown:18};
  const MODE_LABEL={stationary:'Стоене',walking:'Ходене',running:'Бягане',vehicle_slow:'Кола · бавно',vehicle:'С кола',vehicle_fast:'С кола · бързо',unknown:'Движение'};
  const MODE_CLASS=['stationary','walking','running','vehicle-slow','vehicle','vehicle-fast','unknown'];
  const engine=s.arrowEngine={
    movementMode:'unknown',movementConfidence:0,rawSpeed:0,smoothedSpeed:0,displaySpeed:0,
    headingConfidence:0,isSnappedToRoute:false,sessionDistance:0,lastFix:null,lastAcceptedAt:0,
    candidateMode:'unknown',candidateCount:0,lastModeChangeAt:0,lastZoomAt:0,programmaticZoom:false,
    visualBase:null,predictionFrame:null,lastPredictionAt:0
  };
  let badge=null,lastCalibrationHintAt=0;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const rad=value=>value*Math.PI/180;
  const normalize=value=>((Number(value)||0)%360+360)%360;
  const angleDelta=(a,b)=>Math.abs(((normalize(b)-normalize(a)+540)%360)-180);
  const finite=value=>Number.isFinite(Number(value));

  const toLocal=(point,origin)=>({
    x:(point.lon-origin.lon)*EARTH_METERS_PER_DEGREE*Math.cos(rad(origin.lat)),
    y:(point.lat-origin.lat)*EARTH_METERS_PER_DEGREE
  });

  const pointFromMeters=(origin,bearing,distance)=>{
    const north=Math.cos(rad(bearing))*distance;
    const east=Math.sin(rad(bearing))*distance;
    return{
      lat:origin.lat+north/EARTH_METERS_PER_DEGREE,
      lon:origin.lon+east/(EARTH_METERS_PER_DEGREE*Math.max(.2,Math.cos(rad(origin.lat))))
    };
  };

  const closestRoutePoint=(user,route)=>{
    if(!route?.points||route.points.length<2)return null;
    let best=null;
    for(let i=0;i<route.points.length-1;i++){
      const a=route.points[i],b=route.points[i+1],origin=a;
      const av=toLocal(a,origin),bv=toLocal(b,origin),pv=toLocal(user,origin);
      const dx=bv.x-av.x,dy=bv.y-av.y,len2=dx*dx+dy*dy;
      const t=len2?clamp(((pv.x-av.x)*dx+(pv.y-av.y)*dy)/len2,0,1):0;
      const qx=av.x+t*dx,qy=av.y+t*dy;
      const distance=Math.hypot(pv.x-qx,pv.y-qy);
      if(!best||distance<best.distance){
        const lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;
        const bearing=normalize(Math.atan2(Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)),Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon)))*180/Math.PI);
        best={lat,lon,distance,bearing,index:i};
      }
    }
    return best;
  };

  const ensureBadge=()=>{
    if(badge?.isConnected)return badge;
    badge=document.createElement('div');
    badge.id='heading-confidence';
    badge.className='heading-confidence';
    badge.setAttribute('role','status');
    badge.setAttribute('aria-live','polite');
    badge.innerHTML='<span></span><div><b>Посока</b><small>изчакване</small></div>';
    document.body.appendChild(badge);
    if(!document.getElementById('heading-confidence-style')){
      const style=document.createElement('style');
      style.id='heading-confidence-style';
      style.textContent=`
        .heading-confidence{position:fixed;z-index:1175;left:14px;bottom:18px;display:grid;grid-template-columns:8px auto;align-items:center;gap:7px;padding:8px 10px;border:1px solid #ffffff24;border-radius:14px;background:rgba(8,17,31,.88);color:#fff;box-shadow:0 8px 24px #0005;backdrop-filter:blur(14px);pointer-events:none;transition:opacity .2s ease,transform .2s ease}
        .heading-confidence>span{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 4px #f59e0b22}.heading-confidence b,.heading-confidence small{display:block;line-height:1.1}.heading-confidence b{font-size:11px}.heading-confidence small{margin-top:2px;color:#cbd5e1;font-size:9px}
        .heading-confidence.good>span{background:#22c55e;box-shadow:0 0 0 4px #22c55e22}.heading-confidence.weak>span{background:#ef4444;box-shadow:0 0 0 4px #ef444422}
        .navigation-active .heading-confidence{bottom:96px}.drawing-mode .heading-confidence,.sheet-expanded .heading-confidence{opacity:0;transform:translateY(8px)}
        .user-position-marker.mode-stationary .user-direction-cone{opacity:.52;transform:translateX(-50%) scaleX(1.18)}
        .user-position-marker.mode-walking .user-direction-cone{opacity:.66}.user-position-marker.mode-running .user-direction-cone{opacity:.78;transform:translateX(-50%) scaleY(1.12)}
        .user-position-marker.mode-vehicle-slow .user-direction-cone,.user-position-marker.mode-vehicle .user-direction-cone,.user-position-marker.mode-vehicle-fast .user-direction-cone{opacity:.9;transform:translateX(-50%) scaleX(.78) scaleY(1.18)}
        .user-position-marker.heading-low-confidence{filter:saturate(.25)}.user-position-marker.route-snapped{filter:drop-shadow(0 0 8px #22c55e99)}
        @media(max-width:560px){.heading-confidence{left:8px;bottom:max(10px,env(safe-area-inset-bottom));padding:7px 9px}}
      `;
      document.head.appendChild(style);
    }
    return badge;
  };

  const deriveRawSpeed=(user,previous)=>{
    const reported=Math.max(0,Number(user.speed||0));
    if(!previous)return reported;
    const elapsed=Math.max(.25,(Number(user.timestamp||Date.now())-Number(previous.timestamp||Date.now()-1000))/1000);
    const displacement=app.distance(previous,user);
    const calculated=clamp(displacement/elapsed*3.6,0,220);
    if(Number(user.accuracy||999)>35)return reported;
    if(reported<=.4)return calculated<3?0:calculated;
    return reported*.72+calculated*.28;
  };

  const classifyMode=speed=>{
    if(speed<1.4)return'stationary';
    if(speed<7.2)return'walking';
    if(speed<16)return'running';
    if(speed<35)return'vehicle_slow';
    if(speed<100)return'vehicle';
    return'vehicle_fast';
  };

  const updateMovement=(user,previous)=>{
    const raw=deriveRawSpeed(user,previous);
    const accuracy=Math.max(1,Number(user.accuracy||999));
    const alpha=raw>=16?.48:raw>=7?.34:.22;
    engine.rawSpeed=raw;
    engine.smoothedSpeed=engine.lastAcceptedAt?engine.smoothedSpeed+(raw-engine.smoothedSpeed)*alpha:raw;
    if(engine.smoothedSpeed<1.1&&raw<2.2)engine.smoothedSpeed=0;
    engine.displaySpeed=Math.round(clamp(engine.smoothedSpeed,0,220));

    const next=classifyMode(engine.smoothedSpeed);
    if(next===engine.movementMode){engine.candidateMode=next;engine.candidateCount=0}
    else if(next===engine.candidateMode)engine.candidateCount+=1;
    else{engine.candidateMode=next;engine.candidateCount=1}

    const required=next==='stationary'?3:next.startsWith('vehicle')?3:4;
    if(engine.candidateCount>=required&&Date.now()-engine.lastModeChangeAt>1200){
      engine.movementMode=next;engine.lastModeChangeAt=Date.now();engine.candidateCount=0;
    }
    const sampleTrust=clamp(1-(accuracy-5)/55,0,1);
    engine.movementConfidence=Math.round(clamp((sampleTrust*.55+Math.min(1,required?engine.candidateCount/required:1)*.15+(engine.movementMode===next?.3:.12))*100,0,100));

    if(previous){
      const distance=app.distance(previous,user);
      if(distance<Math.max(80,accuracy*2.5)&&distance>1)engine.sessionDistance+=distance;
    }
    user.rawSpeed=Math.round(raw);user.speed=engine.displaySpeed;user.movementMode=engine.movementMode;
  };

  const qualityScore=user=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    if(!user||!marker)return 0;
    const accuracy=Math.max(1,Number(user.accuracy||999));
    const gpsScore=clamp(1-(accuracy-4)/46,0,1);
    const hasHeading=marker.classList.contains('heading-live');
    const compassWeak=marker.classList.contains('compass-weak');
    const gpsWeak=marker.classList.contains('gps-weak');
    const sourceScore=!hasHeading?.12:compassWeak?.46:gpsWeak?.62:.94;
    const movingGps=engine.smoothedSpeed>=7&&finite(user.heading);
    const routeBonus=s.navigationActive&&engine.isSnappedToRoute?.07:0;
    return Math.round(clamp((gpsScore*.38+sourceScore*.48+(movingGps?.1:0)+routeBonus)*100,0,100));
  };

  const updateVisualState=user=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    if(!marker)return;
    MODE_CLASS.forEach(name=>marker.classList.remove(`mode-${name}`));
    marker.classList.add(`mode-${engine.movementMode.replace('_','-')}`);
    marker.classList.toggle('heading-low-confidence',engine.headingConfidence<42);
    marker.classList.toggle('route-snapped',engine.isSnappedToRoute);
  };

  const updateSpeedometer=user=>{
    const value=app.$?.('speedometer-value')||document.getElementById('speedometer-value');
    const navValue=app.$?.('nav-speed-value')||document.getElementById('nav-speed-value');
    const speedometer=app.$?.('speedometer')||document.getElementById('speedometer');
    if(value)value.textContent=String(engine.displaySpeed);
    if(navValue)navValue.textContent=String(engine.displaySpeed);
    if(speedometer){
      speedometer.classList.add('ready');
      speedometer.setAttribute('aria-label',`${MODE_LABEL[engine.movementMode]}, ${engine.displaySpeed} километра в час, GPS точност плюс-минус ${Math.round(user.accuracy||0)} метра`);
      speedometer.title=`${MODE_LABEL[engine.movementMode]} · ${engine.displaySpeed} km/h · GPS ±${Math.round(user.accuracy||0)} м`;
    }
  };

  const updateBadge=user=>{
    const node=ensureBadge();
    engine.headingConfidence=qualityScore(user);
    const score=engine.headingConfidence;
    node.classList.toggle('good',score>=72);node.classList.toggle('weak',score<42);
    node.querySelector('b').textContent=`${MODE_LABEL[engine.movementMode]} · ${score}%`;
    node.querySelector('small').textContent=score>=72?'посоката е стабилна':score>=42?'изглаждам сигналите':'калибрирай телефона';
    node.setAttribute('aria-label',`${MODE_LABEL[engine.movementMode]}, надеждност на посоката ${score} процента`);
  };

  const snapVisualToRoute=user=>{
    engine.isSnappedToRoute=false;
    if(!s.navigationActive||!s.navigationRoute||!s.userMarker)return null;
    const accuracy=Number(user.accuracy||999),speed=engine.smoothedSpeed;
    if(accuracy>35||speed<3.5)return null;
    const snap=closestRoutePoint(user,s.navigationRoute);
    if(!snap)return null;
    const heading=finite(user.heading)?Number(user.heading):null;
    const maxAngle=engine.movementMode==='walking'||engine.movementMode==='running'?72:58;
    const directionOk=heading===null||angleDelta(heading,snap.bearing)<=maxAngle;
    const baseThreshold=engine.movementMode.startsWith('vehicle')?Math.max(12,Math.min(34,accuracy)) : Math.max(8,Math.min(20,accuracy*.65));
    if(snap.distance>baseThreshold||!directionOk||engine.headingConfidence<42)return null;
    engine.isSnappedToRoute=true;
    s.userMarker.setLatLng([snap.lat,snap.lon]);
    return snap;
  };

  const desiredZoom=()=>MODE_ZOOM[engine.movementMode]??18;
  const maybeDynamicZoom=()=>{
    if(!s.map||!s.followUser||!engine.lastFix||Date.now()-engine.lastZoomAt<2500)return;
    const target=desiredZoom();
    if(Math.abs(s.map.getZoom()-target)<.5)return;
    engine.programmaticZoom=true;engine.lastZoomAt=Date.now();
    s.map.setZoom(target,{animate:true});
    setTimeout(()=>{engine.programmaticZoom=false},650);
  };

  const predictionLoop=timestamp=>{
    engine.predictionFrame=requestAnimationFrame(predictionLoop);
    if(document.hidden||!s.userMarker||!engine.visualBase||engine.isSnappedToRoute)return;
    if(!['running','vehicle_slow','vehicle','vehicle_fast'].includes(engine.movementMode))return;
    const age=Math.max(0,Date.now()-engine.lastAcceptedAt);
    if(age>1200||engine.headingConfidence<48||engine.smoothedSpeed<5)return;
    const heading=finite(engine.visualBase.heading)?Number(engine.visualBase.heading):null;
    if(heading===null)return;
    const distance=engine.smoothedSpeed/3.6*Math.min(1.2,age/1000)*.72;
    if(distance<.25)return;
    const predicted=pointFromMeters(engine.visualBase,heading,distance);
    s.userMarker.setLatLng([predicted.lat,predicted.lon]);
    engine.lastPredictionAt=timestamp;
  };

  const originalApply=app.applyUserPosition;
  app.applyUserPosition=(user,options={})=>{
    const previous=engine.lastFix?{...engine.lastFix}:null;
    updateMovement(user,previous);
    const accepted=originalApply(user,options);
    if(!accepted)return false;
    engine.lastFix={lat:user.lat,lon:user.lon,accuracy:user.accuracy,speed:user.speed,heading:user.heading,timestamp:user.timestamp||Date.now()};
    engine.visualBase={...engine.lastFix};engine.lastAcceptedAt=Date.now();
    updateSpeedometer(user);
    updateBadge(user);
    snapVisualToRoute(user);
    updateVisualState(user);
    maybeDynamicZoom();
    return true;
  };

  const originalInitMap=app.initMap;
  app.initMap=()=>{
    const ready=originalInitMap();
    if(!ready||!s.map)return ready;
    s.map.on('zoomstart',()=>{if(engine.programmaticZoom)s.followUser=true});
    s.map.on('zoomend',()=>{if(engine.programmaticZoom)s.followUser=true});
    if(!engine.predictionFrame)engine.predictionFrame=requestAnimationFrame(predictionLoop);
    return ready;
  };

  const originalLocate=app.locate;
  app.locate=async(...args)=>{
    const result=await originalLocate(...args);
    engine.programmaticZoom=true;
    setTimeout(()=>{engine.programmaticZoom=false},700);
    if(engine.headingConfidence<42&&Date.now()-lastCalibrationHintAt>12000){
      lastCalibrationHintAt=Date.now();
      app.setStatus('Калибриране: дръж телефона далеч от метал и направи бавно движение като цифрата 8.','info',true);
    }
    return result;
  };

  app.headingQuality=()=>({score:engine.headingConfidence,level:engine.headingConfidence>=72?'good':engine.headingConfidence>=42?'fair':'weak'});
  app.movementState=()=>({...engine,label:MODE_LABEL[engine.movementMode]});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){engine.lastPredictionAt=0;setTimeout(()=>s.user&&updateBadge(s.user),250)}});
})();