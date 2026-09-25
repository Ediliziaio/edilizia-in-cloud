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
 * I verticali della galleria dei modelli (article_family_templates.vertical_slug),
 * con l'etichetta che l'azienda vede nel filtro di «Importa → Modelli pronti».
 * Un modello con un verticale fuori da qui l'azienda lo trova solo sotto
 * «Tutti i verticali»: per questo nell'admin si sceglie da questo elenco.
 */
export const VERTICALI_GALLERIA: ReadonlyArray<{ value: string; label: string }> = [
  { value: "pavimenti", label: "Pavimenti & Rivestimenti" },
  { value: "porte", label: "Porte" },
  { value: "serramenti", label: "Serramenti" },
  { value: "bagno", label: "Bagno & Sanitari" },
  { value: "elettrico", label: "Elettrico" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "tetti", label: "Tetti" },
  { value: "cappotto", label: "Cappotto termico" },
  { value: "pompe_calore", label: "Pompe di calore" },
];

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
