/** Geometria commerciale in metri, condivisa da editor, salvataggio e PDF.
 * Nessuna verifica elettrica o strutturale: la posa proposta è da confermare.
 */
export type PuntoFv = { x: number; y: number };
export type FaldaFv = { id: string; nome: string; punti: PuntoFv[] };
export type ModuloPosatoFv = { id: string; faldaId: string; x: number; y: number; orizzontale: boolean; supporto?: {inclinazione:number;verso:"x+"|"x-"|"y-";gruppo:number} };
export type OstacoloFv = { id: string; x: number; y: number; w: number; h: number; tipo?: "lucernario"|"evacuatore"|"corridoio"|"impianto" };
export type DisegnoCommercialeFv = {
  modalita: "disegno_commerciale"; versione: 1;
  falde: FaldaFv[]; pannelli: ModuloPosatoFv[]; ostacoli: OstacoloFv[];
  modulo: { corto: number; lungo: number; stimato: boolean };
  distanzaBordo: number; spazioModuli: number;
  industriale?: {versione:1;posa:"aderente"|"sud"|"est_ovest";inclinazione:number;interfila:number;costi?:{strutturaModulo:number;inverterAggiuntivi:number;prezzoInverter:number}};
  rilievo?: {versione:1;id:string;nome:string};
  schema3d?: {altezza:number;pendenza:number};
};
const EPS = 0.00001;
const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idValido = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;
const puntoValido = (v: unknown): v is PuntoFv & Record<string, unknown> => record(v) && finito(v.x) && finito(v.y) && Math.abs(v.x) <= 200 && Math.abs(v.y) <= 200;
export const arrotondaMetro = (v: number) => Math.round(v * 100) / 100;

export function areaPoligono(punti: PuntoFv[]): number {
  return Math.abs(punti.reduce((sum, p, i) => {
    const q = punti[(i + 1) % punti.length]; return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}
const cross = (a: PuntoFv, b: PuntoFv, c: PuntoFv) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function suSegmento(p: PuntoFv, a: PuntoFv, b: PuntoFv) {
  return Math.abs(cross(a, b, p)) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
export function segmentiSiIncrociano(a: PuntoFv, b: PuntoFv, c: PuntoFv, d: PuntoFv): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS));
}
export function poligonoValido(punti: PuntoFv[]) {
  if (punti.length < 3 || punti.length > 64 || !punti.every(puntoValido) || areaPoligono(punti) < 0.5) return false;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i], b = punti[(i + 1) % punti.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < EPS) return false;
    for (let j = i + 1; j < punti.length; j++) {
      if (j === i + 1 || (i === 0 && j === punti.length - 1)) continue;
      const c = punti[j], d = punti[(j + 1) % punti.length];
      if (segmentiSiIncrociano(a, b, c, d) || suSegmento(a, c, d) || suSegmento(b, c, d)) return false;
    }
  }
  return true;
}
export function puntoNelPoligono(p: PuntoFv, punti: PuntoFv[]) {
  let dentro = false;
  for (let i = 0, j = punti.length - 1; i < punti.length; j = i++) {
    const a = punti[i], b = punti[j];
    if (suSegmento(p, a, b)) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}
export const limiteModuliDisegno=(p:Pick<DisegnoCommercialeFv,"industriale">)=>p.industriale?2000:500;
export function dimensioniModulo(p:Pick<ModuloPosatoFv,"orizzontale">,modulo:DisegnoCommercialeFv["modulo"]){return{w:p.orizzontale?modulo.lungo:modulo.corto,h:p.orizzontale?modulo.corto:modulo.lungo};}
export function ingombroModulo(p: ModuloPosatoFv, modulo: DisegnoCommercialeFv["modulo"]) {
  const {w,h}=dimensioniModulo(p,modulo),c=Math.cos((p.supporto?.inclinazione??0)*Math.PI/180);
  return { x:p.x,y:p.y,w:w*(p.supporto&&p.supporto.verso!=="y-"?c:1),h:h*(p.supporto?.verso==="y-"?c:1) };
}
type Rettangolo = { x: number; y: number; w: number; h: number };
const vertici = (r: Rettangolo): PuntoFv[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
const distanzaSegmento = (p: PuntoFv, a: PuntoFv, b: PuntoFv) => {
  const l = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l)) : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
};
export function rettangoloNellaFalda(r: Rettangolo, falda: FaldaFv, bordo: number) {
  const v = vertici(r);
  if (!v.every(p => puntoNelPoligono(p, falda.punti))) return false;
  for (let i = 0; i < falda.punti.length; i++) {
    const a = falda.punti[i], b = falda.punti[(i + 1) % falda.punti.length];
    for (let j = 0; j < 4; j++) {
      const c = v[j], d = v[(j + 1) % 4];
      if (segmentiSiIncrociano(a, b, c, d)) return false;
      if (bordo > 0 && Math.min(distanzaSegmento(c, a, b), distanzaSegmento(d, a, b), distanzaSegmento(a, c, d), distanzaSegmento(b, c, d)) < bordo - EPS) return false;
    }
  }
  return true;
}
export function rettangoliSovrapposti(a: Rettangolo, b: Rettangolo, distanza = 0) {
  return a.x < b.x + b.w + distanza - EPS && a.x + a.w + distanza > b.x + EPS && a.y < b.y + b.h + distanza - EPS && a.y + a.h + distanza > b.y + EPS;
}
export function posizioneModuloValida(piano: DisegnoCommercialeFv, pannello: ModuloPosatoFv) {
  const falda = piano.falde.find(f => f.id === pannello.faldaId);
  const r = ingombroModulo(pannello, piano.modulo);
  if (!falda || !rettangoloNellaFalda(r, falda, piano.distanzaBordo)) return false;
  if (piano.ostacoli.some(o => rettangoliSovrapposti(r, o, piano.distanzaBordo))) return false;
  return !piano.pannelli.some(p => p.id !== pannello.id && (rettangoliSovrapposti(r, ingombroModulo(p, piano.modulo), piano.spazioModuli)||interfilaViolata(piano,pannello,p)));
}
export function pannelliDaRivedere(piano: DisegnoCommercialeFv) {
  return piano.pannelli.filter(p => !posizioneModuloValida(piano, p)).map(p => p.id);
}
export function limitiDisegno(piano: Pick<DisegnoCommercialeFv, "falde">) {
  const punti = piano.falde.flatMap(f => f.punti);
  const minX = Math.min(...punti.map(p => p.x)), minY = Math.min(...punti.map(p => p.y));
  const maxX = Math.max(...punti.map(p => p.x)), maxY = Math.max(...punti.map(p => p.y));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
export function creaDisegnoTetto(tipo: "due_falde" | "singola" | "elle", larghezza = 12, altezza = 8, modulo: DisegnoCommercialeFv["modulo"] = { corto: 1.134, lungo: 1.722, stimato: true }): DisegnoCommercialeFv {
  const w = Math.max(3, Math.min(100, larghezza)), h = Math.max(3, Math.min(100, altezza));
  const rett = (id: string, nome: string, y: number, alto: number): FaldaFv => ({ id, nome, punti: [{ x: 0, y }, { x: w, y }, { x: w, y: y + alto }, { x: 0, y: y + alto }] });
  const falde = tipo === "due_falde" ? [rett("falda-1", "Falda 1", 0, h / 2), rett("falda-2", "Falda 2", h / 2, h / 2)] : tipo === "elle"
    ? [{ id: "falda-1", nome: "Falda a L", punti: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h }] }]
    : [rett("falda-1", "Falda 1", 0, h)];
  return { modalita: "disegno_commerciale", versione: 1, falde, pannelli: [], ostacoli: [], modulo, distanzaBordo: 0.3, spazioModuli: 0.05 };
}
function interfilaViolata(piano:DisegnoCommercialeFv,a:ModuloPosatoFv,b:ModuloPosatoFv){
  if(!piano.industriale||!a.supporto||!b.supporto||a.faldaId!==b.faldaId||a.supporto.gruppo===b.supporto.gruppo)return false;
  const r=ingombroModulo(a,piano.modulo),s=ingombroModulo(b,piano.modulo),d=Math.max(piano.spazioModuli,piano.industriale.interfila);
  return piano.industriale.posa==="sud"?r.x<s.x+s.w-EPS&&r.x+r.w>s.x+EPS&&r.y<s.y+s.h+d-EPS&&r.y+r.h+d>s.y+EPS:r.y<s.y+s.h-EPS&&r.y+r.h>s.y+EPS&&r.x<s.x+s.w+d-EPS&&r.x+r.w+d>s.x+EPS;
}
/** Griglia industriale: file sud o coppie est/ovest con distanza libera impostata. */
export function disponiModuliIndustriali(piano:DisegnoCommercialeFv,quantita:number,orizzontale=false,soloFalda?:string):DisegnoCommercialeFv{
  const cfg=piano.industriale!;
  const conservati=soloFalda?piano.pannelli.filter(p=>p.faldaId!==soloFalda):[],next={...piano,pannelli:[...conservati]};
  const target=Math.min(limiteModuliDisegno(piano),conservati.length+Math.max(0,Math.floor(Number.isFinite(quantita)?quantita:0))),ids=new Set(conservati.map(m=>m.id));let seriale=0,tentativi=0;
  const nuovoId=()=>{let id;do{id=`modulo-${++seriale}`;}while(ids.has(id));ids.add(id);return id;};
  for(const f of piano.falde.filter(f=>!soloFalda||f.id===soloFalda)){
    const b=limitiDisegno({falde:[f]}),{w,h}=dimensioniModulo({orizzontale},piano.modulo),c=Math.cos(cfg.inclinazione*Math.PI/180),pw=w*(cfg.posa==="est_ovest"?c:1),ph=h*(cfg.posa==="sud"?c:1),gap=Math.max(piano.spazioModuli,cfg.interfila),sx0=cfg.posa==="est_ovest"?Math.ceil((pw+piano.spazioModuli)*100)/100+pw+gap:pw+piano.spazioModuli,sy0=ph+(cfg.posa==="sud"?gap:piano.spazioModuli),sx=Math.ceil(sx0*100)/100,sy=Math.ceil(sy0*100)/100;
    let riga=0;for(let y=b.y+piano.distanzaBordo;y+ph<=b.y+b.h-piano.distanzaBordo+EPS;y+=sy,riga++){
      let colonna=0;for(let x=b.x+piano.distanzaBordo;x+pw<=b.x+b.w-piano.distanzaBordo+EPS;x+=sx,colonna++){
        for(let lato=0;lato<(cfg.posa==="est_ovest"?2:1);lato++){
          if(next.pannelli.length>=target||++tentativi>40000)return next;
          const supporto=cfg.posa==="aderente"?undefined:{inclinazione:cfg.inclinazione,verso:cfg.posa==="sud"?"y-" as const:lato===0?"x-" as const:"x+" as const,gruppo:cfg.posa==="sud"?riga:colonna};
          const p:ModuloPosatoFv={id:nuovoId(),faldaId:f.id,x:arrotondaMetro(x+lato*(Math.ceil((pw+piano.spazioModuli)*100)/100)),y:arrotondaMetro(y),orizzontale,...(supporto?{supporto}:{})};
          if(posizioneModuloValida(next,p))next.pannelli.push(p);
        }
      }
    }
  }return next;
}
/** Proposta ordinata: non oltre 500 moduli, senza uscire dalle falde o invadere ostacoli. */
export function disponiModuliAutomaticamente(piano: DisegnoCommercialeFv, quantita: number, orizzontale = false, soloFalda?: string): DisegnoCommercialeFv {
  if(piano.industriale)return disponiModuliIndustriali(piano,quantita,orizzontale,soloFalda);
  const conservati = soloFalda ? piano.pannelli.filter(p => p.faldaId !== soloFalda) : [];
  const richiesti = Number.isFinite(quantita) ? Math.max(0, Math.floor(quantita)) : 0;
  const target = Math.min(500, conservati.length + richiesti);
  const next = { ...piano, pannelli: [...conservati] };
  const ids = new Set(conservati.map(p => p.id));
  let seriale = 0;
  const prossimoId = () => { do { seriale++; } while (ids.has("modulo-" + seriale)); return "modulo-" + seriale; };
  const w = orizzontale ? piano.modulo.lungo : piano.modulo.corto, h = orizzontale ? piano.modulo.corto : piano.modulo.lungo;
  for (const f of piano.falde.filter(f => !soloFalda || f.id === soloFalda)) {
    const xs = f.punti.map(p => p.x), ys = f.punti.map(p => p.y);
    for (let y = Math.min(...ys) + piano.distanzaBordo; y + h <= Math.max(...ys) - piano.distanzaBordo + EPS; y += Math.ceil((h + piano.spazioModuli) * 100) / 100) {
      for (let x = Math.min(...xs) + piano.distanzaBordo; x + w <= Math.max(...xs) - piano.distanzaBordo + EPS; x += Math.ceil((w + piano.spazioModuli) * 100) / 100) {
        if (next.pannelli.length >= target) return next;
        const p = { id: prossimoId(), faldaId: f.id, x: arrotondaMetro(x), y: arrotondaMetro(y), orizzontale };
        if (posizioneModuloValida(next, p)) next.pannelli.push(p);
      }
    }
  }
  return next;
}
/** Confronto limitato di griglie e orientamenti, senza cambiare contorni o ostacoli.
 * La capacità proposta non è una ricerca esaustiva del massimo installabile.
 */
export function disponiModuliOttimizzati(piano: DisegnoCommercialeFv, quantita: number, orientamento: boolean | "auto" = "auto", soloFalda?: string): DisegnoCommercialeFv {
  if(piano.industriale){const a=disponiModuliIndustriali(piano,quantita,orientamento===true,soloFalda);if(orientamento!=="auto")return a;const b=disponiModuliIndustriali(piano,quantita,true,soloFalda);return b.pannelli.length>a.pannelli.length?b:a;}
  const conservati = soloFalda ? piano.pannelli.filter(p => p.faldaId !== soloFalda) : [];
  const target = Math.min(500, conservati.length + (Number.isFinite(quantita) ? Math.max(0, Math.floor(quantita)) : 0));
  const next = { ...piano, pannelli: [...conservati] };
  let tentativi = 0, seriale = 0;
  const ids = new Set(conservati.map(p => p.id));
  const nuovoId = () => { do { seriale++; } while (ids.has("modulo-" + seriale)); const id = "modulo-" + seriale; ids.add(id); return id; };
  for (const f of piano.falde.filter(f => !soloFalda || f.id === soloFalda)) {
    if (!poligonoValido(f.punti) || next.pannelli.length >= target) continue;
    const b = limitiDisegno({ falde: [f] }), mancanti = target - next.pannelli.length;
    let migliore: ModuloPosatoFv[] = [];
    const orientamenti = orientamento === "auto" ? [false, true] : [orientamento];
    cerca: for (const orizzontale of orientamenti) {
      const w = orizzontale ? piano.modulo.lungo : piano.modulo.corto, h = orizzontale ? piano.modulo.corto : piano.modulo.lungo;
      if (!(w > 0 && h > 0 && piano.spazioModuli >= 0)) continue;
      const sx = Math.ceil((w + piano.spazioModuli) * 100) / 100, sy = Math.ceil((h + piano.spazioModuli) * 100) / 100;
      for (const fy of [0, .25, .5, .75]) for (const fx of [0, .25, .5, .75]) {
        const candidati: ModuloPosatoFv[] = [];
        for (let y = b.y + piano.distanzaBordo + fy * sy; y + h <= b.y + b.h - piano.distanzaBordo + EPS; y += sy) {
          for (let x = b.x + piano.distanzaBordo + fx * sx; x + w <= b.x + b.w - piano.distanzaBordo + EPS; x += sx) {
            if (++tentativi > 120000) break cerca;
            const p = { id: "candidato", faldaId: f.id, x: arrotondaMetro(x), y: arrotondaMetro(y), orizzontale };
            // All'interno della griglia passo e dimensioni garantiscono il distacco.
            // Si controllano falda, ostacoli e moduli già conservati su altre falde.
            if (posizioneModuloValida(next, p)) candidati.push(p);
            if (candidati.length >= mancanti) break;
          }
          if (candidati.length >= mancanti) break;
        }
        if (candidati.length > migliore.length) migliore = candidati;
        if (migliore.length >= mancanti) break cerca;
      }
    }
    if (migliore.length) {
      const rett = migliore.map(p => ingombroModulo(p, piano.modulo));
      const minX = Math.min(...rett.map(r => r.x)), minY = Math.min(...rett.map(r => r.y));
      const maxX = Math.max(...rett.map(r => r.x + r.w)), maxY = Math.max(...rett.map(r => r.y + r.h));
      const dx = b.x + b.w / 2 - (minX + maxX) / 2, dy = b.y + b.h / 2 - (minY + maxY) / 2;
      const centrati = migliore.map(p => ({ ...p, x: arrotondaMetro(p.x + dx), y: arrotondaMetro(p.y + dy) }));
      if (centrati.every(p => posizioneModuloValida(next, p))) migliore = centrati;
      for (const p of migliore) {
        const finale = { ...p, id: nuovoId() };
        if (posizioneModuloValida(next, finale)) next.pannelli.push(finale);
      }
    }
  }
  return next;
}
/** Inserimento/spostamento atomico: conserva le altre falde e ricalcola quelle coinvolte. */
export function aggiornaOstacoloConPosa(piano: DisegnoCommercialeFv, o: OstacoloFv): DisegnoCommercialeFv | null {
  if (![o.x, o.y, o.w, o.h].every(Number.isFinite) || o.w < .1 || o.h < .1 || o.w > (piano.industriale?200:20) || o.h > (piano.industriale?200:20) || Math.abs(o.x) > 200 || Math.abs(o.y) > 200 || !o.id || o.id.length > 80) return null;
  if (!piano.ostacoli.some(v => v.id === o.id) && piano.ostacoli.length >= 100) return null;
  const falda = piano.falde.find(f => rettangoloNellaFalda(o, f, 0));
  if (!falda || piano.ostacoli.some(v => v.id !== o.id && rettangoliSovrapposti(o, v))) return null;
  const precedente = piano.ostacoli.find(v => v.id === o.id), vecchia = precedente && piano.falde.find(f => rettangoloNellaFalda(precedente, f, 0));
  let next = { ...piano, ostacoli: [...piano.ostacoli.filter(v => v.id !== o.id), o] };
  for (const fid of new Set([falda.id, ...(vecchia ? [vecchia.id] : [])])) next = disponiModuliOttimizzati(next, piano.pannelli.filter(p => p.faldaId === fid).length, "auto", fid);
  return next;
}
/** JSON di bozza/API: limiti di dimensioni, cardinalità, ID univoci e poligoni semplici. */
export function leggiDisegnoCommerciale(raw: unknown): DisegnoCommercialeFv | null {
  if (!record(raw) || raw.modalita !== "disegno_commerciale" || raw.versione !== 1 || !Array.isArray(raw.falde) || !Array.isArray(raw.pannelli) || !Array.isArray(raw.ostacoli)) return null;
  let industriale:DisegnoCommercialeFv["industriale"];
  if(raw.industriale!==undefined){const c=raw.industriale;if(!record(c)||c.versione!==1||!["aderente","sud","est_ovest"].includes(String(c.posa))||!finito(c.inclinazione)||c.inclinazione<0||c.inclinazione>35||!finito(c.interfila)||c.interfila<.02||c.interfila>5)return null;let costi:NonNullable<DisegnoCommercialeFv["industriale"]>["costi"];if(c.costi!==undefined){const x=c.costi;if(!record(x)||!finito(x.strutturaModulo)||x.strutturaModulo<0||x.strutturaModulo>1000||!finito(x.inverterAggiuntivi)||!Number.isInteger(x.inverterAggiuntivi)||x.inverterAggiuntivi<0||x.inverterAggiuntivi>20||!finito(x.prezzoInverter)||x.prezzoInverter<0||x.prezzoInverter>100000)return null;costi={strutturaModulo:x.strutturaModulo,inverterAggiuntivi:x.inverterAggiuntivi,prezzoInverter:x.prezzoInverter};}industriale={...(costi?{costi}:{}),versione:1,posa:c.posa as NonNullable<DisegnoCommercialeFv["industriale"]>["posa"],inclinazione:c.inclinazione,interfila:c.interfila};}
  if (raw.falde.length < 1 || raw.falde.length > 12 || raw.pannelli.length > (industriale?2000:500) || raw.ostacoli.length > 100) return null;
  const m = raw.modulo;
  if (!record(m) || !finito(m.corto) || !finito(m.lungo) || m.corto < 0.5 || m.corto > 1.6 || m.lungo < 0.8 || m.lungo > 3.2) return null;
  if (!finito(raw.distanzaBordo) || raw.distanzaBordo < 0 || raw.distanzaBordo > 2 || !finito(raw.spazioModuli) || raw.spazioModuli < 0.02 || raw.spazioModuli > 1) return null;
  const falde: FaldaFv[] = [];
  for (const f of raw.falde) {
    if (!record(f) || !idValido(f.id) || typeof f.nome !== "string" || f.nome.length > 80 || !Array.isArray(f.punti) || !poligonoValido(f.punti as PuntoFv[])) return null;
    if (falde.some(x => x.id === f.id)) return null;
    falde.push({ id: f.id, nome: f.nome, punti: f.punti.map(p => ({ x: p.x, y: p.y })) });
  }
  const pannelli: ModuloPosatoFv[] = [];
  for (const p of raw.pannelli) {
    if (!record(p) || !idValido(p.id) || !idValido(p.faldaId) || !falde.some(f => f.id === p.faldaId) || !puntoValido(p) || typeof p.orizzontale !== "boolean" || pannelli.some(x => x.id === p.id)) return null;
    let supporto:ModuloPosatoFv["supporto"];
    if(p.supporto!==undefined){const q=p.supporto;if(!industriale||industriale.posa==="aderente"||!record(q)||!finito(q.inclinazione)||q.inclinazione!==industriale.inclinazione||!["x+","x-","y-"].includes(String(q.verso))||(industriale.posa==="sud")!==(q.verso==="y-")||!finito(q.gruppo)||!Number.isSafeInteger(q.gruppo)||q.gruppo<0||q.gruppo>2000)return null;supporto={inclinazione:q.inclinazione,verso:q.verso as NonNullable<ModuloPosatoFv["supporto"]>["verso"],gruppo:q.gruppo};}
    if(industriale&&industriale.posa!=="aderente"&&!supporto)return null;
    pannelli.push({ ...(supporto?{supporto}:{}),id: p.id, faldaId: p.faldaId, x: p.x, y: p.y, orizzontale: p.orizzontale });
  }
  const ostacoli: OstacoloFv[] = [];
  for (const o of raw.ostacoli) {
    if (!record(o) || !idValido(o.id) || !puntoValido(o) || !finito(o.w) || !finito(o.h) || o.w < 0.1 || o.h < 0.1 || o.w > (industriale?200:20) || o.h > (industriale?200:20) || ostacoli.some(x => x.id === o.id)) return null;
    if(o.tipo!==undefined&&!["lucernario","evacuatore","corridoio","impianto"].includes(String(o.tipo)))return null;
    ostacoli.push({ ...(o.tipo?{tipo:o.tipo as OstacoloFv["tipo"]}:{}),id: o.id, x: o.x, y: o.y, w: o.w, h: o.h });
  }
  let rilievo: DisegnoCommercialeFv["rilievo"];
  if (raw.rilievo !== undefined) {
    const r=raw.rilievo;
    if (!record(r) || r.versione!==1 || !idValido(r.id) || typeof r.nome!=="string" || !r.nome.trim() || r.nome.length>160) return null;
    rilievo={versione:1,id:r.id,nome:r.nome};
  }
  let schema3d:DisegnoCommercialeFv["schema3d"];
  if(raw.schema3d!==undefined){const a=raw.schema3d;if(!record(a)||!finito(a.altezza)||a.altezza<2||a.altezza>150||!finito(a.pendenza)||a.pendenza<0||a.pendenza>75)return null;schema3d={altezza:a.altezza,pendenza:a.pendenza};}
  return { modalita: "disegno_commerciale", versione: 1, falde, pannelli, ostacoli, ...(industriale?{industriale}:{}),...(rilievo ? {rilievo} : {}),...(schema3d?{schema3d}:{}),
    modulo: { corto: m.corto, lungo: m.lungo, stimato: m.stimato !== false }, distanzaBordo: raw.distanzaBordo, spazioModuli: raw.spazioModuli };
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function svgDisegnoCommerciale(piano: DisegnoCommercialeFv) {
  const b = limitiDisegno(piano), bad = new Set(pannelliDaRivedere(piano));
  const falde = piano.falde.map((f, i) => '<polygon points="' + f.punti.map(p => p.x + "," + p.y).join(" ") + '" fill="' + (i % 2 ? "#E4EAF0" : "#F1F5F9") + '" stroke="#8494A7" stroke-width=".05"/><text x="' + (f.punti.reduce((n,p)=>n+p.x,0)/f.punti.length) + '" y="' + (Math.min(...f.punti.map(p=>p.y)) + .22) + '" text-anchor="middle" font-size=".2" fill="#64748B">' + esc(f.nome) + '</text>').join("");
  const ostacoli = piano.ostacoli.map(o => '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="#EABF93" stroke="#A16207" stroke-width=".04"/>').join("");
  const moduli = piano.pannelli.map(p => {
    const r = ingombroModulo(p, piano.modulo);
    return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx=".035" fill="' + (bad.has(p.id) ? "#DC2626" : "#182126") + '" stroke="#566168" stroke-width=".025"/><path d="M' + (r.x+r.w/2) + ' ' + r.y + 'v' + r.h + ' M' + r.x + ' ' + (r.y+r.h/3) + 'h' + r.w + ' M' + r.x + ' ' + (r.y+2*r.h/3) + 'h' + r.w + '" stroke="#6f7a7e" stroke-opacity=".35" stroke-width=".009"/>';
  }).join("");
  const c=piano.industriale;
  const legenda=c?'<text x="'+b.x+'" y="'+(b.y+b.h+.7)+'" font-size=".4" fill="#475569">Pianta · '+(c.posa==="aderente"?'posa aderente':c.posa==="sud"?'file sud':'coppie est–ovest')+' · supporti '+(c.posa==="aderente"?0:c.inclinazione)+'° · spazio libero '+c.interfila+' m</text>':'';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (b.x-1) + ' ' + (b.y-1) + ' ' + (b.w+2) + ' ' + (b.h+2) + '" role="img" aria-label="Disposizione proposta dei pannelli sul tetto" style="width:100%;height:auto;background:#FAFCFE">' + falde + ostacoli + moduli + legenda + '</svg>';
}
