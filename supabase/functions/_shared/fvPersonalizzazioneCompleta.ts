import {escHtml} from "./fvCalcoli.ts";
import type {FvPdfTemplateData} from "./fvHtmlTemplate.ts";
export const BLOCCO_TESTI_FV="fv_testi_completi";
export const PREFISSO_MEDIA_FV="fv_media_";
export type ContestoPersonalizzazioneFv={variabili:Record<string,string>;immaginiDati:string[];mediaIncorporati?:Record<string,string>};
export type TestoModelloFv={id:string;originale:string;valori:Record<string,string>;tipo:string};
export type ImmagineModelloFv={id:string;descrizione:string;originale:string;tipo:"foto"|"illustrazione"};
export type PaginaModificabileFv={id:string;sezione:string;numero:number;titolo:string;testi:TestoModelloFv[];immagini:ImmagineModelloFv[]};
const oggetto=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function testiModelloFv(blocchi?:Record<string,unknown>|null):Record<string,string>{const raw=oggetto(oggetto(blocchi?.[BLOCCO_TESTI_FV]).testi);return Object.fromEntries(Object.entries(raw).filter(([k,v])=>/^[\w:-]+$/.test(k)&&typeof v==="string")) as Record<string,string>;}
export function senzaPersonalizzazioniFv(blocchi?:Record<string,unknown>|null){return Object.fromEntries(Object.entries(blocchi??{}).filter(([k])=>k!==BLOCCO_TESTI_FV&&!k.startsWith(PREFISSO_MEDIA_FV)));}
export function contestoPersonalizzazioneFv(d:FvPdfTemplateData):ContestoPersonalizzazioneFv{
 const v={azienda:d.azienda.name,cliente:[d.cliente.nome,d.cliente.cognome].filter(Boolean).join(" "),indirizzo:d.cliente.indirizzo??"",localita:d.cliente.comune??"",numero_preventivo:d.progetto.numero,email_azienda:d.azienda.email??"",telefono_azienda:d.azienda.phone??"",sito_azienda:d.azienda.website??""};
 return{variabili:Object.fromEntries(Object.entries(v).filter(([,s])=>s.length>=3)),immaginiDati:[...d.componenti.map(c=>c.image_url??""),d.render_impianto?.img??""].filter(Boolean),mediaIncorporati:Object.fromEntries(Object.entries(d.blocchi_foto??{}).filter(([k])=>k.startsWith(PREFISSO_MEDIA_FV)).flatMap(([k,v])=>v[0]?.src?[[k,v[0].src]]:[]))};
}
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16);};
const decode=(s:string)=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,v=>{const t=v.slice(1,-1).toLowerCase();if(t[0]==="#"){const n=t[1]==="x"?parseInt(t.slice(2),16):parseInt(t.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):v;}return({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "} as Record<string,string>)[t]??v;});
const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function proteggi(s:string,ctx:ContestoPersonalizzazioneFv){
 const valori:Record<string,string>={},vars=Object.entries(ctx.variabili).sort((a,b)=>b[1].length-a[1].length),parti=vars.length?s.split(new RegExp(`(${vars.map(([,v])=>escapeRegex(v)).join("|")})`,"g")):[s];let n=0;
 const testo=parti.map(p=>{const v=vars.find(([,v])=>v===p);if(v){valori[v[0]]=p;return`{${v[0]}}`;}return p.replace(/[−-]?\d+(?:[. ]\d{3})*(?:[,.]\d+)?(?:\s*(?:kWh|kWp|kW|Wp|m²|€|%))?/g,x=>{const k=`valore_${++n}`;valori[k]=x;return`{${k}}`;});}).join("");
 return{testo,valori};
}
export function validaTestoModelloFv(testo:string,originale:TestoModelloFv):string|null{
 if(testo.length>Math.max(4000,originale.originale.length))return "Testo troppo lungo: usa al massimo 4.000 caratteri.";
 const token=(s:string)=>s.match(/\{[a-z_]+\d*\}/g)??[],prima=token(originale.originale).sort(),dopo=token(testo).sort();
 return JSON.stringify(prima)===JSON.stringify(dopo)?null:"Mantieni i segnaposto dei dati del preventivo, senza duplicarli o eliminarli.";
}
export function immaginePersonalizzataFv(src:unknown):src is string{return typeof src==="string"&&/^(?:\/(?!\/)|https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(src)&&!/[\u0000-\u001f]/.test(src);}
export function immaginiPersonalizzateFv(blocchi?:Record<string,unknown>|null){return Object.fromEntries(Object.entries(blocchi??{}).filter(([k])=>k.startsWith(PREFISSO_MEDIA_FV)).flatMap(([k,b])=>{const foto=oggetto(b).foto;return Array.isArray(foto)&&typeof foto[0]==="string"&&foto[0]?[[k,[foto[0]]]]:[];}));}
const attr=(tag:string,nome:string)=>decode(tag.match(new RegExp(`\\b${nome}\\s*=\\s*["']([^"']*)["']`,"i"))?.[1]??"");
const cambiaAttr=(tag:string,nome:string,valore:string)=>{const re=new RegExp(`(\\b${nome}\\s*=\\s*)["'][^"']*["']`,"i");return re.test(tag)?tag.replace(re,(_m,p)=>`${p}"${escHtml(valore)}"`):tag.replace(/\/?\s*>$/,m=>` ${nome}="${escHtml(valore)}"${m}`);};
/** Testi liberi, immagini statiche e illustrazioni; numeri, variabili e rilievi restano legati al preventivo. */
function elaboraDocumento(html:string,blocchi:Record<string,unknown>|null|undefined,ctx:ContestoPersonalizzazioneFv,applica:boolean){
 const testi=testiModelloFv(blocchi),catalogo:PaginaModificabileFv[]=[],occorrenze:Record<string,number>={};
 const parti=html.split(/(?=<div class="page">)/);
 const out=parti.map((p,indice)=>{
  if(!p.startsWith('<div class="page">'))return p;
  const sezione=p.match(/data-fv-section="([\w-]+)"/)?.[1]??(p.includes('class="cover')?"cover":`pagina_${indice}`),parte=(occorrenze[sezione]=(occorrenze[sezione]??0)+1),id=sezione+(parte>1?`__${parte}`:""),titolo=decode(p.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()??sezione),pagina:PaginaModificabileFv={id,sezione,numero:catalogo.length+1,titolo,testi:[],immagini:[]};catalogo.push(pagina);
  const usati:Record<string,number>={};let fotoN=0;
  const key=(tipo:string,base:string)=>{const h=`${tipo}_${hash(base)}`;return`${id}:${h}_${usati[h]=(usati[h]??0)+1}`;};
  const media=(m:ImmagineModelloFv,originale:string,svg?:{x:string;y:string;w:string;h:string})=>{
   pagina.immagini.push(m);if(!applica)return originale;
   const k=PREFISSO_MEDIA_FV+m.id,b=oggetto(blocchi?.[k]);if(b.nascosta===true)return "";
   const url=ctx.mediaIncorporati?.[k]??(Array.isArray(b.foto)?b.foto[0]:null);if(!immaginePersonalizzataFv(url))return originale;
   if(svg)return`<image href="${escHtml(url)}" x="${svg.x}" y="${svg.y}" width="${svg.w}" height="${svg.h}" preserveAspectRatio="xMidYMid meet"/>`;
   return cambiaAttr(originale,"src",url);
  };
  p=p.replace(/<!--fv-art:([\w-]+):([\d.]+),([\d.]+),([\d.]+),([\d.]+)-->([\s\S]*?)<!--\/fv-art-->/g,(originale,nome,x,y,w,h)=>media({id:key("art",nome),descrizione:nome.replace(/_/g," "),originale:"",tipo:"illustrazione"},originale,{x,y,w,h}));
  p=p.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,svg=>{
   if(svg.includes("<!--fv-art:")||/<image\b/i.test(svg)||[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].some(m=>/\d/.test(m[1].replace(/<[^>]*>/g,""))))return svg;
   const apertura=svg.match(/^<svg\b[^>]*>/i)![0],vb=attr(apertura,"viewBox").trim().split(/\s+/),box=vb.length===4&&vb.every(v=>Number.isFinite(Number(v)))?{x:vb[0],y:vb[1],w:vb[2],h:vb[3]}:{x:"0",y:"0",w:"24",h:"24"},descrizione=attr(apertura,"aria-label")||"Icona illustrativa";
   const nuovo=media({id:key("svg",descrizione),descrizione,originale:svg,tipo:"illustrazione"},svg,box);
   return nuovo===svg?svg:nuovo?apertura+nuovo+"</svg>":"";
  });
  const stack:string[]=[];
  return p.replace(/<!--[\s\S]*?-->|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g,token=>{
   if(token.startsWith("<!--"))return token;
   if(token[0]==="<"){
    const close=token.match(/^<\/([\w:-]+)/),open=token.match(/^<([\w:-]+)/);
    if(close){const j=stack.lastIndexOf(close[1].toLowerCase());if(j>=0)stack.splice(j);return token;}
    if(!open)return token;const tag=open[1].toLowerCase();
    if(tag==="img"&&!stack.some(t=>t==="script"||t==="style")){
     const src=attr(token,"src"),descrizione=attr(token,"alt")||`Immagine ${++fotoN}`;
     if(ctx.immaginiDati.includes(src))return token;
     return media({id:key("foto",descrizione),descrizione,originale:src,tipo:"foto"},token);
    }
    if(!/\/>$/.test(token)&&!["img","br","hr","input","meta","link","col","source","wbr","image","path","rect","circle","ellipse","line","polyline","polygon","stop"].includes(tag))stack.push(tag);
    return token;
   }
   if(stack.some(t=>["style","script","title","desc","button"].includes(t)))return token;
   const decoded=decode(token),s=decoded.trim();if(!s||!/[A-Za-zÀ-ÿ]/.test(s)||/^(?:kWh|kWp|kW|Wp|€|%|m²|pz|kit)$/i.test(s))return token;
   const {testo,valori}=proteggi(s,ctx);if(!/[A-Za-zÀ-ÿ]/.test(testo.replace(/\{[^}]+\}/g,"")))return token;
   const tipo=stack.at(-1)??"testo",campo:TestoModelloFv={id:key("testo",tipo+":"+testo.replace(/\s+/g," ")),originale:testo,valori,tipo};pagina.testi.push(campo);
   if(!applica||!Object.prototype.hasOwnProperty.call(testi,campo.id))return token;
   const valore=testi[campo.id];if(validaTestoModelloFv(valore,campo))return token;
   const riempito=valore.replace(/\{([a-z_]+\d*)\}/g,(m,k)=>valori[k]??m),prima=decoded.match(/^\s*/)?.[0]??"",dopo=decoded.match(/\s*$/)?.[0]??"";
   return prima+escHtml(riempito).replace(/\n/g,tipo==="text"?" ":"<br/>")+dopo;
  });
 });
 return{html:out.join(""),pagine:catalogo};
}
export function catalogoPersonalizzazioneFv(html:string,ctx:ContestoPersonalizzazioneFv){return elaboraDocumento(html,undefined,ctx,false).pagine;}
export function personalizzaDocumentoFv(html:string,blocchi:Record<string,unknown>|null|undefined,ctx:ContestoPersonalizzazioneFv){if(!Object.keys(testiModelloFv(blocchi)).length&&!Object.keys(immaginiPersonalizzateFv(blocchi)).length&&!Object.entries(blocchi??{}).some(([k,v])=>k.startsWith(PREFISSO_MEDIA_FV)&&oggetto(v).nascosta===true))return html;return elaboraDocumento(html,blocchi,ctx,true).html;}
