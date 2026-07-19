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

  const installOrientationLock=()=>{
    if(app.orientationLock)return;
    const normalize=value=>((Number(value)||0)%360+360)%360;
    const delta=(from,to)=>((normalize(to)-normalize(from)+540)%360)-180;
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
    const screenAngle=()=>normalize(Number(screen.orientation?.angle??window.orientation??0));
    const state=app.orientationLock={
      target:0,visual:0,initialized:false,source:'waiting',confidence:0,compass:null,compassConfidence:0,
      compassAt:0,gps:null,gpsAt:0,gyroRate:0,gyroAt:0,locked:false,lockHeading:null,stableSince:0,
      disturbance:false,orientation:screenAngle(),lastFrameAt:0,frame:null,samples:0,rejected:0
    };

    const style=document.createElement('style');
    style.id='sf-orientation-lock-style';
    style.textContent='.user-position-marker{transform:rotate(var(--sf-final-heading,var(--heading)))!important;transition:none!important}.user-position-marker.orientation-locked .user-arrow{filter:drop-shadow(0 0 7px rgba(96,165,250,.8))}.user-position-marker.orientation-disturbed{filter:saturate(.35) drop-shadow(0 5px 9px #0008)}';
    document.head.appendChild(style);

    const eventHeading=event=>{
      let raw=null;
      if(Number.isFinite(event.webkitCompassHeading))raw=Number(event.webkitCompassHeading);
      else if(Number.isFinite(event.alpha))raw=360-Number(event.alpha);
      return Number.isFinite(raw)?normalize(raw-screenAngle()):null;
    };

    const eventConfidence=event=>{
      const accuracy=Number(event.webkitCompassAccuracy);
      if(Number.isFinite(accuracy)&&accuracy>=0)return clamp(1-accuracy/90,.12,1);
      return event.absolute===true||event.type==='deviceorientationabsolute'?.8:.45;
    };

    const updateTarget=()=>{
      const engine=s.arrowEngine||{};
      const speed=Math.max(0,Number(engine.smoothedSpeed??s.user?.speed??0));
      const now=performance.now();
      const compassFresh=Number.isFinite(state.compass)&&now-state.compassAt<1600;
      const gpsHeading=Number(s.user?.heading);
      const gpsFresh=Number.isFinite(gpsHeading)&&Number(s.user?.accuracy||999)<=45;
      if(gpsFresh){state.gps=normalize(gpsHeading);state.gpsAt=now}

      let candidate=null,source='waiting',confidence=0;
      if(speed>=14&&gpsFresh){candidate=state.gps;source='gps';confidence=clamp((engine.speedConfidence||55)/100,.45,.96)}
      else if(speed>=6&&gpsFresh&&compassFresh){
        const gpsWeight=state.compassConfidence>=.7?.48:.68;
        candidate=normalize(state.compass+delta(state.compass,state.gps)*gpsWeight);source='fusion';
        confidence=clamp(state.compassConfidence*.45+(engine.speedConfidence||50)/100*.55,.35,.95);
      }else if(compassFresh){candidate=state.compass;source='compass';confidence=state.compassConfidence}
      else if(gpsFresh){candidate=state.gps;source='gps-fallback';confidence=.42}
      if(!Number.isFinite(candidate))return;

      const turnRate=Math.abs(state.gyroRate);
      const current=state.initialized?state.target:candidate;
      const change=Math.abs(delta(current,candidate));
      const stable=change<2.2&&turnRate<8;
      if(stable){if(!state.stableSince)state.stableSince=now}
      else state.stableSince=0;

      const canLock=speed<7&&confidence>=.62&&state.stableSince&&now-state.stableSince>650;
      const mustUnlock=turnRate>16||change>7||speed>=7||confidence<.42;
      if(state.locked&&mustUnlock){state.locked=false;state.lockHeading=null}
      if(!state.locked&&canLock){state.locked=true;state.lockHeading=candidate}

      if(state.locked&&Number.isFinite(state.lockHeading)){
        const drift=delta(state.lockHeading,candidate);
        if(Math.abs(drift)<4.5)candidate=state.lockHeading;
        else{state.locked=false;state.lockHeading=null}
      }

      const compassGpsDifference=compassFresh&&gpsFresh?Math.abs(delta(state.compass,state.gps)):0;
      state.disturbance=Boolean(compassFresh&&gpsFresh&&speed>=6&&compassGpsDifference>70);
      if(state.disturbance&&gpsFresh){candidate=state.gps;source='gps-disturbance';confidence=Math.max(confidence,.58)}

      if(!state.initialized){state.initialized=true;state.visual=candidate;state.target=candidate}
      else if(Math.abs(delta(state.target,candidate))>=.35)state.target=candidate;
      state.source=source;state.confidence=Math.round(clamp(confidence*100,0,100));state.samples+=1;
    };

    const onOrientation=event=>{
      if(document.hidden)return;
      const heading=eventHeading(event);
      if(!Number.isFinite(heading)){state.rejected+=1;return}
      const confidence=eventConfidence(event);
      if(Number.isFinite(state.compass)){
        const change=delta(state.compass,heading);
        const weight=Math.abs(change)>55?.12:confidence>.7?.38:.22;
        state.compass=normalize(state.compass+change*weight);
      }else state.compass=heading;
      state.compassConfidence=confidence;state.compassAt=performance.now();updateTarget();
    };

    const onMotion=event=>{
      const rate=Number(event.rotationRate?.alpha);
      if(!Number.isFinite(rate))return;
      state.gyroRate=state.gyroRate+(clamp(rate,-240,240)-state.gyroRate)*.3;state.gyroAt=performance.now();
    };

    const reset=()=>{
      state.orientation=screenAngle();state.compass=null;state.compassAt=0;state.locked=false;state.lockHeading=null;
      state.stableSince=0;state.lastFrameAt=0;
    };

    const frame=timestamp=>{
      state.frame=requestAnimationFrame(frame);
      if(document.hidden)return;
      const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
      if(!marker)return;
      updateTarget();
      const dt=state.lastFrameAt?clamp((timestamp-state.lastFrameAt)/1000,.001,.05):.016;state.lastFrameAt=timestamp;
      const remaining=delta(state.visual,state.target);
      const engine=s.arrowEngine||{},speed=Math.max(0,Number(engine.smoothedSpeed||0));
      const responsiveness=state.locked?3.2:speed>=14?11:speed>=6?8:5.2;
      const maxRate=speed>=14?300:speed>=6?230:145;
      const step=clamp(remaining*responsiveness*dt,-maxRate*dt,maxRate*dt);
      if(Math.abs(remaining)<.12)state.visual=state.target;else state.visual=normalize(state.visual+step);
      marker.style.setProperty('--sf-final-heading',`${state.visual.toFixed(2)}deg`);
      marker.classList.toggle('orientation-locked',state.locked);
      marker.classList.toggle('orientation-disturbed',state.disturbance);
      const navArrow=document.getElementById('nav-heading-arrow');
      if(navArrow)navArrow.style.transform=`rotate(${state.visual.toFixed(2)}deg)`;
    };

    window.addEventListener('deviceorientationabsolute',onOrientation,true);
    window.addEventListener('deviceorientation',onOrientation,true);
    window.addEventListener('devicemotion',onMotion,true);
    screen.orientation?.addEventListener?.('change',reset);
    window.addEventListener('orientationchange',reset,true);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)reset()});
    state.frame=requestAnimationFrame(frame);

    app.orientationDiagnostics=()=>({
      finalHeading:state.visual,targetHeading:state.target,source:state.source,confidence:state.confidence,
      compassHeading:state.compass,compassConfidence:Math.round(state.compassConfidence*100),gpsHeading:state.gps,
      gyroRate:state.gyroRate,locked:state.locked,disturbance:state.disturbance,screenAngle:state.orientation,
      samples:state.samples,rejected:state.rejected
    });
    app.orientationSelfTest=()=>{
      const data=app.orientationDiagnostics();
      const checks={headingRange:data.finalHeading>=0&&data.finalHeading<360,targetRange:data.targetHeading>=0&&data.targetHeading<360,phoneTopReference:Number.isFinite(data.screenAngle),singleFinalTransform:Boolean(document.getElementById('sf-orientation-lock-style')),fivePrimaryActions:document.querySelectorAll('.nav-action').length===5};
      return{ok:Object.values(checks).every(Boolean),checks,at:Date.now()};
    };
  };

  app.init=()=>{
    app.beginBoot?.();
    try{
      app.initUi();
      if(!app.initMap())return;
      app.bind();app.initLayers();app.renderProposals();app.updateProfile();app.updateDestinationControls?.();
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
