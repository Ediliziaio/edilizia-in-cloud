import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { campioneFinitura, PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture.ts";
import { righeFiniture, bloccoPartenza3D } from "../../../shared/render-planimetria/prompt.ts";
import { daPlanimetria, aPlanimetria, datiVista } from "@/components/planimetrie/editor/adattatore";
import { rinominaStanza } from "@/components/planimetrie/editor/comandi";
import { costruisciScena, pianteDaPlanimetria, type Mesh3D, type PiantaPer3D } from "@/lib/planimetrie/tred";
import { uvFinitura } from "@/lib/planimetrie/tred/uvFiniture";

const documento = () => structuredClone(bilocale) as unknown as Planimetria;

describe("finiture della planimetria", () => {
  it("cambiare una finitura nel progetto non cambia lo stato di fatto, anche dopo riapertura", () => {
    const doc = documento();
    const pianta = daPlanimetria(doc);
    const vista = datiVista(pianta, doc, "fatto").locali[0];
    const nuova = rinominaStanza(pianta, vista.id, vista, { finiture: { pavimento: PAVIMENTI_STANZA[2].descrizione, pareti: "Pittura verde salvia" } }, "progetto");
    const salvato = aPlanimetria(nuova, doc);
    expect(salvato.livelli[0].fatto.locali[0].finiture).toEqual(doc.livelli[0].fatto.locali[0].finiture);
    expect(salvato.livelli[0].proposte[0].locali.find((l) => l.id === vista.id)?.finiture?.pavimento).toBe(PAVIMENTI_STANZA[2].descrizione);
    const riaperto = aPlanimetria(daPlanimetria(salvato), salvato);
    expect(riaperto.livelli[0].proposte[0].locali.find((l) => l.id === vista.id)?.finiture).toEqual(salvato.livelli[0].proposte[0].locali.find((l) => l.id === vista.id)?.finiture);
  });

  it("le descrizioni esistenti restano leggibili e il materiale scelto prevale sul tipo della stanza", () => {
    const doc = documento();
    const l = doc.livelli[0].fatto.locali[0];
    l.finiture = { pavimento: PAVIMENTI_STANZA[3].descrizione, pareti: "pittura bianca" };
    const pianta = pianteDaPlanimetria(doc).fatto;
    const scena = costruisciScena(pianta, { vista: "fatto" });
    const pavimento = scena.mesh.find((m) => m.id === `pavimento:${l.id}`)!;
    expect(scena.materiali[pavimento.materiale].tessitura?.trama).toBe("marmo");
    expect(pianta.locali[0].finiture).toEqual(l.finiture);
    expect(campioneFinitura("gres effetto legno", "pavimento")?.id).toBe("gres_legno");
    expect(campioneFinitura("parquet rovere", "pavimento")?.id).toBe("rovere");
  });

  it("il prompt chiede venature reali e distingue gres effetto legno dal parquet", () => {
    const prompt = righeFiniture({ pavimento: PAVIMENTI_STANZA[2].descrizione, pareti: "marmo Carrara" });
    expect(prompt).toContain("natural wood grain");
    expect(prompt).toContain("wood-look porcelain");
    expect(prompt).toContain("mineral veining");
    expect(bloccoPartenza3D()).toContain("customer-selected material textures");
    expect(righeFiniture({})).toBe("");
  });

  it("la scala delle doghe è in metri e non si dilata allargando la stanza", () => {
    const uv = uvFinitura([0, 0, 0, 0.8, 0, 2.4, 1.6, 0, 4.8], [0, 1, 0, 0, 1, 0, 0, 1, 0], [0.8, 2.4]);
    expect([...uv]).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

function stanza(): PiantaPer3D {
  const punti = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  return {
    muri: punti.map((a, i) => ({ id: `m${i}`, a, b: punti[(i + 1) % 4], spessore: 20, altezza: 270, stato: "esistente" })),
    aperture: [{ id: "porta", muroId: "m0", tipo: "porta", posizione: 200, larghezza: 90, altezza: 210, davanzale: 0, stato: "esistente" }],
    locali: [{ id: "salotto", nome: "Salotto", destinazione: "soggiorno", altezza: 270, contorno: [{ x: 10, y: 10 }, { x: 390, y: 10 }, { x: 390, y: 290 }, { x: 10, y: 290 }], finiture: { pareti: "pittura verde salvia", pavimento: "gres effetto legno" } }],
    elementi: [],
  };
}

function areaMesh(m: Mesh3D): number {
  let area = 0;
  for (let i = 0; i < m.indici.length; i += 3) {
    const [a, b, c] = m.indici.slice(i, i + 3).map((k) => m.posizioni.slice(k * 3, k * 3 + 3));
    const u = b.map((n, j) => n - a[j]), v = c.map((n, j) => n - a[j]);
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return area;
}

describe("finiture nel 3D", () => {
  it("colora solo i lati interni e ritaglia la porta senza alterare il muro esterno", () => {
    const s = costruisciScena(stanza(), { vista: "fatto" });
    const pareti = s.mesh.find((m) => m.id === "finitura:pareti:salotto")!;
    expect(pareti).toBeDefined();
    expect(areaMesh(pareti)).toBeCloseTo(2 * (3.8 + 2.8) * 2.7 - 0.9 * 2.1, 4);
    expect(s.mesh.find((m) => m.id === "muro:m0")?.materiale).toBe("muro");
    for (let i = 0; i < pareti.posizioni.length; i += 3) {
      const [x, , z] = pareti.posizioni.slice(i, i + 3);
      expect(x).toBeGreaterThanOrEqual(0.099);
      expect(x).toBeLessThanOrEqual(3.901);
      expect(z).toBeGreaterThanOrEqual(0.099);
      expect(z).toBeLessThanOrEqual(2.901);
    }
  });

  it("in confronto i colori tecnici non vengono coperti dalle finiture delle pareti", () => {
    expect(costruisciScena(stanza(), { vista: "confronto" }).mesh.some((m) => m.id.startsWith("finitura:pareti:"))).toBe(false);
  });

  it("il rivestimento basso conserva la sua altezza e i vani", () => {
    const p = stanza();
    p.locali[0].finiture!.rivestimento = { materiale: "marmo", altezza: 120 };
    const r = costruisciScena(p, { vista: "fatto" }).mesh.find((m) => m.id === "finitura:rivestimento:salotto")!;
    expect(Math.max(...r.posizioni.filter((_, i) => i % 3 === 1))).toBe(1.2);
    expect(areaMesh(r)).toBeCloseTo(2 * (3.8 + 2.8) * 1.2 - 0.9 * 1.2, 4);
  });
});
