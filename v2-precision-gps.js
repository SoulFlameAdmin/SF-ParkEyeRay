(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const FOLLOW_ZOOM=18;
  const WATCH_OPTIONS={enableHighAccuracy:true,timeout:20000,maximumAge:0};
  const HEADING_DEAD_ZONE=0.9;
  const MAX_TURN_RATE_STILL=150;
  const MAX_TURN_RATE_MOVING=260;
  let bestAccuracy=Infinity;
  let firstFixResolved=false;
  let firstFixTimer=null;
  let programmaticMapMove=false;
  let releaseProgrammaticTimer=null;
  let lastCameraMoveAt=0;
  let visualHeading=0;
  let targetHeading=0;
  let headingInitialized=false;
  let compassHeading=null;
  let compassUpdatedAt=0;
  let compassConfidence=0;
  let orientationListening=false;
  let orientationPermission='unknown';
  let headingFrame=null;
  let lastHeadingFrameAt=0;
  let lastAbsoluteOrientationAt=0;
  let flipCandidate=null;
  let flipCandidateCount=0;
  let pageVisible=!document.hidden;

  app.userIcon=L.divIcon({
    className:'sf-user-location-icon',
    html:'<div class="user-position-marker"><div class="user-direction-cone"></div><div class="user-arrow"><svg viewBox="0 0 48 58" aria-hidden="true"><path class="arrow-shadow" d="M24 3L43 51L24 42L5 51Z"/><path class="arrow-body" d="M24 5L41 48L24 39L7 48Z"/><path class="arrow-core" d="M24 10L34 39L24 34L14 39Z"/></svg></div><div class="user-position-core"></div></div>',
    iconSize:[58,68],iconAnchor:[29,34]
  });

  const normalizeHeading=value=>((Number(value)||0)%360+360)%360;
  const shortestHeadingDelta=(from,to)=>((to-from+540)%360)-180;
  const screenAngle=()=>normalizeHeading(Number(screen.orientation?.angle??window.orientation??0));
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

  const resetFlipGuard=()=>{flipCandidate=null;flipCandidateCount=0};

  const acceptHeading=(next,source='compass')=>{
    if(!Number.isFinite(next))return false;
    const normalized=normalizeHeading(next);
    if(!headingInitialized){
      headingInitialized=true;
      visualHeading=normalized;
      targetHeading=normalized;
      resetFlipGuard();
      return true;
    }

    const speed=Number(s.user?.speed||0);
    const delta=shortestHeadingDelta(targetHeading,normalized);
    if(Math.abs(delta)<HEADING_DEAD_ZONE)return false;

    // Magnetic sensors sometimes jump by ~180 degrees while the phone is still.
    // Require three consistent samples before accepting such a reversal.
    if(source==='compass'&&speed<6&&Math.abs(delta)>115){
      if(!Number.isFinite(flipCandidate)||Math.abs(shortestHeadingDelta(flipCandidate,normalized))>18){
        flipCandidate=normalized;
        flipCandidateCount=1;
        return false;
      }
      flipCandidateCount+=1;
      if(flipCandidateCount<3)return false;
    }

    resetFlipGuard();
    targetHeading=normalized;
    return true;
  };

  const renderHeading=timestamp=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    const elapsed=lastHeadingFrameAt?Math.min(.05,Math.max(.001,(timestamp-lastHeadingFrameAt)/1000)):.016;
    lastHeadingFrameAt=timestamp;
    const delta=shortestHeadingDelta(visualHeading,targetHeading);
    const moving=Number(s.user?.speed||0)>=5;
    const maxStep=(moving?MAX_TURN_RATE_MOVING:MAX_TURN_RATE_STILL)*elapsed;
    const easedStep=delta*(moving?.26:.20);
    const step=clamp(easedStep,-maxStep,maxStep);
    if(Math.abs(delta)>HEADING_DEAD_ZONE*.35)visualHeading=normalizeHeading(visualHeading+step);
    else visualHeading=targetHeading;
    if(marker)marker.style.setProperty('--heading',`${visualHeading.toFixed(2)}deg`);
    headingFrame=requestAnimationFrame(renderHeading);
  };

  // Direction of the physical top-centre edge of the visible phone screen.
  const compassFromEvent=event=>{
    let raw=null;
    if(Number.isFinite(event.webkitCompassHeading))raw=Number(event.webkitCompassHeading);
    else if(Number.isFinite(event.alpha))raw=360-Number(event.alpha);
    if(!Number.isFinite(raw))return null;
    return normalizeHeading(raw-screenAngle());
  };

  const confidenceFromEvent=(event,isAbsolute)=>{
    const iosAccuracy=Number(event.webkitCompassAccuracy);
    if(Number.isFinite(iosAccuracy)&&iosAccuracy>=0)return clamp(1-iosAccuracy/90,.15,1);
    return isAbsolute?.82:.48;
  };

  const handleOrientation=event=>{
    if(!pageVisible)return;
    const now=performance.now();
    const isAbsolute=event.type==='deviceorientationabsolute'||event.absolute===true||Number.isFinite(event.webkitCompassHeading);
    if(isAbsolute)lastAbsoluteOrientationAt=now;
    else if(now-lastAbsoluteOrientationAt<1400)return;

    const heading=compassFromEvent(event);
    if(!Number.isFinite(heading))return;
    const confidence=confidenceFromEvent(event,isAbsolute);

    if(Number.isFinite(compassHeading)){
      const delta=shortestHeadingDelta(compassHeading,heading);
      if(Math.abs(delta)<HEADING_DEAD_ZONE)return;
      const baseWeight=confidence>.75?.42:confidence>.5?.28:.16;
      const weight=Math.abs(delta)>45?baseWeight*.45:baseWeight;
      compassHeading=normalizeHeading(compassHeading+delta*weight);
    }else compassHeading=heading;

    compassConfidence=confidence;
    compassUpdatedAt=now;
    const speed=Number(s.user?.speed||0);
    const gpsHeading=Number(s.user?.heading);

    if(speed>=12&&Number.isFinite(gpsHeading))acceptHeading(gpsHeading,'gps');
    else if(speed>=6&&Number.isFinite(gpsHeading)){
      const gpsWeight=confidence>.7?.32:.52;
      const fused=normalizeHeading(compassHeading+shortestHeadingDelta(compassHeading,gpsHeading)*gpsWeight);
      acceptHeading(fused,'compass');
    }else acceptHeading(compassHeading,'compass');
  };

  const resetOrientationAlignment=()=>{
    compassHeading=null;
    compassUpdatedAt=0;
    compassConfidence=0;
    lastAbsoluteOrientationAt=0;
    resetFlipGuard();
  };

  const handleVisibility=()=>{
    pageVisible=!document.hidden;
    lastHeadingFrameAt=0;
    if(pageVisible)resetOrientationAlignment();
  };

  const startOrientationListening=()=>{
    if(orientationListening||!('DeviceOrientationEvent'in window))return;
    window.addEventListener('deviceorientationabsolute',handleOrientation,true);
    window.addEventListener('deviceorientation',handleOrientation,true);
    screen.orientation?.addEventListener?.('change',resetOrientationAlignment);
    window.addEventListener('orientationchange',resetOrientationAlignment,true);
    document.addEventListener('visibilitychange',handleVisibility);
    orientationListening=true;
    orientationPermission='granted';
  };

  const requestOrientationPermission=async()=>{
    if(!('DeviceOrientationEvent'in window))return false;
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      try{
        const result=await DeviceOrientationEvent.requestPermission();
        orientationPermission=result;
        if(result==='granted'){startOrientationListening();return true}
        app.setStatus('Компасът е отказан. Стрелката ще използва GPS посоката при движение.','info');
        return false;
      }catch{
        orientationPermission='unknown';
        return false;
      }
    }
    startOrientationListening();
    return true;
  };

  const fromPosition=position=>{
    const coords=position.coords;
    return {
      lat:Number(coords.latitude),
      lon:Number(coords.longitude),
      accuracy:Math.max(1,Number(coords.accuracy||9999)),
      speed:Number.isFinite(coords.speed)&&coords.speed>=0?Math.round(coords.speed*3.6):0,
      heading:Number.isFinite(coords.heading)?Number(coords.heading):null,
      timestamp:Number(position.timestamp||Date.now())
    };
  };

  const isUsefulFix=user=>{
    if(!app.inBulgaria(user.lat,user.lon))return false;
    if(!s.user)return true;
    const age=Math.max(0,Date.now()-Number(user.timestamp||Date.now()));
    if(age>15000)return false;
    const jump=app.distance(s.user,user);
    const elapsed=Math.max(.25,(user.timestamp-Number(s.user.timestamp||user.timestamp-1000))/1000);
    const possibleMeters=Math.max(65,(Number(user.speed||0)/3.6)*elapsed*4+Number(user.accuracy||0)+Number(s.user.accuracy||0));
    return jump<=possibleMeters||user.accuracy<Math.min(bestAccuracy,20);
  };

  const stabilize=user=>{
    const previous=s.user;
    if(!previous)return user;
    const jump=app.distance(previous,user);
    const speed=Math.max(0,Number(user.speed||0));
    const noiseRadius=Math.max(6,Math.min(22,Number(user.accuracy||0)*.7));
    if(speed<3&&jump<=noiseRadius)return {...user,lat:previous.lat,lon:previous.lon,heading:user.heading??previous.heading};
    if(speed<10&&jump<=Math.max(30,Number(user.accuracy||0)*1.5)){
      const weight=speed<5?.28:.55;
      return {...user,lat:previous.lat*(1-weight)+user.lat*weight,lon:previous.lon*(1-weight)+user.lon*weight};
    }
    return user;
  };

  const updateDirectionVisual=user=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    if(!marker)return;
    const speed=Number(user.speed||0);
    const compassFresh=Number.isFinite(compassHeading)&&performance.now()-compassUpdatedAt<1800;
    if(speed>=12&&Number.isFinite(user.heading))acceptHeading(user.heading,'gps');
    else if(speed>=6&&Number.isFinite(user.heading)&&compassFresh){
      const gpsWeight=compassConfidence>.7?.32:.52;
      const fused=normalizeHeading(compassHeading+shortestHeadingDelta(compassHeading,user.heading)*gpsWeight);
      acceptHeading(fused,'compass');
    }else if(compassFresh)acceptHeading(compassHeading,'compass');
    else if(Number.isFinite(user.heading))acceptHeading(user.heading,'gps');
    marker.style.setProperty('--accuracy-quality',Number(user.accuracy||999)>20?'0':'1');
    marker.classList.toggle('heading-live',compassFresh||Number.isFinite(user.heading));
    marker.classList.toggle('gps-weak',Number(user.accuracy||999)>25);
    marker.classList.toggle('compass-weak',compassFresh&&compassConfidence<.5);
  };

  const markProgrammaticMove=()=>{
    programmaticMapMove=true;
    clearTimeout(releaseProgrammaticTimer);
    releaseProgrammaticTimer=setTimeout(()=>{programmaticMapMove=false},700);
  };

  app.zoomForAccuracy=()=>FOLLOW_ZOOM;
  app.centerOnUser=(user,options={})=>{
    if(!s.map)return;
    s.followUser=true;
    markProgrammaticMove();
    const method=options.animate?'flyTo':'setView';
    s.map[method]([user.lat,user.lon],FOLLOW_ZOOM,options.animate?{animate:true,duration:.55,noMoveStart:true}:{animate:false});
    lastCameraMoveAt=Date.now();
  };

  const followCameraIfNeeded=(user,first)=>{
    if(!s.map)return;
    if(first){app.centerOnUser(user,{animate:false});return}
    if(!s.followUser||s.navigationActive)return;
    const center=s.map.getCenter();
    const distanceFromCenter=app.distance({lat:center.lat,lon:center.lng},user);
    const threshold=Math.max(10,Math.min(28,Number(user.accuracy||0)*.65));
    const now=Date.now();
    if(distanceFromCenter<threshold||now-lastCameraMoveAt<900)return;
    markProgrammaticMove();
    s.map.panTo([user.lat,user.lon],{animate:true,duration:.35,noMoveStart:true});
    lastCameraMoveAt=now;
  };

  const originalInitMap=app.initMap;
  app.initMap=()=>{
    const ready=originalInitMap();
    if(!ready||!s.map)return ready;
    const stopAutomaticFollow=()=>{
      if(programmaticMapMove)return;
      s.followUser=false;
      app.setStatus('Автоматичното центриране е изключено. Натисни ◎, за да се върнеш към позицията си.','info');
    };
    s.map.on('zoomstart',stopAutomaticFollow);
    s.map.on('zoomend',()=>{clearTimeout(releaseProgrammaticTimer);programmaticMapMove=false});
    if(!headingFrame)headingFrame=requestAnimationFrame(renderHeading);
    return ready;
  };

  const applyFix=(position,reason='watch')=>{
    let user=fromPosition(position);
    if(!isUsefulFix(user))return false;
    user=stabilize(user);
    bestAccuracy=Math.min(bestAccuracy,user.accuracy);
    const first=!s.initialGpsCentered;
    if(!app.applyUserPosition(user,{center:false,animate:false,reason}))return false;
    if(first)s.initialGpsCentered=true;
    updateDirectionVisual(user);
    followCameraIfNeeded(user,first);
    app.updateNavigationHud?.(user);
    app.updateNavigationProgress?.(user);
    app.followNavigationPosition?.(user);
    if(first&&!s.bootComplete){
      app.setBootMessage('Opening SoulFlame Navigation');
      clearTimeout(s.bootRevealTimer);
      s.bootRevealTimer=setTimeout(()=>app.finishBoot?.('gps'),360);
    }
    if(!firstFixResolved){
      firstFixResolved=true;clearTimeout(firstFixTimer);s.locating=false;app.setBusy?.('gps',false);
      app.setStatus(`GPS е намерен · точност ±${Math.round(user.accuracy)} м`,'success');
    }else if(user.accuracy<=bestAccuracy&&user.accuracy<=15){
      app.setStatus(`GPS висока точност · ±${Math.round(user.accuracy)} м`,'success');
    }
    return true;
  };

  const handleError=error=>{
    s.locating=false;app.setBusy?.('gps',false);
    const denied=error.code===1;
    app.setStatus(denied?'GPS е отказан. Разреши точно местоположение от настройките на телефона.':'GPS сигналът временно е слаб. Остави приложението отворено за по-точен fix.','error',true);
    if(!s.user){app.setBootMessage('Opening SoulFlame Navigation');app.finishBoot?.('gps-error')}
  };

  app.startLocationWatch=()=>{
    if(!navigator.geolocation||s.locationWatchId!==null)return;
    s.locationWatchId=navigator.geolocation.watchPosition(position=>applyFix(position,'watch'),handleError,WATCH_OPTIONS);
  };

  app.locate=async()=>{
    if(orientationPermission==='unknown')await requestOrientationPermission();
    if(!navigator.geolocation){app.setStatus('GPS не се поддържа. Търсенето и картата остават активни.','error',true);app.finishBoot?.('unsupported');return}
    s.followUser=true;
    if(s.user)app.centerOnUser(s.user,{animate:true});
    if(s.locationWatchId!==null)return;
    s.locating=true;firstFixResolved=false;bestAccuracy=Infinity;
    app.setBootMessage('Finding your precise location');
    app.setBusy?.('gps',true,'Търся най-точния GPS сигнал…');
    app.startLocationWatch();
    clearTimeout(firstFixTimer);
    firstFixTimer=setTimeout(()=>{
      if(firstFixResolved)return;
      s.locating=false;app.setBusy?.('gps',false);
      if(s.user){app.centerOnUser(s.user,{animate:true});app.setStatus(`GPS активен · точност ±${Math.round(s.user.accuracy||0)} м`,'info')}
    },12000);
  };
})();