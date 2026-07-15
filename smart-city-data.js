(()=>{
  'use strict';
  const app=window.SFMap,s=app.state;
  app.scheduleLoad=delay=>{clearTimeout(s.loadTimer);s.loadTimer=setTimeout(()=>app.centerPoint()&&app.loadSmartData(),delay)};
  app.queryForLayer=(key,queryRadius)=>{const center=app.centerPoint();return`[out:json][timeout:30];(${app.defs[key].clause}(around:${queryRadius},${center.lat},${center.lon}););out center tags;`};
  app.toggleLayer=button=>{
    const key=button.dataset.layer;
    if(key==='parking'&&app.enabled.has('parking')){
      app.setStatus(`Паркинги: обновявам всички OSM места в радиус ${app.labelRadius(app.effectiveRadius())}…`,'info',true);
      app.layers.parking.clearLayers();app.scheduleLoad(50);return;
    }
    if(app.enabled.has(key)){
      app.enabled.delete(key);button.classList.remove('active','loading','error');app.layers[key].clearLayers();app.setStatus(`${app.defs[key].label}: слой изключен.`);
    }else{
      app.enabled.add(key);button.classList.add('active');app.setStatus(`${app.defs[key].label}: зареждам слоя…`);
    }
    app.scheduleLoad(100);
  };
  app.fetchLayer=async(key,queryRadius,requested,version)=>{
    const button=document.querySelector(`[data-layer="${key}"]`);button?.classList.add('loading');button?.classList.remove('error');
    try{
      const response=await fetch('/api/overpass',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:app.queryForLayer(key,queryRadius)})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Overpass error');
      if(version!==s.requestVersion||!app.enabled.has(key))return{key,ignored:true};
      const count=app.renderLayer(key,Array.isArray(data.elements)?data.elements:[],requested);button?.classList.remove('error');return{key,count};
    }catch(error){console.error(`${key} layer failed`,error);button?.classList.add('error');return{key,error:true,count:null}}
    finally{button?.classList.remove('loading')}
  };
  app.loadSmartData=async(force=false)=>{
    const center=app.centerPoint();if(!center||!app.enabled.size)return;
    if(s.loading){s.pendingRefresh=true;return}s.loading=true;s.pendingRefresh=false;
    const version=++s.requestVersion,selected=app.radius(),requested=app.effectiveRadius();
    const queryRadius=Math.max(25,Math.min(requested,app.QUERY_CAP)),keys=[...app.enabled],centerLabel=s.activeDestination?'дестинацията':'теб';
    app.setStatus(selected>app.QUERY_CAP?`Обзор България · детайлни данни до 15 км около ${centerLabel}…`:`Обновявам ${keys.length} слоя около ${centerLabel}…`,'info',true);
    const results=[];
    for(let index=0;index<keys.length;index+=2){const batch=keys.slice(index,index+2);results.push(...await Promise.all(batch.map(key=>app.fetchLayer(key,queryRadius,requested,version))))}
    const failed=results.filter(item=>item.error).length,loaded=results.filter(item=>Number.isFinite(item.count)),total=loaded.reduce((sum,item)=>sum+item.count,0);
    s.lastLoadAt=Date.now();
    const scope=selected>app.QUERY_CAP?`детайли до ${app.labelRadius(app.QUERY_CAP)} (националният режим е обзорен)`:`радиус ${app.labelRadius(requested)}`;
    app.$('counts').innerHTML=keys.map(key=>{const result=results.find(item=>item.key===key);return`<div class="count">${app.defs[key].glyph} ${app.defs[key].label}: <b>${Number.isFinite(result?.count)?result.count:'—'}</b></div>`}).join('');
    app.$('meta').textContent=s.activeDestination?`${scope} около дестинацията · ${total} OSM обекта · свободните места не са live`:`${scope} · ${total} обекта · OSM, не live`;
    app.$('last-update').textContent=`Обновено ${new Date().toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}`;
    app.setStatus(failed?`${loaded.length} слоя заредени, ${failed} не отговориха. Натисни „Обнови“.`:`Картата е обновена: ${total} обекта в ${loaded.length} слоя.`,failed?'error':'success',failed>0);
    s.loading=false;if(s.pendingRefresh){s.pendingRefresh=false;app.scheduleLoad(100)}
  };
  app.renderLayer=(key,elements,requested)=>{
    const center=app.centerPoint();app.layers[key].clearLayers();
    const visible=elements.map(el=>({el,point:app.pointOf(el)})).filter(x=>x.point&&app.distance(center,x.point)<=requested).sort((a,b)=>app.distance(center,a.point)-app.distance(center,b.point));
    if(key==='parking'){s.parkingCandidates=visible;app.updateNearestParking?.()}
    const list=key==='parking'?visible:visible.slice(0,300);
    list.forEach(({el,point})=>{
      const def=app.defs[key],tags=el.tags||{},name=tags.name||tags.operator||def.label,details=key==='parking'?app.parkingDetails(tags):'';
      const nearest=key==='parking'&&s.nearestParking&&s.nearestParking.el.id===el.id&&s.nearestParking.el.type===el.type;
      const marker=L.marker([point.lat,point.lon],{icon:app.markerIcon(def,nearest)}).bindPopup(`<b>${app.safe(name)}</b><br>${def.label}${details?`<br>${app.safe(details)}`:''}<br><small>OSM данни · без live потвърждение</small>`).addTo(app.layers[key]);
      if(nearest)s.nearestMarker=marker;
    });
    return visible.length;
  };
})();
