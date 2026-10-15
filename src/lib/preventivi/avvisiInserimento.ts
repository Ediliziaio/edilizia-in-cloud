import type { CatalogItem } from "@/types/catalogItem";
import type { QuoteItemPro } from "@/types/quoteItem";

export function haManodoperaConfigurata(item: CatalogItem): boolean {
  if (item.source === "article") {
    return item.ha_montaggio_automatico || !!item.article?.montaggio_tariffa_id;
  }
  // Una scelta esplicita prevale sui vecchi riferimenti alla tariffa rimasti salvati.
  if (item.family?.manodopera_modalita === "nessuna") return false;
  return item.ha_posa_automatica ||
    ["manuale", "tariffa"].includes(item.family?.manodopera_modalita) ||
    !!item.family?.posa_tariffa_default_id;
}

const collegata = (item: QuoteItemPro) =>
  !!item.parent_temp_id || !!item.parent_item_id || item._parentIdx != null;
const assi = (item: QuoteItemPro) =>
  JSON.stringify(
    Object.entries(item.axis_selections ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
export function stessoProdotto(a: QuoteItemPro, b: QuoteItemPro): boolean {
  if (a.item_type !== "product" || b.item_type !== "product") return false;
  if (a.family_id || b.family_id) {
    if (!a.family_id || a.family_id !== b.family_id) return false;
  } else if (a.article_template_id || b.article_template_id) {
    if (
      !a.article_template_id ||
      a.article_template_id !== b.article_template_id
    )
      return false;
  } else if (
    a.name.trim().toLowerCase() !== b.name.trim().toLowerCase() ||
    a.unit_of_measure !== b.unit_of_measure
  )
    return false;
  return (
    assi(a) === assi(b) &&
    (a.misura_x ?? null) === (b.misura_x ?? null) &&
    (a.misura_y ?? null) === (b.misura_y ?? null)
  );
}

/** Avvisi, non deduplicazione: la stessa tariffa può servire prodotti diversi. */
export function avvisiDoppieVoci(
  nuove: QuoteItemPro[],
  esistenti: QuoteItemPro[],
): string[] {
  const avvisi = new Set<string>();
  const viste = [...esistenti];
  for (const nuova of nuove) {
    if (["nota", "subtotale", "sconto"].includes(nuova.item_category)) continue;
    if (
      nuova.item_type === "product" &&
      viste.some((voce) => stessoProdotto(nuova, voce))
    ) {
      avvisi.add(
        `Prodotto già presente con la stessa configurazione: ${nuova.name}. Controlla quantità e l’eventuale montaggio prima di aggiungerlo di nuovo.`,
      );
    }
    if (nuova.item_type === "service") {
      const stessaTariffa = viste.filter(
        (voce) =>
          voce.item_type === "service" &&
          (nuova.tariffa_id
            ? voce.tariffa_id === nuova.tariffa_id
            : !voce.tariffa_id &&
              voce.name.trim().toLowerCase() ===
                nuova.name.trim().toLowerCase() &&
              voce.unit_of_measure === nuova.unit_of_measure),
      );
      if (stessaTariffa.some((voce) => !collegata(nuova) || !collegata(voce))) {
        avvisi.add(
          `Possibile doppia voce di manodopera o servizio: ${nuova.name}. La stessa voce è già utilizzata; verifica che non copra già questo lavoro.`,
        );
      }
    }
    viste.push(nuova);
  }
  return [...avvisi];
}
