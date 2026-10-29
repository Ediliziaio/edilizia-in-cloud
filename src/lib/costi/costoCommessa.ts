/**
 * Costo registrato dalla commessa (Materiali e acquisti → Costi). Serve per i
 * costi che una fattura non l'avranno mai — la tassa del Comune, un bollo, un
 * F24 — e per quelli che la fattura la aspettano ancora. Finisce in
 * company_costs con order_id: v_ordine_marginalita lo conta come costo diretto,
 * con l'imponibile, come i costi registrati da Economia → Costi.
 */
import { calculateNetFromGross } from "@/lib/vatUtils";

/** «350», «350,50», «1.250,00»: come li scrive chi li legge su una ricevuta. */
export function leggiImporto(valore: string): number {
  const t = String(valore ?? "").trim();
  if (!t) return Number.NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

export interface FormCostoCommessa {
  descrizione: string;
  /** Quanto si è pagato o si pagherà, IVA compresa. */
  importo: string;
  aliquotaIva: string;
  data: string;
  faseId: string;
  senzaFattura: boolean;
  pagato: boolean;
  note: string;
}

export const formCostoVuoto = (oggi: string): FormCostoCommessa => ({
  descrizione: "",
  importo: "",
  // Il caso tipico (tasse, bolli, diritti) non ha IVA.
  aliquotaIva: "0",
  data: oggi,
  faseId: "",
  senzaFattura: true,
  pagato: true,
  note: "",
});

/** Riga per company_costs. Lancia con un messaggio in italiano se il modulo non va. */
export function rigaCostoCommessa(form: FormCostoCommessa, ids: { companyId: string; orderId: string }) {
  const descrizione = form.descrizione.trim();
  if (!descrizione) throw new Error("Scrivi che costo è (es. «Tassa comunale»).");
  const lordo = leggiImporto(form.importo);
  if (!Number.isFinite(lordo) || lordo <= 0) throw new Error("L'importo deve essere maggiore di zero.");
  const iva = leggiImporto(form.aliquotaIva);
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) throw new Error("Aliquota IVA non valida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) throw new Error("Scegli la data del costo.");
  const imponibile = Math.round(calculateNetFromGross(lordo, iva).netAmount * 100) / 100;
  return {
    company_id: ids.companyId,
    order_id: ids.orderId,
    name: descrizione,
    // Variabile e una tantum: è un costo di questa commessa, non un fisso che si ripete.
    cost_type: "variable",
    recurrence: "once",
    recurrence_auto: false,
    amount: imponibile,
    vat_rate: iva,
    due_date: form.data,
    is_paid: false,
    order_work_phase_id: form.faseId || null,
    senza_fattura: form.senzaFattura,
    notes: form.note.trim() || null,
    allocations: [] as Array<{ order_id: string; pct: number }>,
  };
}

/** Percorso della ricevuta nel bucket order-attachments: le policy lo riconoscono dal prefisso orders/<commessa>/. */
export function percorsoRicevuta(orderId: string, nomeFile: string, casuale: string): string {
  const pulito = nomeFile.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80) || "ricevuta";
  return `orders/${orderId}/costi/${casuale}-${pulito}`;
}

export const RICEVUTA_TIPI = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
export const RICEVUTA_MAX_BYTE = 10 * 1024 * 1024;

export function controllaRicevuta(file: { type: string; size: number }): string | null {
  if (!RICEVUTA_TIPI.includes(file.type)) return "La ricevuta deve essere un PDF o una foto (JPG, PNG, WEBP, HEIC).";
  if (file.size > RICEVUTA_MAX_BYTE) return "La ricevuta supera 10 MB.";
  return null;
}

export type DocumentoCosto = "fattura" | "senza_fattura" | "in_attesa";

/** Che documento ha il costo: la fattura collegata vince sul «senza fattura» segnato. */
export function documentoDelCosto(c: { senza_fattura: boolean | null }, haFattura: boolean): DocumentoCosto {
  if (haFattura) return "fattura";
  return c.senza_fattura ? "senza_fattura" : "in_attesa";
}
