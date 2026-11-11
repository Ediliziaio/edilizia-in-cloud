import { describe, expect, it } from "vitest";
import bilocale from "../../../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../../../shared/planimetrie/esempi/trilocale.json";
import { controllaPlanimetria, haErrori } from "../../../../shared/planimetrie/controllo.ts";
import { validaPlanimetria, type Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { BILOCALE_DA_RISTRUTTURARE, costruisciScena, esportaGlb, limitiDi, pianteDaPlanimetria, rotazione3D } from "./index";
import { daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { rotazioneVista } from "../esporta/adattatore";

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

  it.each([0, 90, 180, 270, -90, 37])("a %s° il retro del WC coincide fra editor, modello 3D e PDF", (rotazione) => {
    const doc = structuredClone(bilocale) as Planimetria, elemento = doc.livelli[0].fatto.elementi.find((e) => e.id === "e2")!;
    elemento.rotazione = rotazione;
    const prima = structuredClone(doc), vista2D = daPlanimetria(doc).elementi.find((e) => e.id === "e2")!;
    const pianta = pianteDaPlanimetria(doc).fatto, elemento3D = pianta.elementi.find((e) => e.id === "e2")!;
    const a = vista2D.rotazione * Math.PI / 180;
    expect(Math.cos(elemento3D.rotazione * Math.PI / 180)).toBeCloseTo(Math.cos(a));
    expect(Math.sin(elemento3D.rotazione * Math.PI / 180)).toBeCloseTo(Math.sin(a));
    expect(rotazioneVista(rotazione)).toBe(rotazione3D(rotazione));
    const wc = costruisciScena(pianta).mesh.find((m) => m.riferimento === "e2")!, serbatoio: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < wc.posizioni.length; i += 3) if (wc.posizioni[i + 1] > .45) serbatoio.push({ x: wc.posizioni[i] - elemento3D.centro.x / 100, z: wc.posizioni[i + 2] - elemento3D.centro.y / 100 });
    const x = serbatoio.reduce((s, p) => s + p.x, 0) / serbatoio.length, z = serbatoio.reduce((s, p) => s + p.z, 0) / serbatoio.length;
    expect(x * Math.sin(a) - z * Math.cos(a)).toBeGreaterThan(.1);
    expect(x * Math.cos(a) + z * Math.sin(a)).toBeCloseTo(0);
    expect(doc).toEqual(prima);
  });
});
