/**
 * Bilancio di verifica e bilancio in forma CEE dalle scritture (10/11/2026).
 *
 * Tutto discende dalla partita doppia: i saldi dei conti, e dai saldi le voci
 * dello stato patrimoniale (art. 2424 c.c.) e del conto economico (art. 2425)
 * secondo la voce CEE scritta su ogni conto. L'utile dell'esercizio non è un
 * conto movimentato a mano: è la differenza fra ricavi e costi, e va nel
 * passivo alla voce A.IX finché non si registra la chiusura.
 *
 * Schema abbreviato: le voci sono quelle del piano dei conti standard; un conto
 * senza voce CEE finisce in «Voce non indicata», visibile, non nascosto.
 */
import { htmlDocumentoContabile, type AziendaIntestazione } from "./documentoContabile";
import type { ContoContabile, Scrittura } from "./libroGiornale";

const cent = (n: number) => Math.round(n * 100);

export interface SaldoConto {
  conto: ContoContabile;
  dare: number;
  avere: number;
  /** Dare meno avere. */
  saldo: number;
}

export function saldiPerConto(scritture: readonly Scrittura[], conti: readonly ContoContabile[], finoAl?: string): SaldoConto[] {
  const tot = new Map<string, { d: number; a: number }>();
  // L'epilogo di chiusura azzera costi e ricavi sull'utile: il bilancio dell'anno si legge senza,
  // e senza i suoi storni (riapertura).
  const chiusure = new Set(scritture.filter((s) => s.origine === "chiusura").map((s) => s.id));
  for (const s of scritture) {
    if (finoAl && s.data_registrazione > finoAl) continue;
    if (chiusure.has(s.id) || (s.storno_di && chiusure.has(s.storno_di))) continue;
    for (const r of s.contabilita_righe ?? []) {
      const t = tot.get(r.conto_id) ?? { d: 0, a: 0 };
      t.d += cent(Number(r.dare) || 0);
      t.a += cent(Number(r.avere) || 0);
      tot.set(r.conto_id, t);
    }
  }
  return conti
    .filter((c) => tot.has(c.id))
    .map((c) => {
      const t = tot.get(c.id)!;
      return { conto: c, dare: t.d / 100, avere: t.a / 100, saldo: (t.d - t.a) / 100 };
    })
    .sort((a, b) => a.conto.codice.localeCompare(b.conto.codice, "it", { numeric: true }));
}

export interface BilancioVerifica {
  righe: SaldoConto[];
  totaleDare: number;
  totaleAvere: number;
  saldiDare: number;
  saldiAvere: number;
  quadra: boolean;
}

export function bilancioDiVerifica(saldi: readonly SaldoConto[]): BilancioVerifica {
  const somma = (f: (s: SaldoConto) => number) => saldi.reduce((t, s) => t + cent(f(s)), 0) / 100;
  const totaleDare = somma((s) => s.dare);
  const totaleAvere = somma((s) => s.avere);
  const saldiDare = somma((s) => Math.max(0, s.saldo));
  const saldiAvere = somma((s) => Math.max(0, -s.saldo));
  return { righe: [...saldi], totaleDare, totaleAvere, saldiDare, saldiAvere, quadra: cent(totaleDare) === cent(totaleAvere) };
}

/** Le voci nell'ordine del codice civile, con la loro intestazione. */
const VOCI_SPA: Array<[string, string]> = [
  ["A", "A) Crediti verso soci per versamenti ancora dovuti"],
  ["B.I", "B.I - Immobilizzazioni immateriali"], ["B.I.1", "1) costi di impianto e di ampliamento"], ["B.I.3", "3) diritti di brevetto e di utilizzazione delle opere dell'ingegno"], ["B.I.7", "7) altre"],
  ["B.II", "B.II - Immobilizzazioni materiali"], ["B.II.1", "1) terreni e fabbricati"], ["B.II.2", "2) impianti e macchinario"],
  ["B.II.3", "3) attrezzature industriali e commerciali"], ["B.II.4", "4) altri beni"],
  ["B.III", "B.III - Immobilizzazioni finanziarie"], ["B.III.1", "1) partecipazioni"],
  ["C.I", "C.I - Rimanenze"], ["C.I.1", "1) materie prime, sussidiarie e di consumo"], ["C.I.3", "3) lavori in corso su ordinazione"], ["C.I.4", "4) prodotti finiti e merci"],
  ["C.II", "C.II - Crediti"], ["C.II.1", "1) verso clienti"], ["C.II.5-bis", "5-bis) crediti tributari"], ["C.II.5-ter", "5-ter) imposte anticipate"], ["C.II.5-quater", "5-quater) verso altri"],
  ["C.IV", "C.IV - Disponibilità liquide"], ["C.IV.1", "1) depositi bancari e postali"], ["C.IV.3", "3) danaro e valori in cassa"],
  ["D", "D) Ratei e risconti"],
];
const VOCI_SPP: Array<[string, string]> = [
  ["A", "A) Patrimonio netto"], ["A.I", "I - Capitale"], ["A.IV", "IV - Riserva legale"], ["A.VI", "VI - Altre riserve"],
  ["A.VIII", "VIII - Utili (perdite) portati a nuovo"], ["A.IX", "IX - Utile (perdita) dell'esercizio"],
  ["B", "B) Fondi per rischi e oneri"], ["B.1", "1) per trattamento di quiescenza e obblighi simili"], ["B.4", "4) altri"],
  ["C", "C) Trattamento di fine rapporto di lavoro subordinato"],
  ["D", "D) Debiti"], ["D.4", "4) debiti verso banche"], ["D.5", "5) debiti verso altri finanziatori"], ["D.6", "6) acconti"], ["D.7", "7) debiti verso fornitori"], ["D.10", "10) debiti verso imprese collegate"],
  ["D.12", "12) debiti tributari"], ["D.13", "13) debiti verso istituti di previdenza e di sicurezza sociale"], ["D.14", "14) altri debiti"],
  ["E", "E) Ratei e risconti"],
];
const VOCI_CE: Array<[string, string]> = [
  ["A", "A) Valore della produzione"], ["A.1", "1) ricavi delle vendite e delle prestazioni"], ["A.2", "2) variazioni delle rimanenze di prodotti in corso di lavorazione, semilavorati e finiti"],
  ["A.3", "3) variazioni dei lavori in corso su ordinazione"], ["A.5", "5) altri ricavi e proventi"],
  ["B", "B) Costi della produzione"], ["B.6", "6) per materie prime, sussidiarie, di consumo e di merci"], ["B.7", "7) per servizi"],
  ["B.8", "8) per godimento di beni di terzi"], ["B.9.a", "9.a) salari e stipendi"], ["B.9.b", "9.b) oneri sociali"],
  ["B.9.c", "9.c) trattamento di fine rapporto"], ["B.9.e", "9.e) altri costi del personale"], ["B.10.a", "10.a) ammortamento delle immobilizzazioni immateriali"],
  ["B.10.b", "10.b) ammortamento delle immobilizzazioni materiali"], ["B.11", "11) variazioni delle rimanenze di materie prime"],
  ["B.14", "14) oneri diversi di gestione"],
  ["C", "C) Proventi e oneri finanziari"], ["C.16", "16) altri proventi finanziari"], ["C.17", "17) interessi e altri oneri finanziari"],
  ["20", "20) Imposte sul reddito dell'esercizio"],
];

export interface RigaCee {
  codice: string;
  etichetta: string;
  valore: number;
  livello: "sezione" | "voce" | "totale";
}

/**
 * La sezione del bilancio in cui va il conto: quella scritta, altrimenti quella
 * che discende dalla natura. Un conto senza sezione non sparisce dal bilancio.
 */
const sezioneDi = (c: ContoContabile): "SPA" | "SPP" | "CE" =>
  c.sezione_cee ?? (c.natura === "attivo" ? "SPA" : c.natura === "passivo" ? "SPP" : "CE");

function vociDi(saldi: readonly SaldoConto[], sezione: "SPA" | "SPP" | "CE", schema: Array<[string, string]>) {
  const perVoce = new Map<string, number>();
  for (const s of saldi) {
    if (sezioneDi(s.conto) !== sezione) continue;
    const v = s.conto.voce_cee?.trim() || "?";
    // Il segno lo decide la sezione, non la natura: nell'attivo il saldo dare,
    // nel passivo il saldo avere (un fondo ammortamento nell'attivo riduce la
    // sua voce); nel conto economico i ricavi (A, C.16) in avere, i costi in dare.
    const valore = sezione === "SPA" ? s.saldo
      : sezione === "SPP" ? -s.saldo
      : (v.startsWith("A") || v === "C.16" ? -s.saldo : s.saldo);
    perVoce.set(v, (perVoce.get(v) ?? 0) + cent(valore));
  }
  const conosciute = new Set(schema.map(([c]) => c));
  const sconosciute = [...perVoce.keys()].filter((v) => !conosciute.has(v));
  return { perVoce, sconosciute };
}

/** Le righe della sezione: ogni macrovoce col suo totale, poi le voci che hanno un importo. */
function righeSezione(perVoce: Map<string, number>, schema: Array<[string, string]>, radici: string[]): RigaCee[] {
  const out: RigaCee[] = [];
  for (const radice of radici) {
    const figlie = schema.filter(([c]) => c === radice || c.startsWith(`${radice}.`));
    const totale = figlie.reduce((t, [c]) => t + (perVoce.get(c) ?? 0), 0);
    const intestazione = schema.find(([c]) => c === radice);
    out.push({ codice: radice, etichetta: intestazione?.[1] ?? radice, valore: totale / 100, livello: "sezione" });
    for (const [c, e] of figlie) {
      if (c === radice) continue;
      const v = perVoce.get(c);
      if (v) out.push({ codice: c, etichetta: e, valore: v / 100, livello: "voce" });
    }
  }
  return out;
}

export interface BilancioCee {
  attivo: RigaCee[];
  passivo: RigaCee[];
  contoEconomico: RigaCee[];
  totaleAttivo: number;
  totalePassivo: number;
  utile: number;
  /** Conti con una voce CEE che lo schema non conosce: da sistemare nel piano dei conti. */
  vociNonIndicate: string[];
}

export function bilancioCee(saldi: readonly SaldoConto[]): BilancioCee {
  const a = vociDi(saldi, "SPA", VOCI_SPA);
  const p = vociDi(saldi, "SPP", VOCI_SPP);
  const ce = vociDi(saldi, "CE", VOCI_CE);
  // Solo le voci dello schema, come le righe che si vedono: i totali tornano con le righe.
  const noteCe = new Set(VOCI_CE.map(([c]) => c));
  const tot = (m: Map<string, number>, pref: string[]) => [...m.entries()].filter(([k]) => noteCe.has(k) && pref.some((x) => k === x || k.startsWith(`${x}.`))).reduce((t, [, v]) => t + v, 0);

  const valoreProduzione = tot(ce.perVoce, ["A"]);
  const costiProduzione = tot(ce.perVoce, ["B"]);
  const proventi = ce.perVoce.get("C.16") ?? 0;
  const oneri = ce.perVoce.get("C.17") ?? 0;
  const imposte = ce.perVoce.get("20") ?? 0;
  // L'utile è ricavi meno costi su TUTTI i conti economici, anche quelli senza
  // voce o con una voce che lo schema non conosce: altrimenti il loro importo
  // resterebbe fuori dal netto e attivo e passivo non si pareggerebbero.
  const utile = -saldi.filter((s) => sezioneDi(s.conto) === "CE").reduce((t, s) => t + cent(s.saldo), 0);
  const altreVoci = utile + imposte - (valoreProduzione - costiProduzione + proventi - oneri);
  const primaImposte = valoreProduzione - costiProduzione + proventi - oneri + altreVoci;

  // L'utile entra nel passivo, alla A.IX, sommato a quello eventualmente già girato.
  p.perVoce.set("A.IX", (p.perVoce.get("A.IX") ?? 0) + utile);

  const contoEconomico: RigaCee[] = [
    ...righeSezione(ce.perVoce, VOCI_CE, ["A", "B"]),
    { codice: "A-B", etichetta: "Differenza tra valore e costi della produzione (A - B)", valore: (valoreProduzione - costiProduzione) / 100, livello: "totale" },
    ...righeSezione(ce.perVoce, VOCI_CE, ["C"]).map((r) => (r.codice === "C" ? { ...r, valore: (proventi - oneri) / 100 } : r)),
    ...(altreVoci !== 0
      ? [{ codice: "?", etichetta: "Conti senza una voce CEE riconosciuta (effetto sul risultato)", valore: altreVoci / 100, livello: "voce" as const }]
      : []),
    { codice: "ANTE", etichetta: "Risultato prima delle imposte", valore: primaImposte / 100, livello: "totale" },
    { codice: "20", etichetta: VOCI_CE.find(([c]) => c === "20")![1], valore: imposte / 100, livello: "voce" },
    { codice: "21", etichetta: "21) Utile (perdita) dell'esercizio", valore: utile / 100, livello: "totale" },
  ];

  const attivo = righeSezione(a.perVoce, VOCI_SPA, ["A", "B.I", "B.II", "B.III", "C.I", "C.II", "C.IV", "D"]).filter((r) => r.livello !== "sezione" || r.valore !== 0);
  const passivo = righeSezione(p.perVoce, VOCI_SPP, ["A", "B", "C", "D", "E"]).filter((r) => r.livello !== "sezione" || r.valore !== 0);
  const totaleAttivo = [...a.perVoce.values()].reduce((t, v) => t + v, 0) / 100;
  const totalePassivo = [...p.perVoce.values()].reduce((t, v) => t + v, 0) / 100;
  const nonIndicate = [...a.sconosciute.map((v) => `Attivo ${v}`), ...p.sconosciute.map((v) => `Passivo ${v}`), ...ce.sconosciute.map((v) => `C.E. ${v}`)];
  for (const [nome, m, lista] of [["Attivo", a.perVoce, attivo], ["Passivo", p.perVoce, passivo]] as const) {
    const ignote = [...m.entries()].filter(([k]) => !(nome === "Attivo" ? VOCI_SPA : VOCI_SPP).some(([c]) => c === k));
    for (const [k, v] of ignote) lista.push({ codice: k, etichetta: `Voce non indicata (${k})`, valore: v / 100, livello: "voce" });
  }
  return { attivo, passivo, contoEconomico, totaleAttivo, totalePassivo, utile: utile / 100, vociNonIndicate: nonIndicate };
}

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);

export function htmlBilancioVerifica(d: { azienda: AziendaIntestazione; verifica: BilancioVerifica; periodo: string }): string {
  return htmlDocumentoContabile<SaldoConto>({
    titolo: "Bilancio di verifica",
    periodo: d.periodo,
    sottotitolo: d.verifica.quadra ? "Totale dare e totale avere coincidono." : "ATTENZIONE: totale dare e totale avere non coincidono.",
    azienda: d.azienda,
    colonne: [
      { intestazione: "Codice", valore: (s) => s.conto.codice, compatta: true, larghezza: "9%" },
      { intestazione: "Conto", valore: (s) => s.conto.descrizione, larghezza: "39%" },
      { intestazione: "Dare", valore: (s) => euro(s.dare), allinea: "destra", compatta: true, larghezza: "13%" },
      { intestazione: "Avere", valore: (s) => euro(s.avere), allinea: "destra", compatta: true, larghezza: "13%" },
      { intestazione: "Saldo dare", valore: (s) => (s.saldo > 0 ? euro(s.saldo) : ""), allinea: "destra", compatta: true, larghezza: "13%" },
      { intestazione: "Saldo avere", valore: (s) => (s.saldo < 0 ? euro(-s.saldo) : ""), allinea: "destra", compatta: true, larghezza: "13%" },
    ],
    righe: d.verifica.righe,
    totali: [
      { etichetta: "Totale dare / avere", valore: `${euro(d.verifica.totaleDare)} / ${euro(d.verifica.totaleAvere)}` },
      { etichetta: "Saldi dare / avere", valore: `${euro(d.verifica.saldiDare)} / ${euro(d.verifica.saldiAvere)}`, forte: true },
    ],
    vuoto: "Nessun conto movimentato.",
  });
}

export function htmlBilancioCee(d: { azienda: AziendaIntestazione; bilancio: BilancioCee; periodo: string }): string {
  const b = d.bilancio;
  const righe: Array<RigaCee & { parte: string }> = [
    { parte: "", codice: "SPA", etichetta: "STATO PATRIMONIALE — ATTIVO", valore: b.totaleAttivo, livello: "totale" },
    ...b.attivo.map((r) => ({ ...r, parte: "Attivo" })),
    { parte: "", codice: "SPP", etichetta: "STATO PATRIMONIALE — PASSIVO", valore: b.totalePassivo, livello: "totale" },
    ...b.passivo.map((r) => ({ ...r, parte: "Passivo" })),
    { parte: "", codice: "CE", etichetta: "CONTO ECONOMICO", valore: b.utile, livello: "totale" },
    ...b.contoEconomico.map((r) => ({ ...r, parte: "C.E." })),
  ];
  const differenza = Math.round((b.totaleAttivo - b.totalePassivo) * 100) / 100;
  return htmlDocumentoContabile<RigaCee & { parte: string }>({
    titolo: "Bilancio d'esercizio — schema CEE",
    periodo: d.periodo,
    sottotitolo: [
      "Stato patrimoniale (art. 2424 c.c.) e conto economico (art. 2425 c.c.) dalle scritture in partita doppia, in forma abbreviata.",
      differenza !== 0 ? `ATTENZIONE: attivo e passivo differiscono di ${euro(differenza)}.` : "",
      b.vociNonIndicate.length ? `Conti senza una voce CEE riconosciuta: ${b.vociNonIndicate.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
    azienda: d.azienda,
    colonne: [
      { intestazione: "Voce", valore: (r) => (r.livello === "voce" ? `\u00a0\u00a0\u00a0${r.etichetta}` : r.etichetta), larghezza: "78%" },
      { intestazione: "Importo", valore: (r) => euro(r.valore), allinea: "destra", compatta: true, larghezza: "22%" },
    ],
    righe,
    evidenzia: (r) => r.livello !== "voce",
    totali: [
      { etichetta: "Totale attivo", valore: euro(b.totaleAttivo) },
      { etichetta: "Totale passivo e netto", valore: euro(b.totalePassivo) },
      { etichetta: "Utile (perdita) dell'esercizio", valore: euro(b.utile), forte: true },
    ],
    vuoto: "Nessuna scrittura: il bilancio nasce dalla contabilità generale.",
  });
}

/**
 * Bilancio a sezioni contrapposte (11/11/2026): stato patrimoniale (attivo | passivo e netto) e
 * conto economico (costi | ricavi), conto per conto e raggruppati per mastro. È la lettura che fa lo
 * studio sul piano dei conti dell'azienda; lo schema CEE resta per il deposito.
 *
 * La sezione è quella del conto (sezioneDi); nel conto economico costi e ricavi si dividono per natura.
 * L'utile chiude le due parti: nel passivo come utile dell'esercizio, nei costi (se utile) o nei
 * ricavi (se perdita) come pareggio. Così ogni parte ha lo stesso totale dei due lati.
 */
export type ParteBilancio = "attivo" | "passivo" | "costi" | "ricavi";

export interface ContoInBilancio { codice: string; descrizione: string; importo: number }
export interface MastroInBilancio { codice: string; descrizione: string; totale: number; conti: ContoInBilancio[] }
export interface LatoBilancio { parte: ParteBilancio; mastri: MastroInBilancio[]; totale: number }

export interface BilancioSezioni {
  attivo: LatoBilancio;
  passivo: LatoBilancio;
  costi: LatoBilancio;
  ricavi: LatoBilancio;
  /** Ricavi meno costi; positivo = utile. */
  utile: number;
  /** Attivo meno (passivo + utile): zero se il piano dei conti è coerente. */
  differenzaPatrimoniale: number;
}

function parteDi(c: ContoContabile): ParteBilancio {
  const s = sezioneDi(c);
  if (s === "SPA") return "attivo";
  if (s === "SPP") return "passivo";
  return c.natura === "ricavo" ? "ricavi" : c.natura === "costo" ? "costi" : (c.voce_cee ?? "").startsWith("A") || c.voce_cee === "C.16" ? "ricavi" : "costi";
}

export function bilancioASezioni(saldi: readonly SaldoConto[], conti: readonly ContoContabile[]): BilancioSezioni {
  const perId = new Map(conti.map((c) => [c.id, c]));
  const lati: Record<ParteBilancio, Map<string, MastroInBilancio>> = { attivo: new Map(), passivo: new Map(), costi: new Map(), ricavi: new Map() };
  const centesimi: Record<ParteBilancio, number> = { attivo: 0, passivo: 0, costi: 0, ricavi: 0 };
  for (const s of saldi) {
    if (cent(s.saldo) === 0) continue;
    const parte = parteDi(s.conto);
    // Attivo e costi si leggono in dare, passivo e ricavi in avere.
    const importo = parte === "attivo" || parte === "costi" ? s.saldo : -s.saldo;
    const mastro = s.conto.mastro_id ? perId.get(s.conto.mastro_id) : undefined;
    const chiave = mastro?.id ?? "";
    const m = lati[parte].get(chiave) ?? { codice: mastro?.codice ?? "", descrizione: mastro?.descrizione ?? "Senza mastro", totale: 0, conti: [] };
    m.conti.push({ codice: s.conto.codice, descrizione: s.conto.descrizione, importo });
    m.totale = (cent(m.totale) + cent(importo)) / 100;
    lati[parte].set(chiave, m);
    centesimi[parte] += cent(importo);
  }
  const lato = (parte: ParteBilancio): LatoBilancio => ({
    parte,
    // I conti senza mastro in fondo.
    mastri: [...lati[parte].values()].sort((a, b) => (!a.codice ? 1 : 0) - (!b.codice ? 1 : 0) || a.codice.localeCompare(b.codice, "it", { numeric: true })),
    totale: centesimi[parte] / 100,
  });
  const utile = centesimi.ricavi - centesimi.costi;
  return {
    attivo: lato("attivo"),
    passivo: lato("passivo"),
    costi: lato("costi"),
    ricavi: lato("ricavi"),
    utile: utile / 100,
    differenzaPatrimoniale: (centesimi.attivo - centesimi.passivo - utile) / 100,
  };
}

export function htmlBilancioSezioni(d: { azienda: AziendaIntestazione; bilancio: BilancioSezioni; periodo: string }): string {
  const b = d.bilancio;
  type Riga = { testo: string; importo: string; forte: boolean };
  const righe: Riga[] = [];
  const titolo = (t: string, v: number) => righe.push({ testo: t, importo: euro(v), forte: true });
  const lato = (l: LatoBilancio) => {
    for (const m of l.mastri) {
      righe.push({ testo: `${m.codice ? `${m.codice} ` : ""}${m.descrizione}`, importo: euro(m.totale), forte: true });
      for (const c of m.conti) righe.push({ testo: `   ${c.codice} ${c.descrizione}`, importo: euro(c.importo), forte: false });
    }
  };
  const utile = b.utile >= 0 ? "Utile dell'esercizio" : "Perdita dell'esercizio";
  titolo("STATO PATRIMONIALE — ATTIVO", b.attivo.totale); lato(b.attivo);
  titolo("STATO PATRIMONIALE — PASSIVO E NETTO", b.passivo.totale + b.utile); lato(b.passivo);
  righe.push({ testo: utile, importo: euro(b.utile), forte: true });
  titolo("CONTO ECONOMICO — COSTI", b.costi.totale); lato(b.costi);
  titolo("CONTO ECONOMICO — RICAVI", b.ricavi.totale); lato(b.ricavi);
  righe.push({ testo: utile, importo: euro(b.utile), forte: true });
  return htmlDocumentoContabile<Riga>({
    titolo: "Bilancio a sezioni contrapposte",
    periodo: d.periodo,
    sottotitolo: [
      "Stato patrimoniale e conto economico dal piano dei conti, conto per conto e per mastro.",
      b.differenzaPatrimoniale !== 0 ? `ATTENZIONE: attivo e passivo più risultato differiscono di ${euro(b.differenzaPatrimoniale)}.` : "",
    ].filter(Boolean).join(" "),
    azienda: d.azienda,
    colonne: [
      { intestazione: "Conto", valore: (r) => r.testo, larghezza: "78%" },
      { intestazione: "Importo", valore: (r) => r.importo, allinea: "destra", compatta: true, larghezza: "22%" },
    ],
    righe,
    evidenzia: (r) => r.forte,
    totali: [
      { etichetta: "Totale attivo", valore: euro(b.attivo.totale) },
      { etichetta: "Totale passivo e netto", valore: euro(b.passivo.totale + b.utile) },
      { etichetta: utile, valore: euro(b.utile), forte: true },
    ],
    vuoto: "Nessuna scrittura: il bilancio nasce dalla contabilità generale.",
  });
}
