import { describe, expect, it } from "vitest";
import { BILOCALE_DA_RISTRUTTURARE, costruisciScena, pianteDaPlanimetria, esportaGlb, esportaObj } from "./index";
import { CAMPIONI_PBR, chiaveMappaPbr } from "./campioniPbr";
import { istanzeGlb } from "./istanzeGlb";
import type { PiantaPer3D } from "./tipi";

const scena = costruisciScena(pianteDaPlanimetria(BILOCALE_DA_RISTRUTTURARE).progetto, { vista: "confronto" });

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

  it("condivide la geometria del catalogo con pose e materiali distinti", () => {
    const sorgente = scena.mesh[0];
    const geometria = { posizioni: [1, 0, 0, 0, 0, 1, 0, 1, 0], normali: [0, 1, 0, 0, 1, 0, 0, 1, 0] };
    const prima = { ...sorgente, posizioni: [12, 0, 0, 10, 0, 4, 10, 3, 0], normali: geometria.normali, indici: [0, 1, 2] };
    const seconda = { ...prima, posizioni: [20, 1, 6, 15, 1, 4, 20, 4, 4], materiale: "seconda-auto" };
    istanzeGlb.set(prima.posizioni, { geometria, posa: { modello: "highland", centro: [10, 0, 0], misure: [2, 3, 4], rotazione: 0 } });
    istanzeGlb.set(seconda.posizioni, { geometria, posa: { modello: "highland", centro: [20, 1, 4], misure: [2, 3, 5], rotazione: Math.PI / 2 } });
    const { json: dati } = leggiGlb(esportaGlb({
      ...scena, mesh: [prima, seconda], materiali: { ...scena.materiali, "seconda-auto": { ...scena.materiali[prima.materiale], colore: "#345678" } },
    }));
    const [a, b] = dati.meshes.map((m: { primitives: unknown[] }) => m.primitives[0]);
    expect(b.attributes).toEqual(a.attributes);
    expect(b.indices).toBe(a.indices);
    expect(b.material).not.toBe(a.material);
    expect(dati.nodes[0]).toMatchObject({ translation: [10, 0, 0], scale: [2, 3, 4] });
    expect(dati.nodes[1]).toMatchObject({ translation: [20, 1, 4], scale: [2, 3, 5] });
    expect(dati.nodes[1].rotation[1]).toBeCloseTo(-Math.sqrt(0.5));
    expect(dati.nodes[1].rotation[3]).toBeCloseTo(Math.sqrt(0.5));

    // I derivati che spostano le geometrie già risolte esportano le nuove coordinate.
    const traslata = { ...prima, posizioni: prima.posizioni.map((v, i) => i % 3 === 1 ? v + 10 : v) };
    const { json: spostata } = leggiGlb(esportaGlb({ ...scena, mesh: [traslata] }));
    expect(spostata.nodes[0].translation).toBeUndefined();
    expect(spostata.accessors[0].min[1]).toBe(10);
  });

  it("incorpora la finitura fotografica e le UV senza cambiare le coordinate della scena", () => {
    const campione = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    const indiceMesh = scena.mesh.findIndex((m) => scena.materiali[m.materiale]?.tessitura?.trama === "rovere");
    expect(indiceMesh).toBeGreaterThanOrEqual(0);

    const conFinitura = esportaGlb(scena, new Map([["rovere", { dati: campione, mimeType: "image/png" }]]));
    const { json: dati, lJson: lunghezzaJson } = leggiGlb(conFinitura);
    const immagine = dati.images[0];
    expect(immagine).toEqual({ name: "rovere", bufferView: 0, mimeType: "image/png" });
    const vistaImmagine = dati.bufferViews[immagine.bufferView];
    const inizio = 28 + lunghezzaJson + vistaImmagine.byteOffset;
    expect(conFinitura.subarray(inizio, inizio + vistaImmagine.byteLength)).toEqual(campione);

    const primitiva = dati.meshes[indiceMesh].primitives[0];
    const attributi = primitiva.attributes;
    const posizioni = dati.accessors[attributi.POSITION];
    const uv = dati.accessors[attributi.TEXCOORD_0];
    const materiale = dati.materials[primitiva.material];
    expect(dati.textures[materiale.pbrMetallicRoughness.baseColorTexture.index].source).toBe(0);
    expect(uv).toMatchObject({ count: posizioni.count, type: "VEC2" });

    const posizionePrima = json.accessors[json.meshes[indiceMesh].primitives[0].attributes.POSITION];
    const vistaPrima = json.bufferViews[posizionePrima.bufferView];
    const vistaDopo = dati.bufferViews[posizioni.bufferView];
    expect(vistaDopo.byteLength).toBe(vistaPrima.byteLength);
    expect(conFinitura.subarray(28 + lunghezzaJson + vistaDopo.byteOffset, 28 + lunghezzaJson + vistaDopo.byteOffset + vistaDopo.byteLength))
      .toEqual(glb.subarray(28 + lJson + vistaPrima.byteOffset, 28 + lJson + vistaPrima.byteOffset + vistaPrima.byteLength));
  });

  it("assegna colore, rugosità e normale del parquet alla stessa proiezione metrica", () => {
    const campione = { dati: new Uint8Array([1, 2, 3, 4]), mimeType: "image/png" } as const;
    const trame = new Map((["colore", "rugosita", "normale"] as const).map(canale => [chiaveMappaPbr("rovere", canale), campione]));
    const { json: dati, dv: binario, lJson: lunghezzaJson } = leggiGlb(esportaGlb(scena, trame));
    const indice = scena.mesh.findIndex(m => m.genere === "pavimento" && scena.materiali[m.materiale]?.tessitura?.trama === "rovere");
    expect(indice).toBeGreaterThanOrEqual(0);
    const primitiva = dati.meshes[indice].primitives[0];
    const { normalTexture, pbrMetallicRoughness } = dati.materials[primitiva.material];
    const nomeImmagine = ({ index }: { index: number }) => dati.images[dati.textures[index].source].name;
    expect(nomeImmagine(pbrMetallicRoughness.baseColorTexture)).toBe("rovere");
    expect(nomeImmagine(pbrMetallicRoughness.metallicRoughnessTexture)).toBe("rovere:rugosita");
    expect(pbrMetallicRoughness.roughnessFactor).toBe(1);
    expect(nomeImmagine(normalTexture)).toBe("rovere:normale");
    expect(normalTexture.scale).toBe(CAMPIONI_PBR.rovere.rilievo);

    const uv = dati.accessors[primitiva.attributes.TEXCOORD_0];
    const inizioUv = 28 + lunghezzaJson + dati.bufferViews[uv.bufferView].byteOffset;
    const { posizioni } = scena.mesh[indice];
    for (let i = 0; i < uv.count; i++) {
      expect(binario.getFloat32(inizioUv + i * 8, true)).toBeCloseTo(posizioni[i * 3] / 1.8);
      expect(binario.getFloat32(inizioUv + i * 8 + 4, true)).toBeCloseTo(1 - posizioni[i * 3 + 2] / 1.8);
    }
  });

  it("esporta l'emissione del sottopensile LED solo quando quel modello è presente", () => {
    const cucina = { id: "cucina", tipo: "cucina", centro: { x: 0, y: 0 }, rotazione: 0 };
    const base: PiantaPer3D = { muri: [], aperture: [], locali: [], elementi: [{ ...cucina, modello: "pensili" }] };
    const normale = leggiGlb(esportaGlb(costruisciScena(base))).json;
    expect(normale.extensionsUsed).toBeUndefined();
    const conLed = leggiGlb(esportaGlb(costruisciScena({ ...base, elementi: [{ ...cucina, modello: "pensili_led" }] }))).json;
    expect(conLed.extensionsUsed).toContain("KHR_materials_emissive_strength");
    const materiale = conLed.materials.find((m: { extras: { chiave: string } }) => m.extras.chiave === "luce_calda");
    expect(materiale.emissiveFactor[0]).toBeCloseTo(1);
    expect(materiale.extensions.KHR_materials_emissive_strength.emissiveStrength).toBeGreaterThan(1);
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

describe("tour 3D in un file", () => {
  it("HTML con il GLB dentro e il titolo protetto", async () => {
    const { tourHtml } = await import("./tourHtml");
    const scena = costruisciScena(pianteDaPlanimetria(BILOCALE_DA_RISTRUTTURARE).progetto!);
    const glb = esportaGlb(scena);
    const html = tourHtml(glb, { titolo: "Casa <Rossi>", azienda: "Impresa" });
    expect(html).toContain("&lt;Rossi&gt;");
    const b64 = html.match(/base64,([A-Za-z0-9+/=]+)"/)![1];
    expect(Buffer.from(b64, "base64").subarray(0, 4).toString()).toBe("glTF");
  });
});
