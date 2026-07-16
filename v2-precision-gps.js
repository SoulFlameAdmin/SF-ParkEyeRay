(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const FOLLOW_ZOOM=18;
  const WATCH_OPTIONS={enableHighAccuracy:true,timeout:20000,maximumAge:0};
  let bestAccuracy=Infinity;
  let firstFixResolved=false;
  let firstFixTimer=null;
  let programmaticMapMove=false;
  let releaseProgrammaticTimer=null;
  let lastCameraMoveAt=0;
  let visualHeading=0;
  let targetHeading=0;
  let compassHeading=null;
  let compassUpdatedAt=0;
  let orientationListening=false;
  let orientationPermission='unknown';
  let headingFrame=null;

  app.userIcon=L.divIcon({
    className:'sf-user-location-icon',
    html:'<div class="user-position-marker"><div class="user-direction-cone"></div><div class="user-arrow"><svg viewBox="0 0 48 58" aria-hidden="true"><path class="arrow-shadow" d="M24 3L43 51L24 42L5 51Z"/><path class="arrow-body" d="M24 5L41 48L24 39L7 48Z"/><path class="arrow-core" d="M24 10L34 39L24 34L14 39Z"/></svg></div><div class="user-position-core"></div></div>',
    iconSize:[58,68],iconAnchor:[29,34]
  });

  const normalizeHeading=value=>((Number(value)||0)%360+360)%360;
  const shortestHeadingDelta=(from,to)=>((to-from+540)%360)-180;
  const screenAngle=()=>Number(screen.orientation?.angle||window.orientation||0);

  const setHeadingTarget=(next,source='gps')=>{
    if(!Number.isFinite(next))return;
    const normalized=normalizeHeading(next);
    const delta=shortestHeadingDelta(targetHeading,normalized);
    const maxJump=source==='compass'?90:150;
    targetHeading=normalizeHeading(targetHeading+Math.max(-maxJump,Math.min(maxJump,delta)));
  };

  const renderHeading=()=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    const delta=shortestHeadingDelta(visualHeading,targetHeading);
    const moving=Number(s.user?.speed||0)>=5;
    const gain=moving?.22:.16;
    if(Math.abs(delta)>.08)visualHeading=normalizeHeading(visualHeading+delta*gain);
    if(marker)marker.style.setProperty('--heading',`${visualHeading}deg`);
    headingFrame=requestAnimationFrame(renderHeading);
  };

  const compassFromEvent=event=>{
    if(Number.isFinite(event.webkitCompassHeading))return normalizeHeading(event.webkitCompassHeading+screenAngle());
    if(event.absolute===true&&Number.isFinite(event.alpha))return normalizeHeading(360-event.alpha+screenAngle());
    if(Number.isFinite(event.alpha))return normalizeHeading(360-event.alpha+screenAngle());
    return null;
  };

  const handleOrientation=event=>{
    const heading=compassFromEvent(event);
    if(!Number.isFinite(heading))return;
    const now=performance.now();
    if(Number.isFinite(compassHeading)){
      const delta=shortestHeadingDelta(compassHeading,heading);
      const weight=Math.abs(delta)>35?.18:.34;
      compassHeading=normalizeHeading(compassHeading+delta*weight);
    }else compassHeading=heading;
    compassUpdatedAt=now;
    const speed=Number(s.user?.speed||0);
    const gpsHeading=Number(s.user?.heading);
    if(speed>=12&&Number.isFinite(gpsHeading))return;
    if(speed>=5&&Number.isFinite(gpsHeading)){
      const fused=normalizeHeading(compassHeading+shortestHeadingDelta(compassHeading,gpsHeading)*.35);
      setHeadingTarget(fused,'compass');
    }else setHeadingTarget(compassHeading,'compass');
  };

  const startOrientationListening=()=>{
    if(orientationListening||!('DeviceOrientationEvent'in window))return;
    window.addEventListener('deviceorientationabsolute',handleOrientation,true);
    window.addEventListener('deviceorientation',handleOrientation,true);
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
    if(speed>=12&&Number.isFinite(user.heading))setHeadingTarget(user.heading,'gps');
    else if(speed>=5&&Number.isFinite(user.heading)&&compassFresh){
      const fused=normalizeHeading(compassHeading+shortestHeadingDelta(compassHeading,user.heading)*.35);
      setHeadingTarget(fused,'gps');
    }else if(compassFresh)setHeadingTarget(compassHeading,'compass');
    else if(Number.isFinite(user.heading))setHeadingTarget(user.heading,'gps');
    marker.style.setProperty('--accuracy-quality',Number(user.accuracy||999)>20?'0':'1');
    marker.classList.toggle('heading-live',compassFresh||Number.isFinite(user.heading));
    marker.classList.toggle('gps-weak',Number(user.accuracy||999)>25);
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