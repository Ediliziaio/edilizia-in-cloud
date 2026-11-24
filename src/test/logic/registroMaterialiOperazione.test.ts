import { expect, it } from "vitest";
import type { RegistroMateriale } from "@/hooks/useMaterialiOperazione";
import { statoMateriale } from "@/lib/distinta/statoMateriale";
import { nellaCodaMateriali, quoteGiacenzaMateriali } from "@/lib/distinta/registroMaterialiOperazione";
import { planMaterial, type ProcurementCoverage } from "@/lib/orders/materialProcurement";

function materiale(id: string, modifica: Partial<RegistroMateriale> = {}, ordini: ProcurementCoverage[] = []): RegistroMateriale {
  const riga: Omit<RegistroMateriale, "piano" | "acquisto" | "oda"> = {
    id, order_id: id, name: "Acciaio armatura", quantity: 100, status: "da_ordinare", unita_misura: "kg",
    supplier_id: "ditta", stock_item_id: null, phase_id: null, origini: [], supplier_rfq_item_id: null, data_fabbisogno: null,
    quantity_reserved: null, auto_deducted: null, fase: null, fornitore: { name: "Ditta" },
    validazione: null, verifica: null, ...modifica,
  };
  return { ...riga, piano: planMaterial(riga, ordini), acquisto: statoMateriale(riga, ordini), oda: ordini.map(r => r.purchase_orders) };
}

it("suggerisce ogni kg libero una sola volta tra le commesse e conserva le riserve reali", () => {
  const righe = [materiale("prima", { stock_item_id: "lotto", quantity_reserved: 30 }), materiale("seconda"), materiale("terza")];
  const quotate = quoteGiacenzaMateriali(righe, [{ id: "lotto", name: "Acciaio armatura", unita_misura: "kg", internal_code: "ACC", quantity_available: 100 }], {});
  expect(quotate.get("prima")).toMatchObject({ riservata: 30, suggerita: 70, daComprare: 0 });
  expect(quotate.get("seconda")).toMatchObject({ riservata: 0, suggerita: 30, daComprare: 70 });
  expect(quotate.get("terza")).toMatchObject({ riservata: 0, suggerita: 0, daComprare: 100 });
});

it("segnala le unità incongruenti e tiene visibile l’OdA anche durante la verifica tecnica", () => {
  const oda = { id: "oda", oda_number: "ODA-004", status: "confermato" };
  const riga = materiale("fase", { validazione: "da_validare" }, [
    { id: "copertura", order_item_id: "fase", quantity: 37, quantity_received: 0, unit_of_measure: "kg", purchase_orders: oda },
  ]);
  expect(nellaCodaMateriali(riga, "ordini")).toBe(true);
  expect(nellaCodaMateriali(riga, "verificare")).toBe(true);
  expect(nellaCodaMateriali(riga, "acquistare")).toBe(false);
  expect(riga.piano.remaining).toBe(63);
  const quote = quoteGiacenzaMateriali([riga], [{ id: "lotto", name: riga.name, unita_misura: "m", internal_code: "ACC", quantity_available: 100 }], {});
  expect(quote.get(riga.id)).toMatchObject({ verifica: true, suggerita: 0, daComprare: null });
});
