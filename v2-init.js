(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.navAction=(action,button)=>{
    if(s.drawing&&action!=='add')return app.setStatus('Завърши или откажи очертаването първо.','error');

    if(action==='search'){
      app.closeMapMenu?.();app.setActiveAction('search');app.$('search-input').focus();app.handleSearchFocus?.();return;
    }
    if(action==='parkings'){
      app.toggleLayer?.('parking');return;
    }
    if(action==='navigate'){
      app.closeMapMenu?.();
      if(!s.selected)return app.setStatus('Избери паркинг от картата или разгъни списъка.','error');
      app.setActiveAction('navigate');app.buildRoute(s.selected,true);return;
    }
    if(action==='add'){
      app.closeMapMenu?.();app.setActiveAction('add');app.beginDraw();return;
    }
    if(action==='profile'){
      app.closeMapMenu?.();app.setActiveAction('profile');app.updateProfile();app.openModal('profile-modal');
    }
  };

  app.requestCloseModal=id=>{
    app.closeModal(id);
    if(id==='proposal-modal'&&s.pendingGeometry)app.cancelDraw();
  };

  app.bind=()=>{
    const searchInput=app.$('search-input'),searchResults=app.$('search-results');
    app.$('search-form').addEventListener('submit',event=>{event.preventDefault();app.search(searchInput.value,{autoSelect:true,silent:false})});
    searchInput.addEventListener('input',event=>app.handleSearchInput?.(event.target.value));
    searchInput.addEventListener('focus',()=>app.handleSearchFocus?.());
    searchResults.addEventListener('transitionend',()=>searchInput.setAttribute('aria-expanded',String(searchResults.classList.contains('active'))));
    app.$('save-destination').addEventListener('click',app.toggleSavedDestination);
    app.$('locate-btn').addEventListener('click',()=>{s.followUser=true;app.locate()});
    app.$('menu-close').addEventListener('click',app.closeMapMenu);
    app.$('sheet-handle').addEventListener('click',()=>app.setSheetCollapsed(!app.$('parking-sheet').classList.contains('collapsed')));

    app.$('parking-filters').addEventListener('click',event=>{
      const button=event.target.closest('[data-sort]');
      if(!button||button.disabled)return;
      s.sort=button.dataset.sort;document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item===button));
      app.sortParkings();app.renderParkings();
    });

    app.$('route-close').addEventListener('click',()=>{app.stopNavigation?.();app.clearRoute()});
    app.$('start-route').addEventListener('click',app.toggleNavigation);

    document.querySelectorAll('.nav-action').forEach(button=>{
      if(button.dataset.action!=='parkings')button.addEventListener('click',()=>app.navAction(button.dataset.action,button));
    });
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>app.requestCloseModal(button.dataset.close)));
    document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)app.requestCloseModal(modal.id)}));
    document.addEventListener('click',event=>{
      if(!event.target.closest('.search-wrap')){searchResults.classList.remove('active');searchInput.setAttribute('aria-expanded','false')}
    });

    app.$('draw-undo').addEventListener('click',app.undoDraw);
    app.$('draw-cancel').addEventListener('click',app.cancelDraw);
    app.$('draw-finish').addEventListener('click',app.finishDraw);
    app.$('proposal-form').addEventListener('submit',app.saveProposal);
    app.$('show-proposals').addEventListener('click',()=>{app.closeModal('profile-modal');app.renderProposalList();app.openModal('proposals-modal')});
    app.$('clear-local-data').addEventListener('click',app.clearLocalData);
  };

  app.init=()=>{
    app.beginBoot?.();
    try{
      app.initUi();
      if(!app.initMap())return;
      app.bind();app.initLayers();app.renderProposals();app.updateProfile();app.updateDestinationControls?.();app.initAuthUi?.();
      app.renderParkingMessage('◎','Определям района','При разрешен GPS паркингите ще се появят автоматично около теб.');
      app.setStatus('Подготвям GPS и картата…','info',true);
      app.locate();
    }catch(error){
      console.error(error);
      app.finishBoot?.('init-error');
      app.setStatus('SmartCity V2 не можа да се стартира напълно.','error',true);
      app.setRetry(()=>location.reload(),'Презареди приложението');
    }
  };

  window.addEventListener('error',event=>{
    console.error(event.error||event.message);
    app.finishBoot?.('runtime-error');
    app.setStatus('Възникна интерфейсна грешка. Можеш да презаредиш приложението.','error',true);
    app.setRetry?.(()=>location.reload(),'Презареди приложението');
  });
  window.addEventListener('unhandledrejection',event=>{
    console.error(event.reason);
    if(event.reason?.name!=='AbortError'){
      app.finishBoot?.('promise-error');
      app.setStatus('Една операция не завърши успешно.','error',true);
      app.setRetry?.(()=>location.reload(),'Презареди приложението');
    }
  });

  app.init();
})();
