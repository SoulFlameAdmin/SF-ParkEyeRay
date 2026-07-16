(()=>{
  'use strict';
  const app=window.SFV2,s=app.state;
  const EARTH_METERS_PER_DEGREE=111320;
  let badge=null;
  let lastQuality=0;
  let lastCalibrationHintAt=0;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const rad=value=>value*Math.PI/180;
  const normalize=value=>((Number(value)||0)%360+360)%360;
  const angleDelta=(a,b)=>Math.abs(((normalize(b)-normalize(a)+540)%360)-180);

  const ensureBadge=()=>{
    if(badge?.isConnected)return badge;
    badge=document.createElement('div');
    badge.id='heading-confidence';
    badge.className='heading-confidence';
    badge.setAttribute('role','status');
    badge.setAttribute('aria-live','polite');
    badge.innerHTML='<span></span><b>Посока</b><small>изчакване</small>';
    document.body.appendChild(badge);
    if(!document.getElementById('heading-confidence-style')){
      const style=document.createElement('style');
      style.id='heading-confidence-style';
      style.textContent=`
        .heading-confidence{position:fixed;z-index:1175;left:14px;bottom:18px;display:grid;grid-template-columns:8px auto;align-items:center;gap:2px 7px;padding:8px 10px;border:1px solid #ffffff24;border-radius:14px;background:rgba(8,17,31,.88);color:#fff;box-shadow:0 8px 24px #0005;backdrop-filter:blur(14px);pointer-events:none;transition:opacity .2s ease,transform .2s ease}
        .heading-confidence>span{grid-row:1/3;width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 4px #f59e0b22}
        .heading-confidence b{font-size:11px;line-height:1}.heading-confidence small{color:#cbd5e1;font-size:9px;line-height:1.1}
        .heading-confidence.good>span{background:#22c55e;box-shadow:0 0 0 4px #22c55e22}.heading-confidence.weak>span{background:#ef4444;box-shadow:0 0 0 4px #ef444422}
        .navigation-active .heading-confidence{bottom:96px}.drawing-mode .heading-confidence,.sheet-expanded .heading-confidence{opacity:0;transform:translateY(8px)}
        @media(max-width:560px){.heading-confidence{left:8px;bottom:max(10px,env(safe-area-inset-bottom));padding:7px 9px}}
      `;
      document.head.appendChild(style);
    }
    return badge;
  };

  const qualityScore=()=>{
    const marker=s.userMarker?.getElement()?.querySelector('.user-position-marker');
    if(!s.user||!marker)return 0;
    const accuracy=Math.max(1,Number(s.user.accuracy||999));
    const gpsScore=clamp(1-(accuracy-4)/46,0,1);
    const hasHeading=marker.classList.contains('heading-live');
    const compassWeak=marker.classList.contains('compass-weak');
    const gpsWeak=marker.classList.contains('gps-weak');
    const sourceScore=!hasHeading?.12:compassWeak?.48:gpsWeak?.62:.94;
    const movingBonus=Number(s.user.speed||0)>=6&&Number.isFinite(Number(s.user.heading))?.08:0;
    return Math.round(clamp((gpsScore*.42+sourceScore*.58+movingBonus)*100,0,100));
  };

  const updateBadge=()=>{
    const node=ensureBadge();
    const score=qualityScore();
    lastQuality=score;
    node.classList.toggle('good',score>=72);
    node.classList.toggle('weak',score<42);
    node.querySelector('b').textContent=`Посока ${score}%`;
    node.querySelector('small').textContent=score>=72?'стабилна':score>=42?'изглаждам':'калибрирай телефона';
    node.setAttribute('aria-label',`Надеждност на посоката ${score} процента`);
  };

  const toLocal=(point,origin)=>({
    x:(point.lon-origin.lon)*EARTH_METERS_PER_DEGREE*Math.cos(rad(origin.lat)),
    y:(point.lat-origin.lat)*EARTH_METERS_PER_DEGREE
  });

  const closestRoutePoint=(user,route)=>{
    if(!route?.points||route.points.length<2)return null;
    let best=null;
    for(let i=0;i<route.points.length-1;i++){
      const a=route.points[i],b=route.points[i+1],origin=a;
      const av=toLocal(a,origin),bv=toLocal(b,origin),pv=toLocal(user,origin);
      const dx=bv.x-av.x,dy=bv.y-av.y,len2=dx*dx+dy*dy;
      const t=len2?clamp(((pv.x-av.x)*dx+(pv.y-av.y)*dy)/len2,0,1):0;
      const qx=av.x+t*dx,qy=av.y+t*dy;
      const distance=Math.hypot(pv.x-qx,pv.y-qy);
      if(!best||distance<best.distance){
        const lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;
        const bearing=normalize(Math.atan2(Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)),Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon)))*180/Math.PI);
        best={lat,lon,distance,bearing};
      }
    }
    return best;
  };

  const originalApply=app.applyUserPosition;
  app.applyUserPosition=(user,options={})=>{
    const accepted=originalApply(user,options);
    if(!accepted)return false;
    const route=s.navigationRoute;
    const speed=Number(user.speed||0);
    const accuracy=Number(user.accuracy||999);
    if(s.navigationActive&&route&&speed>=4&&accuracy<=35&&s.userMarker){
      const snap=closestRoutePoint(user,route);
      const heading=Number(user.heading);
      const directionOk=!Number.isFinite(heading)||angleDelta(heading,snap?.bearing)<=58;
      const threshold=Math.max(10,Math.min(30,accuracy*.9));
      if(snap&&snap.distance<=threshold&&directionOk&&lastQuality>=45){
        s.userMarker.setLatLng([snap.lat,snap.lon]);
        s.userMarker.getElement()?.querySelector('.user-position-marker')?.classList.add('route-snapped');
      }else s.userMarker.getElement()?.querySelector('.user-position-marker')?.classList.remove('route-snapped');
    }
    return true;
  };

  const originalLocate=app.locate;
  app.locate=async(...args)=>{
    const result=await originalLocate(...args);
    if(lastQuality<42&&Date.now()-lastCalibrationHintAt>12000){
      lastCalibrationHintAt=Date.now();
      app.setStatus('Калибриране: дръж телефона далеч от метал и направи бавно движение като цифрата 8.','info',true);
    }
    return result;
  };

  app.headingQuality=()=>({score:lastQuality,level:lastQuality>=72?'good':lastQuality>=42?'fair':'weak'});
  setInterval(updateBadge,500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(updateBadge,250)});
})();
