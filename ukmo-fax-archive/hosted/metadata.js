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

export function retain(charts,now=Date.now()){
 const cutoff=now-7*86400000,groups=new Map();
 for(const c of charts){if(Date.parse(c.valid_time)<cutoff)continue;const key=c.valid_time+'|'+c.issue_time,old=groups.get(key);if(!old||(c.source==='metbrief-nowster'&&old.source!=='metbrief-nowster')||(c.source===old.source&&c.download_time>old.download_time))groups.set(key,c);}
 const counts=new Map();return [...groups.values()].sort((a,b)=>a.valid_time.localeCompare(b.valid_time)||b.issue_time.localeCompare(a.issue_time)).filter(c=>{const n=counts.get(c.valid_time)||0;counts.set(c.valid_time,n+1);return n<4;});
}
