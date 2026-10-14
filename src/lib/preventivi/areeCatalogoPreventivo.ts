import {
  AREE_STANDARD,
  areaDiVerticale,
  chiaveTesto,
  nomeArea,
} from "@/lib/listino/areeStandard";
import type { MacroListino } from "@/lib/listino/lineeListino";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

export const TUTTE_LE_AREE = "all";
export const VOCI_COMUNI = "common";
export const chiaveProdotto = (p: CatalogItem) => `${p.source}:${p.id}`;

/** Solo etichette dichiarate: niente classificazione dal nome del prodotto. */
function areaDaCategoria(nome: string | null | undefined): string | null {
  const chiave = chiaveTesto(nome);
  if (!chiave) return null;
  const area = AREE_STANDARD.find((a) =>
    [a.nome, ...a.sinonimi].some((n) => chiaveTesto(n) === chiave),
  );
  if (area) return area.chiave;
  // Etichetta usata dagli articoli del listino legacy.
  if (chiave === "riscaldamento") return "termoidraulico";
  const corrispondenze = AREE_STANDARD.filter((a) =>
    a.tipologie.some((t) =>
      [t.nome, ...t.sinonimi].some((n) => chiaveTesto(n) === chiave),
    ),
  );
  return corrispondenze.length === 1 ? corrispondenze[0].chiave : null;
}

export function classificaProdottiPerArea(
  prodotti: CatalogItem[],
  categorie: CatalogCategory[],
  macros: MacroListino[],
): Map<string, string[]> {
  const categoriePerId = new Map(categorie.map((c) => [c.id, c]));
  const macrosPerId = new Map(macros.map((m) => [m.id, m]));
  const famigliePerId = new Map(
    prodotti.filter((p) => p.source === "family").map((p) => [p.id, p.family]),
  );
  function aree(p: CatalogItem): string[] {
    const c = categoriePerId.get(p.categoria_id ?? "");
    const famiglia =
      p.source === "family"
        ? p.family
        : famigliePerId.get(p.article?.family_id ?? "");
    const m = macrosPerId.get(
      famiglia?.macrocategoria_id ?? c?.macrocategoria_id ?? "",
    );
    const dichiarate = [
      ...new Set(
        (m?.verticali_abilitati ?? [])
          .map(areaDiVerticale)
          .filter((a): a is string => !!a),
      ),
    ];
    if (dichiarate.length) return dichiarate;
    const area =
      areaDiVerticale(famiglia?.vertical) ??
      areaDaCategoria(m?.tipologia) ??
      (m?.fv_categoria ? "fotovoltaico" : null) ??
      areaDaCategoria(c?.nome) ??
      (p.source === "article" ? areaDaCategoria(p.article?.category) : null);
    return area ? [area] : [];
  }
  return new Map(prodotti.map((p) => [chiaveProdotto(p), aree(p)]));
}

export function nellAreaCatalogo(
  aree: string[],
  area: string,
  includiComuni = true,
) {
  if (area === TUTTE_LE_AREE) return true;
  if (area === VOCI_COMUNI) return aree.length === 0;
  const chiave = area.startsWith("area:") ? area.slice(5) : area;
  return aree.includes(chiave) || (includiComuni && aree.length === 0);
}

export function areeTariffa(t: TariffaPro): string[] {
  const area = areaDiVerticale(t.vertical_associato);
  return area ? [area] : [];
}

export function riepilogoAreeCatalogo(
  prodotti: CatalogItem[],
  tariffe: TariffaPro[],
  classificazione: Map<string, string[]>,
) {
  const counts = new Map<string, { prodotti: number; servizi: number }>();
  function conta(aree: string[], tipo: "prodotti" | "servizi") {
    for (const key of aree.length
      ? aree.map((a) => `area:${a}`)
      : [VOCI_COMUNI]) {
      const c = counts.get(key) ?? { prodotti: 0, servizi: 0 };
      c[tipo]++;
      counts.set(key, c);
    }
  }
  prodotti.forEach((p) =>
    conta(classificazione.get(chiaveProdotto(p)) ?? [], "prodotti"),
  );
  tariffe
    .filter((t) => t.attivo !== false && t.attiva !== false)
    .forEach((t) => conta(areeTariffa(t), "servizi"));
  return [...counts]
    .map(([id, c]) => ({
      id,
      nome: id === VOCI_COMUNI ? "Comuni / senza area" : nomeArea(id.slice(5)),
      ...c,
    }))
    .sort((a, b) =>
      a.id === VOCI_COMUNI
        ? 1
        : b.id === VOCI_COMUNI
          ? -1
          : a.nome.localeCompare(b.nome, "it"),
    );
}
