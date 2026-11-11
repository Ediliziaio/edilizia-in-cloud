import type {Object3D} from "three";
import {pianoDellaFaccia,dot,sub,nelMondo,riferimentiTettoReale,creaPianoReale,type EdificioReale,type FacciaReale,type P3} from "./tettoReale";
import {leggiDisegnoCommerciale,disponiModuliOttimizzati,rettangoloNellaFalda,type DisegnoCommercialeFv,type PuntoFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
export type Affine=[number,number,number,number,number,number]; // x=A*c+B*r+C, y=D*c+E*r+F (angolo pixel)
export type OrtoLocale={nome:string;blob:Blob;originale:Blob;larghezza:number;altezza:number;affine:Affine;crs:string;origine:{x:number;y:number};metrica:"georiferita"|"manuale"};
export type Allineamento={scala:number;rotazione:number;x:number;y:number;z:number;asseSu:"y"|"z"};
export type ModelloLocale={files:File[];allineamento:Allineamento;nome:string};
export type RilievoLocale={versione:1;id:string;nome:string;creato:string;edificioBase:EdificioReale;orto:OrtoLocale|null;modello:ModelloLocale|null;altezzaManuale:number|null;allineamentoConfermato:boolean;provenienza:"importato"|"campione"|"schema"};
export type OrtoRuntime={url:string;larghezza:number;altezza:number;affine:Affine;nome:string};
export type RilievoRuntime={edificio:EdificioReale;orto:OrtoRuntime|null;modello:Object3D|null;fonte:RilievoLocale|null};
export const ALLINEAMENTO_BASE:Allineamento={scala:1,rotazione:0,x:0,y:0,z:0,asseSu:"y"};
export function pixelMondo(a:Affine,p:PuntoFv):PuntoFv{return{x:a[0]*p.x+a[1]*p.y+a[2],y:a[3]*p.x+a[4]*p.y+a[5]};}
export function mondoPixel(a:Affine,p:PuntoFv):PuntoFv{
 const det=a[0]*a[4]-a[1]*a[3];if(!Number.isFinite(det)||Math.abs(det)<1e-14)throw new Error("Scala dell’ortofoto non utilizzabile.");
 const x=p.x-a[2],y=p.y-a[5];return{x:(a[4]*x-a[1]*y)/det,y:(a[0]*y-a[3]*x)/det};
}
export function leggiWorldFile(testo:string):Affine{
 const v=testo.trim().split(/\s+/).map(Number);if(v.length!==6||!v.every(Number.isFinite))throw new Error("Il world file deve contenere sei numeri.");
 const [a,d,b,e,c,f]=v;const out:Affine=[a,b,c-(a+b)/2,d,e,f-(d+e)/2];mondoPixel(out,{x:0,y:0});return out;
}
export function centraRaster(a:Affine,w:number,h:number){
 if(!a.every(Number.isFinite)||w<1||h<1)throw new Error("Geometria del raster non valida.");
 const origine=pixelMondo(a,{x:w/2,y:h/2});const affine:Affine=[a[0],a[1],a[2]-origine.x,a[3],a[4],a[5]-origine.y];
 const bordo=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(p=>pixelMondo(affine,p));
 if(Math.max(...bordo.map(p=>Math.hypot(p.x,p.y)))>2000||Math.abs(a[0]*a[4]-a[1]*a[3])<1e-10)throw new Error("L’ortofoto deve coprire un’area locale in metri (massimo circa 4 km).");
 return{origine,affine};
}
export function nuovaFalda(punti:P3[],id:string,nome:string):FacciaReale{
 if(punti.length<3||punti.length>64||!punti.every(p=>[p.x,p.y,p.z].every(Number.isFinite)))throw new Error("Traccia da 3 a 64 punti sulla stessa falda.");
 const f:FacciaReale={id,tipo:"RoofSurface",anelli:[punti],pendenza:null,azimut:null},p=pianoDellaFaccia(f);
 if(p.n.z<Math.cos(80*Math.PI/180))throw new Error("La superficie è verticale o troppo inclinata: scegli una falda del tetto.");
 const scarto=Math.max(...punti.map(v=>Math.abs(dot(sub(v,p.origine),p.n))));if(scarto>.12)throw new Error("I punti non appartengono allo stesso piano: evita camini, alberi e falde diverse.");
 f.anelli=[punti.map(v=>{const d=sub(v,p.origine);return nelMondo(p,dot(d,p.u),dot(d,p.v));})];
 f.pendenza=Math.acos(Math.min(1,Math.max(-1,p.n.z)))*180/Math.PI;f.azimut=(Math.atan2(p.n.x,p.n.y)*180/Math.PI+360)%360;
 const e:EdificioReale={id:"verifica",origine:{x:0,y:0,z:0},attributi:{},facce:[f]};if(!leggiDisegnoCommerciale(creaPianoReale(e,{corto:1.134,lungo:1.762,stimato:false})))throw new Error("Contorno incrociato, troppo piccolo o troppo grande.");
 return{...f,id,nome};
}
export function edificioDaFalde(falde:FacciaReale[],paretiIllustrative:boolean):EdificioReale{
 const facce=[...falde];
 if(paretiIllustrative){const lati=new Map<string,{a:P3;b:P3;n:number}>();for(const f of falde)for(let i=0;i<f.anelli[0].length;i++){const a=f.anelli[0][i],b=f.anelli[0][(i+1)%f.anelli[0].length],key=[`${a.x.toFixed(3)},${a.y.toFixed(3)},${a.z.toFixed(3)}`,`${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)}`].sort().join("|");const old=lati.get(key);lati.set(key,{a,b,n:(old?.n??0)+1});}let i=0;for(const {a,b,n} of lati.values())if(n===1&&Math.max(a.z,b.z)>.1)facce.push({id:`parete-${i++}`,tipo:"WallSurface",anelli:[[{...a,z:0},{...b,z:0},b,a]],pendenza:null,azimut:null});}
 return{id:"rilievo-cliente",origine:{x:0,y:0,z:0},attributi:{paretiIllustrative},facce};
}
export function faldaDaOrto(punti:PuntoFv[],gronda:number,pendenza:number,azimut:number,id:string):FacciaReale{
 if(![gronda,pendenza,azimut].every(Number.isFinite)||gronda<.5||gronda>150||pendenza<0||pendenza>75)throw new Error("Inserisci una quota da 0,5 a 150 m e una pendenza da 0 a 75°.");
 const ang=azimut*Math.PI/180,d={x:Math.sin(ang),y:Math.cos(ang)},massimo=Math.max(...punti.map(p=>p.x*d.x+p.y*d.y));
 return nuovaFalda(punti.map(p=>({...p,z:gronda+(massimo-p.x*d.x-p.y*d.y)*Math.tan(pendenza*Math.PI/180)})),id,"Falda da ortofoto");
}
export function quoteEdificio(ed:EdificioReale){const ps=ed.facce.filter(f=>f.tipo==="RoofSurface").flatMap(f=>f.anelli.flat()),modello=typeof ed.attributi.altezzaModello==="number"?ed.attributi.altezzaModello:0;return{gronda:ps.length?Math.min(...ps.map(p=>p.z)):0,altezza:Math.max(modello,ps.length?Math.max(...ps.map(p=>p.z)):0)};}
export function funzioneAltezza(ed:EdificioReale,altezza:number|null):(z:number)=>number{
 if(altezza===null)return z=>z;const q=quoteEdificio(ed),delta=altezza-q.altezza;
 if(!Number.isFinite(altezza)||altezza<.5||altezza>150||q.gronda+delta<.3)throw new Error("L’altezza richiesta schiaccerebbe la copertura: conserva almeno 30 cm sotto la falda più bassa.");
 return z=>z>=q.gronda?z+delta:q.gronda>.001?z*(q.gronda+delta)/q.gronda:z+delta;
}
export function edificioCorretto(r:RilievoLocale):EdificioReale{
 const quota=funzioneAltezza(r.edificioBase,r.altezzaManuale),altezzaModello=r.edificioBase.attributi.altezzaModello;return{...r.edificioBase,attributi:{...r.edificioBase.attributi,...(typeof altezzaModello==="number"?{altezzaModello:quota(altezzaModello)}:{})},facce:r.edificioBase.facce.map(f=>({...f,anelli:f.anelli.map(r=>r.map(p=>({...p,z:quota(p.z)})))}))};
}
export function pianoDelRilievo(r:RilievoLocale,modulo:DisegnoCommercialeFv["modulo"],quantita:number){
 if(!r.allineamentoConfermato||!r.edificioBase.facce.some(f=>f.tipo==="RoofSurface"))throw new Error("Traccia almeno una falda e conferma l’allineamento del rilievo.");
 const schema=creaPianoReale(edificioCorretto(r),modulo);schema.rilievo={versione:1,id:r.id,nome:r.nome};
 if(!leggiDisegnoCommerciale(schema))throw new Error("La tavola supera i limiti del disegno commerciale.");
 return disponiModuliOttimizzati(schema,quantita,"auto");
}
export function conservaPosaDopoCorrezione(piano:DisegnoCommercialeFv,prima:EdificioReale,dopo:EdificioReale):DisegnoCommercialeFv{
 const vecchi=riferimentiTettoReale(prima),nuovi=riferimentiTettoReale(dopo),delta=(fid:string)=>{const a=vecchi.find(r=>r.faccia.id===fid),b=nuovi.find(r=>r.faccia.id===fid);if(!a||!b)throw new Error("Falda mancante nel rilievo.");return{x:b.offset.x-a.offset.x,y:b.offset.y-a.offset.y};};
 const out={...creaPianoReale(dopo,piano.modulo),rilievo:piano.rilievo,industriale:piano.industriale,distanzaBordo:piano.distanzaBordo,spazioModuli:piano.spazioModuli,pannelli:piano.pannelli.map(m=>{const d=delta(m.faldaId);return{...m,x:m.x+d.x,y:m.y+d.y};}),ostacoli:piano.ostacoli.map(o=>{const f=piano.falde.find(f=>rettangoloNellaFalda(o,f,0));if(!f)throw new Error("Ostacolo senza falda.");const d=delta(f.id);return{...o,x:o.x+d.x,y:o.y+d.y};})};
 return out;
}
