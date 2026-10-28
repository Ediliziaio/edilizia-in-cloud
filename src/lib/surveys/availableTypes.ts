import type { ElementTypeDefinition } from "@/types/surveys";
/** Only the add menu changes. Historical rows keep their original type and renderer. */
export function availableSurveyTypes(types: ElementTypeDefinition[]) {
  const replacements: Record<string, string> = {
    unita_interna: "split",
    unita_esterna: "en_unita_esterna",
    linea_frigo: "en_percorso_termico",
    linea_frigorifera: "en_percorso_termico",
    scarico_condensa: "en_percorso_termico",
  };
  const keys = new Set(types.map((t) => t.key));
  return types.filter(
    (t) => !replacements[t.key] || !keys.has(replacements[t.key]),
  );
}
