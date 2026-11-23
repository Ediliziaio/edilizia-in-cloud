/**
 * Dalla `Scena3D` (pura) agli oggetti three.js, più le luci.
 *
 * Questo file importa three.js: va caricato solo dalla pagina del 3D (vedi
 * `Vista3DPigra.tsx`), mai dal bundle principale.
 */
import * as THREE from "three";
import { textureFiniture } from "./textureFiniture";
import { uvFinitura } from "@/lib/planimetrie/tred/uvFiniture";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Materiale3D, Mesh3D, Scena3D, Telecamera3D } from "@/lib/planimetrie/tred";
import { CAMPIONI_PBR } from "@/lib/planimetrie/tred/campioniPbr";
import { RUVIDITA_PIASTRELLA_IN_MAPPA, TRAME_GENERATE } from "@/lib/planimetrie/tred/trameGenerate";

function materialeThree(m: Materiale3D | undefined, tessiture: ReturnType<typeof textureFiniture>): THREE.MeshStandardMaterial {
  if (!m) return new THREE.MeshStandardMaterial();
  const trasparente = m.opacita < 1;
  const mat = new THREE.MeshStandardMaterial({
    name: m.nome,
    color: new THREE.Color(m.colore),
    roughness: m.ruvidita,
    metalness: m.metallico ?? 0,
    ...(m.emissione ? { emissive: new THREE.Color(m.emissione.colore), emissiveIntensity: m.emissione.intensita } : {}),
    transparent: trasparente,
    opacity: m.opacita,
    side: trasparente || m.doppioLato ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !trasparente,
  });
  if (m.finituraProgetto) mat.userData.finitura = true;
  if (m.tessitura) {
    mat.map = tessiture.carica(m.tessitura.trama);
    const campione = CAMPIONI_PBR[m.tessitura.trama];
    const generata = TRAME_GENERATE[m.tessitura.trama];
    if (generata) {
      // piastrelle disegnate dal codice: la fuga è incisa e opaca, la piastrella ha la lucentezza del campione
      mat.normalMap = tessiture.carica(m.tessitura.trama, "normale");
      mat.normalScale.setScalar(generata.rilievo);
      mat.roughnessMap = tessiture.carica(m.tessitura.trama, "rugosita");
      if (mat.roughnessMap) mat.roughness = Math.min(1, m.ruvidita / RUVIDITA_PIASTRELLA_IN_MAPPA);
    } else if (campione) {
      mat.normalMap = tessiture.carica(m.tessitura.trama, "normale");
      mat.normalScale.setScalar(campione.rilievo);
      mat.roughnessMap = tessiture.carica(m.tessitura.trama, "rugosita");
      if (mat.roughnessMap) mat.roughness = 1;
      if (m.tessitura.occlusioneMetallo) {
        mat.metalnessMap = mat.roughnessMap;
        mat.aoMap = mat.roughnessMap;
      }
    } else if (!m.tessitura.trama.startsWith("highland-")) {
      mat.bumpMap = mat.map;
      mat.bumpScale = m.tessitura.trama === "tessuto" ? .001
        : m.tessitura.trama === "legno" || m.tessitura.trama === "intonaco" ? .004 : .016;
    }
    mat.userData.finitura = true;
    if (m.tessitura.tinta) mat.color.set(m.tessitura.tinta);
  }
  return mat;
}

/** Materiali dei fondi dei campi sportivi e delle loro linee. */
const SUPERFICI_A_TERRA = new Set(["terra_rossa", "terra_rossa_scura", "resina_blu", "resina_blu_scura", "resina_arancio", "resina_verde", "erba_sintetica", "erba_sintetica_scura", "sabbia", "linee", "linee_blu"]);

type MaterialeGruppo = { firma?: string; metri?: readonly number[]; oggetto: THREE.MeshStandardMaterial };
type MeshGruppo = { dato: Mesh3D; materiale: MaterialeGruppo; oggetto: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> };
const risorseGruppo = new WeakMap<THREE.Group, {
  tessiture: ReturnType<typeof textureFiniture>;
  materiali: Map<string, MaterialeGruppo>;
  mesh: Map<string, MeshGruppo[]>;
}>();

function stessiValori(a?: readonly number[], b?: readonly number[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function geometriaThree(m: Mesh3D, tessitura?: Materiale3D["tessitura"]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.posizioni, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normali, 3));
  g.setIndex(m.indici);
  if (m.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uv.map((v, i) => i % 2 ? 1 - v : v), 2));
  else if (tessitura) g.setAttribute("uv", new THREE.BufferAttribute(uvFinitura(m.posizioni, m.normali, tessitura.metri, tessitura.rotazione), 2));
  g.computeBoundingSphere();
  return g;
}

export function creaGruppo(scena: Scena3D, opzioni: { onTextureReady?: () => void } = {}): THREE.Group {
  const gruppo = new THREE.Group();
  gruppo.name = "Planimetria";
  risorseGruppo.set(gruppo, { tessiture: textureFiniture(() => opzioni.onTextureReady?.()), materiali: new Map(), mesh: new Map() });
  aggiornaGruppo(gruppo, scena);
  return gruppo;
}

/** Conserva i buffer GPU quando vertici, topologia e mappatura non cambiano. */
export function aggiornaGruppo(gruppo: THREE.Group, scena: Scena3D): void {
  const risorse = risorseGruppo.get(gruppo);
  if (!risorse) return;
  const materiali = new Map<string, MaterialeGruppo>();
  const prossimeMesh = new Map<string, MeshGruppo[]>();
  const trameUsate = new Set<string>();
  const ordine: THREE.Object3D[] = [];
  for (const m of scena.mesh) {
    const dato = scena.materiali[m.materiale];
    const tessitura = dato?.tessitura;
    if (tessitura) trameUsate.add(tessitura.trama);
    let materiale = materiali.get(m.materiale);
    if (!materiale) {
      const prima = risorse.materiali.get(m.materiale);
      const firma = JSON.stringify(dato);
      materiale = prima && prima.firma === firma ? prima : { firma, metri: tessitura?.metri.slice(), oggetto: materialeThree(dato, risorse.tessiture) };
      materiali.set(m.materiale, materiale);
    }
    const omonime = prossimeMesh.get(m.id) ?? [];
    const precedente = risorse.mesh.get(m.id)?.[omonime.length];
    const vecchio = precedente?.dato;
    const riusaGeometria = precedente && vecchio && vecchio.materiale === m.materiale
      && stessiValori(precedente.materiale.metri, tessitura?.metri)
      && stessiValori(vecchio.posizioni, m.posizioni) && stessiValori(vecchio.indici, m.indici)
      && stessiValori(vecchio.normali, m.normali) && stessiValori(vecchio.uv, m.uv);
    const oggetto = precedente?.oggetto ?? new THREE.Mesh(geometriaThree(m, tessitura), materiale.oggetto);
    if (precedente && !riusaGeometria) {
      oggetto.geometry.dispose();
      oggetto.geometry = geometriaThree(m, tessitura);
      delete oggetto.userData.uv;
    }
    if (precedente?.materiale !== materiale) {
      oggetto.material = materiale.oggetto;
      oggetto.userData.materialeBase = materiale.oggetto;
    }
    oggetto.name = m.nome;
    Object.assign(oggetto.userData, { id: m.id, genere: m.genere, riferimento: m.riferimento, materiale: m.materiale });
    const trasparente = m.genere === "vetro" || m.materiale.startsWith("acqua")
      || (m.materiale.startsWith("auto:") && (dato?.opacita ?? 1) < 1);
    oggetto.castShadow = !trasparente && m.genere !== "soffitto" && m.genere !== "pavimento" && !SUPERFICI_A_TERRA.has(m.materiale);
    oggetto.receiveShadow = !trasparente;
    oggetto.renderOrder = trasparente ? 1 : 0;
    if (!precedente) gruppo.add(oggetto);
    omonime.push({ dato: m, materiale, oggetto });
    prossimeMesh.set(m.id, omonime);
    ordine.push(oggetto);
  }
  for (const [id, mesh] of risorse.mesh) {
    for (let i = prossimeMesh.get(id)?.length ?? 0; i < mesh.length; i++) {
      gruppo.remove(mesh[i].oggetto);
      mesh[i].oggetto.geometry.dispose();
    }
  }
  for (const [id, materiale] of risorse.materiali) {
    if (materiali.get(id) !== materiale) materiale.oggetto.dispose();
  }
  risorse.tessiture.conserva(trameUsate);
  risorse.materiali = materiali;
  risorse.mesh = prossimeMesh;
  gruppo.children = ordine;
  gruppo.userData.texturePronte = risorse.tessiture.pronte();
}

export function liberaGruppo(gruppo: THREE.Group): void {
  const risorse = risorseGruppo.get(gruppo);
  if (!risorse) return;
  risorseGruppo.delete(gruppo);
  for (const mesh of risorse.mesh.values()) for (const { oggetto } of mesh) oggetto.geometry.dispose();
  for (const materiale of risorse.materiali.values()) materiale.oggetto.dispose();
  risorse.tessiture.conserva();
  gruppo.clear();
  delete gruppo.userData.texturePronte;
}

/**
 * Luci gradevoli e leggere: ambiente diffuso (RoomEnvironment), cielo/terra, un sole
 * con ombre morbide. La mappa delle ombre si aggiorna quando cambia la scena.
 */
export function preparaAmbiente(renderer: THREE.WebGLRenderer, scene: THREE.Scene): { sole: THREE.DirectionalLight; terreno: THREE.Mesh; hemi: THREE.HemisphereLight; libera: () => void } {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const provaLuce = new RoomEnvironment();
  const ambiente = pmrem.fromScene(provaLuce, 0.04);
  provaLuce.dispose();
  pmrem.dispose();
  scene.environment = ambiente.texture;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color("#eef1f4");

  const cielo = new THREE.HemisphereLight("#ffffff", "#b9ab97", 0.9);
  scene.add(cielo);

  const sole = new THREE.DirectionalLight("#fff4e5", 1.6);
  sole.castShadow = true;
  sole.shadow.mapSize.set(2048, 2048);
  sole.shadow.bias = -0.0004;
  sole.shadow.normalBias = 0.02;
  sole.shadow.radius = 4;
  sole.shadow.autoUpdate = false;
  sole.shadow.needsUpdate = true;
  scene.add(sole, sole.target);

  const terreno = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: "#dfe3e6", roughness: 1 }));
  terreno.rotation.x = -Math.PI / 2;
  terreno.position.y = -0.005;
  terreno.receiveShadow = true;
  terreno.name = "Terreno";
  scene.add(terreno);

  return {
    sole,
    terreno,
    hemi: cielo,
    libera: () => {
      ambiente.dispose();
      terreno.geometry.dispose();
      (terreno.material as THREE.Material).dispose();
    },
  };
}

/** Mette sole e terreno a misura della pianta. */
export function adattaAmbiente(ambiente: { sole: THREE.DirectionalLight; terreno: THREE.Mesh }, scena: Scena3D): void {
  const { min, max } = scena.limiti;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const r = Math.max(2, Math.hypot(max[0] - min[0], max[2] - min[2]) / 2);
  const { sole, terreno } = ambiente;
  sole.shadow.needsUpdate = true;
  sole.position.set(cx - r * 0.8, r * 2.2, cz + r * 1.1);
  sole.target.position.set(cx, 0, cz);
  const cam = sole.shadow.camera;
  cam.left = -r * 1.3; cam.right = r * 1.3; cam.top = r * 1.3; cam.bottom = -r * 1.3;
  cam.near = 0.1; cam.far = r * 6;
  // la mappa delle ombre copre tutta la scena: con un centro sportivo da 100 m ogni suo punto
  // è largo decine di cm, e senza più tolleranza le superfici si rigano da sole
  sole.shadow.normalBias = 0.02 * Math.max(1, r / 12);
  sole.shadow.bias = -0.0004 * Math.max(1, r / 12);
  cam.updateProjectionMatrix();
  // con un interrato il terreno scende sotto il piano più basso, altrimenti lo coprirebbe
  terreno.position.set(cx, Math.min(0, min[1]) - 0.005, cz);
  terreno.scale.setScalar(r * 4);
  // con il prato della pianta (viste da fuori) il disco grigio non serve: lo coprirebbe
  terreno.visible = !scena.mesh.some((m) => m.id === "terreno");
}

export function applicaTelecamera(camera: THREE.PerspectiveCamera, t: Telecamera3D): void {
  camera.fov = t.fov;
  camera.up.set(...(t.alto ?? [0, 1, 0]));
  camera.position.set(...t.posizione);
  camera.lookAt(...t.guarda);
  camera.near = 0.05;
  camera.far = 500;
  camera.updateProjectionMatrix();
}

/** Attende le foto dei materiali prima di esportare un fotogramma. */
export async function attendiTexture(gruppo: THREE.Group): Promise<void> {
  await Promise.all((gruppo.userData.texturePronte ?? []) as Promise<void>[]);
}
