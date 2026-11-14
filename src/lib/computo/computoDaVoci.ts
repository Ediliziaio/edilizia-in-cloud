/**
 * Le voci lette e rivedute in «Importa voci» diventano il computo della
 * commessa (14/11/2026, «Genera dal computo» dei materiali).
 *
 * Fino ad allora i Materiali avevano una finestra loro che caricava il file e
 * lo faceva leggere sempre al server. Ora la lettura è quella di «Importa
 * voci» (PriMus, Excel, CSV, Word nel browser; scansioni e PDF qualsiasi con
 * l'AI) e qui si preparano le righe per `computo_uploads`,
 * `computo_voci_estratte` e `computo_voci_misure`: così il computo resta
 * quello della commessa, per «Apri il computo», i SAL dei lavori pubblici e
 * la contabilità.
 *
 * L'impronta dice se lo stesso computo è già stato caricato nella commessa:
 * al secondo import dello stesso file si riusa quello, senza doppioni.
 */
import { calcolaVoce, numeroEditor, quantitaMisura } from "./editorNativo";
import type { VoceImportata } from "./importaVoci";

export interface FileOrigine { nome: string; formato: string; via: "browser" | "server"; dimensione: number }

/** Valori ammessi dai CHECK di computo_uploads. */
export type TipoFileComputo = "pdf" | "xlsx" | "xls" | "xpwe" | "image";
export type MetodoLettura = "pdf_text" | "pdf_vision" | "xlsx_parse" | "xpwe_parse";

export function tipoFileComputo(nome: string): TipoFileComputo {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (["xpwe", "pwe", "xml"].includes(ext)) return "xpwe";
  if (ext === "xls") return "xls";
  if (["xlsx", "xlsm", "csv", "tsv"].includes(ext)) return "xlsx";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  return "pdf";
}

/**
 * Il tipo con cui il file originale va nel bucket `computi`, che accetta solo PDF,
 * Excel, XML e foto JPG/PNG (14/11/2026: un CSV dava «mime type text/csv is not
 * supported» e il computo non si salvava). Per gli altri formati (CSV, Word, WebP)
 * si salvano le voci senza archiviare il file: il computo sono le voci.
 */
export function tipoArchivio(nome: string): string | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  const tipi: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    xml: "application/xml", xpwe: "application/xml", pwe: "application/xml",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  };
  return tipi[ext] ?? null;
}

export function metodoLettura(f: Pick<FileOrigine, "nome" | "via">): MetodoLettura {
  if (f.via === "server") return "pdf_vision";
  const t = tipoFileComputo(f.nome);
  if (t === "xpwe") return "xpwe_parse";
  if (t === "pdf") return "pdf_text";
  return "xlsx_parse";
}

/** Hash FNV-1a a 32 bit, due semi: basta a riconoscere lo stesso elenco di voci. */
function fnv(testo: string, seme: number): string {
  let h = seme >>> 0;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const pulito = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Impronta delle voci: codice, descrizione, unità, quantità e prezzo, nell'ordine. */
export function improntaVoci(voci: VoceImportata[]): string {
  const testo = voci.map(v => {
    const { quantita, prezzo } = calcolaVoce(v);
    return [pulito(v.tariffa), pulito(v.descrizione), pulito(v.unita), quantita ?? "", prezzo ?? ""].join("¦");
  }).join("\n");
  return `v1-${voci.length}-${fnv(testo, 0x811c9dc5)}${fnv(testo, 0x01234567)}`;
}

const numeroONull = (s: string) => {
  const n = numeroEditor(s);
  return n === null || !Number.isFinite(n) ? null : n;
};

export interface RigaVoce {
  ordine: number;
  numero_ordine: string;
  codice_voce: string | null;
  codice_tariffa: string | null;
  codice_prezzario: string | null;
  descrizione_breve: string;
  descrizione_estesa: string | null;
  unita_misura: string | null;
  quantita: number | null;
  prezzo_unitario_computo: number | null;
  importo_computo: number | null;
  capitolo_nome: string | null;
  super_categoria: string | null;
  categoria: string | null;
  sotto_categoria: string | null;
  is_sicurezza: boolean;
  is_detrazione: boolean;
  a_corpo: boolean;
  is_included: boolean;
  warnings: string[];
  confidence: number;
}

export interface RigaMisura {
  ordine: number;
  descrizione: string | null;
  parti_uguali: number | null;
  lunghezza: number | null;
  larghezza: number | null;
  altezza_peso: number | null;
  quantita: number | null;
  formula: string | null;
}

/** Una voce dell'editor come riga del computo della commessa (senza id, computo e azienda). */
export function rigaDaVoce(v: VoceImportata, i: number): { voce: RigaVoce; misure: RigaMisura[] } {
  const { quantita, prezzo, importo } = calcolaVoce(v);
  const [breve, ...resto] = v.descrizione.split("\n");
  const codice = v.tariffa.trim() || null;
  const estesa = [resto.join("\n").trim(), v.descrizioneComune?.trim()].filter(Boolean).join("\n") || null;
  return {
    voce: {
      ordine: i,
      numero_ordine: String(i + 1),
      codice_voce: codice,
      codice_tariffa: codice,
      codice_prezzario: codice,
      descrizione_breve: (breve.trim() || v.descrizione.trim() || "Voce senza descrizione").slice(0, 2000),
      descrizione_estesa: estesa,
      unita_misura: v.unita.trim() || null,
      quantita: quantita === null ? null : Math.abs(quantita),
      prezzo_unitario_computo: prezzo,
      importo_computo: importo === null ? null : Math.abs(importo),
      capitolo_nome: v.capitolo.trim() || null,
      super_categoria: v.capitolo.trim() || null,
      categoria: v.categoria.trim() || null,
      sotto_categoria: v.sottocategoria.trim() || null,
      is_sicurezza: !!v.sicurezza,
      is_detrazione: !!v.detrazione,
      a_corpo: !!v.corpo,
      is_included: true,
      warnings: v.avvisi.slice(0, 5),
      confidence: v.avvisi.length ? 0.6 : 1,
    },
    misure: v.misure.map((m, j) => ({
      ordine: j,
      descrizione: m.descrizione.trim() || null,
      parti_uguali: numeroONull(m.parti),
      lunghezza: numeroONull(m.lunghezza),
      larghezza: numeroONull(m.larghezza),
      altezza_peso: numeroONull(m.altezza),
      quantita: quantitaMisura(m),
      formula: m.formula.trim() || null,
    })),
  };
}

/** Il titolo proposto: il nome del file senza estensione, o «Computo da N file». */
export function titoloComputo(file: Pick<FileOrigine, "nome">[]): string {
  if (file.length === 1) return file[0].nome.replace(/\.[^.]+$/, "").slice(0, 160);
  return `Computo da ${file.length} file`;
}
