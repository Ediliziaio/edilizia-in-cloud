import { describe, expect, it } from "vitest";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { modelSettingsHref } from "@/components/marketing/preventivi/moduli/salesSelector";
import { normalizeQuoteTemplatesParams } from "@/lib/settingsQuoteTemplatesRoute";
import { SERRAMENTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { TETTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/tettiTemplateModules";
import { FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { FULL_RST_MODULES } from "@/lib/moduli-vendita/fullRstModules";
import { FULL_BGN_MODULES } from "@/lib/moduli-vendita/fullBgnModules";
import { FULL_IDR_MODULES } from "@/lib/moduli-vendita/fullIdrModules";
import { FULL_CLM_MODULES } from "@/lib/moduli-vendita/fullClmModules";
import { FULL_ELT_MODULES } from "@/lib/moduli-vendita/fullEltModules";
import { FULL_PAV_MODULES } from "@/lib/moduli-vendita/fullPavModules";
import { FULL_PSC_MODULES } from "@/lib/moduli-vendita/fullPscModules";
import { FULL_FAC_MODULES } from "@/lib/moduli-vendita/fullFacModules";

// Registri degli editor effettivamente raggiunti da ModuleTemplateLibrary.
// Nessuna copia degli ID dei 68 modelli nel selettore.
const editorModels: Record<string, readonly string[]> = {
  serramenti: SERRAMENTI_TEMPLATE_MODULES.map(item => item.id),
  tetti: TETTI_TEMPLATE_MODULES.map(item => item.id),
  fotovoltaico: FULL_FV_MODULES,
  ristrutturazione: FULL_RST_MODULES,
  bagni: FULL_BGN_MODULES,
  termoidraulico: FULL_IDR_MODULES,
  climatizzazione: FULL_CLM_MODULES,
  elettrico: FULL_ELT_MODULES,
  pavimenti: FULL_PAV_MODULES,
  piscine: FULL_PSC_MODULES,
  cappotto: FULL_FAC_MODULES,
};

describe("destinazioni reali Personalizza PDF", () => {
  it.each(SALES_AREAS.flatMap(area => area.interventions.map(item => ({ area, item, name: `${area.id}/${item.id}` }))))("$name esiste nell'editor destinatario e sopravvive alla normalizzazione URL", ({ area, item }) => {
    const href = modelSettingsHref(area, item);
    expect(href).not.toBeNull();
    const url = new URL(href!, "https://example.test");
    expect(url.pathname).toBe("/azienda/impostazioni/template-preventivi");
    expect(url.searchParams.get("tab")).toBe("moduli-vendita");
    expect(url.searchParams.get("section")).toBe("page_cover");
    const slug = url.searchParams.get("modulo")!;
    expect(editorModels[slug]).toBeDefined();
    expect(editorModels[slug]).toContain(url.searchParams.get("modello"));
    expect(url.searchParams.get("modello")).toBe(item.id);
    expect(normalizeQuoteTemplatesParams(url.searchParams)).toBeNull();
  });

  it.each([
    ["ristrutturazioni", "ristrutturazione"],
    ["termoidraulica", "termoidraulico"],
    ["facciate", "cappotto"],
  ])("mappa l'area %s allo slug impostazioni %s", (id, slug) => {
    const area = SALES_AREAS.find(item => item.id === id)!;
    expect(new URL(modelSettingsHref(area, area.interventions[0])!, "https://example.test").searchParams.get("modulo")).toBe(slug);
  });

  it("non genera link per interventi o aree non registrati", () => {
    const area = SALES_AREAS[0];
    expect(modelSettingsHref(area, { ...area.interventions[0], id: "inesistente" })).toBeNull();
    expect(modelSettingsHref({ ...area, id: "inesistente" }, area.interventions[0])).toBeNull();
  });
});
