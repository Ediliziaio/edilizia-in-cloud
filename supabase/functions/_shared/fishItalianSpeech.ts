const digits=['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove'];
export function italianVoiceNumber(n:number):string{
 if(!Number.isInteger(n) || n<0 || n>9999)throw Error('Numero fuori intervallo');
 const small=[...digits,'dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove'];if(n<20)return small[n];
 if(n<100){const tens=['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'];const unit=n%10;return tens[Math.floor(n/10)].replace(unit===1 || unit===8?/.$/:/$^/,'')+(unit===3?'tré':unit?small[unit]:'');}
 if(n<1000){const tail=n%100;return (n<200?'':small[Math.floor(n/100)])+(tail>=80 && tail<90?'cent':'cento')+(tail?italianVoiceNumber(tail):'');}
 return (n<2000?'mille':small[Math.floor(n/1000)]+'mila')+(n%1000?italianVoiceNumber(n%1000):'');
}
export function italianVoiceDate(iso:string):string|null{if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;const date=new Date(iso+'T12:00:00Z');if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==iso)return null;const day=new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'UTC'}).format(date),month=new Intl.DateTimeFormat('it-IT',{month:'long',timeZone:'UTC'}).format(date);return `${day} ${italianVoiceNumber(date.getUTCDate())} ${month} ${italianVoiceNumber(date.getUTCFullYear())}`;}
export function italianVoiceTime(value:string):string|null{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;const[h,m]=value.split(':').map(Number);if(!m && (h===0 || h===12))return h===0?'mezzanotte':'mezzogiorno';return `le ${italianVoiceNumber(h)}${m===0?'':m===15?' e un quarto':m===30?' e mezza':' e '+italianVoiceNumber(m)}`;}
export function italianVoicePhone(value:string):string|null{const clean=value.replace(/[\s().-]/g,'');if(!/^\+?[0-9]{7,15}$/.test(clean))return null;const raw=clean.replace('+','');const groups=clean.startsWith('+39')?[raw.slice(0,2),raw.slice(2,5),raw.slice(5,8),raw.slice(8)]:raw.match(/.{1,3}/g) || [];return(clean.startsWith('+')?'più ':'')+groups.filter(Boolean).map(group=>[...group].map(d=>digits[Number(d)]).join(' ')).join('… ');}
