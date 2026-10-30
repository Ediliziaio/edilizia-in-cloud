import { describe, expect, it } from "vitest";
import {
  GRUPPI_MAGAZZINO,
  gruppiVisibili,
  gruppoDi,
  vistaDelGruppo,
  vistaEffettiva,
} from "@/lib/magazzino/vistaMagazzino";
import { aRiga, daRiga, differenze, vociDalBrowser, type ManualPurchaseItem } from "@/lib/magazzino/acquistiAMano";

describe("Viste del magazzino in quattro gruppi", () => {
  it("le undici viste di prima hanno ancora una casa, tranne Scadenze che apre le giacenze", () => {
    const viste = GRUPPI_MAGAZZINO.flatMap((g) => g.viste.map((v) => v.key));
    expect(viste.sort()).toEqual(
      ["list", "kanban", "calendar", "purchase_list", "stock", "lotti", "valuation", "ddt", "uscite", "movements"].sort(),
    );
    expect(GRUPPI_MAGAZZINO).toHaveLength(4);
    expect(gruppoDi("scadenze")).toBe("giacenze");
    expect(vistaEffettiva("scadenze", false)).toBe("stock");
  });

  it("ogni vista sta nel suo gruppo", () => {
    expect(gruppoDi("kanban")).toBe("preparare");
    expect(gruppoDi("purchase_list")).toBe("preparare");
    expect(gruppoDi("valuation")).toBe("giacenze");
    expect(gruppoDi("uscite")).toBe("arrivi");
    expect(gruppoDi("movements")).toBe("movimenti");
  });

  it("sul telefono: lista, da comprare e inventario; il resto ripiega sulla lista", () => {
    expect(gruppiVisibili(true).map((g) => [g.key, g.viste.map((v) => v.key)])).toEqual([
      ["preparare", ["list", "purchase_list"]],
      ["giacenze", ["stock"]],
    ]);
    expect(vistaEffettiva("movements", true)).toBe("list");
    expect(vistaEffettiva("purchase_list", true)).toBe("purchase_list");
  });

  it("scegliendo un gruppo si torna alla sotto-vista lasciata", () => {
    expect(vistaDelGruppo("giacenze", {}, false)).toBe("stock");
    expect(vistaDelGruppo("giacenze", { giacenze: "valuation" }, false)).toBe("valuation");
    // Sul telefono «Valore» non c'è: si apre la prima disponibile.
    expect(vistaDelGruppo("giacenze", { giacenze: "valuation" }, true)).toBe("stock");
    expect(vistaDelGruppo("arrivi", {}, true)).toBe("list");
  });
});

const voce = (over: Partial<ManualPurchaseItem> = {}): ManualPurchaseItem => ({
  id: "6f1c0e0a-8a51-4c84-9a0c-0b3a3d4e5f61", name: "Silicone trasparente", quantity: 12, unitCost: 4.5, vatRate: 22,
  supplierId: null, paymentMethod: null, paymentTerm: "30_70", expectedPaymentDate: "", paid: false, paidDate: "",
  depositPaid: true, depositExpectedDate: "2026-10-30", balancePaid: false, balanceExpectedDate: "2026-11-30",
  status: "ordinato", warehouseId: null, orderDate: "2026-10-29", arrivalDate: "", priority: "alta", dueDate: "",
  notes: "per Rossi", completed: false, ...over,
});

describe("Lista della spesa nel database", () => {
  it("andata e ritorno dalla riga senza perdere niente", () => {
    const v = voce();
    expect(daRiga(aRiga(v, "az1"))).toEqual(v);
  });

  it("le date vuote diventano NULL, non stringhe vuote", () => {
    const r = aRiga(voce(), "az1");
    expect(r.arrivo_il).toBeNull();
    expect(r.pagato_il).toBeNull();
    expect(r.acconto_previsto_il).toBe("2026-10-30");
  });

  it("si scrive solo quello che è cambiato", () => {
    const a = voce();
    const b = voce({ id: "0e5b0f6c-1111-4c84-9a0c-0b3a3d4e5f62", name: "Viti" });
    const d = differenze([a, b], [{ ...a, status: "in_magazzino" }, voce({ id: "7a7a7a7a-2222-4c84-9a0c-0b3a3d4e5f63", name: "Tasselli" })]);
    expect(d.cambiate.map((v) => v.status)).toEqual(["in_magazzino"]);
    expect(d.aggiunte.map((v) => v.name)).toEqual(["Tasselli"]);
    expect(d.tolte).toEqual([b.id]);
    expect(differenze([a], [a])).toEqual({ aggiunte: [], cambiate: [], tolte: [] });
  });

  it("le voci rimaste nel browser si portano dentro; un id vecchio ne riceve uno nuovo", () => {
    const grezzo = JSON.stringify([
      { id: "manual-1700000000-0", name: " Guarnizioni ", quantity: 3, unitCost: 2, vatRate: 22, completed: true },
      { id: "6f1c0e0a-8a51-4c84-9a0c-0b3a3d4e5f61", name: "Silicone", status: "ordinato" },
      { name: "   " },
      null,
    ]);
    const voci = vociDalBrowser(grezzo, () => "nuovo-id");
    expect(voci.map((v) => [v.id, v.name, v.status])).toEqual([
      ["nuovo-id", "Guarnizioni", "in_magazzino"],
      ["6f1c0e0a-8a51-4c84-9a0c-0b3a3d4e5f61", "Silicone", "ordinato"],
    ]);
  });

  it("un browser vuoto o rovinato non porta niente", () => {
    expect(vociDalBrowser(null, () => "x")).toEqual([]);
    expect(vociDalBrowser("{non è json", () => "x")).toEqual([]);
    expect(vociDalBrowser('{"a":1}', () => "x")).toEqual([]);
  });
});
