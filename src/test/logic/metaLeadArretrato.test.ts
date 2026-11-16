import { describe, expect, it } from "vitest";
import { giorniDiRitardo, isLeadArretrato, notaArretrato } from "../../../supabase/functions/_shared/metaLeadArretrato";

const ADESSO = new Date("2026-09-12T09:00:00Z");

describe("isLeadArretrato", () => {
  it("un lead di oggi è fresco", () => {
    expect(isLeadArretrato("2026-09-12T07:30:00Z", ADESSO)).toBe(false);
  });

  it("un lead di ieri sera è ancora fresco", () => {
    expect(isLeadArretrato("2026-09-11T20:00:00Z", ADESSO)).toBe(false);
  });

  it("entro 72 ore (tre giorni) è ancora fresco; oltre no", () => {
    // Soglia alzata a 72 ore il 16/11/2026.
    expect(isLeadArretrato("2026-09-09T20:00:00Z", ADESSO)).toBe(false); // ~2,5 giorni
    expect(isLeadArretrato("2026-09-08T20:00:00Z", ADESSO)).toBe(true);  // ~3,5 giorni
  });

  it("si può chiedere una soglia diversa", () => {
    expect(isLeadArretrato("2026-09-11T20:00:00Z", ADESSO, 24)).toBe(false);
    expect(isLeadArretrato("2026-09-10T20:00:00Z", ADESSO, 24)).toBe(true);
  });

  it("un lead di tre settimane fa è arretrato", () => {
    expect(isLeadArretrato("2026-08-23T10:00:00Z", ADESSO)).toBe(true);
  });

  it("senza data si tratta come fresco: non si indovina", () => {
    expect(isLeadArretrato(null, ADESSO)).toBe(false);
    expect(isLeadArretrato("", ADESSO)).toBe(false);
    expect(isLeadArretrato("non-una-data", ADESSO)).toBe(false);
  });
});

describe("giorniDiRitardo e nota", () => {
  it("conta i giorni interi", () => {
    expect(giorniDiRitardo("2026-09-02T09:00:00Z", ADESSO)).toBe(10);
    expect(giorniDiRitardo("2026-09-12T08:00:00Z", ADESSO)).toBe(0);
  });

  it("la nota dice la data vera e che non è di oggi", () => {
    const n = notaArretrato("2026-08-23T10:00:00Z", ADESSO);
    expect(n).toContain("23/08/2026");
    expect(n).toContain("19 giorni fa"); // 23/08 10:00 → 12/09 09:00 = 19 giorni interi
    expect(n).toContain("non è un contatto di oggi");
  });
});
