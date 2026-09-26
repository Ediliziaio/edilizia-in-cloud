import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { FULL_MODULE_COVERS, fullModuleCover } from "@/lib/moduli-vendita/fullModuleCatalog";
import { FULL_SERRAMENTI_MODULES, createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
describe("Catalogo delle edizioni originali", () => {
  it("indica soltanto i moduli implementati e tutte le immagini esistono", () => {
    const all = SALES_AREAS.flatMap(area => area.interventions.map(module => `${area.id}/${module.id}`));
    expect(all).toHaveLength(87);
    expect(Object.keys(FULL_MODULE_COVERS).sort()).toEqual(all.sort());
    for (const url of Object.values(FULL_MODULE_COVERS)) expect(existsSync(`public${url}`)).toBe(true);
  });
  it("usa la stessa copertina dell'edizione e non indica come completi i modelli essenziali", () => {
    for (const id of FULL_SERRAMENTI_MODULES) expect(fullModuleCover("serramenti", id)).toBe(createFullSerramentiTemplate({}, id).pdf_cover_image_url);
    expect(fullModuleCover("bagni", "sconosciuto")).toBeNull();
    expect(fullModuleCover("serramenti", "sconosciuto")).toBeNull();
  });
});
