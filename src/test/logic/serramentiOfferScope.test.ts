import { describe, expect, it } from "vitest";
import { serramentiModuleExclusions } from "@/lib/moduli-vendita/serramentiOfferScope";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
describe("Esclusioni del modulo locale", () => {
  it("propone il testo specifico anche alle vecchie copie", () => {
    expect(serramentiModuleExclusions({ id: "local-serramenti-avvolgibili" })).toContain("collegamenti elettrici");
    expect(serramentiModuleExclusions({ id: "local-serramenti-zanzariere" })).toContain("anticaduta");
  });
  it("rispetta testi personalizzati e rimozione esplicita", () => {
    expect(serramentiModuleExclusions({ id: "local-serramenti-avvolgibili", pdf_blocchi: { modulo_esclusioni: "Esclusioni mie" } })).toBe("Esclusioni mie");
    expect(serramentiModuleExclusions({ id: "local-serramenti-avvolgibili", pdf_blocchi: { modulo_esclusioni: "" } })).toBe("");
  });
  it("non cambia i template online e non inventa un modulo sconosciuto", () => {
    expect(serramentiModuleExclusions({ id: "company-template", pdf_blocchi: { modulo_esclusioni: "Non locale" } })).toBe("");
    expect(serramentiModuleExclusions({ id: "local-serramenti-missing" })).toBe("");
  });
  it("salva il testo nell'edizione nuova senza riutilizzare quello di altri interventi", () => {
    const t = createFullSerramentiTemplate({}, "finestre");
    expect(t.pdf_blocchi?.modulo_esclusioni).toContain("Ripristini murari");
  });
});
