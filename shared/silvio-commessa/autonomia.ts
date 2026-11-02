/**
 * Cosa fa Silvio da solo sulle commesse (1/11/2026, fase 5, lotto 5.1). Vedi
 * docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
 *
 * Ogni azione ha tre livelli, scelti dal titolare per l'azienda:
 * - «vietata»: Silvio non la propone e le RPC la tolgono dalla scrittura, anche se un
 *   client la manda (il controllo vero sta nel database: `_silvio_scrittura_permessa`);
 * - «chiede»: la propone, e entra solo col «Va bene» (il comportamento delle fasi 1–4);
 * - «da_sola»: entra senza chiedere, ma resta visibile nel popup e si toglie con un tocco.
 *
 * Il predefinito è «chiede» per tutte le aziende: nessuna azione è promossa finché il
 * titolare non la sceglie. Alcune azioni non salgono oltre «chiede» (`massimo`): escono
 * verso terzi o hanno valore legale. Quelle che Silvio non fa mai (firma, fatture, pagamenti…)
 * sono in `SEMPRE_TU`: non hanno una scelta, e il database rifiuta qualunque livello per loro.
 *
 * Lo stesso catalogo è scritto in SQL in `_silvio_azioni_autonomia()` (migrazione
 * 20281112140000): il test silvioCommessaAutonomia controlla che siano uguali.
 *
 * Senza dipendenze, compatibile con Deno.
 */

export type LivelloAutonomia = "vietata" | "chiede" | "da_sola";
export const LIVELLI_AUTONOMIA: readonly LivelloAutonomia[] = ["vietata", "chiede", "da_sola"];

export interface AzioneSilvio {
  azione: string;
  etichetta: string;
  /** Cosa succede quando la fa, in una riga. */
  effetto: string;
  /** Il livello più alto che il titolare può scegliere. */
  massimo: "chiede" | "da_sola";
  /** Le variabili del registro che l'azione scrive (per il popup e la scrittura). */
  variabili: readonly string[];
  /** Ha una soglia in euro: «da sola» vale solo sotto la soglia. */
  soglia?: boolean;
}

export const AZIONI_SILVIO: readonly AzioneSilvio[] = [
  { azione: "squadra", etichetta: "Assegnare la squadra e il capomastro", massimo: "da_sola",
    effetto: "chi ha fatto più spesso fasi simili, libero in quelle date", variabili: ["persone.squadra", "persone.capomastro"] },
  { azione: "mezzi", etichetta: "Prenotare i mezzi interni", massimo: "da_sola",
    effetto: "i mezzi usati di solito in quelle fasi, se sono liberi", variabili: ["mezzi.allocazioni"] },
  { azione: "ordini", etichetta: "Preparare gli ordini ai fornitori, in bozza", massimo: "da_sola", soglia: true,
    effetto: "da solo solo gli ordini coi prezzi e sotto la soglia; nessuno parte verso il fornitore", variabili: ["materiali.acquisti"] },
  { azione: "promemoria", etichetta: "Promemoria e scadenze prima di partire", massimo: "da_sola",
    effetto: "POS, DUVRI, CILA o SCIA, notifica preliminare, cartello, suolo pubblico: attività e scadenze della commessa",
    variabili: ["sicurezza.pos_duvri", "sicurezza.adempimenti"] },
  { azione: "ditte", etichetta: "Assegnare le ditte alle fasi", massimo: "chiede",
    effetto: "la ditta riceve l'avviso in app: lo confermi tu", variabili: ["ditte.assegnate"] },
  { azione: "contratti_ditte", etichetta: "Preparare i contratti delle ditte, in bozza", massimo: "chiede",
    effetto: "la firma resta tua, dalla pagina della commessa", variabili: ["ditte.contratti"] },
  { azione: "avvio_cliente", etichetta: "Preparare il messaggio d'avvio al cliente", massimo: "chiede",
    effetto: "resta un testo in un'attività: lo mandi tu", variabili: ["comunicazione.avvio_cliente"] },
  { azione: "controllo_fase", etichetta: "Controllare persone, mezzi, materiali e DURC 3 giorni prima di ogni fase", massimo: "chiede",
    effetto: "arriva sulla commessa con l'azione pronta da confermare", variabili: [] },
  { azione: "proposta_sal", etichetta: "Proporre il SAL a fine fase", massimo: "chiede",
    effetto: "un SAL in bozza da controllare; l'emissione resta tua", variabili: [] },
];

/** Quello che Silvio non fa mai da solo: nessuna scelta, il database lo rifiuta. */
export const SEMPRE_TU: readonly { azione: string; etichetta: string }[] = [
  { azione: "firma_contratti", etichetta: "firma dei contratti" },
  { azione: "fatture_sdi", etichetta: "emissione delle fatture e invio allo SDI" },
  { azione: "pagamenti", etichetta: "pagamenti" },
  { azione: "importo_contratto", etichetta: "modifica dell'importo del contratto" },
  { azione: "cancellazioni", etichetta: "cancellazioni" },
  { azione: "fornitori_nuovi", etichetta: "dati a fornitori nuovi" },
];

/** La scelta di un'azienda per un'azione. */
export interface SceltaAutonomia {
  azione: string;
  livello: LivelloAutonomia;
  soglia_eur?: number | null;
}

/** Le scelte dell'azienda, per azione. Quello che manca vale «chiede». */
export type Autonomia = Readonly<Record<string, { livello: LivelloAutonomia; soglia_eur: number | null }>>;

export const AUTONOMIA_PREDEFINITA: Autonomia = {};

export function azioneSilvio(azione: string): AzioneSilvio | undefined {
  return AZIONI_SILVIO.find((a) => a.azione === azione);
}

/** L'azione che scrive quella variabile, o undefined. */
export function azioneDellaVariabile(chiave: string): AzioneSilvio | undefined {
  return AZIONI_SILVIO.find((a) => a.variabili.includes(chiave));
}

/** Il livello di un'azione: la scelta dell'azienda, mai oltre il massimo; «chiede» se non c'è. */
export function livelloDi(autonomia: Autonomia | null | undefined, azione: string): LivelloAutonomia {
  const def = azioneSilvio(azione);
  // Un'azione fuori catalogo (anche quelle di SEMPRE_TU) non sale mai oltre «chiede».
  if (!def) return "chiede";
  const scelto = autonomia?.[azione]?.livello;
  if (scelto === "vietata") return "vietata";
  if (scelto === "da_sola") return def.massimo === "da_sola" ? "da_sola" : "chiede";
  return "chiede";
}

/** La soglia in euro di un'azione con soglia, o null (senza soglia «da sola» non vale). */
export function sogliaDi(autonomia: Autonomia | null | undefined, azione: string): number | null {
  const s = autonomia?.[azione]?.soglia_eur;
  return typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : null;
}

/** Il livello della variabile: quello dell'azione che la scrive, «chiede» se nessuna. */
export function livelloDellaVariabile(autonomia: Autonomia | null | undefined, chiave: string): LivelloAutonomia {
  const a = azioneDellaVariabile(chiave);
  return a ? livelloDi(autonomia, a.azione) : "chiede";
}

/** Le righe lette dal database (`silvio_autonomia_leggi`) come mappa, ripulite. */
export function autonomiaDaRighe(righe: readonly SceltaAutonomia[] | null | undefined): Autonomia {
  const out: Record<string, { livello: LivelloAutonomia; soglia_eur: number | null }> = {};
  for (const r of righe ?? []) {
    const def = azioneSilvio(r?.azione);
    if (!def || !LIVELLI_AUTONOMIA.includes(r.livello)) continue;
    const livello = r.livello === "da_sola" && def.massimo !== "da_sola" ? "chiede" : r.livello;
    const soglia = Number(r.soglia_eur);
    out[def.azione] = { livello, soglia_eur: def.soglia && r.soglia_eur != null && Number.isFinite(soglia) && soglia >= 0 ? soglia : null };
  }
  return out;
}

/** Il totale di un ordine coi prezzi; null se anche una riga non ha il prezzo (0 non è un prezzo). */
export function totaleOrdine(righe: readonly { quantita?: number | null; prezzo?: number | null; iva?: number | null }[]): number | null {
  let tot = 0;
  for (const r of righe) {
    if (r?.prezzo == null || !Number.isFinite(Number(r.prezzo)) || Number(r.prezzo) <= 0) return null;
    const q = Number(r.quantita) > 0 ? Number(r.quantita) : 1;
    tot += q * Number(r.prezzo);
  }
  return Math.round(tot * 100) / 100;
}

/**
 * Un ordine in bozza entra da solo? Solo con l'azione «ordini» a «da_sola», una soglia, e un
 * totale (senza IVA) conosciuto e non sopra la soglia. Senza prezzi il totale non si sa: chiede.
 */
export function ordineDaSolo(autonomia: Autonomia | null | undefined, righe: Parameters<typeof totaleOrdine>[0]): boolean {
  if (livelloDi(autonomia, "ordini") !== "da_sola") return false;
  const soglia = sogliaDi(autonomia, "ordini");
  const tot = totaleOrdine(righe);
  return soglia != null && tot != null && tot <= soglia;
}
