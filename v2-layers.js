(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const NEARBY_RADII=[1200,2500,5000];
  const FUEL_RADII=[3000,7000,12000];
  const FUEL_MIN_RESULTS=8;
  const FUEL_REFRESH_DISTANCE=500;
  const AUTO_FUEL_MIGRATION_KEY='sf_v2_auto_fuel_v2';

  app.layerCenter=()=>s.user||{lat:s.map.getCenter().lat,lon:s.map.getCenter().lng};
  app.fuelCenter=()=>s.user||app.layerCenter();
  app.viewportParkingQuery=()=>{
    const bounds=s.map.getBounds(),center=s.map.getCenter();
    const corners=[bounds.getNorthWest(),bounds.getNorthEast(),bounds.getSouthWest(),bounds.getSouthEast()];
    const origin={lat:center.lat,lon:center.lng};
    const radius=Math.min(5000,Math.max(350,Math.ceil(Math.max(...corners.map(point=>app.distance(origin,{lat:point.lat,lon:point.lng})))*1.08)));
    return{bounds,center:origin,radius};
  };

  app.syncLayerControls=()=>{
    const parkingButton=app.$('parking-layer-btn'),fuelButton=app.$('fuel-layer-btn');
    if(parkingButton){
      parkingButton.classList.toggle('enabled',s.layers.parking);
      parkingButton.setAttribute('aria-pressed',String(s.layers.parking));
      parkingButton.querySelector('.switch')?.classList.toggle('on',s.layers.parking);
    }
    if(fuelButton){
      fuelButton.classList.toggle('enabled',s.layers.fuel);
      fuelButton.setAttribute('aria-pressed',String(s.layers.fuel));
      fuelButton.querySelector('.switch')?.classList.toggle('on',s.layers.fuel);
    }
    app.$('parking-sheet')?.classList.toggle('layer-disabled',!s.layers.parking);
  };

  app.openMapMenu=()=>{const menu=app.$('map-menu'),button=app.$('menu-btn');menu.classList.add('open');menu.setAttribute('aria-hidden','false');button.setAttribute('aria-expanded','true')};
  app.closeMapMenu=()=>{const menu=app.$('map-menu'),button=app.$('menu-btn');menu.classList.remove('open');menu.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false')};
  app.toggleMapMenu=()=>app.$('map-menu').classList.contains('open')?app.closeMapMenu():app.openMapMenu();

  app.fetchNearbyFuel=async(center,radius,signal)=>{
    const params=new URLSearchParams({type:'fuel',lat:String(center.lat),lon:String(center.lon),radius:String(radius),limit:'120'});
    const response=await fetch(`/api/v2/nearby?${params}`,{signal});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data.places))throw new Error(data.error||'fuel_layer_failed');
    return data;
  };

  const genericFuelName=value=>{
    const name=String(value||'').trim().toLowerCase();
    return !name||name==='бензиностанция'||name==='fuel'||name==='gas station';
  };

  app.dedupeFuelStations=(stations,center)=>{
    const result=[];
    const score=station=>(station.brand?4:0)+(station.openingHours?2:0)+(station.phone?1:0)+(station.website?1:0)+(genericFuelName(station.name)?0:3);
    [...stations].sort((a,b)=>(Number(a.distance)||app.distance(center,a.point))-(Number(b.distance)||app.distance(center,b.point))).forEach(station=>{
      if(!station?.point||!Number.isFinite(Number(station.point.lat))||!Number.isFinite(Number(station.point.lon)))return;
      station.distance=Number(station.distance)||app.distance(center,station.point);
      const normalizedName=String(station.name||'').trim().toLowerCase();
      const duplicateIndex=result.findIndex(existing=>{
        const close=app.distance(existing.point,station.point)<=35;
        if(!close)return false;
        const existingName=String(existing.name||'').trim().toLowerCase();
        return normalizedName===existingName||genericFuelName(normalizedName)||genericFuelName(existingName);
      });
      if(duplicateIndex<0){result.push(station);return}
      if(score(station)>score(result[duplicateIndex]))result[duplicateIndex]=station;
    });
    return result.sort((a,b)=>a.distance-b.distance);
  };

  app.renderFuelStations=()=>{
    s.fuelLayer.clearLayers();
    s.fuelStations.forEach(station=>{
      const nav=`https://www.google.com/maps/dir/?api=1${s.user?`&origin=${s.user.lat},${s.user.lon}`:''}&destination=${station.point.lat},${station.point.lon}&travelmode=driving`;
      const details=[station.brand,station.openingHours,station.selfService?'Самообслужване':null].filter(Boolean).map(app.safe).join(' · ');
      const marker=L.marker([station.point.lat,station.point.lon],{icon:app.fuelIcon,title:station.name,zIndexOffset:500}).addTo(s.fuelLayer);
      marker.bindPopup(`<b>${app.safe(station.name)}</b><br>${details||'OpenStreetMap бензиностанция'}<br>${app.formatDistance(station.distance)} от ${s.user?'теб':'центъра на картата'}<br><a href="${nav}" target="_blank" rel="noopener">Навигация</a>`);
    });
    const count=app.$('fuel-layer-count');if(count)count.textContent=String(s.fuelStations.length);
  };

  app.loadFuelStations=async(center=app.fuelCenter(),options={})=>{
    if(!s.layers.fuel||!app.inBulgaria(center.lat,center.lon)||!s.ui?.online)return;
    const controller=app.newRequest('fuelLayer');
    try{
      let data={places:[],meta:{}},usedRadius=FUEL_RADII.at(-1);
      for(const radius of FUEL_RADII){
        data=await app.fetchNearbyFuel(center,radius,controller.signal);
        usedRadius=radius;
        if(controller.signal.aborted)return;
        if(data.places.length>=FUEL_MIN_RESULTS||radius===FUEL_RADII.at(-1))break;
      }
      if(controller.signal.aborted)return;
      s.lastFuelCenter={lat:Number(center.lat),lon:Number(center.lon)};
      s.fuelStations=app.dedupeFuelStations(data.places,center);
      app.renderFuelStations();
      if(options.announce!==false){
        const area=s.user?'около теб':'около картата';
        app.setStatus(`Показвам ${s.fuelStations.length} бензиностанции ${area} · до ${app.formatDistance(usedRadius)}.`,'success');
      }
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);
      if(!s.fuelStations.length)s.fuelLayer.clearLayers();
      if(options.announce!==false)app.setStatus('Бензиностанциите временно не се заредиха. Картата остава активна.','error');
    }finally{if(s.requests.fuelLayer===controller)delete s.requests.fuelLayer}
  };

  app.loadViewportParkings=async(options={})=>{
    if(!s.layers.parking||!s.ui.online||s.map.getZoom()<13)return;
    if(s.destination&&s.parkingContext==='destination'&&!options.overrideDestination)return;
    const query=app.viewportParkingQuery();
    if(!app.inBulgaria(query.center.lat,query.center.lon))return;
    const controller=app.newRequest('nearbyParking');
    s.parkingContext='viewport';s.parkingOrigin=query.center;
    if(!options.keepSelection)s.selected=null;
    app.$('sheet-eyebrow').textContent='Видим екран';
    app.$('sheet-title').textContent='Паркинги на картата';
    app.$('sheet-subtitle').textContent='Обновявам картографираните паркинги в текущия екран…';
    app.$('parking-sheet').classList.remove('layer-disabled');
    try{
      const payload=await app.fetchParkingEngine(query.center,query.radius,controller.signal);
      if(controller.signal.aborted)return;
      if(s.destination&&s.parkingContext==='destination'&&!options.overrideDestination)return;
      const bufferedBounds=query.bounds.pad(.35);
      const visible=payload.parkings.filter(record=>bufferedBounds.contains([Number(record?.point?.lat),Number(record?.point?.lon)]));
      s.parkings=visible.map(record=>app.engineParking(record,query.center)).filter(Boolean);
      app.sortParkings();app.renderParkingMarkers();app.renderParkings();
      app.$('parking-count').textContent=String(s.parkings.length);
      const origin=payload.meta?.dataSource==='postgis'?'SmartCity база':'OSM fallback';
      app.$('sheet-subtitle').textContent=`${s.parkings.length} в текущия екран и близкия буфер · ${origin} · без live свободни места`;
      const count=app.$('parking-layer-count');if(count)count.textContent=String(s.parkings.length);
      if(options.announce!==false)app.setStatus(`Показвам ${s.parkings.length} картографирани паркинга в текущия екран.`,'success');
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);s.parkings=[];s.parkingLayer.clearLayers();app.$('parking-count').textContent='0';
      if(options.announce!==false)app.setStatus('Паркингите в текущия екран временно не се заредиха.','error');
    }finally{if(s.requests.nearbyParking===controller)delete s.requests.nearbyParking}
  };

  app.loadNearbyParkings=async(center=app.layerCenter(),options={})=>{
    if(options.viewport!==false&&s.map.getZoom()>=13)return app.loadViewportParkings(options);
    if(!s.layers.parking||!app.inBulgaria(center.lat,center.lon)||!s.ui.online)return;
    const controller=app.newRequest('nearbyParking');
    s.parkingContext='nearby';s.parkingOrigin={lat:center.lat,lon:center.lon};s.selected=null;
    app.$('sheet-eyebrow').textContent=s.user?'Около теб':'Около картата';app.$('sheet-title').textContent='Паркинги наблизо';app.$('sheet-subtitle').textContent='Зареждам автоматично паркингите в района…';app.$('parking-sheet').classList.remove('layer-disabled');
    try{
      let payload={parkings:[],meta:{}},usedRadius=NEARBY_RADII.at(-1);
      for(const radius of NEARBY_RADII){payload=await app.fetchParkingEngine(center,radius,controller.signal);usedRadius=radius;if(controller.signal.aborted)return;if(payload.parkings.length>=8||radius===NEARBY_RADII.at(-1))break}
      s.parkings=payload.parkings.map(record=>app.engineParking(record,center)).filter(Boolean);app.sortParkings();app.renderParkingMarkers();app.renderParkings();
      app.$('parking-count').textContent=String(s.parkings.length);
      const origin=payload.meta?.dataSource==='postgis'?'SmartCity база':'OSM fallback';
      app.$('sheet-subtitle').textContent=`${s.parkings.length} в ${app.formatDistance(usedRadius)} · ${origin} · без live свободни места`;
      const count=app.$('parking-layer-count');if(count)count.textContent=String(s.parkings.length);
      if(options.announce!==false)app.setStatus(`Автоматично показвам ${s.parkings.length} паркинга в района.`,'success');
    }catch(error){if(error.name==='AbortError')return;console.error(error);s.parkings=[];s.parkingLayer.clearLayers();app.$('parking-count').textContent='0';if(options.announce!==false)app.setStatus('Паркингите в района временно не се заредиха.','error')}
    finally{if(s.requests.nearbyParking===controller)delete s.requests.nearbyParking}
  };

  app.refreshMapLayers=(center=app.layerCenter(),options={})=>{
    if(!app.inBulgaria(center.lat,center.lon))return;
    if(s.layers.parking&&s.map.getZoom()>=13&&!(s.destination&&s.parkingContext==='destination'))app.loadViewportParkings({announce:options.announce,force:options.force,keepSelection:options.keepSelection});
    if(s.layers.fuel){
      const fuelCenter=s.user||center;
      const moved=!s.lastFuelCenter||app.distance(fuelCenter,s.lastFuelCenter)>=Number(options.minimumMove||FUEL_REFRESH_DISTANCE);
      if(moved||options.force)app.loadFuelStations(fuelCenter,{announce:options.announce});
    }
  };

  app.setLayer=(name,enabled,options={})=>{
    if(!Object.hasOwn(s.layers,name))return;
    s.layers[name]=Boolean(enabled);app.write(app.STORAGE.layers,s.layers);app.syncLayerControls();
    if(name==='parking'){
      if(!s.layers.parking){app.abortRequest('nearbyParking');s.parkingLayer.clearLayers();app.$('parking-sheet').classList.add('layer-disabled');app.setStatus('Слоят „Паркинги“ е изключен.','info')}
      else if(s.destination&&s.parkingContext==='destination')app.findParkings?.();
      else app.loadViewportParkings({announce:true,force:true});
    }
    if(name==='fuel'){
      if(!s.layers.fuel){app.abortRequest('fuelLayer');clearTimeout(s.fuelTimer);s.fuelStations=[];s.lastFuelCenter=null;s.fuelLayer.clearLayers();const count=app.$('fuel-layer-count');if(count)count.textContent='0';app.setStatus('Слоят „Бензиностанции“ е изключен.','info')}
      else app.loadFuelStations(app.fuelCenter(),{announce:true});
    }
    if(options.closeMenu!==false)app.closeMapMenu();
  };
  app.toggleLayer=name=>app.setLayer(name,!s.layers[name]);

  app.onUserPosition=(user,options={})=>{
    if(!s.locationWatchId)app.startLocationWatch();
    if((s.followUser||options.center===true)&&s.layers.parking&&s.map.getZoom()>=13&&!(s.destination&&s.parkingContext==='destination')){
      clearTimeout(s.layerTimer);s.layerTimer=setTimeout(()=>app.loadViewportParkings({announce:false,keepSelection:true}),300);
    }
    if(s.layers.fuel){
      const moved=!s.lastFuelCenter||app.distance(user,s.lastFuelCenter)>=FUEL_REFRESH_DISTANCE;
      if(moved||options.reason==='initial'||options.center===true){
        clearTimeout(s.fuelTimer);
        s.fuelTimer=setTimeout(()=>app.loadFuelStations(user,{announce:options.reason==='initial'}),220);
      }
    }
  };

  app.startLocationWatch=()=>{
    if(s.locationWatchId!=null||!navigator.geolocation)return;
    s.locationWatchId=navigator.geolocation.watchPosition(position=>{
      const user={
        lat:Number(position.coords.latitude),
        lon:Number(position.coords.longitude),
        accuracy:Number(position.coords.accuracy||0),
        speed:Number.isFinite(position.coords.speed)?Math.round(position.coords.speed*3.6):Number(s.user?.speed||0),
        heading:Number.isFinite(position.coords.heading)?Number(position.coords.heading):s.user?.heading
      };
      app.applyUserPosition(user,{center:false,reason:'watch'});
    },()=>{}, {enableHighAccuracy:true,timeout:25000,maximumAge:10000});
  };

  app.initLayers=()=>{
    try{
      if(localStorage.getItem(AUTO_FUEL_MIGRATION_KEY)!=='1'){
        s.layers.fuel=true;
        app.write(app.STORAGE.layers,s.layers);
        localStorage.setItem(AUTO_FUEL_MIGRATION_KEY,'1');
      }
    }catch{}
    app.syncLayerControls();app.setSheetCollapsed(true);
    app.$('menu-btn').addEventListener('click',app.toggleMapMenu);
    app.$('parking-layer-btn').addEventListener('click',()=>app.toggleLayer('parking'));
    app.$('fuel-layer-btn').addEventListener('click',()=>app.toggleLayer('fuel'));
    s.map.on('dragstart',()=>{s.followUser=false});
    s.map.on('moveend zoomend',()=>{
      if(!s.user&&s.layers.fuel){
        clearTimeout(s.fuelTimer);
        s.fuelTimer=setTimeout(()=>app.loadFuelStations(app.layerCenter(),{announce:false}),420);
      }
      if(s.drawing||s.map.getZoom()<13||!s.layers.parking||s.destination&&s.parkingContext==='destination')return;
      clearTimeout(s.layerTimer);s.layerTimer=setTimeout(()=>app.loadViewportParkings({announce:false,keepSelection:true}),260);
    });
    document.addEventListener('click',event=>{if(!event.target.closest('#map-menu')&&!event.target.closest('#menu-btn'))app.closeMapMenu()});
    window.setTimeout(()=>{
      if(s.layers.parking&&s.map.getZoom()>=13&&!(s.destination&&s.parkingContext==='destination'))app.loadViewportParkings({announce:false,force:true});
      if(s.layers.fuel&&!s.user)app.loadFuelStations(app.layerCenter(),{announce:false});
    },1800);
  };
})();