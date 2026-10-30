import { describe, expect, it } from "vitest";
import bilocale from "../../../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../../../shared/planimetrie/esempi/trilocale.json";
import { controllaPlanimetria, haErrori } from "../../../../shared/planimetrie/controllo.ts";
import { validaPlanimetria, type Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { BILOCALE_DA_RISTRUTTURARE, costruisciScena, esportaGlb, limitiDi, pianteDaPlanimetria, rotazione3D } from "./index";

const esempi: [string, Planimetria][] = [
  ["bilocale (shared)", bilocale as Planimetria],
  ["trilocale (shared)", trilocale as Planimetria],
  ["bilocale da ristrutturare (3D)", BILOCALE_DA_RISTRUTTURARE],
];

describe("dal modello della fase 1 al 3D", () => {
  it("l'esempio del 3D è una planimetria valida, senza errori geometrici", () => {
    expect(validaPlanimetria(BILOCALE_DA_RISTRUTTURARE).ok).toBe(true);
    expect(controllaPlanimetria(BILOCALE_DA_RISTRUTTURARE).filter((p) => p.gravita === "errore")).toEqual([]);
    expect(haErrori(controllaPlanimetria(BILOCALE_DA_RISTRUTTURARE))).toBe(false);
  });

  for (const [nome, p] of esempi) {
    it(`${nome}: nessun avviso e il 3D misura quanto i muri della pianta`, () => {
      const { fatto, progetto, livello } = pianteDaPlanimetria(p);
      for (const [pianta, vista, stato] of [[fatto, "fatto", livello!.fatto], [progetto, "confronto", livello!.proposte[0] ?? livello!.fatto]] as const) {
        const s = costruisciScena(pianta, { vista });
        expect(s.avvisi).toEqual([]);
        // Ingombro atteso: assi dei muri più metà spessore (i muri di questi esempi sono dritti, in pianta ortogonale).
        const xs = stato.muri.flatMap((m) => [m.p1.x - m.spessore / 2, m.p2.x - m.spessore / 2, m.p1.x + m.spessore / 2, m.p2.x + m.spessore / 2]);
        const ys = stato.muri.flatMap((m) => [m.p1.y - m.spessore / 2, m.p2.y - m.spessore / 2, m.p1.y + m.spessore / 2, m.p2.y + m.spessore / 2]);
        const l = limitiDi(s.mesh, (g) => g === "muro");
        expect(l.min[0]).toBeCloseTo(Math.min(...xs) / 100, 6);
        expect(l.max[0]).toBeCloseTo(Math.max(...xs) / 100, 6);
        // y del modello verso l'alto → z = -y
        expect(l.min[2]).toBeCloseTo(-Math.max(...ys) / 100, 6);
        expect(l.max[2]).toBeCloseTo(-Math.min(...ys) / 100, 6);
        expect(l.max[1]).toBeCloseTo(Math.max(...stato.muri.map((m) => m.altezza)) / 100, 6);
        expect(esportaGlb(s).byteLength).toBeGreaterThan(1000);
      }
    });
  }

  it("aperture: dal vano (offset + larghezza) al centro", () => {
    const { fatto } = pianteDaPlanimetria(bilocale as Planimetria);
    const a1 = (bilocale as Planimetria).livelli[0].fatto.aperture.find((a) => a.id === "a1")!;
    expect(fatto.aperture.find((a) => a.id === "a1")!.posizione).toBe(a1.offset + a1.larghezza / 2);
  });

  it("il fatto non ha le opere della proposta, il progetto sì", () => {
    const { fatto, progetto } = pianteDaPlanimetria(BILOCALE_DA_RISTRUTTURARE);
    expect(fatto.muri.map((m) => m.id)).not.toContain("m7");
    expect(progetto.muri.find((m) => m.id === "m7")!.stato).toBe("nuovo");
    expect(progetto.muri.find((m) => m.id === "m8")!.stato).toBe("demolire");
    expect(fatto.locali.map((l) => l.nome)).toEqual(["Soggiorno", "Camera", "Bagno"]);
  });

  it("rotazione degli elementi: il wc a 180° contro il muro in alto ha il retro verso l'alto della pianta", () => {
    expect(rotazione3D(0)).toBe(180);
    expect(rotazione3D(180)).toBe(0);
    expect(rotazione3D(90)).toBe(90);
    // e2 del bilocale: wc a 180°, vicino al muro in alto (y grande). Il serbatoio (blocco del retro) deve stare verso -z.
    const s = costruisciScena(pianteDaPlanimetria(bilocale as Planimetria).fatto);
    const wc = s.mesh.find((m) => m.riferimento === "e2")!;
    // i vertici del serbatoio sono gli unici sopra la seduta (40 cm)
    const zSerbatoio: number[] = [];
    for (let i = 0; i < wc.posizioni.length; i += 3) if (wc.posizioni[i + 1] > 0.45) zSerbatoio.push(wc.posizioni[i + 2]);
    const centro = -590 / 100;
    expect(zSerbatoio.length).toBeGreaterThan(0);
    expect(Math.max(...zSerbatoio)).toBeLessThan(centro - 0.1);
  });
});
