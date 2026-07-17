(()=>{
  'use strict';
  const normalize=value=>((Number(value)||0)%360+360)%360;
  const delta=(from,to)=>((to-from+540)%360)-180;
  const screenAngle=()=>normalize(Number(screen.orientation?.angle??window.orientation??0));
  let compassHeading=null;
  let compassAt=0;

  const onOrientation=event=>{
    let heading=null;
    if(Number.isFinite(event.webkitCompassHeading)){
      heading=Number(event.webkitCompassHeading);
    }else if(Number.isFinite(event.alpha)){
      heading=360-Number(event.alpha)+screenAngle();
    }
    if(!Number.isFinite(heading))return;
    compassHeading=normalize(heading);
    compassAt=performance.now();
  };

  window.addEventListener('deviceorientationabsolute',onOrientation,true);
  window.addEventListener('deviceorientation',onOrientation,true);

  const frame=()=>{
    const app=window.SFV2;
    const state=app?.state;
    const marker=state?.userMarker?.getElement?.()?.querySelector('.user-position-marker');
    if(marker){
      const speed=Number(state.user?.speed||0);
      const gpsHeading=Number(state.user?.heading);
      const compassFresh=Number.isFinite(compassHeading)&&performance.now()-compassAt<1800;
      let absoluteHeading=null;
      if(speed>=7&&Number.isFinite(gpsHeading))absoluteHeading=normalize(gpsHeading);
      else if(compassFresh)absoluteHeading=compassHeading;
      else if(Number.isFinite(gpsHeading))absoluteHeading=normalize(gpsHeading);

      if(Number.isFinite(absoluteHeading)){
        const mapBearing=normalize(Number(state.mapBearing||state.navigationMapBearing||0));
        const relativeHeading=normalize(absoluteHeading-mapBearing);
        const current=parseFloat(marker.style.getPropertyValue('--heading'))||0;
        const corrected=normalize(current+delta(current,relativeHeading));
        marker.style.setProperty('--sf-correct-heading',`${corrected.toFixed(2)}deg`);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();