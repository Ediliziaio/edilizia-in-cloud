import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { accodaTavole, impaginaDisegni } from "@/lib/planimetrie/tavole";
import { disegniDellaTavola } from "@/components/planimetrie/EsportaPiantaDialog";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

describe("tavole: pianta + prospetti + sezione (fase 8)", () => {
  const stato = carica("trilocale.json").livelli[0].fatto;
  const disegni = disegniDellaTavola(stato);

  it("quattro prospetti e una sezione", () => {
    expect(disegni.map((d) => d.titolo)).toEqual(["Prospetto sud", "Prospetto nord", "Prospetto est", "Prospetto ovest", "Sezione A-A"]);
  });

  it("una scala sola per tutti, e ogni disegno sta dentro il foglio", () => {
    const imp = impaginaDisegni(disegni, "A3");
    expect([50, 100, 200]).toContain(imp.scala);
    for (const p of imp.posti) {
      expect(p.x + p.larghezza).toBeLessThanOrEqual(imp.foglio.larghezza - 10 + 0.01);
      expect(p.y + p.altezza).toBeLessThanOrEqual(imp.foglio.altezza - 10 + 0.01);
    }
    // a 1:50 un metro sono 20 mm: la cella è il disegno più 8 mm di aria
    const d = disegni[0], p = imp.posti[0];
    expect(p.larghezza).toBeCloseTo(((d.maxU - d.minU) * 10) / imp.scala + 8, 5);
  });

  it("i disegni dello stesso foglio non si sovrappongono", () => {
    const imp = impaginaDisegni(disegni, "A4");
    for (const a of imp.posti) for (const b of imp.posti) {
      if (a === b || a.foglio !== b.foglio) continue;
      const staccati = a.x + a.larghezza <= b.x || b.x + b.larghezza <= a.x || a.y + a.altezza <= b.y || b.y + b.altezza <= a.y;
      expect(staccati).toBe(true);
    }
  });

  it("la scala chiesta si rispetta se ci sta, altrimenti si passa alla successiva", () => {
    expect(impaginaDisegni(disegni, "A3", 100).scala).toBe(100);
    expect(impaginaDisegni(disegni, "A4", 50).scala).toBeGreaterThanOrEqual(50);
  });

  it("accoda i fogli al PDF della pianta", async () => {
    const base = await PDFDocument.create();
    base.addPage([841.89, 595.28]);
    const r = await accodaTavole(await base.save(), disegni, { formato: "A3", intestazione: "Trilocale — Piano terra «prova»" });
    const doc = await PDFDocument.load(r.dati);
    expect(doc.getPageCount()).toBe(1 + r.fogli);
    expect(r.fogli).toBeGreaterThanOrEqual(1);
  });

  it("senza pareti niente tavola", () => {
    expect(disegniDellaTavola({ ...stato, muri: [] })).toEqual([]);
  });
});
