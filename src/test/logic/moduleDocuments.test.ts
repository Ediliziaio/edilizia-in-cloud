import { beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import {
  AREA_DESIGN,
  createModuleDocument,
  DOCUMENT_MODULE_COUNT,
  INTERVENTION_LIMITS,
  documentTextVariants,
  documentImage,
} from "@/lib/moduli-vendita/moduleDocuments";
import {
  documentKey,
  loadModuleDocument,
  saveModuleDocument,
  validateModuleDocument,
} from "@/lib/moduli-vendita/localModuleDocuments";
import { normalizeQuoteTemplatesParams } from "@/lib/settingsQuoteTemplatesRoute";

const company = { name: "Impresa esempio", address: "", email: "", phone: "" };
const seed = (c = "company-a", m = "vasca-doccia") =>
  createModuleDocument(c, "bagni", m, company);
beforeEach(() => localStorage.clear());
describe("documenti dei moduli per intervento", () => {
  // 69 dal 25/09/2026 col Conto Termico 3.0, 70 con la Casa Full Electric (Termoidraulico).
  it("copre 87 interventi di 13 aree, con 74 nuovi modelli oltre ai 13 esistenti", () => {
    expect(DOCUMENT_MODULE_COUNT).toBe(87);
    expect(Object.keys(AREA_DESIGN)).toHaveLength(13);
    expect(Object.keys(INTERVENTION_LIMITS)).toHaveLength(74);
  });
  it.each(
    SALES_AREAS.flatMap((a) =>
      a.interventions.map((m) => [a.id, m.id] as const),
    ),
  )("prepara contenuti e pagine validi per %s/%s", (a, m) => {
    const d = createModuleDocument("company-a", a, m, company);
    expect(() => validateModuleDocument(d, "company-a", a, m)).not.toThrow();
    expect(d.pages).toHaveLength(8);
    expect(d.pages.filter((p) => p.visible)).toHaveLength(7);
    expect(d.pages.find((p) => p.id === "condizioni")?.visible).toBe(false);
    expect(d.image).toBe(documentImage(a, m));
    expect(existsSync(path.resolve("public", d.image!.slice(1)))).toBe(true);
    expect(d.pages.find((p) => p.id === "specifiche")?.items).toHaveLength(4);
    if (!["serramenti", "tetti"].includes(a)) {
      expect(INTERVENTION_LIMITS[`${a}/${m}`]).toBeTruthy();
      expect(d.pages.find((p) => p.id === "perimetro")?.items[1].text).toBe(
        INTERVENTION_LIMITS[`${a}/${m}`],
      );
    }
    for (const p of d.pages)
      expect(new Set(documentTextVariants(d, p).map((v) => v.text)).size).toBe(
        3,
      );
  });
  it("non condivide oggetti modificabili fra modelli", () => {
    const a = seed();
    const b = seed();
    a.company.name = "Modifica";
    a.pages[0].items[0].text = "Modifica";
    expect(b.company.name).toBe(company.name);
    expect(b.pages[0].items[0].text).not.toBe("Modifica");
  });
  it("creare e leggere un modello non salva automaticamente", () => {
    seed();
    expect(loadModuleDocument("company-a", "bagni", "vasca-doccia")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("isola azienda e intervento e conserva le modifiche", () => {
    const a = seed();
    a.title = "Il mio bagno";
    saveModuleDocument(a, null);
    saveModuleDocument(seed("company-b"), null);
    saveModuleDocument(seed("company-a", "completo"), null);
    expect(
      loadModuleDocument("company-a", "bagni", "vasca-doccia")?.document.title,
    ).toBe("Il mio bagno");
    expect(
      loadModuleDocument("company-b", "bagni", "vasca-doccia")?.document.title,
    ).not.toBe("Il mio bagno");
    // Tre modelli distinti. Dal 25/09 nel browser c'è anche l'elenco dei modelli
    // «da mandare online» (archivioModelli.ts): si contano solo i modelli.
    const chiavi = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(chiavi.filter((k) => k?.startsWith("eic:module-document:"))).toHaveLength(3);
  });
  it("rifiuta salvataggi concorrenti, dati corrotti e aziende diverse", () => {
    const a = seed();
    const record = saveModuleDocument(a, null);
    expect(() => saveModuleDocument(a, null)).toThrow("un'altra scheda");
    const bKey = documentKey("company-b", "bagni", "vasca-doccia");
    localStorage.setItem(bKey, JSON.stringify(record));
    expect(() =>
      loadModuleDocument("company-b", "bagni", "vasca-doccia"),
    ).toThrow("altra azienda");
    localStorage.setItem(bKey, "{broken");
    expect(() => saveModuleDocument(seed("company-b"), null)).toThrow();
    expect(localStorage.getItem(bKey)).toBe("{broken");
  });
  it("gestisce quota esaurita senza perdere il documento", () => {
    const d = seed();
    const storage = {
      getItem: () : null => null,
      setItem: () => {
        throw new Error("Quota");
      },
    };
    expect(() => saveModuleDocument(d, null, storage)).toThrow("Spazio locale");
    expect(d.title).toBeTruthy();
  });
  it("rifiuta pagine duplicate, immagini esterne e testi fuori limite", () => {
    const d = seed();
    d.pages.push(d.pages[0]);
    expect(() =>
      validateModuleDocument(d, "company-a", "bagni", "vasca-doccia"),
    ).toThrow();
    const external = { ...seed(), image: "https://example.com/tracker.png" };
    expect(() => saveModuleDocument(external, null)).toThrow();
    expect(() =>
      saveModuleDocument({ ...seed(), title: "x".repeat(121) }, null),
    ).toThrow();
  });
  it("mantiene il nuovo deeplink Facciate al refresh", () => {
    const p = new URLSearchParams(
      "tab=moduli-vendita&modulo=cappotto&modello=balconi",
    );
    expect(normalizeQuoteTemplatesParams(p)).toBeNull();
  });
});
