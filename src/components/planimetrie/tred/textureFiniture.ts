import * as THREE from "three";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";

/** Un caricatore per gruppo: nessuna texture GPU condivisa con un gruppo già distrutto. */
export function textureFiniture(ridisegna: () => void) {
  const cache = new Map<string, THREE.Texture>();
  const pronte: Promise<void>[] = [];
  function carica(trama: string): THREE.Texture | null {
    const gia = cache.get(trama);
    if (gia) return gia;
    let texture: THREE.Texture;
    const foto = FOTO_FINITURE[trama];
    if (foto) {
      let completa!: () => void;
      pronte.push(new Promise<void>((resolve) => { completa = resolve; }));
      texture = new THREE.TextureLoader().load(foto, () => { completa(); ridisegna(); }, undefined, () => { completa(); ridisegna(); });
    } else {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const pixels = ctx.createImageData(256, 256);
      let seme = 719;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seme = (seme * 16807) % 2147483647;
        const n = seme / 2147483647;
        const tono = 248 - Math.round(n * (trama === "cemento" ? 28 : 9));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tono;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      if (trama === "piastrelle" || trama === "cemento") {
        ctx.fillStyle = "rgba(80,75,68,0.26)";
        for (const p of [0, 128]) { ctx.fillRect(p, 0, 1, 256); ctx.fillRect(0, p, 256, 1); }
      }
      texture = new THREE.CanvasTexture(canvas);
    }
    texture.name = `Finitura ${trama}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    cache.set(trama, texture);
    return texture;
  }
  return { carica, pronte };
}
