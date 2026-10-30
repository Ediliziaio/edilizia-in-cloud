import { describe, expect, it } from "vitest";
import { BILOCALE_ESEMPIO, costruisciScena, daPlanimetria, esportaGlb, esportaObj } from "./index";

const scena = costruisciScena(daPlanimetria(BILOCALE_ESEMPIO), { vista: "confronto" });

function leggiGlb(glb: Uint8Array) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const lJson = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + lJson)));
  const lBin = dv.getUint32(20 + lJson, true);
  return { dv, lJson, json, lBin, tipoBin: dv.getUint32(24 + lJson, true) };
}

describe("GLB", () => {
  const glb = esportaGlb(scena);
  const { dv, lJson, json, lBin, tipoBin } = leggiGlb(glb);

  it("intestazione e blocchi come da specifica glTF 2.0", () => {
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(4, true)).toBe(2);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    expect(lJson % 4).toBe(0);
    expect(tipoBin).toBe(0x004e4942);
    expect(lBin % 4).toBe(0);
    expect(json.buffers[0].byteLength).toBe(lBin);
    expect(20 + lJson + 8 + lBin).toBe(glb.byteLength);
  });

  it("un nodo e una mesh per oggetto, con i nomi della pianta", () => {
    expect(json.nodes).toHaveLength(scena.mesh.length);
    expect(json.meshes.map((m: { name: string }) => m.name)).toContain("Muro m1");
    expect(json.meshes.map((m: { name: string }) => m.name)).toContain("Pavimento Bagno");
    expect(json.materials.map((m: { name: string }) => m.name)).toContain("Muro da demolire");
  });

  it("gli accessori puntano a dati della lunghezza giusta, allineati a 4 byte", () => {
    for (const a of json.accessors) {
      const v = json.bufferViews[a.bufferView];
      const dim = a.type === "VEC3" ? 12 : a.componentType === 5125 ? 4 : 2;
      expect(v.byteLength).toBe(a.count * dim);
      expect(v.byteOffset % 4).toBe(0);
      expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(lBin);
    }
    const triangoli = json.meshes.reduce((s: number, m: { primitives: { indices: number }[] }) => s + json.accessors[m.primitives[0].indices].count / 3, 0);
    expect(triangoli).toBe(scena.mesh.reduce((s, m) => s + m.indici.length / 3, 0));
  });
});

describe("OBJ", () => {
  const { obj, mtl } = esportaObj(scena);

  it("vertici, normali e facce corrispondono alla scena", () => {
    const righe = obj.split("\n");
    const vertici = scena.mesh.reduce((s, m) => s + m.posizioni.length / 3, 0);
    expect(righe.filter((r) => r.startsWith("v ")).length).toBe(vertici);
    expect(righe.filter((r) => r.startsWith("vn ")).length).toBe(vertici);
    expect(righe.filter((r) => r.startsWith("f ")).length).toBe(scena.mesh.reduce((s, m) => s + m.indici.length / 3, 0));
    expect(righe.filter((r) => r.startsWith("o ")).length).toBe(scena.mesh.length);
    const massimo = Math.max(...righe.filter((r) => r.startsWith("f ")).flatMap((r) => r.slice(2).split(" ").map((x) => Number(x.split("//")[0]))));
    expect(massimo).toBe(vertici);
  });

  it("ogni materiale usato è nel file .mtl", () => {
    const usati = new Set(obj.split("\n").filter((r) => r.startsWith("usemtl ")).map((r) => r.slice(7)));
    const definiti = new Set(mtl.split("\n").filter((r) => r.startsWith("newmtl ")).map((r) => r.slice(7)));
    for (const u of usati) expect(definiti.has(u)).toBe(true);
    expect(obj).toMatch(/^o Muro_m1$/m);
  });
});
