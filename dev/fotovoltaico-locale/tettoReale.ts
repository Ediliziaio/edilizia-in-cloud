/** Esperimento locale su dati pubblici 3DBAG. Non è un importatore di produzione. */
import { ShapeUtils, Vector2 } from "three";
import { disponiModuliOttimizzati, ingombroModulo, poligonoValido, posizioneModuloValida, rettangoloNellaFalda, arrotondaMetro, type ModuloPosatoFv, type DisegnoCommercialeFv, type PuntoFv } from "../../supabase/functions/_shared/fvDisegnoCommerciale";
export type P3 = {x:number;y:number;z:number};
export type SelezioneReale = {tipo:"pannello"|"ostacolo";id:string}|null;
export type InquadraturaReale = {faldaId:string|null;versione:number};
export type FacciaReale = {id:string;tipo:string;anelli:P3[][];pendenza:number|null;azimut:number|null;nome?:string};
export type PianoLocale = {origine:P3;u:P3;v:P3;n:P3;contorno:{x:number;y:number}[]};
export type EdificioReale = {id:string;facce:FacciaReale[];origine:P3;attributi:Record<string,unknown>};
export const sub=(a:P3,b:P3):P3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const dot=(a:P3,b:P3)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const cross=(a:P3,b:P3):P3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(a:P3):P3=>{const l=Math.hypot(a.x,a.y,a.z);if(l<1e-8)throw new Error("Piano degenere");return{x:a.x/l,y:a.y/l,z:a.z/l};};
export function pianoDellaFaccia(f:FacciaReale):PianoLocale {
  const punti=f.anelli[0];
  const origine=punti.reduce((a,p)=>({x:a.x+p.x/punti.length,y:a.y+p.y/punti.length,z:a.z+p.z/punti.length}),{x:0,y:0,z:0});
  // Newell usa tutto il contorno: tre vertici quasi allineati e arrotondati
  // al millimetro non devono alterare il piano della falda.
  const normale=punti.reduce((a,p,i)=>{const q=punti[(i+1)%punti.length];return{x:a.x+(p.y-q.y)*(p.z+q.z),y:a.y+(p.z-q.z)*(p.x+q.x),z:a.z+(p.x-q.x)*(p.y+q.y)};},{x:0,y:0,z:0});
  let n=unit(normale);
  if(f.tipo==="RoofSurface"&&n.z<0)n={x:-n.x,y:-n.y,z:-n.z};
  // Sui tetti le file seguono la linea orizzontale del piano (gronda),
  // anziché dipendere dall'ordine dei vertici del file.
  const bordo=f.tipo==="RoofSurface"&&n.z<Math.cos(Math.PI/180)?{x:-n.y,y:n.x,z:0}:f.tipo==="RoofSurface"?{x:1,y:0,z:0}:punti.map((p,i)=>sub(punti[(i+1)%punti.length],p)).sort((a,b)=>dot(b,b)-dot(a,a))[0];
  const proiezione=dot(bordo,n),u=unit({x:bordo.x-n.x*proiezione,y:bordo.y-n.y*proiezione,z:bordo.z-n.z*proiezione});
  const v=unit(cross(n,u));
  return {origine,u,v,n,contorno:punti.map(p=>{const d=sub(p,origine);return{x:dot(d,u!),y:dot(d,v)};})};
}
export function nelMondo(p:PianoLocale,x:number,y:number,distacco=0):P3 {
  return {x:p.origine.x+p.u.x*x+p.v.x*y+p.n.x*distacco,y:p.origine.y+p.u.y*x+p.v.y*y+p.n.y*distacco,z:p.origine.z+p.u.z*x+p.v.z*y+p.n.z*distacco};
}
export function leggiEdificio3d(raw:unknown):EdificioReale {
  const r=raw as {id:string;metadata:{transform:{scale:number[];translate:number[]}};feature:{vertices:number[][];CityObjects:Record<string,{type:string;attributes?:Record<string,unknown>;geometry?:Array<{lod:string;type:string;boundaries:number[][][][];semantics?:{values:number[][];surfaces:Array<Record<string,unknown>>}}>}>}};
  if(!r?.feature?.vertices?.length || r.feature.vertices.length>100000 || !r.metadata?.transform)throw new Error("Campione CityJSON non valido");
  const t=r.metadata.transform;
  const world=r.feature.vertices.map(p=>({x:p[0]*t.scale[0]+t.translate[0],y:p[1]*t.scale[1]+t.translate[1],z:p[2]*t.scale[2]+t.translate[2]}));
  if(!world.every(p=>[p.x,p.y,p.z].every(Number.isFinite)))throw new Error("Coordinate non valide");
  const origine={x:(Math.min(...world.map(p=>p.x))+Math.max(...world.map(p=>p.x)))/2,y:(Math.min(...world.map(p=>p.y))+Math.max(...world.map(p=>p.y)))/2,z:Math.min(...world.map(p=>p.z))};
  const attributi=Object.values(r.feature.CityObjects).find(o=>o.type==="Building")?.attributes??{};
  const facce:FacciaReale[]=[];
  for(const o of Object.values(r.feature.CityObjects)) for(const g of o.geometry??[]) if(g.lod==="2.2"&&g.type==="Solid"&&g.semantics){
    g.boundaries[0].forEach((rings,i)=>{
      const sem=g.semantics!.surfaces[g.semantics!.values[0][i]];
      const anelli=rings.map(indices=>indices.map(idx=>{if(!world[idx])throw new Error("Indice non valido");return sub(world[idx],origine);})).map(ps=>ps.length>1&&Math.hypot(...Object.values(sub(ps[0],ps.at(-1)!)))<1e-6?ps.slice(0,-1):ps);
      if(anelli.some(a=>a.length<3))throw new Error("Superficie incompleta");
      facce.push({id:"faccia-"+facce.length,tipo:String(sem.type),anelli,pendenza:typeof sem.b3_hellingshoek==="number"?sem.b3_hellingshoek:null,azimut:typeof sem.b3_azimut==="number"?sem.b3_azimut:null});
    });
  }
  if(!facce.length)throw new Error("Nessuna geometria LoD 2.2");
  return {id:r.id,facce,origine,attributi};
}
export function triangoliFaccia(f:FacciaReale):P3[] {
  const p=pianoDellaFaccia(f),anelli=f.anelli.map(r=>r.map(v=>{const d=sub(v,p.origine);return new Vector2(dot(d,p.u),dot(d,p.v));}));
  const indici=ShapeUtils.triangulateShape(anelli[0],anelli.slice(1)),vertices=f.anelli.flat();
  return indici.flatMap(t=>t.map(i=>vertices[i]));
}
export type PannelloReale = {centro:P3;piano:PianoLocale;vertici:P3[];larghezza:number;lunghezza:number};
export function disponiSuFaldaReale(f:FacciaReale,quantita:number,orizzontale=false):PannelloReale[] {
  if(f.tipo!=="RoofSurface"||f.anelli.length!==1)return [];
  const base=pianoDellaFaccia(f);
  if(!poligonoValido(base.contorno))return [];
  // Prova i due versi della stessa griglia: sui contorni irregolari la
  // scansione dal lato opposto può sfruttare meglio la superficie.
  const inverti=(v:P3):P3=>({x:-v.x,y:-v.y,z:-v.z});
  const inverso={...base,u:inverti(base.u),v:inverti(base.v),contorno:base.contorno.map(p=>({x:-p.x,y:-p.y}))};
  const candidati=[base,inverso].map(p=>{
    const schema:DisegnoCommercialeFv={modalita:"disegno_commerciale",versione:1,falde:[{id:f.id,nome:"Falda reale",punti:p.contorno}],pannelli:[],ostacoli:[],modulo:{corto:1.134,lungo:1.762,stimato:false},distanzaBordo:.3,spazioModuli:.05};
    return {p,posa:disponiModuliOttimizzati(schema,quantita,orizzontale)};
  });
  const {p,posa}=candidati.sort((a,b)=>b.posa.pannelli.length-a.posa.pannelli.length)[0],w=orizzontale?1.762:1.134,h=orizzontale?1.134:1.762;
  return posa.pannelli.map(m=>({centro:nelMondo(p,m.x+w/2,m.y+h/2,.055),piano:p,larghezza:w,lunghezza:h,vertici:[[m.x,m.y],[m.x+w,m.y],[m.x+w,m.y+h],[m.x,m.y+h]].map(([x,y])=>nelMondo(p,x,y,.055))}));
}

/** Le falde sono sviluppate in metri sul proprio piano e separate in una tavola 2×2.
 * La tavola non è una planimetria geografica: la trasformazione inversa conserva XYZ.
 */
export function riferimentiTettoReale(edificio: EdificioReale) {
  const falde=edificio.facce.filter(f=>f.tipo==="RoofSurface");
  const piani=falde.map(f=>({faccia:f,piano:pianoDellaFaccia(f)}));
  const larghezza=Math.max(...piani.map(({piano:p})=>Math.max(...p.contorno.map(v=>v.x))-Math.min(...p.contorno.map(v=>v.x))))+2;
  const altezza=Math.max(...piani.map(({piano:p})=>Math.max(...p.contorno.map(v=>v.y))-Math.min(...p.contorno.map(v=>v.y))))+2;
  return piani.map(({faccia,piano},i)=>({faccia,piano,offset:{x:i%2*larghezza-Math.min(...piano.contorno.map(v=>v.x)),y:Math.floor(i/2)*altezza-Math.min(...piano.contorno.map(v=>v.y))}}));
}
export function creaPianoReale(edificio:EdificioReale,modulo:DisegnoCommercialeFv["modulo"]):DisegnoCommercialeFv {
  const falde=riferimentiTettoReale(edificio).map(({faccia,piano,offset},i)=>({id:faccia.id,nome:faccia.nome??`Falda ${i+1}`,punti:piano.contorno.map(v=>({x:v.x+offset.x,y:v.y+offset.y}))}));
  return {modalita:"disegno_commerciale",versione:1,falde,pannelli:[],ostacoli:[],modulo,distanzaBordo:.3,spazioModuli:.05};
}
export function dalDisegnoAlMondo(edificio:EdificioReale,faldaId:string,p:PuntoFv,distacco=0):P3 {
  const r=riferimentiTettoReale(edificio).find(r=>r.faccia.id===faldaId);
  if(!r)throw new Error("Falda sconosciuta");
  return nelMondo(r.piano,p.x-r.offset.x,p.y-r.offset.y,distacco);
}
export function dallaFotoAlDisegno(edificio:EdificioReale,faldaId:string,p:PuntoFv):PuntoFv {
  const r=riferimentiTettoReale(edificio).find(r=>r.faccia.id===faldaId);
  if(!r||Math.abs(r.piano.n.z)<1e-5)throw new Error("Falda senza proiezione utilizzabile");
  const x=p.x,y=p.y,z=r.piano.origine.z-(r.piano.n.x*(x-r.piano.origine.x)+r.piano.n.y*(y-r.piano.origine.y))/r.piano.n.z;
  const d=sub({x,y,z},r.piano.origine);
  return {x:dot(d,r.piano.u)+r.offset.x,y:dot(d,r.piano.v)+r.offset.y};
}
export function pannelliDalDisegnoReale(edificio:EdificioReale,disegno:DisegnoCommercialeFv):PannelloReale[] {
  const refs=riferimentiTettoReale(edificio);
  return disegno.pannelli.map(m=>{
    const r=ingombroModulo(m,disegno.modulo),ref=refs.find(f=>f.faccia.id===m.faldaId);if(!ref)throw new Error("Falda sconosciuta nel rilievo.");
    let piano=ref.piano;
    const mondo=(x:number,y:number)=>nelMondo(piano,x-ref.offset.x,y-ref.offset.y,.055);
    const punti=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];
    const vertici=punti.map(p=>{const v=mondo(p.x,p.y);if(!m.supporto)return v;const s=m.supporto,ang=s.inclinazione*Math.PI/180,t=Math.tan(ang),quota=.15+(s.verso==="y-"?(p.y-r.y)*t:s.verso==="x-"?(p.x-r.x)*t:(r.x+r.w-p.x)*t);return{x:v.x+piano.n.x*quota,y:v.y+piano.n.y*quota,z:v.z+piano.n.z*quota};});
    if(m.supporto)piano=pianoDellaFaccia({id:"modulo",tipo:"RoofSurface",anelli:[vertici],pendenza:null,azimut:null});
    // La base di rendering segue i lati fisici, anche quando il pannello è su cavalletto.
    const u=unit(sub(vertici[1],vertici[0])),v=unit(sub(vertici[3],vertici[0])),n=unit(cross(u,v));
    piano={...piano,u,v,n};
    const centro=vertici.reduce((a,v)=>({x:a.x+v.x/4,y:a.y+v.y/4,z:a.z+v.z/4}),{x:0,y:0,z:0});
    return {centro,piano,larghezza:Math.hypot(...Object.values(sub(vertici[1],vertici[0]))),lunghezza:Math.hypot(...Object.values(sub(vertici[3],vertici[0]))),vertici};
  });
}
export const FOTO_BBOX={minX:84994.458875,minY:447507.3615,maxX:85034.458875,maxY:447547.3615};
export function uvOrtofoto(edificio:EdificioReale,p:P3) {
  return {u:(p.x+edificio.origine.x-FOTO_BBOX.minX)/(FOTO_BBOX.maxX-FOTO_BBOX.minX),v:(p.y+edificio.origine.y-FOTO_BBOX.minY)/(FOTO_BBOX.maxY-FOTO_BBOX.minY)};
}
/** Movimento/rotazione atomici: un tentativo non valido non altera il disegno. */
export function cambiaModuloReale(piano:DisegnoCommercialeFv,id:string,patch:Partial<Pick<ModuloPosatoFv,"x"|"y"|"faldaId"|"orizzontale">>):DisegnoCommercialeFv|null {
  const originale=piano.pannelli.find(p=>p.id===id);
  if(!originale)return null;
  const next={...originale,...patch};
  if(![next.x,next.y].every(Number.isFinite))return null;
  next.x=arrotondaMetro(next.x);next.y=arrotondaMetro(next.y);
  if(!posizioneModuloValida(piano,next))return null;
  return {...piano,pannelli:piano.pannelli.map(p=>p.id===id?next:p)};
}

export function sagomeOstacoliEdificio(edificio:EdificioReale,piano:DisegnoCommercialeFv){
 const originali=creaPianoReale(edificio,piano.modulo).falde;
 return piano.ostacoli.flatMap(o=>{const f=piano.falde.find(f=>rettangoloNellaFalda(o,f,0))??originali.find(f=>rettangoloNellaFalda(o,f,0));return f?[{id:o.id,vertici:[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}].map(p=>dalDisegnoAlMondo(edificio,f.id,p,.08))}]:[];});
}
