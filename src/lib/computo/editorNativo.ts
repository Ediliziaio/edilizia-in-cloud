import type { DatiFiscaliCliente } from "@/lib/preventivatore/datiFiscaliCliente";
import { z } from "zod";
import { valutaFormula } from "./computoStrutturato";
import { cronoprogrammaSchema } from "./cronoprogrammaSchema";
import { rataSchema } from "./pagamentiSchema";
import { revisioneSchema } from "./revisioniSchema";
import type { VoceComputo } from "./alberoComputo";

const testo = z.string().max(30000);
const misuraSchema = z.object({
  id: z.string(), descrizione: testo, parti: testo, lunghezza: testo, larghezza: testo,
  altezza: testo, formula: testo,
});
const voceSchema = z.object({
  id: z.string(), capitolo: testo, categoria: testo, sottocategoria: testo, tariffa: testo,
  descrizione: testo, unita: testo, quantita: testo, prezzo: testo,
  fonte: z.string().max(500).default(""),
  /** Costo unitario stimato dell'impresa: per i margini del passo Economia, mai nel PDF. */
  costo: z.string().max(40).default(""),
  /** Voce opzionale: si propone al cliente ma resta fuori dal totale (sezione a parte nel PDF). */
  opzionale: z.boolean().default(false),
  noteMisure: testo.default(""),
  descrizioneComune: testo.default(""),
  sicurezza: z.boolean(), detrazione: z.boolean(), corpo: z.boolean(),
  misure: z.array(misuraSchema).max(500),
});
const allegatoSchema = z.object({
  id: z.string().uuid(), nome: z.string().max(300), tipo: z.enum(["foto", "planimetria", "render"]),
  mime: z.enum(["image/jpeg", "image/png", "application/pdf"]), dimensione: z.number().int().positive().max(20 * 1024 * 1024),
  includi: z.boolean(),
});
export const bozzaComputoSchema = z.object({
  versione: z.literal(1), titolo: z.string().max(160), committente: z.string().max(160), oggetto: z.string().max(500),
  numero: z.string().max(80).default(""), indirizzo: z.string().max(300).default(""),
  // Il cliente come negli altri preventivi (29/10/2026): il contatto del CRM, i recapiti, il cointestatario e
  // l'indirizzo dei lavori in quattro campi. `indirizzo` resta il testo che va nel PDF, ricomposto dai quattro.
  clienteId: z.string().max(80).default(""), clienteEmail: z.string().max(200).default(""), clienteTelefono: z.string().max(60).default(""),
  // Privato o azienda (30/10/2026): un privato ha il codice fiscale, un'azienda partita IVA, PEC e codice destinatario.
  clienteTipo: z.enum(["privato", "azienda", "pa"]).default("privato"),
  clienteCodiceFiscale: z.string().max(20).default(""), clientePartitaIva: z.string().max(20).default(""),
  clientePec: z.string().max(200).default(""), clienteSdi: z.string().max(10).default(""),
  cointestatario_nome: z.string().max(120).default(""), cointestatario_cognome: z.string().max(120).default(""),
  cointestatario_codice_fiscale: z.string().max(40).default(""), cointestatario_email: z.string().max(200).default(""),
  cointestatario_telefono: z.string().max(60).default(""),
  cantiere_indirizzo: z.string().max(200).default(""), cantiere_citta: z.string().max(120).default(""),
  cantiere_cap: z.string().max(10).default(""), cantiere_provincia: z.string().max(10).default(""),
  condizioni: z.string().max(12000).default(""),
  dataDocumento: z.string().max(40).default(""), revisione: z.string().max(80).default(""),
  tecnico: z.string().max(300).default(""), riferimentoPrezzi: z.string().max(2000).default(""),
  inclusioni: z.string().max(6000).default(""), esclusioni: z.string().max(6000).default(""),
  tempi: z.string().max(3000).default(""), pagamenti: z.string().max(3000).default(""),
  ivaModalita: z.enum(["da-definire", "applicata", "non-applicabile"]).default("da-definire"),
  ivaAliquota: z.string().max(40).default("22"), ivaNota: z.string().max(1000).default(""),
  capitoli: z.array(z.string().trim().min(1).max(300)).max(200).default([]),
  mostraMisurePdf: z.boolean().default(true),
  allegati: z.array(allegatoSchema).max(20).default([]),
  formatoPdf: z.enum(["cliente", "tecnico", "senza-prezzi", "riepilogo", "elenco-prezzi"]).default("cliente"),
  mostraPrezziUnitariPdf: z.boolean().default(true), mostraImportiPdf: z.boolean().default(true),
  mostraCodiciPdf: z.boolean().default(true), mostraFontiPdf: z.boolean().default(true),
  mostraDatiCliente: z.boolean().default(true), mostraCondizioni: z.boolean().default(true),
  cronoprogramma: cronoprogrammaSchema.prefault({}), mostraCronoprogrammaPdf: z.boolean().default(true),
  pianoPagamenti: z.object({ rate: z.array(rataSchema).max(24).default([]) }).prefault({}),
  // Il passo Documento (29/10/2026, come Hausme): quali sezioni escono, quali capitoli, la detrazione fiscale
  // e le condizioni contrattuali del modello dell'azienda.
  sezioniPdf: z.object({
    copertina: z.boolean().default(true), premessa: z.boolean().default(true), indice: z.boolean().default(true),
    lavorazioni: z.boolean().default(true), riepilogo: z.boolean().default(true), cronoprogramma: z.boolean().default(true),
    pagamenti: z.boolean().default(true), detrazione: z.boolean().default(true), contrattuali: z.boolean().default(true), firme: z.boolean().default(true),
  }).prefault({}),
  capitoliEsclusiPdf: z.array(z.string().max(300)).max(200).default([]),
  detrazione: z.object({
    tipo: z.enum(["nessuna", "ristrutturazione-prima-casa", "ristrutturazione-altre", "ecobonus-prima-casa", "ecobonus-altre", "sismabonus-prima-casa", "sismabonus-altre", "personalizzata"]).default("nessuna"),
    percentuale: z.string().max(10).default(""), anni: z.number().int().min(1).max(20).default(10), nota: z.string().max(1000).default(""),
    /** Tetto della DETRAZIONE scritto a mano (es. ecobonus serramenti 60.000 €); vuoto = quello del tipo. */
    tetto: z.string().max(20).default(""),
  }).prefault({}),
  condizioniContrattuali: z.string().max(20000).default(""),
  /** La foto o il render del passo Progetto che apre la copertina (id dell'allegato), vuoto = nessuna. */
  fotoCopertina: z.string().max(80).default(""),
  /** Le revisioni salvate, per confrontare cosa è cambiato (le più recenti in fondo). */
  revisioni: z.array(revisioneSchema).max(20).default([]),
  sconto: z.object({ tipo: z.enum(["nessuno", "percentuale", "importo"]).default("nessuno"), valore: z.string().max(40).default(""), descrizione: z.string().max(120).default("") }).prefault({}),
  voci: z.array(voceSchema).max(5000),
}).superRefine((b, ctx) => {
  if (new Set(b.allegati.map(a => a.id)).size !== b.allegati.length) ctx.addIssue({ code: "custom", message: "Identificativo allegato duplicato." });
  const ids = new Set<string>();
  for (const v of b.voci) {
    if (ids.has(v.id)) ctx.addIssue({ code: "custom", message: "Identificativo lavorazione duplicato." });
    ids.add(v.id);
    const misure = new Set<string>();
    for (const m of v.misure) {
      if (misure.has(m.id)) ctx.addIssue({ code: "custom", message: "Identificativo misura duplicato." });
      misure.add(m.id);
    }
  }
});
export type BozzaComputo = z.infer<typeof bozzaComputoSchema>;
export type VoceEditor = BozzaComputo["voci"][number];
export type MisuraEditor = VoceEditor["misure"][number];
export type AllegatoComputo = z.infer<typeof allegatoSchema>;
export const bozzaVuota = (): BozzaComputo => bozzaComputoSchema.parse({ versione: 1, titolo: "Nuovo computo metrico", committente: "", oggetto: "", mostraMisurePdf: false, mostraCodiciPdf: false, mostraFontiPdf: false, voci: [] });
export const misuraVuota = (): MisuraEditor => ({ id: crypto.randomUUID(), descrizione: "", parti: "", lunghezza: "", larghezza: "", altezza: "", formula: "" });
export const voceVuota = (): VoceEditor => voceSchema.parse({
  id: crypto.randomUUID(), capitolo: "Opere edili", categoria: "", sottocategoria: "", tariffa: "", descrizione: "",
  unita: "mq", quantita: "", prezzo: "", sicurezza: false, detrazione: false, corpo: false, misure: [],
});

/** Input dell'editor: virgola italiana o punto decimale, mai separatori ambigui. */
export function numeroEditor(s: string): number | null {
  const value = s.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value)) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}

/**
 * Arrotondamento commerciale in decimale: la metà va lontano dallo zero.
 *
 * `arrotonda` aggiunge solo `Number.EPSILON`, che basta vicino a 1 ma non
 * oltre: 15,45 × 4,7 in binario è 72,6149999…, e moltiplicato per 100 torna
 * 7261,4999…, quindi diventerebbe 72,61 dove PriMus stampa 72,62. Il numero
 * va ripulito DOPO la moltiplicazione.
 */
export function arrotondaDecimale(n: number, decimali = 2): number {
  const f = 10 ** decimali;
  const scalato = Number((Math.abs(n) * f).toPrecision(15));
  return (Math.sign(n) * Math.round(scalato)) / f;
}

/**
 * Quantità di una riga di misura, arrotondata a 2 decimali come in PriMus.
 *
 * PriMus arrotonda ogni riga prima di sommarla, e la quantità della voce è la
 * somma delle righe arrotondate: così le righe stampate sommano esattamente
 * al totale stampato. Senza, un computo importato da PriMus non tornava al
 * centesimo con quello del progettista (Genzano, 29/10/2026: 13 voci su 226).
 */
export function quantitaMisura(m: MisuraEditor): number | null {
  if (m.formula.trim()) {
    if (m.formula.length > 500) return null;
    const n = valutaFormula(m.formula);
    return n === null || Math.abs(n) > 1e12 ? null : arrotondaDecimale(n);
  }
  const campi = [m.parti, m.lunghezza, m.larghezza, m.altezza].filter(s => s.trim());
  if (!campi.length) return null;
  const numeri = campi.map(numeroEditor);
  if (numeri.some(n => n === null)) return null;
  const q = numeri.reduce<number>((a, n) => a * n!, 1);
  return Number.isFinite(q) && Math.abs(q) <= 1e12 ? arrotondaDecimale(q) : null;
}

/** Con l'unità «%» il prezzo è una percentuale della quantità, che è un importo (sovrapprezzi, oneri). */
export const ePercentuale = (unita: string) => unita.trim() === "%";

export function calcolaVoce(v: VoceEditor, senzaPrezzi = false) {
  const errori: string[] = [];
  if (!v.descrizione.trim()) errori.push("Inserisci la descrizione.");
  if (!v.unita.trim()) errori.push("Inserisci l'unità di misura.");
  const misure = v.misure.map(quantitaMisura);
  const q = v.misure.length ? (misure.some(n => n === null) ? null : arrotondaDecimale(misure.reduce<number>((s, n) => s + n!, 0))) : numeroEditor(v.quantita);
  if (q === null) errori.push("Completa quantità o misure con numeri validi.");
  if (q !== null && Math.abs(q) > 1e12) errori.push("Quantità fuori limite.");
  const prezzo = numeroEditor(v.prezzo);
  if (!senzaPrezzi && (prezzo === null || prezzo < 0)) errori.push("Inserisci un prezzo unitario valido, anche zero.");
  const quantita = q === null ? null : v.detrazione ? -Math.abs(q) : q;
  // Fino al 29/10/2026 la «Percentuale» del selettore delle unità moltiplicava
  // senza dividere per 100: l'importo usciva cento volte troppo grande.
  const importo = quantita === null || prezzo === null || prezzo < 0 ? null
    : arrotondaDecimale((quantita * prezzo) / (ePercentuale(v.unita) ? 100 : 1));
  if (importo !== null && (!Number.isFinite(importo) || Math.abs(importo) > 1e12)) errori.push("Importo fuori limite.");
  return { quantita, prezzo, importo, errori, misure };
}

export function vociDaBozza(bozza: BozzaComputo, senzaPrezzi = false): VoceComputo[] {
  bozzaComputoSchema.parse(bozza);
  if (!bozza.titolo.trim()) throw new Error("Inserisci il titolo del computo.");
  if (!bozza.voci.length) throw new Error("Aggiungi almeno una lavorazione.");
  return bozza.voci.map((v, i) => voceDocumento(v, i, senzaPrezzi, false));
}

function voceDocumento(v: VoceEditor, i: number, senzaPrezzi: boolean, parziale: boolean): VoceComputo {
    const c = calcolaVoce(v, senzaPrezzi);
    if (!parziale && c.errori.length) throw new Error(`Voce ${i + 1}: ${c.errori.join(" ")}`);
    // La detrazione cambia il segno dell'intera voce, comprese le misure.
    const somma = c.misure.reduce<number>((s, n) => s + n!, 0);
    const segno = v.detrazione && somma > 0 ? -1 : 1;
    return {
      id: v.id, ordine: i + 1, numero_ordine: String(i + 1), codice_voce: null,
      codice_tariffa: v.tariffa.trim() || null, codice_prezzario: null,
      descrizione_breve: v.descrizione.trim() || "Lavorazione da completare", descrizione_estesa: v.descrizione.trim() || "Lavorazione da completare",
      unita_misura: v.unita.trim(), quantita: c.quantita, prezzo_unitario_computo: c.prezzo !== null && c.prezzo >= 0 ? c.prezzo : null, importo_computo: c.errori.length ? null : c.importo,
      super_categoria: v.capitolo.trim() || null, categoria: v.categoria.trim() || null, sotto_categoria: v.sottocategoria.trim() || null,
      is_sicurezza: v.sicurezza, is_detrazione: v.detrazione, a_corpo: v.corpo, warnings: [],
      fonte_prezzo: v.fonte || null,
      note_misure: v.noteMisure || null,
      descrizione_comune: v.descrizioneComune || null,
      misure: v.misure.map((m, j) => ({
        id: m.id, ordine: j + 1, descrizione: m.descrizione, parti_uguali: m.formula.trim() ? null : numeroEditor(m.parti),
        lunghezza: m.formula.trim() ? null : numeroEditor(m.lunghezza), larghezza: m.formula.trim() ? null : numeroEditor(m.larghezza),
        altezza_peso: m.formula.trim() ? null : numeroEditor(m.altezza), quantita: c.misure[j] === null ? null : c.misure[j]! * segno,
        formula: m.formula.trim() ? `${segno < 0 ? "-(" : ""}${m.formula.trim()}${segno < 0 ? ")" : ""}` : null,
        ...(segno < 0 && !m.formula.trim() ? { parti_uguali: -(numeroEditor(m.parti) ?? 1) } : {}),
      })),
    };
}

export function vociPerAnteprima(bozza: BozzaComputo, senzaPrezzi = false) {
  return { voci: bozza.voci.map((v, i) => voceDocumento(v, i, senzaPrezzi, true)), incomplete: bozza.voci.filter(v => calcolaVoce(v, senzaPrezzi).errori.length).length };
}

export const chiaveBozzaComputo = (company: string, user: string, order: string) =>
  `computo-nativo:v1:${encodeURIComponent(company)}:${encodeURIComponent(user)}:${encodeURIComponent(order)}`;

/** I dati fiscali del cliente della bozza, nella forma comune a tutti i preventivi. */
export const datiFiscaliBozza = (b: BozzaComputo): DatiFiscaliCliente => ({ tipo: b.clienteTipo ?? "privato", codiceFiscale: b.clienteCodiceFiscale,
  partitaIva: b.clientePartitaIva, pec: b.clientePec, codiceSdi: b.clienteSdi });

export function leggiBozzaComputo(raw: string): BozzaComputo {
  return bozzaComputoSchema.parse(JSON.parse(raw));
}

export function elencaComputiPreventivo(storage: Pick<Storage, "length" | "key" | "getItem">, company: string, user: string) {
  const prefix = chiaveBozzaComputo(company, user, "preventivo:");
  const out: Array<{ id: string; bozza: BozzaComputo }> = [];
  for (let n = 0; n < storage.length; n++) {
    const key = storage.key(n); if (!key?.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    try { const raw = storage.getItem(key); if (raw) out.push({ id, bozza: leggiBozzaComputo(raw) }); }
    catch { /* Una bozza danneggiata non nasconde le altre e non viene cancellata. */ }
  }
  return out.sort((a, b) => a.bozza.titolo.localeCompare(b.bozza.titolo, "it"));
}

export class ConflittoBozzaComputo extends Error {}

export function salvaBozzaComputo(storage: Pick<Storage, "getItem" | "setItem">, key: string, bozza: BozzaComputo, precedente: string | null) {
  if (storage.getItem(key) !== precedente) throw new ConflittoBozzaComputo("Bozza modificata in un'altra scheda. Ricarica la versione salvata prima di continuare.");
  const raw = JSON.stringify(bozzaComputoSchema.parse(bozza));
  storage.setItem(key, raw);
  return raw;
}
