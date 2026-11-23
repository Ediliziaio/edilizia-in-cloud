import { Box3, DoubleSide, Matrix3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { MODELLI_CATALOGO_3D } from "../../../../shared/planimetrie/modelliArredo";
import { istanzeGlb } from "./istanzeGlb";
import type { Materiale3D, Mesh3D, PosizioneModello3D, Scena3D } from "./tipi";

interface ParteModello {
  materiale: Materiale3D;
  tintaModificabile: boolean;
  chiave: string;
  posizioni: number[];
  normali: number[];
  indici: number[];
  uv?: number[];
}

type Sorgente = { posa: NonNullable<Mesh3D["auto"]>; tipo: "auto" }
  | { posa: NonNullable<Mesh3D["arredoCatalogo"]>; tipo: "catalogo" };

const cache = new Map<string, Promise<ParteModello[]>>();

function caricaModello(sorgente: Sorgente) {
  const chiave = `${sorgente.tipo}:${sorgente.posa.modello}`;
  const esistente = cache.get(chiave);
  if (esistente) return esistente;
  const caricato = leggiGlb(sorgente).catch((errore: unknown) => {
    cache.delete(chiave);
    throw errore;
  });
  cache.set(chiave, caricato);
  return caricato;
}

async function leggiGlb(sorgente: Sorgente): Promise<ParteModello[]> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const auto = sorgente.tipo === "auto";
  const file = auto ? `auto-${sorgente.posa.modello}` : sorgente.posa.modello;
  const rotazione = sorgente.tipo === "catalogo" ? MODELLI_CATALOGO_3D[sorgente.posa.modello].rotazione
    : sorgente.posa.modello === "highland" ? -90 : 0;
  const { scene } = await loader.loadAsync(`${import.meta.env.BASE_URL}planimetrie/modelli/${file}.glb`);
  if (rotazione) scene.rotateY(rotazione * Math.PI / 180);
  scene.updateMatrixWorld(true);
  const limiti = new Box3().setFromObject(scene, true);
  const centro = limiti.getCenter(new Vector3()), misura = limiti.getSize(new Vector3());
  centro.y = limiti.min.y;
  const pos = new Vector3(), norm = new Vector3();
  const parti = new Map<string, ParteModello>();
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
    const uv = o.geometry.getAttribute("uv");
    const trama = typeof m.userData.trama === "string" && uv ? m.userData.trama : undefined;
    const vernice = auto && (/^paint(?:E|_body)?$/i.test(m.name) || m.name === "Geohoodsub00021Mtl");
    const parabrezza = auto && /^glass$|^Geoextwindow|^Geodoor[lr]2sub31/i.test(m.name);
    const chiave = vernice ? "carrozzeria" : parabrezza ? `vetro_${m.name}` : (!auto && trama) || m.name || "dettaglio";
    let parte = parti.get(chiave);
    if (!parte) {
      const colore = m.name === "Tire1Mtl" && !trama ? "#29292a" : "#" + m.color.getHexString();
      parte = { chiave, tintaModificabile: vernice || (!auto && m.userData.tintaModificabile === true),
        posizioni: [], normali: [], indici: [], ...(trama ? { uv: [] } : {}), materiale: {
        nome: vernice ? "Carrozzeria" : m.name,
        colore,
        ruvidita: vernice ? .27 : parabrezza ? .13 : Math.max(.20, m.roughness),
        metallico: vernice ? Math.max(.39, m.metalness) : m.metalness,
        opacita: parabrezza ? Math.max(.54, m.opacity) : m.opacity,
        doppioLato: m.side === DoubleSide,
        ...(trama ? { tessitura: { trama, metri: [1, 1], ...(!auto ? { occlusioneMetallo: true } : {}) } } : {}),
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
  if (parti.size < (auto ? 2 : 1) || ![misura.x, misura.y, misura.z].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error("Modello di dettaglio privo di una geometria valida.");
  }
  return [...parti.values()];
}

function inScala(parte: ParteModello, posa: PosizioneModello3D<string>) {
  const posizioni: number[] = [], normali: number[] = [];
  const [x0, y0, z0] = posa.centro, [l, h, p] = posa.misure;
  const c = Math.cos(posa.rotazione), s = Math.sin(posa.rotazione);
  for (let i = 0; i < parte.posizioni.length; i += 3) {
    const x = parte.posizioni[i] * l, z = parte.posizioni[i + 2] * p;
    posizioni.push(x0 + c * x - s * z, y0 + parte.posizioni[i + 1] * h, z0 + s * x + c * z);
    const nx = parte.normali[i] / l, ny = parte.normali[i + 1] / h, nz = parte.normali[i + 2] / p;
    const modulo = Math.hypot(nx, ny, nz) || 1;
    normali.push((c * nx - s * nz) / modulo, ny / modulo, (s * nx + c * nz) / modulo);
  }
  return { posizioni, normali };
}

/** Risolve la stessa geometria di catalogo per il visore, il fotogramma e il GLB. */
export async function scenaConModelliDettagliati(scena: Scena3D): Promise<Scena3D> {
  const istanze = scena.mesh.filter(m => m.auto || m.arredoCatalogo);
  if (!istanze.length) return scena;
  const materiali = { ...scena.materiali };
  const avvisi = new Set(scena.avvisi);
  const sostituzioni = new Map<string, Mesh3D[]>();
  const modelli = await Promise.all(istanze.map(async (m) => {
    const sorgente: Sorgente = m.auto ? { tipo: "auto", posa: m.auto } : { tipo: "catalogo", posa: m.arredoCatalogo! };
    try {
      return { m, sorgente, parti: await caricaModello(sorgente) };
    } catch {
      avvisi.add(`Modello di dettaglio «${sorgente.posa.modello}» non disponibile.`);
      return null;
    }
  }));
  for (const modello of modelli) {
    if (!modello) continue;
    const { m, sorgente: { posa, tipo }, parti } = modello;
    const prefisso = m.id.slice(0, m.id.lastIndexOf(":"));
    sostituzioni.set(prefisso, parti.map((parte): Mesh3D => {
      const tinta = parte.tintaModificabile ? posa.colore : undefined;
      const colore = tinta ?? parte.materiale.colore;
      const mat = `${tipo}:${posa.modello}:${parte.chiave}:${colore}`;
      materiali[mat] = { ...parte.materiale, colore,
        ...(tinta && parte.materiale.tessitura ? { tessitura: { ...parte.materiale.tessitura, tinta } } : {}) };
      const mesh = inScala(parte, posa);
      istanzeGlb.set(mesh.posizioni, { geometria: parte, posa });
      return { id: `${prefisso}:${parte.chiave}`, riferimento: m.riferimento, materiale: mat,
        nome: `${m.nome} · ${parte.materiale.nome}`, genere: "elemento", stratoEsploso: m.stratoEsploso,
        ...mesh, indici: parte.indici, uv: parte.uv, facce: parte.indici.length / 3 };
    }));
  }
  const mesh = scena.mesh.flatMap(m => {
    const parti = sostituzioni.get(m.id.slice(0, m.id.lastIndexOf(":")));
    return !parti ? [m] : m.auto || m.arredoCatalogo ? parti : [];
  });
  return { ...scena, materiali, mesh, avvisi: [...avvisi] };
}
