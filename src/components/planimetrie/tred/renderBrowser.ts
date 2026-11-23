/**
 * Render fotorealistico calcolato nel browser (23/11/2026).
 *
 * Il render Cycles con Blender gira sul Mac di sviluppo o su un server, e online
 * costa ogni immagine. Questo lo calcola la scheda grafica di chi lo chiede, con
 * il path tracing di `three-gpu-pathtracer`: la luce rimbalza davvero su pareti,
 * pavimenti e arredi, come in Blender. Costo per la piattaforma: zero.
 *
 * Parte dalla stessa scena three.js del 3D (`creaGruppo`: muri, materiali, foto
 * delle finiture) e accumula campioni finché non raggiunge la qualità chiesta o
 * il tempo massimo; poi il denoiser leggero della libreria pulisce il rumore.
 *
 * Importa three.js e il path tracer: caricarlo con import() solo quando serve.
 */
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { DenoiseMaterial, GradientEquirectTexture, WebGLPathTracer } from "three-gpu-pathtracer";
import { soleIndicativo } from "../../../../shared/planimetrie/orientamento";
import type { LuceRenderLocale, QualitaRenderLocale } from "../../../../shared/planimetrie/renderLocale";
import type { Scena3D, Telecamera3D } from "@/lib/planimetrie/tred";
import { applicaTelecamera, attendiTexture, creaGruppo, liberaGruppo } from "./scenaThree";
import { postiAlberi, telaTrama } from "./aspetto";
import { ammetteAlberiDiContesto } from "@/lib/planimetrie/tred/aspettoOpzioni";

export type InquadraturaBrowser = {
  telecamera: Telecamera3D;
  larghezza: number;
  altezza: number;
  ambiente: "sport" | "facciata" | "tecnico" | "interni";
  luce?: LuceRenderLocale;
  qualita?: QualitaRenderLocale;
  ora?: number;
  /** Alberi e cespugli intorno alla casa, come nell'anteprima 3D (viste da fuori). */
  alberi?: boolean;
};

/** Campioni per pixel e tempo massimo: oltre, si tiene quello che c'è. */
export const OBIETTIVO_BROWSER: Record<QualitaRenderLocale, { campioni: number; secondi: number }> = {
  // Un PC con una scheda grafica integrata ne fa 2–5 al secondo: il tempo
  // massimo è il vero limite, i campioni il traguardo sui PC veloci.
  rapida: { campioni: 300, secondi: 45 },
  alta: { campioni: 1000, secondi: 120 },
};

function cielo(luce: LuceRenderLocale): GradientEquirectTexture {
  const t = new GradientEquirectTexture(256);
  if (luce === "sera") {
    t.topColor.set("#3c4a6b");
    t.bottomColor.set("#e8a86a");
  } else if (luce === "diffusa") {
    t.topColor.set("#dfe5ec");
    t.bottomColor.set("#c9c2b6");
  } else {
    t.topColor.set("#9fc3ea");
    t.bottomColor.set("#efe6d6");
  }
  t.exponent = 1.6;
  t.update();
  return t;
}

/** Luce morbida a soffitto sopra l'inquadratura: negli interni le finestre da sole non bastano. */
function luceSoffitto(scena: Scena3D, t: Telecamera3D, luce: LuceRenderLocale): THREE.RectAreaLight {
  const soffitto = Math.min(scena.limiti.max[1], t.posizione[1] + 1.6);
  const x = (t.posizione[0] + t.guarda[0]) / 2, z = (t.posizione[2] + t.guarda[2]) / 2;
  const l = new THREE.RectAreaLight(luce === "sera" ? "#ffd9a8" : "#fff3e2", luce === "sera" ? 9 : 4, 1.2, 1.2);
  l.position.set(x, soffitto - 0.02, z);
  l.lookAt(x, 0, z);
  return l;
}

/**
 * Gli alberi dell'anteprima 3D, negli stessi posti (`postiAlberi`), come oggetti
 * singoli: il path tracer non legge le InstancedMesh che usa l'anteprima.
 */
function alberi(limiti: { min: number[]; max: number[] }): THREE.Group {
  const g = new THREE.Group();
  const tronco = new THREE.CylinderGeometry(0.09, 0.14, 1, 7), chioma = new THREE.IcosahedronGeometry(1, 2);
  const legno = new THREE.MeshStandardMaterial({ color: "#6b4f37", roughness: 1 });
  for (const a of postiAlberi(limiti)) {
    if (!a.cespuglio) {
      const t = new THREE.Mesh(tronco, legno);
      t.position.set(a.x, a.altezzaTronco / 2, a.z);
      t.scale.set(1, a.altezzaTronco, 1);
      g.add(t);
    }
    const foglie = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.24 + a.tinta * 0.07, 0.45 + a.tinta * 0.15, 0.27 + a.tinta * 0.12), roughness: 1 });
    const c = new THREE.Mesh(chioma, foglie);
    c.position.set(a.x, a.altezzaTronco + a.raggioChioma * (a.cespuglio ? 0.6 : 0.75), a.z);
    c.scale.set(a.raggioChioma, a.raggioChioma * (a.cespuglio ? 0.8 : 0.95), a.raggioChioma);
    g.add(c);
  }
  return g;
}

/**
 * Lascia passare clic e tasti tra un campione e l'altro. Non requestAnimationFrame:
 * in una scheda in secondo piano si ferma, e il render resterebbe a metà finché
 * l'utente non torna. Un messaggio a se stessi non viene rallentato.
 */
function cediIlTurno(): Promise<void> {
  return new Promise(ok => {
    const canale = new MessageChannel();
    canale.port1.onmessage = () => { canale.port1.close(); ok(); };
    canale.port2.postMessage(0);
  });
}

export async function renderFotorealisticoBrowser(
  scena: Scena3D,
  inquadratura: InquadraturaBrowser,
  signal: AbortSignal,
  onAvanzamento?: (frazione: number) => void,
): Promise<Blob> {
  const { larghezza, altezza } = inquadratura;
  const luce = inquadratura.luce ?? "giorno";
  const obiettivo = OBIETTIVO_BROWSER[inquadratura.qualita ?? "rapida"];
  const interni = inquadratura.ambiente === "interni";
  const completa = scena.mesh.some(m => m.auto || m.arredoCatalogo)
    ? await (await import("@/lib/planimetrie/tred/modelliDettagliati")).scenaConModelliDettagliati(scena)
    : scena;
  signal.throwIfAborted();

  const canvas = document.createElement("canvas");
  canvas.width = larghezza;
  canvas.height = altezza;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(larghezza, altezza, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = interni ? 1.35 : 1.0;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const sfondo = cielo(luce);
  scene.background = sfondo;
  scene.environment = sfondo;
  scene.environmentIntensity = luce === "sera" ? 0.35 : interni ? 1.1 : 0.9;

  const gruppo = creaGruppo(completa);
  scene.add(gruppo);
  const ora = inquadratura.ora ?? (luce === "sera" ? 18.5 : 13);
  const direzione = soleIndicativo(ora, completa.nord ?? 0).direzione;
  const { min, max } = completa.limiti;
  const centro = new THREE.Vector3((min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2);
  const raggio = Math.max(4, Math.hypot(max[0] - min[0], max[2] - min[2]));
  const sole = new THREE.DirectionalLight(luce === "sera" ? "#ffb070" : "#fff1dc", luce === "diffusa" ? 0.6 : luce === "sera" ? 1.6 : 3.2);
  sole.position.copy(centro).add(new THREE.Vector3(...direzione).multiplyScalar(raggio * 3));
  sole.target.position.copy(centro);
  scene.add(sole, sole.target);
  if (interni) scene.add(luceSoffitto(completa, inquadratura.telecamera, luce));

  // Il terreno: senza, sotto la casa c'è il vuoto e la luce scappa. Da fuori è
  // il prato dell'anteprima 3D, con la stessa trama; da dentro basta un fondo neutro.
  const extra: THREE.Object3D[] = [];
  if (!completa.mesh.some(m => m.id === "terreno")) {
    const lato = raggio * 8;
    const materiale = new THREE.MeshStandardMaterial({ color: interni ? "#cfc8bb" : "#c8e6a8", roughness: 1 });
    const tela = interni ? null : telaTrama("prato");
    if (tela) {
      const trama = new THREE.CanvasTexture(tela);
      trama.wrapS = trama.wrapT = THREE.RepeatWrapping;
      trama.colorSpace = THREE.SRGBColorSpace;
      trama.repeat.set(lato / 3, lato / 3);
      materiale.map = trama;
    }
    const terreno = new THREE.Mesh(new THREE.PlaneGeometry(lato, lato), materiale);
    terreno.rotation.x = -Math.PI / 2;
    terreno.position.set(centro.x, Math.min(0, min[1]) - 0.005, centro.z);
    extra.push(terreno);
  }
  if (!interni && inquadratura.alberi && ammetteAlberiDiContesto(completa)) extra.push(alberi(completa.limiti));
  scene.add(...extra);

  const camera = new THREE.PerspectiveCamera(inquadratura.telecamera.fov, larghezza / altezza, 0.05, 500);
  applicaTelecamera(camera, inquadratura.telecamera);

  const tracer = new WebGLPathTracer(renderer);
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 1;
  tracer.dynamicLowRes = false;
  tracer.bounces = interni ? 7 : 5;
  tracer.filterGlossyFactor = 0.5;
  tracer.tiles.set(2, 2);
  try {
    await attendiTexture(gruppo);
    signal.throwIfAborted();
    // Struttura di ricerca dei raggi (BVH) sul thread principale: per una casa è
    // questione di centinaia di millisecondi, non serve un worker dedicato.
    tracer.setScene(scene, camera);
    const inizio = performance.now();
    const limite = obiettivo.secondi * 1000;
    // Un campione per fotogramma: il browser resta reattivo e si può annullare.
    while (tracer.samples < obiettivo.campioni && performance.now() - inizio < limite) {
      signal.throwIfAborted();
      tracer.renderSample();
      onAvanzamento?.(Math.min(1, Math.max(tracer.samples / obiettivo.campioni, (performance.now() - inizio) / limite)));
      await cediIlTurno();
    }
    // Ultimo passaggio: il filtro anti-grana della libreria, che leviga il rumore
    // dei pochi campioni senza impastare spigoli e cambi di materiale.
    const pulizia = new FullScreenQuad(new DenoiseMaterial({
      map: tracer.target.texture,
      sigma: 5,
      kSigma: 1,
      threshold: tracer.samples >= 600 ? 0.03 : tracer.samples >= 200 ? 0.05 : 0.08,
      premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha,
    }));
    renderer.setRenderTarget(null);
    pulizia.render(renderer);
    pulizia.material.dispose();
    pulizia.dispose();
    onAvanzamento?.(1);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error("Immagine non creata."))), "image/png"));
  } finally {
    tracer.dispose();
    for (const o of extra) o.traverse(x => {
      if (x instanceof THREE.Mesh) { x.geometry.dispose(); (x.material as THREE.MeshStandardMaterial).map?.dispose(); (x.material as THREE.Material).dispose(); }
    });
    liberaGruppo(gruppo);
    sfondo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
