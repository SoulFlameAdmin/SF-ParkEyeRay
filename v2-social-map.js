(()=>{
  'use strict';

  const SUPABASE_URL='https://frhletkiuupgksmgxoxc.supabase.co';
  const SUPABASE_KEY='sb_publishable_JQPnalB8jOs639_PWoR6mA_AOk11xWC';
  const TWINS_URL='https://soulflame-twins.vercel.app';
  const REFRESH_MS=30000;
  const CATEGORY={family:'Семейство',friends:'Приятели',business:'Бизнес',all:'Всички'};
  const normalizeCircle=value=>{
    const circle=String(value||'friends').toLowerCase();
    if(circle==='family')return'family';
    if(['business','work','project'].includes(circle))return'business';
    return'friends';
  };
  const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const initials=value=>String(value||'SF').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'SF';
  const waitForApp=()=>new Promise(resolve=>{
    const timer=setInterval(()=>{
      if(window.SFV2?.state?.map&&window.supabase?.createClient){clearInterval(timer);resolve(window.SFV2)}
    },50);
  });

  waitForApp().then(async app=>{
    const s=app.state;
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const focusTarget=new URLSearchParams(location.search).get('person');
    const state={
      client,user:null,filter:'all',people:[],markers:new Map(),
      layer:L.layerGroup().addTo(s.map),channel:null,watchId:null,
      shareLocation:false,lastPublishAt:0,refreshTimer:null,
      focusTarget,focusHandled:false
    };
    app.socialMap=state;

    const bar=document.createElement('div');
    bar.className='people-map-bar';
    bar.innerHTML=`
      <button class="people-map-filter active" data-people-filter="all" type="button">Всички</button>
      <button class="people-map-filter" data-people-filter="family" type="button">Семейство</button>
      <button class="people-map-filter" data-people-filter="friends" type="button">Приятели</button>
      <button class="people-map-filter" data-people-filter="business" type="button">Бизнес</button>
      <span class="people-map-count" id="people-map-count">0</span>
      <button class="people-map-share" id="people-map-share" type="button">Локация: изкл.</button>`;
    document.body.appendChild(bar);

    const login=document.createElement('div');
    login.className='people-map-login';
    login.hidden=true;
    login.innerHTML='<b>Влез в Twins, за да виждаш хората си на картата</b><br><small>Показват се само приети приятели, които са ти разрешили live достъп.</small><br><button type="button">Вход с Google</button>';
    document.body.appendChild(login);

    const focusNotice=document.createElement('div');
    focusNotice.className='people-map-focus-notice';
    focusNotice.hidden=true;
    document.body.appendChild(focusNotice);

    const countNode=bar.querySelector('#people-map-count');
    const shareButton=bar.querySelector('#people-map-share');

    const forceOptionalLayers=()=>{
      s.layers.parking=false;
      if(s.parkingLayer&&s.map.hasLayer(s.parkingLayer))s.map.removeLayer(s.parkingLayer);
      document.getElementById('parking-sheet')?.classList.add('layer-disabled');
      const parkingButton=document.getElementById('parking-layer-btn');
      if(parkingButton){
        parkingButton.setAttribute('aria-pressed','false');
        parkingButton.classList.remove('enabled','active');
        parkingButton.querySelector('.switch')?.classList.remove('on');
      }
      try{localStorage.setItem('sf_v2_map_layers',JSON.stringify({parking:false,fuel:Boolean(s.layers.fuel)}))}catch{}
    };
    forceOptionalLayers();

    const originalToggleLayer=app.toggleLayer;
    if(typeof originalToggleLayer==='function')app.toggleLayer=(name,...args)=>{
      const result=originalToggleLayer(name,...args);
      if(name==='parking')document.getElementById('parking-sheet')?.classList.toggle('layer-disabled',!s.layers.parking);
      return result;
    };

    const profileUrl=userId=>{
      const url=new URL('/frontend/FRONTEND/user/profile/index.html',TWINS_URL);
      url.searchParams.set('user',userId);
      return url.toString();
    };
    const mapUrl=person=>{
      const url=new URL(location.pathname,location.origin);
      url.searchParams.set('person',person.user_id);
      return url.toString();
    };
    const ageLabel=date=>{
      const ms=Date.now()-new Date(date||0).getTime();
      if(!Number.isFinite(ms)||ms<0)return'сега';
      const seconds=Math.floor(ms/1000);
      if(seconds<15)return'сега';
      if(seconds<60)return`преди ${seconds} сек`;
      const minutes=Math.floor(seconds/60);
      return minutes<60?`преди ${minutes} мин`:`преди ${Math.floor(minutes/60)} ч`;
    };
    const personIcon=person=>{
      const category=normalizeCircle(person.circle);
      const avatar=person.twin_avatar_url||person.avatar_url;
      const photo=avatar?`<img src="${safe(avatar)}" alt="">`:safe(initials(person.twin_name||person.full_name));
      return L.divIcon({className:'',iconSize:[48,58],iconAnchor:[24,54],popupAnchor:[0,-52],html:`<div class="people-marker ${category}"><div class="people-marker-avatar">${photo}</div><span class="people-marker-label">${safe(person.twin_name||person.full_name)}</span></div>`});
    };
    const popupHtml=person=>{
      const avatar=person.twin_avatar_url||person.avatar_url;
      const photo=avatar?`<img src="${safe(avatar)}" alt="">`:safe(initials(person.twin_name||person.full_name));
      const speed=Number.isFinite(Number(person.speed_kmh))?` · ${Math.round(Number(person.speed_kmh))} km/h`:'';
      return `<div class="people-popup"><div class="people-popup-head"><div class="people-popup-avatar">${photo}</div><div><b>${safe(person.twin_name||person.full_name)}</b><small>${safe(CATEGORY[normalizeCircle(person.circle)])}${person.profile_type==='business'?' · Business Twin':''}</small></div></div><div class="people-popup-meta">Обновено ${safe(ageLabel(person.location_updated_at))}${speed}</div><div class="people-popup-actions"><a href="${safe(profileUrl(person.user_id))}" target="_blank" rel="noopener">Twin профил</a><a class="secondary" href="${safe(mapUrl(person))}">Сподели картата</a></div></div>`;
    };

    const showFocusUnavailable=()=>{
      if(!state.focusTarget||!state.user){focusNotice.hidden=true;return}
      focusNotice.hidden=false;
      focusNotice.innerHTML=`<b>Човекът не е видим на картата</b><small>Локацията му е изключена, не е активна или още не ти е разрешен достъп.</small><a href="${safe(profileUrl(state.focusTarget))}">Отвори Twins профила</a><button type="button" data-close-focus>Затвори</button>`;
    };

    const filteredPeople=()=>state.filter==='all'?state.people:state.people.filter(person=>normalizeCircle(person.circle)===state.filter);
    const render=()=>{
      const visible=filteredPeople();
      const visibleIds=new Set(visible.map(person=>person.user_id));
      state.markers.forEach((marker,id)=>{
        if(!visibleIds.has(id)){state.layer.removeLayer(marker);state.markers.delete(id)}
      });
      visible.forEach(person=>{
        const point=[Number(person.latitude),Number(person.longitude)];
        if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))return;
        let marker=state.markers.get(person.user_id);
        if(!marker){
          marker=L.marker(point,{icon:personIcon(person),zIndexOffset:1500}).bindPopup(popupHtml(person));
          marker.addTo(state.layer);state.markers.set(person.user_id,marker);
        }else{
          marker.setLatLng(point);marker.setIcon(personIcon(person));marker.setPopupContent(popupHtml(person));
        }
      });
      countNode.textContent=String(visible.length);

      if(state.focusTarget&&!state.focusHandled){
        const marker=state.markers.get(state.focusTarget);
        if(marker){
          state.focusHandled=true;
          focusNotice.hidden=true;
          s.followUser=false;
          s.map.flyTo(marker.getLatLng(),17,{animate:true,duration:.55});
          marker.openPopup();
        }else if(state.user){
          showFocusUnavailable();
        }
      }
    };

    const refreshPeople=async()=>{
      if(!state.user){state.people=[];render();return}
      const {data,error}=await client.rpc('sf_social_map_people');
      if(error){
        console.error('[SF people map]',error);
        app.setStatus('Хората на картата временно не могат да се обновят.','error');
        return;
      }
      state.people=Array.isArray(data)?data:[];
      render();
    };

    const readOwnShare=async()=>{
      if(!state.user)return;
      const {data}=await client.from('sf_live_presence').select('share_location').eq('user_id',state.user.id).maybeSingle();
      state.shareLocation=Boolean(data?.share_location);
      shareButton.classList.toggle('on',state.shareLocation);
      shareButton.textContent=state.shareLocation?'Локация: вкл.':'Локация: изкл.';
    };

    const publishPosition=async position=>{
      if(!state.user||!state.shareLocation)return;
      const now=Date.now();if(now-state.lastPublishAt<5000)return;state.lastPublishAt=now;
      const coords=position.coords;
      const payload={
        user_id:state.user.id,share_location:true,
        latitude:Number(coords.latitude),longitude:Number(coords.longitude),location_accuracy:Number(coords.accuracy||0),
        speed_kmh:Number.isFinite(coords.speed)?Math.max(0,coords.speed*3.6):null,
        vehicle_detected:Number.isFinite(coords.speed)&&coords.speed*3.6>=12,
        location_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()
      };
      const {error}=await client.from('sf_live_presence').upsert(payload,{onConflict:'user_id'});
      if(error)console.error('[SF people presence]',error);
    };
    const startSharing=()=>{
      if(state.watchId!==null||!navigator.geolocation)return;
      state.watchId=navigator.geolocation.watchPosition(
        publishPosition,
        error=>console.warn('[SF people GPS]',error),
        {enableHighAccuracy:true,maximumAge:2000,timeout:20000}
      );
    };
    const stopSharing=()=>{
      if(state.watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(state.watchId);
      state.watchId=null;
    };
    const setSharing=async enabled=>{
      if(!state.user)return;
      shareButton.disabled=true;
      try{
        const {error}=await client.from('sf_live_presence').upsert({
          user_id:state.user.id,
          share_location:enabled,
          updated_at:new Date().toISOString()
        },{onConflict:'user_id'});
        if(error)throw error;
        state.shareLocation=enabled;
        shareButton.classList.toggle('on',enabled);
        shareButton.textContent=enabled?'Локация: вкл.':'Локация: изкл.';
        if(enabled){
          startSharing();
          navigator.geolocation?.getCurrentPosition(
            publishPosition,
            ()=>app.setStatus('Разреши GPS, за да споделяш live локация.','error'),
            {enableHighAccuracy:true,maximumAge:0,timeout:15000}
          );
        }else{
          stopSharing();
        }
      }catch(error){
        console.error(error);
        app.setStatus('Не успях да променя споделянето на локация.','error');
      }finally{
        shareButton.disabled=false;
      }
    };

    const subscribe=()=>{
      state.channel?.unsubscribe?.();
      state.channel=client.channel(`sf-people-map-${state.user.id}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'sf_live_presence'},refreshPeople)
        .on('postgres_changes',{event:'*',schema:'public',table:'sf_friend_options'},refreshPeople)
        .on('postgres_changes',{event:'*',schema:'public',table:'sf_friend_circle_memberships'},refreshPeople)
        .subscribe();
    };

    const clearLiveSession=()=>{
      clearInterval(state.refreshTimer);
      state.refreshTimer=null;
      state.channel?.unsubscribe?.();
      state.channel=null;
      stopSharing();
    };

    const applySession=async session=>{
      clearLiveSession();
      state.user=session?.user||null;
      login.hidden=Boolean(state.user);
      shareButton.hidden=!state.user;
      focusNotice.hidden=true;
      state.focusHandled=false;
      if(!state.user){state.people=[];render();return}
      await readOwnShare();
      if(state.shareLocation)startSharing();
      subscribe();
      await refreshPeople();
      state.refreshTimer=setInterval(refreshPeople,REFRESH_MS);
    };

    bar.addEventListener('click',event=>{
      const filter=event.target.closest('[data-people-filter]');
      if(filter){
        state.filter=filter.dataset.peopleFilter;
        bar.querySelectorAll('[data-people-filter]').forEach(button=>button.classList.toggle('active',button===filter));
        state.focusHandled=false;
        render();
        return;
      }
      if(event.target.closest('#people-map-share'))setSharing(!state.shareLocation);
    });
    focusNotice.addEventListener('click',event=>{
      if(event.target.closest('[data-close-focus]')){
        focusNotice.hidden=true;
        state.focusHandled=true;
      }
    });
    login.querySelector('button').addEventListener('click',async()=>{
      await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});
    });
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&state.user)refreshPeople();
    });

    const {data:{session}}=await client.auth.getSession();
    await applySession(session);
    client.auth.onAuthStateChange((_event,nextSession)=>applySession(nextSession));
    window.addEventListener('beforeunload',clearLiveSession,{once:true});
  }).catch(error=>console.error('[SF social map boot]',error));
})();
