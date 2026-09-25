import { describe, expect, it } from "vitest";
import { edileEditorOrder, withEdilePageVisibility } from "@/components/preventivi/edilePageVisibility";
import { edileSectionExcluded } from "@/components/preventivi/templateNavigationState";

const visible = (settings: Parameters<typeof edileEditorOrder>[0], chapter: string) => edileEditorOrder(settings).find(item => item.chiave === chapter)?.visibile;

describe("whole-page visibility across edile editors", () => {
  it("keeps the legacy USP-only page visible without changing its introduction", () => {
    const settings = Object.freeze({ show_chi_siamo: false, usp: [{ titolo: "Un referente" }] });
    expect(visible(settings, "chiSiamo")).toBe(true);
    expect(edileSectionExcluded(settings, "page_chi_siamo")).toBe(false);
    expect(settings.show_chi_siamo).toBe(false);
    expect(edileSectionExcluded({ ...settings, usp: [{ titolo: "  " }] }, "page_chi_siamo")).toBe(true);
  });

  it.each([
    ["chiSiamo", "page_chi_siamo", "show_chi_siamo"],
    ["percorso", "page_percorso", "show_percorso"],
    ["tempi", "page_crono", "show_cronoprogramma"],
  ] as const)("one switch restores %s when both old controls excluded it", (chapter, section, flag) => {
    const original = { [flag]: false, chi_siamo: "Testo aziendale", percorso: [{ titolo: "Sopralluogo" }], pdf_blocchi: { pagina_chiSiamo: { foto: ["/mia-foto.jpg"] } }, pdf_ordine_capitoli: [{ chiave: chapter, visibile: false }] };
    expect(edileSectionExcluded(original, section)).toBe(true);
    const shown = withEdilePageVisibility(original, chapter, true);
    expect(shown[flag]).toBe(true);
    expect(visible(shown, chapter)).toBe(true);
    expect(edileSectionExcluded(shown, section)).toBe(false);
    const hidden = withEdilePageVisibility(shown, chapter, false);
    expect(visible(hidden, chapter)).toBe(false);
    expect(edileSectionExcluded(hidden, section)).toBe(true);
    expect(hidden.pdf_blocchi).toBe(original.pdf_blocchi);
    expect(hidden.percorso).toBe(original.percorso);
    expect(hidden.chi_siamo).toBe(original.chi_siamo);
    expect(original.pdf_ordine_capitoli[0].visibile).toBe(false);
  });

  it.each([["garanzie", "domande"], ["domande", "garanzie"]])("reactivating %s does not activate %s through the shared flag", (chapter, sibling) => {
    const shown = withEdilePageVisibility({ show_garanzie: false }, chapter, true);
    expect(shown.show_garanzie).toBe(true);
    expect(visible(shown, chapter)).toBe(true);
    expect(visible(shown, sibling)).toBe(false);
  });

  it("hides the whole about page, including USP, and preserves unrelated exclusions and custom pages", () => {
    const source = { show_chi_siamo: false, show_percorso: false, usp: [{ titolo: "Valore" }], pdf_pagine_libere: [{ id: "mia", titolo: "La nostra pagina" }], pdf_ordine_capitoli: [{ chiave: "libera:mia", visibile: false }, { chiave: "chiSiamo", visibile: true }] };
    const hidden = withEdilePageVisibility(source, "chiSiamo", false);
    expect(visible(hidden, "chiSiamo")).toBe(false);
    expect(visible(hidden, "percorso")).toBe(false);
    expect(visible(hidden, "libera:mia")).toBe(false);
    expect(hidden.usp).toBe(source.usp);
    expect(edileEditorOrder(hidden).map(item => item.chiave)).toEqual(edileEditorOrder(source).map(item => item.chiave));
  });

  it("never hides investment or invents unknown chapters", () => {
    const settings = { show_percorso: false };
    expect(withEdilePageVisibility(settings, "investimento", false)).toBe(settings);
    expect(withEdilePageVisibility(settings, "unknown", true)).toBe(settings);
  });
});
