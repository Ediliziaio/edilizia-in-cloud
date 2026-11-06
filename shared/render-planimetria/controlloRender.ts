export interface EsitoQaStanza { checked: boolean; pass: boolean; issues: Array<{ category: string; detail?: string }> }

/** Una pianta è un vincolo: una verifica assente o negativa non è un render verificato. */
export function rifiutaRenderStanza(qa: EsitoQaStanza | null, contesto: { daPianta: boolean; materiali: boolean; da3D: boolean }, precedenteRifiutato = false): boolean {
  if (precedenteRifiutato && !qa?.checked) return true;
  if (contesto.daPianta) return !qa?.checked || !qa.pass || qa.issues.some((i) => ["invented_openings", "plan_openings_mismatch", "geometry_change", "selected_material_mismatch", "duplicated_furniture", "unrequested_furniture"].includes(i.category));
  return !!qa?.checked && !qa.pass && qa.issues.some((i) => (contesto.materiali && i.category === "selected_material_mismatch") || (contesto.da3D && i.category === "unrequested_furniture"));
}
