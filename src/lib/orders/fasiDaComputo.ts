/**
 * Un computo o un preventivo diventa le fasi di una commessa che esiste già (14/11/2026).
 *
 * Ogni capitolo è una fase, ogni riga una sottofase con quantità, unità e importo: è quello che
 * i SAL leggono. Le righe arrivano da un file (Excel, PriMus, PDF…), da un computo del gestionale
 * o da un preventivo; qui si raggruppano e si dice quali fasi la commessa ha già. Le scrive la
 * funzione del database `commessa_importa_fasi`, che salta da sola le fasi già presenti.
 */
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";

export interface RigaDaImportare {
  capitolo: string;
  descrizione: string;
  unita: string;
  quantita: number;
  importo: number;
}

export interface FaseDaImportare {
  nome: string;
  voci: Array<Pick<RigaDaImportare, "descrizione" | "unita" | "quantita" | "importo">>;
  /** Somma degli importi delle righe: il venduto della fase. */
  importo: number;
  /** La commessa ha già una fase con questo nome: si salta. */
  presente: boolean;
}

export const MAX_FASI_IMPORT = 60;
export const CAPITOLO_SENZA_NOME = "Lavorazioni";

const normalizza = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
const tondo = (n: number) => Math.round(n * 100) / 100;

/** Le righe di un computo (file letto o computo del gestionale). Detrazioni e righe vuote restano fuori. */
export function righeDaVociComputo(voci: readonly VoceEditor[]): RigaDaImportare[] {
  const righe: RigaDaImportare[] = [];
  for (const v of voci) {
    if (v.detrazione || !v.descrizione.trim()) continue;
    const { quantita, importo } = calcolaVoce(v);
    righe.push({
      capitolo: (v.capitolo || "").trim() || CAPITOLO_SENZA_NOME,
      descrizione: v.descrizione.trim(),
      unita: (v.unita || "").trim(),
      quantita: Math.max(0, quantita ?? 0),
      importo: Math.max(0, importo ?? 0),
    });
  }
  return righe;
}

export interface RigaPreventivo {
  name: string | null;
  description: string | null;
  quantity: number | null;
  unit_of_measure: string | null;
  line_total: number | null;
  is_optional?: boolean | null;
  custom_field_values?: unknown;
}

/** Le righe di un preventivo: il capitolo se è nato da un computo, altrimenti il titolo del preventivo. */
export function righeDaPreventivo(righe: readonly RigaPreventivo[], titolo: string): RigaDaImportare[] {
  const fuori: RigaDaImportare[] = [];
  for (const r of righe) {
    if (r.is_optional) continue;
    const descrizione = (r.name || r.description || "").trim();
    if (!descrizione) continue;
    const cf = r.custom_field_values as { computo?: { capitolo?: unknown } } | null | undefined;
    const capitolo = typeof cf?.computo?.capitolo === "string" && cf.computo.capitolo.trim() ? cf.computo.capitolo.trim() : titolo;
    fuori.push({
      capitolo,
      descrizione,
      unita: (r.unit_of_measure || "").trim(),
      quantita: Math.max(0, Number(r.quantity) || 0),
      importo: Math.max(0, Number(r.line_total) || 0),
    });
  }
  return fuori;
}

/** Una fase per capitolo, nell'ordine in cui compaiono; segna quelle che la commessa ha già. */
export function fasiDaRighe(righe: readonly RigaDaImportare[], fasiEsistenti: readonly string[]): FaseDaImportare[] {
  const esistenti = new Set(fasiEsistenti.map(normalizza));
  const perNome = new Map<string, FaseDaImportare>();
  for (const r of righe) {
    const chiave = normalizza(r.capitolo);
    let f = perNome.get(chiave);
    if (!f) {
      f = { nome: r.capitolo.slice(0, 160), voci: [], importo: 0, presente: esistenti.has(chiave) };
      perNome.set(chiave, f);
    }
    f.voci.push({ descrizione: r.descrizione, unita: r.unita, quantita: r.quantita, importo: tondo(r.importo) });
    f.importo = tondo(f.importo + r.importo);
  }
  return [...perNome.values()];
}

/** Quello che parte verso il database: solo le fasi scelte e non già presenti. */
export function fasiPerIlDatabase(fasi: readonly FaseDaImportare[], scelte: ReadonlySet<string>) {
  return fasi
    .filter((f) => !f.presente && scelte.has(f.nome))
    .slice(0, MAX_FASI_IMPORT)
    .map((f) => ({ nome: f.nome, voci: f.voci }));
}
