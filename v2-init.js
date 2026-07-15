(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.navAction=(action,button)=>{
    document.querySelectorAll('.nav-action').forEach(item=>item.classList.toggle('active',item===button));
    if(action==='search'){app.$('search-input').focus();app.$('parking-sheet').classList.remove('collapsed');return}
    if(action==='parkings'){app.$('parking-sheet').classList.remove('collapsed');if(s.destination&&!s.parkings.length)app.findParkings();return}
    if(action==='navigate'){if(!s.selected)return app.setStatus('Първо избери паркинг от картата или списъка.','error');app.buildRoute(s.selected,true);return}
    if(action==='add'){app.beginDraw();return}
    if(action==='profile'){app.updateProfile();app.openModal('profile-modal')}
  };

  app.bind=()=>{
    app.$('search-form').addEventListener('submit',event=>{event.preventDefault();app.search(app.$('search-input').value)});
    app.$('search-input').addEventListener('input',()=>app.$('search-results').classList.remove('active'));
    app.$('locate-btn').addEventListener('click',app.locate);
    app.$('sheet-handle').addEventListener('click',()=>app.$('parking-sheet').classList.toggle('collapsed'));
    app.$('parking-filters').addEventListener('click',event=>{
      const button=event.target.closest('[data-sort]');if(!button)return;s.sort=button.dataset.sort;
      document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item===button));app.sortParkings();app.renderParkings();
    });
    app.$('route-close').addEventListener('click',app.clearRoute);
    app.$('start-route').addEventListener('click',()=>s.selected&&app.buildRoute(s.selected,true));
    document.querySelectorAll('.nav-action').forEach(button=>button.addEventListener('click',()=>app.navAction(button.dataset.action,button)));
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.close;app.closeModal(id);
      if(id==='proposal-modal'&&s.pendingGeometry)app.cancelDraw();
    }));
    document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)app.closeModal(modal.id)}));
    document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))app.$('search-results').classList.remove('active')});
    app.$('draw-undo').addEventListener('click',app.undoDraw);app.$('draw-cancel').addEventListener('click',app.cancelDraw);app.$('draw-finish').addEventListener('click',app.finishDraw);
    app.$('proposal-form').addEventListener('submit',app.saveProposal);
    app.$('show-proposals').addEventListener('click',()=>{app.closeModal('profile-modal');app.renderProposalList();app.openModal('proposals-modal')});
    app.$('clear-local-data').addEventListener('click',app.clearLocalData);
  };

  app.init=()=>{
    if(!app.initMap())return;
    app.bind();app.renderProposals();app.updateProfile();app.locate();
    app.setStatus('SmartCity V2 е готов. Потърси дестинация.','success');
  };

  window.addEventListener('error',event=>console.error(event.error||event.message));
  app.init();
})();
