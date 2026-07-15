(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const selectDestination=app.selectDestination;

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
})();
