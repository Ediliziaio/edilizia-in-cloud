import {illustrazioneCasa} from "./fvCasaIllustrazione.ts";
import type {FvFlows} from "./fvCalcoli.ts";
const n=(v:number)=>Math.round(v).toLocaleString("it-IT",{useGrouping:false}).replace(/\B(?=(\d{3})+(?!\d))/g,".");
const p=(v:number|null)=>v===null?"—":`${Math.round(v*100)}%`;
const green="#22765F",navy="#1E3A5F",muted="#718096";
function icon(kind:"solar"|"attivita"|"rete",x:number,y:number,color:string){
 const path=kind==="solar"?'<rect x="1" y="5" width="17" height="10" rx="1"/><path d="M6 5v10m6-10v10M1 10h17m-9 5v4m-5 0h11"/>':kind==="attivita"?'<path d="M1 19V8l6 4V6l6 5V2h5v17H1Z"/><path d="M5 15h1m4 0h1m4 0h1"/>':'<path d="m10 1-7 18m7-18 7 18M6 8h8M4 13h12M1 6h18M3 3l14 14M17 3 3 17"/>';
 return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${path}</g>`;
}
function node(x:number,y:number,w:number,h:number,kind:"solar"|"attivita"|"rete",label:string,value:number,sub:string,hero=false){
 const size=Math.min(hero?30:24,(w-71)/(Math.max(1,n(value).length)*.6));
 const color=kind==="solar"?"#A16A12":kind==="attivita"?green:navy,bg=kind==="solar"?"#FCF7EB":kind==="attivita"?"#EEF6F2":"#F1F4F8";
 return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${bg}"/>${icon(kind,x+16,y+15,color)}<text x="${x+43}" y="${y+28}" fill="${color}" font-size="9" font-weight="700" letter-spacing=".6">${label}</text><text x="${x+16}" y="${y+(hero?73:55)}" fill="${navy}" font-size="${size}" font-weight="700" letter-spacing="-.8">${n(value)}<tspan font-size="10" font-weight="400" letter-spacing="0"> kWh</tspan></text><text x="${x+16}" y="${y+(hero?95:72)}" fill="${muted}" font-size="9">${sub}</text></g>`;
}
function ribbon(x1:number,y1:number,x2:number,y2:number,width:number,color:string){
 if(width<.001)return "";const a=width/2,c=(x2-x1)*.45;
 return `<path d="M${x1},${y1-a} C${x1+c},${y1-a} ${x2-c},${y2-a} ${x2},${y2-a} L${x2},${y2+a} C${x2-c},${y2+a} ${x1+c},${y1+a} ${x1},${y1+a} Z" fill="${color}"/>`;
}
function pill(x:number,y:number,label:string,color:string){return `<g><rect x="${x-38}" y="${y-13}" width="76" height="26" rx="13" fill="white" stroke="${color}" stroke-opacity=".18"/><text x="${x}" y="${y+4.5}" text-anchor="middle" fill="${color}" font-size="13" font-weight="700">${label}</text></g>`;}
export function datiBilancioEnergia(f:FvFlows,consumo:number){
 const produzione=f.produzione_kwh,auto=f.autoconsumo_kwh,ceduta=f.ceduto_rete_kwh,rete=f.prelievo_rete_kwh;
 if(![produzione,auto,ceduta,rete,consumo].every(v=>Number.isFinite(v)&&v>=0)||Math.abs(produzione-auto-ceduta)>1||Math.abs(consumo-auto-rete)>1)throw new Error("Bilancio energetico non coerente: verifica produzione, autoconsumo, cessione e prelievo.");
 return{produzione,auto,ceduta,rete,consumo,quotaUso:produzione>0?Math.min(1,auto/produzione):null,quotaCopertura:consumo>0?Math.min(1,auto/consumo):null};
}
/** SVG vettoriali senza immagini generate: spessori e percentuali dipendono dai kWh del preventivo. */
export function svgBilancioEnergia(f:FvFlows,consumo:number,tipo:"produzione"|"consumo"){
 const d=datiBilancioEnergia(f,consumo),h=(tipo==="produzione"?d.produzione:d.consumo)>0?56:0,frac=(tipo==="produzione"?d.quotaUso:d.quotaCopertura)??0,a=h*frac,b=h-a;
 const label=tipo==="produzione"?`Produzione ${n(d.produzione)} kWh: ${n(d.auto)} utilizzati nell’attività, ${n(d.ceduta)} ceduti alla rete.`:`Consumo ${n(consumo)} kWh: ${n(d.auto)} dal fotovoltaico, ${n(d.rete)} dalla rete.`;
 let body:string;
 if(tipo==="produzione")body=`${ribbon(208,72+a/2,480,50,a,"#CFE6DD")}${ribbon(208,72+a+b/2,480,145,b,"#DCE4EE")}${node(16,45,192,110,"solar","FOTOVOLTAICO",d.produzione,"energia prodotta / anno",true)}${node(480,10,204,80,"attivita","UTILIZZATA NELL’ATTIVITÀ",d.auto,"energia autoconsumata")}${node(480,105,204,80,"rete","CEDUTA ALLA RETE",d.ceduta,"energia immessa")}${pill(342,(72+a/2+50)/2,p(d.quotaUso),green)}${pill(342,(72+a+b/2+145)/2,p(d.quotaUso===null?null:1-d.quotaUso),navy)}`;
 else body=`${ribbon(208,50,480,72+a/2,a,"#CFE6DD")}${ribbon(208,145,480,72+a+b/2,b,"#DCE4EE")}${node(16,10,192,80,"solar","DAL FOTOVOLTAICO",d.auto,"energia autoconsumata")}${node(16,105,192,80,"rete","DALLA RETE",d.rete,"energia acquistata")}${node(480,45,204,110,"attivita","LA TUA ATTIVITÀ",d.consumo,"energia consumata / anno",true)}${pill(342,(50+72+a/2)/2,p(d.quotaCopertura),green)}${pill(342,(145+72+a+b/2)/2,p(d.quotaCopertura===null?null:1-d.quotaCopertura),navy)}`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 195" style="width:100%;display:block" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>`;
}
export type OpzioniBilancioEnergia = {tipo?: "azienda" | "casa"; hasAccumulo?: boolean};
/** Scena illustrativa: le frecce indicano la direzione, i valori riportano il bilancio reale. */
export function svgScenaEnergia(f:FvFlows,consumo:number,opzioni:OpzioniBilancioEnergia={}){
 const d=datiBilancioEnergia(f,consumo),casa=opzioni.tipo==="casa";
 // Coordinate locali del tetto: i moduli seguono la stessa proiezione delle falde.
 const pannelli=(ox:number,oy:number,vx:number,vy:number,cols:number,rows:number,ux=300,uy=115)=>{
  let out="";
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   const u=.06+c*.88/cols,v=.09+r*.80/rows,w=.88/cols-.014,h=.80/rows-.045;
   const at=(a:number,b:number)=>`${ox+ux*a+vx*b},${oy+uy*a+vy*b}`;
   out+=`<polygon points="${at(u,v)} ${at(u+w,v)} ${at(u+w,v+h)} ${at(u,v+h)}" fill="${casa?"#172B3B":"url(#fe-panel)"}" stroke="#52697B" stroke-width=".7"/>`;
   for(let k=1;k<4;k++)out+=`<path d="M${at(u+w*k/4,v)} L${at(u+w*k/4,v+h)}" stroke="#8DA8BB" stroke-opacity=".23" stroke-width=".5"/>`;
   out+=`<path d="M${at(u,v+h/2)} L${at(u+w,v+h/2)}" stroke="#8DA8BB" stroke-opacity=".28" stroke-width=".5"/>`;
  }return out;
 };
 const flow=(value:number,path:string,color:string,marker:string)=>value>0?`<path d="${path}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" marker-end="url(#${marker})"/>`:"";
 const label=(x:number,y:number,value:number,title:string,color:string)=>`<text x="${x}" y="${y}" fill="${color}" font-size="29" font-weight="750" letter-spacing="-.8">${n(value)}<tspan font-size="13" font-weight="500" letter-spacing="0"> kWh</tspan></text><text x="${x}" y="${y+24}" fill="#5D7180" font-size="13">${title}</text>`;
 const desc=`Produzione ${n(d.produzione)} kWh. Autoconsumo ${n(d.auto)} kWh. Immissione in rete ${n(d.ceduta)} kWh. Prelievo dalla rete ${n(d.rete)} kWh. Consumo totale ${n(d.consumo)} kWh. Frecce schematiche, non in scala.`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 625" role="img" aria-label="${desc}" style="width:100%;display:block"><title>${casa?"La casa":"Il capannone"} e i flussi di energia</title><desc>${desc}</desc><defs>
 <linearGradient id="fe-roof" x2=".8" y2="1"><stop stop-color="#415566"/><stop offset="1" stop-color="#283D50"/></linearGradient>
 <linearGradient id="fe-panel" x2=".2" y2="1"><stop stop-color="#172A3B"/><stop offset=".55" stop-color="#233D50"/><stop offset="1" stop-color="#101F2F"/></linearGradient>
 <linearGradient id="fe-wall"><stop stop-color="#F3F5F4"/><stop offset="1" stop-color="#D8E0E1"/></linearGradient>
 <radialGradient id="fe-halo"><stop stop-color="#F1E8C8" stop-opacity=".6"/><stop offset="1" stop-color="#F8F9F6" stop-opacity="0"/></radialGradient>
 <marker id="fe-arrow-auto" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 9 5 1 9Z" fill="#188569"/></marker>
 <marker id="fe-arrow-out" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 9 5 1 9Z" fill="#B7822E"/></marker>
 <marker id="fe-arrow-in" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 9 5 1 9Z" fill="#284F73"/></marker></defs>
 <rect width="900" height="625" rx="18" fill="#F7F8F5"/>
 <ellipse cx="350" cy="280" rx="290" ry="230" fill="url(#fe-halo)"/>
 <path d="M100 443 424 571 816 353M87 470 410 597M146 403 471 531 799 344" fill="none" stroke="#E8EDE8" stroke-width="1"/>
 <g transform="translate(90 90)" stroke="#D3A242" fill="none" stroke-width="1.6"><circle r="19" fill="#FAE9BB" stroke="none"/><path d="M0-30v-7m0 67v7M-30 0h-7m67 0h7M-21-21l-5-5m47 47 5 5M21-21l5-5m-47 47-5 5"/></g>
 <text x="140" y="72" fill="#8C702F" font-size="11" font-weight="700" letter-spacing="1.3">PRODUZIONE FOTOVOLTAICA</text>
 ${label(140,106,d.produzione,"ogni anno, dal tuo tetto","#243F51")}
 <path d="M292 148 292 182" stroke="#C9BA8F" stroke-width="1" stroke-dasharray="3 4"/>
 ${casa?illustrazioneCasa({hasAccumulo:opzioni.hasAccumulo}):` <!--fv-art:capannone:150,175,550,390--><!-- Basamento e involucro del capannone -->
 <path d="M156 435 470 557 707 421 395 304Z" fill="#DCE4DC" opacity=".65"/>
 <path d="M170 310 470 425 470 535 170 420Z" fill="url(#fe-wall)"/>
 <path d="M470 425 575 317.5 680 300 680 410 470 535Z" fill="#CFDADD"/>
 <path d="M170 310 470 425 470 436 170 321Z" fill="#B3C1C8"/>
 <path d="M470 425 680 300 680 312 470 437Z" fill="#8B9DA8"/>
 <path d="M275 202.5 575 317.5 680 300 380 185Z" fill="#76898F"/>
 <path d="M170 310 470 425 575 317.5 275 202.5Z" fill="url(#fe-roof)"/>
 ${pannelli(170,310,105,-107.5,10,3)}${pannelli(275,202.5,105,-17.5,10,2)}
 <path d="M275 202.5 575 317.5" stroke="#B4C3C9" stroke-width="3"/>
 <path d="M170 310 470 425 680 300" stroke="#7D939E" stroke-width="2" fill="none"/>
 <g stroke="#B9C8CD" stroke-width="1">${[210,250,290,330,370,410,450].map(x=>`<path d="M${x} ${325+(x-170)*115/300}v91"/>`).join("")}</g>
 <!-- Fascia finestrata, ingresso e portoni -->
 <path d="M187 339 448 439 448 456 187 356Z" fill="#6C8998"/>
 <g stroke="#DAE3E6" stroke-width="2">${[218,251,284,317,350,383,416].map(x=>`<path d="M${x} ${339+(x-187)*100/261}v17"/>`).join("")}</g>
 <path d="M203 375 249 393 249 450 203 432Z" fill="#9EB0B8"/><path d="M211 384 241 396 241 447 211 435Z" fill="#526C7C"/>
 <path d="M491 441 550 406 550 485 491 520Z" fill="#8097A4"/><path d="M577 390 648 348 648 426 577 468Z" fill="#8CA1AC"/>
 <g stroke="#B6C5CC" stroke-width="1">${[0,1,2,3,4,5].map(i=>`<path d="M491 ${450+i*11} 550 ${415+i*11}M577 ${400+i*11} 648 ${358+i*11}"/>`).join("")}</g>
 <path d="M168 420 470 537 680 411" fill="none" stroke="#A7BABE" stroke-width="3"/>
<!--/fv-art-->`}
 <!-- Rete pubblica, separata visivamente dall'edificio -->
 <g transform="translate(790 310)" fill="none" stroke="#92A4B1" stroke-linejoin="round"><path d="m-25 144 25-132 25 132M-18 105h36M-13 76h26M-9 45H9M-30 35h60M-40 62h80M-17 104 17 76-9 45M17 104-17 76 9 45" stroke-width="2"/><path d="M-49 144h98" stroke-width="1"/><path d="M-30 35Q-60 52-85 47M30 35q30 17 58 12M-40 62q-24 14-45 9M40 62q29 15 48 9" stroke-width="1.2"/></g>
 <text x="790" y="482" text-anchor="middle" fill="#647C8C" font-size="11" font-weight="700" letter-spacing="1">RETE PUBBLICA</text>
 ${flow(d.ceduta,"M535 268 C590 210 725 214 770 320","#B7822E","fe-arrow-out")}
 ${flow(d.rete,"M782 441 C773 540 613 567 558 496","#284F73","fe-arrow-in")}
 ${flow(d.auto,"M366 314 C353 333 345 357 358 391","#188569","fe-arrow-auto")}
 ${d.auto>0?'<circle cx="366" cy="314" r="6" fill="#188569" stroke="white" stroke-width="2"/><path d="M352 379 312 461 68 461" fill="none" stroke="#188569" stroke-width="1"/>':""}
 ${label(48,501,d.auto,casa?"utilizzati nella tua casa":"utilizzati nella tua attività","#188569")}
 ${label(625,177,d.ceduta,"immessi nella rete pubblica","#9C6C20")}
 ${label(580,587,d.rete,"prelevati dalla rete pubblica","#284F73")}
 <text x="48" y="594" fill="#89988F" font-size="10">ILLUSTRAZIONE INDICATIVA</text></svg>`;
}
export function htmlBilancioEnergia(f:FvFlows,consumo:number,opzioni:OpzioniBilancioEnergia={}){
 const d=datiBilancioEnergia(f,consumo),casa=opzioni.tipo==="casa";
 const notaAccumulo=casa&&opzioni.hasAccumulo?" L’autoconsumo include l’effetto dell’accumulo previsto. I dati annuali non separano utilizzo diretto e quota passata dalla batteria.":"";
 const indice=(titolo:string,quota:number|null,denominatore:number,testo:string)=>`<div class="fe-index"><div class="fe-index-value">${p(quota)}</div><div><h2>${titolo}</h2><p>${testo}</p><small>${n(d.auto)} / ${n(denominatore)} kWh</small></div></div>`;
 return `<style>.fe{font-family:inherit;color:#1E3A5F}.fe .fe-title{font-size:29pt;line-height:1.08;letter-spacing:-1.2px;margin:3mm 0;color:#203D50;font-weight:750}.fe-title span{color:#188569}.fe-intro{font-size:10pt;line-height:1.5;color:#647986;margin:3mm 0 6mm;max-width:155mm}.fe-indexes{display:grid;grid-template-columns:1fr 1fr;gap:7mm;padding:6mm 0;border-bottom:1px solid #DEE6E1}.fe-index{display:flex;gap:3mm;align-items:flex-start}.fe-index-value{font-size:30pt;font-weight:700;letter-spacing:-1.5px;line-height:1;color:#188569;white-space:nowrap}.fe-index h2{font-size:10pt;margin:0 0 1.5mm;color:#203D50}.fe-index p{font-size:8pt;line-height:1.4;color:#647986;margin:0 0 1.5mm}.fe-index small{font-size:7.5pt;color:#7C8E97}.fe-consumo{display:flex;justify-content:space-between;align-items:baseline;padding:4mm 0 0;color:#536F7B;font-size:9pt}.fe-consumo strong{font-size:13pt;color:#203D50}.fe-source{font-size:7.5pt;color:#8292A0;line-height:1.5;margin-top:4mm}</style><section class="fe"><div class="eyebrow">Bilancio energetico annuale</div><h1 class="fe-title">Il tuo tetto produce.<br/><span>${casa?"La tua casa ne beneficia.":"La tua attività ne beneficia."}</span></h1><p class="fe-intro">Produzione, consumi e scambi con la rete: il bilancio del tuo impianto.</p>${svgScenaEnergia(f,consumo,opzioni)}<div class="fe-consumo"><span>Fabbisogno energetico ${casa?"della casa":"dell’attività"}</span><strong>${n(d.consumo)} <span style="font-size:9pt;font-weight:400">kWh / anno</span></strong></div><div class="fe-indexes">${indice("Autoconsumo",d.quotaUso,d.produzione,casa?"Quota della produzione utilizzata in casa.":"Quota della produzione utilizzata nell’attività.")}${indice("Autosufficienza",d.quotaCopertura,d.consumo,"Quota dei consumi coperta dal fotovoltaico.")}</div><p class="fe-source">Simulazione annuale: produzione = autoconsumo + immissioni; consumi = autoconsumo + prelievi. Percentuali arrotondate. Edificio e pannelli illustrativi; frecce direzionali non in scala. I flussi annuali non rappresentano scambi simultanei.${notaAccumulo}</p></section>`;
}
