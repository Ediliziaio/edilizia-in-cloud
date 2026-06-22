/**
 * TettiWizard — helpers.
 *
 * Stato-label del verticale + utilità di formatting e completezza step.
 * Nessuna logica fiscale/pricing: solo presenza dati per UX (badge step
 * completato vs incompleto). I calcoli economici stanno in
 * `@/lib/tetti/calcoli`.
 */
import type { TetProgetto, TetComputoVoce, TetStato } from "@/types/tetti";

export type TetWizardStepKey =
  | "cliente"
  | "immobile"
  | "computo"
  | "media"
  | "economia"
  | "pdf";

export interface TetWizardStepDef {
  key: TetWizardStepKey;
  label: string;
}

/** Sequenza degli step del wizard (ordine = rendering nello stepper). */
export const TET_WIZARD_STEPS: readonly TetWizardStepDef[] = [
  { key: "cliente", label: "Cliente" },
  { key: "immobile", label: "Dati copertura" },
  { key: "computo", label: "Computo" },
  { key: "media", label: "Foto" },
  { key: "economia", label: "Economia" },
  { key: "pdf", label: "PDF" },
];

/** Etichette + classi badge per ciascuno stato del progetto. */
export const TET_STATI_LABEL: Record<TetStato, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "border-slate-300 bg-slate-50 text-slate-700" },
  da_consegnare: { label: "Da consegnare", className: "border-blue-300 bg-blue-50 text-blue-700" },
  consegnato: { label: "Consegnato", className: "border-indigo-300 bg-indigo-50 text-indigo-700" },
  in_valutazione: { label: "In valutazione", className: "border-amber-300 bg-amber-50 text-amber-700" },
  accettato: { label: "Accettato", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  rifiutato: { label: "Rifiutato", className: "border-rose-300 bg-rose-50 text-rose-700" },
  scaduto: { label: "Scaduto", className: "border-rose-300 bg-rose-50 text-rose-700" },
  archiviato: { label: "Archiviato", className: "border-slate-300 bg-slate-100 text-slate-500" },
};

export const compactText = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(" ");

export const compactAddress = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(", ");

/**
 * Mappa di completezza degli step: dato il progetto + il computo corrente,
 * ritorna quali step hanno i dati minimi compilati. Usato per i badge "step
 * completato" (verde) — NON blocca l'avanzamento (che resta libero).
 */
export function stepCompletion(
  progetto: Partial<TetProgetto> | null | undefined,
  computo: TetComputoVoce[] | null | undefined,
): Record<TetWizardStepKey, boolean> {
  const p = progetto ?? {};
  const righe = computo ?? [];
  return {
    cliente: Boolean(p.cliente_id || p.cliente_nome || p.cliente_cognome),
    immobile: Boolean(
      p.cantiere_indirizzo || p.cantiere_citta || p.immobile_tipo || p.tipo_intervento,
    ),
    computo: righe.length > 0,
    media: false, // i media sono opzionali: completezza gestita nello StepMedia
    economia: Boolean(
      (p.totale_imponibile ?? 0) > 0 ||
        (p.sconto_pct ?? 0) > 0 ||
        (p.detrazione_pct ?? 0) > 0,
    ),
    pdf: false, // disponibile quando il computo non è vuoto (gestito nello StepPdf)
  };
}

/** Singolo step completo? Comodo per lo stepper. */
export function isStepComplete(
  step: TetWizardStepKey,
  progetto: Partial<TetProgetto> | null | undefined,
  computo: TetComputoVoce[] | null | undefined,
): boolean {
  return stepCompletion(progetto, computo)[step];
}
