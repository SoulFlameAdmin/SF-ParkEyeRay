(()=>{
  'use strict';
  const app=window.SFMap,s=app.state;
  app.stepZoom=direction=>{const next=Math.max(0,Math.min(15,Number(app.$('radius').value)+direction));app.$('radius').value=String(next);app.updateRadius(true);app.scheduleLoad(100)};
  app.syncSliderFromMap=()=>{
    if(s.syncingZoom)return;
    const zoom=s.map.getZoom();let best=0,gap=Infinity;
    app.RADII.forEach((value,index)=>{const current=Math.abs(app.zoomForRadius(value)-zoom);if(current<gap){best=index;gap=current}});
    if(Number(app.$('radius').value)!==best){app.$('radius').value=String(best);app.updateRadius(false)}
  };
  app.updateRadius=zoomMap=>{
    const center=app.centerPoint(),selected=app.radius(),value=app.effectiveRadius();
    app.$('radius-value').textContent=value>selected?`≥${app.labelRadius(value)}`:app.labelRadius(selected);
    if(center){
      if(!s.radiusCircle)s.radiusCircle=L.circle([center.lat,center.lon],{radius:value,color:'#22c55e',weight:2,fillColor:'#22c55e',fillOpacity:.055}).addTo(s.map);
      else s.radiusCircle.setLatLng([center.lat,center.lon]).setRadius(value);
      if(zoomMap){s.syncingZoom=true;s.map.setView([center.lat,center.lon],app.zoomForRadius(Math.max(selected,value)),{animate:true});setTimeout(()=>s.syncingZoom=false,300)}
    }
    app.scheduleLoad(450);
  };
  app.reverseCurrentPlace=async point=>{
    app.$('eyebrow').textContent='Ти си центърът';app.$('place').textContent=`${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
    try{const response=await fetch(`/api/reverse?lat=${point.lat}&lon=${point.lon}`),data=await response.json();if(response.ok&&data.name)app.$('place').textContent=data.name}catch(error){console.warn('Reverse geocode failed',error)}
  };
  app.focusUser=()=>{if(s.location)s.map.setView([s.location.lat,s.location.lon],app.zoomForRadius(Math.max(app.radius(),app.effectiveRadius())),{animate:true})};
  app.onPosition=position=>{
    const next={lat:Number(position.coords.latitude),lon:Number(position.coords.longitude),accuracy:Number(position.coords.accuracy||0)};
    if(next.lat<41.1||next.lat>44.3||next.lon<22.2||next.lon>28.75){app.setStatus('GPS позицията е извън България.','error',true);return}
    const moved=!s.location||app.distance(s.location,next)>20;s.location=next;
    if(!s.userMarker)s.userMarker=L.marker([next.lat,next.lon],{icon:app.userIcon,zIndexOffset:2000}).addTo(s.map);else s.userMarker.setLatLng([next.lat,next.lon]);
    if(s.accuracyCircle)s.accuracyCircle.setLatLng([next.lat,next.lon]).setRadius(Math.min(next.accuracy,2000));else s.accuracyCircle=L.circle([next.lat,next.lon],{radius:Math.min(next.accuracy,2000),color:'#3b82f6',weight:1,fillOpacity:.08}).addTo(s.map);
    app.$('accuracy').textContent=`±${Math.round(next.accuracy)} м`;
    if(!s.activeDestination&&(!s.lastNamedPoint||app.distance(s.lastNamedPoint,next)>250)){s.lastNamedPoint=next;app.reverseCurrentPlace(next)}
    app.updateRadius(s.follow&&!s.activeDestination&&!s.lastLoadAt);if(s.follow&&!s.activeDestination)app.focusUser();if(moved&&!s.activeDestination)app.scheduleLoad(250);
  };
  app.startGps=()=>{
    if(!navigator.geolocation){app.setStatus('GPS не се поддържа. Можеш да търсиш адрес и да видиш паркингите около него.','error',true);return}
    if(s.watchId)navigator.geolocation.clearWatch(s.watchId);
    s.watchId=navigator.geolocation.watchPosition(app.onPosition,error=>app.setStatus(error.code===1?'Разреши GPS за маршрут от текущото ти място. Търсенето по адрес остава активно.':'GPS временно не е достъпен.','error',true),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  };
  app.bind=()=>{
    app.$('radius').oninput=()=>app.updateRadius(true);app.$('radius').onchange=()=>app.scheduleLoad(100);
    app.$('zoom-in').onclick=()=>app.stepZoom(1);app.$('zoom-out').onclick=()=>app.stepZoom(-1);
    app.$('locate').onclick=()=>{s.follow=true;if(s.activeDestination)app.clearRoute();if(s.location)app.focusUser();else app.startGps()};
    document.querySelectorAll('.layer').forEach(button=>button.onclick=()=>app.toggleLayer(button));
    app.$('search').onsubmit=e=>{e.preventDefault();app.searchDestination(app.$('q').value)};
    app.$('q').oninput=()=>app.$('search-results').classList.remove('active');app.$('clear-route').onclick=()=>app.clearRoute();app.$('retry').onclick=()=>app.loadSmartData(true);
    app.$('sheet-toggle').onclick=()=>{const collapsed=app.$('sheet').classList.toggle('collapsed');app.$('sheet-toggle').textContent=collapsed?'⌃':'⌄'};
    document.addEventListener('click',event=>{if(!event.target.closest('.search-box'))app.$('search-results').classList.remove('active')});
  };
  app.init=()=>{
    s.map=L.map('map',{zoomControl:true,minZoom:6}).setView(app.BULGARIA,7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(s.map);
    Object.values(app.layers).forEach(layer=>layer.addTo(s.map));s.map.on('dragstart',()=>s.follow=false);s.map.on('zoomend',app.syncSliderFromMap);
    app.bind();app.startGps();app.updateRadius(true);setInterval(()=>app.centerPoint()&&app.loadSmartData(),app.REFRESH_MS);
  };
  app.init();
})();
