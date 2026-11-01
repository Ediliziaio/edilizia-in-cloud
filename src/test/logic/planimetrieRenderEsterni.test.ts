import { describe, expect, it } from "vitest";
import { vistaDalGiardino } from "@/lib/planimetrie/tred";
import { lasciaFotoDaPianta, MODULI_ESTERNI, prendiFotoDaPianta } from "@/lib/planimetrie/render/fotoDaPianta";
import { formeSimbolo } from "@/lib/planimetrie/esporta/simboli";
import { modelloElemento } from "@/lib/planimetrie/tred/elementi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { materialePavimento } from "@/lib/planimetrie/tred/materiali";

const limiti = { min: [0, 0, 0] as [number, number, number], max: [10, 3, 8] as [number, number, number] };

describe("render degli esterni dalla pianta", () => {
  it("dal giardino: fuori dalla casa, sul lato scelto, poco sopra gli occhi, verso il centro", () => {
    const sud = vistaDalGiardino(limiti, "sud");
    expect(sud.posizione[2]).toBeGreaterThan(8 + 5);
    expect(sud.posizione[1]).toBeCloseTo(2.2);
    expect(sud.guarda).toEqual([5, 1.2, 4]);
    expect(vistaDalGiardino(limiti, "ovest").posizione[0]).toBeLessThan(-5);
  });
  it("la foto passa una volta sola e solo al modulo giusto", () => {
    const f = new File([new Uint8Array([1])], "v.png", { type: "image/png" });
    lasciaFotoDaPianta("piscine", f);
    expect(prendiFotoDaPianta("pergole")).toBeNull();
    expect(prendiFotoDaPianta("piscine")).toBe(f);
    expect(prendiFotoDaPianta("piscine")).toBeNull();
    expect(MODULI_ESTERNI.map((m) => m.percorso)).toContain("/azienda/render/piscine/new");
  });
  it("piscina, pergola e verde hanno simbolo, modello 3D e materiali propri", () => {
    const esterni = CATALOGO.filter((v) => v.gruppo === "Giardino e piscina");
    expect(esterni.map((v) => v.tipo)).toEqual(expect.arrayContaining(["piscina", "pergola", "albero", "siepe", "lettino"]));
    for (const v of esterni) {
      expect(formeSimbolo(v.tipo, v.larghezza, v.profondita).length, v.tipo).toBeGreaterThan(1);
      expect(modelloElemento(v.tipo).nome, v.tipo).not.toBe("Elemento");
    }
    expect(materialePavimento("giardino")).toBe("prato");
  });
});
