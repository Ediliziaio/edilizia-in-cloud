/**
 * Comandi dell'editor: ogni modifica alla pianta è una funzione pura
 * `(pianta, …) → pianta nuova`. Niente stato nascosto: l'annulla/ripeti tiene
 * le piante una dopo l'altra (vedi storia.ts).
 */
import {
  ALTEZZA_PIANO,
  SPESSORE_TRAMEZZO,
  muroDelLato,
  quantitaLocale,
  type Apertura,
  type Destinazione,
  type Locale,
  type Muro,
  type Origine,
  type Pianta,
  type Punto,
  type StatoElemento,
  type TipoApertura,
} from "./adattatore";
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

export function modificaLocale(pianta: Pianta, id: string, campi: Partial<Pick<Locale, "nome" | "destinazione" | "altezza" | "origine">>): Pianta {
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
  return spostaPunti(pianta, (p) => sulSegmento(p, muro.p1, muro.p2), delta);
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
  let nuova = Math.abs(delta) < 0.05 ? pianta : allungaVerso(pianta, a, b, delta);
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

export function confermaTutte(pianta: Pianta): Pianta {
  const r = <T extends { origine: Origine }>(x: T): T => (x.origine === "stimata" ? { ...x, origine: "rilevata" } : x);
  return { ...pianta, muri: pianta.muri.map(r), aperture: pianta.aperture.map(r), locali: pianta.locali.map(r) };
}
