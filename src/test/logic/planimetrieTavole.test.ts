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

describe("prospetti e sezioni con il tetto", () => {
  const stato = carica("trilocale.json").livelli[0].fatto;
  const tetto = { tipo: "due_falde" as const, pendenza: 30, sporto: 50 };
  it("il prospetto si alza della falda; la sezione taglia il tetto; il PDF si crea", async () => {
    const senza = disegniDellaTavola(stato);
    const con = disegniDellaTavola(stato, tetto);
    const h = Math.max(...stato.muri.map((m) => m.altezza));
    for (const d of con.slice(0, 4)) {
      expect(d.primitive.some((p) => p.tipo === "poligono")).toBe(true);
      expect(d.maxZ).toBeGreaterThan(h);
    }
    // almeno due prospetti mostrano il colmo sopra la gronda
    expect(con.slice(0, 4).filter((d) => d.maxZ > h + 80).length).toBeGreaterThanOrEqual(2);
    expect(con[4].primitive.some((p) => p.tipo === "poligono" && p.stile === "taglio_tetto")).toBe(true);
    expect(senza.every((d) => d.primitive.every((p) => p.tipo !== "poligono"))).toBe(true);
    const base = await PDFDocument.create();
    base.addPage();
    const r = await accodaTavole(await base.save(), con, { formato: "A3", intestazione: "Prova", primoNumero: 2 });
    expect((await PDFDocument.load(r.dati)).getPageCount()).toBeGreaterThan(1);
  });
});
