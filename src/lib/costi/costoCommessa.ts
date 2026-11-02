/**
 * Costo registrato dalla commessa (Fatture e costi → Altri costi). Serve per i
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

/** Di che tipo è il costo: decide in quale gruppo compare in Fatture e costi (commessa_quadro_pagamenti). */
export type TipoCosto = "altro" | "noleggio" | "professionista";
export const TIPI_COSTO: { value: TipoCosto; label: string; categoria: string | null }[] = [
  { value: "altro", label: "Altro", categoria: null },
  { value: "noleggio", label: "Noleggio e mezzi", categoria: "noleggio" },
  { value: "professionista", label: "Professionista", categoria: "consulenze_professionali" },
];

export const categoriaDelTipo = (tipo: TipoCosto) => TIPI_COSTO.find((t) => t.value === tipo)?.categoria ?? null;

/** Le stesse regole di commessa_quadro_pagamenti, per le categorie scritte in passato. */
export function tipoDellaCategoria(categoria: string | null | undefined): TipoCosto {
  const c = (categoria ?? "").toLowerCase();
  if (["consulenze_professionali", "progettazione", "direzione lavori"].includes(c)) return "professionista";
  return /nolegg|noli|nolo/.test(c) ? "noleggio" : "altro";
}

export interface FormCostoCommessa {
  descrizione: string;
  tipo: TipoCosto;
  /** Facoltativo: chi riceve il pagamento. */
  fornitoreId: string | null;
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
  tipo: "altro",
  fornitoreId: null,
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
    category: categoriaDelTipo(form.tipo),
    supplier_id: form.fornitoreId,
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

/** Il costo salvato rimesso nel modulo: l'importo torna con l'IVA, com'è scritto sulla ricevuta. */
export function formDaCosto(c: {
  name: string; category: string | null; supplier_id: string | null; amount: number; vat_rate: number | null;
  due_date: string; order_work_phase_id: string | null; senza_fattura: boolean; notes: string | null; is_paid: boolean;
}): FormCostoCommessa {
  const iva = Number(c.vat_rate ?? 0);
  const lordo = Math.round(Number(c.amount) * (1 + iva / 100) * 100) / 100;
  return {
    descrizione: c.name,
    tipo: tipoDellaCategoria(c.category),
    fornitoreId: c.supplier_id,
    importo: lordo.toFixed(2).replace(".", ","),
    aliquotaIva: String(iva),
    data: c.due_date,
    faseId: c.order_work_phase_id ?? "",
    senzaFattura: c.senza_fattura,
    pagato: c.is_paid,
    note: c.notes ?? "",
  };
}

/** I campi che una modifica può cambiare: ripartizioni, pagamento e ricorrenza restano dove sono. */
export function campiModificaCosto(form: FormCostoCommessa, ids: { companyId: string; orderId: string }) {
  const r = rigaCostoCommessa(form, ids);
  return {
    name: r.name, category: r.category, supplier_id: r.supplier_id, amount: r.amount, vat_rate: r.vat_rate,
    due_date: r.due_date, order_work_phase_id: r.order_work_phase_id, senza_fattura: r.senza_fattura, notes: r.notes,
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
