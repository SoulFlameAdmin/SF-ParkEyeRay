(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const speedKmh=coords=>Number.isFinite(coords.speed)&&coords.speed>=0?Math.round(coords.speed*3.6):0;
  const zoomForSpeed=kmh=>kmh<8?18:kmh<45?17:kmh<90?16:15;
  const earthMetersPerDegree=111320;

  const formatEta=seconds=>{
    if(!Number.isFinite(seconds))return'—';
    const date=new Date(Date.now()+Math.max(0,seconds)*1000);
    return date.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'});
  };

  const toLocal=(point,origin)=>({
    x:(point.lon-origin.lon)*earthMetersPerDegree*Math.cos(origin.lat*Math.PI/180),
    y:(point.lat-origin.lat)*earthMetersPerDegree
  });

  const nearestRouteProgress=(user,route)=>{
    if(!route?.points?.length||route.points.length<2)return null;
    let nearestDistance=Infinity,along=0;
    for(let i=0;i<route.points.length-1;i++){
      const a=route.points[i],b=route.points[i+1],origin=a;
      const av=toLocal(a,origin),bv=toLocal(b,origin),pv=toLocal(user,origin);
      const dx=bv.x-av.x,dy=bv.y-av.y,lengthSquared=dx*dx+dy*dy;
      const t=lengthSquared?clamp(((pv.x-av.x)*dx+(pv.y-av.y)*dy)/lengthSquared,0,1):0;
      const qx=av.x+t*dx,qy=av.y+t*dy;
      const distance=Math.hypot(pv.x-qx,pv.y-qy);
      if(distance<nearestDistance){
        nearestDistance=distance;
        along=route.cumulative[i]+t*(route.cumulative[i+1]-route.cumulative[i]);
      }
    }
    return {distanceToRoute:nearestDistance,ratio:clamp(along/route.geometryDistance,0,1)};
  };

  app.prepareNavigationRoute=route=>{
    const coordinates=route?.geometry?.coordinates;
    if(!Array.isArray(coordinates)||coordinates.length<2){s.navigationRoute=null;return null}
    const points=coordinates.map(([lon,lat])=>({lat:Number(lat),lon:Number(lon)})).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lon));
    if(points.length<2){s.navigationRoute=null;return null}
    const cumulative=[0];
    for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+app.distance(points[i-1],points[i]));
    const geometryDistance=cumulative[cumulative.length-1];
    if(!geometryDistance){s.navigationRoute=null;return null}
    s.navigationRoute={
      points,cumulative,geometryDistance,
      totalDistance:Number(route.distance)||geometryDistance,
      totalDuration:Number(route.duration)||0
    };
    s.offRouteSamples=0;
    return s.navigationRoute;
  };

  app.updateNavigationHud=user=>{
    const speed=app.$('nav-speed-value');
    if(speed)speed.textContent=String(Math.max(0,Math.round(user.speed||0)));
    const accuracy=app.$('nav-gps-accuracy');
    if(accuracy)accuracy.textContent=user.accuracy?`GPS ±${Math.round(user.accuracy)} м`:'GPS активен';
  };

  app.updateNavigationProgress=user=>{
    if(!s.navigationActive||!s.navigationRoute)return;
    const progress=nearestRouteProgress(user,s.navigationRoute);
    if(!progress)return;
    const remainingRatio=1-progress.ratio;
    const remainingDistance=Math.max(0,s.navigationRoute.totalDistance*remainingRatio);
    const remainingDuration=Math.max(0,s.navigationRoute.totalDuration*remainingRatio);
    const distanceNode=app.$('nav-remaining-distance'),timeNode=app.$('nav-remaining-time'),etaNode=app.$('nav-eta');
    if(distanceNode)distanceNode.textContent=app.formatDistance(remainingDistance);
    if(timeNode)timeNode.textContent=app.formatDuration(remainingDuration);
    if(etaNode)etaNode.textContent=formatEta(remainingDuration);
    app.$('drive-distance').textContent=app.formatDistance(remainingDistance);
    app.$('drive-time').textContent=app.formatDuration(remainingDuration);

    const threshold=Math.max(55,Number(user.accuracy||0)*1.5);
    if(progress.distanceToRoute>threshold&&(user.speed||0)>5)s.offRouteSamples=(s.offRouteSamples||0)+1;else s.offRouteSamples=0;
    if(s.offRouteSamples>=3)app.requestNavigationReroute?.(progress.distanceToRoute);
    if(remainingDistance<25&&progress.distanceToRoute<35&&!s.arrivalAnnounced){
      s.arrivalAnnounced=true;
      app.setStatus('Пристигаш до избрания паркинг.','success',true);
    }
  };

  app.requestNavigationReroute=async distanceToRoute=>{
    const now=Date.now();
    if(!s.navigationActive||!s.selected||s.rerouting||!s.ui?.online||now-(s.lastRerouteAt||0)<30000)return;
    s.rerouting=true;s.lastRerouteAt=now;s.offRouteSamples=0;
    app.$('nav-route-state').textContent='Преизчислявам…';
    app.setStatus(`Отклонение от маршрута · ${Math.round(distanceToRoute)} м. Преизчислявам…`,'info',true);
    try{await app.buildRoute(s.selected,false);app.$('nav-route-state').textContent='По маршрута'}
    finally{s.rerouting=false}
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
      app.updateNavigationProgress(user);
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
    s.navigationActive=true;s.followUser=true;s.arrivalAnnounced=false;s.offRouteSamples=0;
    document.body.classList.add('navigation-active');
    app.$('navigation-hud')?.classList.add('active');
    app.$('start-route').textContent='Спри навигацията';
    app.$('nav-route-state').textContent='По маршрута';
    app.startLocationWatch();
    await app.buildRoute(s.selected,true);
    app.updateNavigationProgress(s.user);
    app.followNavigationPosition(s.user);
    app.setStatus('Навигацията е стартирана.','success');
  };

  app.stopNavigation=()=>{
    s.navigationActive=false;s.navigationRoute=null;s.offRouteSamples=0;s.rerouting=false;
    app.stopLocationWatch();
    document.body.classList.remove('navigation-active');
    app.$('navigation-hud')?.classList.remove('active');
    app.$('start-route').textContent='Старт';
    app.updateNavigationHud({speed:0,accuracy:s.user?.accuracy||0});
    app.setStatus('Навигацията е спряна.','info');
  };

  app.toggleNavigation=()=>s.navigationActive?app.stopNavigation():app.startNavigation();
})();