/**
 * SerramentiWizard — helpers
 * Estratto da SerramentiWizard.tsx (MP-MKT-001).
 *
 * Helper di formatting e validazione completezza step. Nessuna logica
 * fiscale/pricing — solo controllo presenza dati per UX (badge step
 * completato vs incompleto).
 */
import type {
  SrWizardStep, SrProgettoRow, SrProgettoDetail,
} from "@/lib/serramenti/api";

export const compactText = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(" ");

export const compactAddress = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(", ");

/**
 * Controlla se uno step del wizard ha i dati minimi compilati.
 * Usato solo per UI (badge "step completato" verde vs neutro), non per
 * blocco di avanzamento (che resta libero).
 */
export function isWizardStepComplete(
  step: SrWizardStep,
  form: Partial<SrProgettoRow>,
  detail?: SrProgettoDetail,
): boolean {
  switch (step) {
    case "cliente":
      return Boolean(form.cliente_id || form.cliente_nome || form.cliente_cognome);
    case "immobile":
      return Boolean(form.cantiere_indirizzo || form.cantiere_citta || form.tipo_intervento);
    case "esigenze":
      return Boolean((form.esigenze?.length ?? 0) > 0 || (form.soluzione?.length ?? 0) > 0);
    case "bom":
      return Boolean((detail?.serramenti.length ?? 0) > 0);
    case "accessori_foto":
      return Boolean((detail?.media.length ?? 0) > 0 || (detail?.accessori.length ?? 0) > 0);
    case "economia":
      return Boolean((form.totale_min ?? 0) > 0 || (form.totale_max ?? 0) > 0 || form.schema_pagamento);
    case "consulenza":
      return Boolean(form.consulenza_at || (form.prossimi_passi?.length ?? 0) > 0);
    case "pdf":
      return Boolean(form.pdf_url || form.pdf_generated_at);
    default:
      return false;
  }
}
