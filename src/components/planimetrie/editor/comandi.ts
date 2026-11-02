/**
 * Comandi dell'editor: ogni modifica alla pianta è una funzione pura
 * `(pianta, …) → pianta nuova`. Niente stato nascosto: l'annulla/ripeti tiene
 * le piante una dopo l'altra (vedi storia.ts).
 */
import { areaPoligono, puntoInterno, puntoNelPoligono, ricostruisciLocali } from "../../../../shared/planimetrie/geometria.ts";
import {
  ALTEZZA_PIANO,
  capovolgi,
  contornoInterno,
  SPESSORE_TRAMEZZO,
  muroDelLato,
  quantitaLocale,
  type Apertura,
  type AreaLavoro,
  type Destinazione,
  type ElementoLavoro,
  type Locale,
  type Muro,
  type Origine,
  type Pianta,
  type Punto,
  type QuotaLavoro,
  type StatoElemento,
  type TestoLavoro,
  type TipoApertura,
} from "./adattatore";
import type { TipoArea } from "../../../../shared/planimetrie/modello.ts";
import { diff, direzione, dist, lunghezzaMuro, proiettaSuMuro, puntoSulMuro, sulSegmento, uguali } from "./geometria";

/** «Com'è oggi» (stato di fatto) o «Progetto» (giallo = demolire, rosso = nuovo). */
export type Vista = "fatto" | "progetto";

let contatore = 0;
export function nuovoId(prefisso: string): string {
  contatore += 1;
  return `${prefisso}-${Date.now().toString(36)}${contatore.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ciò che si disegna in una vista nasce con lo stato giusto. */
export function statoNuovo(vista: Vista): StatoElemento {
  return vista === "progetto" ? "nuovo" : "esistente";
}

/** Si vede in questa vista? Nello stato di fatto le cose nuove non ci sono ancora. */
export function visibile(stato: StatoElemento, vista: Vista): boolean {
  return vista === "progetto" || stato !== "nuovo";
}

/**
 * Si può spostare o misurare in questa vista? Nel progetto le pareti esistenti
 * non si spostano: si demoliscono e se ne disegna una nuova. Nello stato di fatto
 * non si toccano le cose nuove (non si vedono).
 */
export function modificabile(stato: StatoElemento, vista: Vista): boolean {
  return vista === "fatto" ? stato !== "nuovo" : stato === "nuovo";
}

// ─── Stanze ──────────────────────────────────────────────────────────────────

export interface OpzioniStanza {
  nome?: string;
  destinazione?: Destinazione;
  stato?: StatoElemento;
  spessore?: number;
  origine?: Origine;
}

/**
 * Tratti del lato a→b non ancora coperti da una parete sulla stessa linea.
 * Serve a non raddoppiare la parete in comune tra due stanze vicine.
 */
export function trattiScoperti(pianta: Pianta, a: Punto, b: Punto): Array<[Punto, Punto]> {
  const len = dist(a, b);
  if (len < 1) return [];
  const lato = { p1: a, p2: b };
  const coperti: Array<[number, number]> = [];
  for (const m of pianta.muri) {
    const p1 = proiettaSuMuro(m.p1, lato);
    const p2 = proiettaSuMuro(m.p2, lato);
    // Deve stare sulla stessa linea (entrambi gli estremi a distanza ~0 dalla retta)
    const d1 = distanzaDallaRetta(m.p1, a, b);
    const d2 = distanzaDallaRetta(m.p2, a, b);
    if (d1 > 0.5 || d2 > 0.5) continue;
    const t1 = Math.max(0, Math.min(p1.tLibero, p2.tLibero));
    const t2 = Math.min(len, Math.max(p1.tLibero, p2.tLibero));
    if (t2 - t1 > 0.5) coperti.push([t1, t2]);
  }
  coperti.sort((x, y) => x[0] - y[0]);
  const liberi: Array<[number, number]> = [];
  let cursore = 0;
  for (const [t1, t2] of coperti) {
    if (t1 > cursore + 0.5) liberi.push([cursore, t1]);
    cursore = Math.max(cursore, t2);
  }
  if (cursore < len - 0.5) liberi.push([cursore, len]);
  return liberi.map(([t1, t2]) => [puntoSulMuro(lato, t1), puntoSulMuro(lato, t2)]);
}

function distanzaDallaRetta(p: Punto, a: Punto, b: Punto): number {
  const len = dist(a, b) || 1;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

function muroNuovo(p1: Punto, p2: Punto, o: { spessore?: number; stato?: StatoElemento; origine?: Origine } = {}): Muro {
  return {
    id: nuovoId("muro"),
    p1: { ...p1 },
    p2: { ...p2 },
    spessore: o.spessore ?? SPESSORE_TRAMEZZO,
    altezza: ALTEZZA_PIANO,
    tipo: (o.spessore ?? SPESSORE_TRAMEZZO) >= 20 ? "portante" : "tramezzo",
    stato: o.stato ?? "esistente",
    origine: o.origine ?? "rilevata",
  };
}

/** Nome libero per la nuova stanza: «Stanza 1», «Stanza 2»… */
function nomeLibero(pianta: Pianta): string {
  let n = pianta.locali.length + 1;
  while (pianta.locali.some((l) => l.nome === `Stanza ${n}`)) n++;
  return `Stanza ${n}`;
}

/** Stanza da un contorno sull'asse dei muri: crea il locale e le pareti che mancano. */
export function aggiungiStanza(pianta: Pianta, contorno: Punto[], o: OpzioniStanza = {}): { pianta: Pianta; id: string } {
  const stato = o.stato ?? "esistente";
  const muri = [...pianta.muri];
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    for (const [p1, p2] of trattiScoperti({ ...pianta, muri }, a, b)) {
      if (dist(p1, p2) >= 1) muri.push(muroNuovo(p1, p2, { spessore: o.spessore, stato, origine: o.origine }));
    }
  }
  const locale: Locale = {
    id: nuovoId("locale"),
    nome: o.nome ?? nomeLibero(pianta),
    destinazione: o.destinazione ?? "altro",
    contorno: contorno.map((p) => ({ ...p })),
    altezza: ALTEZZA_PIANO,
    stato,
    origine: o.origine ?? "rilevata",
  };
  return { pianta: { ...pianta, muri, locali: [...pianta.locali, locale] }, id: locale.id };
}

export function rettangolo(a: Punto, b: Punto): Punto[] {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

/**
 * Stanza scritta a misure («3,50 × 4,00»): le misure sono quelle interne, come le
 * prende chi misura col metro. Viene messa accanto a quel che c'è già.
 */
export function aggiungiStanzaDaMisure(
  pianta: Pianta,
  larghezza: number,
  lunghezza: number,
  o: OpzioniStanza & { origineIn?: Punto } = {},
) {
  const spessore = o.spessore ?? SPESSORE_TRAMEZZO;
  let origine = o.origineIn;
  if (!origine) {
    const xs = [...pianta.muri.flatMap((m) => [m.p1.x, m.p2.x]), ...pianta.locali.flatMap((l) => l.contorno.map((p) => p.x))];
    const ys = [...pianta.muri.flatMap((m) => [m.p1.y, m.p2.y]), ...pianta.locali.flatMap((l) => l.contorno.map((p) => p.y))];
    origine = xs.length ? { x: Math.max(...xs), y: Math.min(...ys) } : { x: 0, y: 0 };
  }
  const contorno = rettangolo(origine, { x: origine.x + larghezza + spessore, y: origine.y + lunghezza + spessore });
  return aggiungiStanza(pianta, contorno, { ...o, spessore });
}

export function modificaLocale(pianta: Pianta, id: string, campi: Partial<Pick<Locale, "nome" | "destinazione" | "altezza" | "origine" | "unita">>): Pianta {
  return { ...pianta, locali: pianta.locali.map((l) => (l.id === id ? { ...l, ...campi } : l)) };
}

/**
 * Elimina la stanza e le sue pareti che non servono a un'altra stanza.
 * Nel progetto una stanza esistente non sparisce: le sue pareti vanno «da demolire».
 */
export function eliminaLocale(pianta: Pianta, id: string, vista: Vista = "fatto"): Pianta {
  const locale = pianta.locali.find((l) => l.id === id);
  if (!locale) return pianta;
  const altri = pianta.locali.filter((l) => l.id !== id);
  const soloSuo = (m: Muro) =>
    latoDi(locale, m) && !altri.some((l) => latoDi(l, m));
  if (vista === "progetto" && locale.stato !== "nuovo") {
    let p = pianta;
    for (const m of pianta.muri.filter(soloSuo)) p = eliminaMuro(p, m.id, vista);
    return p;
  }
  const via = new Set(pianta.muri.filter(soloSuo).map((m) => m.id));
  return {
    ...pianta,
    locali: altri,
    muri: pianta.muri.filter((m) => !via.has(m.id)),
    aperture: pianta.aperture.filter((a) => !via.has(a.muroId)),
  };
}

function latoDi(locale: Locale, m: Muro): boolean {
  const c = locale.contorno;
  return c.some((a, i) => {
    const b = c[(i + 1) % c.length];
    return sulSegmento(m.p1, a, b) && sulSegmento(m.p2, a, b);
  });
}

// ─── Pareti ──────────────────────────────────────────────────────────────────

export function aggiungiParete(
  pianta: Pianta,
  p1: Punto,
  p2: Punto,
  o: { spessore?: number; stato?: StatoElemento; origine?: Origine } = {},
): { pianta: Pianta; id: string | null } {
  if (dist(p1, p2) < 5) return { pianta, id: null };
  const muro = muroNuovo(p1, p2, o);
  return { pianta: { ...pianta, muri: [...pianta.muri, muro] }, id: muro.id };
}

export function modificaMuro(pianta: Pianta, id: string, campi: Partial<Pick<Muro, "spessore" | "altezza" | "tipo" | "stato" | "origine">>): Pianta {
  return { ...pianta, muri: pianta.muri.map((m) => (m.id === id ? { ...m, ...campi } : m)) };
}

/**
 * Nel progetto una parete esistente non si cancella: diventa «da demolire» (gialla),
 * e un secondo clic la rimette com'era. Le pareti nuove, e tutto nello stato di
 * fatto, si cancellano davvero con le loro porte e finestre.
 */
export function eliminaMuro(pianta: Pianta, id: string, vista: Vista = "fatto"): Pianta {
  const muro = pianta.muri.find((m) => m.id === id);
  if (!muro) return pianta;
  if (vista === "progetto" && muro.stato !== "nuovo") {
    const stato: StatoElemento = muro.stato === "da_demolire" ? "esistente" : "da_demolire";
    return {
      ...pianta,
      muri: pianta.muri.map((m) => (m.id === id ? { ...m, stato } : m)),
      aperture: pianta.aperture.map((a) => (a.muroId === id && a.stato !== "nuovo" ? { ...a, stato } : a)),
    };
  }
  return { ...pianta, muri: pianta.muri.filter((m) => m.id !== id), aperture: pianta.aperture.filter((a) => a.muroId !== id) };
}

/** Sposta un gruppo di punti (estremi delle pareti e angoli delle stanze). */
function spostaPunti(pianta: Pianta, daSpostare: (p: Punto) => boolean, delta: Punto): Pianta {
  const muovi = (p: Punto) => (daSpostare(p) ? { x: p.x + delta.x, y: p.y + delta.y } : p);
  const nuova: Pianta = {
    ...pianta,
    muri: pianta.muri.map((m) => {
      const p1 = muovi(m.p1);
      const p2 = muovi(m.p2);
      return p1 === m.p1 && p2 === m.p2 ? m : { ...m, p1, p2 };
    }),
    locali: pianta.locali.map((l) => {
      const contorno = l.contorno.map(muovi);
      return contorno.every((p, i) => p === l.contorno[i]) ? l : { ...l, contorno };
    }),
  };
  return riposizionaAperture(pianta, nuova);
}

/**
 * Sposta una parete intera. Si portano dietro gli angoli attaccati ai suoi estremi
 * e quelli appoggiati lungo la parete (le pareti a T, gli angoli delle stanze):
 * le pareti collegate si allungano o si accorciano, le stanze seguono.
 */
export function spostaParete(pianta: Pianta, id: string, delta: Punto): Pianta {
  const muro = pianta.muri.find((m) => m.id === id);
  if (!muro || (delta.x === 0 && delta.y === 0)) return pianta;
  const fila = pareteInFila(pianta, muro);
  return spostaPunti(pianta, (p) => fila.some((m) => sulSegmento(p, m.p1, m.p2)), delta);
}

/**
 * La parete e quelle che la continuano dritte, attaccate punta a punta: una facciata
 * fatta di più pezzi si sposta tutta insieme, invece di storcersi dove finisce un pezzo.
 */
function pareteInFila(pianta: Pianta, muro: Muro): Muro[] {
  const fila = [muro];
  const allineato = (m: Muro) =>
    distanzaDallaRetta(m.p1, muro.p1, muro.p2) < 0.5 && distanzaDallaRetta(m.p2, muro.p1, muro.p2) < 0.5;
  for (let i = 0; i < fila.length; i++) {
    const corrente = fila[i];
    for (const m of pianta.muri) {
      if (fila.includes(m) || !allineato(m)) continue;
      const tocca = [m.p1, m.p2].some((p) => uguali(p, corrente.p1) || uguali(p, corrente.p2));
      if (tocca) fila.push(m);
    }
  }
  return fila;
}

/** Trascina un angolo (l'estremo di una o più pareti) in un punto nuovo. */
export function spostaAngolo(pianta: Pianta, da: Punto, a: Punto): Pianta {
  if (uguali(da, a, 0.01)) return pianta;
  return spostaPunti(pianta, (p) => uguali(p, da), diff(a, da));
}

/**
 * Allunga di `delta` cm il tratto a→b dalla parte di b. Se in b c'è una parete di
 * traverso (l'angolo di una stanza), si sposta tutta quella parete: la stanza resta
 * dritta e si allunga. Altrimenti si sposta solo l'angolo b.
 */
function allungaVerso(pianta: Pianta, a: Punto, b: Punto, delta: number): Pianta {
  const u = direzione({ p1: a, p2: b });
  const spostamento = { x: u.x * delta, y: u.y * delta };
  const traverso = pianta.muri.find((m) => {
    if (!uguali(m.p1, b) && !uguali(m.p2, b)) return false;
    const v = direzione(m);
    return Math.abs(u.x * v.x + u.y * v.y) < 0.2; // circa perpendicolare
  });
  if (traverso) return spostaParete(pianta, traverso.id, spostamento);
  return spostaAngolo(pianta, b, { x: b.x + spostamento.x, y: b.y + spostamento.y });
}

/** «Questa parete è lunga 4,20»: si allunga dalla parte della fine. */
export function impostaLunghezzaParete(pianta: Pianta, id: string, lunghezza: number): Pianta {
  const muro = pianta.muri.find((m) => m.id === id);
  if (!muro || lunghezza < 5) return pianta;
  const delta = lunghezza - lunghezzaMuro(muro);
  if (Math.abs(delta) < 0.05) return confermaMuro(pianta, id);
  return confermaMuro(allungaVerso(pianta, muro.p1, muro.p2, delta), id);
}

/**
 * «Questo lato della stanza misura 4,20» (misura interna, da muro a muro): si sposta
 * la parete in fondo al lato. Sulla stanza rettangolare cambia anche il lato opposto.
 */
export function impostaLatoStanza(pianta: Pianta, localeId: string, lato: number, lunghezzaInterna: number): Pianta {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale || lunghezzaInterna < 5) return pianta;
  const attuale = quantitaLocale(pianta, locale).lati[lato];
  const delta = lunghezzaInterna - attuale;
  const c = locale.contorno;
  const a = c[lato];
  const b = c[(lato + 1) % c.length];
  // Si sposta la parete in fondo al lato che non confina con altre stanze: allargando la
  // camera si spinge fuori la sua parete, non quella in comune col soggiorno.
  // A parità, quella in fondo al lato (b).
  const confinanti = (angolo: Punto, verso: Punto) => {
    const u = direzione({ p1: verso, p2: angolo });
    const traverso = pianta.muri.find((m) => {
      if (!uguali(m.p1, angolo) && !uguali(m.p2, angolo) && !sulSegmento(angolo, m.p1, m.p2)) return false;
      const v = direzione(m);
      return Math.abs(u.x * v.x + u.y * v.y) < 0.2;
    });
    if (!traverso) return 0;
    return pianta.locali.filter(
      (l) => l.id !== localeId && l.contorno.some((p, i) => {
        const q = l.contorno[(i + 1) % l.contorno.length];
        return sulSegmento(p, traverso.p1, traverso.p2) && sulSegmento(q, traverso.p1, traverso.p2);
      }),
    ).length;
  };
  const versoA = confinanti(a, b) < confinanti(b, a);
  let nuova = Math.abs(delta) < 0.05 ? pianta : versoA ? allungaVerso(pianta, b, a, delta) : allungaVerso(pianta, a, b, delta);
  const muro = muroDelLato(pianta, locale, lato);
  if (muro) nuova = confermaMuro(nuova, muro.id);
  return nuova;
}

function confermaMuro(pianta: Pianta, id: string): Pianta {
  return modificaMuro(pianta, id, { origine: "rilevata" });
}

// ─── Porte e finestre ────────────────────────────────────────────────────────

export const MISURE_APERTURA: Record<TipoApertura, { larghezza: number; altezza: number; davanzale: number }> = {
  porta: { larghezza: 80, altezza: 210, davanzale: 0 },
  finestra: { larghezza: 120, altezza: 140, davanzale: 90 },
  portafinestra: { larghezza: 120, altezza: 240, davanzale: 0 },
  varco: { larghezza: 90, altezza: 210, davanzale: 0 },
};

/** Tiene l'apertura dentro la parete. */
export function limitaPosizione(muro: Muro, larghezza: number, t: number): number {
  const l = lunghezzaMuro(muro);
  if (larghezza >= l) return l / 2;
  return Math.max(larghezza / 2, Math.min(l - larghezza / 2, t));
}

export function aggiungiApertura(
  pianta: Pianta,
  muroId: string,
  tipo: TipoApertura,
  t: number,
  o: { stato?: StatoElemento; origine?: Origine } = {},
): { pianta: Pianta; id: string | null } {
  const muro = pianta.muri.find((m) => m.id === muroId);
  if (!muro) return { pianta, id: null };
  const misure = MISURE_APERTURA[tipo];
  const larghezza = Math.min(misure.larghezza, Math.max(40, lunghezzaMuro(muro) - 10));
  const apertura: Apertura = {
    id: nuovoId(tipo),
    muroId,
    tipo,
    posizione: limitaPosizione(muro, larghezza, Math.round(t)),
    larghezza,
    altezza: misure.altezza,
    davanzale: misure.davanzale,
    manovra: tipo === "varco" ? "nessuna" : "battente",
    verso: { cerniera: "inizio", lato: "sinistra" },
    stato: o.stato ?? "esistente",
    origine: o.origine ?? "rilevata",
  };
  return { pianta: { ...pianta, aperture: [...pianta.aperture, apertura] }, id: apertura.id };
}

export function spostaApertura(pianta: Pianta, id: string, muroId: string, t: number): Pianta {
  const muro = pianta.muri.find((m) => m.id === muroId);
  if (!muro) return pianta;
  return {
    ...pianta,
    aperture: pianta.aperture.map((a) =>
      a.id === id ? { ...a, muroId, posizione: limitaPosizione(muro, a.larghezza, Math.round(t)) } : a,
    ),
  };
}

export function modificaApertura(
  pianta: Pianta,
  id: string,
  campi: Partial<Pick<Apertura, "tipo" | "larghezza" | "altezza" | "davanzale" | "stato" | "origine">>,
): Pianta {
  return {
    ...pianta,
    aperture: pianta.aperture.map((a) => {
      if (a.id !== id) return a;
      const nuova = { ...a, ...campi };
      const muro = pianta.muri.find((m) => m.id === a.muroId);
      return muro ? { ...nuova, posizione: limitaPosizione(muro, nuova.larghezza, nuova.posizione) } : nuova;
    }),
  };
}

/** Un clic gira il verso di apertura: le quattro combinazioni, una dopo l'altra. */
export function giraApertura(pianta: Pianta, id: string): Pianta {
  const ordine: Apertura["verso"][] = [
    { cerniera: "inizio", lato: "sinistra" },
    { cerniera: "fine", lato: "sinistra" },
    { cerniera: "fine", lato: "destra" },
    { cerniera: "inizio", lato: "destra" },
  ];
  return {
    ...pianta,
    aperture: pianta.aperture.map((a) => {
      if (a.id !== id) return a;
      const i = ordine.findIndex((v) => v.cerniera === a.verso.cerniera && v.lato === a.verso.lato);
      return { ...a, verso: ordine[(i + 1) % ordine.length] };
    }),
  };
}

export function eliminaApertura(pianta: Pianta, id: string, vista: Vista = "fatto"): Pianta {
  const a = pianta.aperture.find((x) => x.id === id);
  if (!a) return pianta;
  if (vista === "progetto" && a.stato !== "nuovo") {
    const stato: StatoElemento = a.stato === "da_demolire" ? "esistente" : "da_demolire";
    return { ...pianta, aperture: pianta.aperture.map((x) => (x.id === id ? { ...x, stato } : x)) };
  }
  return { ...pianta, aperture: pianta.aperture.filter((x) => x.id !== id) };
}

/**
 * Dopo che le pareti si sono mosse, ogni porta e finestra resta dov'era nel disegno
 * (proiettata sulla parete nuova) e comunque dentro la parete.
 */
export function riposizionaAperture(prima: Pianta, dopo: Pianta): Pianta {
  let cambiato = false;
  const aperture = dopo.aperture.map((a) => {
    const vecchio = prima.muri.find((m) => m.id === a.muroId);
    const nuovo = dopo.muri.find((m) => m.id === a.muroId);
    if (!vecchio || !nuovo || vecchio === nuovo) return a;
    const centro = puntoSulMuro(vecchio, a.posizione);
    const t = limitaPosizione(nuovo, a.larghezza, proiettaSuMuro(centro, nuovo).tLibero);
    if (Math.abs(t - a.posizione) < 0.01) return a;
    cambiato = true;
    return { ...a, posizione: t };
  });
  return cambiato ? { ...dopo, aperture } : dopo;
}

// ─── Misure stimate ──────────────────────────────────────────────────────────

/** Conferma una misura stimata: da qui in poi è «rilevata». */
export function confermaMisura(pianta: Pianta, tipo: "muro" | "apertura" | "locale", id: string): Pianta {
  if (tipo === "muro") return modificaMuro(pianta, id, { origine: "rilevata" });
  if (tipo === "apertura") return modificaApertura(pianta, id, { origine: "rilevata" });
  return modificaLocale(pianta, id, { origine: "rilevata" });
}

export function contaStimate(pianta: Pianta): number {
  return (
    pianta.muri.filter((m) => m.origine === "stimata").length +
    pianta.aperture.filter((a) => a.origine === "stimata").length +
    pianta.locali.filter((l) => l.origine === "stimata").length
  );
}

/**
 * Correzione guidata: la prossima misura stimata da controllare, dalla più importante. Prima le
 * stanze (confermarne una conferma anche le sue pareti), dalla più grande; poi le pareti rimaste,
 * dalla più lunga; infine porte e finestre. Null quando non ne resta nessuna.
 */
export function prossimaStimata(pianta: Pianta): { tipo: "locale" | "muro" | "apertura"; id: string } | null {
  const area = (c: ReadonlyArray<{ x: number; y: number }>) => Math.abs(c.reduce((t, a, i) => { const b = c[(i + 1) % c.length]; return t + a.x * b.y - b.x * a.y; }, 0)) / 2;
  const locale = pianta.locali.filter((l) => l.origine === "stimata").sort((a, b) => area(b.contorno) - area(a.contorno))[0];
  if (locale) return { tipo: "locale", id: locale.id };
  const lung = (m: Pianta["muri"][number]) => Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
  const muro = pianta.muri.filter((m) => m.origine === "stimata").sort((a, b) => lung(b) - lung(a))[0];
  if (muro) return { tipo: "muro", id: muro.id };
  const ap = pianta.aperture.find((a) => a.origine === "stimata");
  return ap ? { tipo: "apertura", id: ap.id } : null;
}

export function confermaTutte(pianta: Pianta): Pianta {
  const r = <T extends { origine: Origine }>(x: T): T => (x.origine === "stimata" ? { ...x, origine: "rilevata" } : x);
  return { ...pianta, muri: pianta.muri.map(r), aperture: pianta.aperture.map(r), locali: pianta.locali.map(r) };
}

// ─── Stanze che si chiudono da sole, nomi del progetto ───────────────────────

/**
 * Dopo aver disegnato pareti: ogni giro chiuso che non contiene ancora una stanza
 * diventa una stanza nuova (nel progetto, una stanza «nuova»).
 */
export function chiudiStanze(pianta: Pianta, vista: Vista = "fatto"): Pianta {
  const muri = pianta.muri.filter((m) => (vista === "progetto" ? m.stato !== "da_demolire" : m.stato !== "nuovo"));
  if (muri.length < 3) return pianta;
  const facce = ricostruisciLocali(muri.map((m) => ({ ...m, p1: capovolgi(m.p1), p2: capovolgi(m.p2), stato: "esistente" as const })));
  const stanze = pianta.locali
    .filter((l) => visibile(l.stato, vista))
    .map((l) => ({ locale: l, contorno: contornoInterno(pianta, l).map(capovolgi) }));
  const contiene = (contenitore: Punto[], c: Punto[]) => {
    const p = puntoInterno(c);
    return !!p && puntoNelPoligono(p, contenitore);
  };
  let nuova = pianta;
  for (const f of facce) {
    const dentro = stanze.filter((s) => contiene(f.contorno, s.contorno));
    if (!dentro.length) {
      nuova = aggiungiStanza(nuova, f.contornoAsse.map(capovolgi), { stato: statoNuovo(vista) }).pianta;
      continue;
    }
    // Una parete ha tagliato la stanza: dove si può modificare, si restringe al suo pezzo
    // (nel progetto la stanza di oggi resta com'è: il pezzo dopo i lavori lo fa il documento).
    for (const s of dentro) {
      if (!modificabile(s.locale.stato, vista) || areaPoligono(s.contorno) <= areaPoligono(f.contorno) + 1) continue;
      nuova = { ...nuova, locali: nuova.locali.map((l) => (l.id === s.locale.id ? { ...l, contorno: f.contornoAsse.map(capovolgi) } : l)) };
    }
  }
  return nuova;
}

/**
 * Nome e destinazione di una stanza. Nel progetto, le stanze di oggi (o quelle nate
 * dalle pareti) cambiano nome solo nel progetto: oggi restano come sono.
 */
export function rinominaStanza(
  pianta: Pianta,
  id: string,
  attuale: { nome: string; destinazione: Destinazione },
  campi: Partial<{ nome: string; destinazione: Destinazione }>,
  vista: Vista,
): Pianta {
  const diLavoro = pianta.locali.find((l) => l.id === id);
  if (diLavoro && (vista === "fatto" || diLavoro.stato === "nuovo")) return modificaLocale(pianta, id, campi);
  return { ...pianta, nomiProgetto: { ...pianta.nomiProgetto, [id]: { ...attuale, ...campi } } };
}

// ─── Arredi, sanitari, quote e testi (fase 3 del piano di completamento) ──────

/** Come per le pareti: nel progetto un arredo di oggi non si sposta, si toglie (e se ne mette uno nuovo). */
export function aggiungiElemento(
  pianta: Pianta,
  voce: { tipo: string; larghezza: number; profondita: number; altezza?: number; etichetta?: string },
  centro: Punto,
  o: { stato?: StatoElemento; rotazione?: number } = {},
): { pianta: Pianta; id: string } {
  const id = nuovoId("arredo");
  const elemento: ElementoLavoro = {
    id,
    tipo: voce.tipo,
    ...(voce.etichetta ? { etichetta: voce.etichetta } : {}),
    centro: { x: Math.round(centro.x), y: Math.round(centro.y) },
    rotazione: o.rotazione ?? 0,
    larghezza: voce.larghezza,
    profondita: voce.profondita,
    ...(voce.altezza ? { altezza: voce.altezza } : {}),
    stato: o.stato ?? "esistente",
    origine: "rilevata",
  };
  return { pianta: { ...pianta, elementi: [...(pianta.elementi ?? []), elemento] }, id };
}

export function modificaElemento(
  pianta: Pianta,
  id: string,
  campi: Partial<Pick<ElementoLavoro, "centro" | "rotazione" | "larghezza" | "profondita" | "altezza" | "etichetta" | "tipo">>,
): Pianta {
  const norm = { ...campi };
  if (norm.rotazione != null) norm.rotazione = ((Math.round(norm.rotazione) % 360) + 360) % 360;
  return { ...pianta, elementi: (pianta.elementi ?? []).map((e) => (e.id === id ? { ...e, ...norm, origine: "rilevata" } : e)) };
}

export function ruotaElemento(pianta: Pianta, id: string, gradi: number): Pianta {
  const e = (pianta.elementi ?? []).find((x) => x.id === id);
  return e ? modificaElemento(pianta, id, { rotazione: e.rotazione + gradi }) : pianta;
}

/** Copia accanto all'originale (40 cm più in là), con lo stato della vista. */
export function duplicaElemento(pianta: Pianta, id: string, vista: Vista): { pianta: Pianta; id: string | null } {
  const e = (pianta.elementi ?? []).find((x) => x.id === id);
  if (!e) return { pianta, id: null };
  return aggiungiElemento(pianta, e, { x: e.centro.x + 40, y: e.centro.y + 40 }, { stato: statoNuovo(vista), rotazione: e.rotazione });
}

/** Nel progetto un arredo di oggi si «toglie» (resta in giallo) e un secondo clic lo rimette. */
export function eliminaElemento(pianta: Pianta, id: string, vista: Vista = "fatto"): Pianta {
  const e = (pianta.elementi ?? []).find((x) => x.id === id);
  if (!e) return pianta;
  if (vista === "progetto" && e.stato !== "nuovo") {
    const stato: StatoElemento = e.stato === "da_demolire" ? "esistente" : "da_demolire";
    return { ...pianta, elementi: (pianta.elementi ?? []).map((x) => (x.id === id ? { ...x, stato } : x)) };
  }
  return { ...pianta, elementi: (pianta.elementi ?? []).filter((x) => x.id !== id) };
}

// ─── Lotto e aree esterne ────────────────────────────────────────────────────

export function aggiungiArea(pianta: Pianta, tipo: TipoArea, contorno: Punto[], vista: Vista = "fatto"): { pianta: Pianta; id: string } {
  const id = nuovoId("area");
  const area: AreaLavoro = { id, tipo, contorno: contorno.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), stato: statoNuovo(vista) };
  // il lotto sta sotto tutto: va in testa, le altre aree sopra
  const aree = tipo === "lotto" ? [area, ...(pianta.aree ?? [])] : [...(pianta.aree ?? []), area];
  return { pianta: { ...pianta, aree }, id };
}

export function modificaArea(pianta: Pianta, id: string, campi: Partial<Pick<AreaLavoro, "tipo" | "nome" | "recinzione" | "contorno" | "quota">>): Pianta {
  return { ...pianta, aree: (pianta.aree ?? []).map((a) => (a.id === id ? { ...a, ...campi } : a)) };
}

/** Come per gli arredi: nel progetto un'area di oggi si segna da togliere (e un altro clic la rimette). */
export function eliminaArea(pianta: Pianta, id: string, vista: Vista = "fatto"): Pianta {
  const a = (pianta.aree ?? []).find((x) => x.id === id);
  if (!a) return pianta;
  if (vista === "progetto" && a.stato !== "nuovo") {
    const stato: StatoElemento = a.stato === "da_demolire" ? "esistente" : "da_demolire";
    return { ...pianta, aree: (pianta.aree ?? []).map((x) => (x.id === id ? { ...x, stato } : x)) };
  }
  return { ...pianta, aree: (pianta.aree ?? []).filter((x) => x.id !== id) };
}

export function aggiungiQuota(pianta: Pianta, p1: Punto, p2: Punto, scostamento = 40): { pianta: Pianta; id: string } {
  const id = nuovoId("quota");
  const arr = (p: Punto) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  return { pianta: { ...pianta, quote: [...(pianta.quote ?? []), { id, p1: arr(p1), p2: arr(p2), scostamento }] }, id };
}

export function modificaQuota(pianta: Pianta, id: string, campi: Partial<Pick<QuotaLavoro, "p1" | "p2" | "scostamento">>): Pianta {
  return { ...pianta, quote: (pianta.quote ?? []).map((q) => (q.id === id ? { ...q, ...campi } : q)) };
}

export function eliminaQuota(pianta: Pianta, id: string): Pianta {
  return { ...pianta, quote: (pianta.quote ?? []).filter((q) => q.id !== id) };
}

export function aggiungiTesto(pianta: Pianta, posizione: Punto, testo = "Testo"): { pianta: Pianta; id: string } {
  const id = nuovoId("testo");
  return { pianta: { ...pianta, testi: [...(pianta.testi ?? []), { id, posizione: { x: Math.round(posizione.x), y: Math.round(posizione.y) }, testo, rotazione: 0 }] }, id };
}

export function modificaTesto(pianta: Pianta, id: string, campi: Partial<Pick<TestoLavoro, "posizione" | "testo" | "rotazione">>): Pianta {
  return { ...pianta, testi: (pianta.testi ?? []).map((t) => (t.id === id ? { ...t, ...campi } : t)) };
}

export function eliminaTesto(pianta: Pianta, id: string): Pianta {
  return { ...pianta, testi: (pianta.testi ?? []).filter((t) => t.id !== id) };
}

// ─── più oggetti insieme (fase 4): arredi, quote e testi ───────────────────
// Pareti e stanze restano una per volta: spostarle in gruppo romperebbe stanze e aperture.

export interface Gruppo {
  elementi: string[];
  quote: string[];
  testi: string[];
}

export const gruppoVuoto = (): Gruppo => ({ elementi: [], quote: [], testi: [] });
export const quantiNelGruppo = (g: Gruppo) => g.elementi.length + g.quote.length + g.testi.length;

/** Gli oggetti del gruppo che si possono toccare in questa vista (gli arredi di oggi nel progetto no). */
export function gruppoModificabile(pianta: Pianta, g: Gruppo, vista: Vista): Gruppo {
  const el = new Set(g.elementi);
  return {
    elementi: (pianta.elementi ?? []).filter((e) => el.has(e.id) && modificabile(e.stato, vista)).map((e) => e.id),
    quote: (pianta.quote ?? []).filter((q) => g.quote.includes(q.id)).map((q) => q.id),
    testi: (pianta.testi ?? []).filter((t) => g.testi.includes(t.id)).map((t) => t.id),
  };
}

/** Ciò che sta tutto dentro il riquadro: il centro di un arredo, i due capi di una quota, un testo. */
export function gruppoNelRiquadro(pianta: Pianta, a: Punto, b: Punto, vista: Vista): Gruppo {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const dentro = (p: Punto) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  return {
    elementi: (pianta.elementi ?? []).filter((e) => visibile(e.stato, vista) && dentro(e.centro)).map((e) => e.id),
    quote: (pianta.quote ?? []).filter((q) => dentro(q.p1) && dentro(q.p2)).map((q) => q.id),
    testi: (pianta.testi ?? []).filter((t) => dentro(t.posizione)).map((t) => t.id),
  };
}

/** Il centro del riquadro che contiene il gruppo: perno per ruotare e specchiare. */
export function centroGruppo(pianta: Pianta, g: Gruppo): Punto | null {
  const punti: Punto[] = [
    ...(pianta.elementi ?? []).filter((e) => g.elementi.includes(e.id)).map((e) => e.centro),
    ...(pianta.quote ?? []).filter((q) => g.quote.includes(q.id)).flatMap((q) => [q.p1, q.p2]),
    ...(pianta.testi ?? []).filter((t) => g.testi.includes(t.id)).map((t) => t.posizione),
  ];
  if (!punti.length) return null;
  const xs = punti.map((p) => p.x), ys = punti.map((p) => p.y);
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
}

function trasformaGruppo(
  pianta: Pianta,
  g: Gruppo,
  punto: (p: Punto) => Punto,
  angolo: (r: number) => number,
  scambiaQuota = false,
): Pianta {
  // «+ 0» toglie i -0 che la rotazione lascia
  const arr = (p: Punto) => { const q = punto(p); return { x: Math.round(q.x) + 0, y: Math.round(q.y) + 0 }; };
  const norm = (r: number) => (((Math.round(r) % 360) + 360) % 360) + 0;
  return {
    ...pianta,
    elementi: (pianta.elementi ?? []).map((e) => (g.elementi.includes(e.id) ? { ...e, centro: arr(e.centro), rotazione: norm(angolo(e.rotazione)) } : e)),
    quote: (pianta.quote ?? []).map((q) => {
      if (!g.quote.includes(q.id)) return q;
      const p1 = arr(q.p1), p2 = arr(q.p2);
      return scambiaQuota ? { ...q, p1: p2, p2: p1 } : { ...q, p1, p2 };
    }),
    testi: (pianta.testi ?? []).map((t) => (g.testi.includes(t.id) ? { ...t, posizione: arr(t.posizione), rotazione: norm(angolo(t.rotazione)) } : t)),
  };
}

export function spostaGruppo(pianta: Pianta, g: Gruppo, delta: Punto): Pianta {
  return trasformaGruppo(pianta, g, (p) => ({ x: p.x + delta.x, y: p.y + delta.y }), (r) => r);
}

/** Ruota di 90° in senso orario sullo schermo attorno al centro del gruppo. */
export function ruotaGruppo(pianta: Pianta, g: Gruppo, gradi = 90): Pianta {
  const c = centroGruppo(pianta, g);
  if (!c) return pianta;
  const a = (gradi * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return trasformaGruppo(pianta, g, (p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }), (r) => r + gradi);
}

/**
 * Specchia sinistra↔destra attorno al centro del gruppo. Le quote si scambiano i capi così la
 * linea di quota resta dal lato giusto; i testi restano leggibili (cambia solo la posizione e l'inclinazione).
 */
export function specchiaGruppo(pianta: Pianta, g: Gruppo): Pianta {
  const c = centroGruppo(pianta, g);
  if (!c) return pianta;
  return trasformaGruppo(pianta, g, (p) => ({ x: 2 * c.x - p.x, y: p.y }), (r) => -r, true);
}

/** Copia il gruppo spostato di poco; ritorna il gruppo delle copie (che resta selezionato). */
export function duplicaGruppo(pianta: Pianta, g: Gruppo, vista: Vista, delta: Punto = { x: 40, y: 40 }): { pianta: Pianta; gruppo: Gruppo } {
  const nuovo = gruppoVuoto();
  let p = pianta;
  for (const e of (pianta.elementi ?? []).filter((x) => g.elementi.includes(x.id))) {
    const r = aggiungiElemento(p, e, { x: e.centro.x + delta.x, y: e.centro.y + delta.y }, { stato: statoNuovo(vista), rotazione: e.rotazione });
    p = r.pianta;
    nuovo.elementi.push(r.id);
  }
  for (const q of (pianta.quote ?? []).filter((x) => g.quote.includes(x.id))) {
    const r = aggiungiQuota(p, { x: q.p1.x + delta.x, y: q.p1.y + delta.y }, { x: q.p2.x + delta.x, y: q.p2.y + delta.y }, q.scostamento);
    p = r.pianta;
    nuovo.quote.push(r.id);
  }
  for (const t of (pianta.testi ?? []).filter((x) => g.testi.includes(x.id))) {
    const r = aggiungiTesto(p, { x: t.posizione.x + delta.x, y: t.posizione.y + delta.y }, t.testo);
    p = modificaTesto(r.pianta, r.id, { rotazione: t.rotazione });
    nuovo.testi.push(r.id);
  }
  return { pianta: p, gruppo: nuovo };
}

export function eliminaGruppo(pianta: Pianta, g: Gruppo, vista: Vista): Pianta {
  let p = pianta;
  for (const id of g.elementi) p = eliminaElemento(p, id, vista);
  return {
    ...p,
    quote: (p.quote ?? []).filter((q) => !g.quote.includes(q.id)),
    testi: (p.testi ?? []).filter((t) => !g.testi.includes(t.id)),
  };
}

// ─── Pareti curve ────────────────────────────────────────────────────────────

/**
 * Punti di un arco da a a b con la freccia data (cm, distanza del centro dell'arco dalla
 * corda; positiva a sinistra di a→b sullo schermo). Esclusi a e b.
 */
export function puntiArco(a: Punto, b: Punto, freccia: number, segmenti: number): Punto[] {
  const c = dist(a, b);
  if (c < 1 || Math.abs(freccia) < 1 || segmenti < 2) return [];
  const f = Math.min(Math.abs(freccia), c / 2) * Math.sign(freccia);
  const r = (c * c) / (8 * Math.abs(f)) + Math.abs(f) / 2;
  const u = { x: (b.x - a.x) / c, y: (b.y - a.y) / c };
  const sinistra = { x: u.y, y: -u.x }; // y in giù: a sinistra di a→b
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // il centro sta dalla parte opposta alla freccia
  const centro = { x: m.x - sinistra.x * Math.sign(f) * (r - Math.abs(f)), y: m.y - sinistra.y * Math.sign(f) * (r - Math.abs(f)) };
  const angA = Math.atan2(a.y - centro.y, a.x - centro.x);
  let angB = Math.atan2(b.y - centro.y, b.x - centro.x);
  // il verso che passa per la cima della freccia
  const cima = { x: m.x + sinistra.x * f, y: m.y + sinistra.y * f };
  const angC = Math.atan2(cima.y - centro.y, cima.x - centro.x);
  const tra = (x: number, d: number, e: number) => { const n = (v: number) => ((v - d) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return n(x) <= n(e); };
  if (!tra(angC, angA, angB)) angB = angB > angA ? angB - 2 * Math.PI : angB + 2 * Math.PI;
  else if (angB < angA) angB += 2 * Math.PI;
  const out: Punto[] = [];
  for (let i = 1; i < segmenti; i++) {
    const t = angA + ((angB - angA) * i) / segmenti;
    out.push({ x: Math.round((centro.x + r * Math.cos(t)) * 10) / 10, y: Math.round((centro.y + r * Math.sin(t)) * 10) / 10 });
  }
  return out;
}

/**
 * Curva una parete (bovindo, muro tondo del balcone): diventa un arco di tratti dritti con la
 * stessa grossezza, e il contorno delle stanze che ci stanno contro segue la curva (superfici,
 * perimetri e 3D tornano). Le pareti con porte o finestre non si curvano: prima si tolgono.
 */
export function curvaParete(pianta: Pianta, id: string, freccia: number, segmenti = 8): { pianta: Pianta; ok: boolean; motivo?: string } {
  const m = pianta.muri.find((x) => x.id === id);
  if (!m) return { pianta, ok: false, motivo: "Parete non trovata." };
  if (pianta.aperture.some((a) => a.muroId === id)) return { pianta, ok: false, motivo: "Togli prima porte e finestre da questa parete: su una parete curva non si posano." };
  // un angolo di stanza a metà parete: la parete fa da lato a più stanze, la curva le romperebbe
  const lm = dist(m.p1, m.p2);
  const aMeta = pianta.locali.some((l) => l.contorno.some((q) => {
    const t = ((q.x - m.p1.x) * (m.p2.x - m.p1.x) + (q.y - m.p1.y) * (m.p2.y - m.p1.y)) / (lm * lm);
    const piede = { x: m.p1.x + t * (m.p2.x - m.p1.x), y: m.p1.y + t * (m.p2.y - m.p1.y) };
    return t > 0.01 && t < 0.99 && dist(q, piede) < 2;
  }));
  if (aMeta) return { pianta, ok: false, motivo: "Questa parete fa da lato a più stanze: dividila (o disegna una parete solo dove serve la curva) e curva quel tratto." };
  const punti = puntiArco(m.p1, m.p2, freccia, segmenti);
  if (!punti.length) return { pianta, ok: false, motivo: "Freccia troppo piccola." };
  const catena = [m.p1, ...punti, m.p2];
  const nuovi: Muro[] = catena.slice(1).map((q, i) => ({ ...m, id: i === 0 ? m.id : nuovoId("muro"), p1: { ...catena[i] }, p2: { ...q } }));
  const vicino = (p: Punto, q: Punto) => dist(p, q) < 2;
  const locali = pianta.locali.map((l) => {
    const c = l.contorno;
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length];
      const dritto = vicino(p, m.p1) && vicino(q, m.p2);
      const rovescio = vicino(p, m.p2) && vicino(q, m.p1);
      if (!dritto && !rovescio) continue;
      const dentro = dritto ? punti : [...punti].reverse();
      return { ...l, contorno: [...c.slice(0, i + 1), ...dentro, ...c.slice(i + 1)] };
    }
    return l;
  });
  return { pianta: { ...pianta, muri: pianta.muri.flatMap((x) => (x.id === id ? nuovi : [x])), locali }, ok: true };
}
