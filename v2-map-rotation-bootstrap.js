(()=>{
  'use strict';

  if(!window.L?.Map)return;

  const rotationSupported=typeof L.Map.prototype.setBearing==='function';
  window.SFMapRotationPluginReady=rotationSupported;

  if(!rotationSupported){
    console.error('[SF map rotation] leaflet-rotate did not load');
    return;
  }

  L.Map.mergeOptions({
    rotate:true,
    bearing:0,
    touchRotate:false,
    shiftKeyRotate:false,
    rotateControl:false,
    trackContainerMutation:true
  });
})();