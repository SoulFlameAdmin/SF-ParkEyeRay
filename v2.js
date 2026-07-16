(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  const onboardingDone=localStorage.getItem('smartcity_onboarding_version')==='3';
  const localAutomation=['localhost','127.0.0.1'].includes(location.hostname);
  if(!onboardingDone&&!localAutomation&&params.get('skipOnboarding')!=='1'){
    const next=`${location.pathname}${location.search}`;
    location.replace(`/intro.html?next=${encodeURIComponent(next)}`);
    return;
  }
  ['/v2-waze.css','/v2-auth.css'].forEach(href=>{
    if(!document.querySelector(`link[href="${href}"]`)){const style=document.createElement('link');style.rel='stylesheet';style.href=href;document.head.appendChild(style)}
  });
  const scripts=[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    '/smartcity-config.js','/smartcity-auth.js',
    '/v2-core.js','/v2-ui.js','/v2-parking.js','/v2-destinations.js','/v2-parking-engine.js','/v2-layers.js','/v2-map-first.js','/v2-route.js','/v2-navigation.js',
    '/v2-submission-adapter.js','/v2-proposals.js','/v2-auth-ui.js','/v2-init.js'
  ];
  async function load(){
    for(const src of scripts){
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
