(()=>{
  'use strict';
  const app=window.SFMap,s=app.state;
  app.normalizeText=value=>String(value||'').toLocaleLowerCase('bg').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  app.resultScore=(item,query)=>{
    const name=app.normalizeText(item.name),q=app.normalizeText(query),tokens=q.split(' ').filter(token=>token.length>1);
    let score=tokens.reduce((sum,token)=>sum+(name.includes(token)?4:0),0);
    const wantsMall=/\b(мол|mall)\b/u.test(q);
    if(wantsMall&&/(мол|mall|shopping|галерия|galleria|park mall)/u.test(name))score+=18;
    if(wantsMall&&['mall','shopping_centre','commercial','house','parking'].includes(String(item.type||'')))score+=4;
    if(item.source==='nominatim')score+=2;
    return score+Number(item.importance||0);
  };
  app.renderSearchResults=results=>{
    const root=app.$('search-results');root.innerHTML='';
    results.slice(0,7).forEach((item,index)=>{
      const button=document.createElement('button');button.type='button';button.className='search-result';
      button.innerHTML=`${app.safe(item.name)}<small>${index===0?'Най-вероятен резултат':'Алтернативен резултат'}</small>`;
      button.onclick=()=>{root.classList.remove('active');app.setDestination(item)};root.appendChild(button);
    });
    root.classList.toggle('active',results.length>1);
  };
  app.searchDestination=async query=>{
    const text=String(query||'').trim();if(text.length<2)return;
    const bias=s.location||s.activeDestination||{lat:s.map.getCenter().lat,lon:s.map.getCenter().lng};
    app.setStatus(`Търся „${text}“…`,'info',true);app.$('search-results').classList.remove('active');
    try{
      const p=new URLSearchParams({q:text,lat:String(bias.lat),lon:String(bias.lon)}),response=await fetch(`/api/geocode?${p}`),data=await response.json();
      if(!response.ok||!data.results?.length)throw new Error('not found');
      const q=data.normalizedQuery||text,ranked=data.results.slice().sort((a,b)=>app.resultScore(b,q)-app.resultScore(a,q));
      app.renderSearchResults(ranked);
      if(app.resultScore(ranked[0],q)>=12||ranked.length===1){app.$('search-results').classList.remove('active');await app.setDestination(ranked[0])}
      else app.setStatus(`Намерих ${ranked.length} възможни места. Избери правилното.`,'success');
    }catch(error){app.setStatus('Мястото не е намерено. Напиши обект и град, например „Стара Загора мол“.','error',true)}
  };
  app.updateNearestParking=()=>{
    if(!s.activeDestination){s.nearestParking=null;app.$('nearest-parking').classList.remove('active');return}
    s.nearestParking=s.parkingCandidates.slice().sort((a,b)=>app.distance(s.activeDestination,a.point)-app.distance(s.activeDestination,b.point))[0]||null;
    if(!s.nearestParking){app.$('nearest-parking').classList.remove('active');app.$('external-route').href=app.$('external-destination').href;app.drawRouteToDestination(s.activeDestination,null);return}
    const tags=s.nearestParking.el.tags||{},name=tags.name||tags.operator||'Паркинг',meters=app.distance(s.activeDestination,s.nearestParking.point);
    app.$('nearest-name').textContent=`Най-близък OSM паркинг: ${name}`;
    app.$('nearest-distance').textContent=`${app.formatDistance(meters)} от дестинацията · ${app.parkingDetails(tags)||'няма допълнителни данни'}`;
    app.$('nearest-parking').classList.add('active');
    if(s.location)app.$('external-route').href=`https://www.google.com/maps/dir/?api=1&origin=${s.location.lat},${s.location.lon}&destination=${s.nearestParking.point.lat},${s.nearestParking.point.lon}&travelmode=driving`;
    app.drawRouteToDestination(s.activeDestination,s.nearestParking.point);
  };
})();
