/**
 * verticalMapping — utility condivisa per mappare gli slug verticale
 * "company-side" (come stoccati in companies.vertical / macrocategorie.
 * verticali_abilitati[]) con quelli usati dalla galleria globale dei
 * template (article_*_templates.vertical_slug).
 *
 * Esempio: l'app usa "serramentista" come tipo azienda, ma la galleria
 * template ha vertical_slug="serramenti" per chiarezza utente.
 *
 * Mantenere QUI l'unica fonte di verità: prima questo mapping era
 * duplicato in MacroCategorieManager + FamilyEditor + FamilyTemplatePicker,
 * con rischio di drift quando si aggiunge un nuovo verticale.
 */

const VERTICAL_TO_GALLERY_SLUG: Record<string, string> = {
  serramentista: "serramenti",
  serramenti: "serramenti",
  fotovoltaico: "fotovoltaico",
  bagno: "bagno",
  tetti: "tetti",
  cappotto: "cappotto",
  pompe_calore: "pompe_calore",
  // Estendere qui i verticali futuri (es. tende_da_sole, clima, caldaie).
};

/**
 * Converte uno slug verticale company-side nel suo equivalente galleria.
 * Se non c'è un mapping esplicito, restituisce lo slug originale (best-effort
 * per slug che già coincidono).
 *
 * @param vertical slug company-side (es. "serramentista") o gallery (es. "serramenti")
 * @returns slug galleria oppure null se input vuoto/undefined
 */
export function toGallerySlug(vertical: string | null | undefined): string | null {
  if (!vertical) return null;
  return VERTICAL_TO_GALLERY_SLUG[vertical] ?? vertical;
}

/**
 * Helper specializzato per macrocategorie: prende il primo verticale
 * abilitato e lo mappa. Utile per pre-filtrare i picker di template.
 */
export function firstGallerySlugFor(verticali: string[] | null | undefined): string | null {
  const first = verticali?.[0];
  return toGallerySlug(first);
}
