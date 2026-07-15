(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  const setDrawingMapInteraction=enabled=>{
    if(!s.map)return;
    const method=enabled?'enable':'disable';
    ['dragging','touchZoom','doubleClickZoom','boxZoom','keyboard','scrollWheelZoom'].forEach(name=>s.map[name]?.[method]?.());
    const container=s.map.getContainer?.();
    if(container)container.style.touchAction=enabled?'':'none';
  };

  app.beginDraw=()=>{
    if(s.drawing)return;
    app.abortRequest?.('search');app.abortRequest?.('parking');app.abortRequest?.('route');
    s.drawing=true;s.drawPoints=[];s.pendingGeometry=null;s.drawingLayer.clearLayers();
    setDrawingMapInteraction(false);
    app.setActiveAction('add');app.setSheetCollapsed(true);app.setDrawingMode(true);
    app.$('draw-finish').disabled=true;
    app.$('draw-help').textContent='Докосвай картата по границата. Нужни са поне 3 точки.';
    app.setStatus('Очертавай реалната граница на паркинга чрез точки върху картата.','info',true);
  };

  app.addDrawPoint=latlng=>{
    if(!s.drawing)return;
    if(!app.inBulgaria(latlng.lat,latlng.lng))return app.setStatus('Точката трябва да е в България.','error');
    if(s.drawPoints.length>=80)return app.setStatus('Достигнат е максимумът от 80 точки. Завърши или върни точки назад.','error',true);
    s.drawPoints.push([latlng.lat,latlng.lng]);app.renderDrawing();app.$('draw-finish').disabled=s.drawPoints.length<3;
    app.$('draw-help').textContent=`Добавени точки: ${s.drawPoints.length}. ${s.drawPoints.length<3?'Нужни са поне 3.':'Можеш да завършиш.'}`;
  };

  app.renderDrawing=()=>{
    s.drawingLayer.clearLayers();
    s.drawPoints.forEach((point,index)=>L.circleMarker(point,{radius:6,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:1,interactive:false}).bindTooltip(String(index+1),{permanent:true,direction:'top',interactive:false}).addTo(s.drawingLayer));
    if(s.drawPoints.length>=2)s.drawLine=L.polyline(s.drawPoints,{color:'#f59e0b',weight:4,dashArray:'7 7',interactive:false}).addTo(s.drawingLayer);
    if(s.drawPoints.length>=3)s.drawPolygon=L.polygon(s.drawPoints,{color:'#f59e0b',weight:3,fillColor:'#f59e0b',fillOpacity:.18,interactive:false}).addTo(s.drawingLayer);
  };

  app.undoDraw=()=>{
    if(!s.drawPoints.length)return app.setStatus('Няма точка за връщане.');
    s.drawPoints.pop();app.renderDrawing();app.$('draw-finish').disabled=s.drawPoints.length<3;
    app.$('draw-help').textContent=`Добавени точки: ${s.drawPoints.length}. ${s.drawPoints.length<3?'Нужни са поне 3.':'Можеш да завършиш.'}`;
  };

  app.cancelDraw=()=>{
    s.drawing=false;s.drawPoints=[];s.pendingGeometry=null;s.drawingLayer.clearLayers();
    setDrawingMapInteraction(true);
    app.setDrawingMode(false);app.setActiveAction(s.destination?'parkings':'search');
    app.setStatus('Очертаването е отменено.');
  };

  app.finishDraw=()=>{
    if(s.drawPoints.length<3)return app.setStatus('Нужни са поне 3 точки за зона.','error');
    s.pendingGeometry=s.drawPoints.map(([lat,lon])=>({lat,lon}));s.drawing=false;
    setDrawingMapInteraction(true);
    app.setDrawingMode(false);app.openModal('proposal-modal');
  };

  app.saveProposal=event=>{
    event.preventDefault();
    if(!s.pendingGeometry?.length)return app.setStatus('Липсва очертание на зоната.','error');
    const name=app.$('proposal-name').value.trim(),evidence=app.$('proposal-evidence').value.trim();
    if(!name||!evidence)return app.setStatus('Попълни име и начин за потвърждение.','error');
    const photo=app.$('proposal-photo').files?.[0];
    const proposal={
      id:`proposal-${Date.now()}`,name,access:app.$('proposal-access').value,
      capacity:Number(app.$('proposal-capacity').value||0)||null,evidence,
      photoName:photo?.name||null,geometry:s.pendingGeometry,status:'pending_soulflame',createdAt:new Date().toISOString(),source:'community-local'
    };
    try{
      s.proposals.unshift(proposal);app.write(app.STORAGE.proposals,s.proposals);
    }catch(error){
      s.proposals=s.proposals.filter(item=>item.id!==proposal.id);console.error(error);
      return app.setStatus('Предложението не можа да се запази на устройството.','error',true);
    }
    s.pendingGeometry=null;s.drawPoints=[];s.drawingLayer.clearLayers();app.$('proposal-form').reset();app.closeModal('proposal-modal');
    app.renderProposals();app.updateProfile();app.setActiveAction('profile');
    app.setStatus('Предложението е записано като „Чака SoulFlame одобрение“.','success',true);
  };

  app.polygonCenter=points=>({lat:points.reduce((sum,p)=>sum+p.lat,0)/points.length,lon:points.reduce((sum,p)=>sum+p.lon,0)/points.length});

  app.renderProposals=()=>{
    s.proposalLayer?.clearLayers();
    s.proposals.filter(proposal=>Array.isArray(proposal.geometry)&&proposal.geometry.length>=3).forEach(proposal=>{
      const coords=proposal.geometry.map(point=>[point.lat,point.lon]);
      const polygon=L.polygon(coords,{color:'#f59e0b',weight:3,dashArray:'7 7',fillColor:'#f59e0b',fillOpacity:.13}).addTo(s.proposalLayer);
      const center=app.polygonCenter(proposal.geometry);
      polygon.bindPopup(`<b>${app.safe(proposal.name)}</b><br>Статус: Чака SoulFlame одобрение<br><small>Не е публикувано като проверен обществен паркинг.</small>`);
      L.circleMarker([center.lat,center.lon],{radius:5,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:1}).addTo(s.proposalLayer);
    });
  };

  app.renderProposalList=()=>{
    const root=app.$('proposal-list');root.innerHTML='';
    if(!s.proposals.length){root.innerHTML='<div class="empty-card"><div>＋</div><strong>Нямаш предложения</strong><span>Очертаните зони ще се показват тук.</span></div>';return}
    s.proposals.forEach(proposal=>{
      const item=document.createElement('button');item.type='button';item.className='proposal-item';
      item.innerHTML=`<b>${app.safe(proposal.name)}</b><span>Чака SoulFlame одобрение</span><small>${new Date(proposal.createdAt).toLocaleString('bg-BG')} · ${proposal.geometry.length} точки${proposal.capacity?` · ${proposal.capacity} места`:''}</small>`;
      item.addEventListener('click',()=>{app.closeModal('proposals-modal');s.map.fitBounds(L.latLngBounds(proposal.geometry.map(point=>[point.lat,point.lon])).pad(.3));app.setStatus(`Показвам предложението „${proposal.name}“.`,'success')});
      root.appendChild(item);
    });
  };

  app.clearLocalData=()=>{
    if(!confirm('Да изтрия ли всички локални запазени места, история и предложения от това устройство?'))return;
    s.saved=[];s.proposals=[];s.destinationHistory=[];s.savedDestinations=[];
    app.write(app.STORAGE.saved,[]);app.write(app.STORAGE.proposals,[]);app.write(app.STORAGE.destinationHistory,[]);app.write(app.STORAGE.savedDestinations,[]);
    app.renderProposals();app.renderParkings?.();app.updateDestinationControls?.();app.updateProfile();
    app.closeModal('profile-modal');app.setActiveAction('profile');app.setStatus('Локалните данни, историята и запазените места са изтрити.','success');
  };
})();