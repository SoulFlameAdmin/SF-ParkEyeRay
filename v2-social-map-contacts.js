(()=>{
  'use strict';

  const TWINS_URL='https://soulflame-twins.vercel.app';
  const CATEGORY={family:'Семейство',friends:'Приятели',work:'Работа',business:'Бизнес'};
  const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const normalizeCircle=value=>{
    const circle=String(value||'friends').toLowerCase();
    if(circle==='family')return'family';
    if(circle==='work')return'work';
    if(['business','project'].includes(circle))return'business';
    return'friends';
  };
  const initials=value=>String(value||'SF').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'SF';
  const waitForSocialMap=()=>new Promise(resolve=>{
    const timer=setInterval(()=>{
      if(window.SFV2?.socialMap?.client){clearInterval(timer);resolve(window.SFV2)}
    },80);
  });

  waitForSocialMap().then(app=>{
    const state=app.socialMap;
    const root=document.createElement('section');
    root.className='people-contact-dock';
    root.setAttribute('aria-label','Хора на картата');
    root.innerHTML=`
      <header class="people-contact-head">
        <div><b>Хора</b><small id="people-contact-summary">Зареждам…</small></div>
        <button id="people-contact-toggle" type="button" aria-expanded="true">Скрий</button>
      </header>
      <div id="people-contact-list" class="people-contact-list"></div>`;
    document.body.appendChild(root);

    const summary=root.querySelector('#people-contact-summary');
    const list=root.querySelector('#people-contact-list');
    const toggle=root.querySelector('#people-contact-toggle');
    let lastSignature='';

    const profileUrl=userId=>{
      const url=new URL('/frontend/FRONTEND/user/profile/index.html',TWINS_URL);
      url.searchParams.set('user',userId);
      return url.toString();
    };
    const personName=person=>person.twin_name||person.full_name||'SoulFlame потребител';
    const statusOf=person=>{
      if(person.is_live)return{key:'live',label:'LIVE',detail:'Обновява се сега'};
      if(person.location_state==='last_known')return{key:'last-known',label:'Последна известна',detail:'Показва последния разрешен GPS сигнал'};
      if(person.location_state==='needs_permission')return{key:'needs-permission',label:'Чака разрешение',detail:'Поискай live достъп'};
      if(person.location_state==='sharing_off')return{key:'sharing-off',label:'Локацията е изключена',detail:'Човекът трябва да я включи'};
      return{key:'offline',label:'Офлайн',detail:'Няма записана GPS позиция'};
    };
    const visiblePeople=()=>{
      const filter=state.filter||'all';
      return filter==='all' ? state.people : state.people.filter(person=>normalizeCircle(person.circle)===filter);
    };
    const avatarHtml=person=>{
      const avatar=person.twin_avatar_url||person.avatar_url;
      return avatar?`<img src="${safe(avatar)}" alt="">`:safe(initials(personName(person)));
    };

    const render=()=>{
      root.hidden=!state.user;
      if(!state.user)return;
      const people=visiblePeople();
      const liveCount=people.filter(person=>person.is_live).length;
      const knownCount=people.filter(person=>person.location_state==='last_known').length;
      summary.textContent=`${people.length} добавени · ${liveCount} live${knownCount?` · ${knownCount} последни`:''}`;
      list.innerHTML=people.length?people.map(person=>{
        const status=statusOf(person);
        const circle=normalizeCircle(person.circle);
        const canLocate=person.is_live||person.location_state==='last_known';
        return `<article class="people-contact-card ${circle} ${status.key}" data-contact-id="${safe(person.user_id)}">
          <button class="people-contact-main" type="button" data-contact-open="${safe(person.user_id)}" title="${safe(status.detail)}">
            <span class="people-contact-avatar">${avatarHtml(person)}<i></i></span>
            <span class="people-contact-copy"><b>${safe(personName(person))}</b><small>${safe(CATEGORY[circle])}</small><em>${safe(status.label)}</em></span>
          </button>
          ${canLocate
            ? `<button class="people-contact-action ${person.is_live?'live':'last-known'}" type="button" data-contact-locate>${person.is_live?'Покажи LIVE':'Покажи последна'}</button>`
            : person.location_state==='needs_permission'
              ? '<button class="people-contact-action" type="button" data-contact-request>Поискай live</button>'
              : `<a class="people-contact-action" href="${safe(profileUrl(person.user_id))}">Профил</a>`}
        </article>`;
      }).join(''):'<div class="people-contact-empty">Няма хора в този филтър.</div>';
    };

    const requestLive=async(button,person)=>{
      button.disabled=true;
      const oldText=button.textContent;
      button.textContent='Изпращам…';
      try{
        const {data,error}=await state.client.rpc('sf_request_live_location',{p_target:person.user_id});
        if(error)throw error;
        if(data?.ok===false)throw new Error(data.error||'Заявката не беше изпратена');
        button.textContent='Изпратено ✓';
        button.classList.add('sent');
        app.setStatus?.(`Изпрати заявка за live локация до ${personName(person)}.`,'success');
      }catch(error){
        console.error('[SF live request]',error);
        button.textContent=oldText;
        button.disabled=false;
        app.setStatus?.('Не успях да изпратя заявката за live локация.','error');
      }
    };

    list.addEventListener('click',event=>{
      const card=event.target.closest('[data-contact-id]');
      if(!card)return;
      const person=state.people.find(item=>item.user_id===card.dataset.contactId);
      if(!person)return;
      if(event.target.closest('[data-contact-request]')){
        event.preventDefault();
        requestLive(event.target.closest('[data-contact-request]'),person);
        return;
      }
      if(event.target.closest('[data-contact-locate]')||event.target.closest('[data-contact-open]')){
        event.preventDefault();
        const marker=state.markers.get(person.user_id);
        if(marker){
          app.state.followUser=false;
          app.state.map.flyTo(marker.getLatLng(),17,{animate:true,duration:.55});
          marker.openPopup();
        }else{
          location.href=profileUrl(person.user_id);
        }
      }
    });

    toggle.addEventListener('click',()=>{
      const collapsed=root.classList.toggle('collapsed');
      toggle.textContent=collapsed?'Покажи':'Скрий';
      toggle.setAttribute('aria-expanded',String(!collapsed));
    });

    document.addEventListener('click',event=>{
      if(event.target.closest('[data-people-filter]'))setTimeout(render,0);
    });

    const sync=()=>{
      const signature=JSON.stringify({
        user:state.user?.id||null,
        filter:state.filter,
        people:state.people.map(person=>[
          person.user_id,person.full_name,person.twin_name,person.circle,
          person.location_state,person.is_live,person.location_updated_at,
          person.latitude,person.longitude
        ])
      });
      if(signature!==lastSignature){lastSignature=signature;render()}
    };
    sync();
    const timer=setInterval(sync,500);
    window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  }).catch(error=>console.error('[SF contacts dock]',error));
})();