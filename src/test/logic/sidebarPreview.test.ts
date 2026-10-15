import { describe, expect, it } from "vitest";
import { isConfirmedModulePreview, type ModulePreviewState } from "@/lib/sidebarPreview";

const incluso: ModulePreviewState = { planResolved: true, loading: false, limitedPlan: false, moduleIncluded: true, bypass: false };

describe("DEMO nel menu: anteprima confermata, non errore di verifica", () => {
  it.each(["orders", "customers", "warehouse", "calendar"])("non trasforma %s in DEMO dopo un timeout del piano", () => {
    expect(isConfirmedModulePreview({ ...incluso, planResolved: false, moduleIncluded: false })).toBe(false);
  });
  it("non deduce un'anteprima dall'assenza del piano neppure con un vecchio stato limited", () => {
    expect(isConfirmedModulePreview({ ...incluso, planResolved: false, limitedPlan: true, moduleIncluded: false })).toBe(false);
  });
  it("non mostra DEMO durante il caricamento", () => {
    expect(isConfirmedModulePreview({ ...incluso, loading: true, limitedPlan: true, moduleIncluded: false })).toBe(false);
  });
  it("mantiene le anteprime dei moduli esclusi da un piano limitato verificato", () => {
    expect(isConfirmedModulePreview({ ...incluso, limitedPlan: true, moduleIncluded: false })).toBe(true);
  });
  it("non marca DEMO un modulo incluso, anche su un piano limitato", () => {
    expect(isConfirmedModulePreview({ ...incluso, limitedPlan: true })).toBe(false);
  });
  it("non trasforma un modulo escluso da un piano completo in anteprima", () => {
    expect(isConfirmedModulePreview({ ...incluso, moduleIncluded: false })).toBe(false);
  });
  it("conserva le eccezioni di presentazione per superadmin e aziende vetrina", () => {
    expect(isConfirmedModulePreview({ ...incluso, limitedPlan: true, moduleIncluded: false, bypass: true })).toBe(false);
  });
  it("risponde al passaggio incluso → timeout → ripristino senza alterare gli stati ricevuti", () => {
    const stati = [incluso, { ...incluso, planResolved: false, moduleIncluded: false }, incluso];
    const prima = structuredClone(stati);
    expect(stati.map(isConfirmedModulePreview)).toEqual([false, false, false]);
    expect(stati).toEqual(prima);
  });
});
