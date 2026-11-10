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
import { etichetteArrediInquadrati } from "@/lib/planimetrie/tred/inquadraturaArredi";

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
  /** Viste aperte del piano per il fascicolo; gli interni render mantengono il soffitto. */
  soffitto?: boolean;
  /** Prato intorno, in metri (viste da fuori). */
  terreno?: number;
  /** Viste da fuori di un edificio a più piani: tutti, uno sopra l'altro. */
  piani?: PianoPer3D[];
  /** Aspetto realistico (facciata, infissi, ora, alberi…) come nel 3D: per i render degli esterni. Senza, la vista è quella semplice di sempre. */
  aspetto?: OpzioniAspetto;
  /** Legenda degli oggetti per l'AI: aiuta a non confondere i sanitari nei modelli schematici. */
  annotaElementi?: boolean;
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
  metadati.arredi_inclusi = r.elementi !== false;

  const canvas = document.createElement("canvas");
  canvas.width = larghezza;
  canvas.height = altezza;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(larghezza, altezza, false);
  const scene = new THREE.Scene();
  const ambiente = preparaAmbiente(renderer, scene);
  const opzioni = { vista, soffitto: r.soffitto ?? true, elementi: r.elementi ?? true, terreno: r.terreno };
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
    let immagine = canvas;
    if (r.annotaElementi && metadati.arredi_inclusi) {
      const etichette = etichetteArrediInquadrati(r.pianta, r.localeId, r.telecamera, larghezza / altezza);
      if (etichette.length) {
        immagine = document.createElement("canvas"); immagine.width = larghezza; immagine.height = altezza;
        const ctx = immagine.getContext("2d");
        if (!ctx) throw new Error("Legenda degli arredi non disponibile.");
        ctx.drawImage(canvas, 0, 0);
        const font = Math.max(16, Math.round(larghezza / 65));
        ctx.font = `600 ${font}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const e of etichette) {
          const w = ctx.measureText(e.nome).width + 20, h = font + 14;
          const x = Math.max(w / 2 + 5, Math.min(larghezza - w / 2 - 5, e.x * larghezza)), y = Math.max(h / 2 + 5, Math.min(altezza - h / 2 - 5, e.y * altezza));
          ctx.fillStyle = "rgba(22,40,62,.88)"; ctx.fillRect(x - w / 2, y - h / 2, w, h);
          ctx.fillStyle = "white"; ctx.fillText(e.nome, x, y);
        }
      }
    }
    const png = await new Promise<Blob>((ok, ko) => immagine.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non creata."))), "image/png"));
    return { png, metadati };
  } finally {
    aspetto?.libera();
    liberaGruppo(gruppo);
    ambiente.libera();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
