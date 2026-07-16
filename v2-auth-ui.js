(()=>{
  'use strict';
  const app=window.SFV2;
  const auth=window.SmartCityAuth;
  if(!app||!auth)return;

  function status(text,type='info'){
    const node=document.getElementById('profile-auth-status');
    if(!node)return;
    node.textContent=text||'';
    node.className=`auth-status ${type}`;
  }

  function ensurePanel(){
    const modal=document.querySelector('#profile-modal .modal-card');
    if(!modal||document.getElementById('profile-auth-panel'))return;
    const stats=modal.querySelector('.profile-stats');
    const panel=document.createElement('section');
    panel.id='profile-auth-panel';panel.className='auth-panel';
    panel.innerHTML=`<h3>SoulFlame профил</h3><p>Входът позволява реално изпращане на предложения и синхронизация между устройства.</p><div id="profile-auth-guest" class="auth-grid"><button id="profile-google-login" class="auth-button primary" type="button">Вход с Google</button><input id="profile-auth-email" type="email" autocomplete="email" placeholder="Email за magic link"><button id="profile-email-login" class="auth-button" type="button">Изпрати magic link</button></div><div id="profile-auth-user" class="auth-grid" hidden><div id="profile-auth-identity"></div><div class="auth-row"><a id="profile-moderation-link" class="auth-button moderator" href="/moderation" hidden>Модерация</a><button id="profile-sign-out" class="auth-button" type="button">Изход</button></div></div><div id="profile-auth-status" class="auth-status">Проверявам сесията…</div>`;
    modal.insertBefore(panel,stats);

    document.getElementById('profile-google-login').addEventListener('click',async()=>{
      status('Отварям Google вход…');
      try{await auth.signInWithGoogle(`${location.origin}/v2`)}catch(error){console.error(error);status('Google входът не стартира.','error')}
    });
    document.getElementById('profile-email-login').addEventListener('click',async()=>{
      status('Изпращам magic link…');
      try{await auth.signInWithEmail(document.getElementById('profile-auth-email').value,`${location.origin}/v2`);status('Провери пощата си за вход.','success')}catch(error){console.error(error);status('Magic link не беше изпратен.','error')}
    });
    document.getElementById('profile-sign-out').addEventListener('click',async()=>{
      try{await auth.signOut();status('Излезе от профила.','success')}catch(error){console.error(error);status('Изходът не завърши.','error')}
    });
  }

  async function render(session){
    ensurePanel();
    const guest=document.getElementById('profile-auth-guest');
    const userBlock=document.getElementById('profile-auth-user');
    const identity=document.getElementById('profile-auth-identity');
    const profileTitle=document.querySelector('#profile-modal .profile-block b');
    const profileCopy=document.querySelector('#profile-modal .profile-block span');
    if(!guest||!userBlock)return;

    if(!session?.user){
      guest.hidden=false;userBlock.hidden=true;
      if(profileTitle)profileTitle.textContent='Гост профил';
      if(profileCopy)profileCopy.textContent='Запазените места и неизпратените предложения остават локално на устройството.';
      status('Влез, за да изпращаш предложения към SoulFlame.');
      return;
    }

    guest.hidden=true;userBlock.hidden=false;
    const name=session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.email||'SoulFlame потребител';
    identity.innerHTML=`<b>${app.safe(name)}</b><p>${app.safe(session.user.email||'')}</p>`;
    if(profileTitle)profileTitle.textContent=name;
    if(profileCopy)profileCopy.textContent='Предложенията се пазят в SoulFlame и могат да бъдат модерирани.';
    const moderator=await auth.isModerator();
    document.getElementById('profile-moderation-link').hidden=!moderator;
    status(moderator?'Входът е активен · имаш moderator достъп.':'Входът е активен.','success');
    try{
      const synced=await window.SFV2SubmissionAdapter?.syncMine?.();
      if(Array.isArray(synced)){
        app.state.proposals=synced;
        app.write(app.STORAGE.proposals,synced);
        app.renderProposals?.();app.renderProposalList?.();app.updateProfile?.();
      }
      await window.SFV2SubmissionAdapter?.flushOutbox?.();
    }catch(error){console.error(error);status('Входът е активен, но синхронизацията ще се повтори по-късно.','error')}
  }

  app.initAuthUi=async()=>{
    ensurePanel();
    try{await auth.ready;await render(auth.session)}catch(error){console.error(error);status('Supabase входът временно не е достъпен.','error')}
    auth.onChange(session=>render(session));
  };
})();
