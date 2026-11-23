/** Quale calendario mostrare nella voce unica «Calendario» (vedi CalendarioUnico). */
export type TipoCalendario = "lavori" | "commerciali";

export const CHIAVE_TIPO_CALENDARIO = "eic:calendario-tipo";

const valido = (v: string | null | undefined): v is TipoCalendario => v === "lavori" || v === "commerciali";

/**
 * Chi vede un solo calendario vede quello, qualunque cosa dica l'indirizzo. Chi li vede
 * entrambi: quello chiesto dall'indirizzo, poi l'ultimo scelto, poi i lavori.
 */
export function tipoCalendario({ vedeLavori, vedeCommerciale, richiesto, ricordato }: {
  vedeLavori: boolean;
  vedeCommerciale: boolean;
  richiesto?: string | null;
  ricordato?: string | null;
}): TipoCalendario {
  if (vedeCommerciale && !vedeLavori) return "commerciali";
  if (!vedeCommerciale) return "lavori";
  if (valido(richiesto)) return richiesto;
  if (valido(ricordato)) return ricordato;
  return "lavori";
}
