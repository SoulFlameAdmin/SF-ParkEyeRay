(()=>{
  'use strict';
  const config=window.SMARTCITY_CONFIG;
  if(!config||!window.supabase?.createClient){
    window.SmartCityAuth={ready:Promise.reject(new Error('supabase_client_unavailable'))};
    return;
  }

  const client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:config.authStorageKey}
  });
  let session=null;
  const listeners=new Set();

  function emit(){
    listeners.forEach(listener=>{try{listener(session)}catch(error){console.error(error)}});
  }

  function normalizeRedirect(value){
    const url=new URL(value||location.href,location.origin);
    if(url.pathname==='/moderation')url.pathname='/moderation.html';
    return url.toString();
  }

  async function refresh(){
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    session=data.session||null;
    emit();
    return session;
  }

  const ready=refresh();
  client.auth.onAuthStateChange((_event,nextSession)=>{
    session=nextSession||null;
    emit();
  });

  async function signInWithGoogle(redirectTo=location.href){
    const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:normalizeRedirect(redirectTo)}});
    if(error)throw error;
    return data;
  }

  async function signInWithEmail(email,redirectTo=location.href){
    const value=String(email||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(value))throw new Error('invalid_email');
    const {data,error}=await client.auth.signInWithOtp({email:value,options:{emailRedirectTo:normalizeRedirect(redirectTo),shouldCreateUser:false}});
    if(error)throw error;
    return data;
  }

  async function signOut(){
    const {error}=await client.auth.signOut();
    if(error)throw error;
  }

  async function isModerator(){
    if(!session?.user)return false;
    const {data,error}=await client.from('parking_moderators').select('role,active').eq('user_id',session.user.id).maybeSingle();
    if(error)return false;
    return Boolean(data?.active);
  }

  window.SmartCityAuth={
    client,ready,refresh,signInWithGoogle,signInWithEmail,signOut,isModerator,
    get session(){return session},
    get user(){return session?.user||null},
    onChange(listener){listeners.add(listener);return()=>listeners.delete(listener)}
  };
})();
