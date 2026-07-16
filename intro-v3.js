(()=>{
  'use strict';
  const VERSION='3';
  const byId=id=>document.getElementById(id);
  const screens=['s1','s2','s3','s4'].map(byId);
  const bars=['p1','p2','p3','p4'].map(byId);
  const counter=byId('counter');
  const next2=byId('next2');
  const profileChip=byId('profile-chip');
  const openApp=byId('open-app');
  const detected=byId('detected');
  const nfcButton=byId('check-nfc');
  let ready=false;
  let scanTimeout=null;

  const requestedNext=new URLSearchParams(location.search).get('next');
  const nextPath=requestedNext&&requestedNext.startsWith('/')&&!requestedNext.startsWith('//')?requestedNext:'/v2';

  function show(index){
    screens.forEach((screen,number)=>screen.classList.toggle('active',number===index));
    bars.forEach((bar,number)=>bar.classList.toggle('done',number<=index));
    counter.textContent=`Стъпка ${index+1} от 4`;
    if(index===2)runCapabilityChecks();
  }

  function setCheck(id,type,state,icon){
    const row=byId(id);
    row.classList.remove('ok','warn');
    if(type)row.classList.add(type);
    row.querySelector('.check-state').textContent=state;
    row.querySelector('.check-icon').textContent=icon;
  }

  function chooseProfile(type){
    localStorage.setItem('parkeyeray_demo_profile',type);
    profileChip.classList.add('show');
    next2.disabled=false;
  }

  function runCapabilityChecks(){
    const secure=window.isSecureContext;
    const gps='geolocation' in navigator;
    const nfc='NDEFReader' in window;
    setCheck('secure-check',secure?'ok':'warn',secure?'Готово':'Нужен HTTPS',secure?'✓':'!');
    setCheck('gps-check',gps?'ok':'warn',gps?'Поддържа се':'Не се поддържа',gps?'✓':'!');
    setCheck('nfc-check',nfc?'ok':'warn',nfc?'Готово за сканиране':'Няма Web NFC',nfc?'✓':'!');
    nfcButton.textContent=nfc?'Сканирай CarTag':'NFC не се поддържа';
    nfcButton.disabled=!nfc;
  }

  function markReady(mode){
    ready=true;
    clearTimeout(scanTimeout);
    detected.classList.add('show');
    detected.textContent=mode==='nfc'?'● NFC CarTag е разпознат':'● CarTag демо режим е готов';
    openApp.disabled=false;
    openApp.textContent='Зареди картата →';
    setCheck('nfc-check',mode==='nfc'?'ok':'warn',mode==='nfc'?'CarTag разпознат':'Демо режим',mode==='nfc'?'✓':'D');
    localStorage.setItem('parkeyeray_cartag_demo',mode);
  }

  async function scanNfc(){
    if(!('NDEFReader' in window))return;
    nfcButton.disabled=true;
    nfcButton.textContent='Доближи телефона до CarTag…';
    setCheck('nfc-check',null,'Изчакване за таг','…');
    try{
      const reader=new NDEFReader();
      await reader.scan();
      reader.addEventListener('reading',()=>markReady('nfc'),{once:true});
      reader.addEventListener('readingerror',()=>{
        setCheck('nfc-check','warn','Тагът не се прочете','!');
        nfcButton.disabled=false;
        nfcButton.textContent='Опитай отново';
      });
      scanTimeout=setTimeout(()=>{
        if(ready)return;
        setCheck('nfc-check','warn','Не е намерен таг','!');
        nfcButton.disabled=false;
        nfcButton.textContent='Опитай отново';
      },10000);
    }catch(error){
      const denied=error&&error.name==='NotAllowedError';
      setCheck('nfc-check','warn',denied?'NFC разрешението е отказано':'NFC не стартира','!');
      nfcButton.disabled=false;
      nfcButton.textContent='Опитай отново';
    }
  }

  function finishOnboarding(){
    if(!ready)return;
    localStorage.setItem('smartcity_onboarding_version',VERSION);
    localStorage.setItem('parkeyeray_onboarding_complete','1');
    show(3);
    const fill=byId('loader-fill');
    const status=byId('loader-status');
    const phases=[
      {delay:120,width:28,index:0,text:'Зареждам картата и GPS режима…'},
      {delay:560,width:64,index:1,text:'Подготвям паркингите и бензиностанциите…'},
      {delay:1000,width:90,index:2,text:'Активирам новото burger меню…'},
      {delay:1430,width:100,index:3,text:'SmartCity е готов.'}
    ];
    phases.forEach(phase=>setTimeout(()=>{
      fill.style.width=`${phase.width}%`;
      status.textContent=phase.text;
      document.querySelectorAll('.loader-step').forEach((item,index)=>{
        item.classList.toggle('done',index<phase.index);
        item.classList.toggle('on',index===phase.index&&phase.index<3);
      });
    },phase.delay));
    setTimeout(()=>location.replace(nextPath),1800);
  }

  byId('next1').addEventListener('click',()=>{
    if(localStorage.getItem('parkeyeray_demo_profile')){
      profileChip.classList.add('show');
      next2.disabled=false;
    }
    show(1);
  });
  byId('google').addEventListener('click',()=>chooseProfile('google-demo'));
  byId('guest').addEventListener('click',()=>{chooseProfile('guest');show(2)});
  next2.addEventListener('click',()=>show(2));
  nfcButton.addEventListener('click',scanNfc);
  byId('demo-detect').addEventListener('click',()=>markReady('demo'));
  openApp.addEventListener('click',finishOnboarding);
})();
