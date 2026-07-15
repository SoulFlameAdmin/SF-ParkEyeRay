(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const NEARBY_RADII=[1200,2500,5000];

  app.layerCenter=()=>s.user||{lat:s.map.getCenter().lat,lon:s.map.getCenter().lng};

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

  app.openMapMenu=()=>{
    const menu=app.$('map-menu'),button=app.$('menu-btn');
    menu.classList.add('open');menu.setAttribute('aria-hidden','false');button.setAttribute('aria-expanded','true');
  };
  app.closeMapMenu=()=>{
    const menu=app.$('map-menu'),button=app.$('menu-btn');
    menu.classList.remove('open');menu.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false');
  };
  app.toggleMapMenu=()=>app.$('map-menu').classList.contains('open')?app.closeMapMenu():app.openMapMenu();

  app.fetchNearbyFuel=async(center,radius,signal)=>{
    const params=new URLSearchParams({type:'fuel',lat:String(center.lat),lon:String(center.lon),radius:String(radius),limit:'100'});
    const response=await fetch(`/api/v2/nearby?${params}`,{signal});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data.places))throw new Error(data.error||'fuel_layer_failed');
    return data;
  };

  app.renderFuelStations=()=>{
    s.fuelLayer.clearLayers();
    s.fuelStations.forEach(station=>{
      const nav=`https://www.google.com/maps/dir/?api=1${s.user?`&origin=${s.user.lat},${s.user.lon}`:''}&destination=${station.point.lat},${station.point.lon}&travelmode=driving`;
      const details=[station.brand,station.openingHours,station.selfService?'Самообслужване':null].filter(Boolean).map(app.safe).join(' · ');
      const marker=L.marker([station.point.lat,station.point.lon],{icon:app.fuelIcon,title:station.name}).addTo(s.fuelLayer);
      marker.bindPopup(`<b>${app.safe(station.name)}</b><br>${details||'OSM бензиностанция'}<br>${app.formatDistance(station.distance)} от центъра на търсенето<br><a href="${nav}" target="_blank" rel="noopener">Навигация</a>`);
    });
    const count=app.$('fuel-layer-count');if(count)count.textContent=String(s.fuelStations.length);
  };

  app.loadFuelStations=async(center=app.layerCenter(),options={})=>{
    if(!s.layers.fuel||!app.inBulgaria(center.lat,center.lon)||!s.ui.online)return;
    const controller=app.newRequest('fuelLayer');
    try{
      const data=await app.fetchNearbyFuel(center,7000,controller.signal);
      if(controller.signal.aborted)return;
      s.fuelStations=data.places;s.fuelStations.forEach(item=>item.distance=Number(item.distance)||app.distance(center,item.point));
      app.renderFuelStations();
      if(options.announce!==false)app.setStatus(`Показани са ${s.fuelStations.length} бензиностанции около теб.`,'success');
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);s.fuelStations=[];s.fuelLayer.clearLayers();
      if(options.announce!==false)app.setStatus('Бензиностанциите временно не се заредиха.','error');
    }finally{
      if(s.requests.fuelLayer===controller)delete s.requests.fuelLayer;
    }
  };

  app.loadNearbyParkings=async(center=app.layerCenter(),options={})=>{
    if(!s.layers.parking||!app.inBulgaria(center.lat,center.lon)||!s.ui.online)return;
    if(s.destination&&s.parkingContext==='destination'&&!options.force)return;
    const controller=app.newRequest('nearbyParking');
    s.parkingContext='nearby';s.parkingOrigin={lat:center.lat,lon:center.lon};s.selected=null;
    app.$('sheet-eyebrow').textContent=s.user?'Около теб':'Около картата';
    app.$('sheet-title').textContent='Паркинги наблизо';
    app.$('sheet-subtitle').textContent='Зареждам автоматично паркингите в района…';
    app.$('parking-sheet').classList.remove('layer-disabled');
    try{
      let payload={parkings:[],meta:{}},usedRadius=NEARBY_RADII.at(-1);
      for(const radius of NEARBY_RADII){
        payload=await app.fetchParkingEngine(center,radius,controller.signal);usedRadius=radius;
        if(controller.signal.aborted)return;
        if(payload.parkings.length>=8||radius===NEARBY_RADII.at(-1))break;
      }
      s.parkings=payload.parkings.map(record=>app.engineParking(record,center)).filter(Boolean);
      app.sortParkings();app.renderParkingMarkers();app.renderParkings();
      app.$('parking-count').textContent=String(s.parkings.length);
      const origin=payload.meta?.dataSource==='postgis'?'SmartCity база':'OSM fallback';
      app.$('sheet-subtitle').textContent=`${s.parkings.length} в ${app.formatDistance(usedRadius)} · ${origin} · без live свободни места`;
      const count=app.$('parking-layer-count');if(count)count.textContent=String(s.parkings.length);
      if(options.announce!==false)app.setStatus(`Автоматично показвам ${s.parkings.length} паркинга в района.`,'success');
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);s.parkings=[];s.parkingLayer.clearLayers();app.$('parking-count').textContent='0';
      if(options.announce!==false)app.setStatus('Паркингите в района временно не се заредиха.','error');
    }finally{
      if(s.requests.nearbyParking===controller)delete s.requests.nearbyParking;
    }
  };

  app.refreshMapLayers=(center=app.layerCenter(),options={})=>{
    if(!app.inBulgaria(center.lat,center.lon))return;
    const moved=!s.lastLayerCenter||app.distance(center,s.lastLayerCenter)>=Number(options.minimumMove||280);
    if(!moved&&!options.force)return;
    s.lastLayerCenter={lat:center.lat,lon:center.lon};
    if(s.layers.parking)app.loadNearbyParkings(center,{announce:options.announce,force:options.force});
    if(s.layers.fuel)app.loadFuelStations(center,{announce:options.announce});
  };

  app.setLayer=(name,enabled,options={})=>{
    if(!Object.hasOwn(s.layers,name))return;
    s.layers[name]=Boolean(enabled);app.write(app.STORAGE.layers,s.layers);app.syncLayerControls();
    if(name==='parking'){
      if(!s.layers.parking){app.abortRequest('nearbyParking');s.parkingLayer.clearLayers();app.$('parking-sheet').classList.add('layer-disabled');app.setStatus('Слоят „Паркинги“ е изключен.','info')}
      else if(s.destination){s.parkingContext='destination';app.findParkings()}
      else app.loadNearbyParkings(app.layerCenter(),{announce:true,force:true});
    }
    if(name==='fuel'){
      if(!s.layers.fuel){app.abortRequest('fuelLayer');s.fuelStations=[];s.fuelLayer.clearLayers();const count=app.$('fuel-layer-count');if(count)count.textContent='0';app.setStatus('Слоят „Бензиностанции“ е изключен.','info')}
      else app.loadFuelStations(app.layerCenter(),{announce:true});
    }
    if(options.closeMenu!==false)app.closeMapMenu();
  };
  app.toggleLayer=name=>app.setLayer(name,!s.layers[name]);

  app.onUserPosition=(user,options={})=>{
    if(!s.locationWatchId)app.startLocationWatch();
    if(s.followUser||options.center===true)app.refreshMapLayers(user,{announce:false,minimumMove:220});
  };

  app.startLocationWatch=()=>{
    if(s.locationWatchId!=null||!navigator.geolocation)return;
    s.locationWatchId=navigator.geolocation.watchPosition(position=>{
      const user={lat:Number(position.coords.latitude),lon:Number(position.coords.longitude),accuracy:Number(position.coords.accuracy||0)};
      app.applyUserPosition(user,{center:false,reason:'watch'});
    },()=>{}, {enableHighAccuracy:false,timeout:25000,maximumAge:20000});
  };

  app.initLayers=()=>{
    app.syncLayerControls();app.setSheetCollapsed(true);
    app.$('menu-btn').addEventListener('click',app.toggleMapMenu);
    app.$('parking-layer-btn').addEventListener('click',()=>app.toggleLayer('parking'));
    app.$('fuel-layer-btn').addEventListener('click',()=>app.toggleLayer('fuel'));
    s.map.on('dragstart',()=>{s.followUser=false});
    s.map.on('moveend',()=>{
      if(s.drawing||s.destination||s.map.getZoom()<13)return;
      clearTimeout(s.layerTimer);s.layerTimer=setTimeout(()=>{
        const center={lat:s.map.getCenter().lat,lon:s.map.getCenter().lng};
        app.refreshMapLayers(center,{announce:false,minimumMove:450});
      },450);
    });
    document.addEventListener('click',event=>{
      if(!event.target.closest('#map-menu')&&!event.target.closest('#menu-btn'))app.closeMapMenu();
    });
    window.setTimeout(()=>{
      if(!s.user&&s.map.getZoom()>=13)app.refreshMapLayers(app.layerCenter(),{announce:false,force:true});
    },3500);
  };
})();
