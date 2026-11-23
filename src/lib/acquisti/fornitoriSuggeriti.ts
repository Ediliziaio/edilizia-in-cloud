// Da chi comprare un materiale, con le prove (23/11/2026).
//
// Prima il suggerimento era un nome solo, scelto per la prima parola del materiale («battiscopa»):
// non diceva se quel fornitore aveva mai venduto QUELL'articolo, a che prezzo, quando, né se il
// listino era ancora valido. Qui ogni proposta porta le sue prove e dice che cosa manca per
// confrontarla con le altre.
//
// Funzioni pure: i dati li carica chi chiama (listini, ordini emessi, anagrafica fornitori).

import { parolaChiave } from "./fabbisogno";
import { statoListino, type StatoListino } from "@/lib/listino/validitaListino";

export interface MaterialeDaComprare {
  nome: string;
  codice?: string | null;
  unita?: string | null;
  article_template_id?: string | null;
}

/** Una voce di un listino fornitore. */
export interface ProvaListino {
  supplier_id: string;
  descrizione: string;
  codice?: string | null;
  unita?: string | null;
  prezzo?: number | null;
  sconto_pct?: number | null;
  valido_dal: string | null;
  valido_al: string | null;
  attivo: boolean;
}

/**
 * Un acquisto passato. «ordine»: riga di un ordine d'acquisto emesso, col prezzo pagato.
 * «commessa»: articolo di un'altra commessa a cui era assegnato quel fornitore (prova più debole:
 * dice da chi si pensava di comprarlo, non che lo si è ordinato).
 */
export interface ProvaAcquisto {
  origine?: "ordine" | "commessa";
  supplier_id: string;
  descrizione: string;
  codice?: string | null;
  unita?: string | null;
  prezzo?: number | null;
  /** Data dell'ordine, AAAA-MM-GG. */
  data: string | null;
  article_template_id?: string | null;
}

export interface AnagraficaFornitore {
  id: string;
  name: string;
  tipo?: string | null;
  lead_time_days?: number | null;
  min_order_amount?: number | null;
  is_active?: boolean | null;
}

/** Quanto la prova riguarda proprio questo materiale. */
export type LivelloProva = "stesso_articolo" | "articolo_simile" | "stessa_famiglia";

export const ETICHETTA_LIVELLO: Record<LivelloProva, string> = {
  stesso_articolo: "Ha già questo articolo",
  articolo_simile: "Ha un articolo simile, da confermare",
  stessa_famiglia: "Vende materiali di questa famiglia",
};

export interface ProvaFornitore {
  fonte: "listino" | "ordine" | "commessa";
  livello: LivelloProva;
  descrizione: string;
  codice: string | null;
  unita: string | null;
  /** Prezzo netto (listino: già tolto lo sconto). */
  prezzo: number | null;
  /** Acquisto: data dell'ordine. Listino: inizio validità. */
  data: string | null;
  valido_al: string | null;
  stato_listino: StatoListino | null;
}

export interface FornitoreProposto {
  supplier_id: string;
  fornitore: string;
  livello: LivelloProva;
  /** La prova migliore: quella da cui si legge il prezzo. */
  prova: ProvaFornitore;
  prove: ProvaFornitore[];
  /** Quanti ordini emessi l'azienda gli ha fatto per questo articolo (o uno simile). */
  acquisti: number;
  consegna_giorni: number | null;
  ordine_minimo: number | null;
  /** Che cosa manca per confrontarlo con gli altri o per ordinare. */
  mancano: string[];
  /** In una riga, perché lo si propone. */
  motivo: string;
}

/** I criteri di ordinamento, nell'ordine in cui contano. Si possono cambiare. */
export type CriterioFornitore = "livello" | "listino_valido" | "prezzo" | "recente" | "consegna" | "abitudine";
export const CRITERI_PREDEFINITI: CriterioFornitore[] = ["livello", "listino_valido", "prezzo", "recente", "consegna", "abitudine"];
export const ETICHETTA_CRITERIO: Record<CriterioFornitore, string> = {
  livello: "Chi ha proprio questo articolo",
  listino_valido: "Listino in vigore",
  prezzo: "Prezzo più basso",
  recente: "Acquisto più recente",
  consegna: "Consegna più rapida",
  abitudine: "Da chi si compra più spesso",
};

const GENERICHE = new Set(["fornitura", "posa", "opera", "compreso", "compresa", "tipo", "modello", "della", "delle", "degli", "dello",
  "nella", "nelle", "sulla", "dalla", "come", "ogni", "altro", "materiale", "materiali", "colore", "bianco", "bianca", "interni", "esterni", "sacco", "confezione"]);
const senzaAccenti = (s: string) => s.toLocaleLowerCase("it-IT").normalize("NFD").replace(/[̀-ͯ]/g, "");
const nomeUguale = (s: string) => senzaAccenti(s).replace(/[^a-z0-9]+/g, " ").trim();
const codiceUguale = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Le radici che dicono cos'è: parole di almeno 4 lettere non generiche (prime 6 lettere) e i numeri del formato. */
function radici(s: string): Set<string> {
  const t = senzaAccenti(s);
  const parole = (t.match(/[a-z]{4,}/g) ?? []).filter((w) => !GENERICHE.has(w)).map((w) => w.slice(0, 6));
  const numeri = t.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return new Set([...parole, ...numeri]);
}
const unitaBase = (u: string | null | undefined) => {
  const n = senzaAccenti(u ?? "").replace(/[^a-z0-9]/g, "");
  if (!n) return null;
  if (["cad", "cadauno", "n", "nr", "pz", "pezzi", "pezzo"].includes(n)) return "pz";
  if (["ml", "m", "mt", "metri"].includes(n)) return "m";
  if (["mq", "m2"].includes(n)) return "mq";
  if (["mc", "m3"].includes(n)) return "mc";
  if (["l", "lt", "litri"].includes(n)) return "l";
  return n;
};

/** Quanto una descrizione del fornitore riguarda il materiale. Null: non c'entra. */
export function livelloProva(m: MaterialeDaComprare, p: { descrizione: string; codice?: string | null; article_template_id?: string | null }): LivelloProva | null {
  if (m.article_template_id && p.article_template_id === m.article_template_id) return "stesso_articolo";
  const cm = codiceUguale(m.codice), cp = codiceUguale(p.codice);
  if (cm.length >= 3 && cm === cp) return "stesso_articolo";
  if (nomeUguale(m.nome) && nomeUguale(m.nome) === nomeUguale(p.descrizione)) return "stesso_articolo";
  const chiave = parolaChiave(m.nome);
  if (!chiave || parolaChiave(p.descrizione) !== chiave) return null;
  const rm = radici(m.nome), rp = radici(p.descrizione);
  const comuni = [...rm].filter((x) => rp.has(x)).length;
  // Simile: oltre alla parola che dice cos'è, almeno un'altra cosa in comune e più di metà del nome.
  return comuni >= 2 && comuni / rm.size > 0.5 ? "articolo_simile" : "stessa_famiglia";
}

const PESO_LIVELLO: Record<LivelloProva, number> = { stesso_articolo: 0, articolo_simile: 1, stessa_famiglia: 2 };
const prezzoNetto = (prezzo: number | null | undefined, sconto: number | null | undefined) =>
  prezzo == null || !Number.isFinite(Number(prezzo)) || Number(prezzo) <= 0 ? null : Math.round(Number(prezzo) * (1 - (Number(sconto) || 0) / 100) * 10000) / 10000;

/** La prova migliore di un fornitore: la più pertinente, poi un listino in vigore, poi la più recente. */
function ordinaProve(a: ProvaFornitore, b: ProvaFornitore): number {
  return PESO_LIVELLO[a.livello] - PESO_LIVELLO[b.livello]
    || Number(b.stato_listino === "in_vigore") - Number(a.stato_listino === "in_vigore")
    || Number(b.fonte !== "commessa") - Number(a.fonte !== "commessa")
    || Number(b.prezzo != null) - Number(a.prezzo != null)
    || (b.data ?? "").localeCompare(a.data ?? "");
}

const giorno = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });

/**
 * I fornitori da cui comprare un materiale, ognuno con le sue prove. Chi ha proprio quell'articolo
 * viene prima di chi vende «roba simile»; fra pari, i criteri scelti. Un prezzo si confronta solo
 * se l'unità è la stessa del fabbisogno: altrimenti lo si mostra, ma si dice che non è confrontabile.
 */
export function proponiFornitori(
  m: MaterialeDaComprare,
  dati: { listini: ProvaListino[]; acquisti: ProvaAcquisto[]; fornitori: AnagraficaFornitore[] },
  opzioni: { oggi: string; criteri?: CriterioFornitore[]; quanti?: number } ,
): FornitoreProposto[] {
  const anagrafica = new Map(dati.fornitori.map((f) => [f.id, f]));
  const perFornitore = new Map<string, ProvaFornitore[]>();
  const aggiungi = (id: string, p: ProvaFornitore) => perFornitore.set(id, [...(perFornitore.get(id) ?? []), p]);
  for (const l of dati.listini) {
    const livello = livelloProva(m, l);
    if (!livello) continue;
    const stato = statoListino(l, opzioni.oggi);
    // Un listino spento non è una prova: l'azienda ha detto di non usarlo.
    if (stato === "spento") continue;
    aggiungi(l.supplier_id, { fonte: "listino", livello, descrizione: l.descrizione, codice: l.codice?.trim() || null, unita: l.unita?.trim() || null,
      prezzo: prezzoNetto(l.prezzo, l.sconto_pct), data: l.valido_dal, valido_al: l.valido_al, stato_listino: stato });
  }
  for (const a of dati.acquisti) {
    const livello = livelloProva(m, a);
    if (!livello) continue;
    aggiungi(a.supplier_id, { fonte: a.origine ?? "commessa", livello, descrizione: a.descrizione, codice: a.codice?.trim() || null, unita: a.unita?.trim() || null,
      prezzo: prezzoNetto(a.prezzo, 0), data: a.data?.slice(0, 10) ?? null, valido_al: null, stato_listino: null });
  }

  const um = unitaBase(m.unita);
  const proposte: (FornitoreProposto & { confrontabile: number | null })[] = [];
  for (const [id, prove] of perFornitore) {
    const f = anagrafica.get(id);
    if (!f || f.is_active === false) continue;
    prove.sort(ordinaProve);
    const prova = prove[0];
    const livello = prova.livello;
    const acquisti = prove.filter((p) => p.fonte === "ordine" && p.livello !== "stessa_famiglia").length;
    const stessaUnita = !um || !unitaBase(prova.unita) || unitaBase(prova.unita) === um;
    const mancano: string[] = [];
    if (livello === "stessa_famiglia") mancano.push("un'offerta per questo articolo: finora ha venduto altro della stessa famiglia");
    else if (livello === "articolo_simile") mancano.push("la conferma che è lo stesso articolo");
    if (prova.prezzo == null && livello !== "stessa_famiglia") mancano.push("il prezzo");
    if (prova.stato_listino === "scaduto") mancano.push(`un prezzo aggiornato: listino scaduto il ${giorno(prova.valido_al)}`);
    if (prova.stato_listino === "non_ancora") mancano.push(`listino valido solo dal ${giorno(prova.data)}`);
    if (prova.prezzo != null && !stessaUnita) mancano.push(`la conversione: lui vende a ${prova.unita}, il fabbisogno è in ${m.unita}`);
    if (prova.fonte === "commessa" && livello !== "stessa_famiglia") mancano.push("un ordine o un listino che lo confermi: finora gli era solo assegnato");
    if (f.lead_time_days == null) mancano.push("i tempi di consegna");
    const quando = prova.fonte === "listino"
      ? `a listino${prova.stato_listino === "scaduto" ? " (scaduto)" : prova.valido_al ? `, valido fino al ${giorno(prova.valido_al)}` : ""}`
      : `${prova.fonte === "ordine" ? "ordinato" : "assegnato a lui in un'altra commessa"}${prova.data ? ` il ${giorno(prova.data)}` : ""}`;
    const prezzo = prova.prezzo != null && livello !== "stessa_famiglia" ? ` a ${euro(prova.prezzo)}${prova.unita ? `/${prova.unita}` : ""}` : "";
    const motivo = livello === "stessa_famiglia"
      ? `Vende materiali di questa famiglia («${prova.descrizione}»), non ancora questo articolo`
      : `${livello === "stesso_articolo" ? "Questo articolo" : `Articolo simile («${prova.descrizione}»)`} ${quando}${prezzo}${acquisti > 1 ? ` · ${acquisti} ordini` : ""}`;
    proposte.push({ supplier_id: id, fornitore: f.name, livello, prova, prove, acquisti,
      consegna_giorni: f.lead_time_days ?? null, ordine_minimo: f.min_order_amount ?? null, mancano, motivo,
      // Il prezzo conta nell'ordinamento solo se è di questo articolo, nella stessa unità, e non scaduto.
      confrontabile: livello !== "stessa_famiglia" && stessaUnita && prova.stato_listino !== "scaduto" ? prova.prezzo : null });
  }

  const criteri = opzioni.criteri ?? CRITERI_PREDEFINITI;
  const confronto: Record<CriterioFornitore, (a: typeof proposte[number], b: typeof proposte[number]) => number> = {
    livello: (a, b) => PESO_LIVELLO[a.livello] - PESO_LIVELLO[b.livello],
    listino_valido: (a, b) => Number(b.prova.stato_listino === "in_vigore") - Number(a.prova.stato_listino === "in_vigore"),
    prezzo: (a, b) => (a.confrontabile ?? Infinity) - (b.confrontabile ?? Infinity) || 0,
    recente: (a, b) => (b.prove.find((p) => p.fonte === "ordine")?.data ?? "").localeCompare(a.prove.find((p) => p.fonte === "ordine")?.data ?? ""),
    consegna: (a, b) => (a.consegna_giorni ?? Infinity) - (b.consegna_giorni ?? Infinity) || 0,
    abitudine: (a, b) => b.acquisti - a.acquisti,
  };
  proposte.sort((a, b) => {
    for (const c of criteri) { const d = confronto[c](a, b); if (d && Number.isFinite(d)) return d; if (d === Infinity) return 1; if (d === -Infinity) return -1; }
    return a.fornitore.localeCompare(b.fornitore, "it");
  });
  return proposte.slice(0, opzioni.quanti ?? 5).map(({ confrontabile: _c, ...p }) => p);
}

/** Che cosa scrivere in una richiesta d'offerta perché le risposte si possano confrontare. */
export function daChiedereInOfferta(m: MaterialeDaComprare & { quantita?: number | null }, proposte: FornitoreProposto[]): string[] {
  const chiedi = ["prezzo unitario netto e validità dell'offerta", "confezione e quantità minima d'ordine", "tempi di consegna e costo del trasporto"];
  if (!m.unita?.trim()) chiedi.unshift("unità di misura del fabbisogno: manca, va decisa prima di chiedere");
  if (!(Number(m.quantita) > 0)) chiedi.unshift("quantità: manca, senza non si ottiene un prezzo attendibile");
  if (!proposte.some((p) => p.livello === "stesso_articolo")) chiedi.push("codice e scheda tecnica dell'articolo offerto: nessun fornitore ha ancora venduto proprio questo");
  return chiedi;
}
