import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { completeModulePhotography, prepareModulePhotoRefresh } from "@/lib/moduli-vendita/modulePhotography";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createFullBgnTemplate, FULL_BGN_MODULES } from "@/lib/moduli-vendita/fullBgnModules";
import { createFullRstTemplate, FULL_RST_MODULES } from "@/lib/moduli-vendita/fullRstModules";
import { createFullIdrTemplate, FULL_IDR_MODULES } from "@/lib/moduli-vendita/fullIdrModules";
import { createFullFvTemplate, FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { createFullTettiTemplate, FULL_TETTI_MODULES } from "@/lib/moduli-vendita/fullTettiModules";
import { SERRAMENTI_DETAIL_IMAGES } from "@/lib/moduli-vendita/serramentiEditorialPhotography";
import { createFullEltTemplate } from "@/lib/moduli-vendita/fullEltModules";

it.each(Object.entries(SERRAMENTI_DETAIL_IMAGES))("provides and safely refreshes the %s detail page", (id, url) => {
  const template = createFullSerramentiTemplate({}, id as keyof typeof SERRAMENTI_DETAIL_IMAGES);
  const blocks = template.pdf_blocchi as Record<string, any>;
  expect(blocks.comeFunziona).toMatchObject({ foto: [url], senzaFoto: false });
  expect(blocks.modulo_defaults.comeFunziona).toEqual(blocks.comeFunziona);
  expect(blocks.modulo_foto.some((p: { url: string }) => p.url === url)).toBe(true);
  const old = { ...blocks.comeFunziona, foto: [] as string[], senzaFoto: true };
  const defaults = { ...blocks.modulo_defaults, comeFunziona: old };
  const saved = { ...blocks, comeFunziona: { ...old, titolo: "Testo aziendale" }, modulo_defaults: defaults };
  const updated = prepareModulePhotoRefresh(saved, "serramenti", id);
  expect(updated.added).toBe(1);
  expect(updated.blocks.comeFunziona).toMatchObject({ titolo: "Testo aziendale", foto: [url] });
  expect(prepareModulePhotoRefresh(updated.blocks, "serramenti", id).added).toBe(0);
  for (const custom of [null, { ...old, foto: ["/custom.jpg"], senzaFoto: false }]) {
    expect(prepareModulePhotoRefresh({ ...saved, comeFunziona: custom }, "serramenti", id).added).toBe(0);
  }
});
it("replaces the electrical-panel stock detail, not custom photos", () => {
  const blocks = createFullEltTemplate({ company_id: "qa" } as never, "quadro").pdf_blocchi as Record<string, any>;
  const url = "/module-art/elettrico-quadro-dettaglio-v1.jpg";
  expect(blocks.comeFunziona.foto).toEqual([url]);
  const before = { ...blocks.comeFunziona, foto: ["/pdf-stock/fotovoltaico/componenti-elettrici.jpg"] };
  const saved = { ...blocks, comeFunziona: before, modulo_defaults: { ...blocks.modulo_defaults, comeFunziona: before } };
  expect(prepareModulePhotoRefresh(saved, "elettrico", "quadro").blocks.comeFunziona).toMatchObject({ foto: [url] });
  expect(prepareModulePhotoRefresh({ ...saved, comeFunziona: { ...before, foto: [] as string[], senzaFoto: true } }, "elettrico", "quadro").added).toBe(0);
});

it("updates empty defaults while preserving custom copy, images and explicit removal", () => {
  const defaults = { controlli: { titolo: "Prima", foto: [] as string[], senzaFoto: true }, documenti: { foto: [] as string[], senzaFoto: true }, protezione: { foto: [] as string[] }, diario: { foto: [] as string[], senzaFoto: true } };
  const value = { ...defaults, controlli: { ...defaults.controlli, titolo: "Testo personalizzato" }, documenti: { foto: ["data:image/png;base64,mia"], senzaFoto: false }, protezione: { foto: [] as string[], senzaFoto: true }, modulo_defaults: defaults };
  const result = prepareModulePhotoRefresh(value, "ristrutturazione");
  expect(result.added).toBe(2);
  expect(result.blocks.controlli).toMatchObject({ titolo: "Testo personalizzato", senzaFoto: false });
  expect(result.blocks.documenti).toEqual(value.documenti);
  expect(result.blocks.protezione).toEqual(value.protezione);
  expect(value.controlli.foto).toEqual([]);
  expect(prepareModulePhotoRefresh(result.blocks, "ristrutturazione").added).toBe(0);
});
it("does not guess defaults of legacy/custom documents", () => expect(prepareModulePhotoRefresh({ controlli: { senzaFoto: true } }, "serramenti").added).toBe(0));
it("fills older empty terrace defaults with the new flat-roof photos, not pitched-roof fallbacks", () => {
  const defaults = { modulo_intervento: "impermeabilizzazione", protezione: { foto: [] as string[], senzaFoto: true }, controlli: { foto: [] as string[], senzaFoto: true } };
  const result = prepareModulePhotoRefresh({ ...defaults, modulo_defaults: defaults }, "tetti");
  expect(result.added).toBe(2);
  expect(result.blocks.protezione).toMatchObject({ foto: ["/module-art/tetti-terrazzo-protezioni-v1.jpg"] });
  expect(result.blocks.controlli).toMatchObject({ foto: ["/module-art/tetti-terrazzo-raccordi-v1.jpg"] });
});
it("fills an older empty accessible-bathroom closing with the landscape detail", () => {
  const defaults = { modulo_intervento: "accessibilita", pagina_chiusura: { senzaFoto: true }, diario: { foto: [] as string[], senzaFoto: true } };
  const result = prepareModulePhotoRefresh({ ...defaults, modulo_defaults: defaults }, "bagni");
  expect(result.added).toBe(2);
  expect(result.blocks.pagina_chiusura).toMatchObject({ foto: ["/module-art/bagni-accessibilita-chiusura-v1.jpg"] });
  expect(result.blocks.diario).toMatchObject({ foto: ["/module-art/bagni-accessibilita-verifica-supporti-v1.jpg"] });
  expect(prepareModulePhotoRefresh(result.blocks, "bagni").added).toBe(0);
});
it("offers later exact corrections to revision-2 copies without refilling empty pages", () => {
  const defaults = {
    modulo_intervento: "impermeabilizzazione",
    protezione: { foto: ["/pdf-stock/tetti/protezione.jpg"], senzaFoto: false },
    controlli: { foto: ["/pdf-stock/tetti/controllo-termico.jpg"], senzaFoto: false },
    documenti: { foto: [] as string[], senzaFoto: true },
  };
  const value = { ...defaults, modulo_foto_revisione: 2, modulo_defaults: defaults,
    protezione: { ...defaults.protezione, titolo: "Il nostro cantiere", nota: "Didascalia personalizzata" } };
  const before = structuredClone(value);
  const updated = prepareModulePhotoRefresh(value, "tetti", "impermeabilizzazione");
  expect(updated.added).toBe(2);
  expect(updated.blocks.protezione).toMatchObject({ titolo: "Il nostro cantiere", nota: "Didascalia personalizzata", foto: ["/module-art/tetti-terrazzo-protezioni-v1.jpg"] });
  expect(updated.blocks.controlli).toMatchObject({ foto: ["/module-art/tetti-terrazzo-raccordi-v1.jpg"] });
  expect(updated.blocks.documenti).toEqual(defaults.documenti);
  expect(value).toEqual(before);
  expect(prepareModulePhotoRefresh(updated.blocks, "tetti", "impermeabilizzazione").added).toBe(0);
  for (const protezione of [null, { foto: [] as string[], senzaFoto: true }, { foto: ["/mia-foto.jpg"], senzaFoto: false }]) {
    const custom = prepareModulePhotoRefresh({ ...value, protezione }, "tetti");
    expect(custom.added).toBe(1);
    expect(custom.blocks.protezione).toEqual(protezione);
    expect((custom.blocks.modulo_defaults as typeof defaults).protezione).toEqual(defaults.protezione);
  }
  expect(prepareModulePhotoRefresh(value, "tetti", "ripasso").added).toBe(0);
});
it("refreshes known outdated defaults, preserving edited copy and deliberate photo choices", () => {
  const controlli = { titolo: "Controlli", foto: ["/pdf-stock/comune/controllo-finale.jpg"], senzaFoto: false };
  const defaults = { modulo_intervento: "sanitari", controlli };
  const value = { ...defaults, modulo_foto_revisione: 1, modulo_defaults: defaults, controlli: { ...controlli, titolo: "Il mio testo" } };
  const updated = prepareModulePhotoRefresh(value, "bagni");
  expect(updated.added).toBe(1);
  expect(updated.blocks.controlli).toMatchObject({ titolo: "Il mio testo", foto: ["/module-art/bagni-verifica-lavabo-v1.jpg"] });
  expect(prepareModulePhotoRefresh({ ...value, controlli: { ...controlli, foto: ["/mia-foto.jpg"] } }, "bagni").added).toBe(0);
  expect(prepareModulePhotoRefresh({ ...value, controlli: { ...controlli, foto: [] as string[], senzaFoto: true } }, "bagni").added).toBe(0);
  expect(prepareModulePhotoRefresh(updated.blocks, "bagni").added).toBe(0);
});
it.each(["accumulo", "componenti"])("uses electrical rather than roof imagery for FV %s", id => {
  const template = createFullFvTemplate({}, "qa", id as "accumulo" | "componenti");
  const blocks = template.pdf_blocchi as Record<string, any>;
  expect(blocks.controlli.foto).toEqual(["/pdf-stock/fotovoltaico/quadro-elettrico.jpg"]);
  expect(blocks.protezione.foto).toEqual(["/pdf-stock/fotovoltaico/inverter-batteria-garage.jpg"]);
  expect(blocks.diario.foto).not.toEqual(blocks.documenti.foto);
});
it("does not touch customer galleries or before/after evidence", () => {
  const value = { gallery_lavori: [] as unknown[], pagina_confronto: { senzaFoto: true }, controlli: { senzaFoto: true } };
  const result = completeModulePhotography(value, "serramenti");
  expect(result.gallery_lavori).toEqual([]); expect(result.pagina_confronto).toEqual(value.pagina_confronto);
});
const cases = [
  ...FULL_TETTI_MODULES.map(id => ({ name: `Tetti/${id}`, template: createFullTettiTemplate({ company_id: "qa" } as never, id) })),
  ...FULL_SERRAMENTI_MODULES.map(id => ({ name: `Serramenti/${id}`, template: createFullSerramentiTemplate({}, id) })),
  ...FULL_BGN_MODULES.map(id => ({ name: `Bagni/${id}`, template: createFullBgnTemplate({ company_id: "qa" } as never, id) })),
  ...FULL_RST_MODULES.map(id => ({ name: `Ristrutturazioni/${id}`, template: createFullRstTemplate({ company_id: "qa" } as never, id) })),
  ...FULL_IDR_MODULES.map(id => ({ name: `Termoidraulico/${id}`, template: createFullIdrTemplate({ company_id: "qa" } as never, id) })),
  ...FULL_FV_MODULES.map(id => ({ name: `Fotovoltaico/${id}`, template: createFullFvTemplate({}, "qa", id) })),
];
describe.each(cases)("$name", ({ template }) => {
  it("provides actual photos in editorial blocks, all files available locally", () => {
    const blocks = template.pdf_blocchi as Record<string, any>;
    for (const key of ["protezione", "controlli", "documenti", "diario"]) {
      expect(blocks[key].foto.length, key).toBeGreaterThan(0);
      expect(blocks[key].senzaFoto, key).toBe(false);
      for (const url of blocks[key].foto) expect(existsSync(`public${url}`), url).toBe(true);
    }
    for (const photo of blocks.modulo_foto) expect(existsSync(`public${photo.url}`), photo.url).toBe(true);
  });
});
