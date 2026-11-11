/** Vista illustrativa del fabbricato: stessi poligoni e moduli della pianta.
 * Quote e pendenze sono convenzionali, non un rilievo dell’immobile reale.
 */
import { ingombroModulo, limitiDisegno, pannelliDaRivedere, type DisegnoCommercialeFv, type PuntoFv } from "./fvDisegnoCommerciale.ts";
export function svgVistaTetto(piano: DisegnoCommercialeFv, lato = 0, copertura: "antracite" | "tegole" = "antracite") {
  const b = limitiDisegno(piano), theta = lato * Math.PI / 2;
  const rot = (p: PuntoFv) => { const x=p.x-b.x-b.w/2,y=p.y-b.y-b.h/2;return {x:x*Math.cos(theta)-y*Math.sin(theta),y:x*Math.sin(theta)+y*Math.cos(theta)}; };
  const rettangolari = piano.falde.length === 2 && piano.falde.every(f => f.punti.length === 4 && f.punti.every(p => Math.abs(p.x-b.x)<.001 || Math.abs(p.x-b.x-b.w)<.001)) && piano.falde.every(f => f.punti.every(p => [b.y,b.y+b.h/2,b.y+b.h].some(y=>Math.abs(p.y-y)<.001)));
  const quota = (p:PuntoFv) => 3 + (rettangolari ? Math.max(0,b.h/2-Math.abs(p.y-b.y-b.h/2))*.35 : 0);
  const proietta = (p:PuntoFv,z=quota(p)) => { const r=rot(p);return {x:(r.x-r.y)*.866,y:(r.x+r.y)*.5-z}; };
  const tutti=piano.falde.flatMap(f=>f.punti.flatMap(p=>[proietta(p),proietta(p,0)]));
  const minX=Math.min(...tutti.map(p=>p.x)),maxX=Math.max(...tutti.map(p=>p.x)),minY=Math.min(...tutti.map(p=>p.y)),maxY=Math.max(...tutti.map(p=>p.y));
  const scala=Math.min(770/(maxX-minX),430/(maxY-minY));
  const punto=(p:PuntoFv,z?:number)=>{const q=proietta(p,z);return `${(480+(q.x-(minX+maxX)/2)*scala).toFixed(2)},${(295+(q.y-(minY+maxY)/2)*scala).toFixed(2)}`;};
  const punti=(ps:PuntoFv[],z?:number)=>ps.map(p=>punto(p,z)).join(" ");
  const vertici=(x:number,y:number,w:number,h:number):PuntoFv[]=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  const bordo=new Map<string,{a:PuntoFv;b:PuntoFv;conteggio:number}>();
  for(const f of piano.falde) for(let i=0;i<f.punti.length;i++){
    const a=f.punti[i],bb=f.punti[(i+1)%f.punti.length];
    const key=[`${a.x}:${a.y}`,`${bb.x}:${bb.y}`].sort().join("|");
    const old=bordo.get(key);if(old)old.conteggio++;else bordo.set(key,{a,b:bb,conteggio:1});
  }
  const muri=[...bordo.values()].filter(e=>e.conteggio===1).sort((a,b)=>{const aa=rot(a.a),ab=rot(a.b),ba=rot(b.a),bb=rot(b.b);return aa.x+aa.y+ab.x+ab.y-ba.x-ba.y-bb.x-bb.y;}).map(({a,b:bb})=>{
    const ra=rot(a),rb=rot(bb),colore=(rb.x-ra.x)>(rb.y-ra.y)?"#e9e6df":"#d4d6d3";
    const parete=[punto(a,0),punto(bb,0),punto(bb),punto(a)].join(" ");
    const lunghezza=Math.hypot(bb.x-a.x,bb.y-a.y),finestre:string[]=[];
    if(lunghezza>3) for(const t of [.3,.7]){
      const mezzo=Math.min(.6/lunghezza,.12),sin={x:a.x+(bb.x-a.x)*(t-mezzo),y:a.y+(bb.y-a.y)*(t-mezzo)},des={x:a.x+(bb.x-a.x)*(t+mezzo),y:a.y+(bb.y-a.y)*(t+mezzo)};
      finestre.push(`<polygon points="${[punto(sin,1),punto(des,1),punto(des,2.1),punto(sin,2.1)].join(" ")}" fill="#8c9b9e" stroke="#f5f2ea" stroke-width="4"/><path d="M${punto({x:(sin.x+des.x)/2,y:(sin.y+des.y)/2},1)} L${punto({x:(sin.x+des.x)/2,y:(sin.y+des.y)/2},2.1)}" stroke="#e1e6e3" stroke-width="1.2"/>`);
    }
    return `<polygon points="${parete}" fill="${colore}" stroke="#bec2bd" stroke-width=".7"/>${finestre.join("")}`;
  }).join("");
  const bad=new Set(pannelliDaRivedere(piano));
  const falde=[...piano.falde].sort((a,b)=>{const centro=(ps:PuntoFv[])=>ps.reduce((s,p)=>{const r=rot(p);return s+r.x+r.y;},0)/ps.length;return centro(a.punti)-centro(b.punti);}).map((f,idx)=>{
    const roof= copertura==="tegole" ? idx%2?"#a9795f":"#b58568" : idx%2?"#747a78":"#8b918d";
    const contorno=punti(f.punti),clip=`fv-render-roof-${idx}`;
    const xs=f.punti.map(p=>p.x),ys=f.punti.map(p=>p.y),trama:string[]=[];
    const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
    // Limite di righe della texture anche sui tetti grandi.
    const passo=Math.max(.28,(maxy-miny)/65);
    for(let y=miny;y<=maxy;y+=passo) trama.push(`M${punto({x:minx,y})} L${punto({x:maxx,y})}`);
    const moduli=piano.pannelli.filter(p=>p.faldaId===f.id).map(p=>{
      const r=ingombroModulo(p,piano.modulo),v=vertici(r.x,r.y,r.w,r.h),proj=v.map(q=>punto(q,quota(q)+.045)).join(" ");
      const linee:string[]=[];
      for(const t of [1/3,2/3]){
        const a={x:r.x,y:r.y+r.h*t},bb={x:r.x+r.w,y:a.y};linee.push(`M${punto(a,quota(a)+.05)} L${punto(bb,quota(bb)+.05)}`);
      }
      const a={x:r.x+r.w/2,y:r.y},bb={x:a.x,y:r.y+r.h};linee.push(`M${punto(a,quota(a)+.05)} L${punto(bb,quota(bb)+.05)}`);
      return `<polygon points="${proj}" fill="${bad.has(p.id)?"#a74444":"url(#fv-render-black)"}" stroke="#50595d" stroke-width="1" stroke-linejoin="round"/><path d="${linee.join(" ")}" fill="none" stroke="#707c80" stroke-opacity=".28" stroke-width=".55"/>`;
    }).join("");
    return `<defs><clipPath id="${clip}"><polygon points="${contorno}"/></clipPath></defs><polygon points="${contorno}" fill="${roof}" stroke="#626b69" stroke-width="2" stroke-linejoin="round"/><path clip-path="url(#${clip})" d="${trama.join(" ")}" fill="none" stroke="#29332e" stroke-opacity=".13" stroke-width=".7"/>${moduli}`;
  }).join("");
  const ostacoli=piano.ostacoli.map(o=>`<polygon points="${punti(vertici(o.x,o.y,o.w,o.h))}" fill="#9a9385" stroke="#656158" stroke-width="1.5"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="Vista illustrativa della casa con pannelli sul tetto" style="width:100%;height:100%;display:block"><defs><linearGradient id="fv-render-bg" x2="0" y2="1"><stop stop-color="#f8f9f7"/><stop offset="1" stop-color="#e9ede8"/></linearGradient><linearGradient id="fv-render-black" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#303a40"/><stop offset=".4" stop-color="#171e23"/><stop offset="1" stop-color="#0d1317"/></linearGradient><radialGradient id="fv-render-shadow"><stop stop-color="#3f4d40" stop-opacity=".22"/><stop offset="1" stop-color="#3f4d40" stop-opacity="0"/></radialGradient></defs><rect width="960" height="600" fill="url(#fv-render-bg)"/><ellipse cx="485" cy="440" rx="360" ry="105" fill="url(#fv-render-shadow)"/>${muri}${falde}${ostacoli}<text x="480" y="570" text-anchor="middle" fill="#7a877e" font-family="system-ui,sans-serif" font-size="12">Vista illustrativa · quote e pendenze da confermare nel sopralluogo</text></svg>`;
}
