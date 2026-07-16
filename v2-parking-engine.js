(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.parkingSourceText=item=>{
    if(item?.source==='soulflame'&&item?.verificationStatus==='approved')return'SoulFlame одобрен';
    if(item?.source==='municipality')return'Общински източник';
    if(item?.source==='operator')return'Операторски източник';
    if(item?.dataOrigin==='postgis')return'OSM SmartCity база';
    return'OSM временен fallback';
  };

  app.parkingSourceLabel=item=>`${app.parkingSourceText(item)} · без live свободни места`;

  app.engineParking=(record,origin=s.destination||s.parkingOrigin||s.user)=>{
    const point={lat:Number(record?.point?.lat),lon:Number(record?.point?.lon)};
    if(!app.inBulgaria(point.lat,point.lon))return null;
    const entranceLat=Number(record?.entrance?.lat),entranceLon=Number(record?.entrance?.lon);
    const entrance=app.inBulgaria(entranceLat,entranceLon)?{lat:entranceLat,lon:entranceLon}:point;
    const straight=Number.isFinite(Number(record.distance))?Number(record.distance):(origin?app.distance(point,origin):0);
    const covered=record.covered===true;
    const fee=String(record.fee||'').toLowerCase();
    const free=['no','free','0','безплатно'].includes(fee);
    const capacity=record.capacity==null?null:Number(record.capacity);
    const lit=record.lit===true,surveillance=record.surveillance===true;
    const verified=record.source==='soulflame'&&record.verificationStatus==='approved';
    const walk=Math.round(straight*1.18),drive=Math.round(straight*1.38);
    const score=Math.max(1,Math.min(99,Math.round(100-walk/70+(covered?5:0)+(free?6:0)+(lit?3:0)+(surveillance?4:0)+(verified?8:0))));
    return{
      id:String(record.id||`${record.source}:${record.externalId}`),
      point,entrance,tags:record.tags||{},name:record.name||app.parkingKind({parking:record.kind}),
      kind:String(record.kind||'parking').replaceAll('_',' '),straight,walk,drive,covered,free,capacity,lit,surveillance,score,
      route:null,walkRoute:null,source:record.source||'osm',verificationStatus:record.verificationStatus||'mapped',
      dataOrigin:record.dataOrigin||'postgis',sourceUpdatedAt:record.sourceUpdatedAt||null,sourceRevision:record.sourceRevision||null,
      sourceRefs:Array.isArray(record.sourceRefs)?record.sourceRefs:[],access:record.access||null,fee:record.fee||null,
      hasMappedEntrance:app.distance(point,entrance)>2
    };
  };

  app.fetchParkingEngine=async(center,radius,signal)=>{
    const params=new URLSearchParams({lat:String(center.lat),lon:String(center.lon),radius:String(radius),limit:'150'});
    const response=await fetch(`/api/v2/parkings?${params}`,{signal});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data.parkings))throw new Error(data.error||'parking_engine_failed');
    return data;
  };

  app.findParkings=async()=>{
    if(!s.destination)return app.loadNearbyParkings?.(app.layerCenter?.()||s.user||{lat:s.map.getCenter().lat,lon:s.map.getCenter().lng},{announce:true,force:true});
    if(!s.ui.online){
      app.setRetry(app.findParkings,'Зареди паркингите');
      return app.renderParkingMessage('⌁','Няма интернет','Свържи се с интернет и зареди паркингите отново.',{kind:'error',actionLabel:'Опитай отново',onAction:app.findParkings});
    }

    s.layers.parking=true;app.write(app.STORAGE.layers,s.layers);app.syncLayerControls?.();s.parkingContext='destination';s.parkingOrigin={lat:s.destination.lat,lon:s.destination.lon};
    app.$('parking-sheet').classList.remove('layer-disabled');
    const controller=app.newRequest('parking');
    s.selected=null;s.parkings=[];s.entrances=[];s.parkingLayer.clearLayers();s.routeLayer.clearLayers();app.$('route-card').classList.remove('active');
    app.setBusy('parking',true,'Търся паркинги в SmartCity базата…');
    app.renderParkingMessage('⏳','Търся паркинги','Радиусът се разширява автоматично от 500 м до 5 км.',{kind:'loading'});
    app.setRetry(null);

    try{
      let payload={parkings:[],meta:{}},usedRadius=app.RADII.at(-1);
      for(const radius of app.RADII){
        if(controller.signal.aborted)return;
        app.setStatus(`Търся паркинги в ${app.formatDistance(radius)} около дестинацията…`,'info',true);
        payload=await app.fetchParkingEngine(s.destination,radius,controller.signal);usedRadius=radius;
        if(payload.parkings.length>=5||radius===app.RADII.at(-1))break;
      }
      if(controller.signal.aborted)return;
      s.parkings=payload.parkings.map(record=>app.engineParking(record,s.destination)).filter(Boolean);app.sortParkings();app.renderParkingMarkers();app.renderParkings();
      app.$('parking-count').textContent=s.parkings.length;
      const origin=payload.meta?.dataSource==='postgis'?'SmartCity PostGIS база':'OSM fallback';
      app.$('sheet-subtitle').textContent=`${s.parkings.length} резултата в ${app.formatDistance(usedRadius)} · ${origin} · без live свободни места`;
      const count=app.$('parking-layer-count');if(count)count.textContent=String(s.parkings.length);
      if(s.parkings.length){
        const fallback=payload.meta?.fallbackUsed?' Използван е временен OSM fallback.':'';
        app.setStatus(`Намерени са ${s.parkings.length} паркинга.${fallback}`,'success');
      }else{
        app.renderParkingMessage('＋','Няма картографирани паркинги','Базата и OSM fallback не съдържат паркинг в радиус 5 км.',{actionLabel:'Предложи зона',onAction:app.beginDraw});
        app.setStatus('Няма намерени паркинги в радиус 5 км. Можеш да предложиш реална зона.','error',true);
      }
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);s.parkings=[];app.$('parking-count').textContent='0';
      app.renderParkingMessage('↻','Паркингите не се заредиха','SmartCity базата и временният OSM fallback не отговориха.',{kind:'error',actionLabel:'Опитай отново',onAction:app.findParkings});
      app.setRetry(app.findParkings,'Зареди паркингите');
      app.setStatus('Паркинг данните временно не са достъпни.','error',true);
    }finally{
      if(s.requests.parking===controller)delete s.requests.parking;
      app.setBusy('parking',false);
    }
  };

  app.renderParkingMarkers=()=>{
    s.parkingLayer.clearLayers();
    s.parkings.forEach(item=>{
      const marker=L.marker([item.point.lat,item.point.lon],{icon:app.parkingIcon(s.selected?.id===item.id),title:item.name}).addTo(s.parkingLayer);
      const distanceLabel=s.parkingContext==='destination'?`${app.formatDistance(item.walk)} до дестинацията`:`${app.formatDistance(item.straight)} от теб/картата`;
      marker.bindPopup(`<b>${app.safe(item.name)}</b><br>${app.safe(item.kind)}<br>${distanceLabel}<br><small>${app.safe(app.parkingSourceLabel(item))}</small>`);
      marker.addEventListener('click',()=>app.selectParking(item.id));
    });
  };

  app.renderParkings=()=>{
    const root=app.$('parking-list');root.innerHTML='';
    if(!s.parkings.length){
      const nearby=s.parkingContext!=='destination';
      app.renderParkingMessage('🅿️','Няма налични резултати',nearby?'В този видим район още няма импортирани или OSM картографирани паркинги.':'SmartCity базата може още да няма импортирани всички физически и улични паркинги.',{actionLabel:nearby?'Обнови':s.destination?'Обнови':'Търси място',onAction:nearby?()=>app.loadViewportParkings?.({announce:true,force:true}):s.destination?app.findParkings:()=>app.$('search-input').focus()});
      return;
    }
    const nearby=s.parkingContext!=='destination';
    s.parkings.forEach((item,index)=>{
      const saved=s.saved.some(savedItem=>savedItem.id===item.id),card=document.createElement('article');
      card.className=`parking-card${s.selected?.id===item.id?' active':''}`;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Избери ${item.name}`);
      const tags=[item.verificationStatus==='approved'?'Одобрен':null,item.covered?'Закрит':null,item.free?'Безплатен':null,item.capacity?`${item.capacity} места`:null,item.lit?'Осветен':null,item.surveillance?'Наблюдение':null,item.hasMappedEntrance?'Вход за автомобил':null].filter(Boolean);
      const firstValue=nearby?app.formatDistance(item.straight):app.formatDistance(item.drive);
      const firstLabel=nearby?'от центъра на екрана':'прогнозно с кола';
      const secondValue=nearby?(item.capacity?`${item.capacity}`:'—'):app.formatDistance(item.walk);
      const secondLabel=nearby?'известен капацитет':'пеша до обекта';
      card.innerHTML=`<div class="parking-top"><div><div class="parking-title">${index+1}. ${app.safe(item.name)}</div><div class="parking-source">${app.safe(item.kind)} · ${app.safe(app.parkingSourceLabel(item))}</div></div><div class="parking-score">${item.score}</div></div><div class="parking-metrics"><div><b>${firstValue}</b><span>${firstLabel}</span></div><div><b>${secondValue}</b><span>${secondLabel}</span></div><div><b>${item.free?'Безплатен':'Няма цена'}</b><span>източник на данни</span></div></div><div class="parking-tags">${tags.length?tags.map(tag=>`<span class="parking-tag">${app.safe(tag)}</span>`).join(''):'<span class="parking-tag">Ограничени данни</span>'}</div><div class="parking-actions"><button data-route="${item.id}" type="button">Маршрут</button><button data-save="${item.id}" type="button">${saved?'Запазено ★':'Запази ☆'}</button></div>`;
      const choose=event=>{if(!event.target.closest('button'))app.selectParking(item.id)};
      card.addEventListener('click',choose);card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();app.selectParking(item.id)}});root.appendChild(card);
    });
    root.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>app.selectParking(button.dataset.route)));
    root.querySelectorAll('[data-save]').forEach(button=>button.addEventListener('click',()=>app.toggleSaved(button.dataset.save)));
  };
})();