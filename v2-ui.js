(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  s.ui={online:navigator.onLine,busy:new Set(),activeAction:'search',lastRetry:null};

  app.requiredIds=[
    'map','draw-surface','status','search-form','search-input','search-submit','search-results','locate-btn','menu-btn','map-menu','parking-layer-btn','fuel-layer-btn',
    'speedometer','speedometer-value','navigation-hud','nav-maneuver','nav-maneuver-icon','nav-maneuver-text','nav-maneuver-distance','nav-speed-value','nav-remaining-distance','nav-remaining-time','nav-eta','nav-route-state',
    'parking-sheet','parking-list','parking-count','parking-filters','sheet-handle','save-destination',
    'route-card','route-close','start-route','external-route','draw-toolbar',
    'proposal-modal','proposal-form','profile-modal','proposals-modal','network-state'
  ];

  app.assertInterface=()=>{
    const missing=app.requiredIds.filter(id=>!app.$(id));
    if(missing.length)throw new Error(`Missing interface nodes: ${missing.join(', ')}`);
    const actions=[...document.querySelectorAll('.nav-action[data-action]')];
    if(actions.length!==5)throw new Error(`Expected 5 primary actions in the burger menu, found ${actions.length}`);
    return true;
  };

  app.setActiveAction=action=>{
    s.ui.activeAction=action;
    document.querySelectorAll('.nav-action').forEach(button=>{
      const active=button.dataset.action===action;
      button.classList.toggle('active',active);
      button.setAttribute('aria-current',active?'page':'false');
    });
  };

  app.setBusy=(scope,busy,message='')=>{
    if(busy)s.ui.busy.add(scope);else s.ui.busy.delete(scope);
    document.body.classList.toggle('is-busy',s.ui.busy.size>0);
    document.body.dataset.busy=[...s.ui.busy].join(',');
    if(scope==='search'){
      app.$('search-submit').disabled=busy;
      app.$('search-input').setAttribute('aria-busy',String(busy));
      app.$('search-form').classList.toggle('loading',busy);
    }
    if(scope==='parking'){
      app.$('parking-sheet').classList.toggle('loading',busy);
      app.$('parking-list').setAttribute('aria-busy',String(busy));
      document.querySelectorAll('.filter').forEach(button=>button.disabled=busy);
    }
    if(scope==='route'){
      app.$('route-card').classList.toggle('loading',busy);
      app.$('start-route').disabled=busy;
    }
    if(scope==='gps')app.$('locate-btn').disabled=busy;
    if(message&&busy)app.setStatus(message,'info',true);
  };

  app.abortRequest=name=>{
    const controller=s.requests?.[name];
    if(controller){controller.abort();delete s.requests[name]}
  };

  app.newRequest=name=>{
    app.abortRequest(name);
    const controller=new AbortController();
    s.requests[name]=controller;
    return controller;
  };

  app.setRetry=(handler,label='Опитай отново')=>{
    s.ui.lastRetry=typeof handler==='function'?handler:null;
    const button=app.$('global-retry');
    button.textContent=label;
    button.hidden=!s.ui.lastRetry;
  };

  app.renderParkingMessage=(icon,title,detail,options={})=>{
    const root=app.$('parking-list');
    const action=options.actionLabel?`<button id="parking-state-action" class="empty-action" type="button">${app.safe(options.actionLabel)}</button>`:'';
    root.innerHTML=`<div class="empty-card ${app.safe(options.kind||'')}"><div>${icon}</div><strong>${app.safe(title)}</strong><span>${app.safe(detail)}</span>${action}</div>`;
    const button=app.$('parking-state-action');
    if(button&&typeof options.onAction==='function')button.addEventListener('click',options.onAction,{once:true});
  };

  app.setSheetCollapsed=collapsed=>{
    app.$('parking-sheet').classList.toggle('collapsed',collapsed);
    app.$('sheet-handle').setAttribute('aria-expanded',String(!collapsed));
    document.body.classList.toggle('sheet-expanded',!collapsed);
  };

  app.setDrawingMode=active=>{
    document.body.classList.toggle('drawing-mode',active);
    app.$('draw-surface').setAttribute('aria-hidden',String(!active));
    app.$('draw-toolbar').classList.toggle('active',active);
    document.querySelectorAll('.nav-action,.layer-action').forEach(button=>button.disabled=active&&button.dataset.action!=='add');
    app.$('search-input').disabled=active;
    app.$('search-submit').disabled=active;
    app.$('locate-btn').disabled=active;
    app.$('menu-btn').disabled=active;
    app.$('save-destination').disabled=active;
    if(active){app.closeMapMenu?.();app.setSearchExpanded?.(false)}
  };

  app.setOnlineState=online=>{
    s.ui.online=online;
    const banner=app.$('network-state');
    banner.classList.toggle('active',!online);
    banner.setAttribute('aria-hidden',String(online));
    if(online){
      app.setStatus('Интернет връзката е възстановена.','success');
      app.setRetry(null);
      if(s.map)app.refreshMapLayers?.(app.layerCenter?.(),{force:true,announce:false});
    }else{
      app.setStatus('Няма интернет. Картата остава видима, но търсенето и слоевете са временно спрени.','error',true);
    }
  };

  app.closeTopModal=()=>{
    const open=[...document.querySelectorAll('.modal.open')].at(-1);
    if(open)app.closeModal(open.id);
  };

  app.initUi=()=>{
    app.assertInterface();
    app.setActiveAction('search');
    app.setSheetCollapsed(true);
    app.setOnlineState(navigator.onLine);
    app.$('global-retry').addEventListener('click',()=>s.ui.lastRetry?.());
    window.addEventListener('online',()=>app.setOnlineState(true));
    window.addEventListener('offline',()=>app.setOnlineState(false));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(s.drawing)app.cancelDraw?.();
        else if(app.$('map-menu').classList.contains('open'))app.closeMapMenu?.();
        else if(app.$('search-results').classList.contains('active'))app.setSearchExpanded?.(false);
        else app.closeTopModal();
      }
    });
  };
})();
