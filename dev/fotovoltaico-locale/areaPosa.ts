import {disponiModuliOttimizzati,posizioneModuloValida,poligonoValido,areaPoligono,type DisegnoCommercialeFv,type PuntoFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import {dalDisegnoAlMondo,type EdificioReale} from "./tettoReale";
/** Il perimetro utilizzabile è distinto dalla quota e dalla pendenza del piano originale. */
export function applicaAreaPosa(piano:DisegnoCommercialeFv,faldaId:string,punti:PuntoFv[]){
 if(!piano.falde.some(f=>f.id===faldaId)||!poligonoValido(punti))throw new Error("Scegli da 3 a 64 vertici in ordine lungo il bordo, senza incrociare i lati.");
 if(piano.industriale&&piano.industriale.posa!=="aderente")throw new Error("Per modificare il perimetro di una posa inclinata usa il rilievo del capannone.");
 const copia={...piano,falde:piano.falde.map(f=>f.id===faldaId?{...f,punti:punti.map(p=>({...p}))}:f)};
 const richiesti=piano.pannelli.filter(m=>m.faldaId===faldaId).length;
 let next=disponiModuliOttimizzati(copia,richiesti,"auto",faldaId);
 const validi=copia.pannelli.filter(m=>m.faldaId!==faldaId||posizioneModuloValida(copia,m));
 if(validi.filter(m=>m.faldaId===faldaId).length>next.pannelli.filter(m=>m.faldaId===faldaId).length)next={...copia,pannelli:validi};
 return{piano:next,prima:richiesti,dopo:next.pannelli.filter(m=>m.faldaId===faldaId).length,areaMq:areaPoligono(punti)};
}
/** Per la visualizzazione: stessi riferimenti XYZ, contorno commerciale corretto sulla foto. */
export function facceConAreePosa(edificio:EdificioReale,piano:DisegnoCommercialeFv){return edificio.facce.map(f=>{
 const area=f.tipo==="RoofSurface"?piano.falde.find(a=>a.id===f.id):null;
 return area?{...f,anelli:[area.punti.map(p=>dalDisegnoAlMondo(edificio,f.id,p))]}:f;
});}
