// Preserve extracted characters. Rejoin only the reader's known 500-character
// overlap between explicitly numbered chunks of the same page/section.
export function readingUnits(chunks=[],coverage={}){
 const groups=new Map();
 for(const chunk of chunks){const page=Number.isInteger(chunk.page)&&chunk.page>0?chunk.page:null;const section=(chunk.section||'Testo').replace(/, parte \d+$/,'');const key=page?`p:${page}`:`section:${section}`;if(!groups.has(key))groups.set(key,{page,section,chunks:[]});groups.get(key).chunks.push(chunk);}
 const units=[];let sectionIndex=0;
 for(const group of groups.values()){
  let text='',previousPart=0;const methods=new Set();let reviewRequired=false;
  for(const chunk of group.chunks){const value=String(chunk.text||''),part=Number(chunk.section?.match(/, parte (\d+)$/)?.[1]||0);const overlap=part>1&&previousPart===part-1&&text.endsWith(value.slice(0,500))?500:0;text+=(text&&!overlap?'\n\n':'')+value.slice(overlap);previousPart=part;methods.add(chunk.method||'testo');reviewRequired ||= !!chunk.needs_visual_review;}
  const complete=group.page?coverage.completed_pages?.includes(group.page)||coverage.status==='complete'&&!coverage.partial:coverage.status==='complete'&&!coverage.partial;
  units.push({key:group.page?`p:${group.page}`:`s:${++sectionIndex}`,page:group.page,section:group.section,label:group.page?`Pagina ${group.page}`:group.section,text,characters:text.length,method:[...methods].join(' · '),needs_visual_review:reviewRequired,reading_complete:!!complete,available:!!text.trim()});
 }
 if(coverage.total_pages){for(let page=1;page<=Math.min(coverage.total_pages,500);page++)if(!units.some(u=>u.page===page))units.push({key:`p:${page}`,page,section:`Pagina ${page}`,label:`Pagina ${page}`,text:'',characters:0,method:'',needs_visual_review:false,reading_complete:false,available:false});units.sort((a,b)=>(a.page||0)-(b.page||0));}
 return units;
}
function searchable(value){let text='',starts=[],ends=[],offset=0;for(const char of value){const normalized=char.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it');if(!normalized&&ends.length)ends[ends.length-1]=offset+char.length;for(const letter of normalized){const space=/\s/u.test(letter);if(space&&text.endsWith(' ')){ends[ends.length-1]=offset+char.length;continue;}const part=space?' ':letter;for(let n=0;n<part.length;n++){text+=part[n];starts.push(offset);ends.push(offset+char.length);}}offset+=char.length;}return{text,starts,ends};}
export function textMatches(text,query,limit=2000){const needle=searchable(query.trim()).text;if(needle.length<2)return[];const source=searchable(text),matches=[];for(let at=source.text.indexOf(needle);at!==-1&&matches.length<limit;at=source.text.indexOf(needle,at+needle.length))matches.push({start:source.starts[at],end:source.ends[at+needle.length-1]});return matches;}
export function searchReading(units,query){return units.flatMap(unit=>{const matches=textMatches(unit.text,query);if(!matches.length)return[];const first=matches[0];return[{key:unit.key,label:unit.label,count:matches.length,capped:matches.length>=2000,snippet:(first.start>60?'…':'')+unit.text.slice(Math.max(0,first.start-60),Math.min(unit.text.length,first.end+110)).replace(/\s+/g,' ')+(first.end+110<unit.text.length?'…':'')}];});}
export function readingExport(document,units){return[`TESTO ESTRATTO — copia di lavoro da verificare`,`Originale: ${document.name}`,`Versione: ${document.version}`,`SHA-256 originale: ${document.sha256}`,`Il testo proviene dalla lettura del documento. Non sostituisce l’originale né ne certifica la correttezza.`,...units.flatMap(u=>['',`===== ${u.label} =====`,`Metodo: ${u.method||'non letto'}${u.reading_complete?'':' · lettura da completare'}`,u.text||'[TESTO NON DISPONIBILE]'])].join('\n');}
export function unitCitation(document,unit,quote=unit.text){return`${document.name} · v${document.version} · ${unit.label}\nSHA-256 originale: ${document.sha256}\n\n${quote}`;}
