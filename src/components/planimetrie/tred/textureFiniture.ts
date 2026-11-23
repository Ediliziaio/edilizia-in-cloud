import * as THREE from "three";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";
import { chiaveMappaPbr, urlMappaPbr, type CanalePbr } from "@/lib/planimetrie/tred/campioniPbr";

/** Un caricatore per gruppo: nessuna texture GPU condivisa con un gruppo già distrutto. */
export function textureFiniture(ridisegna: () => void) {
  const cache = new Map<string, { trama: string; texture: THREE.Texture }>();
  const inAttesa = new Map<string, Promise<void>>();
  function carica(trama: string, canale: CanalePbr = "colore"): THREE.Texture | null {
    const chiave = chiaveMappaPbr(trama, canale);
    const gia = cache.get(chiave);
    if (gia) return gia.texture;
    let texture: THREE.Texture;
    const urlDati = urlMappaPbr(trama, canale);
    const foto = urlDati ? import.meta.env.BASE_URL + urlDati : canale === "colore" ? FOTO_FINITURE[trama] : undefined;
    if (foto) {
      let completa!: () => void;
      inAttesa.set(chiave, new Promise<void>((resolve) => { completa = resolve; }));
      const terminata = () => {
        completa();
        if (cache.get(chiave)?.texture === texture) {
          inAttesa.delete(chiave);
          ridisegna();
        }
      };
      texture = new THREE.TextureLoader().load(foto, terminata, undefined, terminata);
    } else {
      if (canale !== "colore" || typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const pixels = ctx.createImageData(256, 256);
      let seme = 719;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seme = (seme * 16807) % 2147483647;
        const n = seme / 2147483647;
        const x = (i / 4) % 256, y = Math.floor(i / 1024);
        const filo = (Math.sin(x * Math.PI / 3) * Math.cos(y * Math.PI / 3) + 1) * 6;
        const vena = (Math.sin((x + 4 * Math.sin(y / 20)) * 1.02) + 1) * 5 + (Math.sin(x * .24 + Math.cos(y * .018)) + 1) * 4;
        const tramaLocale = trama === "tessuto" ? filo : trama === "legno" ? vena : 0;
        const tono = 250 - Math.round(n * (trama === "cemento" ? 28 : 9) + tramaLocale);
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
    texture.name = `Finitura ${chiave}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = canale === "colore" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    cache.set(chiave, { trama, texture });
    return texture;
  }
  function conserva(trame?: ReadonlySet<string>) {
    for (const [chiave, { trama, texture }] of cache) {
      if (trame?.has(trama)) continue;
      cache.delete(chiave);
      inAttesa.delete(chiave);
      texture.dispose();
    }
  }
  return { carica, conserva, pronte: () => [...inAttesa.values()] };
}
