(()=>{
  'use strict';
  const app=window.SFMap={};
  app.RADII=[250000,100000,50000,25000,10000,5000,2500,1000,500,250,100,50,25,10,5,1];
  app.BULGARIA=[42.7339,25.4858];
  app.QUERY_CAP=15000;
  app.REFRESH_MS=120000;
  app.defs={
    parking:{label:'Паркинги',glyph:'P',cls:'m-parking',clause:'nwr["amenity"="parking"]'},
    charging:{label:'Зарядни',glyph:'⚡',cls:'m-charging',clause:'nwr["amenity"="charging_station"]'},
    fuel:{label:'Гориво',glyph:'⛽',cls:'m-fuel',clause:'nwr["amenity"="fuel"]'},
    camera:{label:'Камери',glyph:'◉',cls:'m-camera',clause:'node["highway"="speed_camera"]'},
    signal:{label:'Светофари',glyph:'●',cls:'m-signal',clause:'node["highway"="traffic_signals"]'},
    roadwork:{label:'Ремонти',glyph:'!',cls:'m-roadwork',clause:'nwr["highway"="construction"]'},
    pothole:{label:'Лош път',glyph:'◌',cls:'m-pothole',clause:'nwr["smoothness"~"very_bad|horrible|very_horrible|impassable"]'},
    traffic:{label:'Ограничения',glyph:'↯',cls:'m-traffic',clause:'nwr["access"="no"]["highway"]'}
  };
  app.$=id=>document.getElementById(id);
  app.state={
    map:null,userMarker:null,accuracyCircle:null,radiusCircle:null,routeLine:null,walkLine:null,
    destinationMarker:null,watchId:null,location:null,activeDestination:null,nearestParking:null,
    parkingCandidates:[],follow:true,loading:false,loadTimer:null,lastLoadAt:0,syncingZoom:false,
    pendingRefresh:false,requestVersion:0,lastNamedPoint:null,statusTimer:null
  };
  app.layers=Object.fromEntries(Object.keys(app.defs).map(key=>[key,L.layerGroup()]));
  app.enabled=new Set(['parking','charging']);
  app.markerIcon=(def,nearest=false)=>L.divIcon({
    className:'',html:`<div class="smart-marker ${def.cls}${nearest?' nearest':''}">${def.glyph}</div>`,
    iconSize:nearest?[37,37]:[31,31],iconAnchor:nearest?[18,18]:[15,15],popupAnchor:[0,-15]
  });
  app.userIcon=L.divIcon({className:'',html:'<div class="user-dot"></div>',iconSize:[23,23],iconAnchor:[11,11]});
  app.destIcon=L.divIcon({className:'',html:'<div class="dest-dot"><span>◆</span></div>',iconSize:[28,28],iconAnchor:[8,27]});
  app.radius=()=>app.RADII[Number(app.$('radius').value)];
  app.centerPoint=()=>app.state.activeDestination||app.state.location;
  app.effectiveRadius=()=>app.state.activeDestination?app.radius():Math.max(app.radius(),Math.ceil(app.state.location?.accuracy||0));
  app.labelRadius=value=>value>=250000?'България':value>=1000?`${value/1000} км`:`${value} м`;
  app.setStatus=(text,type='info',sticky=false)=>{
    clearTimeout(app.state.statusTimer);
    const node=app.$('status');node.style.opacity='1';node.textContent=text;node.className=`status ${type}`;
    if(!sticky)app.state.statusTimer=setTimeout(()=>node.style.opacity='.72',5000);
  };
  app.zoomForRadius=value=>value>=250000?7:value>=100000?8:value>=50000?9:value>=25000?10:value>=10000?11:value>=5000?12:value>=2500?13:value>=1000?14:value>=500?15:value>=250?16:value>=100?17:value>=50?18:19;
  app.safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  app.distance=(a,b)=>{const r=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,l1=a.lat*Math.PI/180,l2=b.lat*Math.PI/180,h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLon/2)**2;return r*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))};
  app.formatDistance=m=>m<1000?`${Math.round(m)} м`:`${(m/1000).toFixed(1)} км`;
  app.formatDuration=s=>{const m=Math.max(1,Math.round(s/60));return m<60?`${m} мин`:`${Math.floor(m/60)} ч ${m%60} мин`};
  app.pointOf=el=>{const lat=Number(el.lat??el.center?.lat),lon=Number(el.lon??el.center?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null};
  app.parkingDetails=tags=>{const parts=[];if(tags.capacity)parts.push(`${tags.capacity} места`);if(tags.fee==='yes')parts.push('платен');if(tags.fee==='no')parts.push('безплатен');if(tags.access&&tags.access!=='yes')parts.push(`достъп: ${tags.access}`);return parts.join(' · ')};
})();
