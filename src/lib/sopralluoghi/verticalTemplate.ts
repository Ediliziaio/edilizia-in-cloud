/**
 * Sopralluoghi — quali template consigliare in base al settore dell'azienda.
 *
 * L'azienda ha due segnali di verticale: `vertical_key` (scelto in onboarding)
 * e l'enum `sector`. Non combaciano con le CATEGORIE dei template (es. azienda
 * «serramentisti» → template categoria «infissi»), quindi qui c'è la mappa che
 * li allinea. Serve a: pre-selezionare il template giusto quando si apre un
 * nuovo sopralluogo e a mettere davanti (badge «Consigliato») quelli del
 * settore. Non nasconde nulla: un'impresa che fa più cose vede tutti i template.
 */

// vertical_key (onboarding) → categorie template, la principale per prima.
const PER_VERTICAL_KEY: Record<string, string[]> = {
  serramentisti: ["infissi"],
  bagnisti: ["bagno", "ristrutturazione"],
  fotovoltaico: ["fotovoltaico"],
  ristrutturatori_interni: ["ristrutturazione", "bagno", "infissi"],
  edili_generaliste: ["ristrutturazione", "cappotto", "tetto", "infissi", "bagno"],
};

// sector (enum companies.sector) → categorie template.
const PER_SECTOR: Record<string, string[]> = {
  serramenti: ["infissi"],
  infissi: ["infissi"],
  bagni: ["bagno", "ristrutturazione"],
  fotovoltaico: ["fotovoltaico"],
  ristrutturazioni: ["ristrutturazione", "bagno", "infissi"],
  tetti: ["tetto", "cappotto"],
  pittura: ["cappotto", "ristrutturazione"],
  // "altro" → nessuna preferenza (mostra tutto così com'è)
};

/**
 * Categorie template consigliate per l'azienda, ordinate (principale per prima).
 * Prima il vertical_key, poi eventuali extra dal sector. Lista vuota = nessuna
 * preferenza (l'ordine dei template resta quello di default).
 */
export function categorieConsigliate(
  verticalKey?: string | null,
  sector?: string | null,
): string[] {
  const out: string[] = [];
  const push = (arr?: string[]) => {
    for (const c of arr ?? []) if (!out.includes(c)) out.push(c);
  };
  if (verticalKey) push(PER_VERTICAL_KEY[verticalKey]);
  if (sector) push(PER_SECTOR[sector]);
  return out;
}
