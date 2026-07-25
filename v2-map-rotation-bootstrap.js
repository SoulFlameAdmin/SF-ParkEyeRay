(()=>{
  'use strict';

  if(!window.L?.Map)return;

  const rotationSupported=typeof L.Map.prototype.setBearing==='function';
  window.SFMapRotationPluginReady=rotationSupported;

  if(!rotationSupported){
    console.error('[SF map rotation] leaflet-rotate did not load');
  }else{
    L.Map.mergeOptions({
      rotate:true,
      bearing:0,
      touchRotate:false,
      shiftKeyRotate:false,
      rotateControl:false,
      trackContainerMutation:true
    });
  }

  const addStyle=(href,id)=>{
    if(document.getElementById(id))return;
    const link=document.createElement('link');
    link.id=id;link.rel='stylesheet';link.href=href;
    document.head.appendChild(link);
  };
  const addScript=(src,id,onload)=>{
    if(document.getElementById(id)){onload?.();return}
    const script=document.createElement('script');
    script.id=id;script.src=src;script.defer=true;
    if(onload)script.addEventListener('load',onload,{once:true});
    document.head.appendChild(script);
  };

  addStyle('/v2-social-map.css?v=4.0.0','sf-social-map-css');
  addStyle('/v2-social-map-focus.css?v=4.0.0','sf-social-map-focus-css');
  addStyle('/v2-social-map-contacts.css?v=4.0.0','sf-social-map-contacts-css');
  addScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','sf-supabase-js',()=>{
    addScript('/v2-social-map.js?v=4.0.0','sf-social-map-js',()=>{
      addScript('/v2-social-map-contacts.js?v=4.0.0','sf-social-map-contacts-js');
    });
  });
})();
