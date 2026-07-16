(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.search=async(query,options={})=>{
    const text=String(query||'').trim();
    const autoSelect=options.autoSelect!==false,silent=options.silent===true;
    if(text.length<2){if(!silent)app.setStatus('Напиши поне 2 знака за търсене.','error');return}
    if(!s.ui.online){
      if(!silent){app.setRetry(()=>app.search(text),'Повтори търсенето');app.setStatus('Няма интернет връзка.','error',true)}
      return;
    }

    const version=++s.searchVersion;
    const bias=s.user||s.destination||{lat:s.map.getCenter().lat,lon:s.map.getCenter().lng};
    const controller=app.newRequest('search');
    if(!silent){app.setBusy('search',true,`Търся „${text}“…`);app.setRetry(null)}

    try{
      const params=new URLSearchParams({q:text,lat:String(bias.lat),lon:String(bias.lon)});
      const response=await fetch(`/api/geocode?${params}`,{signal:controller.signal});
      const data=await response.json();
      if(version!==s.searchVersion||controller.signal.aborted)return;
      if(!response.ok||!Array.isArray(data.results)||!data.results.length)throw new Error('not-found');
      const ranked=app.renderSearchResults(data.results,data.normalizedQuery||text)||data.results;
      if(autoSelect&&ranked.length===1)app.selectDestination(ranked[0]);
      else if(!silent)app.setStatus(`Намерени са ${ranked.length} възможни места. Избери правилното.`,'success');
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);
      if(!silent){
        app.setRetry(()=>app.search(text),'Повтори търсенето');
        app.setStatus('Не намерих мястото или услугата не отговори. Добави град и опитай отново.','error',true);
      }
    }finally{
      if(s.requests.search===controller)delete s.requests.search;
      if(!silent)app.setBusy('search',false);
    }
  };

  app.renderSearchResults=results=>{
    const root=app.$('search-results');root.innerHTML='';
    results.slice(0,7).forEach((item,index)=>{
      const button=document.createElement('button');button.type='button';button.className='search-result';button.setAttribute('role','option');
      button.innerHTML=`<b>${app.safe(item.name)}</b><span>${index===0?'Най-вероятен резултат':'Алтернативен резултат'}</span>`;
      button.addEventListener('click',()=>{root.classList.remove('active');app.selectDestination(item)});root.appendChild(button);
    });
    root.classList.toggle('active',results.length>1);
    return results;
  };

  app.selectDestination=item=>{
    const lat=Number(item.lat),lon=Number(item.lon);
    if(!app.inBulgaria(lat,lon))return app.setStatus('Дестинацията е извън България.','error');
    app.abortRequest('search');app.abortRequest('parking');app.abortRequest('route');app.clearRoute?.();
    s.destination={lat,lon,name:item.name||'Дестинация',type:item.type||'',source:item.source||''};s.selected=null;
    app.$('search-input').value=s.destination.name;app.$('search-results').classList.remove('active');
    if(!s.destinationMarker)s.destinationMarker=L.marker([lat,lon],{icon:app.destinationIcon,zIndexOffset:1800}).addTo(s.map);else s.destinationMarker.setLatLng([lat,lon]);
    s.destinationMarker.bindPopup(`<b>${app.safe(s.destination.name)}</b>`).openPopup();
    app.$('sheet-eyebrow').textContent='Дестинация';app.$('sheet-title').textContent=s.destination.name;app.$('sheet-subtitle').textContent='Търся паркинги около крайната точка…';app.$('parking-count').textContent='0';
    app.setActiveAction('parkings');app.setSheetCollapsed(false);s.map.setView([lat,lon],16);app.findParkings();
  };

  app.parkingQuery=radius=>{
    const d=s.destination;
    return`[out:json][timeout:28];(nwr(around:${radius},${d.lat},${d.lon})["amenity"="parking"];nwr(around:${radius},${d.lat},${d.lon})["amenity"="parking_space"];node(around:${radius},${d.lat},${d.lon})["amenity"="parking_entrance"];way(around:${radius},${d.lat},${d.lon})[~"^parking:(left|right|both)$"~".+"];);out center tags geom;`;
  };

  app.overpass=async(query,signal)=>{
    const response=await fetch('/api/overpass',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({data:query}),signal
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Overpass error');
    return Array.isArray(data.elements)?data.elements:[];
  };

  app.findParkings=async()=>{
    if(!s.destination)return app.renderParkingMessage('⌕','Избери дестинация','Паркингите се търсят около крайната точка.',{actionLabel:'Търси място',onAction:()=>app.$('search-input').focus()});
    if(!s.ui.online){
      app.setRetry(app.findParkings,'Зареди паркингите');
      return app.renderParkingMessage('⌁','Няма интернет','Свържи се с интернет и зареди паркингите отново.',{kind:'error',actionLabel:'Опитай отново',onAction:app.findParkings});
    }

    const controller=app.newRequest('parking');
    s.selected=null;s.parkings=[];s.entrances=[];s.parkingLayer.clearLayers();s.routeLayer.clearLayers();app.$('route-card').classList.remove('active');
    app.setBusy('parking',true,'Търся паркинги около дестинацията…');
    app.renderParkingMessage('⏳','Търся паркинги','Радиусът се разширява автоматично от 500 м до 5 км.',{kind:'loading'});
    app.setRetry(null);

    try{
      let elements=[],usedRadius=app.RADII.at(-1);
      for(const radius of app.RADII){
        if(controller.signal.aborted)return;
        app.setStatus(`Търся паркинги в ${app.formatDistance(radius)} около дестинацията…`,'info',true);
        elements=await app.overpass(app.parkingQuery(radius),controller.signal);usedRadius=radius;
        const count=elements.filter(el=>el.tags?.amenity!=='parking_entrance').length;
        if(count>=5||radius===app.RADII.at(-1))break;
      }
      if(controller.signal.aborted)return;
      s.entrances=elements.filter(el=>el.tags?.amenity==='parking_entrance').map(el=>({el,point:app.pointOf(el)})).filter(item=>item.point);
      const seen=new Set();
      s.parkings=elements.filter(el=>el.tags?.amenity!=='parking_entrance').map(app.deriveParking).filter(Boolean).filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true});
      s.parkings.forEach(item=>item.entrance=app.findEntrance(item));app.sortParkings();app.renderParkingMarkers();app.renderParkings();
      app.$('parking-count').textContent=s.parkings.length;
      app.$('sheet-subtitle').textContent=`${s.parkings.length} OSM резултата в ${app.formatDistance(usedRadius)} · без live свободни места`;
      if(s.parkings.length){
        app.setStatus(`Намерени са ${s.parkings.length} картографирани паркинга.`,'success');
      }else{
        app.renderParkingMessage('＋','Няма картографирани паркинги','OSM може да няма нанесени физическите или уличните места в този район.',{actionLabel:'Предложи зона',onAction:app.beginDraw});
        app.setStatus('Няма OSM паркинги в радиус 5 км. Можеш да предложиш реална зона.','error',true);
      }
    }catch(error){
      if(error.name==='AbortError')return;
      console.error(error);s.parkings=[];app.$('parking-count').textContent='0';
      app.renderParkingMessage('↻','Паркингите не се заредиха','Услугата временно не отговори. Нищо не е загубено.',{kind:'error',actionLabel:'Опитай отново',onAction:app.findParkings});
      app.setRetry(app.findParkings,'Зареди паркингите');
      app.setStatus('Паркинг данните временно не отговориха.','error',true);
    }finally{
      if(s.requests.parking===controller)delete s.requests.parking;
      app.setBusy('parking',false);
    }
  };

  app.deriveParking=el=>{
    const point=app.pointOf(el);if(!point)return null;
    const tags=el.tags||{},straight=app.distance(point,s.destination),kind=app.parkingKind(tags);
    const covered=['underground','multi-storey'].includes(tags.parking)||tags.covered==='yes',free=tags.fee==='no',capacity=app.parseNumber(tags.capacity),lit=app.isYes(tags.lit),surveillance=app.isYes(tags.surveillance)||Boolean(tags['surveillance:type']);
    const walk=Math.round(straight*1.2),score=Math.max(1,Math.min(99,Math.round(100-walk/70+(covered?5:0)+(free?6:0)+(lit?3:0)+(surveillance?4:0))));
    return{id:`${el.type}-${el.id}`,el,point,tags,name:tags.name||tags.operator||kind,kind,straight,walk,drive:Math.round(straight*1.35),covered,free,capacity,lit,surveillance,score,entrance:null,route:null,walkRoute:null};
  };

  app.findEntrance=parking=>{
    let best=null,bestDistance=Infinity;
    s.entrances.forEach(item=>{const value=app.distance(parking.point,item.point);if(value<bestDistance&&value<=180){bestDistance=value;best=item.point}});
    return best||parking.point;
  };

  app.sortParkings=()=>{
    s.parkings.sort((a,b)=>{
      if(s.sort==='nearest')return a.straight-b.straight;
      if(s.sort==='walking')return a.walk-b.walk;
      if(s.sort==='covered')return Number(b.covered)-Number(a.covered)||a.walk-b.walk;
      if(s.sort==='free')return Number(b.free)-Number(a.free)||a.walk-b.walk;
      return b.score-a.score||a.walk-b.walk;
    });
  };

  app.renderParkingMarkers=()=>{
    s.parkingLayer.clearLayers();
    s.parkings.forEach(item=>{
      const marker=L.marker([item.point.lat,item.point.lon],{icon:app.parkingIcon(s.selected?.id===item.id),title:item.name}).addTo(s.parkingLayer);
      marker.bindPopup(`<b>${app.safe(item.name)}</b><br>${app.safe(item.kind)}<br>${app.formatDistance(item.walk)} до дестинацията<br><small>${app.sourceLabel()}</small>`);
      marker.addEventListener('click',()=>app.selectParking(item.id));
    });
  };

  app.renderParkings=()=>{
    const root=app.$('parking-list');root.innerHTML='';
    if(!s.parkings.length){
      app.renderParkingMessage('🅿️','Няма налични резултати','OSM може да няма нанесени всички физически и улични паркинги.',{actionLabel:s.destination?'Обнови':'Търси място',onAction:s.destination?app.findParkings:()=>app.$('search-input').focus()});
      return;
    }
    s.parkings.forEach((item,index)=>{
      const saved=s.saved.some(savedItem=>savedItem.id===item.id),card=document.createElement('article');
      card.className=`parking-card${s.selected?.id===item.id?' active':''}`;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Избери ${item.name}`);
      const tags=[item.covered?'Закрит':null,item.free?'Безплатен':null,item.capacity?`${item.capacity} места`:null,item.lit?'Осветен':null,item.surveillance?'Наблюдение':null,item.entrance!==item.point?'OSM вход':null].filter(Boolean);
      card.innerHTML=`<div class="parking-top"><div><div class="parking-title">${index+1}. ${app.safe(item.name)}</div><div class="parking-source">${app.safe(item.kind)} · ${app.sourceLabel()}</div></div><div class="parking-score">${item.score}</div></div><div class="parking-metrics"><div><b>${app.formatDistance(item.drive)}</b><span>прогнозно с кола</span></div><div><b>${app.formatDistance(item.walk)}</b><span>пеша до обекта</span></div><div><b>${item.free?'Безплатен':'Няма цена'}</b><span>OSM данни</span></div></div><div class="parking-tags">${tags.length?tags.map(tag=>`<span class="parking-tag">${app.safe(tag)}</span>`).join(''):'<span class="parking-tag">Ограничени данни</span>'}</div><div class="parking-actions"><button data-route="${item.id}" type="button">Маршрут</button><button data-save="${item.id}" type="button">${saved?'Запазено ★':'Запази ☆'}</button></div>`;
      const choose=event=>{if(!event.target.closest('button'))app.selectParking(item.id)};
      card.addEventListener('click',choose);card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();app.selectParking(item.id)}});root.appendChild(card);
    });
    root.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>app.selectParking(button.dataset.route)));
    root.querySelectorAll('[data-save]').forEach(button=>button.addEventListener('click',()=>app.toggleSaved(button.dataset.save)));
  };

  app.toggleSaved=id=>{
    const item=s.parkings.find(parking=>parking.id===id);if(!item)return;
    const exists=s.saved.some(saved=>saved.id===id);
    s.saved=exists?s.saved.filter(saved=>saved.id!==id):[{id:item.id,name:item.name,lat:item.point.lat,lon:item.point.lon,kind:item.kind},...s.saved].slice(0,100);
    app.write(app.STORAGE.saved,s.saved);app.renderParkings();app.updateProfile();app.setStatus(exists?'Премахнато от запазени.':'Паркингът е запазен.','success');
  };
})();
