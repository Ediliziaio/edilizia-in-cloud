import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";
import type { QuoteItemPro } from "@/types/quoteItem";
import { haManodoperaConfigurata } from "./avvisiInserimento";

export function prezziVenditaCompleti(
  items: QuoteItemPro[],
  prezzoManuale: number | null,
): boolean {
  if (
    prezzoManuale != null &&
    Number.isFinite(prezzoManuale) &&
    prezzoManuale > 0
  )
    return true;
  return items
    .filter(
      (item) => !["nota", "subtotale", "sconto"].includes(item.item_category),
    )
    .every((item) => Number.isFinite(item.unit_price) && item.unit_price > 0);
}

export function prodottoSemplice(item: CatalogItem): boolean {
  if (item.modalita_prezzo !== "pz") return false;
  if (haManodoperaConfigurata(item)) return false;
  return item.source === "article"
    ? !item.ha_montaggio_automatico
    : !item.ha_posa_automatica &&
        !item.family.axes?.length &&
        !["manuale", "tariffa"].includes(item.family.manodopera_modalita) &&
        item.family.prezzo_base_mode !== "acquisto_markup";
}

/** Le note di approvvigionamento non sono descrizioni commerciali. */
export function descrizioneCommerciale(
  descrizione: string | null | undefined,
): string {
  return (descrizione ?? "")
    .split(/\r?\n/)
    .filter(
      (riga) =>
        !/^\s*(?:costo\s+(?:d['’])?acquisto|prezzo\s+d['’]acquisto|note interne|storico (?:acquisti|costi)|riconciliazione Palma|fonte:|importat[oa] da|solo costo acquisto)/i.test(
          riga,
        ),
    )
    .join("\n")
    .trim();
}

export function manodoperaSeparata(tipo: string): boolean {
  return tipo === "manodopera" || tipo === "posa";
}

export function configuraProdottoSemplice(
  item: CatalogItem,
  quantity: number,
  unitPrice: number,
  sortOrder: number,
): ConfiguredItem {
  const id = crypto.randomUUID();
  return {
    client_temp_id: id,
    parent_temp_id: null,
    quote_item: {
      item_type: "product",
      item_category: "prodotto",
      name: item.nome,
      description: descrizioneCommerciale(item.descrizione),
      quantity,
      unit_price: unitPrice,
      discount_percent: 0,
      vat_rate:
        (item.source === "family"
          ? item.family.vat_rate
          : item.article.vat_rate) ?? 22,
      unit_of_measure: item.unit_of_measure,
      sort_order: sortOrder,
      article_template_id: item.source === "article" ? item.id : null,
      family_id: item.source === "family" ? item.id : null,
      tariffa_id: null,
      prezzo_acquisto:
        (item.source === "family"
          ? item.family.prezzo_base_acquisto
          : item.article.prezzo_acquisto_netto) ?? 0,
      mostra_nel_pdf: true,
      is_optional: false,
      client_temp_id: id,
      parent_temp_id: null,
      parent_item_id: null,
      image_url: item.immagine_url,
    },
  };
}
