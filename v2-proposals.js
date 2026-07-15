(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;

  app.beginDraw=()=>{
    if(s.drawing)return;
    s.drawing=true;s.drawPoints=[];s.pendingGeometry=null;s.drawingLayer.clearLayers();
    app.$('draw-toolbar').classList.add('active');app.$('draw-finish').disabled=true;app.$('parking-sheet').classList.add('collapsed');
    app.setStatus('Очертавай реалната граница на паркинга чрез точки върху картата.','info',true);
  };

  app.addDrawPoint=latlng=>{
    if(!app.inBulgaria(latlng.lat,latlng.lng))return app.setStatus('Точката трябва да е в България.','error');
    s.drawPoints.push([latlng.lat,latlng.lng]);app.renderDrawing();app.$('draw-finish').disabled=s.drawPoints.length<3;
    app.$('draw-help').textContent=`Добавени точки: ${s.drawPoints.length}. ${s.drawPoints.length<3?'Нужни са поне 3.':'Можеш да завършиш.'}`;
  };

  app.renderDrawing=()=>{
    s.drawingLayer.clearLayers();
    s.drawPoints.forEach((point,index)=>L.circleMarker(point,{radius:6,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:1}).bindTooltip(String(index+1),{permanent:true,direction:'top'}).addTo(s.drawingLayer));
    if(s.drawPoints.length>=2)s.drawLine=L.polyline(s.drawPoints,{color:'#f59e0b',weight:4,dashArray:'7 7'}).addTo(s.drawingLayer);
    if(s.drawPoints.length>=3)s.drawPolygon=L.polygon(s.drawPoints,{color:'#f59e0b',weight:3,fillColor:'#f59e0b',fillOpacity:.18}).addTo(s.drawingLayer);
  };

  app.undoDraw=()=>{
    if(!s.drawPoints.length)return;
    s.drawPoints.pop();app.renderDrawing();app.$('draw-finish').disabled=s.drawPoints.length<3;app.$('draw-help').textContent=`Добавени точки: ${s.drawPoints.length}.`;
  };

  app.cancelDraw=()=>{
    s.drawing=false;s.drawPoints=[];s.pendingGeometry=null;s.drawingLayer.clearLayers();app.$('draw-toolbar').classList.remove('active');app.setStatus('Очертаването е отменено.');
  };

  app.finishDraw=()=>{
    if(s.drawPoints.length<3)return;
    s.pendingGeometry=s.drawPoints.map(([lat,lon])=>({lat,lon}));s.drawing=false;app.$('draw-toolbar').classList.remove('active');app.openModal('proposal-modal');
  };

  app.saveProposal=event=>{
    event.preventDefault();if(!s.pendingGeometry?.length)return app.setStatus('Липсва очертание на зоната.','error');
    const photo=app.$('proposal-photo').files?.[0];
    const proposal={
      id:`proposal-${Date.now()}`,name:app.$('proposal-name').value.trim(),access:app.$('proposal-access').value,
      capacity:Number(app.$('proposal-capacity').value||0)||null,evidence:app.$('proposal-evidence').value.trim(),
      photoName:photo?.name||null,geometry:s.pendingGeometry,status:'pending_soulflame',createdAt:new Date().toISOString(),source:'community-local'
    };
    s.proposals.unshift(proposal);app.write(app.STORAGE.proposals,s.proposals);s.pendingGeometry=null;s.drawPoints=[];s.drawingLayer.clearLayers();
    app.$('proposal-form').reset();app.closeModal('proposal-modal');app.renderProposals();app.updateProfile();
    app.setStatus('Предложението е записано като „Чака SoulFlame одобрение“.','success',true);
  };

  app.polygonCenter=points=>({lat:points.reduce((sum,p)=>sum+p.lat,0)/points.length,lon:points.reduce((sum,p)=>sum+p.lon,0)/points.length});

  app.renderProposals=()=>{
    s.proposalLayer?.clearLayers();
    s.proposals.forEach(proposal=>{
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
      const item=document.createElement('div');item.className='proposal-item';
      item.innerHTML=`<b>${app.safe(proposal.name)}</b><span>Чака SoulFlame одобрение</span><small>${new Date(proposal.createdAt).toLocaleString('bg-BG')} · ${proposal.geometry.length} точки${proposal.capacity?` · ${proposal.capacity} места`:''}</small>`;
      item.addEventListener('click',()=>{app.closeModal('proposals-modal');s.map.fitBounds(L.latLngBounds(proposal.geometry.map(point=>[point.lat,point.lon])).pad(.3));app.setStatus(`Показвам предложението „${proposal.name}“.`,'success')});
      root.appendChild(item);
    });
  };

  app.clearLocalData=()=>{
    if(!confirm('Да изтрия ли локалните запазени паркинги и предложения от това устройство?'))return;
    s.saved=[];s.proposals=[];app.write(app.STORAGE.saved,[]);app.write(app.STORAGE.proposals,[]);app.renderProposals();app.renderParkings?.();app.updateProfile();app.closeModal('profile-modal');app.setStatus('Локалните данни са изтрити.','success');
  };
})();
