import { describe, expect, it } from "vitest";
import { SALES_AREAS, findSalesArea, type SalesArea } from "@/lib/moduli-vendita/areas";
import { normalizeQuoteTemplatesParams } from "@/lib/settingsQuoteTemplatesRoute";
import { SERRAMENTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { TETTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/tettiTemplateModules";
import { FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { FULL_RST_MODULES, FULL_PARETI_SOFFITTI_MODULES, FULL_PERGOLE_MODULES, FULL_FACCIATE_MODULES } from "@/lib/moduli-vendita/fullRstModules";
import { FULL_BGN_MODULES } from "@/lib/moduli-vendita/fullBgnModules";
import { FULL_IDR_MODULES } from "@/lib/moduli-vendita/fullIdrModules";
import { FULL_CLM_MODULES } from "@/lib/moduli-vendita/fullClmModules";
import { FULL_ELT_MODULES } from "@/lib/moduli-vendita/fullEltModules";
import { FULL_PAV_MODULES, FULL_GIARDINI_MODULES } from "@/lib/moduli-vendita/fullPavModules";
import { FULL_PSC_MODULES } from "@/lib/moduli-vendita/fullPscModules";
import { FULL_FAC_MODULES } from "@/lib/moduli-vendita/fullFacModules";

// Registri degli editor effettivamente raggiunti da ModuleTemplateLibrary.
// Nessuna copia degli ID dei 68 modelli nel selettore.
const editorModels: Record<string, readonly string[]> = {
  serramenti: SERRAMENTI_TEMPLATE_MODULES.map(item => item.id),
  tetti: TETTI_TEMPLATE_MODULES.map(item => item.id),
  fotovoltaico: FULL_FV_MODULES,
  ristrutturazione: [...FULL_RST_MODULES, ...FULL_PARETI_SOFFITTI_MODULES, ...FULL_PERGOLE_MODULES, ...FULL_FACCIATE_MODULES],
  bagni: FULL_BGN_MODULES,
  termoidraulico: FULL_IDR_MODULES,
  climatizzazione: FULL_CLM_MODULES,
  elettrico: FULL_ELT_MODULES,
  pavimenti: [...FULL_PAV_MODULES, ...FULL_GIARDINI_MODULES],
  piscine: FULL_PSC_MODULES,
  cappotto: FULL_FAC_MODULES,
};

/** Il link della libreria a un modello, come lo costruisce ModuleTemplateLibrary. */
const linkDelModello = (area: SalesArea, modello: string) => {
  const url = new URL(`/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=${area.sourceModule}&modello=${modello}&section=page_cover`, "https://example.test");
  if (findSalesArea(area.sourceModule)?.id !== area.id) url.searchParams.set("area", area.id);
  return url;
};

describe("ogni intervento ha il suo modello nell'editor della libreria", () => {
  it.each(SALES_AREAS.flatMap(area => area.interventions.map(item => ({ area, item, name: `${area.id}/${item.id}` }))))("$name esiste nell'editor destinatario e il link sopravvive alla normalizzazione URL", ({ area, item }) => {
    // La libreria risolve il modulo da sourceModule e il modello dagli interventi.
    expect(editorModels[area.sourceModule]).toBeDefined();
    expect(editorModels[area.sourceModule]).toContain(item.id);
    const params = linkDelModello(area, item.id).searchParams;
    expect(normalizeQuoteTemplatesParams(params)).toBeNull();
    expect((findSalesArea(params.get("area")) ?? findSalesArea(params.get("modulo")))?.id).toBe(area.id);
  });

  it.each([
    ["ristrutturazioni", "ristrutturazione"],
    ["termoidraulica", "termoidraulico"],
    ["facciate", "ristrutturazione"],
    ["giardini", "pavimenti"],
    ["pergole", "ristrutturazione"],
    ["pareti-soffitti", "ristrutturazione"],
  ])("l'area %s apre l'editor %s (area.id non è lo slug delle impostazioni)", (id, slug) => {
    expect(SALES_AREAS.find(item => item.id === id)!.sourceModule).toBe(slug);
  });
});
