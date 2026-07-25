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
  const ageLabel=date=>{
    if(!date)return'няма GPS запис';
    const timestamp=Date.parse(date);
    if(!Number.isFinite(timestamp))return'няма GPS запис';
    const ms=Date.now()-timestamp;
    if(ms<0)return'сега';
    const minutes=Math.floor(ms/60000);
    if(minutes<1)return'сега';
    if(minutes<60)return`преди ${minutes} мин`;
    const hours=Math.floor(minutes/60);
    if(hours<24)return`преди ${hours} ч`;
    const days=Math.floor(hours/24);
    if(days<30)return`преди ${days} дни`;
    const months=Math.floor(days/30);
    if(months<12)return`преди ${months} мес`;
    return`преди ${Math.floor(months/12)} г`;
  };
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
    const mapUrl=userId=>{
      const url=new URL('/map',TWINS_URL);
      url.searchParams.set('person',userId);
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
    const signalItems=person=>{
      const items=[];
      if(person.share_speed&&Number.isFinite(Number(person.speed_kmh))){
        const icon=person.vehicle_detected?'🚗':'↗';
        items.push({key:'speed',text:`${icon} ${Math.round(Number(person.speed_kmh))} km/h`});
      }
      if(person.share_battery&&Number.isFinite(Number(person.battery_percent))){
        items.push({key:'battery',text:`${person.battery_charging?'⚡':'🔋'} ${Math.max(0,Math.min(100,Math.round(Number(person.battery_percent))))}%`});
      }
      if(person.share_navigation)items.push({key:'navigation',text:'🧭 Навигация'});
      if(person.share_ar_presence)items.push({key:'ar',text:'AR'});
      if(person.share_twin_activity)items.push({key:'twin',text:'Twin активност'});
      if(person.share_milestones)items.push({key:'milestones',text:'Milestones'});
      return items;
    };
    const signalsHtml=person=>{
      const items=signalItems(person);
      if(!items.length)return'';
      return `<div class="people-contact-signals">${items.map(item=>`<span class="people-signal ${safe(item.key)}">${safe(item.text)}</span>`).join('')}</div>`;
    };
    const enhancedPopup=person=>{
      const avatar=person.twin_avatar_url||person.avatar_url;
      const photo=avatar?`<img src="${safe(avatar)}" alt="">`:safe(initials(personName(person)));
      const status=person.is_live?'LIVE':person.location_state==='last_known'?'Последна известна':'Офлайн';
      const accuracy=Number.isFinite(Number(person.location_accuracy))?` · точност ±${Math.round(Number(person.location_accuracy))} м`:'';
      const items=signalItems(person);
      const details=items.length
        ? `<div class="people-popup-permissions">${items.map(item=>`<span class="${safe(item.key)}">${safe(item.text)}</span>`).join('')}</div>`
        : '<div class="people-popup-permissions empty">Няма други разрешени live данни.</div>';
      return `<div class="people-popup">
        <div class="people-popup-head">
          <div class="people-popup-avatar">${photo}</div>
          <div><b>${safe(personName(person))}</b><small>${safe(CATEGORY[normalizeCircle(person.circle)])}${person.profile_type==='business'?' · Business Twin':''}</small></div>
        </div>
        <div class="people-popup-meta"><b>${safe(status)}</b> · ${safe(ageLabel(person.location_updated_at))}${safe(accuracy)}</div>
        ${details}
        <div class="people-popup-actions">
          <a href="${safe(profileUrl(person.user_id))}">Twin профил</a>
          <a class="secondary" href="${safe(mapUrl(person.user_id))}">Сподели картата</a>
        </div>
      </div>`;
    };
    const refreshMarkerPopups=people=>{
      people.forEach(person=>{
        const marker=state.markers.get(person.user_id);
        if(marker)marker.setPopupContent(enhancedPopup(person));
      });
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
          ${signalsHtml(person)}
          ${canLocate
            ? `<button class="people-contact-action ${person.is_live?'live':'last-known'}" type="button" data-contact-locate>${person.is_live?'Покажи LIVE':'Покажи последна'}</button>`
            : person.location_state==='needs_permission'
              ? '<button class="people-contact-action" type="button" data-contact-request>Поискай live</button>'
              : `<a class="people-contact-action" href="${safe(profileUrl(person.user_id))}">Профил</a>`}
        </article>`;
      }).join(''):'<div class="people-contact-empty">Няма хора в този филтър.</div>';
      refreshMarkerPopups(people);
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
          marker.setPopupContent(enhancedPopup(person));
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
          person.latitude,person.longitude,person.location_accuracy,
          person.share_speed,person.speed_kmh,person.vehicle_detected,person.speed_updated_at,
          person.share_battery,person.battery_percent,person.battery_charging,person.battery_updated_at,
          person.share_navigation,person.share_ar_presence,person.share_twin_activity,person.share_milestones
        ])
      });
      if(signature!==lastSignature){lastSignature=signature;render()}
      else refreshMarkerPopups(visiblePeople());
    };
    sync();
    const timer=setInterval(sync,500);
    window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  }).catch(error=>console.error('[SF contacts dock]',error));
})();