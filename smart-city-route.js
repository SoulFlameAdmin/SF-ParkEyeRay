(()=>{
  'use strict';
  const app=window.SFMap,s=app.state;
  app.setDestination=async item=>{
    app.clearRoute(false);
    s.activeDestination={lat:Number(item.lat),lon:Number(item.lon),name:item.name||'Дестинация'};
    s.destinationMarker=L.marker([s.activeDestination.lat,s.activeDestination.lon],{icon:app.destIcon,zIndexOffset:1800}).bindPopup(`<b>${app.safe(s.activeDestination.name)}</b>`).addTo(s.map);
    app.$('q').value=s.activeDestination.name;app.$('eyebrow').textContent='Дестинация';app.$('place').textContent=s.activeDestination.name;
    app.$('meta').textContent='Търся всички OSM паркинги в избрания радиус около обекта…';
    app.$('external-destination').href=s.location?`https://www.google.com/maps/dir/?api=1&origin=${s.location.lat},${s.location.lon}&destination=${s.activeDestination.lat},${s.activeDestination.lon}&travelmode=driving`:`https://www.google.com/maps/search/?api=1&query=${s.activeDestination.lat},${s.activeDestination.lon}`;
    app.$('external-route').href=app.$('external-destination').href;app.$('route-actions').classList.add('active');
    app.enabled.add('parking');document.querySelector('[data-layer="parking"]')?.classList.add('active');s.follow=false;s.parkingCandidates=[];s.nearestParking=null;app.$('nearest-parking').classList.remove('active');
    app.updateRadius(true);await app.drawRouteToDestination(s.activeDestination,null);await app.loadSmartData(true);
  };
  app.fetchRoute=async(from,to,profile='driving')=>{
    const points=`${from.lat},${from.lon}|${to.lat},${to.lon}`,response=await fetch(`/api/routing?mode=route&profile=${profile}&points=${encodeURIComponent(points)}`),data=await response.json();
    if(!response.ok||!data.routes?.[0])throw new Error('route');return data.routes[0];
  };
  app.drawRouteToDestination=async(dest,parkingPoint)=>{
    if(s.routeLine){s.routeLine.remove();s.routeLine=null}if(s.walkLine){s.walkLine.remove();s.walkLine=null}
    const driveTarget=parkingPoint||dest;
    if(!s.location){s.map.fitBounds(L.latLngBounds([[dest.lat,dest.lon],[driveTarget.lat,driveTarget.lon]]).pad(.35),{maxZoom:17});app.setStatus('Дестинацията и паркингите са показани. Разреши GPS за маршрут от текущото ти място.','success');return}
    app.setStatus(parkingPoint?'Изчислявам маршрут до най-близкия паркинг…':'Изчислявам маршрут до дестинацията…','info',true);
    try{
      const drive=await app.fetchRoute(s.location,driveTarget,'driving'),line=drive.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
      s.routeLine=L.polyline(line,{color:'#16a34a',weight:5,opacity:.9}).addTo(s.map);const bounds=s.routeLine.getBounds();let walkText='';
      if(parkingPoint){
        try{
          const walk=await app.fetchRoute(parkingPoint,dest,'walking'),coords=walk.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
          s.walkLine=L.polyline(coords,{color:'#f59e0b',weight:5,opacity:.95,dashArray:'8 8'}).addTo(s.map);bounds.extend(s.walkLine.getBounds());walkText=` · пеша ${app.formatDistance(walk.distance)} / ${app.formatDuration(walk.duration)}`;
        }catch(error){
          s.walkLine=L.polyline([[parkingPoint.lat,parkingPoint.lon],[dest.lat,dest.lon]],{color:'#f59e0b',weight:4,opacity:.85,dashArray:'7 8'}).addTo(s.map);bounds.extend(s.walkLine.getBounds());walkText=` · ${app.formatDistance(app.distance(parkingPoint,dest))} права линия до обекта`;
        }
      }
      s.map.fitBounds(bounds,{padding:[55,55]});
      app.setStatus(parkingPoint?`До паркинга: ${app.formatDistance(drive.distance)} · ${app.formatDuration(drive.duration)}${walkText}`:`До обекта без live трафик: ${app.formatDistance(drive.distance)} · ${app.formatDuration(drive.duration)}`,'success');
    }catch(error){s.map.fitBounds(L.latLngBounds([[s.location.lat,s.location.lon],[driveTarget.lat,driveTarget.lon],[dest.lat,dest.lon]]).pad(.25));app.setStatus('Вътрешният маршрут не отговори. Външната навигация е готова.','error',true)}
  };
  app.clearRoute=(resetCenter=true)=>{
    if(s.routeLine){s.routeLine.remove();s.routeLine=null}if(s.walkLine){s.walkLine.remove();s.walkLine=null}if(s.destinationMarker){s.destinationMarker.remove();s.destinationMarker=null}
    s.activeDestination=null;s.nearestParking=null;s.parkingCandidates=[];app.$('nearest-parking').classList.remove('active');app.$('route-actions').classList.remove('active');app.$('q').value='';app.$('eyebrow').textContent='Ти си центърът';app.$('meta').textContent='Радиусът и данните се движат автоматично с теб.';
    if(s.location){app.reverseCurrentPlace(s.location);app.updateRadius(resetCenter);if(resetCenter)app.focusUser();app.scheduleLoad(100)}
  };
})();
