import { describe, it, expect } from "vitest";
import { decideUiAction, type RawMatchRow } from "@/lib/barcode/scanMatchLogic";

const empty: RawMatchRow = {
  match_type: "none", stock_unit_id: null, stock_item_id: null,
  item_name: null, item_tracking_mode: null,
  supplier_id: null, supplier_name: null,
};

describe("decideUiAction", () => {
  it("returns offer_create_new for no matches", () => {
    expect(decideUiAction([{ ...empty, match_type: "none" }]).kind).toBe("offer_create_new");
    expect(decideUiAction([]).kind).toBe("offer_create_new");
  });

  it("accepts unit match immediately", () => {
    const rows: RawMatchRow[] = [{
      ...empty, match_type: "unit", stock_unit_id: "u1", stock_item_id: "i1",
    }];
    const r = decideUiAction(rows);
    expect(r.kind).toBe("accept_unit");
    if (r.kind === "accept_unit") {
      expect(r.unitId).toBe("u1");
      expect(r.itemId).toBe("i1");
    }
  });

  it("accepts single clean item match", () => {
    const rows: RawMatchRow[] = [{
      ...empty, match_type: "item", stock_item_id: "i1", item_name: "Vite M8",
    }];
    const r = decideUiAction(rows);
    expect(r.kind).toBe("accept_item");
  });

  it("shows ambiguous confirm for multiple items", () => {
    const rows: RawMatchRow[] = [
      { ...empty, match_type: "item", stock_item_id: "i1" },
      { ...empty, match_type: "item_ambiguous", stock_item_id: "i2" },
    ];
    const r = decideUiAction(rows);
    expect(r.kind).toBe("confirm_ambiguous");
    if (r.kind === "confirm_ambiguous") expect(r.rows.length).toBe(2);
  });

  it("prefers unit over item when both present", () => {
    const rows: RawMatchRow[] = [
      { ...empty, match_type: "item", stock_item_id: "i1" },
      { ...empty, match_type: "unit", stock_unit_id: "u1", stock_item_id: "i1" },
    ];
    expect(decideUiAction(rows).kind).toBe("accept_unit");
  });
});
