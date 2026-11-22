import {
  areaPoligono, assiDelMuro, contornoIncrociato, distanza, distanzaPuntoSegmento,
  intersezioneAssi, puntoNelPoligono, segmentiSiIncrociano, sulTratto,
} from "../../../shared/planimetrie/geometria.ts";
import { origineMisura, type Elemento, type Locale, type Muro, type Proposta, type Punto, type StatoPianta } from "../../../shared/planimetrie/modello.ts";
import type { AlternativaFrazionamento } from "../../../shared/planimetrie/assistenzaStudio.ts";

export type AsseFrazionamento = "x" | "y";
type Segmento = [Punto, Punto];
const SPESSORE = 12;
const EPS = 0.02;
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const arrotondaPunto = (p: Punto): Punto => ({ x: arrotonda(p.x), y: arrotonda(p.y) });

function incrocio(a: Punto, b: Punto, asse: AsseFrazionamento, quota: number): Punto {
  const t = (quota - a[asse]) / (b[asse] - a[asse]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clip(contorno: Punto[], asse: AsseFrazionamento, quota: number, verso: 1 | -1): Punto[] {
  const esito: Punto[] = [];
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const dentro = verso * (a[asse] - quota) >= 0;
    if (dentro) esito.push(a);
    if (dentro !== (verso * (b[asse] - quota) >= 0)) esito.push(incrocio(a, b, asse, quota));
  }
  return esito.map(arrotondaPunto).filter((p, i, punti) => distanza(p, punti[(i + punti.length - 1) % punti.length]) > EPS);
}

function attraversamento(contorno: Punto[], asse: AsseFrazionamento, quota: number): Segmento | null {
  const incroci: Punto[] = [];
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    if (Math.abs(a[asse] - quota) <= EPS && Math.abs(b[asse] - quota) <= EPS) return null;
    if ((a[asse] > quota) === (b[asse] > quota)) continue;
    const p = incrocio(a, b, asse, quota);
    if (!incroci.some((x) => distanza(x, p) <= EPS)) incroci.push(p);
  }
  return incroci.length === 2 && distanza(incroci[0], incroci[1]) > SPESSORE
    ? [arrotondaPunto(incroci[0]), arrotondaPunto(incroci[1])] : null;
}

/** Conserva il filo interno già disegnato quando una nuova parete attraversa tutto il locale. */
export function dividiContornoSulTramezzo(contorno: Punto[], muro: Muro, muriDiAppoggio: readonly Muro[] = []): Punto[][] | null {
  const { p1, p2, spessore } = muro;
  const asse = Math.abs(p1.x - p2.x) <= EPS ? "x" : Math.abs(p1.y - p2.y) <= EPS ? "y" : null;
  if (!asse || contornoIncrociato(contorno)) return null;
  const centro = (p1[asse] + p2[asse]) / 2, meta = spessore / 2;
  const passaggio = attraversamento(contorno, asse, centro);
  const raggiunge = (p: Punto) => {
    if (distanzaPuntoSegmento(p, p1, p2) <= 1) return true;
    // Un contorno CAD può terminare nello spessore della parete che riceve il tramezzo.
    const estremo = distanza(p, p1) < distanza(p, p2) ? p1 : p2;
    return muriDiAppoggio.some(m => {
      if (m.id === muro.id || m.stato === "da_demolire" || distanzaPuntoSegmento(p, m.p1, m.p2) > m.spessore / 2 + EPS) return false;
      const incrocio = intersezioneAssi(muro, m);
      return incrocio && distanza(incrocio.punto, estremo) <= 1 && sulTratto(incrocio.tB, m);
    });
  };
  if (!passaggio || !passaggio.every(raggiunge)
    || !attraversamento(contorno, asse, centro - meta) || !attraversamento(contorno, asse, centro + meta)) return null;
  const parti = [clip(contorno, asse, centro - meta, -1), clip(contorno, asse, centro + meta, 1)];
  return parti.every(p => p.length >= 3 && areaPoligono(p) > 1 && !contornoIncrociato(p)) ? parti : null;
}

function distanzaSegmenti([a,b]: Segmento, [c,d]: Segmento): number {
  if (segmentiSiIncrociano(a,b,c,d)) return 0;
  return Math.min(distanzaPuntoSegmento(a,c,d), distanzaPuntoSegmento(b,c,d), distanzaPuntoSegmento(c,a,b), distanzaPuntoSegmento(d,a,b));
}

export function tramezzoIncontraElemento(taglio: Segmento, e: Elemento, spessore: number): boolean {
  const angolo = e.rotazione * Math.PI / 180;
  const c = Math.cos(angolo), s = Math.sin(angolo);
  const l = (e.larghezza + spessore) / 2, p = (e.profondita + spessore) / 2;
  const ingombro = [[-l, -p], [l, -p], [l, p], [-l, p]].map(([x, y]) => ({
    x: e.posizione.x + x * c - y * s, y: e.posizione.y + x * s + y * c,
  }));
  return taglio.some(p => puntoNelPoligono(p, ingombro))
    || ingombro.some((a, i) => distanzaSegmenti(taglio, [a, ingombro[(i + 1) % 4]]) <= EPS);
}

function ostacolo(taglio: Segmento, base: StatoPianta): string | null {
  const attivi = base.muri.filter((m) => m.stato !== "da_demolire");
  for (const a of base.aperture) {
    const m = attivi.find((m) => m.id === a.muroId);
    if (!m || a.stato === "da_demolire") continue;
    const { dir } = assiDelMuro(m);
    const punto = (offset: number) => ({ x: m.p1.x + dir.x * offset, y: m.p1.y + dir.y * offset });
    if (distanzaSegmenti(taglio, [punto(a.offset), punto(a.offset + a.larghezza)]) <= m.spessore / 2 + SPESSORE / 2 + EPS) return "Il tramezzo incontra una porta o una finestra.";
  }
  for (const e of base.elementi) {
    if (e.stato === "da_demolire") continue;
    if (tramezzoIncontraElemento(taglio, e, SPESSORE)) {
      return `Il tramezzo incontra ${e.etichetta || e.tipo.replaceAll("_", " ")}.`;
    }
  }
  const [a,b] = taglio;
  const aInterno = {x:.99*a.x+.01*b.x,y:.99*a.y+.01*b.y};
  const bInterno = {x:.01*a.x+.99*b.x,y:.01*a.y+.99*b.y};
  if (attivi.some(m=>segmentiSiIncrociano(a,b,m.p1,m.p2) || distanzaSegmenti([aInterno,bInterno],[m.p1,m.p2]) <= EPS)) {
    return "Il tramezzo incontra una parete interna. Scegli un altro taglio.";
  }
  return null;
}

export type EsitoFrazionamento = { ok: true; parti: Punto[][]; tagli: Segmento[]; superficieMuri: number } | { ok: false; motivo: string };

/** Tagli ortogonali del perimetro con riscontro del filo netto su entrambi i lati. */
export function frazionaContorno(base: StatoPianta, locale: Locale, asse: AsseFrazionamento, percentuali: number[]): EsitoFrazionamento {
  const contorno = locale.contorno;
  if (contorno.length < 3 || contornoIncrociato(contorno)) return { ok: false, motivo: "Chiudi o correggi il perimetro del locale." };
  if (percentuali.length < 1 || percentuali.length > 2 || percentuali.some((p,i) => !Number.isFinite(p) || p <= (percentuali[i - 1] ?? 0) || p >= 100)) {
    return { ok: false, motivo: "Indica tagli crescenti tra 0 e 100% del locale." };
  }
  const misure = contorno.map((p) => p[asse]);
  const a = Math.min(...misure), b = Math.max(...misure);
  const tagli: Segmento[] = [];
  const quote = percentuali.map((p) => arrotonda(a + (b - a) * p / 100));
  for (const q of quote) {
    const taglio = attraversamento(contorno, asse, q);
    if (!taglio || !attraversamento(contorno, asse, q - SPESSORE / 2) || !attraversamento(contorno, asse, q + SPESSORE / 2)) {
      return { ok: false, motivo: "Questo taglio attraversa più porzioni del perimetro. Cambia la posizione o disegna i confini a mano." };
    }
    const impedimento = ostacolo(taglio, base);
    if (impedimento) return { ok: false, motivo: impedimento };
    tagli.push(taglio);
  }
  const parti = Array.from({ length: quote.length + 1 }, (_, i) => {
    const sinistra = i > 0 ? clip(contorno, asse, quote[i - 1] + SPESSORE / 2, 1) : contorno;
    return i < quote.length ? clip(sinistra, asse, quote[i] - SPESSORE / 2, -1) : sinistra;
  });
  if (parti.some(p => p.length < 3 || contornoIncrociato(p) || areaPoligono(p) <= 1)) {
    return { ok: false, motivo: "I tramezzi sono troppo vicini per chiudere tutte le zone." };
  }
  return { ok: true, parti, tagli, superficieMuri: (areaPoligono(contorno) - parti.reduce((s,p) => s + areaPoligono(p), 0)) / 10000 };
}

/** La proposta nasce da una copia dello stato scelto. I muri già disegnati rimangono riferimenti. */
export function inserisciFrazionamento(proposta: Proposta, locale: Locale, esito: Extract<EsitoFrazionamento, {ok:true}>, porzioni: Array<string | {nome: string; unita?: string}>, assistenza?: {richiesta:string;motivazione:string}): Proposta {
  const baseId = `fraz-${crypto.randomUUID()}`;
  const parti: Locale[] = esito.parti.map((contorno, i) => {
    const porzione = porzioni[i];
    const dettagli = typeof porzione === "string"
      ? { nome: porzione === "Parti comuni" ? porzione : `Unità ${porzione}`, unita: porzione }
      : porzione;
    return {
      id: `${baseId}-l${i + 1}`, ...dettagli, destinazione: locale.destinazione, contorno, altezza: locale.altezza,
      origine: origineMisura(locale, "contorno"), origineMisure: { altezza: origineMisura(locale, "altezza") },
      ...(locale.finiture ? { finiture: locale.finiture } : {}),
    };
  });
  const muri: Muro[] = esito.tagli.map(([p1,p2], i) => ({
    id: `${baseId}-m${i + 1}`, p1,p2, spessore: SPESSORE, altezza: locale.altezza, tipo: "tramezzo", stato: "nuovo",
    origine: origineMisura(locale, "contorno"), origineMisure: { altezza: origineMisura(locale, "altezza") },
  }));
  return { ...proposta, locali: [...proposta.locali.filter(l => l.id !== locale.id), ...parti],
    muri: [...proposta.muri, ...muri],
    elementi:proposta.elementi.map(e=>e.localeId===locale.id ? {...e,localeId:parti.find(p=>puntoNelPoligono(e.posizione,p.contorno))?.id ?? null} : e),
    frazionamenti: [...(proposta.frazionamenti ?? []), {
      localeId: locale.id, parti: parti.map(p => p.id), pareti: muri.map(m => m.id),
      ...(assistenza ? { richiesta:assistenza.richiesta.slice(0,1000), motivazione:assistenza.motivazione.slice(0,500) } : {}),
    }],
  };
}

export function alternativeFrazionamento(base: StatoPianta, locale: Locale, asse: AsseFrazionamento, attuali: number[]): AlternativaFrazionamento[] {
  const standard = attuali.length === 1 ? [[50],[42],[58],[34],[66]] : [[33.33,66.67],[28,65],[35,72],[30,70],[39,68]];
  const scelte = [attuali,...standard];
  const viste = new Set<string>();
  const alternative: AlternativaFrazionamento[] = [];
  for (const direzione of [asse,asse==="x" ? "y" : "x"] as const) {
    for (const percentuali of scelte) {
      const chiave = `${direzione}:${percentuali.join(",")}`;
      if (viste.has(chiave)) continue;
      viste.add(chiave);
      const esito = frazionaContorno(base,locale,direzione,percentuali);
      if (esito.ok) alternative.push({
        id:String(alternative.length+1),asse:direzione,percentuali,superfici:esito.parti.map(p=>arrotonda(areaPoligono(p)/10000)),muriMq:arrotonda(esito.superficieMuri),
      });
    }
  }
  return alternative;
}
