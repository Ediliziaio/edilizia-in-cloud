import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CAMPIONI_FINITURE, PAVIMENTI_STANZA, PARETI_STANZA } from "../../../shared/planimetrie/finiture";
import { thumbPath } from "../../../shared/render-references/thumbs";
import { roomVisualChoices } from "../../../shared/render-references/roomVisualCatalog";
import { fotoCampioneFinitura } from "@/lib/planimetrie/campioniFoto";

describe("campioni fotografici della pianta", () => {
  it("ogni finitura ha foto e miniatura disponibili", () => {
    for (const superficie of ["pavimento", "pareti", "soffitto"] as const) for (const c of CAMPIONI_FINITURE[superficie]) {
      const p = fotoCampioneFinitura(c, superficie);
      expect(p, `${superficie}: ${c.nome}`).toBeTruthy();
      expect(existsSync(resolve("public/render-references", p!.folder, p!.filename))).toBe(true);
      expect(existsSync(resolve("public/render-references", thumbPath(p!.folder, p!.filename)))).toBe(true);
    }
  });
  it("noce e rovere usano fotografie diverse", () => {
    expect(fotoCampioneFinitura(PAVIMENTI_STANZA.find((c) => c.id === "noce")!, "pavimento")).not.toEqual(fotoCampioneFinitura(PAVIMENTI_STANZA.find((c) => c.id === "rovere")!, "pavimento"));
  });
  it.each(["salvia", "sabbia"])("la pittura %s usa la stessa foto nell'editor e nelle tavole del motore", (id) => {
    const c = PARETI_STANZA.find((x) => x.id === id)!;
    const p = roomVisualChoices("paint_finish", { verniciatura: { attivo: true, colore_hex: c.colore, finitura: "opaco" } }).find((x) => x.value === "opaco")?.photo;
    expect(p).toEqual(fotoCampioneFinitura(c, "pareti"));
  });
});
