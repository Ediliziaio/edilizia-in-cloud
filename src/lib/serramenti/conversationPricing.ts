import type { FamilyWithAxes } from "@/types/articleFamily";
import type { TariffaMinimal, listGrigliaByFamily } from "./api";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { configDaFamiglia, formaDaConfig } from "./disegnoDaFamiglia";
import { prezzoComplemento } from "./complementiFinestra";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import type { NativePriceResolver } from "@/lib/preventivi/verticalWizardDraft";

/** Same grid, variants, installation and supplier calculation as the picker. */
export function serramentiConversationPricing(
  families: FamilyWithAxes[],
  tariffe: TariffaMinimal[],
  lines: SupplierProductLine[],
  loadGrid: typeof listGrigliaByFamily,
): NativePriceResolver {
  const grids = new Map<string, ReturnType<typeof listGrigliaByFamily>>();
  const grid = (id: string) => {
    let request = grids.get(id);
    if (!request) {
      request = loadGrid(id).catch((error) => {
        grids.delete(id);
        throw error;
      });
      grids.set(id, request);
    }
    return request;
  };
  return async (op, fields, previous) => {
    const id = Object.hasOwn(fields, "catalogueId")
      ? fields.catalogueId
      : previous &&
        ("family_id" in previous ? previous.family_id : previous.tariffa_id);
    if (op.kind === "servizio") {
      const rate = tariffe.find((r) => r.id === id);
      if (!rate || !(Number(rate.prezzo_vendita) > 0)) return null;
      if (fields.unit && fields.unit !== unitaTariffa(rate))
        throw new Error(
          "Unità diversa dalla tariffa: scegli un riferimento compatibile",
        );
      return {
        price: Number(rate.prezzo_vendita),
        cost: costoTariffa(rate),
        unit: unitaTariffa(rate),
      };
    }
    const family = families.find((f) => f.id === id);
    if (!family) return null;
    const same =
      previous && "family_id" in previous && previous.family_id === id
        ? previous
        : null;
    const values = {
      ...(same?.valori_assi ?? {}),
      ...Object.fromEntries(op.axes.map((a) => [a.axis, a.value])),
    };
    const choices = {
      ...(same?.scelte_assi ?? {}),
      ...Object.fromEntries(
        op.axes.filter((a) => a.choice != null).map((a) => [a.axis, a.choice!]),
      ),
    };
    for (const axis of op.axes)
      if (axis.choice == null) delete choices[axis.axis];
    if (
      same &&
      op.axes.length === 0 &&
      [
        "material",
        "series",
        "glass",
        "opening",
        "insideColor",
        "outsideColor",
      ].some((k) => Object.hasOwn(fields, k))
    )
      return null;
    for (const axis of family.axes) {
      if (
        axis.visibile_se &&
        !axis.visibile_se.valori.includes(values[axis.visibile_se.asse])
      )
        continue;
      const value = axis.values.find(
        (v) => v.id === values[axis.codice] && v.attivo,
      );
      if (axis.obbligatorio && !value)
        throw new Error(
          `Completa la variante ${axis.nome} prima di calcolare il prezzo`,
        );
      if (values[axis.codice] && !value)
        throw new Error(`Variante ${axis.nome} non disponibile`);
      if (
        value?.opzioni?.length &&
        (!choices[axis.codice] || !value.opzioni.includes(choices[axis.codice]))
      )
        throw new Error(`Conferma la scelta di ${axis.nome}`);
    }
    const result = prezzoComplemento({
      famiglia: family,
      valori: values,
      quantita: Number(fields.quantity),
      larghezza:
        Number(
          Object.hasOwn(fields, "width") ? fields.width : same?.larghezza_mm,
        ) || null,
      altezza:
        Number(
          Object.hasOwn(fields, "height") ? fields.height : same?.altezza_mm,
        ) || null,
      posaEsclusa: (fields.installationExcluded ?? same?.posa_esclusa) === true,
      griglia:
        family.modalita_prezzo_base === "griglia" ? await grid(family.id) : [],
      tariffePrezzi: new Map(
        tariffe.map((t) => [t.id, Number(t.prezzo_vendita ?? 0)]),
      ),
      supplierLines: new Map(lines.map((l) => [l.id, l])),
      lineaFornitore: (Object.hasOwn(fields, "supplierLineId")
        ? fields.supplierLineId
        : same?.supplier_product_line_id) as string | null,
    });
    if ("errore" in result) return null;
    return {
      price: result.unitario,
      sourceId: result.voce,
      supplierId: result.supplierCatalogId,
      supplierLineId: result.supplierProductLineId,
      image: family.immagine_url,
      drawing:
        same && "disegno_config" in same && same.disegno_config?.nessuno
          ? same.disegno_config
          : configDaFamiglia(family, values, {
              voci: choices,
              forma:
                same && "disegno_config" in same
                  ? formaDaConfig(same.disegno_config)
                  : undefined,
              coloreInterno:
                same && "colore_interno" in same ? same.colore_interno : null,
              coloreEsterno:
                same && "colore_esterno" in same ? same.colore_esterno : null,
            }),
      mode: family.modalita_prezzo_base,
    };
  };
}
