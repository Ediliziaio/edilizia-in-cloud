import JSZip from 'jszip';
const decode=s=>s.replace(/&#x([a-f\d]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const encode=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function checkDocxArchive(buffer){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Archivio DOCX non riconosciuto');const count=buffer.readUInt16LE(end+10);const start=buffer.readUInt32LE(end+16);let at=start,total=0;
 if(count>2000)throw Error('Troppi elementi nell’archivio DOCX');
 for(let i=0;i<count;i++){if(at+46>buffer.length||buffer.readUInt32LE(at)!==0x02014b50)throw Error('Indice DOCX non valido');total+=buffer.readUInt32LE(at+24);const n=buffer.readUInt16LE(at+28),extra=buffer.readUInt16LE(at+30),comment=buffer.readUInt16LE(at+32);const name=buffer.subarray(at+46,at+46+n).toString('utf8');if(total>50_000_000)throw Error('Archivio DOCX espanso eccessivo');if(name.startsWith('/')||name.split('/').includes('..')||name.includes('\\'))throw Error('Percorso non sicuro nel DOCX');if(/_xmlsignatures|vbaProject|activeX|embeddings/i.test(name))throw Error('DOCX firmato o con contenuto attivo: compilazione automatica non supportata');at+=46+n+extra+comment;}
}
function paragraphs(xml,values){
 const found=new Set();let replaced=0;
 const output=xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,paragraph=>{
  const nodes=[...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m=>({raw:m[0],text:decode(m[1]),at:m.index,offset:0}));let offset=0;for(const n of nodes){n.offset=offset;offset+=n.text.length;}const text=nodes.map(n=>n.text).join('');const tokens=[...text.matchAll(/\{\{\s*([\w.\-]+)\s*\}\}/g)];
  for(const t of tokens)found.add(t[1]);if(values)for(const token of tokens.reverse()){
   const key=token[1];if(!(key in values)||values[key]==='')continue;const start=token.index,end=start+token[0].length;
   for(const n of nodes){const left=Math.max(start,n.offset),right=Math.min(end,n.offset+n.text.length);if(left>=right)continue;const a=left-n.offset,b=right-n.offset;n.text=n.text.slice(0,a)+(left===start?values[key]:'')+n.text.slice(b);}replaced++;
  }
  for(const n of [...nodes].reverse()){const raw=n.raw.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/,(_m,a,b)=>a+encode(n.text)+b);paragraph=paragraph.slice(0,n.at)+raw+paragraph.slice(n.at+n.raw.length);}return paragraph;
 });return{xml:output,fields:[...found],replaced};
}
export async function inspectDocx(buffer){checkDocxArchive(buffer);const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});const fields=new Set();for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.xml'))){const xml=await zip.file(name).async('string');if(/<w:documentProtection\b|<w:lock\b/.test(xml))throw Error('Modello protetto: compilazione manuale richiesta');}for(const name of Object.keys(zip.files).filter(n=>/^word\/(document|header\d*|footer\d*)\.xml$/.test(n))){const xml=await zip.file(name).async('string');if(/<w:documentProtection\b|<w:txbxContent\b/.test(xml))throw Error('Modello protetto o con caselle di testo complesse: percorso manuale');for(const f of paragraphs(xml).fields)fields.add(f);}if(!fields.size)throw Error('Nessun campo {{nome_campo}} trovato. Il DOCX rimane disponibile per compilazione manuale.');return{format:'docx_tokens',fields:[...fields].map(key=>({key,label:key,supported:true,required:true,value:'',max_length:300}))};}
export async function fillDocx(buffer,values){const meta=await inspectDocx(buffer);const allowed=new Set(meta.fields.map(f=>f.key));for(const[key,v]of Object.entries(values)){if(!allowed.has(key))throw Error('Campo del modello non riconosciuto');if(typeof v!=='string'||v.length>300||/[\r\n]/.test(v))throw Error(`Valore non supportato per ${key}: massimo 300 caratteri, una riga`);}const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});let count=0;for(const name of Object.keys(zip.files).filter(n=>/^word\/(document|header\d*|footer\d*)\.xml$/.test(n))){const parsed=paragraphs(await zip.file(name).async('string'),values);zip.file(name,parsed.xml);count+=parsed.replaced;}return{buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),replaced:count,missing:meta.fields.filter(f=>!values[f.key]).map(f=>f.key)};}
export async function safePreviewCopy(buffer){
 checkDocxArchive(buffer);const zip=await JSZip.loadAsync(buffer);
 for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.xml'))){
  const xml=await zip.file(name).async('string');
  const instructions=[...xml.matchAll(/<(?:[\w.-]+:)?instrText\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?instrText\s*>/g)].map(m=>decode(m[1].replace(/<[^>]*>/g,''))).join('')+' '+[...xml.matchAll(/<(?:[\w.-]+:)?fldSimple\b[^>]*\binstr=["']([^"']*)["']/g)].map(m=>decode(m[1])).join(' ');
  if(/\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|LINK)\b/i.test(instructions)||/<(?:[\w.-]+:)?altChunk\b|<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Contenuto esterno o attivo non ammesso nell’anteprima');
 }
 for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.rels'))){const xml=await zip.file(name).async('string');zip.file(name,xml.replace(/<(?:[\w.-]+:)?Relationship\b[^>]*TargetMode=["']External["'][^>]*(?:\/\s*>|>[\s\S]*?<\/(?:[\w.-]+:)?Relationship\s*>)/g,''));}
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
