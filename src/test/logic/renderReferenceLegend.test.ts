import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSharedReferenceLegend } from "../../../supabase/functions/_shared/renderReferenceFetch.ts";

const ROOT = process.cwd();
const edge = (fn: string) => readFileSync(join(ROOT, "supabase", "functions", fn, "index.ts"), "utf8");

const refs = [
  { label: "SHOWER TYPE TARGET — walk_in: a frameless walk-in shower. Copy the shape and construction only", dataUrl: "data:image/webp;base64,AAAA" },
  { label: "WALL TILE EFFECT TARGET — marmo_carrara: white marble. Copy the surface", dataUrl: "data:image/webp;base64,BBBB" },
];

describe("legenda delle foto condivise: numerazione come le immagini vere", () => {
  it("Image 1 è la foto da modificare: le reference partono da Image 2", () => {
    const legend = buildSharedReferenceLegend(refs);
    expect(legend).toContain("Image 1 is the source photo you must edit");
    expect(legend).toContain("Image 2 — SHOWER TYPE TARGET");
    expect(legend).toContain("Image 3 — WALL TILE EFFECT TARGET");
    expect(legend).not.toMatch(/^1\. /m);
  });

  it("con il catalogo dell'azienda davanti la numerazione scala del numero di foto già allegate", () => {
    const legend = buildSharedReferenceLegend(refs, 2 + 2);
    expect(legend).toContain("Image 4 — SHOWER TYPE TARGET");
    expect(legend).toContain("Image 5 — WALL TILE EFFECT TARGET");
    expect(legend).not.toContain("Image 2 —");
  });

  it("dice che le foto sono ingressi invisibili: mai sfondo, mai rettangolo incollato, mai nel risultato", () => {
    const legend = buildSharedReferenceLegend(refs);
    expect(legend).toMatch(/invisible inputs/);
    expect(legend).toMatch(/never copy its background/);
    expect(legend).toMatch(/never paste it as a flat rectangle/);
    expect(legend).toMatch(/never show it in the result/);
  });

  it("senza foto non aggiunge niente al prompt", () => {
    expect(buildSharedReferenceLegend([])).toBe("");
  });
});

describe("generate-*-render: dove stanno le foto e come sono numerate", () => {
  it("bagno: il wizard salva il payload v2, quindi i campi del form si leggono da legacy_config (non dal livello alto)", () => {
    const src = edge("generate-bathroom-render");
    expect(src).toMatch(/collectBathroomReferenceImages\(\(normalizedConfig\.legacy_config/);
    expect(src).toMatch(/normalizedConfig\.legacy_config as \{ catalogo_reference_ids\?: unknown \}/);
    // la lettura dal livello alto era il bug: nessuna foto (né del catalogo né condivisa) arrivava mai al modello
    expect(src).not.toMatch(/collectBathroomReferenceImages\(\(session\.configurazione/);
    expect(src).not.toMatch(/as Record<string, unknown> \| null\)\?\.catalogo_reference_ids/);
  });

  it("bagno e pavimento: le condivise si numerano dopo quelle del catalogo", () => {
    for (const fn of ["generate-bathroom-render", "generate-floor-render"]) {
      const src = edge(fn);
      expect(src, fn).toMatch(/const primaCondivisa = 2 \+ catalogReferences\.length;/);
      expect(src, fn).toMatch(/buildSharedReferenceLegend\(fetched\.references, primaCondivisa\)/);
      // la lunghezza si legge PRIMA di concatenare, altrimenti conterebbe anche le condivise
      expect(src.indexOf("const primaCondivisa"), fn).toBeLessThan(src.indexOf("catalogReferences = [...catalogReferences, ...fetched.references]"));
    }
  });

  it("facciata: il secondo tentativo (QA) riceve le stesse foto citate dalla legenda del prompt", () => {
    const src = edge("generate-facade-render");
    const retry = src.slice(src.indexOf("[QC FAILURE"));
    const chiamata = retry.slice(0, retry.indexOf("directProviderOnly: true"));
    expect(chiamata).toMatch(/referenceImages: sharedReferences/);
  });

  it("ogni edge che allega foto condivise ne accoda la legenda solo se ne ha caricata almeno una", () => {
    for (const fn of ["bathroom", "floor", "facade", "roof", "shutter", "pergola", "pool"]) {
      const src = edge(`generate-${fn}-render`);
      expect(src, fn).toMatch(/fetchSharedReferenceImages\(/);
      expect(src, fn).toMatch(/if \(fetched\.references\.length > 0\) \{[\s\S]{0,400}buildSharedReferenceLegend\(fetched\.references/);
    }
  });
});
