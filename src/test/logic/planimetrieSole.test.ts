import { describe, expect, it } from "vitest";
import { nuovaPlanimetria } from "../../../shared/planimetrie/modello";
import { soleIndicativo } from "../../../shared/planimetrie/orientamento";
import { costruisciScena, pianteDaPlanimetria, pianiDaPlanimetria, scenaEdificio } from "@/lib/planimetrie/tred";

describe("sole con il nord di progetto", () => {
  it("ruota l'azimut mantenendo elevazione e direzione unitaria", () => {
    const est = soleIndicativo(7);
    const ruotato = soleIndicativo(7, 90);
    expect(est.direzione[0]).toBeGreaterThan(.98);
    expect(ruotato.direzione[0]).toBeCloseTo(0);
    expect(ruotato.direzione[2]).toBeLessThan(-.98);
    expect(ruotato.elevazioneGradi).toBe(est.elevazioneGradi);
    expect(Math.hypot(...ruotato.direzione)).toBeCloseTo(1);
    expect(soleIndicativo(13).direzione[2]).toBeGreaterThan(.49);
    expect(soleIndicativo(19).direzione[0]).toBeLessThan(-.98);
  });

  it("mantiene il nord nella singola stanza e nel modello multipiano", () => {
    const doc = nuovaPlanimetria();
    expect(costruisciScena(pianteDaPlanimetria(doc).fatto).nord).toBeUndefined();
    doc.nord = 120;
    doc.livelli.push({ ...doc.livelli[0], id: "p1", nome: "Piano primo", quota: 290 });
    expect(costruisciScena(pianteDaPlanimetria(doc, { livelloId: "p1" }).progetto).nord).toBe(120);
    expect(scenaEdificio(pianiDaPlanimetria(doc)).nord).toBe(120);
  });
});
