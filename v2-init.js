(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.navAction=(action,button)=>{
    if(s.drawing&&action!=='add')return app.setStatus('Завърши или откажи очертаването първо.','error');

    if(action==='search'){
      app.setActiveAction('search');app.setSheetCollapsed(false);app.$('search-input').focus();return;
    }
    if(action==='parkings'){
      app.setActiveAction('parkings');app.setSheetCollapsed(false);
      if(!s.destination){app.renderParkingMessage('⌕','Избери дестинация','Паркингите се търсят около крайната точка.',{actionLabel:'Отвори търсенето',onAction:()=>app.$('search-input').focus()});return app.setStatus('Първо потърси адрес или обект.','error')}
      if(!s.parkings.length&&!s.ui.busy.has('parking'))app.findParkings();return;
    }
    if(action==='navigate'){
      if(!s.selected)return app.setStatus('Първо избери паркинг от картата или списъка.','error');
      app.setActiveAction('navigate');app.buildRoute(s.selected,true);return;
    }
    if(action==='add'){
      app.setActiveAction('add');app.beginDraw();return;
    }
    if(action==='profile'){
      app.setActiveAction('profile');app.updateProfile();app.openModal('profile-modal');
    }
  };

  app.requestCloseModal=id=>{
    app.closeModal(id);
    if(id==='proposal-modal'&&s.pendingGeometry)app.cancelDraw();
  };

  app.bind=()=>{
    app.$('search-form').addEventListener('submit',event=>{event.preventDefault();app.search(app.$('search-input').value)});
    app.$('search-input').addEventListener('input',()=>app.$('search-results').classList.remove('active'));
    app.$('locate-btn').addEventListener('click',app.locate);
    app.$('sheet-handle').addEventListener('click',()=>app.setSheetCollapsed(!app.$('parking-sheet').classList.contains('collapsed')));

    app.$('parking-filters').addEventListener('click',event=>{
      const button=event.target.closest('[data-sort]');
      if(!button||button.disabled)return;
      s.sort=button.dataset.sort;document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item===button));
      app.sortParkings();app.renderParkings();
    });

    app.$('route-close').addEventListener('click',app.clearRoute);
    app.$('start-route').addEventListener('click',()=>{
      if(!s.selected)return app.setStatus('Няма избран паркинг.','error');
      app.buildRoute(s.selected,true);
    });

    document.querySelectorAll('.nav-action').forEach(button=>button.addEventListener('click',()=>app.navAction(button.dataset.action,button)));
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>app.requestCloseModal(button.dataset.close)));
    document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)app.requestCloseModal(modal.id)}));
    document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))app.$('search-results').classList.remove('active')});

    app.$('draw-undo').addEventListener('click',app.undoDraw);
    app.$('draw-cancel').addEventListener('click',app.cancelDraw);
    app.$('draw-finish').addEventListener('click',app.finishDraw);
    app.$('proposal-form').addEventListener('submit',app.saveProposal);
    app.$('show-proposals').addEventListener('click',()=>{app.closeModal('profile-modal');app.renderProposalList();app.openModal('proposals-modal')});
    app.$('clear-local-data').addEventListener('click',app.clearLocalData);
  };

  app.init=()=>{
    try{
      app.initUi();
      if(!app.initMap())return;
      app.bind();app.renderProposals();app.updateProfile();
      app.renderParkingMessage('🅿️','Избери дестинация','Потърси адрес, мол или обект. Паркингите ще се търсят около крайната точка.',{actionLabel:'Започни търсене',onAction:()=>app.$('search-input').focus()});
      app.locate();
      app.setStatus('SmartCity V2 е готов. Потърси дестинация.','success');
    }catch(error){
      console.error(error);
      app.setStatus('SmartCity V2 не можа да се стартира напълно.','error',true);
      app.setRetry(()=>location.reload(),'Презареди приложението');
    }
  };

  window.addEventListener('error',event=>{
    console.error(event.error||event.message);
    app.setStatus('Възникна интерфейсна грешка. Можеш да презаредиш приложението.','error',true);
    app.setRetry?.(()=>location.reload(),'Презареди приложението');
  });
  window.addEventListener('unhandledrejection',event=>{
    console.error(event.reason);
    if(event.reason?.name!=='AbortError'){
      app.setStatus('Една операция не завърши успешно.','error',true);
      app.setRetry?.(()=>location.reload(),'Презареди приложението');
    }
  });

  app.init();
})();
