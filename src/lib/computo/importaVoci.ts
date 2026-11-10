import { arrotondaDecimale, calcolaVoce, numeroEditor, type VoceEditor } from "./editorNativo";
import { bozzaDaComputoStrutturato, vociDaEstrazioneAi, type EsitoImportComputo } from "./importaComputo";
import type { ComputoStrutturato } from "./computoStrutturato";
import type { ComputoVoceEstratta, ComputoVoceLocal } from "@/types/computo";

/**
 * «Importa voci»: da qualsiasi file a un elenco di voci da rivedere.
 *
 * Ogni formato va al suo lettore. Quelli con una struttura (PriMus, Excel, CSV,
 * le tabelle di Word) si leggono nel browser, senza AI: le voci e gli importi
 * sono quelli scritti. Quelli senza struttura (scansioni, PDF qualsiasi, foto,
 * Word senza tabella) vanno all'estrazione sul server, che usa l'AI.
 */

export type Via = "browser" | "server";

export interface Instradamento {
  /** Come lo chiama una persona: «PriMus (XPWE)», «Excel», «Foto». */
  formato: string;
  /** Dove si legge. `browser` può ripiegare sul server (PDF non di PriMus, Word senza tabella). */
  via: Via | "no";
  /** Perché non si legge, quando `via` è `no`. */
  motivo?: string;
}

const estensione = (nome: string) => nome.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

export const ACCEPT_IMPORTA_VOCI = ".xpwe,.pwe,.xml,.dcf,.pdf,.xlsx,.xlsm,.xls,.csv,.tsv,.docx,.doc,.jpg,.jpeg,.png,.webp,.heic,.heif,.ods";

export const MAX_BYTE_IMPORT = 50 * 1024 * 1024;

export function instrada(file: Pick<File, "name" | "type" | "size">): Instradamento {
  const ext = estensione(file.name);
  const tipo = file.type.toLowerCase();
  if (file.size > MAX_BYTE_IMPORT) return { formato: "File", via: "no", motivo: "Il file supera i 50 MB." };
  if (file.size === 0) return { formato: "File", via: "no", motivo: "Il file è vuoto." };
  if (["xpwe", "pwe", "xml"].includes(ext)) return { formato: "PriMus (XPWE)", via: "browser" };
  if (ext === "dcf") return { formato: "PriMus (DCF)", via: "no", motivo: "Il file .dcf è il formato interno di PriMus e non si legge fuori da PriMus: aprilo in PriMus e scegli File › Esporta › XPWE, poi carica il file .xpwe." };
  if (["xlsx", "xlsm"].includes(ext)) return { formato: "Excel", via: "browser" };
  if (ext === "xls" || tipo === "application/vnd.ms-excel") return { formato: "Excel 97-2003", via: "server" };
  if (["csv", "tsv"].includes(ext) || tipo === "text/csv") return { formato: "CSV", via: "browser" };
  if (ext === "docx") return { formato: "Word", via: "browser" };
  if (ext === "doc") return { formato: "Word 97-2003", via: "no", motivo: "Il formato .doc è quello vecchio di Word: aprilo in Word e salvalo come .docx o come PDF." };
  if (ext === "ods") return { formato: "Foglio OpenOffice", via: "no", motivo: "Il foglio .ods non si legge: aprilo e salvalo come .xlsx." };
  if (ext === "pdf" || tipo === "application/pdf") return { formato: "PDF", via: "browser" };
  if (["heic", "heif"].includes(ext) || /heic|heif/.test(tipo)) return { formato: "Foto iPhone", via: "no", motivo: "Le foto HEIC dell'iPhone non si leggono: condividila come JPG (o fai uno screenshot) e ricaricala." };
  if (["jpg", "jpeg", "png", "webp"].includes(ext) || /^image\/(jpeg|png|webp)$/.test(tipo)) return { formato: "Foto", via: "server" };
  return { formato: ext ? ext.toUpperCase() : "File", via: "no", motivo: "Questo formato non si legge. Vanno bene PriMus (XPWE), PDF, Excel, CSV, Word (.docx) e foto JPG o PNG." };
}

// ── Le voci da rivedere ──────────────────────────────────────────────────────

export interface VoceImportata extends VoceEditor {
  /** Cosa controllare prima di aggiungerla. Vuoto: la voce è completa. */
  avvisi: string[];
  /** Il file da cui viene. */
  origine: string;
}

/** Fasi della lettura, sempre nello stesso ordine: quelle che si vedono nel popup. */
export const FASI = ["apro", "leggo", "riconosco", "pronte"] as const;
export type Fase = typeof FASI[number];

export const ETICHETTA_FASE: Record<Fase, string> = {
  apro: "Apro il file",
  leggo: "Leggo le righe",
  riconosco: "Riconosco le voci",
  pronte: "Voci pronte",
};

/** Quello che resta da controllare di una voce, in parole semplici. */
export function avvisiVoce(v: VoceEditor, extra: string[] = []): string[] {
  const avvisi: string[] = [];
  if (!v.descrizione.trim()) avvisi.push("Manca la descrizione");
  if (!v.unita.trim()) avvisi.push("Manca l'unità di misura");
  const { quantita } = calcolaVoce(v);
  if (quantita === null) avvisi.push("Manca la quantità");
  else if (quantita === 0) avvisi.push("Quantità a zero");
  const prezzo = numeroEditor(v.prezzo);
  if (prezzo === null) avvisi.push("Manca il prezzo");
  else if (prezzo === 0) avvisi.push("Prezzo a zero");
  return [...avvisi, ...extra.filter(a => !avvisi.includes(a))];
}

export const conAvvisi = (v: VoceEditor, origine: string, extra: string[] = []): VoceImportata =>
  ({ ...v, avvisi: avvisiVoce(v, extra), origine });

/** Le voci di un lettore deterministico (PriMus, XPWE, Excel, CSV, Word). */
export function daComputoStrutturato(c: ComputoStrutturato, origine: string): { esito: EsitoImportComputo; voci: VoceImportata[] } {
  const esito = bozzaDaComputoStrutturato(c);
  const diverse = new Set(esito.scostamenti.map(s => s.voce - 1));
  const voci = esito.voci.map((v, i) => conAvvisi(v, origine, diverse.has(i) ? ["Quantità diversa da quella scritta nel documento"] : []));
  return { esito, voci };
}

/** Sotto questa sicurezza l'estrazione AI segnala la voce come da controllare. */
const FIDUCIA_MINIMA = 0.7;

/** Le voci lette sul server: l'AI dà una sicurezza e dei suoi avvisi per ciascuna. */
export function daEstrazioneServer(estratte: ComputoVoceEstratta[], origine: string): { esito: EsitoImportComputo; voci: VoceImportata[] } {
  const editor = vociDaEstrazioneAi(estratte);
  const voci = editor.map((v, i) => {
    const e = estratte[i];
    const extra = [
      ...(e.confidence < FIDUCIA_MINIMA ? ["Lettura incerta: confronta col documento"] : []),
      ...(e.warnings ?? []).filter(Boolean).slice(0, 2),
    ];
    return conAvvisi(v, origine, extra);
  });
  return {
    esito: { voci: editor, intestazione: {}, totaleDocumento: null, totaleRicalcolato: totaleVoci(editor), scostamenti: [], descrizioniTroncate: 0, avvisi: [] },
    voci,
  };
}

export function totaleVoci(voci: VoceEditor[]): number {
  return arrotondaDecimale(voci.reduce((s, v) => s + (calcolaVoce(v).importo ?? 0), 0));
}

/** Dopo una correzione a mano gli avvisi si ricalcolano; quelli dell'AI e del documento restano finché la voce non si tocca. */
export function correggi(v: VoceImportata, patch: Partial<VoceEditor>): VoceImportata {
  const nuova = { ...v, ...patch };
  return { ...nuova, avvisi: avvisiVoce(nuova) };
}

// ── Verso i preventivatori ───────────────────────────────────────────────────

/**
 * Le voci per i preventivatori di settore (bagni, tetti…), che ricevono le
 * righe come quelle dell'estrazione AI: stesso `onConfirmVoci` di prima.
 */
export function versoVoceLocale(v: VoceImportata, ordine: number): ComputoVoceLocal {
  const { quantita, prezzo, importo } = calcolaVoce(v);
  const [breve, ...resto] = v.descrizione.split("\n");
  const q = quantita ?? 0;
  const p = prezzo ?? 0;
  return {
    id: v.id, computo_upload_id: "", company_id: "", capitolo_numero: null,
    capitolo_nome: v.capitolo || null, codice_voce: v.tariffa || null, codice_prezzario: v.tariffa || null,
    descrizione_breve: breve.trim(), descrizione_estesa: resto.join("\n").trim() || null,
    unita_misura: v.unita || null, quantita: q, prezzo_unitario_computo: p, importo_computo: importo ?? 0,
    prezzo_unitario_impresa: null, ricarico_percentuale: null, sconto_percentuale: 0, importo_impresa: null,
    confidence: v.avvisi.length ? 0.5 : 1, warnings: v.avvisi, ai_notes: null,
    is_included: true, is_modified: false, ordine, created_at: new Date().toISOString(),
    matched_template_id: null, matched_family_id: null, matched_tariffa_id: null, matched_name: null,
    match_type: null, match_confidence: null,
    _prezzoImpresa: p, _ricarico: 0, _importoImpresa: importo ?? 0, _isIncluded: true,
  };
}
