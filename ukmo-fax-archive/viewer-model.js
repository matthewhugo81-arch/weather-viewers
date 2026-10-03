/* The current product shelf is independent of same-valid-time comparison groups. */
(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.FaxModel=model;})(typeof globalThis==='object'?globalThis:this,function(){
 const leads=[0,24,36,48,60,72,84,96,120];
 function order(a,b){return b.issue_time.localeCompare(a.issue_time)||(a.source==='metbrief-nowster'?0:1)-(b.source==='metbrief-nowster'?0:1)||b.download_time.localeCompare(a.download_time);}
 function build(charts,source='',browse='latest'){
  const pool=charts.filter(c=>!source||c.source===source).slice().sort(order),groups=new Map(),latest=new Map();
  for(const c of pool){
   if(!groups.has(c.valid_time))groups.set(c.valid_time,[]);
   const g=groups.get(c.valid_time);if(!g.some(x=>x.issue_time===c.issue_time))g.push(c);
   if(leads.includes(c.lead_hours)&&!latest.has(c.lead_hours))latest.set(c.lead_hours,c);
  }
  const selected=browse==='latest'?leads.filter(h=>latest.has(h)).map(h=>({key:'lead:'+h,a:latest.get(h)})):[...groups.keys()].sort().reverse().map(v=>({key:'valid:'+v,a:groups.get(v)[0]}));
  const entries=selected.map(e=>({...e,older:(groups.get(e.a.valid_time)||[]).filter(c=>c.issue_time<e.a.issue_time).slice(0,3)}));
  return {entries,groups,latest};
 }
 return {leads,order,build};
});
