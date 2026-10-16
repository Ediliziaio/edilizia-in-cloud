import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import { eAsseLinea } from "@/lib/listino/schedeLinea";
import { formatPrezzoUnitario } from "@/lib/tariffe/economiaTariffa";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import type { MacroListino } from '@/lib/listino/lineeListino';
import { lineaBestInfissi } from '@/lib/listino/bestInfissiLinee';

export function categoriaProdottoCatalogo(
  item: CatalogItem,
  categorie: CatalogCategory[],
  macros: readonly MacroListino[] = [],
) {
  const categoria = categorie.find((c) => c.id === item.categoria_id);
  const macro = macros.find(m => m.id === categoria?.macrocategoria_id);
  if (categoria) return { id: categoria.id, nome: macro && macro.nome !== categoria.nome ? `${macro.nome} · ${categoria.nome}` : categoria.nome };
  const modello = item.source === 'family' ? lineaBestInfissi(item.family) : null;
  if (modello) return {id:`linea:${modello}`, nome:modello};
  const legacy =
    item.source === "article" ? item.article?.category?.trim() : null;
  return legacy
    ? { id: `legacy:${chiaveTesto(legacy)}`, nome: legacy }
    : { id: "altri", nome: "Altri prodotti" };
}

export function dettagliProdottoCatalogo(
  item: CatalogItem,
  categorie: CatalogCategory[],
  macros: readonly MacroListino[] = [],
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
  const modello = item.source === 'family' ? lineaBestInfissi(item.family) : null;
  const macro = item.source === 'family' ? macros.find(m => m.id === item.family.macrocategoria_id) : null;
  const linea = [...new Set([modello, ...linee.filter(n => n !== categoria)].filter((n): n is string => !!n))]
    .join(" · ");
  return {
    categoria: categoria === modello && macro ? macro.nome : categoria,
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
  macros: readonly MacroListino[] = [],
) {
  const dettagli = dettagliProdottoCatalogo(item, categorie, macros);
  const modello = item.source === 'family' ? lineaBestInfissi(item.family) : null;
  const testo = [
    item.nome,
    item.descrizione,
    dettagli.categoria,
    dettagli.codice,
    dettagli.linea,
    dettagli.marca,
    modello,
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
