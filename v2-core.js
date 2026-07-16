(()=>{
  'use strict';
  const app=window.SFV2={};
  app.$=id=>document.getElementById(id);
  app.STORAGE={
    proposals:'sf_v2_proposals',
    saved:'sf_v2_saved',
    destinationHistory:'sf_v2_destination_history',
    savedDestinations:'sf_v2_saved_destinations',
    layers:'sf_v2_map_layers',
    lastPosition:'sf_v2_last_position'
  };
  app.RADII=[500,1000,2000,5000];
  app.BG={south:41.1,north:44.3,west:22.2,east:28.75};
  app.DEFAULT_CENTER=[42.7339,25.4858];
  app.read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  app.write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const savedLayers=app.read(app.STORAGE.layers,{parking:true,fuel:false});
  const lastPosition=app.read(app.STORAGE.lastPosition,null);
  app.state={
    map:null,user:null,destination:null,parkings:[],entrances:[],selected:null,sort:'recommended',parkingContext:'nearby',parkingOrigin:null,
    userMarker:null,destinationMarker:null,accuracyCircle:null,lastHeading:0,
    parkingLayer:null,fuelLayer:null,routeLayer:null,proposalLayer:null,drawingLayer:null,
    fuelStations:[],layers:{parking:savedLayers.parking!==false,fuel:savedLayers.fuel===true},
    proposals:app.read(app.STORAGE.proposals,[]),
    saved:app.read(app.STORAGE.saved,[]),
    destinationHistory:app.read(app.STORAGE.destinationHistory,[]),
    savedDestinations:app.read(app.STORAGE.savedDestinations,[]),
    lastPosition,
    drawing:false,drawPoints:[],drawLine:null,drawPolygon:null,pendingGeometry:null,lastDrawPointerAt:0,lastDrawClientX:null,lastDrawClientY:null,
    locating:false,locationWatchId:null,followUser:true,navigationActive:false,lastLayerCenter:null,searchVersion:0,requests:{},ui:null,searchTimer:null,layerTimer:null,
    initialGpsCentered:false,bootComplete:false,bootTimer:null,bootRevealTimer:null
  };
  app.safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  app.setStatus=(text,type='info',sticky=false)=>{
    const node=app.$('status');
    if(!node)return;
    node.textContent=text;node.className=`status-pill ${type}`;node.style.opacity='1';
    clearTimeout(app.setStatus.timer);if(!sticky)app.setStatus.timer=setTimeout(()=>node.style.opacity='.76',5000);
  };
  app.setBootMessage=text=>{const node=app.$('boot-message');if(node)node.textContent=text};
  app.beginBoot=()=>{
    document.body.classList.add('booting');
    document.body.classList.remove('boot-ready');
    app.setBootMessage('Finding your location');
    clearTimeout(app.state.bootTimer);
    app.state.bootTimer=setTimeout(()=>{
      if(app.state.bootComplete)return;
      app.setBootMessage('Opening SoulFlame Navigation');
      app.finishBoot('fallback');
    },9000);
  };
  app.finishBoot=()=>{
    const s=app.state;if(s.bootComplete)return;
    s.bootComplete=true;clearTimeout(s.bootTimer);clearTimeout(s.bootRevealTimer);
    const screen=app.$('boot-screen');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      s.map?.invalidateSize?.({pan:false});
      document.body.classList.remove('booting');
      document.body.classList.add('boot-ready');
      if(!screen)return;
      screen.classList.add('is-leaving');
      s.bootRevealTimer=setTimeout(()=>{screen.hidden=true},460);
    }));
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
  app.userIcon=L.divIcon({className:'',html:'<div class="user-position-marker"><span>▲</span></div>',iconSize:[34,34],iconAnchor:[17,17]});
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
  app.updateSpeedometer=user=>{
    const root=app.$('speedometer'),value=app.$('speedometer-value');
    if(!root||!value)return;
    const speed=Math.max(0,Math.round(Number(user?.speed)||0));
    value.textContent=String(speed);
    root.classList.add('ready');
    root.setAttribute('aria-label',`Текуща скорост ${speed} километра в час`);
  };
  app.zoomForAccuracy=accuracy=>Number(accuracy)<=200?17:Number(accuracy)<=600?15:14;
  app.centerOnUser=(user,options={})=>{
    const s=app.state;if(!s.map)return;
    const zoom=app.zoomForAccuracy(user.accuracy);
    s.followUser=true;
    if(options.animate)s.map.flyTo([user.lat,user.lon],zoom,{animate:true,duration:.45});
    else s.map.setView([user.lat,user.lon],zoom,{animate:false});
  };
  app.applyUserPosition=(user,options={})=>{
    const s=app.state,previous=s.user;
    if(!app.inBulgaria(user.lat,user.lon))return false;
    const normalized={
      ...user,
      speed:Number.isFinite(user.speed)?Number(user.speed):Number(previous?.speed||0),
      heading:Number.isFinite(user.heading)?Number(user.heading):(Number.isFinite(previous?.heading)?Number(previous.heading):null)
    };
    if(Number.isFinite(normalized.heading))s.lastHeading=normalized.heading;
    s.user=normalized;
    s.lastPosition={lat:normalized.lat,lon:normalized.lon,accuracy:normalized.accuracy||null,timestamp:Date.now()};
    app.write(app.STORAGE.lastPosition,s.lastPosition);
    if(!s.userMarker)s.userMarker=L.marker([normalized.lat,normalized.lon],{icon:app.userIcon,zIndexOffset:2000,keyboard:false}).bindPopup('Твоето местоположение').addTo(s.map);else s.userMarker.setLatLng([normalized.lat,normalized.lon]);
    const markerNode=s.userMarker.getElement()?.querySelector('.user-position-marker');
    if(markerNode)markerNode.style.setProperty('--heading',`${s.lastHeading||0}deg`);
    if(s.accuracyCircle)s.accuracyCircle.setLatLng([normalized.lat,normalized.lon]).setRadius(Math.min(normalized.accuracy||0,2000));else s.accuracyCircle=L.circle([normalized.lat,normalized.lon],{radius:Math.min(normalized.accuracy||0,2000),color:'#2563eb',weight:1,fillOpacity:.08,interactive:false}).addTo(s.map);
    app.updateSpeedometer(normalized);
    const firstGpsFix=!s.initialGpsCentered;
    if(firstGpsFix||options.center===true){
      app.centerOnUser(normalized,{animate:!firstGpsFix&&options.animate!==false});
      s.initialGpsCentered=true;
      if(firstGpsFix&&!s.bootComplete){
        app.setBootMessage('Opening SoulFlame Navigation');
        clearTimeout(s.bootRevealTimer);
        s.bootRevealTimer=setTimeout(()=>app.finishBoot('gps'),360);
      }
    }
    app.onUserPosition?.(normalized,options);
    if(s.selected&&!s.navigationActive&&options.reason!=='watch')app.buildRoute?.(s.selected,false);
    return true;
  };
  app.locate=()=>{
    const s=app.state;if(s.locating)return;
    if(!navigator.geolocation){
      app.setStatus('GPS не се поддържа. Търсенето и картата остават активни.','error',true);
      app.finishBoot('unsupported');return;
    }
    s.locating=true;app.setBootMessage('Finding your location');app.setBusy?.('gps',true,'Определям местоположението…');
    navigator.geolocation.getCurrentPosition(position=>{
      s.locating=false;app.setBusy?.('gps',false);
      const user={lat:Number(position.coords.latitude),lon:Number(position.coords.longitude),accuracy:Number(position.coords.accuracy||0),speed:Number.isFinite(position.coords.speed)?Math.round(position.coords.speed*3.6):0,heading:Number.isFinite(position.coords.heading)?Number(position.coords.heading):null};
      if(!app.applyUserPosition(user,{center:true,animate:false,reason:'initial'})){
        app.setStatus('GPS позицията е извън България.','error',true);app.finishBoot('outside');return;
      }
      app.updateNavigationHud?.(user);
      app.setStatus(`GPS е намерен · точност ±${Math.round(user.accuracy)} м`,'success');
    },error=>{
      s.locating=false;app.setBusy?.('gps',false);
      app.setStatus(error.code===1?'GPS е отказан. Разреши го, за да виждаш автоматично обектите около теб.':'GPS временно не е достъпен.','error',true);
      app.setBootMessage('Opening SoulFlame Navigation');app.finishBoot('gps-error');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:5000});
  };
  app.initMap=()=>{
    if(typeof L==='undefined'){app.setStatus('Картата не можа да се зареди.','error',true);app.finishBoot('map-error');return false}
    const s=app.state,stored=s.lastPosition;
    const storedValid=stored&&app.inBulgaria(Number(stored.lat),Number(stored.lon))&&Date.now()-Number(stored.timestamp||0)<7*24*60*60*1000;
    const initialCenter=storedValid?[Number(stored.lat),Number(stored.lon)]:app.DEFAULT_CENTER;
    const initialZoom=storedValid?app.zoomForAccuracy(stored.accuracy):7;
    s.map=L.map('map',{zoomControl:true,minZoom:6}).setView(initialCenter,initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(s.map);
    s.parkingLayer=L.layerGroup().addTo(s.map);s.fuelLayer=L.layerGroup().addTo(s.map);s.routeLayer=L.layerGroup().addTo(s.map);s.proposalLayer=L.layerGroup().addTo(s.map);s.drawingLayer=L.layerGroup().addTo(s.map);
    const mapNode=app.$('map'),drawSurface=app.$('draw-surface');
    if(drawSurface&&drawSurface.parentElement!==mapNode)mapNode.appendChild(drawSurface);
    const isDuplicateDrawEvent=(x,y,now)=>Number.isFinite(s.lastDrawClientX)&&Number.isFinite(s.lastDrawClientY)&&now-s.lastDrawPointerAt<500&&Math.hypot(x-s.lastDrawClientX,y-s.lastDrawClientY)<12;
    const rememberDrawEvent=(x,y,now)=>{s.lastDrawPointerAt=now;s.lastDrawClientX=x;s.lastDrawClientY=y};
    const eventPoint=event=>{
      const touch=event.changedTouches?.[0]||event.touches?.[0];
      return {x:Number(touch?.clientX??event.clientX),y:Number(touch?.clientY??event.clientY)};
    };
    const appendDrawLatLng=latlng=>{
      if(!s.drawing||!latlng)return;
      const before=Array.isArray(s.drawPoints)?s.drawPoints.length:0;
      app.addDrawPoint?.(latlng);
      if(s.drawPoints.length!==before||before>=80||!app.inBulgaria(latlng.lat,latlng.lng))return;
      s.drawPoints.push([latlng.lat,latlng.lng]);
      app.renderDrawing?.();
      const finish=app.$('draw-finish'),help=app.$('draw-help');
      if(finish)finish.disabled=s.drawPoints.length<3;
      if(help)help.textContent=`Добавени точки: ${s.drawPoints.length}. ${s.drawPoints.length<3?'Нужни са поне 3.':'Можеш да завършиш.'}`;
    };
    const captureDrawEvent=event=>{
      if(!s.drawing)return;
      if(event.type==='pointerdown'&&event.pointerType==='mouse'&&event.button!==0)return;
      if(event.type==='click'&&event.button!==0)return;
      const rect=mapNode.getBoundingClientRect(),{x,y}=eventPoint(event),now=performance.now();
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<rect.left||x>rect.right||y<rect.top||y>rect.bottom||isDuplicateDrawEvent(x,y,now))return;
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
      rememberDrawEvent(x,y,now);
      appendDrawLatLng(s.map.containerPointToLatLng(L.point(x-rect.left,y-rect.top)));
    };
    mapNode.addEventListener('touchstart',captureDrawEvent,{capture:true,passive:false});
    if(drawSurface){
      drawSurface.addEventListener('pointerdown',captureDrawEvent,true);
      drawSurface.addEventListener('touchstart',captureDrawEvent,{capture:true,passive:false});
      drawSurface.addEventListener('click',captureDrawEvent,true);
    }
    return true;
  };
})();
