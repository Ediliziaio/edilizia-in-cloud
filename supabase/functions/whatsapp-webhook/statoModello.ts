/**
 * Lo stato di un modello WhatsApp dopo un avviso di Meta
 * (`message_template_status_update`, 24/09/2026).
 *
 * Meta avvisa quando approva, rifiuta, mette in pausa o disattiva un modello.
 * Lo stato va scritto in `wa_meta_templates`, che automazioni, broadcast e
 * chat leggono per sapere quali modelli si possono usare: prima l'avviso
 * finiva solo nel registro e il modello restava «in attesa» fino alla
 * sincronizzazione (ogni 6 ore).
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

/** Lo stato da scrivere, o null se l'avviso non cambia lo stato. */
export function statoDopoAvvisoMeta(evento: unknown): string | null {
  const e = typeof evento === "string" ? evento.trim().toUpperCase() : "";
  if (!e) return null;
  // Riattivato dopo una pausa: si può usare di nuovo.
  if (e === "REINSTATED") return "APPROVED";
  // Segnalato per la qualità: resta usabile finché Meta non lo mette in pausa
  // (in quel caso arriva un avviso PAUSED).
  if (e === "FLAGGED") return null;
  return e;
}

/** «it_IT» e «it» sono la stessa lingua per l'elenco dei modelli. */
export function lingueDelModello(lingua: unknown): string[] {
  const l = typeof lingua === "string" ? lingua.trim() : "";
  if (!l) return [];
  const base = l.split("_")[0];
  return base === l ? [l] : [l, base];
}
