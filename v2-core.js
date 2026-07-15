(()=>{
  'use strict';
  const app=window.SFV2={};
  app.$=id=>document.getElementById(id);
  app.STORAGE={
    proposals:'sf_v2_proposals',
    saved:'sf_v2_saved',
    destinationHistory:'sf_v2_destination_history',
    savedDestinations:'sf_v2_saved_destinations',
    layers:'sf_v2_map_layers'
  };
  app.RADII=[500,1000,2000,5000];
  app.BG={south:41.1,north:44.3,west:22.2,east:28.75};
  app.DEFAULT_CENTER=[42.7339,25.4858];
  app.read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  app.write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const savedLayers=app.read(app.STORAGE.layers,{parking:true,fuel:false});
  app.state={
    map:null,user:null,destination:null,parkings:[],entrances:[],selected:null,sort:'recommended',parkingContext:'nearby',parkingOrigin:null,
    userMarker:null,destinationMarker:null,accuracyCircle:null,
    parkingLayer:null,fuelLayer:null,routeLayer:null,proposalLayer:null,drawingLayer:null,
    fuelStations:[],layers:{parking:savedLayers.parking!==false,fuel:savedLayers.fuel===true},
    proposals:app.read(app.STORAGE.proposals,[]),
    saved:app.read(app.STORAGE.saved,[]),
    destinationHistory:app.read(app.STORAGE.destinationHistory,[]),
    savedDestinations:app.read(app.STORAGE.savedDestinations,[]),
    drawing:false,drawPoints:[],drawLine:null,drawPolygon:null,pendingGeometry:null,
    locating:false,locationWatchId:null,followUser:true,lastLayerCenter:null,searchVersion:0,requests:{},ui:null,searchTimer:null,layerTimer:null
  };
  app.safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  app.setStatus=(text,type='info',sticky=false)=>{
    const node=app.$('status');
    if(!node)return;
    node.textContent=text;node.className=`status-pill ${type}`;node.style.opacity='1';
    clearTimeout(app.setStatus.timer);if(!sticky)app.setStatus.timer=setTimeout(()=>node.style.opacity='.76',5000);
  };
  app.inBulgaria=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=app.BG.south&&lat<=app.BG.north&&lon>=app.BG.west&&lon<=app.BG.east;
  app.rad=value=>value*Math.PI/180;
  app.distance=(a,b)=>{const r=6371000,dLat=app.rad(b.lat-a.lat),dLon=app.rad(b.lon-a.lon),l1=app.rad(a.lat),l2=app.rad(b.lat),h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLon/2)**2;return r*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))};
  app.formatDistance=m=>!Number.isFinite(m)?'—':m<1000?`${Math.max(1,Math.round(m))} м`:`${(m/1000).toFixed(m<10000?1:0)} км`;
  app.formatDuration=s=>{if(!Number.isFinite(s))return'—';const m=Math.max(1,Math.round(s/60));return m<60?`${m} мин`:`${Math.floor(m/60)} ч ${m%60} мин`};
  app.pointOf=el=>{const lat=Number(el.lat??el.center?.lat),lon=Number(el.lon??el.center?.lon);if(Number.isFinite(lat)&&Number.isFinite(lon))return{lat,lon};const geometry=Array.isArray(el.geometry)?el.geometry:[],valid=geometry.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));if(!valid.length)return null;return{lat:valid.reduce((sum,p)=>sum+Number(p.lat),0)/valid.length,lon:valid.reduce((sum,p)=>sum+Number(p.lon),0)/valid.length}};
  app.parseNumber=value=>{const match=String(value??'').replace(',','.').match(/\d+(?:\.\d+)?/);return match?Number(match[0]):null};
  app.isYes=value=>['yes','designated','customers','private'].includes(String(value||'').toLowerCase());
  app.parkingKind=tags=>tags.amenity==='parking_space'?'Паркинг места':tags.parking==='underground'?'Подземен':tags.parking==='multi-storey'?'Многоетажен':(tags.parking==='street_side'||tags.parking==='lane'||tags['parking:left']||tags['parking:right']||tags['parking:both'])?'Улично паркиране':tags.parking==='surface'?'Открит':'Паркинг';
  app.sourceLabel=()=> 'OSM картографиран · без live свободни места';
  app.userIcon=L.divIcon({className:'',html:'<div class="user-dot"></div>',iconSize:[23,23],iconAnchor:[11,11]});
  app.destinationIcon=L.divIcon({className:'',html:'<div class="dest-dot"></div>',iconSize:[29,29],iconAnchor:[8,28]});
  app.parkingIcon=selected=>L.divIcon({className:'',html:`<div class="parking-pin${selected?' selected':''}">P</div>`,iconSize:selected?[37,37]:[31,31],iconAnchor:selected?[18,18]:[15,15]});
  app.fuelIcon=L.divIcon({className:'',html:'<div class="fuel-pin">⛽</div>',iconSize:[32,32],iconAnchor:[16,16]});
  app.openModal=id=>{
    const modal=app.$(id);if(!modal)return;
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    const focusable=modal.querySelector('button,input,select,textarea,a[href]');focusable?.focus({preventScroll:true});
  };
  app.closeModal=id=>{
    const modal=app.$(id);if(!modal)return;
    modal.classList.remove('open');modal.setAttribute('aria-hidden','true');
  };
  app.updateProfile=()=>{
    const saved=app.$('profile-saved'),proposals=app.$('profile-proposals');
    if(saved)saved.textContent=app.state.saved.length+app.state.savedDestinations.length;
    if(proposals)proposals.textContent=app.state.proposals.length;
  };
  app.applyUserPosition=(user,options={})=>{
    const s=app.state;
    if(!app.inBulgaria(user.lat,user.lon))return false;
    s.user=user;
    if(!s.userMarker)s.userMarker=L.marker([user.lat,user.lon],{icon:app.userIcon,zIndexOffset:2000}).bindPopup('Твоето местоположение').addTo(s.map);else s.userMarker.setLatLng([user.lat,user.lon]);
    if(s.accuracyCircle)s.accuracyCircle.setLatLng([user.lat,user.lon]).setRadius(Math.min(user.accuracy||0,2000));else s.accuracyCircle=L.circle([user.lat,user.lon],{radius:Math.min(user.accuracy||0,2000),color:'#2563eb',weight:1,fillOpacity:.08}).addTo(s.map);
    if(options.center===true&&!s.destination){s.followUser=true;s.map.setView([user.lat,user.lon],user.accuracy<120?16:14)}
    app.onUserPosition?.(user,options);
    if(s.selected)app.buildRoute?.(s.selected,false);
    return true;
  };
  app.locate=()=>{
    const s=app.state;if(s.locating)return;
    if(!navigator.geolocation)return app.setStatus('GPS не се поддържа. Търсенето и картата остават активни.','error',true);
    s.locating=true;app.setBusy?.('gps',true,'Определям местоположението…');
    navigator.geolocation.getCurrentPosition(position=>{
      s.locating=false;app.setBusy?.('gps',false);
      const user={lat:Number(position.coords.latitude),lon:Number(position.coords.longitude),accuracy:Number(position.coords.accuracy||0)};
      if(!app.applyUserPosition(user,{center:true,reason:'manual'}))return app.setStatus('GPS позицията е извън България.','error',true);
      app.setStatus(`GPS е намерен · точност ±${Math.round(user.accuracy)} м`,'success');
    },error=>{
      s.locating=false;app.setBusy?.('gps',false);
      app.setStatus(error.code===1?'GPS е отказан. Разреши го, за да виждаш автоматично обектите около теб.':'GPS временно не е достъпен.','error',true);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:15000});
  };
  app.initMap=()=>{
    if(typeof L==='undefined'){app.setStatus('Картата не можа да се зареди.','error',true);return false}
    const s=app.state;s.map=L.map('map',{zoomControl:true,minZoom:6}).setView(app.DEFAULT_CENTER,7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(s.map);
    s.parkingLayer=L.layerGroup().addTo(s.map);s.fuelLayer=L.layerGroup().addTo(s.map);s.routeLayer=L.layerGroup().addTo(s.map);s.proposalLayer=L.layerGroup().addTo(s.map);s.drawingLayer=L.layerGroup().addTo(s.map);
    s.map.on('click',event=>{if(s.drawing)app.addDrawPoint?.(event.latlng)});
    return true;
  };
})();
