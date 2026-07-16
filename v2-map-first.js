(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const selectDestination=app.selectDestination;
  const setDrawingMode=app.setDrawingMode;

  app.selectDestination=item=>{
    app.abortRequest?.('nearbyParking');
    s.parkingContext='destination';
    s.layers.parking=true;
    app.write(app.STORAGE.layers,s.layers);
    app.syncLayerControls?.();
    app.closeMapMenu?.();
    selectDestination(item);
    app.setSheetCollapsed(true);
  };

  app.setDrawingMode=active=>{
    setDrawingMode(active);
    if(!s.map)return;
    if(active){
      if(s.map.hasLayer(s.parkingLayer))s.map.removeLayer(s.parkingLayer);
      if(s.map.hasLayer(s.fuelLayer))s.map.removeLayer(s.fuelLayer);
    }else{
      if(s.layers.parking&&!s.map.hasLayer(s.parkingLayer))s.parkingLayer.addTo(s.map);
      if(s.layers.fuel&&!s.map.hasLayer(s.fuelLayer))s.fuelLayer.addTo(s.map);
    }
  };
})();
