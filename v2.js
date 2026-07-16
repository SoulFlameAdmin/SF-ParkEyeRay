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

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(`Failed to load ${src}`));document.body.appendChild(script);
    });
  }

  function installAuthFallback(){
    if(window.SmartCityAuth)return;
    const listeners=new Set();
    window.SmartCityAuth={
      ready:Promise.resolve(null),client:null,session:null,user:null,
      async signInWithGoogle(){throw new Error('authentication_unavailable')},
      async signInWithEmail(){throw new Error('authentication_unavailable')},
      async signOut(){},async isModerator(){return false},async refresh(){return null},
      onChange(listener){listeners.add(listener);return()=>listeners.delete(listener)}
    };
  }

  async function loadOptionalAuth(){
    try{
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await loadScript('/smartcity-config.js');
      await loadScript('/smartcity-auth.js');
    }catch(error){
      console.warn('SmartCity account services are temporarily unavailable.',error);
      installAuthFallback();
    }
  }

  const modules=[
    '/v2-core.js','/v2-ui.js','/v2-parking.js','/v2-destinations.js','/v2-parking-engine.js','/v2-layers.js','/v2-map-first.js','/v2-route.js','/v2-navigation.js',
    '/v2-submission-adapter.js','/v2-proposals.js','/v2-auth-ui.js','/v2-init.js'
  ];
  async function load(){
    await loadOptionalAuth();
    for(const src of modules)await loadScript(src);
  }
  load().catch(error=>{
    console.error(error);
    const status=document.getElementById('status');if(status){status.textContent='SmartCity V2 не можа да се стартира. Презареди страницата.';status.className='status-pill error'}
    const retry=document.getElementById('global-retry');if(retry){retry.hidden=false;retry.textContent='Презареди';retry.onclick=()=>location.reload()}
  });
})();
