/**
 * Commessa generale dai documenti — controlli di coerenza (lotto 0 del piano
 * docs/piano-commessa-generale-da-documenti.md). Codice puro, senza AI e senza database: gira nel
 * browser (il popup ricalcola a ogni correzione) e, più avanti, nell'edge function.
 *
 * Due regole:
 * - un campo letto con valori diversi in punti diversi è un CONFLITTO: non si sceglie da soli,
 *   nemmeno «vince il contratto» (scelta del titolare `penale_due_valori`);
 * - un controllo che non ha i dati per decidere dice «non verificabile», non «ok».
 */
import { catalogoPer, campoDelCatalogo, type SceltaId, type TipoDaDocumenti } from "./catalogo.ts";

export type Valore = string | number | boolean;

/** Un punto in cui il dato è stato trovato. `pagina` è la pagina del PDF, non quella stampata. */
export interface Occorrenza {
  valore: Valore;
  file: string;
  pagina: number;
  citazione: string;
  certezza: "letto" | "calcolato" | "dedotto";
  /** Scritto a mano o sotto un timbro: va sempre guardato. */
  aMano?: boolean;
}

export type DatiLetti = Record<string, Occorrenza[]>;
/** Il valore scelto o corretto dall'utente per un campo. */
export type Scelte = Record<string, Valore | null>;

export type StatoCampo = "letto" | "conflitto" | "a_mano" | "non_trovato" | "escluso" | "scelto";

export interface EsitoCampo {
  chiave: string;
  stato: StatoCampo;
  /** I valori distinti trovati, ognuno con le sue occorrenze. */
  valori: { valore: Valore; occorrenze: Occorrenza[] }[];
  valore: Valore | null;
  scelta?: SceltaId;
}

export type EsitoControllo = "ok" | "errore" | "avviso" | "non_verificabile";

export interface Controllo {
  id: string;
  titolo: string;
  esito: EsitoControllo;
  messaggio: string;
  campi: string[];
}

// ─── Confronto dei valori ──────────────────────────────────────────────────────

const TOLLERANZA_EURO = 1;

const normale = (v: Valore): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : String(v);

export function stessoValore(a: Valore, b: Valore): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  return normale(a) === normale(b);
}

/** Testo senza accenti, punteggiatura e titoli (sig., ing., geom., dott.): per confrontare nomi e descrizioni. */
const nudo = (v: Valore) => String(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\b(sig|sigra|ing|geom|arch|dott|dottssa|avv|p ?i)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Per i campi di TESTO descrittivi (nomi, oggetto, luogo), due scritture della stessa cosa non sono
 * un conflitto: uguali senza punteggiatura e titoli; oppure le PAROLE di una tutte dentro l'altra
 * (parole intere: «Rossi» non è «Rossini»); oppure almeno il 60% delle parole in comune. In ogni
 * caso i NUMERI devono coincidere: «Lotto 1» non è «Lotto 12». Lotto 9 (contratto vero): metà dei
 * «conflitti» erano scritture diverse dello stesso nome. I campi `rigido` del catalogo (repertori,
 * catasto, scelte) non passano di qui.
 */
export function stessoTesto(a: Valore, b: Valore): boolean {
  const x = nudo(a), y = nudo(b);
  if (!x || !y) return x === y;
  if (x === y) return true;
  const px = x.split(" "), py = y.split(" ");
  const numeri = (p: string[]) => p.filter((w) => /\d/.test(w)).sort().join(" ");
  if (numeri(px) !== numeri(py)) return false;
  const sx = new Set(px), sy = new Set(py);
  const [corta, lunga] = sx.size <= sy.size ? [sx, sy] : [sy, sx];
  if (corta.size >= 2 && [...corta].every((w) => lunga.has(w))) return true;
  const parole = (s: Set<string>) => [...s].filter((w) => !/\d/.test(w));
  const wx = parole(sx), wy = new Set(parole(sy));
  const comuni = wx.filter((w) => wy.has(w)).length;
  const unione = new Set([...wx, ...wy]).size;
  return unione > 0 && comuni / unione >= 0.6;
}

function raggruppa(occ: Occorrenza[], testo = false): EsitoCampo["valori"] {
  const gruppi: EsitoCampo["valori"] = [];
  for (const o of occ) {
    const g = gruppi.find((x) => stessoValore(x.valore, o.valore) || (testo && stessoTesto(x.valore, o.valore)));
    if (g) {
      g.occorrenze.push(o);
      // Fra le varianti di un testo si mostra la più completa.
      if (testo && String(o.valore).length > String(g.valore).length) g.valore = o.valore;
    } else gruppi.push({ valore: o.valore, occorrenze: [o] });
  }
  return gruppi;
}

// ─── Stato dei campi ───────────────────────────────────────────────────────────

export function statoCampo(tipo: TipoDaDocumenti, chiave: string, dati: DatiLetti, scelte: Scelte = {}): EsitoCampo {
  const def = campoDelCatalogo(tipo, chiave);
  const scelta = def?.scelta;
  if (def?.escluso) return { chiave, stato: "escluso", valori: [], valore: null, scelta };
  const valori = raggruppa(dati[chiave] ?? [], def?.tipo === "testo" && !def.rigido);
  if (Object.prototype.hasOwnProperty.call(scelte, chiave) && scelte[chiave] !== null) {
    return { chiave, stato: "scelto", valori, valore: scelte[chiave], scelta };
  }
  if (valori.length === 0) return { chiave, stato: "non_trovato", valori, valore: null, scelta };
  if (valori.length > 1) return { chiave, stato: "conflitto", valori, valore: null, scelta };
  const aMano = valori[0].occorrenze.some((o) => o.aMano);
  return { chiave, stato: aMano ? "a_mano" : "letto", valori, valore: valori[0].valore, scelta };
}

export function statoCampi(tipo: TipoDaDocumenti, dati: DatiLetti, scelte: Scelte = {}): EsitoCampo[] {
  return catalogoPer(tipo).campi.map((c) => statoCampo(tipo, c.chiave, dati, scelte));
}

// ─── Utilità su date e numeri ──────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function aggiungiGiorni(iso: string, giorni: number): string {
  const [a, m, g] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + giorni));
  return d.toISOString().slice(0, 10);
}

const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 }) + "%";
const dataIt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ─── Controlli ─────────────────────────────────────────────────────────────────

type Lettore = { num: (k: string) => number | null; data: (k: string) => string | null; testo: (k: string) => string | null; conflitto: (k: string) => boolean };

function lettore(tipo: TipoDaDocumenti, dati: DatiLetti, scelte: Scelte): Lettore {
  const cache = new Map<string, EsitoCampo>();
  const esito = (k: string) => {
    if (!cache.has(k)) cache.set(k, statoCampo(tipo, k, dati, scelte));
    return cache.get(k)!;
  };
  const valore = (k: string) => esito(k).valore;
  return {
    num: (k) => { const v = valore(k); return typeof v === "number" && Number.isFinite(v) ? v : null; },
    data: (k) => { const v = valore(k); return typeof v === "string" && ISO.test(v) ? v : null; },
    testo: (k) => { const v = valore(k); return typeof v === "string" && v.trim() ? v.trim() : null; },
    conflitto: (k) => esito(k).stato === "conflitto",
  };
}

const nonVerificabile = (id: string, titolo: string, campi: string[], l: Lettore): Controllo => {
  const inConflitto = campi.filter((k) => l.conflitto(k));
  return {
    id, titolo, campi, esito: "non_verificabile",
    messaggio: inConflitto.length > 0 ? "Prima scegli il valore giusto dove ci sono più letture." : "Mancano dei dati per controllarlo.",
  };
};

function controlloSomma(id: string, titolo: string, l: Lettore, attesoK: string, totaleK: string, cosa: string): Controllo {
  const atteso = l.num(attesoK), totale = l.num(totaleK);
  if (atteso === null || totale === null) return nonVerificabile(id, titolo, [attesoK, totaleK], l);
  const diff = totale - atteso;
  return Math.abs(diff) <= TOLLERANZA_EURO
    ? { id, titolo, campi: [attesoK, totaleK], esito: "ok", messaggio: `${cosa} torna: ${euro(totale)}.` }
    : { id, titolo, campi: [attesoK, totaleK], esito: "errore", messaggio: `${cosa} è ${euro(totale)}, ${diff > 0 ? "più" : "meno"} di ${euro(Math.abs(diff))} rispetto a ${euro(atteso)}.` };
}

function controlliAppalto(tipo: TipoDaDocumenti, l: Lettore): Controllo[] {
  const out: Controllo[] = [];

  // 1. base × (1 − ribasso) + oneri = importo contrattuale
  {
    const id = "importo_contrattuale", titolo = "Base ribassata più oneri = importo contrattuale";
    const campi = ["importo_base", "ribasso_pct", "oneri_sicurezza", "importo_contrattuale"];
    const base = l.num("importo_base"), rib = l.num("ribasso_pct"), oneri = l.num("oneri_sicurezza"), contr = l.num("importo_contrattuale");
    const manodopera = l.num("costo_manodopera");
    if (base === null || rib === null || oneri === null || contr === null) out.push(nonVerificabile(id, titolo, campi, l));
    else {
      const tondo = (n: number) => Math.round(n * 100) / 100;
      const calcolato = tondo(base * (1 - rib / 100) + oneri);
      // Manodopera scorporata (D.Lgs. 36/2023, art. 41 c. 14): il ribasso non tocca la manodopera.
      const scorporato = manodopera !== null && manodopera < base ? tondo((base - manodopera) * (1 - rib / 100) + manodopera + oneri) : null;
      if (Math.abs(contr - calcolato) <= TOLLERANZA_EURO) {
        out.push({ id, titolo, campi, esito: "ok", messaggio: `${euro(base)} − ${pct(rib)} + ${euro(oneri)} = ${euro(calcolato)}, come nel contratto.` });
      } else if (scorporato !== null && Math.abs(contr - scorporato) <= TOLLERANZA_EURO) {
        out.push({ id, titolo, campi: [...campi, "costo_manodopera"], esito: "ok", messaggio: `Con la manodopera fuori dal ribasso: (${euro(base)} − ${euro(manodopera!)}) − ${pct(rib)} + ${euro(manodopera!)} + ${euro(oneri)} = ${euro(scorporato)}, come nel contratto.` });
      } else {
        const altro = scorporato !== null ? ` (con la manodopera fuori dal ribasso ${euro(scorporato)})` : "";
        out.push({ id, titolo, campi, esito: "errore", messaggio: `Il calcolo dà ${euro(calcolato)}${altro}, il contratto dice ${euro(contr)}: differenza di ${euro(Math.abs(contr - calcolato))}.` });
      }
    }
  }

  // 2-3. somme del computo e della sicurezza
  out.push(controlloSomma("somma_computo", "Somma del computo = base d'asta", l, "importo_base", "totale_computo", "La somma del computo"));
  out.push(controlloSomma("somma_sicurezza", "Somma della stima sicurezza = oneri", l, "oneri_sicurezza", "totale_sicurezza", "La somma della stima della sicurezza"));

  // 4. consegna + durata = fine prevista (due letture: con o senza il giorno di consegna)
  {
    const id = "durata", titolo = "Consegna più durata = fine prevista";
    const campi = ["data_consegna", "durata_giorni", "data_fine_prevista"];
    const cons = l.data("data_consegna"), dur = l.num("durata_giorni"), fine = l.data("data_fine_prevista");
    if (!cons || dur === null || !fine) out.push(nonVerificabile(id, titolo, campi, l));
    else {
      const conPrimo = aggiungiGiorni(cons, dur - 1), senzaPrimo = aggiungiGiorni(cons, dur);
      out.push(fine === conPrimo || fine === senzaPrimo
        ? { id, titolo, campi, esito: "ok", messaggio: `${dur} giorni dal ${dataIt(cons)} finiscono il ${dataIt(fine)}${fine === conPrimo ? ", contando il giorno di consegna" : ""}.` }
        : { id, titolo, campi, esito: "errore", messaggio: `${dur} giorni dal ${dataIt(cons)} finiscono il ${dataIt(conPrimo)} (o il ${dataIt(senzaPrimo)}), non il ${dataIt(fine)}.` });
    }
  }

  // 5. polizza CAR = importo contrattuale; 6. massimale RCT come chiesto dal contratto
  out.push(controlloSomma("car", "Polizza CAR, partita lavori = importo contrattuale", l, "importo_contrattuale", "car_somma_lavori", "La somma assicurata dei lavori"));
  out.push(controlloSomma("rct", "Massimale RCT come da contratto", l, "rct_massimale_contratto", "rct_massimale", "Il massimale RCT della polizza"));

  // 7. penale massima ≤ 10% (soglia di legge negli appalti pubblici; nel privato è solo un avviso)
  {
    const pubblico = tipo === "appalto_pubblico";
    const id = "penale_massima", titolo = "Penale massima entro il 10%";
    const p = l.num("penale_massima_pct");
    out.push(p === null ? nonVerificabile(id, titolo, ["penale_massima_pct"], l)
      : p <= 10 ? { id, titolo, campi: ["penale_massima_pct"], esito: "ok", messaggio: `Penale massima ${pct(p)}.` }
        : pubblico ? { id, titolo, campi: ["penale_massima_pct"], esito: "errore", messaggio: `Penale massima ${pct(p)}: negli appalti pubblici non supera il 10%, ricontrolla la lettura.` }
          : { id, titolo, campi: ["penale_massima_pct"], esito: "avviso", messaggio: `Penale massima ${pct(p)}: è alta, controlla che sia quella del contratto.` });
  }

  // 8. ritenuta 0,5% (avviso se diversa): regola degli appalti pubblici
  if (tipo === "appalto_pubblico") {
    const id = "ritenuta", titolo = "Ritenuta di garanzia dello 0,5%";
    const r = l.num("ritenuta_pct");
    out.push(r === null ? nonVerificabile(id, titolo, ["ritenuta_pct"], l)
      : Math.abs(r - 0.5) < 0.0001 ? { id, titolo, campi: ["ritenuta_pct"], esito: "ok", messaggio: "Ritenuta 0,5%." }
        : { id, titolo, campi: ["ritenuta_pct"], esito: "avviso", messaggio: `Ritenuta ${pct(r)}: negli appalti pubblici di solito è lo 0,5%. Controlla.` });
  }

  if (tipo === "appalto_pubblico") {
    // 9-11. formati
    out.push(controlloFormato("formato_cig", "CIG di 10 caratteri", l, "cig", /^[A-Z0-9]{10}$/i, "Il CIG ha 10 lettere o cifre"));
    out.push(controlloFormato("formato_cup", "CUP di 15 caratteri", l, "cup", /^[A-Z0-9]{15}$/i, "Il CUP ha 15 lettere o cifre"));
    out.push(controlloFormato("formato_codice_univoco", "Codice univoco di 6 caratteri", l, "codice_univoco", /^[A-Z0-9]{6}$/i, "Il codice univoco dell'ufficio ha 6 lettere o cifre"));
    // 12. CIG derivato diverso da quello dell'accordo quadro
    {
      const id = "cig_distinti", titolo = "CIG del contratto diverso da quello dell'accordo quadro";
      const cig = l.testo("cig"), acc = l.testo("cig_accordo");
      out.push(!cig || !acc ? nonVerificabile(id, titolo, ["cig", "cig_accordo"], l)
        : normale(cig) !== normale(acc) ? { id, titolo, campi: ["cig", "cig_accordo"], esito: "ok", messaggio: "I due CIG sono distinti." }
          : { id, titolo, campi: ["cig", "cig_accordo"], esito: "errore", messaggio: "Il CIG del contratto è uguale a quello dell'accordo quadro: serve il CIG derivato." });
    }
  }

  if (tipo === "appalto_privato") {
    out.push(controlloSomma("somma_rate", "Somma delle rate = importo contrattuale", l, "importo_contrattuale", "totale_rate", "La somma delle rate"));
    const id = "acconto", titolo = "Acconto non oltre l'importo";
    const a = l.num("acconto"), tot = l.num("importo_contrattuale");
    out.push(a === null || tot === null ? nonVerificabile(id, titolo, ["acconto", "importo_contrattuale"], l)
      : a <= tot ? { id, titolo, campi: ["acconto", "importo_contrattuale"], esito: "ok", messaggio: `Acconto ${euro(a)}.` }
        : { id, titolo, campi: ["acconto", "importo_contrattuale"], esito: "errore", messaggio: `L'acconto (${euro(a)}) supera l'importo (${euro(tot)}).` });
  }
  return out;
}

function controlloFormato(id: string, titolo: string, l: Lettore, k: string, re: RegExp, regola: string): Controllo {
  const v = l.testo(k);
  if (!v) return nonVerificabile(id, titolo, [k], l);
  const pulito = v.replace(/\s+/g, "");
  return re.test(pulito)
    ? { id, titolo, campi: [k], esito: "ok", messaggio: "Formato giusto." }
    : { id, titolo, campi: [k], esito: "errore", messaggio: `${regola}: «${v}» non torna. Spesso è una lettera letta male (O e 0, I e 1).` };
}

function controlloDateInOrdine(id: string, titolo: string, l: Lettore, primaK: string, dopoK: string, cosa: string): Controllo {
  const prima = l.data(primaK), dopo = l.data(dopoK);
  if (!prima || !dopo) return nonVerificabile(id, titolo, [primaK, dopoK], l);
  return dopo >= prima
    ? { id, titolo, campi: [primaK, dopoK], esito: "ok", messaggio: "Date in ordine." }
    : { id, titolo, campi: [primaK, dopoK], esito: "errore", messaggio: `${cosa}: ${dataIt(dopo)} viene prima di ${dataIt(prima)}.` };
}

/** Tutti i controlli del tipo, sui valori letti o scelti. */
export function controlli(tipo: TipoDaDocumenti, dati: DatiLetti, scelte: Scelte = {}): Controllo[] {
  const l = lettore(tipo, dati, scelte);
  if (tipo === "appalto_pubblico" || tipo === "appalto_privato") return controlliAppalto(tipo, l);
  if (tipo === "sviluppo") return [controlloDateInOrdine("titolo_date", "Scadenza del titolo dopo il rilascio", l, "titolo_data", "titolo_scadenza", "La scadenza del titolo")];
  const out = [controlloDateInOrdine("rogito_dopo_compromesso", "Rogito dopo il compromesso", l, "data_compromesso", "data_rogito", "Il rogito")];
  const pc = l.num("prezzo_compromesso"), pa = l.num("prezzo_atto");
  const id = "prezzo_uguale", titolo = "Stesso prezzo in compromesso e atto";
  out.push(pc === null || pa === null ? nonVerificabile(id, titolo, ["prezzo_compromesso", "prezzo_atto"], l)
    : Math.abs(pc - pa) <= TOLLERANZA_EURO ? { id, titolo, campi: ["prezzo_compromesso", "prezzo_atto"], esito: "ok", messaggio: `Prezzo ${euro(pa)}.` }
      : { id, titolo, campi: ["prezzo_compromesso", "prezzo_atto"], esito: "avviso", messaggio: `Nel compromesso ${euro(pc)}, nell'atto ${euro(pa)}: conta quello dell'atto, se è voluto.` });
  return out;
}

// ─── Riepilogo per il popup ────────────────────────────────────────────────────

export interface Riepilogo {
  campi: Record<StatoCampo, number>;
  controlli: Record<EsitoControllo, number>;
  /** Si può creare solo senza conflitti aperti e senza controlli rossi non accettati. */
  bloccanti: number;
}

export function riepilogo(campi: EsitoCampo[], ctrl: Controllo[], accettati: ReadonlySet<string> = new Set()): Riepilogo {
  const perCampo: Record<StatoCampo, number> = { letto: 0, conflitto: 0, a_mano: 0, non_trovato: 0, escluso: 0, scelto: 0 };
  for (const x of campi) perCampo[x.stato]++;
  const perCtrl: Record<EsitoControllo, number> = { ok: 0, errore: 0, avviso: 0, non_verificabile: 0 };
  for (const x of ctrl) perCtrl[x.esito]++;
  const rossiAperti = ctrl.filter((x) => x.esito === "errore" && !accettati.has(x.id)).length;
  return { campi: perCampo, controlli: perCtrl, bloccanti: perCampo.conflitto + rossiAperti };
}
