import * as THREE from "three";
import { aspettoTettoFv, type CoperturaFv } from "../../../../supabase/functions/_shared/fvAspettoTetto";

/** Texture periodiche in metri di falda: solo colore/rilievo ottico, mai spostamento dei vertici. */
export function textureCoperturaFv(tipo: CoperturaFv) {
  const colore = document.createElement("canvas"), rilievo = document.createElement("canvas");
  colore.width = rilievo.width = 256; colore.height = rilievo.height = 256;
  const ctx = colore.getContext("2d")!, bump = rilievo.getContext("2d")!;
  ctx.fillStyle = aspettoTettoFv(tipo).colore; ctx.fillRect(0, 0, 256, 256);
  bump.fillStyle = "#888"; bump.fillRect(0, 0, 256, 256);
  for (let r = -1; r < 5; r++) for (let c = -1; c < 5; c++) {
    const x = c * 64 + (r % 2 ? 32 : 0), y = r * 64;
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, "rgba(0,0,0,.22)"); g.addColorStop(.3, "rgba(255,255,255,.10)"); g.addColorStop(1, "rgba(0,0,0,.08)");
    ctx.fillStyle = g; ctx.fillRect(x, y, 64, 64);
    ctx.strokeStyle = "rgba(40,35,30,.38)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, 64, 64);
    const b = bump.createLinearGradient(x, 0, x + 64, 0);
    b.addColorStop(0, "#444"); b.addColorStop(.35, "#bbb"); b.addColorStop(1, "#666");
    bump.fillStyle = b; bump.fillRect(x, y, 64, 64); bump.strokeStyle = "#333"; bump.strokeRect(x, y, 64, 64);
  }
  if (tipo === "lamiera") {
    ctx.fillStyle = aspettoTettoFv(tipo).colore; ctx.fillRect(0, 0, 256, 256);
    bump.fillStyle = "#888"; bump.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x, 0, 2, 256);
      bump.fillStyle = "#ccc"; bump.fillRect(x, 0, 3, 256);
    }
  } else {
    // Grana deterministica: stesso materiale a ogni riapertura, nessun asset remoto.
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = i % 2 ? "rgba(25,20,15,.035)" : "rgba(255,255,255,.045)";
      ctx.fillRect((i * 73) % 256, (i * 97 + Math.floor(i / 256) * 31) % 256, 2, 2);
    }
  }
  const map = new THREE.CanvasTexture(colore), bumpMap = new THREE.CanvasTexture(rilievo);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.12, 1 / 1.32); }
  return { map, bumpMap };
}

/** Distanza che contiene tutti gli otto vertici del volume nel campo visivo. */
export function distanzaCameraTettoFv(box: THREE.Box3, direzione: THREE.Vector3, fov: number, aspect: number) {
  const d = direzione.clone().normalize(), destra = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
  const su = new THREE.Vector3().crossVectors(d, destra).normalize(), centro = box.getCenter(new THREE.Vector3());
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * Math.max(.1, aspect);
  let distanza = 4;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(centro);
    distanza = Math.max(distanza, p.dot(d) + 1.13 * Math.max(Math.abs(p.dot(destra)) / tanH, Math.abs(p.dot(su)) / tanV));
  }
  return distanza;
}
