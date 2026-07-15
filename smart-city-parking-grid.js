(()=>{
  'use strict';
  const app=window.SFMap,s=app.state;

  app.parkingGridBoxes=(center,requested,national)=>{
    const bounds=app.BG_BOUNDS;
    const latDelta=national?99:requested/110900;
    const lonScale=Math.max(.25,Math.cos(center.lat*Math.PI/180));
    const lonDelta=national?99:requested/(110900*lonScale);
    const south=Math.max(bounds.south,center.lat-latDelta);
    const north=Math.min(bounds.north,center.lat+latDelta);
    const west=Math.max(bounds.west,center.lon-lonDelta);
    const east=Math.min(bounds.east,center.lon+lonDelta);
    const cell=1.55;
    const boxes=[];

    for(let cellSouth=south;cellSouth<north;cellSouth+=cell){
      for(let cellWest=west;cellWest<east;cellWest+=cell){
        const box={
          south:Number(cellSouth.toFixed(5)),
          north:Number(Math.min(north,cellSouth+cell).toFixed(5)),
          west:Number(cellWest.toFixed(5)),
          east:Number(Math.min(east,cellWest+cell).toFixed(5))
        };
        if(!national){
          const closest={
            lat:Math.max(box.south,Math.min(center.lat,box.north)),
            lon:Math.max(box.west,Math.min(center.lon,box.east))
          };
          if(app.distance(center,closest)>requested+1500)continue;
        }
        boxes.push(box);
      }
    }
    return boxes;
  };

  app.fetchParkingCell=async box=>{
    const query=new URLSearchParams({
      south:String(box.south),north:String(box.north),west:String(box.west),east:String(box.east)
    });
    const response=await fetch(`/api/parking-grid?${query}`);
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Parking grid error');
    return(Array.isArray(data.parkings)?data.parkings:[]).map(item=>({
      type:'parking-grid',id:item.id,lat:Number(item.lat),lon:Number(item.lon),
      tags:{amenity:'parking',name:item.name||'',capacity:item.capacity||'',fee:item.fee||'',access:item.access||'',parking:item.parking||'',covered:item.covered||'',wheelchair:item.wheelchair||''}
    }));
  };

  app.renderWideParking=(elements,requested,national)=>{
    const center=app.centerPoint();
    app.layers.parking.clearLayers();
    const visible=elements.map(el=>({el,point:app.pointOf(el)}))
      .filter(x=>x.point&&(national||app.distance(center,x.point)<=requested))
      .sort((a,b)=>app.distance(center,a.point)-app.distance(center,b.point));
    s.parkingCandidates=visible;
    app.updateNearestParking?.();

    visible.forEach(({el,point})=>{
      const tags=el.tags||{},name=tags.name||'Паркинг',details=app.parkingDetails(tags);
      const nearest=s.nearestParking&&s.nearestParking.el.id===el.id&&s.nearestParking.el.type===el.type;
      const marker=nearest
        ? L.marker([point.lat,point.lon],{icon:app.markerIcon(app.defs.parking,true)})
        : L.circleMarker([point.lat,point.lon],{renderer:app.canvasRenderer,radius:4,weight:1,color:'#fff',fillColor:'#2563eb',fillOpacity:.9});
      marker.bindPopup(`<b>${app.safe(name)}</b><br>Паркинг${details?`<br>${app.safe(details)}`:''}<br><small>OSM данни · без live потвърждение</small>`).addTo(app.layers.parking);
      if(nearest)s.nearestMarker=marker;
    });
    return visible.length;
  };

  app.loadWideParking=async(requested,version)=>{
    const center=app.centerPoint(),national=app.radius()>=250000;
    const boxes=app.parkingGridBoxes(center,requested,national),merged=new Map();
    const button=document.querySelector('[data-layer="parking"]');
    let failedCells=0,completed=0;
    s.nationalParkingLoading=true;s.nationalParkingCells=boxes.length;
    button?.classList.add('loading');button?.classList.remove('error');
    app.layers.parking.clearLayers();

    for(let index=0;index<boxes.length;index+=4){
      const settled=await Promise.allSettled(boxes.slice(index,index+4).map(app.fetchParkingCell));
      if(version!==s.requestVersion||!app.enabled.has('parking'))return{key:'parking',ignored:true};
      settled.forEach(result=>{
        completed+=1;
        if(result.status==='rejected'){failedCells+=1;console.warn('Parking region failed',result.reason);return}
        result.value.forEach(element=>merged.set(element.id||`${element.lat},${element.lon}`,element));
      });
      app.setStatus(`Паркинги: ${completed}/${boxes.length} региона · намерени ${merged.size}…`,'info',true);
    }

    const count=app.renderWideParking([...merged.values()],requested,national);
    s.nationalParkingLoading=false;
    button?.classList.remove('loading');
    if(failedCells)button?.classList.add('error');
    return{key:'parking',count,failedCells,national,regions:boxes.length};
  };
})();
