/**
 * Le frasi della variazione sotto le schede dei report (venditori, call
 * center): punti per i tassi, percentuale per gli importi e i conteggi.
 */
export type VariazioneKpi = { testo: string; buona: boolean | null } | null;

/** Differenza in punti percentuali tra due tassi. */
export function variazionePunti(ora: number | null | undefined, prima: number | null | undefined, meglioSeMinore = false): VariazioneKpi {
  if (ora == null || prima == null) return null;
  const d = Math.round((ora - prima) * 10) / 10;
  if (d === 0) return { testo: "= periodo precedente", buona: null };
  return { testo: `${d > 0 ? "▲ +" : "▼ "}${d.toLocaleString("it-IT")} pt vs periodo precedente`, buona: meglioSeMinore ? d < 0 : d > 0 };
}

/** Variazione percentuale di un importo o di un conteggio; meglioSeMinore per tempi e attese. */
export function variazionePercento(ora: number | null | undefined, prima: number | null | undefined, meglioSeMinore = false): VariazioneKpi {
  if (ora == null || prima == null) return null;
  if (prima === 0) return ora > 0 ? { testo: "nuovo rispetto al periodo precedente", buona: !meglioSeMinore } : null;
  const d = Math.round(((ora - prima) / prima) * 100);
  if (d === 0) return { testo: "= periodo precedente", buona: null };
  return { testo: `${d > 0 ? "▲ +" : "▼ "}${d}% vs periodo precedente`, buona: meglioSeMinore ? d < 0 : d > 0 };
}
