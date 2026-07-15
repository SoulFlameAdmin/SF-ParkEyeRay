(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.normalizeQuery=value=>String(value||'')
    .toLocaleLowerCase('bg-BG')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim();

  app.destinationKey=item=>`${Number(item.lat).toFixed(6)},${Number(item.lon).toFixed(6)}`;

  app.destinationTypeLabel=type=>({
    mall:'Мол',shopping_centre:'Търговски център',supermarket:'Магазин',hospital:'Болница',
    clinic:'Клиника',school:'Училище',university:'Университет',hotel:'Хотел',restaurant:'Ресторант',
    parking:'Паркинг',street:'Улица',house:'Адрес',residential:'Адрес',commercial:'Търговски обект',
    town:'Град',city:'Град',village:'Населено място'
  }[String(type||'').toLowerCase()]||'Място');

  app.destinationContext=item=>{
    const parts=String(item.name||'').split(',').map(value=>value.trim()).filter(Boolean);
    if(parts.length<=1)return app.destinationTypeLabel(item.type);
    const context=parts.slice(1).filter(part=>!/^българия$/i.test(part)).slice(-3).join(', ');
    return [app.destinationTypeLabel(item.type),context].filter(Boolean).join(' · ');
  };

  app.rankSearchResults=(results,query)=>{
    const q=app.normalizeQuery(query),tokens=q.split(' ').filter(token=>token.length>1);
    const wantsMall=tokens.some(token=>['мол','mall'].includes(token));
    const wantsCity=tokens.filter(token=>token.length>=4);

    return [...results].map(item=>{
      const name=app.normalizeQuery(item.name),type=String(item.type||'').toLowerCase();
      let score=Number(item.importance||0)*10;
      tokens.forEach(token=>{
        if(name.includes(token))score+=6;
        if(name.startsWith(token))score+=2;
      });
      if(tokens.length&&tokens.every(token=>name.includes(token)))score+=14;
      if(wantsMall&&['mall','shopping_centre','commercial'].includes(type))score+=25;
      if(wantsMall&&/(мол|mall|галерия|galleria|shopping)/u.test(name))score+=18;
      if(wantsCity.some(token=>name.includes(token)))score+=8;
      if(item.source==='nominatim')score+=3;
      if(Number.isFinite(item.distance))score+=Math.max(0,8-Math.min(8,item.distance/25000));
      return{...item,_score:score};
    }).sort((a,b)=>b._score-a._score||Number(a.distance||Infinity)-Number(b.distance||Infinity));
  };

  app.destinationRecord=item=>({
    id:app.destinationKey(item),
    name:String(item.name||'Дестинация'),
    lat:Number(item.lat),lon:Number(item.lon),
    type:item.type||'',source:item.source||'local',
    savedAt:new Date().toISOString()
  });

  app.rememberDestination=item=>{
    if(!item||!app.inBulgaria(Number(item.lat),Number(item.lon)))return;
    const record=app.destinationRecord(item),key=record.id;
    s.destinationHistory=[record,...s.destinationHistory.filter(entry=>app.destinationKey(entry)!==key)].slice(0,20);
    app.write(app.STORAGE.destinationHistory,s.destinationHistory);
    app.updateDestinationControls();
  };

  app.isDestinationSaved=item=>{
    if(!item)return false;
    const key=app.destinationKey(item);
    return s.savedDestinations.some(entry=>app.destinationKey(entry)===key);
  };

  app.toggleSavedDestination=()=>{
    if(!s.destination)return app.setStatus('Първо избери дестинация.','error');
    const key=app.destinationKey(s.destination),exists=app.isDestinationSaved(s.destination);
    if(exists){
      s.savedDestinations=s.savedDestinations.filter(entry=>app.destinationKey(entry)!==key);
      app.setStatus('Дестинацията е премахната от запазени.','success');
    }else{
      s.savedDestinations=[app.destinationRecord(s.destination),...s.savedDestinations.filter(entry=>app.destinationKey(entry)!==key)].slice(0,50);
      app.setStatus('Дестинацията е запазена.','success');
    }
    app.write(app.STORAGE.savedDestinations,s.savedDestinations);
    app.updateDestinationControls();app.updateProfile();
  };

  app.updateDestinationControls=()=>{
    const button=app.$('save-destination');if(!button)return;
    const visible=Boolean(s.destination);button.hidden=!visible;
    if(!visible)return;
    const saved=app.isDestinationSaved(s.destination);
    button.textContent=saved?'★':'☆';
    button.title=saved?'Премахни дестинацията от запазени':'Запази дестинацията';
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-pressed',String(saved));
  };

  app.localDestinationMatches=query=>{
    const q=app.normalizeQuery(query);
    const matches=entry=>!q||app.normalizeQuery(entry.name).includes(q);
    return{
      saved:s.savedDestinations.filter(matches).slice(0,5),
      history:s.destinationHistory.filter(entry=>matches(entry)&&!s.savedDestinations.some(saved=>app.destinationKey(saved)===app.destinationKey(entry))).slice(0,5)
    };
  };

  app.createDestinationButton=(item,meta,icon='⌖')=>{
    const button=document.createElement('button');button.type='button';button.className='search-result destination-result';button.setAttribute('role','option');
    button.innerHTML=`<span class="destination-icon">${icon}</span><span class="destination-copy"><b>${app.safe(item.name)}</b><small>${app.safe(meta)}</small></span>`;
    button.addEventListener('click',()=>{app.$('search-results').classList.remove('active');app.selectDestination(item)});
    return button;
  };

  app.appendDestinationSection=(root,title,items,icon)=>{
    if(!items.length)return;
    const heading=document.createElement('div');heading.className='search-section-title';heading.textContent=title;root.appendChild(heading);
    items.forEach(item=>root.appendChild(app.createDestinationButton(item,app.destinationContext(item),icon)));
  };

  app.renderLocalDestinations=(query='')=>{
    const root=app.$('search-results'),local=app.localDestinationMatches(query);
    root.innerHTML='';
    app.appendDestinationSection(root,'Запазени места',local.saved,'★');
    app.appendDestinationSection(root,'Последни търсения',local.history,'↺');
    if(!local.saved.length&&!local.history.length){
      root.innerHTML='<div class="search-empty">Няма запазени или скорошни дестинации.</div>';
    }else if(s.destinationHistory.length){
      const clear=document.createElement('button');clear.type='button';clear.className='search-clear';clear.textContent='Изчисти историята';
      clear.addEventListener('click',event=>{event.stopPropagation();s.destinationHistory=[];app.write(app.STORAGE.destinationHistory,[]);app.renderLocalDestinations(query)});root.appendChild(clear);
    }
    root.classList.add('active');
  };

  app.renderSearchResults=(results,query='')=>{
    const root=app.$('search-results');root.innerHTML='';
    const ranked=app.rankSearchResults(results,query);
    const heading=document.createElement('div');heading.className='search-section-title';heading.textContent=`Резултати · ${ranked.length}`;root.appendChild(heading);
    ranked.slice(0,8).forEach((item,index)=>{
      const meta=[index===0?'Най-подходящ':'Алтернатива',app.destinationContext(item)].filter(Boolean).join(' · ');
      root.appendChild(app.createDestinationButton(item,meta,index===0?'●':'○'));
    });
    root.classList.toggle('active',ranked.length>0);
    return ranked;
  };

  app.handleSearchFocus=()=>{
    const value=app.$('search-input').value.trim();
    if(value.length<3)app.renderLocalDestinations(value);
  };

  app.handleSearchInput=value=>{
    clearTimeout(s.searchTimer);
    const text=String(value||'').trim();
    if(text.length<3){app.abortRequest('search');app.renderLocalDestinations(text);return}
    const local=app.localDestinationMatches(text);
    if(local.saved.length||local.history.length)app.renderLocalDestinations(text);
    s.searchTimer=setTimeout(()=>app.search(text,{autoSelect:false,silent:true}),350);
  };

  const baseSelectDestination=app.selectDestination;
  app.selectDestination=item=>{
    baseSelectDestination(item);
    app.rememberDestination(item);
    app.updateDestinationControls();
  };
})();
