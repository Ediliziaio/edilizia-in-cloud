/**
 * Rif., misure, colori e aperture sui documenti al fornitore (fase 5 del piano articoli su misura).
 * Il testo lo scrive il database sulla riga dell'offerta o dell'ordine: qui si mette solo in pagina,
 * così tutti i documenti dicono la stessa cosa. Gli articoli normali non hanno testo e restano come sono.
 */
export function descrizioneConMisure(descrizione: string, misureTesto?: string | null, nota?: string | null): string {
  return [descrizione, misureTesto, nota].filter((v): v is string => !!v?.trim()).join("\n");
}

export interface MisuraAperta {
  order_item_id: string;
  riferimento: string | null;
  nome: string;
  stato: "da_rilevare" | "rilevato" | string;
}

/** Il database rifiuta il passaggio con questo codice: riga ancora da rilevare, nessun motivo scritto. */
export function eBloccoMisure(errore: unknown): boolean {
  return (errore as { code?: string } | null)?.code === "MIS01";
}

export function statoMisuraLeggibile(stato: string): string {
  return stato === "rilevato" ? "rilevate, da confermare" : "da rilevare";
}

/** Misure della riga di commessa, per chi legge il PDF della commessa. Vuoto per gli articoli normali. */
export function misureRigaCommessa(item: {
  riferimento?: string | null;
  measure_status?: string | null;
  gruppo_id?: string | null;
  misure_da_ordinare?: Record<string, unknown> | null;
  misure_rilevate?: Record<string, unknown> | null;
  misure_preventivo?: Record<string, unknown> | null;
}): string | null {
  if (!item.gruppo_id && !item.measure_status) return null;
  const [misure, fonte] = item.misure_da_ordinare
    ? [item.misure_da_ordinare, "definitive"]
    : item.misure_rilevate
      ? [item.misure_rilevate, "rilevate"]
      : [item.misure_preventivo, "provvisorie"];
  const v = (...chiavi: string[]) => chiavi.map((k) => misure?.[k]).find((x) => x != null && x !== "");
  const l = v("larghezza_mm", "larghezza");
  const h = v("altezza_mm", "altezza");
  const dimensioni = l != null && h != null ? `L ${l} × H ${h} mm (${fonte})` : null;
  return [item.riferimento ? `Rif. ${item.riferimento}` : null, dimensioni].filter(Boolean).join(" · ") || null;
}
