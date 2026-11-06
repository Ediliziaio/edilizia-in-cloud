import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";
import { expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useBatchScannerEntries } from "@/hooks/warehouse/useBatchScannerEntries";

it("seriali incollati passano al carico dopo la creazione dell'articolo unico", () => {
  const { result } = renderHook(() => useBatchScannerEntries({ initialEntries: ["SN-002", "SN-003"].map((serial): BatchScanEntry => ({
    clientUuid: serial, rawCode: serial, stockItemId: null, itemName: null,
    trackingMode: null, quantity: 1, serialNumbers: [], scannedAt: 1,
  })) }));
  act(() => {
    for (const id of ["SN-002", "SN-003"]) result.current.promoteNoMatch(id, {
      stockItemId: "articolo-demo", itemName: "Articolo demo", trackingMode: "serialized",
    });
  });
  expect(result.current.entries.flatMap(e => e.serialNumbers)).toEqual(["SN-002", "SN-003"]);
  expect(result.current.entries.every(e => e.stockItemId === "articolo-demo")).toBe(true);
});

it("la creazione dell'anagrafica non anticipa il carico fisico dei seriali", () => {
  const source = readFileSync("src/components/warehouse/CaricoRapidoSheet.tsx", "utf8");
  const createItem = source.slice(source.indexOf("async function handleSaveNewItem"), source.indexOf("// (il lotto viene"));
  expect(createItem).toContain('.from("warehouse_stock")');
  expect(createItem).not.toContain('.from("stock_units")');
});
