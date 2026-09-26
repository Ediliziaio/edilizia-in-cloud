/**
 * I modelli della libreria collegati ai preventivatori edili (25/09/2026).
 *
 * Prima solo Tetti e Serramenti usavano il modello dell'intervento: in Bagni,
 * Climatizzazione, Elettrico, Termoidraulico, Pavimenti, Piscine e Ristrutturazione
 * gli interventi della finestra «Nuovo preventivo» erano tutti «Collegamento in
 * preparazione», e i modelli personalizzati non finivano in nessun PDF. Ora il
 * preventivo nato da un intervento congela il modello (lib/moduli/modelloPreventivo)
 * e il PDF usa quello.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MODULI_CON_MODELLI, TABELLA_PREVENTIVI, TIPO_INTERVENTO_DEL_MODELLO, creaModelloPreventivo, interventiDelModulo,
  leggiModelloPreventivo, templateDelPreventivo, type ModuloConModelli,
} from "@/lib/moduli/modelloPreventivo";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";
import { quoteBuilder } from "@/lib/moduli-vendita/quoteBuilders";
import { FULL_BGN_MODULES, createFullBgnTemplate } from "@/lib/moduli-vendita/fullBgnModules";
import { FULL_CLM_MODULES, createFullClmTemplate } from "@/lib/moduli-vendita/fullClmModules";
import { FULL_ELT_MODULES, createFullEltTemplate } from "@/lib/moduli-vendita/fullEltModules";
import { FULL_IDR_MODULES, createFullIdrTemplate } from "@/lib/moduli-vendita/fullIdrModules";
import { FULL_PAV_MODULES, createFullPavTemplate } from "@/lib/moduli-vendita/fullPavModules";
import { FULL_PSC_MODULES, createFullPscTemplate } from "@/lib/moduli-vendita/fullPscModules";
import { FULL_RST_MODULES, FULL_PARETI_SOFFITTI_MODULES, createFullRstTemplate } from "@/lib/moduli-vendita/fullRstModules";
import { FULL_FV_MODULES, createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import type { FvTemplate } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";
import { MODELLI_FOTOVOLTAICO, modelloFotovoltaico } from "../../../supabase/functions/_shared/modelloFotovoltaico";
import type { BgnTemplatePdf } from "@/types/bagni";
import type { ClmTemplatePdf } from "@/types/climatizzazione";
import type { EleTemplatePdf } from "@/types/elettrico";
import type { IdrTemplatePdf } from "@/types/termoidraulico";
import type { PisTemplatePdf } from "@/types/piscine";
import type { RstTemplatePdf } from "@/types/ristrutturazione";

const AZIENDA = "5b0f7c2e-8d1a-4c3b-9e6f-1a2b3c4d5e6f";
const ALTRA = "9c8d7e6f-5a4b-4c3d-8e2f-0a1b2c3d4e5f";
const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const base = { id: "online", company_id: AZIENDA, default_iva_pct: 22 };

/** Per ogni preventivatore: cartella, nome dei file, modelli completi e come si creano. */
const MODULI: Record<ModuloConModelli, { dir: string; H: string; ids: readonly string[]; crea: (id: string) => object }> = {
  bagni: { dir: "bagni", H: "Bagni", ids: FULL_BGN_MODULES, crea: (id) => createFullBgnTemplate(base as BgnTemplatePdf, id as typeof FULL_BGN_MODULES[number]) },
  climatizzazione: { dir: "climatizzazione", H: "Climatizzazione", ids: FULL_CLM_MODULES, crea: (id) => createFullClmTemplate(base as ClmTemplatePdf, id as typeof FULL_CLM_MODULES[number]) },
  elettrico: { dir: "elettrico", H: "Elettrico", ids: FULL_ELT_MODULES, crea: (id) => createFullEltTemplate(base as EleTemplatePdf, id as typeof FULL_ELT_MODULES[number]) },
  termoidraulico: { dir: "termoidraulico", H: "Termoidraulico", ids: FULL_IDR_MODULES, crea: (id) => createFullIdrTemplate(base as IdrTemplatePdf, id as typeof FULL_IDR_MODULES[number]) },
  pavimenti: { dir: "pavimenti", H: "Pavimenti", ids: FULL_PAV_MODULES, crea: (id) => createFullPavTemplate({ company_id: AZIENDA }, id as typeof FULL_PAV_MODULES[number]) },
  piscine: { dir: "piscine", H: "Piscine", ids: FULL_PSC_MODULES, crea: (id) => createFullPscTemplate(base as PisTemplatePdf, id as typeof FULL_PSC_MODULES[number]) },
  ristrutturazione: { dir: "ristrutturazione", H: "Ristrutturazione", ids: [...FULL_RST_MODULES, ...FULL_PARETI_SOFFITTI_MODULES], crea: (id) => createFullRstTemplate(base as RstTemplatePdf, id as typeof FULL_RST_MODULES[number]) },
};

/** I valori del menu «Tipo di intervento» dello step Immobile. */
function tipiDelMenu(dir: string, H: string): string[] {
  const codice = leggi(`src/pages/azienda/${dir}/${H}Wizard/StepImmobile.tsx`);
  const blocco = codice.slice(codice.indexOf("const TIPI_INTERVENTO = ["), codice.indexOf("];", codice.indexOf("const TIPI_INTERVENTO = [")));
  return [...blocco.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);
}

describe.each(MODULI_CON_MODELLI)("%s: il modello dell'intervento", (modulo) => {
  const { dir, H, ids, crea } = MODULI[modulo];

  it("gli interventi della libreria sono tutti modelli completi", () => {
    expect([...interventiDelModulo(modulo).map((i) => i.id)].sort()).toEqual([...ids].sort());
  });

  it("ogni intervento ha un tipo che esiste nel menu del preventivatore", () => {
    const menu = tipiDelMenu(dir, H);
    expect(menu.length).toBeGreaterThan(3);
    for (const id of ids) expect(menu, `${modulo}/${id}`).toContain(TIPO_INTERVENTO_DEL_MODELLO[modulo][id]);
  });

  it.each(ids)("%s si congela nel preventivo e si rilegge", (id) => {
    const template = crea(id) as { pdf_blocchi?: Record<string, unknown> };
    const snapshot = creaModelloPreventivo(modulo, AZIENDA, id, template);
    expect(leggiModelloPreventivo(modulo, snapshot, AZIENDA)).toBe(snapshot);
    const blocchi = (snapshot.template as { pdf_blocchi: Record<string, unknown> }).pdf_blocchi;
    expect(blocchi.modulo_intervento).toBe(id);
    expect(blocchi).not.toHaveProperty("modulo_defaults");
    expect(blocchi).not.toHaveProperty("modulo_foto");
    // La copia non tocca il modello di partenza.
    expect(template.pdf_blocchi?.modulo_intervento).toBe(id);
  });

  it("un modello di un'altra azienda, di un altro intervento o rovinato ferma il preventivo", () => {
    const snapshot = creaModelloPreventivo(modulo, AZIENDA, ids[0], crea(ids[0]));
    expect(() => leggiModelloPreventivo(modulo, snapshot, ALTRA)).toThrow(/non è valido o è di un'altra azienda/);
    expect(() => leggiModelloPreventivo(modulo, { ...snapshot, modelId: "ripasso" }, AZIENDA)).toThrow();
    expect(() => leggiModelloPreventivo(modulo, { ...snapshot, version: 2 }, AZIENDA)).toThrow();
    expect(() => leggiModelloPreventivo(modulo, { ...snapshot, template: { ...snapshot.template, company_id: ALTRA } }, AZIENDA)).toThrow();
    expect(() => leggiModelloPreventivo(modulo, { ...snapshot, modelId: ids[1] }, AZIENDA)).toThrow();
    expect(leggiModelloPreventivo(modulo, null, AZIENDA)).toBeNull();
  });

  it("la finestra «Nuovo preventivo» apre il preventivatore col modello", () => {
    const area = SALES_AREAS.find((a) => a.sourceModule === modulo)!;
    const href = MODULI_VENDITA.find((m) => m.slug === modulo)!.href;
    for (const intervento of area.interventions) {
      expect(quoteBuilder(area, intervento)).toMatchObject({ connected: true, modelId: intervento.id, path: `${href}/nuovo` });
    }
  });

  it("preventivatore, salvataggio, duplicazione e PDF usano il modello congelato", () => {
    const wizard = leggi(`src/pages/azienda/${dir}/${H}Wizard.tsx`);
    expect(wizard).toContain(`useSupportoModelloPreventivo("${modulo}")`);
    expect(wizard).toContain(`creaModelloPreventivo("${modulo}", companyId, model.id, source)`);
    expect(wizard).toContain(`await sincronizzaModelliAzienda(companyId)`);
    expect(wizard).toContain(`upsertMut.mutateAsync(await createInput())`);
    expect(wizard).toContain(`<StepImmobile form={form} onChange={onChange} model={model} />`);
    expect(wizard).toMatch(/<StepComputo[\s\S]*?model=\{model\}/);
    const progetto = leggi(`src/hooks/use${H}Progetto.ts`);
    expect(progetto).toContain("delete campi.modello_snapshot;");
    expect(progetto).toContain(`leggiModelloPreventivo("${modulo}", patch.modello_snapshot, companyId);`);
    expect(progetto).toContain(`modello_snapshot: leggiModelloPreventivo("${modulo}", src.modello_snapshot, companyId)`);
    expect(leggi(`src/hooks/use${H}PDF.ts`)).toContain(`templateDelPreventivo("${modulo}", progetto, opts.template, get`);
    expect(leggi(`src/pages/azienda/${dir}/${H}Wizard/StepImmobile.tsx`)).toContain("{model ? <InterventoScelto intervento={model} /> : <Select");
    expect(leggi(`src/pages/azienda/${dir}/${H}Wizard/StepComputo.tsx`)).toContain("{model && <LavorazioniDelModello intervento={model} />}");
  });
});

describe("il PDF del preventivo", () => {
  it("usa il modello congelato prima della bozza e del modello aziendale", async () => {
    const modello = createFullBgnTemplate(base as BgnTemplatePdf, "vasca-doccia");
    const snapshot = creaModelloPreventivo("bagni", AZIENDA, "vasca-doccia", modello);
    const carica = vi.fn(async () => ({ ...base, cover_title: "Aziendale" }) as BgnTemplatePdf);
    const bozza = { ...base, cover_title: "Bozza" } as BgnTemplatePdf;
    const usato = await templateDelPreventivo("bagni", { company_id: AZIENDA, modello_snapshot: snapshot }, bozza, carica);
    expect(usato.cover_title).toBe(modello.cover_title);
    expect(carica).not.toHaveBeenCalled();
    expect(await templateDelPreventivo("bagni", { company_id: AZIENDA, modello_snapshot: null }, bozza, carica)).toBe(bozza);
    expect((await templateDelPreventivo("bagni", { company_id: AZIENDA }, null, carica)).cover_title).toBe("Aziendale");
  });

  it("un modello rovinato non diventa il PDF generico", async () => {
    const carica = vi.fn(async () => base as BgnTemplatePdf);
    await expect(templateDelPreventivo("bagni", { company_id: AZIENDA, modello_snapshot: { version: 1 } }, null, carica)).rejects.toThrow();
    expect(carica).not.toHaveBeenCalled();
  });
});

describe("la colonna del modello nel database", () => {
  const cartella = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith("_modelli_preventivo_moduli_edili.sql"));
  const sql = file ? readFileSync(resolve(cartella, file), "utf8") : "";
  // Una migrazione successiva può rifare il vincolo di una tabella con un
  // intervento in più (Conto Termico, 20280926004500): vale l'ultima.
  const successive = readdirSync(cartella).filter((f) => f > (file ?? "") && f.endsWith(".sql")).sort()
    .map((f) => readFileSync(resolve(cartella, f), "utf8")).filter((testo) => testo.includes("_modello_valido"));

  it("c'è in ogni tabella, con gli stessi interventi della libreria", () => {
    expect(file).toBeDefined();
    for (const modulo of MODULI_CON_MODELLI) {
      const cerca = new RegExp(`\\('${TABELLA_PREVENTIVI[modulo]}', array\\[([^\\]]+)\\]\\)`);
      const riga = [...successive].reverse().map((testo) => testo.match(cerca)).find(Boolean) ?? sql.match(cerca);
      expect(riga, modulo).not.toBeNull();
      const nelDb = [...riga![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect(nelDb, modulo).toEqual(interventiDelModulo(modulo).map((i) => i.id).sort());
    }
  });

  it("non si sostituisce dopo la creazione", () => {
    expect(sql).toContain("if new.modello_snapshot is distinct from old.modello_snapshot then");
    expect(sql).toContain("before update of modello_snapshot");
    expect(sql).toContain("revoke all on function public.preventivo_modello_immutabile() from public, anon, authenticated");
  });
});

describe("Fotovoltaico: il modello nasce col progetto, dal server", () => {
  const baseFv = { company_id: AZIENDA } as unknown as FvTemplate;

  it("gli interventi della libreria sono tutti modelli completi", () => {
    expect([...interventiDelModulo("fotovoltaico").map((i) => i.id)].sort()).toEqual([...FULL_FV_MODULES].sort());
    expect([...MODELLI_FOTOVOLTAICO].sort()).toEqual([...FULL_FV_MODULES].sort());
  });

  it.each(FULL_FV_MODULES)("%s: il modello dell'app lo accetta anche il server", (id) => {
    const snapshot = creaModelloPreventivo("fotovoltaico", AZIENDA, id, createFullFvTemplate(baseFv, AZIENDA, id));
    expect(leggiModelloPreventivo("fotovoltaico", snapshot, AZIENDA)).toBe(snapshot);
    expect(modelloFotovoltaico(JSON.parse(JSON.stringify(snapshot)), AZIENDA)).toMatchObject({ modelId: id, companyId: AZIENDA });
    expect(modelloFotovoltaico(snapshot, ALTRA)).toBe(false);
    expect(modelloFotovoltaico({ ...snapshot, modelId: "vasca-doccia" }, AZIENDA)).toBe(false);
    expect(modelloFotovoltaico(null, AZIENDA)).toBeNull();
  });

  it("il preventivatore manda il modello alla creazione e non riprende una bozza generica", () => {
    const wizard = leggi("src/pages/azienda/fotovoltaico/FotovoltaicoWizard.tsx");
    expect(wizard).toContain('creaModelloPreventivo("fotovoltaico", effectiveCompanyId, modelloRichiesto.id, source)');
    expect(wizard).toContain("const modello_snapshot = await modelloDaCongelare();");
    expect(wizard).toMatch(/"fv-onboarding-cliente",[\s\S]*?modello_snapshot,\n/);
    expect(wizard).toContain("!id && !progettoId && !requestedModel && ultimaBozza");
    expect(wizard).toContain("await sincronizzaModelliAzienda(effectiveCompanyId)");
  });

  it("il server salva il modello col progetto, lo controlla e non lo scrive nel registro", () => {
    const creazione = leggi("supabase/functions/fv-onboarding-cliente/index.ts");
    expect(creazione).toContain("const modello = modelloFotovoltaico(modelloRichiesto, company_id);");
    expect(creazione).toContain("...(modello ? { modello_snapshot: modello } : {}),");
    expect(creazione).not.toMatch(/logFunction\([^)]*, payload, /);
    const pdf = leggi("supabase/functions/fv-genera-pdf/index.ts");
    expect(pdf).toContain("iva_aliquota, modello_snapshot\"");
    expect(pdf).toContain("modelloDelPreventivo?.template ?? templateRes.data ?? {}");
    expect(pdf).toContain("if (modelloDelPreventivo === false)");
  });

  it("la colonna c'è, con gli stessi interventi, e non si sostituisce", () => {
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const file = readdirSync(cartella).find((f) => f.endsWith("_modelli_preventivo_fotovoltaico.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(resolve(cartella, file!), "utf8");
    const nelDb = [...sql.match(/'modelId' in \(([^)]+)\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(nelDb).toEqual([...FULL_FV_MODULES].sort());
    expect(sql).toContain("execute function public.preventivo_modello_immutabile()");
  });
});
