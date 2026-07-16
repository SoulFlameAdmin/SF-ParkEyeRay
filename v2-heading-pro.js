(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const EARTH_METERS_PER_DEGREE=111320;
  const MODE_ZOOM={stationary:18,walking:18,running:17,vehicle_slow:17,vehicle:16,vehicle_fast:15,unknown:18};
  const MODE_LABEL={stationary:'Стоене',walking:'Ходене',running:'Бягане',vehicle_slow:'Кола · бавно',vehicle:'С кола',vehicle_fast:'С кола · бързо',unknown:'Движение'};
  const MODE_CLASS=['stationary','walking','running','vehicle-slow','vehicle','vehicle-fast','unknown'];
  const engine=s.arrowEngine={
    movementMode:'unknown',movementConfidence:0,rawSpeed:0,smoothedSpeed:0,displaySpeed:0,targetDisplaySpeed:0,
    acceleration:0,accelerationState:'stable',speedConfidence:0,headingConfidence:0,isSnappedToRoute:false,
    sessionDistance:0,lastFix:null,lastAcceptedAt:0,lastSampleAt:0,candidateMode:'unknown',candidateCount:0,
    lastModeChangeAt:0,lastZoomAt:0,programmaticZoom:false,visualBase:null,predictionFrame:null,
    lastPredictionAt:0,speedSamples:[],snapAcceptCount:0,snapReleaseCount:0,lastSnap:null,lastUiFrameAt:0
  };
  let badge=null,lastCalibrationHintAt=0;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const rad=value=>value*Math.PI/180;
  const normalize=value=>((Number(value)||0)%360+360)%360;
  const angleDelta=(a,b)=>Math.abs(((normalize(b)-normalize(a)+540)%360)-180);
  const finite=value=>Number.isFinite(Number(value));
  const median=values=>{
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!sorted.length)return 0;
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  };

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
        .user-position-marker.mode-stationary .user-direction-cone{opacity:.48;transform:translateX(-50%) scaleX(1.24)}
        .user-position-marker.mode-walking .user-direction-cone{opacity:.66}.user-position-marker.mode-running .user-direction-cone{opacity:.8;transform:translateX(-50%) scaleY(1.12)}
        .user-position-marker.mode-vehicle-slow .user-direction-cone,.user-position-marker.mode-vehicle .user-direction-cone,.user-position-marker.mode-vehicle-fast .user-direction-cone{opacity:.92;transform:translateX(-50%) scaleX(.74) scaleY(1.2)}
        .user-position-marker.heading-low-confidence{filter:saturate(.25)}.user-position-marker.route-snapped{filter:drop-shadow(0 0 8px #22c55e99)}
        .speedometer{--sf-speed-progress:0;--sf-speed-confidence:.5;transition:transform .16s ease,opacity .2s ease,filter .2s ease}
        .speedometer::after{content:'';position:absolute;inset:-4px;border-radius:inherit;pointer-events:none;opacity:calc(.28 + var(--sf-speed-confidence)*.5);box-shadow:0 0 calc(8px + 14px*var(--sf-speed-progress)) rgba(59,130,246,.45)}
        .speedometer.accelerating{transform:scale(1.035)}.speedometer.braking{transform:scale(.975)}.speedometer.speed-weak{filter:saturate(.25)}
        @media(max-width:560px){.heading-confidence{left:8px;bottom:max(10px,env(safe-area-inset-bottom));padding:7px 9px}}
      `;
      document.head.appendChild(style);
    }
    return badge;
  };

  const sampleSpeed=(user,previous)=>{
    const reported=finite(user.speed)?Math.max(0,Number(user.speed)):0;
    if(!previous)return{reported,calculated:reported,fused:reported,trust:reported>0?.65:.35,elapsed:1,displacement:0};
    const elapsed=clamp((Number(user.timestamp||Date.now())-Number(previous.timestamp||Date.now()-1000))/1000,.25,8);
    const displacement=app.distance(previous,user);
    const calculated=clamp(displacement/elapsed*3.6,0,220);
    const accuracy=Math.max(1,Number(user.accuracy||999));
    const previousAccuracy=Math.max(1,Number(previous.accuracy||accuracy));
    const accuracyTrust=clamp(1-(Math.max(accuracy,previousAccuracy)-5)/55,0,1);
    const agreement=1-clamp(Math.abs(reported-calculated)/Math.max(8,reported,calculated),0,1);
    const movementFloor=Math.max(accuracy,previousAccuracy)*.42;
    const likelyNoise=displacement<movementFloor&&reported<4.5;
    let fused;
    if(likelyNoise)fused=0;
    else if(reported<=.4)fused=accuracyTrust>.55?calculated:0;
    else if(accuracy>45)fused=reported;
    else{
      const reportedWeight=clamp(.58+agreement*.24,0.58,.84);
      fused=reported*reportedWeight+calculated*(1-reportedWeight);
    }
    const trust=clamp(accuracyTrust*.62+agreement*.28+(reported>0?.1:0),0,1);
    return{reported,calculated,fused:clamp(fused,0,220),trust,elapsed,displacement};
  };

  const boundedSpeed=(sample,previousSpeed)=>{
    const mode=engine.movementMode;
    const upRate=mode.startsWith('vehicle')?38:mode==='running'?18:10;
    const downRate=mode.startsWith('vehicle')?50:mode==='running'?22:14;
    const maxUp=upRate*sample.elapsed;
    const maxDown=downRate*sample.elapsed;
    const delta=sample.fused-previousSpeed;
    if(delta>maxUp&&sample.trust<.82)return previousSpeed+maxUp;
    if(delta<-maxDown&&sample.trust<.82)return previousSpeed-maxDown;
    return sample.fused;
  };

  const classifyMode=speed=>{
    const current=engine.movementMode;
    if(current==='stationary'&&speed<2.2)return'stationary';
    if(current==='walking'&&speed>=1&&speed<8.4)return'walking';
    if(current==='running'&&speed>=5.8&&speed<18.5)return'running';
    if(current==='vehicle_slow'&&speed>=13&&speed<39)return'vehicle_slow';
    if(current==='vehicle'&&speed>=28&&speed<108)return'vehicle';
    if(current==='vehicle_fast'&&speed>=82)return'vehicle_fast';
    if(speed<1.5)return'stationary';
    if(speed<7.4)return'walking';
    if(speed<16.5)return'running';
    if(speed<35)return'vehicle_slow';
    if(speed<100)return'vehicle';
    return'vehicle_fast';
  };

  const updateMovement=(user,previous)=>{
    const sample=sampleSpeed(user,previous);
    const prior=engine.smoothedSpeed;
    const bounded=boundedSpeed(sample,prior);
    engine.speedSamples.push(bounded);
    if(engine.speedSamples.length>7)engine.speedSamples.shift();
    const robust=median(engine.speedSamples.slice(-5));
    const accuracy=Math.max(1,Number(user.accuracy||999));
    const alpha=bounded>=25?.52:bounded>=10?.4:bounded>=3?.28:.18;
    const target=robust*.56+bounded*.44;
    engine.rawSpeed=sample.fused;
    engine.smoothedSpeed=engine.lastAcceptedAt?prior+(target-prior)*alpha:target;
    if(sample.displacement<Math.max(4,accuracy*.35)&&sample.reported<3.2&&engine.smoothedSpeed<3.2)engine.smoothedSpeed=0;
    if(engine.smoothedSpeed<1.15&&sample.fused<2.4)engine.smoothedSpeed=0;

    const acceleration=(engine.smoothedSpeed-prior)/Math.max(.25,sample.elapsed);
    engine.acceleration=engine.lastAcceptedAt?engine.acceleration+(acceleration-engine.acceleration)*.35:0;
    engine.accelerationState=engine.acceleration>1.7?'accelerating':engine.acceleration<-2.1?'braking':'stable';
    engine.targetDisplaySpeed=clamp(engine.smoothedSpeed,0,220);
    engine.speedConfidence=Math.round(clamp((sample.trust*.68+(1-clamp(Math.abs(sample.reported-sample.calculated)/35,0,1))*.2+(accuracy<=15?.12:0))*100,0,100));

    const next=classifyMode(engine.smoothedSpeed);
    if(next===engine.movementMode){engine.candidateMode=next;engine.candidateCount=0}
    else if(next===engine.candidateMode)engine.candidateCount+=1;
    else{engine.candidateMode=next;engine.candidateCount=1}
    const required=next==='stationary'?3:next.startsWith('vehicle')?3:4;
    const dwell=next.startsWith('vehicle')?1000:1400;
    if(engine.candidateCount>=required&&Date.now()-engine.lastModeChangeAt>dwell){
      engine.movementMode=next;engine.lastModeChangeAt=Date.now();engine.candidateCount=0;
    }
    const sampleTrust=clamp(1-(accuracy-5)/55,0,1);
    engine.movementConfidence=Math.round(clamp((sampleTrust*.5+engine.speedConfidence/100*.28+(engine.movementMode===next?.22:.08))*100,0,100));

    if(previous){
      const plausibleDistance=Math.max(35,(engine.smoothedSpeed/3.6)*sample.elapsed*2.5+accuracy);
      if(sample.displacement<=plausibleDistance&&sample.displacement>1&&sample.trust>.35)engine.sessionDistance+=sample.displacement;
    }
    user.rawSpeed=Math.round(sample.fused);user.speed=Math.round(engine.smoothedSpeed);user.movementMode=engine.movementMode;
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
    return Math.round(clamp((gpsScore*.34+sourceScore*.43+engine.speedConfidence/100*.13+(movingGps?.06:0)+routeBonus)*100,0,100));
  };

  const updateVisualState=()=>{
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
    const shown=engine.movementMode==='walking'||engine.movementMode==='running'?engine.displaySpeed.toFixed(1):String(Math.round(engine.displaySpeed));
    if(value)value.textContent=shown;
    if(navValue)navValue.textContent=String(Math.round(engine.displaySpeed));
    if(speedometer){
      speedometer.classList.add('ready');
      speedometer.classList.toggle('accelerating',engine.accelerationState==='accelerating');
      speedometer.classList.toggle('braking',engine.accelerationState==='braking');
      speedometer.classList.toggle('speed-weak',engine.speedConfidence<45);
      speedometer.style.setProperty('--sf-speed-progress',String(clamp(engine.displaySpeed/130,0,1)));
      speedometer.style.setProperty('--sf-speed-confidence',String(clamp(engine.speedConfidence/100,0,1)));
      speedometer.setAttribute('aria-label',`${MODE_LABEL[engine.movementMode]}, ${shown} километра в час, надеждност ${engine.speedConfidence} процента, GPS точност плюс-минус ${Math.round(user.accuracy||0)} метра`);
      speedometer.title=`${MODE_LABEL[engine.movementMode]} · ${shown} km/h · ${engine.speedConfidence}% · GPS ±${Math.round(user.accuracy||0)} м`;
    }
  };

  const updateBadge=user=>{
    const node=ensureBadge();
    engine.headingConfidence=qualityScore(user);
    const score=engine.headingConfidence;
    node.classList.toggle('good',score>=72);node.classList.toggle('weak',score<42);
    node.querySelector('b').textContent=`${MODE_LABEL[engine.movementMode]} · ${score}%`;
    node.querySelector('small').textContent=score>=72?'посоката е стабилна':score>=42?'сензорите се изглаждат':'калибрирай телефона';
    node.setAttribute('aria-label',`${MODE_LABEL[engine.movementMode]}, надеждност на посоката ${score} процента`);
  };

  const snapVisualToRoute=user=>{
    if(!s.navigationActive||!s.navigationRoute||!s.userMarker){engine.isSnappedToRoute=false;engine.snapAcceptCount=0;engine.snapReleaseCount=0;return null}
    const accuracy=Number(user.accuracy||999),speed=engine.smoothedSpeed;
    const snap=accuracy<=40&&speed>=3?closestRoutePoint(user,s.navigationRoute):null;
    const heading=finite(user.heading)?Number(user.heading):null;
    const maxAngle=engine.movementMode==='walking'||engine.movementMode==='running'?72:55;
    const directionOk=!!snap&&(heading===null||angleDelta(heading,snap.bearing)<=maxAngle);
    const baseThreshold=engine.movementMode.startsWith('vehicle')?Math.max(12,Math.min(34,accuracy)) : Math.max(8,Math.min(20,accuracy*.65));
    const valid=!!snap&&snap.distance<=baseThreshold&&directionOk&&engine.headingConfidence>=42&&engine.speedConfidence>=40;
    if(valid){engine.snapAcceptCount+=1;engine.snapReleaseCount=0}
    else{engine.snapReleaseCount+=1;engine.snapAcceptCount=0}
    if(!engine.isSnappedToRoute&&engine.snapAcceptCount>=2)engine.isSnappedToRoute=true;
    if(engine.isSnappedToRoute&&engine.snapReleaseCount>=2)engine.isSnappedToRoute=false;
    if(engine.isSnappedToRoute&&snap){
      engine.lastSnap=snap;
      s.userMarker.setLatLng([snap.lat,snap.lon]);
      return snap;
    }
    engine.lastSnap=null;
    return null;
  };

  const desiredZoom=()=>MODE_ZOOM[engine.movementMode]??18;
  const maybeDynamicZoom=()=>{
    if(!s.map||!s.followUser||!engine.lastFix||Date.now()-engine.lastZoomAt<3000)return;
    if(Date.now()-engine.lastModeChangeAt<1800)return;
    const target=desiredZoom();
    if(Math.abs(s.map.getZoom()-target)<.5)return;
    engine.programmaticZoom=true;engine.lastZoomAt=Date.now();
    s.map.setZoom(target,{animate:true});
    setTimeout(()=>{engine.programmaticZoom=false},700);
  };

  const renderLoop=timestamp=>{
    engine.predictionFrame=requestAnimationFrame(renderLoop);
    if(document.hidden)return;
    const dt=engine.lastUiFrameAt?clamp((timestamp-engine.lastUiFrameAt)/1000,.001,.05):.016;
    engine.lastUiFrameAt=timestamp;
    const staleAge=Math.max(0,Date.now()-engine.lastAcceptedAt);
    const visualTarget=staleAge>1800?0:engine.targetDisplaySpeed;
    const response=engine.movementMode.startsWith('vehicle')?7.5:engine.movementMode==='running'?6:4.5;
    engine.displaySpeed+=(visualTarget-engine.displaySpeed)*clamp(response*dt,0,1);
    if(Math.abs(engine.displaySpeed-visualTarget)<.03)engine.displaySpeed=visualTarget;
    if(s.user)updateSpeedometer(s.user);

    if(!s.userMarker||!engine.visualBase||engine.isSnappedToRoute)return;
    if(!['running','vehicle_slow','vehicle','vehicle_fast'].includes(engine.movementMode))return;
    if(staleAge>1400||engine.headingConfidence<48||engine.speedConfidence<45||engine.smoothedSpeed<5)return;
    const heading=finite(engine.visualBase.heading)?Number(engine.visualBase.heading):null;
    if(heading===null)return;
    const horizon=Math.min(1.1,staleAge/1000);
    const distance=engine.smoothedSpeed/3.6*horizon*(engine.movementMode.startsWith('vehicle')?.68:.58);
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
    engine.visualBase={...engine.lastFix};engine.lastAcceptedAt=Date.now();engine.lastSampleAt=Number(user.timestamp||Date.now());
    updateBadge(user);
    snapVisualToRoute(user);
    updateVisualState();
    maybeDynamicZoom();
    return true;
  };

  const originalInitMap=app.initMap;
  app.initMap=()=>{
    const ready=originalInitMap();
    if(!ready||!s.map)return ready;
    s.map.on('zoomstart',()=>{if(engine.programmaticZoom)s.followUser=true});
    s.map.on('zoomend',()=>{if(engine.programmaticZoom)s.followUser=true});
    if(!engine.predictionFrame)engine.predictionFrame=requestAnimationFrame(renderLoop);
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
  app.movementState=()=>({...engine,speedSamples:[...engine.speedSamples],label:MODE_LABEL[engine.movementMode]});
  document.addEventListener('visibilitychange',()=>{
    engine.lastUiFrameAt=0;
    if(!document.hidden){engine.lastPredictionAt=0;engine.snapAcceptCount=0;engine.snapReleaseCount=0;setTimeout(()=>s.user&&updateBadge(s.user),250)}
  });
})();
