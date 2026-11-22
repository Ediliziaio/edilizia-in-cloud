import { assiDelMuro, distanza, distanzaDalContorno, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { attraversamentiImpianto, percorsoConVertici, puntiPercorso, type Percorso } from "../../../shared/planimetrie/impianti.ts";
import { eAmbienteInterno, type Punto, type StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { vaniDiPassaggio } from "./accessiPlanimetria";
import { eParteComune } from "./unita";

const EPS = 1e-5;
const sposta = (p: Punto, dir: Punto, cm: number) => ({ x: p.x + dir.x * cm, y: p.y + dir.y * cm });
const interpola = (a: Punto, b: Punto, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unita = (nome?: string) => nome?.trim().toLocaleLowerCase("it") ?? "";

function inContorno(p: Punto, contorno: Punto[]) {
  return puntoNelPoligono(p, contorno) || distanzaDalContorno(p, contorno) < .1;
}

function taglio(a: Punto, b: Punto, c: Punto, d: Punto): number | undefined {
  const x = b.x - a.x, y = b.y - a.y, u = d.x - c.x, v = d.y - c.y;
  const den = x * v - y * u;
  if (Math.abs(den) < EPS) return undefined;
  const t = ((c.x - a.x) * v - (c.y - a.y) * u) / den;
  const s = ((c.x - a.x) * y - (c.y - a.y) * x) / den;
  return t > EPS && t < 1 - EPS && s >= -EPS && s <= 1 + EPS ? t : undefined;
}

function sagomeFisse(stato: StatoPianta) {
  const fissi = new Set(["pilastro", "ascensore", "scala", "scala_u", "scala_chiocciola"]);
  return stato.elementi.filter(e => fissi.has(e.tipo) && e.stato !== "da_demolire").map(e => {
    const a = e.rotazione * Math.PI / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -u.y, y: u.x };
    return [[-1,-1], [1,-1], [1,1], [-1,1]].map(([x,y]) =>
      sposta(sposta(e.posizione, u, x * e.larghezza / 2), n, y * e.profondita / 2)
    );
  });
}

const conVertici = (p: Percorso) => p.vertici ? p : percorsoConVertici(p, puntiPercorso(p).slice(1, -1));
export const muriChiusiSulPercorso = (p: Percorso, stato: StatoPianta) =>
  attraversamentiImpianto(conVertici(p), stato).filter(a => !a.aperturaId);

/** Cerca una traccia in pianta fra gli stessi simboli, attraverso soli interni e varchi disegnati. */
export function proponiPercorsoScarico(prima: Percorso, stato: StatoPianta) {
  if (prima.linea !== "scarico") return null;
  const da = prima.da, a = prima.a;
  const interni = stato.locali.filter(eAmbienteInterno);
  const stanzaDa = interni.find(l => inContorno(da, l.contorno));
  const stanzaA = interni.find(l => inContorno(a, l.contorno));
  if (!stanzaDa || !stanzaA) return null;
  const sigla = unita(stanzaA.unita);
  const comuni = eParteComune(stanzaDa.unita ?? "");
  if (interni.some(l => unita(l.unita)) && (!sigla || (!comuni && unita(stanzaDa.unita) !== sigla))) return null;
  const locali = interni.filter(l => unita(l.unita) === sigla || (comuni && eParteComune(l.unita)));
  const ids = new Set(locali.map(l => l.id));
  const portali = vaniDiPassaggio(stato).flatMap(({ apertura, muro, centro, lati }) => {
    if (!["porta","varco"].includes(apertura.tipo) || muro.tipo === "esterno" ||
      !lati.every(l => l.length === 1 && ids.has(l[0])) || lati[0][0] === lati[1][0]) return [];
    const { dir, normale } = assiDelMuro(muro);
    const profondita = muro.spessore / 2 + 8;
    const meta = apertura.larghezza / 2 - Math.min(5, apertura.larghezza / 4);
    const fronte = sposta(centro, normale, profondita), retro = sposta(centro, normale, -profondita);
    return [{ id: apertura.id, fronte, retro, contorno: [
      sposta(fronte, dir, -meta), sposta(fronte, dir, meta), sposta(retro, dir, meta), sposta(retro, dir, -meta),
    ] }];
  });
  const ammessi = new Set(portali.map(p => p.id));
  const contorni = [...locali.map(l => l.contorno), ...portali.map(p => p.contorno)];
  const ostacoli = sagomeFisse(stato);
  const utilizzabile = (p: Punto) => contorni.some(c => inContorno(p, c)) && !ostacoli.some(c => inContorno(p, c));
  if (!utilizzabile(da) || !utilizzabile(a)) return null;

  const lati = [...contorni, ...ostacoli].flatMap(c => c.map((p, i) => [p, c[(i + 1) % c.length]] as const));
  const libero = (p: Punto, q: Punto) => {
    const intersezioni = attraversamentiImpianto({ ...prima, da:p, a:q, vertici:[] }, stato);
    if (intersezioni.some(i => !i.aperturaId || !ammessi.has(i.aperturaId))) return false;
    const tagli = [0, 1];
    for (const [c,d] of lati) {
      const t = taglio(p,q,c,d);
      if (t !== undefined) tagli.push(t);
    }
    tagli.sort((x,y) => x - y);
    return tagli.slice(1).every((t,i) => t - tagli[i] < EPS || utilizzabile(interpola(p,q,(t + tagli[i]) / 2)));
  };

  const nodi = [da, a, ...portali.flatMap(p => [p.fronte,p.retro]).filter(utilizzabile)];
  // I punti adiacenti agli spigoli permettono di seguire un disimpegno a L o aggirare un pilastro.
  for (const vertice of [...locali.map(l => l.contorno), ...ostacoli].flat()) {
    for (let lato = 0; lato < 8; lato++) {
      const angolo = lato * Math.PI / 4;
      const p = sposta(vertice,{x:Math.cos(angolo),y:Math.sin(angolo)},6);
      if (utilizzabile(p) && !nodi.some(q => distanza(p,q) < 2)) nodi.push(p);
    }
  }
  const distanze = nodi.map((_,i) => i === 0 ? 0 : Infinity);
  const precedenti = nodi.map(() => -1);
  const visitati = new Set<number>();
  for (;;) {
    let i = -1;
    for (let k=0;k<nodi.length;k++) {
      if (!visitati.has(k) && Number.isFinite(distanze[k]) && (i < 0 || distanze[k] < distanze[i])) i = k;
    }
    if (i === -1) return null;
    if (i === 1) break;
    visitati.add(i);
    for (let k=0;k<nodi.length;k++) {
      if (visitati.has(k)) continue;
      const peso = distanze[i] + distanza(nodi[i],nodi[k]);
      if (peso >= distanze[k] || !libero(nodi[i],nodi[k])) continue;
      distanze[k] = peso;
      precedenti[k] = i;
    }
  }
  const vertici: Punto[] = [];
  for (let i=precedenti[1];i>0;i=precedenti[i]) vertici.unshift(nodi[i]);
  const dopo = percorsoConVertici(prima,vertici);
  const attraversamenti = attraversamentiImpianto(dopo,stato);
  if (attraversamenti.some(p => !p.aperturaId || !ammessi.has(p.aperturaId))) return null;
  return { prima: conVertici(prima), dopo, orizzontaleCm: distanze[1], varchi: [...new Set(attraversamenti.flatMap(p => p.aperturaId ? [p.aperturaId] : []))] };
}
