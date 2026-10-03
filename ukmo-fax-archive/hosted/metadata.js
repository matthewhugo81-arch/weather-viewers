const months='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
export function metadata(text,lead){
 text=text.toUpperCase().replace(/(VALID\s+)OO(\s+UTC)/g,'$100$2');
 const m=text.match(/VALID\s+(\d{2})(?:00)?\s*UTC\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/);
 if(!m)throw Error('Printed valid-time header not recognized');
 const [hour,day,month,year]=[+m[1],+m[3],months.indexOf(m[4]),+m[5]];
 const d=new Date(Date.UTC(year,month,day,hour));
 if(hour>23||hour%6||d.getUTCDate()!==day||d.getUTCMonth()!==month||d.getUTCFullYear()!==year||['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()]!==m[2])throw Error('Printed weekday/date/hour mismatch');
 const printed=text.match(/T\s*\+\s*(\d{1,3})/);
 if(lead===0?!text.includes('ANALYSIS'):!printed||+printed[1]!==lead)throw Error('Printed lead/title mismatch');
 const iso=d=>d.toISOString().replace('.000Z','Z');
 return {valid_time:iso(d),issue_time:iso(new Date(+d-lead*3600000))};
}

export function latestProducts(charts){
 const selected=new Map();
 for(const c of charts.slice().sort((a,b)=>b.issue_time.localeCompare(a.issue_time)||b.download_time.localeCompare(a.download_time))){const key=c.source+'|'+c.product;if(!selected.has(key))selected.set(key,c);}
 return [...selected.values()];
}
export function retain(charts,now=Date.now()){
 const cutoff=now-7*86400000,pins=latestProducts(charts),keep=new Map(),groups=new Map();
 const pool=charts.filter(c=>Date.parse(c.valid_time)>=cutoff).sort((a,b)=>b.issue_time.localeCompare(a.issue_time)||(a.source==='metbrief-nowster'?0:1)-(b.source==='metbrief-nowster'?0:1)||b.download_time.localeCompare(a.download_time));
 for(const c of pool){if(!groups.has(c.valid_time))groups.set(c.valid_time,[]);const g=groups.get(c.valid_time);if(!g.some(x=>x.issue_time===c.issue_time))g.push(c);}
 for(const g of groups.values())for(const c of g.slice(0,4))keep.set(c.id,c);
 // Current products remain selectable in A even when their run is older than
 // four overlapping forecasts. Keep earlier comparisons relative to each A.
 for(const c of pins){keep.set(c.id,c);for(const earlier of (groups.get(c.valid_time)||[]).filter(x=>x.issue_time<c.issue_time).slice(0,3))keep.set(earlier.id,earlier);}
 return [...keep.values()].sort((a,b)=>a.valid_time.localeCompare(b.valid_time)||a.issue_time.localeCompare(b.issue_time));
}
