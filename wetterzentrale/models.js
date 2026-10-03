(function(root){
 'use strict';
 const ceiling=240, order=['ecm','aifs','ecmens','gfs','gfsens','ukmo','gem','icon'];
 const models={
  gfs:{name:'GFS',prefix:'GFSOPEU',cycles:[0,6,12,18],max:240,vars:[1,2,34,21],page:'gfs',lid:'OP',lag:6},
  gfsens:{name:'GFS ENS',prefix:'GFSAVGEU',cycles:[0,6,12,18],max:240,vars:[1,2,34],page:'gfs',lid:'AVG',lag:7},
  ecm:{name:'ECMWF',prefix:'ECMOPEU',cycles:[0,6,12,18],max:240,vars:[1,2,34,21],page:'ecm',lid:'OP',lag:8},
  aifs:{name:'AIFS',prefix:'AIFSOPEU',cycles:[0,6,12,18],max:240,vars:[1,2,34],page:'aifs',lid:'OP',lag:7},
  ecmens:{name:'EC ENS',prefix:'ECMAVGEU',cycles:[0,12],max:240,vars:[1,2,34],page:'ecm',lid:'AVG',leadStep:24,historySameLead:true,lag:8},
  gem:{name:'GEM',prefix:'GEMOPEU',cycles:[0,12],max:240,vars:[1,2,34,21],page:'gem',lid:'OP',lag:6},
  icon:{name:'ICON',prefix:'ICOOPEU',cycles:[0,6,12,18],max:180,vars:[1,2,21],page:'ico',lid:'OP',lag:4},
  ukmo:{name:'UKMO EU',prefix:'UKMHDOPEU',cycles:[0,6,12,18],max:168,vars:[1,2,21],page:'ukmhd',lid:'OP',lag:5}
 };
 function leads(key,run){
  const m=models[key]; if(!m||!m.cycles.includes(run))return [];
  let max=m.max;
  if(key==='ukmo'&&(run===6||run===18))max=66;
  if(key==='icon'&&(run===6||run===18))max=120;
  if(key==='ecm'&&(run===6||run===18))max=144;
  return Array.from({length:Math.floor(Math.min(max,ceiling)/6)+1},(_,i)=>i*6)
   .filter(h=>key==='ecmens'?h%24===0:key==='ecm'&&h>144?h%24===0:true);
 }
 function filename(key,run,lead,v){return `${models[key].prefix}${String(run).padStart(2,'0')}_${lead}_${v}.png`;}
 const api={ceiling,order,models,leads,filename};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.WZModels=api;
})(typeof window==='object'?window:globalThis);
