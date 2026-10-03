/* Select each Icelandic cycle independently, followed by the longer-range leads. */
(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.FaxModel=model;})(typeof globalThis==='object'?globalThis:this,function(){
 const leads=[24,36,48,60,72,84,96,120];
 const slots=[...['00','06','12','18'].map(hour=>({key:'iceland:'+hour,label:'Iceland '+hour+'Z',source:'vedur',product:'PPVE89_EGRR_'+hour+'00'})),...leads.map(lead=>({key:'lead:'+lead,label:'T+'+lead,source:'metbrief-nowster',product:'UKCpf'+String(lead).padStart(3,'0')}))];
 function order(a,b){return b.issue_time.localeCompare(a.issue_time)||(a.source==='metbrief-nowster'?0:1)-(b.source==='metbrief-nowster'?0:1)||b.download_time.localeCompare(a.download_time);}
 function build(charts,source=''){
  const pool=charts.filter(c=>!source||c.source===source).slice().sort(order),groups=new Map(),latest=new Map();
  for(const c of pool){if(!groups.has(c.valid_time))groups.set(c.valid_time,[]);const g=groups.get(c.valid_time);if(!g.some(x=>x.issue_time===c.issue_time))g.push(c);}
  const available=slots.filter(s=>!source||s.source===source);
  for(const slot of available){const c=pool.find(c=>c.source===slot.source&&c.product===slot.product);if(c)latest.set(slot.key,c);}
  const entries=available.filter(s=>latest.has(s.key)).map(s=>({...s,a:latest.get(s.key),older:(groups.get(latest.get(s.key).valid_time)||[]).filter(c=>c.issue_time<latest.get(s.key).issue_time).slice(0,3)}));
  return {entries,groups,latest,slots:available};
 }
 return {leads,slots,order,build};
});
