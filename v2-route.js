(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.selectParking=async id=>{
    const item=s.parkings.find(parking=>parking.id===id);
    if(!item)return app.setStatus('Избраният паркинг вече не е в списъка. Обнови резултатите.','error');
    if(!s.destination)return app.setStatus('Липсва активна дестинация.','error');

    s.selected=item;
    app.setActiveAction('navigate');
    app.renderParkingMarkers();app.renderParkings();
    app.$('route-card').classList.add('active');app.$('route-name').textContent=item.name;
    const origin=s.user?`&origin=${s.user.lat},${s.user.lon}`:'';
    app.$('external-route').href=`https://www.google.com/maps/dir/?api=1${origin}&destination=${item.entrance.lat},${item.entrance.lon}&travelmode=driving`;
    s.map.fitBounds(L.latLngBounds([[item.point.lat,item.point.lon],[s.destination.lat,s.destination.lon]]).pad(.45),{maxZoom:17});
    await app.buildRoute(item,false);
  };

  app.routeBetween=async(from,to,profile,signal)=>{
    const points=`${from.lat},${from.lon}|${to.lat},${to.lon}`;
    const response=await fetch(`/api/routing?mode=route&profile=${profile}&points=${encodeURIComponent(points)}`,{signal});
    const data=await response.json();
    if(!response.ok||!data.routes?.[0])throw new Error(data.error||'Route error');
    return data.routes[0];
  };

  app.buildRoute=async(item,userStarted)=>{
    if(!item||!s.destination)return;
    if(!s.ui.online){
      app.setRetry(()=>app.buildRoute(item,userStarted),'Повтори маршрута');
      app.$('route-note').textContent='Няма интернет. Външната навигация може да работи след възстановяване на връзката.';
      return app.setStatus('Няма интернет за изчисляване на маршрут.','error',true);
    }

    const controller=app.newRequest('route');
    s.routeLayer.clearLayers();
    app.$('route-card').classList.add('active');
    app.$('drive-distance').textContent=s.user?'…':'Нужен GPS';
    app.$('drive-time').textContent=s.user?'…':'—';
    app.$('walk-distance').textContent='…';
    app.$('route-note').textContent='Изчислявам автомобилната и пешеходната част…';
    app.setBusy('route',true,'Изчислявам маршрута…');
    app.setRetry(null);

    try{
      const tasks=[app.routeBetween(item.point,s.destination,'walking',controller.signal)];
      if(s.user)tasks.unshift(app.routeBetween(s.user,item.entrance,'driving',controller.signal));
      const results=await Promise.all(tasks);
      if(controller.signal.aborted)return;

      const drive=s.user?results[0]:null,walk=s.user?results[1]:results[0];
      item.route=drive;item.walkRoute=walk;
      if(drive?.geometry?.coordinates)L.geoJSON(drive.geometry,{style:{color:'#2f80ed',weight:6,opacity:.9}}).addTo(s.routeLayer);
      if(walk?.geometry?.coordinates)L.geoJSON(walk.geometry,{style:{color:'#f59e0b',weight:5,opacity:.95,dashArray:'8 8'}}).addTo(s.routeLayer);

      app.$('drive-distance').textContent=drive?app.formatDistance(drive.distance):'Нужен GPS';
      app.$('drive-time').textContent=drive?app.formatDuration(drive.duration):'—';
      app.$('walk-distance').textContent=app.formatDistance(walk.distance);
      app.$('route-note').textContent=item.entrance===item.point
        ?'Няма отделно нанесен вход. Автомобилният маршрут завършва при представителната OSM точка.'
        :'Автомобилният маршрут завършва при най-близкия нанесен OSM вход.';

      const geo=[];
      if(drive?.geometry)geo.push(L.geoJSON(drive.geometry));
      if(walk?.geometry)geo.push(L.geoJSON(walk.geometry));
      if(geo.length){
        let bounds=null;geo.forEach(layer=>{bounds=bounds?bounds.extend(layer.getBounds()):layer.getBounds()});
        s.map.fitBounds(bounds,{padding:[55,55]});
      }
      app.setStatus(drive
        ?`Маршрут: ${app.formatDistance(drive.distance)} с кола + ${app.formatDistance(walk.distance)} пеша.`
        :`Пешеходната част е готова. Разреши GPS за маршрут с автомобил.`,'success');

      if(userStarted&&!s.user)app.locate();
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);
      app.$('route-note').textContent='Вътрешният маршрут временно не отговори. Бутонът за външна навигация остава наличен.';
      app.setRetry(()=>app.buildRoute(item,userStarted),'Повтори маршрута');
      app.setStatus('Routing услугата временно не отговаря.','error',true);
    }finally{
      if(s.requests.route===controller)delete s.requests.route;
      app.setBusy('route',false);
    }
  };

  app.clearRoute=()=>{
    app.abortRequest?.('route');
    s.routeLayer?.clearLayers();
    app.$('route-card').classList.remove('active','loading');
    app.$('drive-distance').textContent='—';app.$('drive-time').textContent='—';app.$('walk-distance').textContent='—';
    if(s.selected){s.selected=null;app.renderParkingMarkers?.();app.renderParkings?.()}
    if(s.destination)app.setActiveAction('parkings');
  };
})();
