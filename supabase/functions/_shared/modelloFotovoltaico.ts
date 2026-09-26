/**
 * Il modello della libreria congelato in un preventivo Fotovoltaico (25/09/2026).
 *
 * Il preventivo che nasce da un intervento della libreria («Aggiunta accumulo»,
 * «Manutenzione e verifica»…) porta con sé il modello dell'azienda per
 * quell'intervento (fv_progetti.modello_snapshot, src/lib/moduli/modelloPreventivo.ts):
 * fv-onboarding-cliente lo salva col progetto, fv-genera-pdf lo usa al posto del
 * modello aziendale di oggi. Stesse regole del vincolo fv_progetti_modello_valido.
 */

/** Gli interventi Fotovoltaico della libreria (src/lib/moduli-vendita/areas.ts). */
export const MODELLI_FOTOVOLTAICO = ["nuovo", "accumulo", "ampliamento", "componenti", "manutenzione"] as const;

export interface ModelloFotovoltaico {
  version: 1;
  modelId: string;
  companyId: string;
  capturedAt: string;
  template: Record<string, unknown>;
}

/**
 * Il modello del preventivo: null se il preventivo non ne ha uno, false se non è
 * valido o è di un'altra azienda. Mai un documento generico al posto di un modello
 * rovinato: chi chiama si ferma.
 */
export function modelloFotovoltaico(valore: unknown, companyId: string): ModelloFotovoltaico | null | false {
  if (valore == null) return null;
  if (typeof valore !== "object") return false;
  const s = valore as Partial<ModelloFotovoltaico>;
  const t = s.template as { company_id?: unknown; pdf_blocchi?: { modulo_intervento?: unknown } | null } | undefined;
  const valido = s.version === 1 &&
    typeof s.modelId === "string" && (MODELLI_FOTOVOLTAICO as readonly string[]).includes(s.modelId) &&
    s.companyId === companyId &&
    typeof s.capturedAt === "string" && Number.isFinite(Date.parse(s.capturedAt)) &&
    !!t && typeof t === "object" && t.company_id === companyId &&
    t.pdf_blocchi?.modulo_intervento === s.modelId;
  return valido ? (valore as ModelloFotovoltaico) : false;
}
