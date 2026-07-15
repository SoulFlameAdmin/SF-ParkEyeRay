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
    return {distanceToRoute:nearestDistance,along,ratio:clamp(along/route.geometryDistance,0,1)};
  };

  const maneuverIcon=step=>{
    const type=String(step?.type||'').toLowerCase(),modifier=String(step?.modifier||'').toLowerCase();
    if(type==='arrive')return'P';
    if(type.includes('roundabout')||type==='rotary')return'↻';
    if(modifier==='left')return'←';
    if(modifier==='right')return'→';
    if(modifier==='slight left')return'↖';
    if(modifier==='slight right')return'↗';
    if(modifier==='sharp left'||modifier==='uturn')return'↶';
    if(modifier==='sharp right')return'↷';
    return'↑';
  };

  const turnPhrase=modifier=>({
    left:'Завий наляво',right:'Завий надясно','slight left':'Дръж леко вляво','slight right':'Дръж леко вдясно',
    'sharp left':'Завий рязко наляво','sharp right':'Завий рязко надясно',uturn:'Направи обратен завой',straight:'Продължи направо'
  })[modifier]||'Продължи';

  const maneuverText=step=>{
    const type=String(step?.type||'').toLowerCase(),modifier=String(step?.modifier||'').toLowerCase();
    const road=String(step?.name||'').trim(),roadSuffix=road?` по ${road}`:'';
    if(type==='arrive')return'Пристигаш до паркинга';
    if(type.includes('roundabout')||type==='rotary')return`Влез в кръговото${step.exit?` · изход ${step.exit}`:''}${roadSuffix}`;
    if(type==='merge')return`Включи се в движението${roadSuffix}`;
    if(type==='on ramp')return`Качи се по рампата${roadSuffix}`;
    if(type==='off ramp')return`Излез по рампата${roadSuffix}`;
    if(type==='fork')return`${modifier.includes('left')?'Дръж вляво':'Дръж вдясно'}${roadSuffix}`;
    if(type==='end of road')return`${turnPhrase(modifier)} в края на пътя${roadSuffix}`;
    return`${turnPhrase(modifier)}${roadSuffix}`;
  };

  const normalizeSteps=route=>{
    const raw=(route?.legs||[]).flatMap(leg=>Array.isArray(leg.steps)?leg.steps:[]);
    let along=0;
    const steps=[];
    raw.forEach(step=>{
      const maneuver=step?.maneuver||{};
      const type=String(maneuver.type||'').toLowerCase();
      if(type&&type!=='depart')steps.push({
        type,modifier:String(maneuver.modifier||'').toLowerCase(),name:String(step.name||''),exit:Number(maneuver.exit)||null,
        atDistance:along,distance:Number(step.distance)||0
      });
      along+=Math.max(0,Number(step.distance)||0);
    });
    return steps;
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
      points,cumulative,geometryDistance,steps:normalizeSteps(route),
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

  app.updateNextManeuver=(progressAlong,remainingDistance)=>{
    const route=s.navigationRoute;
    const icon=app.$('nav-maneuver-icon'),text=app.$('nav-maneuver-text'),distance=app.$('nav-maneuver-distance');
    if(!route||!icon||!text||!distance)return;
    const routeScale=route.geometryDistance?route.totalDistance/route.geometryDistance:1;
    const progressOnApiDistance=progressAlong*routeScale;
    const next=route.steps?.find(step=>step.atDistance>progressOnApiDistance+8)||route.steps?.find(step=>step.type==='arrive');
    if(!next){
      icon.textContent='↑';text.textContent='Следвай маршрута';distance.textContent=app.formatDistance(remainingDistance);return;
    }
    icon.textContent=maneuverIcon(next);text.textContent=maneuverText(next);
    const until=Math.max(0,next.atDistance-progressOnApiDistance);
    distance.textContent=next.type==='arrive'&&until<20?'Сега':app.formatDistance(until);
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
    app.updateNextManeuver(progress.along,remainingDistance);

    const threshold=Math.max(55,Number(user.accuracy||0)*1.5);
    const offRoute=progress.distanceToRoute>threshold&&(user.speed||0)>5;
    if(offRoute)s.offRouteSamples=(s.offRouteSamples||0)+1;else s.offRouteSamples=0;
    if(!s.rerouting)app.$('nav-route-state').textContent=offRoute?'Проверявам отклонение…':'По маршрута';
    if(s.offRouteSamples>=3)app.requestNavigationReroute?.(progress.distanceToRoute);
    if(remainingDistance<25&&progress.distanceToRoute<35&&!s.arrivalAnnounced){
      s.arrivalAnnounced=true;
      app.$('nav-maneuver-icon').textContent='P';
      app.$('nav-maneuver-text').textContent='Пристигаш до паркинга';
      app.$('nav-maneuver-distance').textContent='Сега';
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
    app.closeMapMenu?.();app.setSearchExpanded?.(false);app.setSheetCollapsed?.(true);
    document.body.classList.add('navigation-active');
    app.$('navigation-hud')?.classList.add('active');
    app.$('start-route').textContent='Спри навигацията';
    app.$('nav-route-state').textContent='По маршрута';
    app.$('nav-maneuver-icon').textContent='↑';
    app.$('nav-maneuver-text').textContent='Следвай маршрута';
    app.$('nav-maneuver-distance').textContent='—';
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
    app.$('nav-maneuver-icon').textContent='↑';
    app.$('nav-maneuver-text').textContent='Следвай маршрута';
    app.$('nav-maneuver-distance').textContent='—';
    app.setStatus('Навигацията е спряна.','info');
  };

  app.toggleNavigation=()=>s.navigationActive?app.stopNavigation():app.startNavigation();
})();