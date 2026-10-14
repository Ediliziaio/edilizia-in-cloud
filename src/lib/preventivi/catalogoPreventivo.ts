import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import { eAsseLinea } from "@/lib/listino/schedeLinea";
import { formatPrezzoUnitario } from "@/lib/tariffe/economiaTariffa";
import { chiaveTesto } from "@/lib/listino/areeStandard";

export function categoriaProdottoCatalogo(
  item: CatalogItem,
  categorie: CatalogCategory[],
) {
  const categoria = categorie.find((c) => c.id === item.categoria_id);
  if (categoria) return { id: categoria.id, nome: categoria.nome };
  const legacy =
    item.source === "article" ? item.article?.category?.trim() : null;
  return legacy
    ? { id: `legacy:${chiaveTesto(legacy)}`, nome: legacy }
    : { id: "altri", nome: "Altri prodotti" };
}

export function dettagliProdottoCatalogo(
  item: CatalogItem,
  categorie: CatalogCategory[],
) {
  const categoria =
    categorie.find((c) => c.id === item.categoria_id)?.nome ??
    (item.source === "article" ? (item.article?.category ?? "") : "");
  const codice = item.source === "family" ? item.family?.codice : item.sku;
  const linee =
    item.source === "family"
      ? (item.family?.axes ?? [])
          .filter(eAsseLinea)
          .flatMap((a) =>
            a.values
              .filter((v) => v.attivo !== false)
              .map((v) => v.label || v.valore),
          )
      : [];
  const linea = [...new Set(linee)]
    .filter((n) => n && n !== categoria)
    .join(" · ");
  return {
    categoria,
    codice,
    linea,
    marca: item.source === "article" ? item.marca : null,
  };
}

export function prezzoProdottoCatalogo(item: CatalogItem) {
  const prezzo = Number(item.prezzo_base_vendita);
  if (!(prezzo > 0))
    return item.modalita_prezzo === "griglia" ||
      item.modalita_prezzo === "misura_libera"
      ? "Prezzo a misura"
      : "Prezzo da completare";
  if (
    item.modalita_prezzo === "griglia" ||
    item.modalita_prezzo === "misura_libera"
  )
    return `Da ${formatPrezzoUnitario(prezzo)}`;
  return `${formatPrezzoUnitario(prezzo)} / ${item.modalita_prezzo === "mq" ? "m²" : item.unit_of_measure || "pz"}`;
}

export function corrispondeProdottoCatalogo(
  item: CatalogItem,
  categorie: CatalogCategory[],
  cerca: string,
) {
  const dettagli = dettagliProdottoCatalogo(item, categorie);
  const testo = [
    item.nome,
    item.descrizione,
    dettagli.categoria,
    dettagli.codice,
    dettagli.linea,
    dettagli.marca,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return cerca
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .every((p) => testo.includes(p));
}

/** Solo i collegamenti effettivi fanno di un servizio una riga figlia. */
export function rigaCollegataAlProdotto(riga: {
  _parentIdx?: number;
  parent_temp_id?: string | null;
  parent_item_id?: string | null;
}) {
  return (
    riga._parentIdx != null || !!riga.parent_temp_id || !!riga.parent_item_id
  );
}
