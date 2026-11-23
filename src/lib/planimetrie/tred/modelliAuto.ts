import { Box3, DoubleSide, Matrix3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Materiale3D, Mesh3D, ModelloAuto3D, PosizioneAuto3D, Scena3D } from "./tipi";

interface ParteAuto {
  materiale: Materiale3D;
  carrozzeria: boolean;
  chiave: string;
  posizioni: number[];
  normali: number[];
  indici: number[];
  uv?: number[];
}

const cache = new Map<ModelloAuto3D, Promise<ParteAuto[]>>();

function caricaModello(modello: ModelloAuto3D) {
  const esistente = cache.get(modello);
  if (esistente) return esistente;
  const caricato = leggiGlb(modello).catch((errore: unknown) => {
    cache.delete(modello);
    throw errore;
  });
  cache.set(modello, caricato);
  return caricato;
}

async function leggiGlb(modello: ModelloAuto3D): Promise<ParteAuto[]> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene } = await loader.loadAsync(`${import.meta.env.BASE_URL}planimetrie/modelli/auto-${modello}.glb`);
  if (modello === "highland") scene.rotateY(-Math.PI / 2);
  scene.updateMatrixWorld(true);
  const limiti = new Box3().setFromObject(scene, true);
  const centro = limiti.getCenter(new Vector3()), misura = limiti.getSize(new Vector3());
  centro.y = limiti.min.y;
  const pos = new Vector3(), norm = new Vector3();
  const parti = new Map<string, ParteAuto>();
  const geometrie = new Set<Mesh["geometry"]>();
  const materiali = new Set<MeshStandardMaterial>();
  scene.traverse((o) => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return;
    const m = o.material;
    geometrie.add(o.geometry);
    materiali.add(m);
    const posizione = o.geometry.getAttribute("position");
    if (!posizione?.count) return;
    if (!o.geometry.getAttribute("normal")) o.geometry.computeVertexNormals();
    const normale = o.geometry.getAttribute("normal");
    const matrice = new Matrix3().getNormalMatrix(o.matrixWorld);
    const vernice = /^paint(?:E|_body)?$/i.test(m.name) || m.name === "Geohoodsub00021Mtl";
    const parabrezza = /^glass$|^Geoextwindow|^Geodoor[lr]2sub31/i.test(m.name);
    const chiave = vernice ? "carrozzeria" : parabrezza ? `vetro_${m.name}` : m.name || "dettaglio";
    const uv = o.geometry.getAttribute("uv");
    let parte = parti.get(chiave);
    if (!parte) {
      const trama = typeof m.userData.trama === "string" && uv ? m.userData.trama : undefined;
      const colore = m.name === "Tire1Mtl" && !trama ? "#29292a" : "#" + m.color.getHexString();
      parte = { chiave, carrozzeria: vernice, posizioni: [], normali: [], indici: [], ...(trama ? { uv: [] } : {}), materiale: {
        nome: vernice ? "Carrozzeria" : m.name,
        colore,
        ruvidita: vernice ? .27 : parabrezza ? .13 : Math.max(.20, m.roughness),
        metallico: vernice ? Math.max(.39, m.metalness) : m.metalness,
        opacita: parabrezza ? Math.max(.54, m.opacity) : m.opacity,
        doppioLato: m.side === DoubleSide,
        ...(trama ? { tessitura: { trama, metri: [1, 1] } } : {}),
      } };
      parti.set(chiave, parte);
    }
    const inizio = parte.posizioni.length / 3;
    for (let i = 0; i < posizione.count; i++) {
      pos.fromBufferAttribute(posizione, i).applyMatrix4(o.matrixWorld).sub(centro).divide(misura);
      norm.fromBufferAttribute(normale, i).applyNormalMatrix(matrice);
      parte.posizioni.push(pos.x, pos.y, pos.z);
      parte.normali.push(norm.x, norm.y, norm.z);
      if (parte.uv) parte.uv.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
    }
    const indici = o.geometry.getIndex();
    const inverti = o.matrixWorld.determinant() < 0;
    for (let i = 0; i < (indici?.count ?? posizione.count); i += 3) {
      parte.indici.push(inizio + (indici?.getX(i) ?? i),
        inizio + (inverti ? (indici?.getX(i + 2) ?? i + 2) : (indici?.getX(i + 1) ?? i + 1)),
        inizio + (inverti ? (indici?.getX(i + 1) ?? i + 1) : (indici?.getX(i + 2) ?? i + 2)));
    }
  });
  geometrie.forEach(g => g.dispose());
  materiali.forEach(m => m.dispose());
  if (parti.size < 2 || ![misura.x, misura.y, misura.z].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error("Modello auto privo di una geometria valida.");
  }
  return [...parti.values()];
}

function inScala(parte: ParteAuto, auto: PosizioneAuto3D) {
  const posizioni: number[] = [], normali: number[] = [];
  const [x0, y0, z0] = auto.centro, [l, h, p] = auto.misure;
  const c = Math.cos(auto.rotazione), s = Math.sin(auto.rotazione);
  for (let i = 0; i < parte.posizioni.length; i += 3) {
    const x = parte.posizioni[i] * l, z = parte.posizioni[i + 2] * p;
    posizioni.push(x0 + c * x - s * z, y0 + parte.posizioni[i + 1] * h, z0 + s * x + c * z);
    const nx = parte.normali[i] / l, ny = parte.normali[i + 1] / h, nz = parte.normali[i + 2] / p;
    const modulo = Math.hypot(nx, ny, nz) || 1;
    normali.push((c * nx - s * nz) / modulo, ny / modulo, (s * nx + c * nz) / modulo);
  }
  return { posizioni, normali };
}

/** Inserisce la stessa carrozzeria ad alta definizione in visore, fotogramma e GLB per Cycles. */
export async function scenaConModelliAuto(scena: Scena3D): Promise<Scena3D> {
  const auto = scena.mesh.filter((m): m is Mesh3D & { auto: PosizioneAuto3D } => !!m.auto);
  if (!auto.length) return scena;
  const materiali = { ...scena.materiali };
  const prefissi = auto.map(m => m.id.slice(0, -":carrozzeria".length));
  const veicoli = await Promise.all(auto.map(async (m, i) => {
    const parti = await caricaModello(m.auto.modello);
    const prefisso = prefissi[i];
    return parti.map((parte): Mesh3D => {
      const colore = parte.carrozzeria && m.auto.colore ? m.auto.colore : parte.materiale.colore;
      const mat = `auto:${m.auto.modello}:${parte.chiave}:${colore}`;
      materiali[mat] = { ...parte.materiale, colore };
      return { id: `${prefisso}:${parte.chiave}`, riferimento: m.riferimento, materiale: mat,
        nome: `Auto ${m.riferimento} · ${parte.materiale.nome}`, genere: "elemento", stratoEsploso: m.stratoEsploso,
        ...inScala(parte, m.auto), indici: parte.indici, uv: parte.uv, facce: parte.indici.length / 3 };
    });
  }));
  return { ...scena, materiali, mesh: [...scena.mesh.filter(m => !prefissi.some(p => m.id.startsWith(p + ":"))), ...veicoli.flat()] };
}
