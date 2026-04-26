import { describe, it, expect } from "vitest";
import { parseGs1, shouldParseAsGs1, normalizeScanForLookup, FNC1 } from "@/lib/barcode/gs1Parser";

describe("parseGs1", () => {
  it("returns isGs1=false for plain EAN-13", () => {
    const r = parseGs1("8001234567890");
    expect(r.isGs1).toBe(false);
  });

  it("parses GTIN (AI 01) from fixed-length code", () => {
    const r = parseGs1("0108001234567890");
    expect(r.isGs1).toBe(true);
    expect(r.gtin).toBe("08001234567890");
  });

  it("parses GTIN + serial with FNC1 separator", () => {
    const raw = `0108001234567890${FNC1}21SN-ABC-123${FNC1}`;
    const r = parseGs1(raw);
    expect(r.gtin).toBe("08001234567890");
    expect(r.serialNumber).toBe("SN-ABC-123");
  });

  it("parses expiry AI 17 with YYMMDD", () => {
    const r = parseGs1("1726030101SERIAL001");
    expect(r.expiryDate).toBe("2026-03-01");
  });

  it("handles dd=00 (last day of month) correctly", () => {
    const r = parseGs1("17260200"); // febbraio 2026 → 28 feb 2026
    expect(r.expiryDate).toBe("2026-02-28");
  });

  it("parses lot number + serial + GTIN combined", () => {
    const raw = `010800123456789010LOT42${FNC1}21SER99${FNC1}`;
    const r = parseGs1(raw);
    expect(r.gtin).toBe("08001234567890");
    expect(r.lotNumber).toBe("LOT42");
    expect(r.serialNumber).toBe("SER99");
  });
});

describe("shouldParseAsGs1", () => {
  it("respects supplier config when true", () => {
    expect(shouldParseAsGs1("anycode", true)).toBe(true);
  });

  it("detects AI 01 prefix heuristic", () => {
    expect(shouldParseAsGs1("0108001234567890")).toBe(true);
  });

  it("detects FNC1 presence", () => {
    expect(shouldParseAsGs1(`010800${FNC1}21X`)).toBe(true);
  });

  it("returns false for plain EAN without supplier config", () => {
    expect(shouldParseAsGs1("8001234567890")).toBe(false);
  });
});

describe("normalizeScanForLookup", () => {
  it("returns raw for non-GS1 codes", () => {
    const r = normalizeScanForLookup("8001234567890");
    expect(r.primary).toBe("8001234567890");
    expect(r.gs1).toBeUndefined();
  });

  it("returns serial as primary when available", () => {
    const raw = `0108001234567890${FNC1}21SN-777${FNC1}`;
    const r = normalizeScanForLookup(raw, true);
    expect(r.primary).toBe("SN-777");
    expect(r.gs1?.isGs1).toBe(true);
  });

  it("falls back to GTIN when no serial", () => {
    const r = normalizeScanForLookup("0108001234567890", true);
    expect(r.primary).toBe("08001234567890");
  });
});
