(()=>{
  'use strict';

  const VERSION='4.0.0';
  const CALIBRATION_KEY='sf_v2_heading_calibration_v4';
  const LEGACY_KEYS=['sf_v2_heading_calibration_v2','sf_v2_heading_calibration_v3'];
  const normalize=value=>((Number(value)||0)%360+360)%360;
  const shortestDelta=(from,to)=>((normalize(to)-normalize(from)+540)%360)-180;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const lerpAngle=(from,to,weight)=>normalize(normalize(from)+shortestDelta(from,to)*clamp(weight,0,1));
  const rad=value=>Number(value)*Math.PI/180;

  const controller={
    version:VERSION,
    compassRaw:null,
    compassHeading:null,
    compassAccuracy:null,
    compassConfidence:0,
    compassAt:0,
    gpsReported:null,
    movementCourse:null,
    movementConfidence:0,
    movementAt:0,
    absoluteHeading:null,
    relativeHeading:null,
    visualHeading:0,
    targetHeading:0,
    source:'waiting',
    confidence:0,
    mapBearing:0,
    calibrationOffset:0,
    calibrationSamples:[],
    lastFix:null,
    lastFrameAt:0,
    initialized:false,
    debugNode:null
  };

  const readCalibration=()=>{
    try{
      LEGACY_KEYS.forEach(key=>localStorage.removeItem(key));
      const stored=JSON.parse(localStorage.getItem(CALIBRATION_KEY)||'null');
      if(stored&&finite(stored.offset)&&Math.abs(Number(stored.offset))<=180)return Number(stored.offset);
    }catch{}
    return 0;
  };
  controller.calibrationOffset=readCalibration();

  const persistCalibration=()=>{
    try{localStorage.setItem(CALIBRATION_KEY,JSON.stringify({offset:controller.calibrationOffset,updatedAt:Date.now(),version:VERSION}))}catch{}
  };

  const screenAngle=()=>normalize(Number(screen.orientation?.angle??window.orientation??0));

  const orientationBearing=(alpha,beta,gamma)=>{
    if(!finite(alpha))return null;
    if(!finite(beta)||!finite(gamma))return normalize(360-Number(alpha)+screenAngle());
    const x=rad(beta),y=rad(gamma),z=rad(alpha);
    const cX=Math.cos(x),cY=Math.cos(y),cZ=Math.cos(z);
    const sX=Math.sin(x),sY=Math.sin(y),sZ=Math.sin(z);
    const vX=-cZ*sY-sZ*sX*cY;
    const vY=-sZ*sY+cZ*sX*cY;
    let heading=Math.atan2(vX,vY)*180/Math.PI;
    if(heading<0)heading+=360;
    return normalize(heading+screenAngle());
  };

  const onOrientation=event=>{
    let raw=null;
    if(finite(event.webkitCompassHeading))raw=normalize(Number(event.webkitCompassHeading)+screenAngle());
    else raw=orientationBearing(event.alpha,event.beta,event.gamma);
    if(!finite(raw))return;

    const accuracy=finite(event.webkitCompassAccuracy)?Math.max(0,Number(event.webkitCompassAccuracy)):null;
    const isAbsolute=event.type==='deviceorientationabsolute'||event.absolute===true||finite(event.webkitCompassHeading);
    const confidence=accuracy!==null?clamp(1-accuracy/90,.12,1):(isAbsolute?.72:.34);
    const corrected=normalize(Number(raw)+controller.calibrationOffset);

    if(finite(controller.compassHeading)){
      const change=Math.abs(shortestDelta(controller.compassHeading,corrected));
      const weight=change>55?confidence*.12:confidence>.7?.28:confidence>.45?.18:.1;
      controller.compassHeading=lerpAngle(controller.compassHeading,corrected,weight);
    }else controller.compassHeading=corrected;

    controller.compassRaw=normalize(raw);
    controller.compassAccuracy=accuracy;
    controller.compassConfidence=confidence;
    controller.compassAt=performance.now();
  };

  let orientationListening=false;
  let orientationPermission='unknown';

  const startOrientationListening=()=>{
    if(orientationListening||!('DeviceOrientationEvent'in window))return false;
    window.addEventListener('deviceorientationabsolute',onOrientation,true);
    window.addEventListener('deviceorientation',onOrientation,true);
    orientationListening=true;
    orientationPermission='granted';
    return true;
  };

  const requestHeadingPermission=async()=>{
    if(!('DeviceOrientationEvent'in window))return false;
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      try{
        const result=await DeviceOrientationEvent.requestPermission();
        orientationPermission=result;
        if(result==='granted')return startOrientationListening();
        return false;
      }catch{
        orientationPermission='unknown';
        return false;
      }
    }
    return startOrientationListening();
  };

  window.SFRequestHeadingPermission=requestHeadingPermission;
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission!=='function')startOrientationListening();

  const distanceMeters=(a,b)=>{
    const latitude1=rad(a.lat),latitude2=rad(b.lat);
    const deltaLatitude=rad(b.lat-a.lat),deltaLongitude=rad(b.lon-a.lon);
    const value=Math.sin(deltaLatitude/2)**2+Math.cos(latitude1)*Math.cos(latitude2)*Math.sin(deltaLongitude/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(value),Math.sqrt(Math.max(0,1-value)));
  };

  const bearingBetween=(a,b)=>{
    const latitude1=rad(a.lat),latitude2=rad(b.lat),deltaLongitude=rad(b.lon-a.lon);
    const y=Math.sin(deltaLongitude)*Math.cos(latitude2);
    const x=Math.cos(latitude1)*Math.sin(latitude2)-Math.sin(latitude1)*Math.cos(latitude2)*Math.cos(deltaLongitude);
    return normalize(Math.atan2(y,x)*180/Math.PI);
  };

  const updateMovementCourse=user=>{
    const timestamp=Number(user.timestamp||Date.now());
    if(controller.lastFix&&timestamp!==controller.lastFix.timestamp){
      const elapsed=clamp((timestamp-controller.lastFix.timestamp)/1000,.1,12);
      const displacement=distanceMeters(controller.lastFix,user);
      const accuracy=Math.max(1,Number(user.accuracy||999));
      const previousAccuracy=Math.max(1,Number(controller.lastFix.accuracy||accuracy));
      const noiseFloor=Math.max(2.5,Math.min(14,Math.max(accuracy,previousAccuracy)*.42));
      if(displacement>=noiseFloor&&elapsed<=8){
        const next=bearingBetween(controller.lastFix,user);
        const distanceTrust=clamp((displacement-noiseFloor)/Math.max(8,noiseFloor*2),0,1);
        const accuracyTrust=clamp(1-(Math.max(accuracy,previousAccuracy)-5)/45,0,1);
        const confidence=clamp(distanceTrust*.62+accuracyTrust*.38,.15,1);
        controller.movementCourse=finite(controller.movementCourse)?lerpAngle(controller.movementCourse,next,.34+confidence*.34):next;
        controller.movementConfidence=confidence;
        controller.movementAt=performance.now();
      }
    }
    controller.lastFix={lat:Number(user.lat),lon:Number(user.lon),accuracy:Number(user.accuracy||999),timestamp};
    controller.gpsReported=finite(user.heading)?normalize(Number(user.heading)):null;
  };

  const robustCalibrationTarget=values=>{
    if(values.length<6)return null;
    const anchor=values[0];
    const unwrapped=values.map(value=>anchor+shortestDelta(anchor,value)).sort((a,b)=>a-b);
    const median=unwrapped[Math.floor(unwrapped.length/2)];
    const deviations=unwrapped.map(value=>Math.abs(value-median)).sort((a,b)=>a-b);
    const mad=deviations[Math.floor(deviations.length/2)];
    return mad<=12?clamp(median,-180,180):null;
  };

  const learnCalibration=(speed,accuracy)=>{
    const movementFresh=finite(controller.movementCourse)&&performance.now()-controller.movementAt<2600;
    const compassFresh=finite(controller.compassRaw)&&performance.now()-controller.compassAt<1800;
    if(!movementFresh||!compassFresh||speed<10||accuracy>25||controller.movementConfidence<.5)return;
    const needed=shortestDelta(controller.compassRaw,controller.movementCourse);
    controller.calibrationSamples.push(needed);
    if(controller.calibrationSamples.length>18)controller.calibrationSamples.shift();
    const target=robustCalibrationTarget(controller.calibrationSamples);
    if(!finite(target))return;
    controller.calibrationOffset=clamp(controller.calibrationOffset+shortestDelta(controller.calibrationOffset,target)*.08,-180,180);
    controller.compassHeading=normalize(controller.compassRaw+controller.calibrationOffset);
    persistCalibration();
  };

  const readMapBearing=state=>{
    try{
      if(typeof state?.map?.getBearing==='function'&&finite(state.map.getBearing()))return normalize(state.map.getBearing());
    }catch{}
    if(finite(state?.mapBearing))return normalize(state.mapBearing);
    if(finite(state?.navigationMapBearing))return normalize(state.navigationMapBearing);
    return 0;
  };

  const routeBearing=state=>{
    const bearing=state?.arrowEngine?.lastSnap?.bearing;
    return state?.navigationActive&&state?.arrowEngine?.isSnappedToRoute&&finite(bearing)?normalize(bearing):null;
  };

  const selectHeading=(state,user)=>{
    const now=performance.now();
    const speed=Math.max(0,Number(state?.arrowEngine?.smoothedSpeed??user?.speed??0));
    const accuracy=Math.max(1,Number(user?.accuracy||999));
    const compassFresh=finite(controller.compassHeading)&&now-controller.compassAt<1900;
    const movementFresh=finite(controller.movementCourse)&&now-controller.movementAt<2800;
    const gps=finite(controller.gpsReported)?controller.gpsReported:null;
    const route=routeBearing(state);

    learnCalibration(speed,accuracy);

    if(route!==null&&speed>=3){
      const support=movementFresh?controller.movementCourse:gps;
      return {heading:support===null?route:lerpAngle(support,route,.78),source:'route',confidence:clamp(.72+controller.movementConfidence*.22,0,1)};
    }
    if(speed>=7&&movementFresh){
      const heading=gps===null?controller.movementCourse:lerpAngle(controller.movementCourse,gps,.28);
      return {heading,source:'movement',confidence:clamp(.58+controller.movementConfidence*.38,0,1)};
    }
    if(speed>=5&&gps!==null){
      const heading=compassFresh?lerpAngle(controller.compassHeading,gps,.68):gps;
      return {heading,source:'gps',confidence:compassFresh?clamp(.58+controller.compassConfidence*.2,0,1):.64};
    }
    if(speed>=2&&movementFresh&&compassFresh){
      const movementWeight=clamp((speed-2)/5,.25,.7);
      return {heading:lerpAngle(controller.compassHeading,controller.movementCourse,movementWeight),source:'fused',confidence:clamp(controller.compassConfidence*.42+controller.movementConfidence*.48,0,1)};
    }
    if(compassFresh)return {heading:controller.compassHeading,source:'compass',confidence:controller.compassConfidence};
    if(movementFresh)return {heading:controller.movementCourse,source:'movement',confidence:controller.movementConfidence*.72};
    if(gps!==null)return {heading:gps,source:'gps-stale',confidence:.35};
    return null;
  };

  const ensureDebug=()=>{
    if(!new URLSearchParams(location.search).has('headingDebug'))return null;
    if(controller.debugNode?.isConnected)return controller.debugNode;
    const node=document.createElement('pre');
    node.id='sf-heading-debug';
    node.style.cssText='position:fixed;z-index:2500;left:8px;top:8px;max-width:calc(100vw - 16px);padding:9px 10px;border:1px solid #ffffff2b;border-radius:12px;background:#020617e8;color:#dbeafe;font:10px/1.45 ui-monospace,monospace;pointer-events:none;white-space:pre-wrap';
    document.body.appendChild(node);
    controller.debugNode=node;
    return node;
  };

  const renderDebug=()=>{
    const node=ensureDebug();
    if(!node)return;
    node.textContent=[
      `Heading Engine ${VERSION}`,
      `source ${controller.source} · confidence ${Math.round(controller.confidence*100)}%`,
      `absolute ${finite(controller.absoluteHeading)?controller.absoluteHeading.toFixed(1):'—'}° · relative ${finite(controller.relativeHeading)?controller.relativeHeading.toFixed(1):'—'}°`,
      `map ${controller.mapBearing.toFixed(1)}° · visual ${controller.visualHeading.toFixed(1)}°`,
      `compass ${finite(controller.compassHeading)?controller.compassHeading.toFixed(1):'—'}° · raw ${finite(controller.compassRaw)?controller.compassRaw.toFixed(1):'—'}°`,
      `movement ${finite(controller.movementCourse)?controller.movementCourse.toFixed(1):'—'}° · gps ${finite(controller.gpsReported)?controller.gpsReported.toFixed(1):'—'}°`,
      `calibration ${controller.calibrationOffset.toFixed(1)}° · screen ${screenAngle().toFixed(0)}°`
    ].join('\n');
  };

  const applyVisuals=(state,elapsed)=>{
    const marker=state?.userMarker?.getElement?.()?.querySelector('.user-position-marker');
    if(!marker||!finite(controller.targetHeading))return;
    if(!controller.initialized){
      controller.visualHeading=controller.targetHeading;
      controller.initialized=true;
    }
    const difference=shortestDelta(controller.visualHeading,controller.targetHeading);
    const speed=Math.max(0,Number(state?.arrowEngine?.smoothedSpeed??state?.user?.speed??0));
    const maxRate=speed>=5?300:165;
    const response=speed>=5?8.5:5.2;
    const step=clamp(difference*clamp(response*elapsed,0,1),-maxRate*elapsed,maxRate*elapsed);
    controller.visualHeading=normalize(controller.visualHeading+step);

    marker.style.setProperty('--sf-correct-heading',`${controller.visualHeading.toFixed(2)}deg`);
    marker.dataset.headingSource=controller.source;
    marker.classList.toggle('sf-heading-weak',controller.confidence<.42);

    const hud=document.getElementById('nav-heading-arrow');
    if(hud){
      hud.style.transform=`rotate(${(controller.visualHeading-90).toFixed(2)}deg)`;
      hud.dataset.headingSource=controller.source;
    }
  };

  const frame=timestamp=>{
    const app=window.SFV2;
    const state=app?.state;
    const user=state?.user;
    const elapsed=controller.lastFrameAt?clamp((timestamp-controller.lastFrameAt)/1000,.001,.05):.016;
    controller.lastFrameAt=timestamp;

    if(user&&finite(user.lat)&&finite(user.lon)){
      if(!controller.lastFix||Number(user.timestamp||0)!==controller.lastFix.timestamp)updateMovementCourse(user);
      const selected=selectHeading(state,user);
      if(selected&&finite(selected.heading)){
        controller.mapBearing=readMapBearing(state);
        controller.absoluteHeading=normalize(selected.heading);
        controller.relativeHeading=normalize(controller.absoluteHeading-controller.mapBearing);
        controller.targetHeading=controller.relativeHeading;
        controller.source=selected.source;
        controller.confidence=clamp(selected.confidence,0,1);
        applyVisuals(state,elapsed);
      }
    }

    renderDebug();
    requestAnimationFrame(frame);
  };

  const selfTest=()=>{
    const checks={
      northRelative:normalize(0-0)===0,
      eastOnNorthMap:normalize(90-0)===90,
      northOnEastMap:normalize(0-90)===270,
      wrapPositive:shortestDelta(350,10)===20,
      wrapNegative:shortestDelta(10,350)===-20,
      nullIsNotHeading:!finite(null)
    };
    return {ok:Object.values(checks).every(Boolean),checks,version:VERSION};
  };

  const expose=()=>{
    const app=window.SFV2;
    if(!app)return false;
    app.headingController=controller;
    app.requestHeadingPermission=requestHeadingPermission;
    app.headingDiagnostics=()=>({
      version:VERSION,source:controller.source,confidence:Math.round(controller.confidence*100),
      absolute:controller.absoluteHeading,relative:controller.relativeHeading,mapBearing:controller.mapBearing,
      compass:controller.compassHeading,movement:controller.movementCourse,gps:controller.gpsReported,
      calibrationOffset:controller.calibrationOffset,screenAngle:screenAngle(),
      orientationListening,orientationPermission
    });
    app.resetHeadingCalibration=()=>{
      try{localStorage.removeItem(CALIBRATION_KEY)}catch{}
      controller.calibrationOffset=0;
      controller.calibrationSamples=[];
      controller.compassHeading=finite(controller.compassRaw)?normalize(controller.compassRaw):null;
      return app.headingDiagnostics();
    };
    app.headingSelfTest=selfTest;
    return true;
  };

  const exposeTimer=setInterval(()=>{if(expose())clearInterval(exposeTimer)},50);
  const tests=selfTest();
  if(!tests.ok)console.error('[SF heading] self-test failed',tests);
  requestAnimationFrame(frame);
})();
