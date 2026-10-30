/**
 * Dalla `Scena3D` (pura) agli oggetti three.js, più le luci.
 *
 * Questo file importa three.js: va caricato solo dalla pagina del 3D (vedi
 * `Vista3DPigra.tsx`), mai dal bundle principale.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Materiale3D, Scena3D, Telecamera3D } from "@/lib/planimetrie/tred";

function materialeThree(chiave: string, m: Materiale3D): THREE.MeshStandardMaterial {
  const trasparente = m.opacita < 1;
  const mat = new THREE.MeshStandardMaterial({
    name: m.nome,
    color: new THREE.Color(m.colore),
    roughness: m.ruvidita,
    metalness: chiave === "metallo" ? 0.6 : 0,
    transparent: trasparente,
    opacity: m.opacita,
    side: trasparente ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !trasparente,
  });
  return mat;
}

/** Un gruppo con una mesh per oggetto della pianta; `userData` porta id, genere e riferimento. */
export function creaGruppo(scena: Scena3D): THREE.Group {
  const gruppo = new THREE.Group();
  gruppo.name = "Planimetria";
  const materiali = new Map(Object.entries(scena.materiali).map(([k, m]) => [k, materialeThree(k, m)]));
  for (const m of scena.mesh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.posizioni, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normali, 3));
    g.setIndex(m.indici);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materiali.get(m.materiale) ?? new THREE.MeshStandardMaterial());
    mesh.name = m.nome;
    mesh.userData = { id: m.id, genere: m.genere, riferimento: m.riferimento };
    const trasparente = m.genere === "vetro";
    mesh.castShadow = !trasparente && m.genere !== "soffitto" && m.genere !== "pavimento";
    mesh.receiveShadow = !trasparente;
    if (trasparente) mesh.renderOrder = 1;
    gruppo.add(mesh);
  }
  return gruppo;
}

export function liberaGruppo(gruppo: THREE.Object3D): void {
  const materiali = new Set<THREE.Material>();
  gruppo.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materiali.add(m));
    }
  });
  materiali.forEach((m) => m.dispose());
}

/**
 * Luci gradevoli e leggere: ambiente diffuso (RoomEnvironment), cielo/terra, un sole
 * con ombre morbide. Il soffitto non fa ombra, così la stanza resta chiara anche
 * vista da dentro.
 */
export function preparaAmbiente(renderer: THREE.WebGLRenderer, scene: THREE.Scene): { sole: THREE.DirectionalLight; terreno: THREE.Mesh; libera: () => void } {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = ambiente;
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
  sole.position.set(cx - r * 0.8, r * 2.2, cz + r * 1.1);
  sole.target.position.set(cx, 0, cz);
  const cam = sole.shadow.camera;
  cam.left = -r * 1.3; cam.right = r * 1.3; cam.top = r * 1.3; cam.bottom = -r * 1.3;
  cam.near = 0.1; cam.far = r * 6;
  cam.updateProjectionMatrix();
  terreno.position.set(cx, -0.005, cz);
  terreno.scale.setScalar(r * 4);
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
