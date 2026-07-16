(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  const onboardingDone=localStorage.getItem('smartcity_onboarding_version')==='3';
  if(!onboardingDone&&params.get('skipOnboarding')!=='1'){
    const next=`${location.pathname}${location.search}`;
    location.replace(`/intro.html?next=${encodeURIComponent(next)}`);
    return;
  }
  if(!document.querySelector('link[href="/v2-waze.css"]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/v2-waze.css';document.head.appendChild(style);
  }
  const modules=['/v2-core.js','/v2-ui.js','/v2-parking.js','/v2-destinations.js','/v2-parking-engine.js','/v2-layers.js','/v2-map-first.js','/v2-route.js','/v2-navigation.js','/v2-proposals.js','/v2-init.js'];
  async function load(){
    for(const src of modules){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(`Failed to load ${src}`));document.body.appendChild(script);
      });
    }
  }
  load().catch(error=>{
    console.error(error);
    const status=document.getElementById('status');if(status){status.textContent='SmartCity V2 не можа да се стартира. Презареди страницата.';status.className='status-pill error'}
    const retry=document.getElementById('global-retry');if(retry){retry.hidden=false;retry.textContent='Презареди';retry.onclick=()=>location.reload()}
  });
})();
