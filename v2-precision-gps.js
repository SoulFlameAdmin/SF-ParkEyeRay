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
    const possibleMeters=Math.max(80,(Number(user.speed||0)/3.6)*elapsed*4+Number(user.accuracy||0)+Number(s.user.accuracy||0));
    return jump<=possibleMeters||user.accuracy<Math.min(bestAccuracy,25);
  };

  const stabilize=user=>{
    const previous=s.user;
    if(!previous||user.speed>=5||user.accuracy<=12)return user;
    const jump=app.distance(previous,user);
    if(jump>Math.max(18,user.accuracy*1.2))return user;
    const newWeight=Math.min(.85,Math.max(.3,(Number(previous.accuracy||user.accuracy)+1)/(Number(previous.accuracy||user.accuracy)+user.accuracy+2)));
    return {...user,lat:previous.lat*(1-newWeight)+user.lat*newWeight,lon:previous.lon*(1-newWeight)+user.lon*newWeight};
  };

  const markProgrammaticMove=()=>{
    programmaticMapMove=true;
    clearTimeout(releaseProgrammaticTimer);
    releaseProgrammaticTimer=setTimeout(()=>{programmaticMapMove=false},900);
  };

  app.zoomForAccuracy=()=>FOLLOW_ZOOM;
  app.centerOnUser=(user,options={})=>{
    if(!s.map)return;
    s.followUser=true;
    markProgrammaticMove();
    const method=options.animate?'flyTo':'setView';
    s.map[method]([user.lat,user.lon],FOLLOW_ZOOM,options.animate?{animate:true,duration:.65,noMoveStart:true}:{animate:false});
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
    return ready;
  };

  const applyFix=(position,reason='watch')=>{
    let user=fromPosition(position);
    if(!isUsefulFix(user))return false;
    user=stabilize(user);
    bestAccuracy=Math.min(bestAccuracy,user.accuracy);
    const first=!s.initialGpsCentered;
    const shouldCenter=first||(!s.navigationActive&&s.followUser);
    if(!app.applyUserPosition(user,{center:shouldCenter,animate:!first,reason}))return false;
    app.updateNavigationHud?.(user);
    app.updateNavigationProgress?.(user);
    app.followNavigationPosition?.(user);
    if(!firstFixResolved){
      firstFixResolved=true;
      clearTimeout(firstFixTimer);
      s.locating=false;
      app.setBusy?.('gps',false);
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

  app.locate=()=>{
    if(!navigator.geolocation){
      app.setStatus('GPS не се поддържа. Търсенето и картата остават активни.','error',true);
      app.finishBoot?.('unsupported');return;
    }
    s.followUser=true;
    if(s.user){app.centerOnUser(s.user,{animate:true})}
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