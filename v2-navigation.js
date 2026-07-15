(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const speedKmh=coords=>Number.isFinite(coords.speed)&&coords.speed>=0?Math.round(coords.speed*3.6):0;
  const zoomForSpeed=kmh=>kmh<8?18:kmh<45?17:kmh<90?16:15;

  app.updateNavigationHud=user=>{
    const speed=app.$('nav-speed-value');
    if(speed)speed.textContent=String(Math.max(0,Math.round(user.speed||0)));
    const accuracy=app.$('nav-gps-accuracy');
    if(accuracy)accuracy.textContent=user.accuracy?`GPS ±${Math.round(user.accuracy)} м`:'GPS активен';
  };

  app.followNavigationPosition=user=>{
    if(!s.navigationActive||!s.followUser||!s.map)return;
    const targetZoom=zoomForSpeed(user.speed||0);
    s.map.flyTo([user.lat,user.lon],targetZoom,{animate:true,duration:.55,noMoveStart:true});
    if(Number.isFinite(user.heading)&&(user.speed||0)>4){
      const arrow=app.$('nav-heading-arrow');
      if(arrow)arrow.style.transform=`rotate(${clamp(user.heading,0,360)}deg)`;
    }
  };

  app.startLocationWatch=()=>{
    if(!navigator.geolocation||s.locationWatchId!==null)return;
    s.locationWatchId=navigator.geolocation.watchPosition(position=>{
      const coords=position.coords;
      const user={
        lat:Number(coords.latitude),lon:Number(coords.longitude),accuracy:Number(coords.accuracy||0),
        speed:speedKmh(coords),heading:Number.isFinite(coords.heading)?Number(coords.heading):null,
        timestamp:Number(position.timestamp||Date.now())
      };
      if(!app.applyUserPosition(user,{center:false,reason:'watch'}))return;
      app.updateNavigationHud(user);
      app.followNavigationPosition(user);
    },error=>{
      if(s.navigationActive)app.setStatus(error.code===1?'GPS достъпът е отказан.':'GPS сигналът временно е слаб.','error',true);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:1000});
  };

  app.stopLocationWatch=()=>{
    if(s.locationWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(s.locationWatchId);s.locationWatchId=null}
  };

  app.startNavigation=async()=>{
    if(!s.selected)return app.setStatus('Избери паркинг преди старт.','error');
    if(!s.user){app.locate();return app.setStatus('Изчаквам GPS позиция. Натисни Старт отново след намирането ѝ.','info')}
    s.navigationActive=true;s.followUser=true;
    document.body.classList.add('navigation-active');
    app.$('navigation-hud')?.classList.add('active');
    app.$('start-route').textContent='Спри навигацията';
    app.startLocationWatch();
    await app.buildRoute(s.selected,true);
    app.followNavigationPosition(s.user);
    app.setStatus('Навигацията е стартирана.','success');
  };

  app.stopNavigation=()=>{
    s.navigationActive=false;
    document.body.classList.remove('navigation-active');
    app.$('navigation-hud')?.classList.remove('active');
    app.$('start-route').textContent='Старт';
    app.updateNavigationHud({speed:0,accuracy:s.user?.accuracy||0});
    app.setStatus('Навигацията е спряна.','info');
  };

  app.toggleNavigation=()=>s.navigationActive?app.stopNavigation():app.startNavigation();
})();