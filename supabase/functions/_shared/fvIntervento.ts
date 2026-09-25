/** Pure semantics shared by the local intervention editor and the original FV PDF. */
export function isFvAccumulo(template: { pdf_blocchi?: Record<string, unknown> | null } | null | undefined): boolean {
  return template?.pdf_blocchi?.modulo_intervento === "accumulo";
}

export function isFvLocalIntervention(template: { pdf_blocchi?: Record<string, unknown> | null } | null | undefined): boolean {
  return ["accumulo", "nuovo", "ampliamento", "componenti", "manutenzione"].includes(String(template?.pdf_blocchi?.modulo_intervento ?? ""));
}
export function fvInterventionLabel(template: { pdf_blocchi?: Record<string, unknown> | null } | null | undefined): string {
  const labels: Record<string, string> = { accumulo: "Aggiunta sistema di accumulo", nuovo: "Nuovo impianto fotovoltaico", ampliamento: "Ampliamento fotovoltaico", componenti: "Sostituzione componenti", manutenzione: "Manutenzione fotovoltaico" };
  return labels[String(template?.pdf_blocchi?.modulo_intervento ?? "")] ?? "Impianto fotovoltaico";
}

/** Whole-plant scenarios are not the incremental result of adding a battery. */
export const FV_ACCUMULO_PAGINE_NON_APPLICABILI = new Set([
  "anteprima", "produzione", "flussi", "risparmio", "costi_futuri", "cassa_25", "co2", "bollette_240", "piano_pagamento",
]);

export const FV_ACCUMULO_LABELS: Record<string, { label: string; descrizione: string }> = {
  iter: { label: "Percorso dell'integrazione", descrizione: "Verifica dell'impianto esistente, configurazione, installazione e consegna." },
  come_funziona: { label: "Come funziona l'accumulo", descrizione: "Compatibilità, capacità, gestione e limiti dell'integrazione." },
  protezione: { label: "Preparazione degli spazi", descrizione: "Locale, accessi e precauzioni per il sistema di accumulo." },
  diario: { label: "Foto dell'integrazione", descrizione: "Stato iniziale, collocazione, collegamenti e sistema completato." },
};
