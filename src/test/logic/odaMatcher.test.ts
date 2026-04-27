import { describe, it, expect } from "vitest";

/**
 * Mirror della logica di sorting dell'RPC match_scan_to_oda:
 *   ORDER BY
 *     CASE WHEN supplier_id = preferred_supplier THEN 0 ELSE 1 END,
 *     expected_delivery_date ASC NULLS LAST,
 *     created_at DESC
 *
 * Test puri senza Supabase: documentano la policy e proteggono da
 * regressioni quando si modifica l'RPC.
 */

interface OdaRow {
  oda_id: string;
  supplier_id: string;
  expected_delivery_date: string | null;
  created_at?: string;
}

function sortOdaMatches(rows: OdaRow[], preferredSupplierId?: string): OdaRow[] {
  return [...rows].sort((a, b) => {
    if (preferredSupplierId) {
      const aPref = a.supplier_id === preferredSupplierId ? 0 : 1;
      const bPref = b.supplier_id === preferredSupplierId ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
    }
    const aDate = a.expected_delivery_date
      ? new Date(a.expected_delivery_date).getTime()
      : Infinity;
    const bDate = b.expected_delivery_date
      ? new Date(b.expected_delivery_date).getTime()
      : Infinity;
    return aDate - bDate;
  });
}

describe("ODA matcher sorting", () => {
  it("preferred supplier sorts first", () => {
    const rows: OdaRow[] = [
      { oda_id: "1", supplier_id: "A", expected_delivery_date: "2026-05-01" },
      { oda_id: "2", supplier_id: "B", expected_delivery_date: "2026-04-01" },
    ];
    const r = sortOdaMatches(rows, "A");
    expect(r[0].oda_id).toBe("1");
  });

  it("within same supplier, earlier date first", () => {
    const rows: OdaRow[] = [
      { oda_id: "1", supplier_id: "A", expected_delivery_date: "2026-05-01" },
      { oda_id: "2", supplier_id: "A", expected_delivery_date: "2026-04-15" },
      { oda_id: "3", supplier_id: "A", expected_delivery_date: "2026-04-01" },
    ];
    const r = sortOdaMatches(rows, "A");
    expect(r.map((x) => x.oda_id)).toEqual(["3", "2", "1"]);
  });

  it("null expected_delivery_date goes last", () => {
    const rows: OdaRow[] = [
      { oda_id: "1", supplier_id: "A", expected_delivery_date: null },
      { oda_id: "2", supplier_id: "A", expected_delivery_date: "2026-04-15" },
    ];
    const r = sortOdaMatches(rows, "A");
    expect(r[0].oda_id).toBe("2");
    expect(r[1].oda_id).toBe("1");
  });

  it("preserves order when no preferences match", () => {
    const rows: OdaRow[] = [
      { oda_id: "1", supplier_id: "X", expected_delivery_date: "2026-04-01" },
      { oda_id: "2", supplier_id: "Y", expected_delivery_date: "2026-04-15" },
    ];
    const r = sortOdaMatches(rows, "Z");
    expect(r[0].oda_id).toBe("1");
  });
});
