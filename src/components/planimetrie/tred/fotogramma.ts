/**
 * Fotogramma per il render AI: l'immagine di una vista del 3D più i metadati
 * (misure della stanza, aperture inquadrate). La fase 5b lo usa come immagine di
 * partenza quando non c'è una foto.
 *
 * Disegna in un canvas a parte, della misura chiesta, così il risultato non dipende
 * dalla finestra del browser. Importa three.js: caricarlo con `caricaFotogramma()`.
 */
import * as THREE from "three";
import { costruisciScena, scenaEdificio, metadatiFotogramma, type PianoPer3D, type MetadatiFotogramma, type PiantaPer3D, type Telecamera3D, type Vista3D } from "@/lib/planimetrie/tred";
import { adattaAmbiente, attendiTexture, applicaTelecamera, creaGruppo, liberaGruppo, preparaAmbiente } from "./scenaThree";
import { creaAspetto } from "./aspetto";
import type { OpzioniAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";

export interface RichiestaFotogramma {
  pianta: PiantaPer3D;
  localeId: string;
  telecamera: Telecamera3D;
  /** Pixel; predefinito 1024 × 768. */
  larghezza?: number;
  altezza?: number;
  vista?: Vista3D;
  /** Arredi e sanitari nell'immagine. Predefinito: sì. */
  elementi?: boolean;
  /** Prato intorno, in metri (viste da fuori). */
  terreno?: number;
  /** Viste da fuori di un edificio a più piani: tutti, uno sopra l'altro. */
  piani?: PianoPer3D[];
  /** Aspetto realistico (facciata, infissi, ora, alberi…) come nel 3D: per i render degli esterni. Senza, la vista è quella semplice di sempre. */
  aspetto?: OpzioniAspetto;
}

export interface Fotogramma {
  png: Blob;
  metadati: MetadatiFotogramma;
}

export async function catturaFotogramma(r: RichiestaFotogramma): Promise<Fotogramma> {
  const larghezza = r.larghezza ?? 1024;
  const altezza = r.altezza ?? 768;
  const vista = r.vista ?? "progetto";
  const metadati = metadatiFotogramma(r.pianta, r.localeId, r.telecamera, { larghezza, altezza }, vista);
  if (!metadati) throw new Error("Locale non trovato nella pianta.");

  const canvas = document.createElement("canvas");
  canvas.width = larghezza;
  canvas.height = altezza;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(larghezza, altezza, false);
  const scene = new THREE.Scene();
  const ambiente = preparaAmbiente(renderer, scene);
  const opzioni = { vista, soffitto: true, elementi: r.elementi ?? true, terreno: r.terreno };
  const scena = r.piani && r.piani.length > 1 ? scenaEdificio(r.piani, opzioni) : costruisciScena(r.pianta, opzioni);
  adattaAmbiente(ambiente, scena);
  const gruppo = creaGruppo(scena);
  scene.add(gruppo);
  const camera = new THREE.PerspectiveCamera(r.telecamera.fov, larghezza / altezza, 0.05, 500);
  applicaTelecamera(camera, r.telecamera);
  // con l'aspetto scelto (facciata, infissi, cielo, ora, alberi) la vista è quella del 3D realistico
  const aspetto = r.aspetto?.realistico ? creaAspetto({ renderer, scene, camera }) : null;
  try {
    await attendiTexture(gruppo);
    if (aspetto && r.aspetto) {
      aspetto.dimensiona(larghezza, altezza);
      aspetto.applica(gruppo, scena, { ...r.aspetto, dentro: false }, ambiente);
      aspetto.disegna();
    } else {
      renderer.render(scene, camera);
    }
    const png = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non creata."))), "image/png"));
    return { png, metadati };
  } finally {
    aspetto?.libera();
    liberaGruppo(gruppo);
    ambiente.libera();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
