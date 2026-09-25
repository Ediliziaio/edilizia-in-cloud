import { describe, expect, it } from "vitest";
import { createFullTettiTemplate, FULL_TETTI_MODULES } from "@/lib/moduli-vendita/fullTettiModules";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createFullFacTemplate, FULL_FAC_MODULES } from "@/lib/moduli-vendita/fullFacModules";
import { prepareModulePhotoRefresh } from "@/lib/moduli-vendita/modulePhotography";
import { fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";

type Blocks = Record<string, any>;
describe("68 audit fixes: fresh identities and library references", () => {
  it.each(FULL_TETTI_MODULES)("captures Tetti/%s identity without changing the input", id => {
    const base = { company_id: "offline", pdf_blocchi: { custom: "preserve" } };
    const before = structuredClone(base);
    const blocks = createFullTettiTemplate(base as never, id).pdf_blocchi as Blocks;
    expect(blocks.modulo_intervento).toBe(id);
    expect(blocks.modulo_defaults.modulo_intervento).toBe(id);
    expect(base).toEqual(before);
  });
  it("captures the missing Persiane identity", () => {
    const blocks = createFullSerramentiTemplate({}, "persiane").pdf_blocchi as Blocks;
    expect(blocks.modulo_intervento).toBe("persiane");
    expect(blocks.modulo_defaults.modulo_intervento).toBe("persiane");
  });
  it.each(FULL_FAC_MODULES)("Facciate/%s keeps actual assigned photos, with no filtered texture entries", id => {
    const blocks = createFullFacTemplate({ company_id: "offline" }, id).pdf_blocchi as Blocks;
    const urls = blocks.modulo_foto.map((photo: { url: string }) => photo.url);
    expect(fotoDellaLibreria("ristrutturazione", blocks).map(photo => photo.url)).toEqual(urls);
    expect(urls.some((url: string) => url.startsWith("/render-references/"))).toBe(false);
    for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario", "pagina_percorso", "pagina_chiusura"]) {
      expect(blocks[key].foto.length).toBeGreaterThan(0);
      expect(blocks[key].foto.every((url: string) => urls.includes(url))).toBe(true);
    }
    expect(blocks.modulo_defaults.modulo_foto).toEqual(blocks.modulo_foto);
  });
});

const oldUrl = "/pdf-stock/tetti/isolamento.jpg";
const newUrl = "/module-art/tetti.jpg";
function legacy(revision = 2): Blocks {
  const defaults = { pagina_chiusura: { foto: [oldUrl], senzaFoto: false }, documenti: { foto: [] as string[], senzaFoto: true }, modulo_foto: [] as { url: string; nome: string }[] };
  return { ...structuredClone(defaults), modulo_foto_revisione: revision, modulo_defaults: defaults, pagina_chiusura: { ...defaults.pagina_chiusura, titolo: "Il mio titolo" } };
}
describe("explicit local refresh with reliable outer identity", () => {
  it.each([1, 2])("uses known ID on revision %s without mutating input or custom text", revision => {
    const value = legacy(revision), before = structuredClone(value);
    const result = prepareModulePhotoRefresh(value, "tetti", "isolamento");
    expect(result.added).toBeGreaterThan(0);
    expect(result.blocks.pagina_chiusura).toMatchObject({ foto: [newUrl], titolo: "Il mio titolo" });
    expect(result.blocks.modulo_intervento).toBe("isolamento");
    expect((result.blocks.modulo_defaults as Blocks).modulo_intervento).toBe("isolamento");
    expect(value).toEqual(before);
    expect(prepareModulePhotoRefresh(result.blocks, "tetti", "isolamento").added).toBe(0);
  });
  it("on revision 2 retries only exact mapped corrections, not generic fill-ins", () => {
    const value = legacy(), result = prepareModulePhotoRefresh(value, "tetti", "isolamento");
    expect(result.added).toBe(1);
    expect(result.blocks.documenti).toEqual(value.documenti);
  });
  it.each(["custom", "empty", "disabled", "deleted", "null", "photo-field-deleted"])("preserves %s photo choice/removal", mode => {
    const value = legacy();
    if (mode === "custom") value.pagina_chiusura.foto = ["data:image/png;base64,custom"];
    if (mode === "empty") value.pagina_chiusura.foto = [];
    if (mode === "disabled") value.pagina_chiusura.senzaFoto = true;
    if (mode === "deleted") delete value.pagina_chiusura;
    if (mode === "null") value.pagina_chiusura = null;
    if (mode === "photo-field-deleted") delete value.pagina_chiusura.foto;
    const result = prepareModulePhotoRefresh(value, "tetti", "isolamento");
    expect(result.added).toBe(0);
    expect(result.blocks).toEqual(value);
  });
  it("requires old default itself to match the correction", () => {
    const value = legacy();
    value.modulo_defaults.pagina_chiusura.foto = ["/custom.jpg"];
    expect(prepareModulePhotoRefresh(value, "tetti", "isolamento").blocks).toEqual(value);
  });
  it("does not change defaults beneath a removal while applying another valid correction", () => {
    const defaults = {
      pagina_chiusura: { foto: ["/module-art/tetti-impermeabilizzazione-cover.jpg"], senzaFoto: false },
      diario: { foto: ["/pdf-stock/tetti/installazione.jpg"], senzaFoto: false },
    };
    const value = { diario: structuredClone(defaults.diario), modulo_defaults: defaults, modulo_foto_revisione: 2 };
    const result = prepareModulePhotoRefresh(value, "tetti", "impermeabilizzazione");
    expect(result.added).toBe(1);
    expect(result.blocks).not.toHaveProperty("pagina_chiusura");
    expect((result.blocks.modulo_defaults as Blocks).pagina_chiusura).toEqual(defaults.pagina_chiusura);
    expect((result.blocks.modulo_defaults as Blocks).diario.foto).toEqual(["/module-art/tetti-impermeabilizzazione-cover.jpg"]);
  });
  it.each([undefined, "inventato", "persiane"])("does not guess an absent or invalid outer ID (%s)", id => {
    const value = legacy();
    expect(prepareModulePhotoRefresh(value, "tetti", id).blocks).toEqual(value);
  });
  it("rejects conflicting metadata or conflicting outer identity", () => {
    const value = legacy(1);
    value.modulo_intervento = "riparazioni";
    expect(prepareModulePhotoRefresh(value, "tetti", "isolamento").blocks).toEqual(value);
    value.modulo_defaults.modulo_intervento = "isolamento";
    expect(prepareModulePhotoRefresh(value, "tetti").blocks).toEqual(value);
  });
  it("does not infer old defaults in legacy documents", () => {
    const value = { pagina_chiusura: { foto: [oldUrl] } };
    expect(prepareModulePhotoRefresh(value, "tetti", "isolamento").blocks).toEqual(value);
  });
});
