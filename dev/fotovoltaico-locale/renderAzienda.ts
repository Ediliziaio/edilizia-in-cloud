import {pannelliDalDisegnoReale,sagomeOstacoliEdificio,pianoDellaFaccia,dalDisegnoAlMondo,type EdificioReale,type P3} from "./tettoReale";
import type {DisegnoCommercialeFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
/** Proiezione 3D della stessa geometria della tavola, senza elementi inventati da immagini generative. */
export function svgRenderAzienda(edificio:EdificioReale,piano:DisegnoCommercialeFv,didascalia="Schema di capannone dimostrativo. Nessuna foto o misura del cliente acquisita.",rotazione=0,opzioni:{annotazioni?:boolean;sfondo?:boolean}={}){
 const testo=didascalia.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!));
 const {proietta,profondita}=proiezioneRenderAzienda(edificio,rotazione);
 const points=(ps:P3[])=>ps.map(p=>{const q=proietta(p);return`${q.x.toFixed(2)},${q.y.toFixed(2)}`;}).join(" "),interp=(a:P3,b:P3,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
 const facce=edificio.facce.filter(f=>{const n=pianoDellaFaccia(f).n;return profondita(n)+n.z>1e-7;}).sort((a,b)=>{const avg=(f:typeof a)=>f.anelli[0].reduce((v,p)=>v+profondita(p)+p.z,0)/f.anelli[0].length;return avg(a)-avg(b);});
 const muri=facce.map(f=>`<polygon points="${points(f.anelli[0])}" fill="${f.tipo==="RoofSurface"?"url(#roof)":"#dce3e8"}" stroke="#899aa8" stroke-width="1.2"/>`).join("");
 const aree=piano.falde.map(f=>`<polygon points="${points(f.punti.map(p=>dalDisegnoAlMondo(edificio,f.id,p,.07)))}" fill="none" stroke="#6ec5ac" stroke-width="1.2"/>`).join("");
 const ostacoli=sagomeOstacoliEdificio(edificio,piano).map(o=>`<polygon points="${points(o.vertici)}" fill="#edbd64" stroke="#b88b44" stroke-width=".7"/>`).join("");
 const moduli=pannelliDalDisegnoReale(edificio,piano).sort((a,b)=>profondita(a.centro)-profondita(b.centro)).map(m=>{const [a,b,c,d]=m.vertici;const linee=[...Array.from({length:5},(_,j)=>[interp(a,b,(j+1)/6),interp(d,c,(j+1)/6)]),...Array.from({length:11},(_,j)=>[interp(a,d,(j+1)/12),interp(b,c,(j+1)/12)])];return`<g><polygon points="${points(m.vertici)}" fill="#14232d" stroke="#030a0e" stroke-width="1.2"/>${linee.map(l=>{const u=proietta(l[0]),v=proietta(l[1]);return`<line x1="${u.x}" y1="${u.y}" x2="${v.x}" y2="${v.y}" stroke="#49616f" opacity=".6" stroke-width=".4"/>`;}).join("")}</g>`;}).join("");
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="roof" x2="0" y2="1"><stop stop-color="#71858f"/><stop offset="1" stop-color="#aab8bf"/></linearGradient><radialGradient id="bg"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf2f5"/></radialGradient></defs>${opzioni.sfondo===false?"":'<rect width="1200" height="800" fill="url(#bg)"/>'}<ellipse cx="600" cy="675" rx="400" ry="70" fill="#ccd7df" opacity=".5"/>${muri}${aree}${ostacoli}${moduli}${opzioni.annotazioni===false?"":`<text x="42" y="745" font-size="20" fill="#28445b" font-family="Arial">${piano.pannelli.length} moduli full black · disposizione ricavata dal modello 3D</text><text x="42" y="775" font-size="15" fill="#64748b" font-family="Arial">${testo}</text>`}</svg>`;
}

/** Riferimenti condivisi da edificio, pannelli e frecce dei flussi. */
export function proiezioneRenderAzienda(edificio:EdificioReale,rotazione=0){
 const ang=rotazione*Math.PI/180,c=Math.cos(ang),s=Math.sin(ang),profondita=(p:P3)=>(c+s)*p.x+(c-s)*p.y;
 const iso=(p:P3)=>({x:((c-s)*p.x-(s+c)*p.y)*.866,y:profondita(p)*.5-p.z}),tutti=edificio.facce.flatMap(f=>f.anelli.flat()).map(iso),minx=Math.min(...tutti.map(p=>p.x)),maxx=Math.max(...tutti.map(p=>p.x)),miny=Math.min(...tutti.map(p=>p.y)),maxy=Math.max(...tutti.map(p=>p.y)),scale=Math.min(1000/(maxx-minx),560/(maxy-miny));
 const proietta=(p:P3)=>{const q=iso(p);return{x:100+(1000-(maxx-minx)*scale)/2+(q.x-minx)*scale,y:80+(560-(maxy-miny)*scale)/2+(q.y-miny)*scale};};
 return{proietta,profondita};
}
