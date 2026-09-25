import { describe, expect, it, vi } from "vitest";
import { PAGINE_EDITOR_EDILI } from "@/components/preventivi/pagineEditor";
import { edileEditorDestinations, edileSectionDestination, resolveEdileSectionPage } from "@/components/preventivi/pdf/sectionDestinations";

describe("native edile section identity", () => {
  it("covers every page editor, without treating settings/order as a physical page", () => {
    for (const section of PAGINE_EDITOR_EDILI.filter(item => item.id !== "page_ordine")) {
      expect(edileEditorDestinations(section.id).length, section.id).toBeGreaterThan(0);
      if (section.pagina) expect(edileEditorDestinations(section.id)).toContain(edileSectionDestination(section.pagina));
    }
    for (const section of ["page_ordine", "opzioni", "unknown", null]) expect(edileEditorDestinations(section)).toEqual([]);
    expect(edileEditorDestinations("libera:a/b 1")).toEqual(["edile.section.libera%3Aa%2Fb%201"]);
  });
  it("resolves both PDF indirect page references and zero-based integer destinations", async () => {
    const getPageIndex = vi.fn(async () => 5);
    expect(await resolveEdileSectionPage({ numPages: 9, getDestination: async () => [{ num: 50, gen: 0 }], getPageIndex }, "page_controlli")).toBe(6);
    expect(getPageIndex).toHaveBeenCalledWith({ num: 50, gen: 0 });
    expect(await resolveEdileSectionPage({ numPages: 9, getDestination: async () => [0] }, "page_cover")).toBe(1);
  });
  it("has a semantic payment-terms fallback only when the legal appendix is absent", async () => {
    const getDestination = vi.fn(async (id: string) => id.endsWith("investimento") ? [3] : null);
    expect(await resolveEdileSectionPage({ numPages: 9, getDestination }, "page_condizioni")).toBe(4);
    expect(getDestination.mock.calls.map(call => call[0])).toEqual(["edile.section.condizioni", "edile.section.investimento"]);
  });
  it("does not invent a page for hidden, malformed, missing or disposed destinations", async () => {
    for (const destination of [null, [], [-1], [9], [1.5], [{}], ["5"]]) {
      expect(await resolveEdileSectionPage({ numPages: 9, getDestination: async () => destination }, "page_controlli")).toBeNull();
    }
    expect(await resolveEdileSectionPage({ numPages: 9 }, "page_controlli")).toBeNull();
    expect(await resolveEdileSectionPage({ numPages: 9, getDestination: async () => { throw new Error("disposed"); } }, "page_controlli")).toBeNull();
  });
});
