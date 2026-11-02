import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { creaRilievo, indicizza, leggiRilievo, puntiDelRilievo, triangola } from "../../../shared/planimetrie/rilievo.ts";
import { curveDiLivello, passoCurve, puntiTerreno, quotaTerreno, rettangoloPunti } from "../../../shared/planimetrie/terreno.ts";

/** Un pendio piano che sale di 10 cm ogni metro verso est, in Gauss-Boaga (milioni di metri), quota 250 m. */
function csvPendio(sep = " ") {
  const righe: string[] = ["# punto est nord quota"];
  let k = 1;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 15; j++) righe.push([`P${k++}`, (1_500_000 + i).toFixed(2), (5_000_000 + j).toFixed(2), (250 + i * 0.1).toFixed(3)].join(sep));
  return righe.join("\n");
}

describe("rilievo del topografo", () => {
  it("legge CSV e TXT nei formati soliti", () => {
    expect(leggiRilievo(csvPendio()).punti).toHaveLength(21 * 16);
    expect(leggiRilievo("1;1500000,5;5000000,25;250,10\n2;1500001,0;5000000,0;250,20").punti[0]).toEqual({ x: 1500000.5, y: 5000000.25, z: 250.1 });
    expect(leggiRilievo("1500000.5,5000000.25,250.1").punti[0].z).toBeCloseTo(250.1);
    expect(leggiRilievo("10 1500000 5000000 250 99").punti[0]).toEqual({ x: 1500000, y: 5000000, z: 250 });
  });

  it("legge il DXF: punti, polilinee 3D e curve di livello", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES",
      "0", "POINT", "8", "PUNTI", "10", "100.0", "20", "200.0", "30", "12.5",
      "0", "POLYLINE", "8", "3D", "66", "1",
      "0", "VERTEX", "10", "101", "20", "201", "30", "13",
      "0", "VERTEX", "10", "102", "20", "202", "30", "14",
      "0", "SEQEND",
      "0", "LWPOLYLINE", "8", "CURVE", "38", "15.0", "10", "90", "20", "190", "10", "95", "20", "195",
      "0", "LINE", "10", "1", "20", "1", "30", "0", "11", "2", "21", "2", "31", "0",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const l = leggiRilievo(dxf, "rilievo.dxf");
    expect(l.formato).toBe("dxf");
    expect(l.punti.map((p) => p.z).sort()).toEqual([12.5, 13, 14, 15, 15]);
  });

  it("crea il rilievo centrato; errori chiari senza quote", () => {
    const r = creaRilievo(leggiRilievo(csvPendio()).punti, "pendio.csv");
    expect(r.origine.x).toBeCloseTo(1_500_010, 3);
    expect(Math.abs(r.punti[0][0])).toBeLessThan(1500);
    expect(r.posa.quotaZero).toBeGreaterThan(24_900);
    expect(() => creaRilievo([{ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: 5 }, { x: 0, y: 1, z: 5 }])).toThrow(/stessa quota/);
    expect(() => creaRilievo([{ x: 0, y: 0, z: 5 }])).toThrow(/meno di tre/);
  });

  it("triangolazione: su un piano inclinato la quota interpolata è esatta, e senza «cerchi»", () => {
    const punti = Array.from({ length: 200 }, (_, i) => { const x = (i * 7919) % 1000, y = (i * 104729) % 1000; return { x, y, quota: 0.1 * x }; });
    const tin = indicizza(triangola(punti));
    expect(tin.triangoli.length).toBeGreaterThan(300);
    for (const [x, y] of [[500, 500], [123, 456], [800, 200]]) {
      const q = tin.cerca(x, y);
      if (q !== null) expect(q).toBeCloseTo(0.1 * x, 6);
    }
    expect(quotaTerreno(punti, 500, 500)).toBeCloseTo(50, 3);
  });

  it("nella pianta: si salva, si sposta e ruota, fa il terreno 3D e le curve", () => {
    let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
    p = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 800, y: 600 })).pianta;
    const base = aPlanimetria(p, nuovaPlanimetria("Casa sul pendio"));
    const r = creaRilievo(leggiRilievo(csvPendio()).punti, "pendio.csv");
    const doc = { ...base, rilievo: { ...r, posa: { ...r.posa, dx: 400, dy: -300, quotaZero: 25_100 } } };
    expect(validaPlanimetria(doc).ok).toBe(true);
    expect(validaPlanimetria({ ...doc, rilievo: { ...doc.rilievo, punti: [[1, 2]] } }).ok).toBe(false);
    const pts = puntiTerreno(doc);
    expect(pts).toHaveLength(21 * 16);
    // al centro del rilievo (sotto la casa) la quota è 251 - 251 = 0
    expect(quotaTerreno(pts, 400, -300)).toBeCloseTo(0, 0);
    // ruotato di 90°: il pendio sale verso nord invece che verso est
    const girato = puntiDelRilievo({ ...doc.rilievo, posa: { ...doc.rilievo.posa, rotazione: 90 } });
    expect(quotaTerreno(girato, 400, -300 + 500)).toBeGreaterThan(quotaTerreno(girato, 400, -300 - 500));
    expect(passoCurve(pts)).toBe(50);
    expect(curveDiLivello(pts, rettangoloPunti(pts, 0)!, 50).length).toBeGreaterThan(10);
    const s = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto", terreno: 5 });
    const ys = s.mesh.find((m) => m.id === "terreno")!.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1.5);
    expect(vistaDaPlanimetria(doc, { modo: "fatto" }).terreno?.curve.length).toBeGreaterThan(10);
  });
});

describe("aggancio a due punti noti", () => {
  it("rotazione e spostamento ritrovati; scarto se le distanze non tornano", async () => {
    const { posaDaDuePunti } = await import("../../../shared/planimetrie/rilievo.ts");
    const r = creaRilievo(leggiRilievo(csvPendio()).punti, "pendio.csv");
    // due punti del topografo e i loro corrispondenti sulla pianta, ruotati di 90°
    const A = { x: 1_500_000, y: 5_000_000 }, B = { x: 1_500_010, y: 5_000_000 };
    const ris = posaDaDuePunti(r, [{ topo: A, pianta: { x: 0, y: 0 } }, { topo: B, pianta: { x: 0, y: 1000 } }]);
    expect(ris.rotazione).toBeCloseTo(90, 3);
    expect(ris.scarto).toBe(0);
    const messo = puntiDelRilievo({ ...r, posa: { ...r.posa, ...ris } });
    // il primo punto del file (est 1.500.000, nord 5.000.000) finisce sullo spigolo (0, 0)
    expect(Math.hypot(messo[0].x, messo[0].y)).toBeLessThan(1);
    expect(posaDaDuePunti(r, [{ topo: A, pianta: { x: 0, y: 0 } }, { topo: B, pianta: { x: 0, y: 1200 } }]).scarto).toBe(200);
  });
});
