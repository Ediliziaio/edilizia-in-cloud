/**
 * Esportazioni 3D: glTF binario (.glb) e OBJ (+ .mtl).
 *
 * Scritte a mano sulla `Scena3D`, senza three.js: girano anche fuori dal browser
 * (test, edge function) e il file è lo stesso che si vede nel visore. Unità: metri,
 * asse Y verso l'alto, come vuole glTF (Blender lo gira da solo in Z verso l'alto).
 */
import type { Materiale3D, Scena3D } from "./tipi";

const GENERATORE = "Edilizia in Cloud — Planimetrie 3D";

/** "#rrggbb" sRGB → componenti lineari (glTF vuole i colori lineari). */
function lineare(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return [c[0], c[1], c[2]];
}

function srgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const allinea4 = (n: number) => (n + 3) & ~3;

export function esportaGlb(scena: Scena3D): Uint8Array {
  const chiaviMateriali = Object.keys(scena.materiali);
  const indiceMateriale = new Map(chiaviMateriali.map((k, i) => [k, i]));

  // Prima passata: dimensioni del buffer.
  type Pezzo = { dati: ArrayBufferView; offset: number; target: number };
  const pezzi: Pezzo[] = [];
  let lunghezza = 0;
  const aggiungi = (dati: ArrayBufferView, target: number) => {
    const offset = lunghezza;
    pezzi.push({ dati, offset, target });
    lunghezza = allinea4(offset + dati.byteLength);
    return pezzi.length - 1;
  };

  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];

  for (const m of scena.mesh) {
    const nVertici = m.posizioni.length / 3;
    const pos = new Float32Array(m.posizioni);
    const nor = new Float32Array(m.normali);
    const grandi = nVertici > 65535;
    const ind = grandi ? new Uint32Array(m.indici) : new Uint16Array(m.indici);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
    const vPos = aggiungi(pos, 34962);
    const vNor = aggiungi(nor, 34962);
    const vInd = aggiungi(ind, 34963);
    const aPos = accessors.push({ bufferView: vPos, componentType: 5126, count: nVertici, type: "VEC3", min, max }) - 1;
    const aNor = accessors.push({ bufferView: vNor, componentType: 5126, count: nVertici, type: "VEC3" }) - 1;
    const aInd = accessors.push({ bufferView: vInd, componentType: grandi ? 5125 : 5123, count: m.indici.length, type: "SCALAR" }) - 1;
    const mesh = meshes.push({
      name: m.nome,
      primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aInd, material: indiceMateriale.get(m.materiale) ?? 0, mode: 4 }],
    }) - 1;
    nodes.push({ name: m.nome, mesh, extras: { genere: m.genere, riferimento: m.riferimento } });
  }

  const materials = chiaviMateriali.map((k) => materialeGltf(k, scena.materiali[k]));
  const json = {
    asset: { version: "2.0", generator: GENERATORE },
    scene: 0,
    scenes: [{ name: "Planimetria", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews: pezzi.map((p) => ({ buffer: 0, byteOffset: p.offset, byteLength: p.dati.byteLength, target: p.target })),
    buffers: [{ byteLength: lunghezza }],
  };
  if (scena.mesh.length === 0) {
    delete (json as Partial<typeof json>).meshes;
    delete (json as Partial<typeof json>).accessors;
    delete (json as Partial<typeof json>).bufferViews;
    delete (json as Partial<typeof json>).buffers;
    delete (json as Partial<typeof json>).nodes;
    json.scenes = [{ name: "Planimetria", nodes: [] }];
  }

  const binario = new Uint8Array(lunghezza);
  for (const p of pezzi) binario.set(new Uint8Array(p.dati.buffer, p.dati.byteOffset, p.dati.byteLength), p.offset);

  const testoJson = new TextEncoder().encode(JSON.stringify(json));
  const lJson = allinea4(testoJson.length);
  const conBinario = lunghezza > 0;
  const totale = 12 + 8 + lJson + (conBinario ? 8 + lunghezza : 0);
  const out = new Uint8Array(totale);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totale, true);
  dv.setUint32(12, lJson, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(testoJson, 20);
  out.fill(0x20, 20 + testoJson.length, 20 + lJson);
  if (conBinario) {
    const o = 20 + lJson;
    dv.setUint32(o, lunghezza, true);
    dv.setUint32(o + 4, 0x004e4942, true); // "BIN\0"
    out.set(binario, o + 8);
  }
  return out;
}

function materialeGltf(chiave: string, m: Materiale3D) {
  const [r, g, b] = lineare(m.colore);
  const trasparente = m.opacita < 1;
  return {
    name: m.nome || chiave,
    pbrMetallicRoughness: { baseColorFactor: [r, g, b, m.opacita], metallicFactor: chiave === "metallo" ? 0.6 : 0, roughnessFactor: m.ruvidita },
    ...(trasparente ? { alphaMode: "BLEND", doubleSided: true } : {}),
  };
}

/** Nome valido in OBJ/MTL: niente spazi né caratteri strani. */
function nomeObj(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "oggetto";
}

export function esportaObj(scena: Scena3D, nomeMtl = "planimetria.mtl"): { obj: string; mtl: string } {
  const righe: string[] = [`# ${GENERATORE}`, "# unita: metri, Y verso l'alto", `mtllib ${nomeMtl}`];
  let base = 1;
  for (const m of scena.mesh) {
    righe.push(`o ${nomeObj(m.nome)}`, `usemtl ${nomeObj(m.materiale)}`);
    const p = m.posizioni;
    const n = m.normali;
    for (let i = 0; i < p.length; i += 3) righe.push(`v ${num(p[i])} ${num(p[i + 1])} ${num(p[i + 2])}`);
    for (let i = 0; i < n.length; i += 3) righe.push(`vn ${num(n[i])} ${num(n[i + 1])} ${num(n[i + 2])}`);
    for (let i = 0; i < m.indici.length; i += 3) {
      const [a, b, c] = [m.indici[i] + base, m.indici[i + 1] + base, m.indici[i + 2] + base];
      righe.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }
    base += p.length / 3;
  }
  const mtl: string[] = [`# ${GENERATORE}`];
  for (const [k, m] of Object.entries(scena.materiali)) {
    const [r, g, b] = srgb(m.colore);
    mtl.push(`newmtl ${nomeObj(k)}`, `Kd ${num(r)} ${num(g)} ${num(b)}`, `Ka 0 0 0`, `Ks 0.05 0.05 0.05`, `d ${num(m.opacita)}`, `illum 2`, "");
  }
  return { obj: righe.join("\n") + "\n", mtl: mtl.join("\n") };
}

function num(x: number): string {
  const r = Math.round(x * 1e5) / 1e5;
  return Object.is(r, -0) ? "0" : String(r);
}
