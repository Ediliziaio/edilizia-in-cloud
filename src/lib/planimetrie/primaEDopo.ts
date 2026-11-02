/**
 * Prima e dopo: i lavori che la pianta dice, stanza per stanza, con un costo di massima.
 *
 * Si confronta lo stato di fatto con una proposta dello stesso piano:
 * - pareti da demolire e nuove (mq = lunghezza × altezza), con prezzi diversi per tramezzi e
 *   pareti portanti o esterne;
 * - porte e finestre nuove, vani chiusi;
 * - sanitari, impianti, energia ed esterni nuovi o tolti, ai prezzi del listino della pianta;
 * - arredi nuovi (elencati, senza prezzo: sono forniture a parte);
 * - stanze che cambiano destinazione;
 * - linee impianti in più (metri stimati), per tutta la casa.
 * Ogni cosa va nella stanza del progetto dove cade (le pareti: la stanza da un lato o dall'altro).
 *
 * I prezzi sono indicativi (fornitura e posa, 2026): servono a dare l'ordine di grandezza al
 * cliente; quelli veri sono nel computo, dove le voci restano legate alla pianta.
 */
import type { Apertura, Elemento, Livello, Locale, Muro, Planimetria, Punto, StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { NOMI_AREA, type TipoArea } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { LISTINO_IMPIANTI } from "./listinoImpianti";

export type GenereLavoro = "demolizione" | "costruzione" | "serramenti" | "impianti" | "arredi" | "esterni" | "uso";

export interface Lavoro {
  genere: GenereLavoro;
  descrizione: string;
  quantita: number;
  unita: "mq" | "ml" | "n" | "mc";
  /** € per unità; null se non ha un prezzo (arredi, cambi d'uso). */
  prezzo: number | null;
  importo: number;
}

export interface LavoriStanza {
  stanza: string;
  lavori: Lavoro[];
  totale: number;
}

export interface RiepilogoLavori {
  stanze: LavoriStanza[];
  totale: number;
  /** Quanti lavori in tutto (righe). */
  righe: number;
}

/** Prezzi di massima delle opere edili (€ al mq, o al pezzo). */
export const PREZZI_OPERE = {
  demolizioneTramezzo: 28,
  demolizionePortante: 75,
  nuovoTramezzo: 58,
  nuovoPortante: 140,
  porta: 480,
  finestra: 900,
  portafinestra: 1350,
  varco: 320,
  chiusuraVano: 180,
  rimozione: 60,
} as const;

const NOMI_GENERE: Record<GenereLavoro, string> = {
  demolizione: "Demolizioni", costruzione: "Murature", serramenti: "Porte e finestre", impianti: "Impianti",
  arredi: "Arredi", esterni: "Esterni", uso: "Destinazione",
};
export const nomeGenere = (g: GenereLavoro) => NOMI_GENERE[g];

const arrot = (v: number) => Math.round(v * 100) / 100;
const lunghezza = (m: Muro) => Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
const prezzoElemento = (tipo: string) => LISTINO_IMPIANTI.find((v) => v.id === `elementi:${tipo}.numero`) ?? null;

/** Il nome dell'elemento per l'elenco: dal listino se c'è, altrimenti il tipo leggibile. */
function nomeElemento(tipo: string): string {
  const v = prezzoElemento(tipo);
  if (v) return v.descrizione.split(",")[0];
  return tipo.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** La stanza dove cade un punto: prima quelle del progetto, poi quelle di oggi. */
function stanzaDi(p: Punto, progetto: Locale[], oggi: Locale[]): string | null {
  for (const l of progetto) if (l.contorno.length >= 3 && puntoNelPoligono(p, l.contorno)) return l.nome;
  for (const l of oggi) if (l.contorno.length >= 3 && puntoNelPoligono(p, l.contorno)) return l.nome;
  return null;
}

/** La stanza di una parete: si guarda appena di qua e appena di là dalla metà. */
function stanzaDelMuro(m: Muro, progetto: Locale[], oggi: Locale[]): string | null {
  const l = lunghezza(m) || 1;
  const nx = -(m.p2.y - m.p1.y) / l, ny = (m.p2.x - m.p1.x) / l;
  const c = { x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 };
  const d = Math.max(m.spessore, 10);
  return stanzaDi({ x: c.x + nx * d, y: c.y + ny * d }, progetto, oggi) ?? stanzaDi({ x: c.x - nx * d, y: c.y - ny * d }, progetto, oggi);
}

function puntoApertura(a: Apertura, muri: Muro[]): Punto | null {
  const m = muri.find((x) => x.id === a.muroId);
  if (!m) return null;
  const l = lunghezza(m) || 1;
  const t = (a.offset + a.larghezza / 2) / l;
  return { x: m.p1.x + (m.p2.x - m.p1.x) * t, y: m.p1.y + (m.p2.y - m.p1.y) * t };
}

export function lavoriDaPianta(doc: Planimetria, livelloId: string, propostaId?: string): RiepilogoLavori {
  const livello: Livello | undefined = doc.livelli.find((l) => l.id === livelloId) ?? doc.livelli[0];
  const proposta = livello?.proposte.find((p) => p.id === propostaId) ?? livello?.proposte[0];
  if (!livello || !proposta) return { stanze: [], totale: 0, righe: 0 };
  return confronta(doc, livello.fatto, proposta, proposta.id);
}

function confronta(doc: Planimetria, fatto: StatoPianta, progetto: StatoPianta, propostaId: string): RiepilogoLavori {
  const perStanza = new Map<string, Lavoro[]>();
  const metti = (stanza: string | null, l: Omit<Lavoro, "importo">) => {
    const nome = stanza ?? "Generale";
    const lavoro: Lavoro = { ...l, quantita: arrot(l.quantita), importo: l.prezzo == null ? 0 : arrot(l.quantita * l.prezzo) };
    const lista = perStanza.get(nome) ?? [];
    // stessa cosa nella stessa stanza: si somma
    const uguale = lista.find((x) => x.descrizione === lavoro.descrizione && x.unita === lavoro.unita && x.prezzo === lavoro.prezzo);
    if (uguale) { uguale.quantita = arrot(uguale.quantita + lavoro.quantita); uguale.importo = arrot(uguale.importo + lavoro.importo); }
    else lista.push(lavoro);
    perStanza.set(nome, lista);
  };
  const P = PREZZI_OPERE;
  const locProg = progetto.locali, locOggi = fatto.locali;

  // ─── pareti ───
  for (const m of progetto.muri) {
    if (m.stato !== "da_demolire" && m.stato !== "nuovo") continue;
    const mq = (lunghezza(m) * m.altezza) / 10_000;
    const portante = m.tipo !== "tramezzo";
    const stanza = stanzaDelMuro(m, locProg, locOggi);
    if (m.stato === "da_demolire") {
      metti(stanza, { genere: "demolizione", descrizione: portante ? "Demolizione di muratura portante (con opere di sostegno)" : "Demolizione di tramezzo", quantita: mq, unita: "mq", prezzo: portante ? P.demolizionePortante : P.demolizioneTramezzo });
    } else {
      metti(stanza, { genere: "costruzione", descrizione: portante ? "Nuova muratura portante" : "Nuovo tramezzo (laterizio o cartongesso), intonacato", quantita: mq, unita: "mq", prezzo: portante ? P.nuovoPortante : P.nuovoTramezzo });
    }
  }

  // ─── porte e finestre ───
  for (const a of progetto.aperture) {
    if (a.stato !== "nuovo" && a.stato !== "da_demolire") continue;
    const p = puntoApertura(a, progetto.muri);
    const m = progetto.muri.find((x) => x.id === a.muroId);
    const stanza = m ? stanzaDelMuro(m, locProg, locOggi) : p ? stanzaDi(p, locProg, locOggi) : null;
    if (a.stato === "da_demolire") {
      metti(stanza, { genere: "serramenti", descrizione: "Chiusura di un vano (porta o finestra tolta)", quantita: 1, unita: "n", prezzo: P.chiusuraVano });
    } else {
      const descr = { porta: "Nuova porta interna, con apertura del vano", finestra: "Nuova finestra, con apertura del vano", portafinestra: "Nuova portafinestra, con apertura del vano", varco: "Nuovo varco (apertura senza serramento)" }[a.tipo];
      metti(stanza, { genere: "serramenti", descrizione: descr, quantita: 1, unita: "n", prezzo: P[a.tipo] });
    }
  }

  // ─── sanitari, impianti, arredi ───
  const idOggi = new Set(fatto.elementi.map((e) => e.id));
  const idProg = new Set(progetto.elementi.map((e) => e.id));
  const genereDi = (e: Elemento): GenereLavoro => {
    const v = prezzoElemento(e.tipo);
    if (v?.capitolo === "Esterni") return "esterni";
    return v ? "impianti" : "arredi";
  };
  for (const e of progetto.elementi) {
    if (idOggi.has(e.id) && e.stato !== "nuovo") continue;
    const v = prezzoElemento(e.tipo);
    metti(stanzaDi(e.posizione, locProg, locOggi), { genere: genereDi(e), descrizione: v ? v.descrizione : `${nomeElemento(e.tipo)} (fornitura a parte)`, quantita: 1, unita: "n", prezzo: v?.prezzo ?? null });
  }
  for (const e of fatto.elementi) {
    if (idProg.has(e.id)) continue;
    // si toglie: conta come lavoro solo se è un impianto o un sanitario (gli arredi si spostano)
    if (!prezzoElemento(e.tipo) && !["wc", "bidet", "lavabo", "doccia", "vasca", "cucina", "caldaia"].includes(e.tipo)) continue;
    metti(stanzaDi(e.posizione, locOggi, locProg), { genere: "demolizione", descrizione: `Rimozione: ${nomeElemento(e.tipo).toLowerCase()}`, quantita: 1, unita: "n", prezzo: P.rimozione });
  }

  // ─── cambi d'uso ───
  for (const l of progetto.locali) {
    const prima = fatto.locali.find((x) => x.id === l.id);
    if (prima && prima.destinazione !== l.destinazione) {
      metti(l.nome, { genere: "uso", descrizione: `Da ${prima.destinazione} a ${l.destinazione}`, quantita: 1, unita: "n", prezzo: null });
    }
  }

  // ─── esterni ───
  const areeOggi = new Set((fatto.aree ?? []).map((a) => a.id));
  for (const a of progetto.aree ?? fatto.aree ?? []) {
    if (areeOggi.has(a.id) && a.stato !== "nuovo") continue;
    const mq = areaPoligono(a.contorno) / 10_000;
    const v = LISTINO_IMPIANTI.find((x) => x.id === `esterni:${a.tipo}.superficie_mq`);
    if (a.tipo === "lotto") continue;
    metti("Esterni", { genere: "esterni", descrizione: v?.descrizione ?? NOMI_AREA[a.tipo as TipoArea], quantita: mq, unita: "mq", prezzo: v?.prezzo ?? null });
  }

  // ─── linee impianti: i metri in più del progetto rispetto a oggi ───
  const q = calcolaQuantita(doc);
  for (const v of LISTINO_IMPIANTI) {
    if (!v.id.startsWith("impianti:")) continue;
    const [soggetto, misura] = v.id.split(".");
    const oggi = q[`fatto:${soggetto}.${misura}`]?.valore ?? 0;
    const dopo = q[`progetto:${propostaId}:${soggetto}.${misura}`]?.valore ?? 0;
    if (dopo - oggi > 0.5) metti("Impianti, tutta la casa (stima)", { genere: "impianti", descrizione: v.descrizione, quantita: dopo - oggi, unita: v.unita === "mq" ? "mq" : v.unita, prezzo: v.prezzo });
  }

  const stanze = [...perStanza.entries()].map(([stanza, lavori]) => ({ stanza, lavori, totale: arrot(lavori.reduce((t, l) => t + l.importo, 0)) }));
  // prima le stanze vere, nell'ordine del progetto; in fondo esterni, impianti generali e il resto
  const ordine = (s: string) => { const i = progetto.locali.findIndex((l) => l.nome === s); return i >= 0 ? i : s === "Esterni" ? 1000 : s.startsWith("Impianti") ? 1001 : 1002; };
  stanze.sort((a, b) => ordine(a.stanza) - ordine(b.stanza));
  return { stanze, totale: arrot(stanze.reduce((t, s) => t + s.totale, 0)), righe: stanze.reduce((t, s) => t + s.lavori.length, 0) };
}

/** La chiave di un lavoro, stabile fra un salvataggio e l'altro: stanza, descrizione, unità. */
export const chiaveLavoro = (stanza: string, l: Pick<Lavoro, "descrizione" | "unita">) => `${stanza}|${l.descrizione}|${l.unita}`;

/** Quanto è fatto: per stanza e in tutto, in euro e in percentuale dell'importo (i lavori senza prezzo contano 0). */
export function avanzamento(r: RiepilogoLavori, fatti: ReadonlySet<string>) {
  const stanze = r.stanze.map((s) => {
    const eseguito = s.lavori.filter((l) => fatti.has(chiaveLavoro(s.stanza, l))).reduce((t, l) => t + l.importo, 0);
    const fattiN = s.lavori.filter((l) => fatti.has(chiaveLavoro(s.stanza, l))).length;
    return { stanza: s.stanza, eseguito, percento: s.totale > 0 ? Math.round((eseguito / s.totale) * 100) : fattiN === s.lavori.length ? 100 : 0, fatti: fattiN, totali: s.lavori.length };
  });
  const eseguito = stanze.reduce((t, s) => t + s.eseguito, 0);
  return { stanze, eseguito, percento: r.totale > 0 ? Math.round((eseguito / r.totale) * 100) : 0 };
}

export const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const scriviQuantita = (l: Lavoro) => `${l.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${l.unita === "n" ? "n." : l.unita === "ml" ? "m" : l.unita === "mc" ? "m³" : "m²"}`;

/**
 * Le due piante sullo stesso riquadro: il viewBox dell'una e dell'altra unito, così nel
 * confronto a cursore le pareti di oggi e quelle del progetto stanno una sopra l'altra.
 */
export function stessoRiquadro(a: string, b: string): [string, string] {
  const leggi = (s: string) => {
    const m = s.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
    return m ? m.slice(1).map(Number) : null;
  };
  const va = leggi(a), vb = leggi(b);
  if (!va || !vb) return [a, b];
  const x0 = Math.min(va[0], vb[0]), y0 = Math.min(va[1], vb[1]);
  const x1 = Math.max(va[0] + va[2], vb[0] + vb[2]), y1 = Math.max(va[1] + va[3], vb[1] + vb[3]);
  const vb2 = `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"`;
  // misure in pixel proporzionali (1000 di larghezza): le immagini si sovrappongono identiche
  const dim = `width="1000" height="${Math.round((1000 * (y1 - y0)) / (x1 - x0))}"`;
  const rifai = (s: string) => s.replace(/width="[\d.]+mm" height="[\d.]+mm"/, dim).replace(/viewBox="[^"]+"/, vb2);
  return [rifai(a), rifai(b)];
}
