import {createContext,useContext,useEffect,useState} from "react";
import {Box3} from "three";
import ortofoto from "./esempi/ortofoto-pdok.jpg";
import {edificio} from "./campioneReale";
import {FOTO_BBOX} from "./tettoReale";
import {edificioCorretto,funzioneAltezza,mondoPixel,pixelMondo,type RilievoRuntime,type RilievoLocale,type OrtoRuntime} from "./rilievoLocale";
import {leggiRilievoLocale} from "./archivioRilievi";
import {caricaModelloLocale,correggiAltezzaMesh,rilasciaModello} from "./importaModello";
import type {P3} from "./tettoReale";
export const CAMPIONE_RUNTIME:RilievoRuntime={edificio,fonte:null,modello:null,orto:{url:ortofoto,nome:"Ortofoto pubblica PDOK",larghezza:800,altezza:800,affine:[.05,0,FOTO_BBOX.minX-edificio.origine.x,0,-.05,FOTO_BBOX.maxY-edificio.origine.y]}};
export const RilievoContext=createContext<RilievoRuntime>(CAMPIONE_RUNTIME);
export const useRilievo=()=>useContext(RilievoContext);
export function proiettaFoto(orto:OrtoRuntime,p:P3){return mondoPixel(orto.affine,p);}
export function proiettaUV(orto:OrtoRuntime,p:P3){const q=proiettaFoto(orto,p);return{u:q.x/orto.larghezza,v:1-q.y/orto.altezza};}
export function verticiOrto(orto:OrtoRuntime):P3[]{return[{x:0,y:0},{x:orto.larghezza,y:0},{x:orto.larghezza,y:orto.altezza},{x:0,y:orto.altezza}].map(p=>({...pixelMondo(orto.affine,p),z:0}));}
export async function preparaRuntime(fonte:RilievoLocale){
 let modello:RilievoRuntime["modello"]=null,url:string|null=null;
 try{if(fonte.modello){modello=await caricaModelloLocale(fonte.modello);const altezzaModello=new Box3().setFromObject(modello).max.y;fonte={...fonte,edificioBase:{...fonte.edificioBase,attributi:{...fonte.edificioBase.attributi,altezzaModello}}};if(fonte.altezzaManuale!==null)correggiAltezzaMesh(modello,funzioneAltezza(fonte.edificioBase,fonte.altezzaManuale));}if(fonte.orto)url=URL.createObjectURL(fonte.orto.blob);
  const runtime:RilievoRuntime={fonte,edificio:edificioCorretto(fonte),modello,orto:fonte.orto&&url?{...fonte.orto,url}:null};
  return{runtime,rilascia:()=>{if(modello)rilasciaModello(modello);if(url)URL.revokeObjectURL(url);}};
 }catch(e){if(modello)rilasciaModello(modello);if(url)URL.revokeObjectURL(url);throw e;}
}
export function useRilievoArchiviato(id:string|undefined){
 const [stato,setStato]=useState<{id:string;runtime:RilievoRuntime|null;errore:string}|null>(null);
 useEffect(()=>{if(!id)return;let annullato=false,rilascia:(()=>void)|undefined;
  (async()=>{try{const fonte=await leggiRilievoLocale(id);if(!fonte)throw new Error("Rilievo non presente in questo browser. Reimporta i file originali per riaprire il modello 3D.");const p=await preparaRuntime(fonte);if(annullato){p.rilascia();return;}rilascia=p.rilascia;setStato({id,runtime:p.runtime,errore:""});}catch(e){if(!annullato)setStato({id,runtime:null,errore:e instanceof Error?e.message:"Rilievo non leggibile."});}})();
  return()=>{annullato=true;rilascia?.();};
 },[id]);
 if(!id)return{runtime:CAMPIONE_RUNTIME,errore:"",caricando:false};
 return stato?.id===id?{...stato,caricando:false}:{runtime:null,errore:"",caricando:true};
}
