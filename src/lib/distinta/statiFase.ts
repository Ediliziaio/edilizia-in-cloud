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
  if (stato === "validata") return "Validati dal tecnico: l'ufficio acquisti li vede in «Acquisti da fare».";
  return null;
}

// ─── Pillola della validazione e pulsante principale della fase ────────────

export type PillolaValidazione = "bozza" | "da_validare" | "validata" | "rimandata";

export const ETICHETTA_PILLOLA: Record<PillolaValidazione, string> = {
  bozza: "Bozza",
  da_validare: "Da validare",
  validata: "Validata",
  rimandata: "Rimandata",
};

/** null = la fase non usa la validazione: nessuna pillola. */
export function pillolaValidazione(v: { stato: StatoMaterialiFase; note_validazione?: string | null } | null): PillolaValidazione | null {
  if (!v) return null;
  if (v.stato === "bozza" && v.note_validazione?.trim()) return "rimandata";
  return v.stato;
}

/** «ordina» seleziona i materiali da ordinare della fase: poi si crea l'ordine o si chiede l'offerta. */
export type AzionePrincipale = AzioneFase | "ordina";

export const ETICHETTA_AZIONE_PRINCIPALE: Record<AzionePrincipale, string> = {
  invia_validazione: "Invia al tecnico",
  valida: "Valida",
  rimanda: "Rimanda indietro",
  ordina: "Ordina",
};

/**
 * UN solo pulsante principale per fase, secondo dove si trova:
 *   - dal tecnico: chi valida ha «Valida» (con «Rimanda indietro» accanto);
 *   - in bozza con materiali da ordinare: «Invia al tecnico»;
 *   - validata (o senza validazione) con materiali da ordinare: «Ordina»
 *     per chi compra;
 *   - tutto ordinato o arrivato: niente.
 * Le azioni secondarie stanno nel menu della fase.
 */
export function azionePrincipaleFase(
  stato: StatoMaterialiFase | null,
  p: PermessiMateriali,
  m: { haFase: boolean; daOrdinare: number; senzaQuantita: number; inAcquisto: number },
): { principale: AzionePrincipale | null; secondarie: AzioneFase[] } {
  const puoComprare = p.canEditOrders || p.canManagePurchasing;
  const prepara = p.canEditOrders || p.canValidateBom;
  if (stato === "da_validare") {
    if (!p.canValidateBom) return { principale: null, secondarie: [] };
    return m.senzaQuantita === 0 ? { principale: "valida", secondarie: ["rimanda"] } : { principale: "rimanda", secondarie: [] };
  }
  if (stato === "bozza") {
    return { principale: m.daOrdinare > 0 && prepara ? "invia_validazione" : null, secondarie: [] };
  }
  const secondarie: AzioneFase[] = [];
  if (stato === "validata" && p.canValidateBom && m.inAcquisto === 0) secondarie.push("rimanda");
  // Fase che non usa la validazione: chi prepara può sempre passarla al tecnico.
  if (stato === null && m.haFase && m.daOrdinare > 0 && m.inAcquisto === 0 && prepara) secondarie.push("invia_validazione");
  if (m.daOrdinare > 0 && puoComprare) return { principale: "ordina", secondarie };
  if (stato === null && secondarie.includes("invia_validazione")) {
    return { principale: "invia_validazione", secondarie: secondarie.filter((a) => a !== "invia_validazione") };
  }
  return { principale: null, secondarie };
}
