/**
 * Stato dei materiali di una fase e cosa può fare chi. Stesse regole di
 * materiali_fase_cambia_stato() e dei trigger del database: qui servono a
 * mostrare i pulsanti giusti (il database decide comunque).
 */

/** null = la fase non usa la validazione (funziona come prima). */
export type StatoMaterialiFase = "bozza" | "da_validare" | "validata";
export type AzioneFase = "invia_validazione" | "valida" | "rimanda";

export interface PermessiMateriali {
  /** Modifica le commesse (prepara i materiali). */
  canEditOrders: boolean;
  /** Valida i materiali (il tecnico). */
  canValidateBom: boolean;
  /** Ufficio acquisti. */
  canManagePurchasing: boolean;
}

export const ETICHETTA_STATO_FASE: Record<StatoMaterialiFase, string> = {
  bozza: "In preparazione",
  da_validare: "Dal tecnico",
  validata: "Validati",
};

export const ETICHETTA_AZIONE_FASE: Record<AzioneFase, string> = {
  invia_validazione: "Invia al tecnico",
  valida: "Valida i materiali della fase",
  rimanda: "Rimanda indietro con nota",
};

export function azioniFase(
  stato: StatoMaterialiFase | null,
  p: PermessiMateriali,
  materiali: { totale: number; senzaQuantita: number; inAcquisto: number },
): AzioneFase[] {
  const s = stato ?? "bozza";
  const out: AzioneFase[] = [];
  if (s === "bozza" && (p.canEditOrders || p.canValidateBom) && materiali.totale > 0) out.push("invia_validazione");
  if (s === "da_validare" && p.canValidateBom) {
    if (materiali.senzaQuantita === 0) out.push("valida");
    out.push("rimanda");
  }
  if (s === "validata" && p.canValidateBom && materiali.inAcquisto === 0) out.push("rimanda");
  return out;
}

/** Chi cambia nome, quantità, unità e specifiche dei materiali della fase. */
export function puoModificareMateriali(stato: StatoMaterialiFase | null, p: PermessiMateriali): boolean {
  if (!stato || stato === "bozza") return p.canEditOrders;
  if (stato === "da_validare") return p.canValidateBom;
  return false;
}

/**
 * Si può comprare (offerta, ordine) quando la fase è validata, o quando la
 * fase non usa la validazione: le commesse di prima continuano come prima.
 */
export function acquistabile(stato: StatoMaterialiFase | null): boolean {
  return stato === null || stato === "validata";
}

export function spiegazioneFase(stato: StatoMaterialiFase | null, p: PermessiMateriali): string | null {
  if (stato === "bozza") {
    return p.canEditOrders ? "Controlla quantità e specifiche, poi invia al tecnico." : "Materiali in preparazione.";
  }
  if (stato === "da_validare") {
    return p.canValidateBom
      ? "Verifica le righe: correggi le quantità, valida o rimanda indietro con una nota."
      : "In verifica dal tecnico: per ora non si ordina.";
  }
  if (stato === "validata") return "Validati dal tecnico: l'ufficio acquisti li vede in Commesse › Acquisti, colonna «Da ordinare».";
  return null;
}
