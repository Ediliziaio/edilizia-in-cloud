/**
 * L'aspetto «realistico» del 3D da fuori: tessiture disegnate al volo (intonaco, mattoni, pietra, legno,
 * tegole, tetto verde, lamiera, prato…), il cielo che cambia con l'ora, il sole con le sue ombre, la nebbia
 * all'orizzonte, gli alberi intorno alla casa e un po' di occlusione ambientale (le ombre negli angoli).
 *
 * Non tocca la `Scena3D` (pura, quella degli export GLB/OBJ e dei render AI): lavora solo sugli oggetti three.js
 * della finestra 3D, e si spegne tornando com'era. Importa three.js: caricarlo solo dalla pagina del 3D.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { apertureDelLocale, type PiantaPer3D, type Scena3D, type V3, type Vista3D } from "@/lib/planimetrie/tred";
import { soleIndicativo } from "../../../../shared/planimetrie/orientamento";

// Le scelte (facciata, infissi, ora…) stanno in un modulo senza three.js, così anche i dialoghi le leggono senza appesantire il bundle.
import { ammetteAlberiDiContesto, ASPETTO_PREDEFINITO, FACCIATE, ID_FACCIATE, ID_INFISSI, INFISSI, type IdFacciata, type IdInfissi, type OpzioniAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";
export { ASPETTO_PREDEFINITO, FACCIATE, ID_FACCIATE, ID_INFISSI, INFISSI };
export type { IdFacciata, IdInfissi, OpzioniAspetto };

// ─── Sole e cielo (funzioni pure) ────────────────────────────────────────────

export interface StatoSole {
  /** Direzione verso il sole, negli assi della tavola. */
  direzione: [number, number, number];
  elevazioneGradi: number;
  colore: string;
  intensita: number;
  cielo: { orizzonte: string; zenit: string };
  /** Luce del cielo e esposizione, per non far annerire le ombre a fine giornata. */
  emisfero: number;
  esposizione: number;
}

const mix = (a: string, b: string, t: number): string => new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();

/** Il sole alle `ora` (7–19): basso e caldo al mattino e alla sera, alto e bianco a mezzogiorno; da est a ovest passando per sud. */
export function sole(ora: number, nord?: number): StatoSole {
  const { direzione, elevazioneGradi, fase: alto } = soleIndicativo(ora, nord);
  // Senza un nord esplicito resta il percorso visivo delle viste già salvate.
  if (nord === undefined) direzione[0] *= -1;
  return {
    direzione,
    elevazioneGradi,
    colore: mix("#ffae66", "#fff4e5", Math.min(1, alto * 1.4)),
    intensita: 1.6 + 0.9 * alto,
    cielo: { orizzonte: mix("#f2c192", "#dbe9f5", Math.min(1, alto * 1.3)), zenit: mix("#6b86b8", "#79afe0", Math.min(1, alto * 1.3)) },
    emisfero: 1.0 + 0.05 * alto,
    esposizione: 1.3 - 0.25 * alto,
  };
}

// ─── Alberi (funzione pura) ──────────────────────────────────────────────────

export interface AlberoPosto { x: number; z: number; altezzaTronco: number; raggioChioma: number; tinta: number; cespuglio: boolean }

const generatore = (seme: number) => {
  let s = (Math.abs(Math.round(seme)) % 2147483646) + 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
};

/**
 * Alberi e cespugli intorno alla casa: su un'ellisse più larga dell'ingombro, sempre fuori dai muri, un po' meno
 * davanti (a sud) dove di solito c'è l'ingresso. Con la stessa casa escono sempre negli stessi punti.
 */
export function postiAlberi(limiti: { min: number[]; max: number[] }, quanti?: number): AlberoPosto[] {
  const [x0, , z0] = limiti.min, [x1, , z1] = limiti.max;
  if (![x0, z0, x1, z1].every(Number.isFinite) || x1 <= x0 || z1 <= z0) return [];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const rnd = generatore(hx * 1000 + hz * 37);
  const n = quanti ?? Math.max(6, Math.min(18, Math.round((hx + hz) / 2.2)));
  const out: AlberoPosto[] = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = rnd() * Math.PI * 2;
    // davanti alla casa (z positivo = sud) se ne mettono meno
    if (Math.sin(a) > 0.55 && rnd() < 0.65) continue;
    const cespuglio = rnd() < 0.3;
    const d = (cespuglio ? 1.6 : 3.5) + rnd() * (cespuglio ? 1.8 : 7);
    out.push({
      x: cx + (hx + d) * Math.cos(a),
      z: cz + (hz + d) * Math.sin(a),
      altezzaTronco: cespuglio ? 0.1 : 1.7 + rnd() * 1.2,
      raggioChioma: cespuglio ? 0.4 + rnd() * 0.3 : 1.1 + rnd() * 0.9,
      tinta: rnd(),
      cespuglio,
    });
  }
  return out;
}

// ─── UV per proiezione ───────────────────────────────────────────────────────

/** UV in coordinate del mondo: sul piano dominante di ogni faccia (sopra: x,z; lati: la coordinata lungo il muro e l'altezza). */
export function uvPerProiezione(posizioni: ArrayLike<number>, normali: ArrayLike<number>, metriPerPiastrella: number): Float32Array {
  const n = posizioni.length / 3;
  const uv = new Float32Array(n * 2);
  const s = metriPerPiastrella > 0 ? metriPerPiastrella : 1;
  for (let i = 0; i < n; i++) {
    const x = posizioni[3 * i], y = posizioni[3 * i + 1], z = posizioni[3 * i + 2];
    const ax = Math.abs(normali[3 * i]), ay = Math.abs(normali[3 * i + 1]), az = Math.abs(normali[3 * i + 2]);
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[2 * i] = u / s;
    uv[2 * i + 1] = v / s;
  }
  return uv;
}

// ─── Tessiture disegnate al volo ─────────────────────────────────────────────

type Disegnatore = (ctx: CanvasRenderingContext2D, n: number, rnd: () => number) => void;

const macchie = (ctx: CanvasRenderingContext2D, n: number, rnd: () => number, quante: number, colore: (r: number) => string, raggio: [number, number]) => {
  for (let i = 0; i < quante; i++) {
    ctx.fillStyle = colore(rnd());
    ctx.beginPath();
    ctx.arc(rnd() * n, rnd() * n, raggio[0] + rnd() * (raggio[1] - raggio[0]), 0, Math.PI * 2);
    ctx.fill();
  }
};

const grani = (ctx: CanvasRenderingContext2D, n: number, rnd: () => number, quanti: number, alfa: number) => {
  for (let i = 0; i < quanti; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${alfa * rnd()})` : `rgba(255,255,255,${alfa * rnd()})`;
    const d = 1 + rnd() * 1.6;
    ctx.fillRect(rnd() * n, rnd() * n, d, d);
  }
};

const rgb = (r: number, g: number, b: number) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

export const TRAME: Record<string, { lato: number; disegna: Disegnatore; rilievo?: number }> = {
  intonaco: { lato: 256, disegna: (ctx, n, rnd) => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, n, n); macchie(ctx, n, rnd, 40, (r) => `rgba(${r < 0.5 ? "0,0,0" : "255,255,255"},${0.006 + r * 0.01})`, [20, 60]); grani(ctx, n, rnd, 4000, 0.07); } },
  cemento: {
    lato: 512,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#c3c3be"; ctx.fillRect(0, 0, n, n);
      macchie(ctx, n, rnd, 120, (r) => `rgba(${r < 0.5 ? "0,0,0" : "255,255,255"},${0.02 + r * 0.03})`, [12, 50]);
      grani(ctx, n, rnd, 6000, 0.2);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = "rgba(40,40,40,0.35)"; ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 0.8 + rnd() * 1.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "rgba(60,60,60,0.45)"; ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, n, n);
      for (const p of [n / 4, (3 * n) / 4]) { ctx.beginPath(); ctx.arc(p, n / 2, 3, 0, Math.PI * 2); ctx.stroke(); }
    },
  },
  mattone: {
    lato: 512,
    rilievo: -0.8,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#d4ccbc"; ctx.fillRect(0, 0, n, n);
      const w = 128, h = 36, g = 3;
      for (let r = 0; r * h < n + h; r++) {
        const off = r % 2 ? w / 2 : 0;
        for (let c = -1; c * w < n + w; c++) {
          const base = 0.85 + rnd() * 0.3;
          ctx.fillStyle = rgb(170 * base + rnd() * 12, 82 * base + rnd() * 10, 58 * base + rnd() * 8);
          ctx.fillRect(c * w + off + g / 2, r * h + g / 2, w - g, h - g);
          for (let k = 0; k < 14; k++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,235,210"},${0.05 + rnd() * 0.08})`; ctx.fillRect(c * w + off + rnd() * w, r * h + rnd() * h, 2 + rnd() * 5, 1.5); }
        }
      }
    },
  },
  pietra: {
    lato: 512,
    rilievo: -0.9,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#8f8a7f"; ctx.fillRect(0, 0, n, n);
      let y = 0;
      while (y < n) {
        const h = 60 + rnd() * 50;
        let x = -rnd() * 80;
        while (x < n) {
          const w = 90 + rnd() * 120;
          const t = 0.8 + rnd() * 0.35;
          ctx.fillStyle = rgb(196 * t + rnd() * 10, 186 * t + rnd() * 8, 168 * t + rnd() * 8);
          ctx.beginPath();
          ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 6);
          ctx.fill();
          x += w;
        }
        y += h;
      }
      grani(ctx, n, rnd, 5000, 0.18);
    },
  },
  legno: {
    lato: 512,
    rilievo: 0.35,
    disegna: (ctx, n, rnd) => {
      const assi = 7, w = n / assi;
      for (let i = 0; i < assi; i++) {
        const t = 0.8 + rnd() * 0.3;
        ctx.fillStyle = rgb(160 * t, 112 * t, 72 * t); ctx.fillRect(i * w, 0, w, n);
        for (let k = 0; k < 26; k++) { ctx.strokeStyle = `rgba(${rnd() < 0.6 ? "60,35,15" : "220,180,130"},${0.06 + rnd() * 0.12})`; ctx.lineWidth = 0.8 + rnd(); const x = i * w + rnd() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + rnd() * 6 - 3, n / 3, x + rnd() * 6 - 3, (2 * n) / 3, x + rnd() * 4 - 2, n); ctx.stroke(); }
        ctx.fillStyle = "rgba(30,15,5,0.55)"; ctx.fillRect(i * w, 0, 2.5, n);
      }
    },
  },
  tegole: {
    lato: 512,
    rilievo: 0.9,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#5a2b20"; ctx.fillRect(0, 0, n, n);
      const w = 128, h = 85;
      for (let r = 0; r * h < n + h; r++) {
        for (let c = -1; c * w < n + w; c++) {
          const off = r % 2 ? w / 2 : 0;
          const t = 0.82 + rnd() * 0.32;
          const x = c * w + off, y = r * h;
          ctx.fillStyle = rgb(176 * t, 88 * t, 62 * t);
          ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + w - 3, y); ctx.lineTo(x + w - 3, y + h - 22); ctx.quadraticCurveTo(x + w / 2, y + h + 6, x + 3, y + h - 22); ctx.closePath(); ctx.fill();
          const gr = ctx.createLinearGradient(0, y + h - 30, 0, y + h + 4); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,10,5,0.5)");
          ctx.fillStyle = gr; ctx.fillRect(x + 3, y + h - 30, w - 6, 34);
          ctx.strokeStyle = "rgba(255,200,170,0.18)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 14); ctx.stroke();
          for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,230,200"},0.08)`; ctx.fillRect(x + rnd() * w, y + rnd() * h, 6 + rnd() * 10, 2); }
        }
      }
    },
  },
  lamiera: {
    lato: 512,
    rilievo: 0.4,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#a3abb0"; ctx.fillRect(0, 0, n, n);
      for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rnd() * 0.04})`; ctx.fillRect(0, rnd() * n, n, 1 + rnd() * 2); }
      for (const x of [0, n / 2]) { ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(x + 4, 0, 5, n); ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(x, 0, 4, n); }
    },
  },
  verde: {
    lato: 512,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#7f9b57"; ctx.fillRect(0, 0, n, n);
      macchie(ctx, n, rnd, 90, (r) => (r < 0.55 ? rgb(110 + r * 60, 150 + r * 40, 80) : r < 0.8 ? rgb(170, 185, 90) : r < 0.93 ? rgb(150, 160, 130) : rgb(190, 100, 90)), [8, 26]);
      macchie(ctx, n, rnd, 600, (r) => (r < 0.5 ? rgb(95, 130, 65) : r < 0.85 ? rgb(150, 178, 90) : rgb(215, 200, 110)), [1.5, 4.5]);
      grani(ctx, n, rnd, 3000, 0.2);
    },
  },
  ghiaia: { lato: 256, disegna: (ctx, n, rnd) => { ctx.fillStyle = "#bcb7ac"; ctx.fillRect(0, 0, n, n); for (let i = 0; i < 2600; i++) { const t = 0.55 + rnd() * 0.6; ctx.fillStyle = rgb(190 * t, 185 * t, 172 * t); ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 1 + rnd() * 2.4, 0, Math.PI * 2); ctx.fill(); } } },
  prato: {
    lato: 512,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#6f9a4d"; ctx.fillRect(0, 0, n, n);
      macchie(ctx, n, rnd, 70, (r) => `rgba(${r < 0.5 ? "40,90,30" : "150,190,90"},${0.05 + r * 0.05})`, [20, 70]);
      for (let i = 0; i < 9000; i++) { const t = 0.7 + rnd() * 0.5; ctx.strokeStyle = rgb(95 * t, 150 * t, 62 * t); ctx.lineWidth = 1; const x = rnd() * n, y = rnd() * n; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 4 - 2, y - 3 - rnd() * 5); ctx.stroke(); }
    },
  },
  asfalto: { lato: 256, disegna: (ctx, n, rnd) => { ctx.fillStyle = "#68696c"; ctx.fillRect(0, 0, n, n); grani(ctx, n, rnd, 7000, 0.4); } },
  guaina: { lato: 256, disegna: (ctx, n, rnd) => { ctx.fillStyle = "#555961"; ctx.fillRect(0, 0, n, n); grani(ctx, n, rnd, 3500, 0.14); ctx.fillStyle = "rgba(255,255,255,0.12)"; for (const y of [0, n / 2]) ctx.fillRect(0, y, n, 2); } },
  parquet: {
    lato: 512,
    disegna: (ctx, n, rnd) => {
      const assi = 10, h = n / assi;
      for (let i = 0; i < assi; i++) {
        let x = -rnd() * 200;
        while (x < n) {
          const w = 180 + rnd() * 120, t = 0.85 + rnd() * 0.25;
          ctx.fillStyle = rgb(190 * t, 140 * t, 92 * t); ctx.fillRect(x, i * h, w, h);
          ctx.fillStyle = "rgba(40,20,5,0.5)"; ctx.fillRect(x, i * h, 2, h);
          for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(60,30,10,${0.06 + rnd() * 0.08})`; ctx.fillRect(x + rnd() * w, i * h + rnd() * h, 30 + rnd() * 80, 1); }
          x += w;
        }
        ctx.fillStyle = "rgba(40,20,5,0.55)"; ctx.fillRect(0, i * h, n, 2);
      }
    },
  },
  lastre: {
    lato: 256,
    disegna: (ctx, n, rnd) => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const t = 0.92 + rnd() * 0.12; ctx.fillStyle = rgb(206 * t, 201 * t, 191 * t); ctx.fillRect(i * (n / 2), j * (n / 2), n / 2, n / 2); }
      grani(ctx, n, rnd, 3500, 0.12);
      ctx.fillStyle = "rgba(60,58,52,0.6)"; ctx.fillRect(0, 0, n, 3); ctx.fillRect(0, n / 2, n, 3); ctx.fillRect(0, 0, 3, n); ctx.fillRect(n / 2, 0, 3, n);
    },
  },
  fogliame: { lato: 256, disegna: (ctx, n, rnd) => { ctx.fillStyle = "#5c8c40"; ctx.fillRect(0, 0, n, n); macchie(ctx, n, rnd, 200, (r) => rgb(70 + r * 60, 120 + r * 50, 50 + r * 30), [3, 10]); } },
  tessuto: {
    lato: 256,
    rilievo: .08,
    disegna: (ctx, n, rnd) => {
      ctx.fillStyle = "#f5f3ef";
      ctx.fillRect(0, 0, n, n);
      for (let k = 0; k < n; k += 3) {
        ctx.fillStyle = "rgba(75,63,52,0.08)";
        ctx.fillRect(k, 0, 1, n);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillRect(0, k, n, 1);
      }
      grani(ctx, n, rnd, 2800, .16);
    },
  },
};

/** Come si vede ogni materiale della scena nell'aspetto realistico: tessitura, lato in metri, e quanto è metallico. */
const LOOK: Record<string, { trama: string; metri: number; metallo?: number; ruvidita?: number }> = {
  tegole: { trama: "tegole", metri: 1.2 },
  tetto_verde: { trama: "verde", metri: 2 },
  tetto_verde_intensivo: { trama: "prato", metri: 2.5 },
  lamiera: { trama: "lamiera", metri: 1, metallo: 0.3, ruvidita: 0.4 },
  guaina: { trama: "guaina", metri: 1.5 },
  ghiaia: { trama: "ghiaia", metri: 1 },
  prato: { trama: "prato", metri: 3 },
  asfalto: { trama: "asfalto", metri: 2 },
  pavimento_legno: { trama: "parquet", metri: 1.2 },
  pavimento_esterno: { trama: "lastre", metri: 1 },
  pietra: { trama: "lastre", metri: 1 },
  marciapiede: { trama: "lastre", metri: 1 },
  zoccolo: { trama: "cemento", metri: 2 },
  calcestruzzo: { trama: "cemento", metri: 2 },
  fogliame: { trama: "fogliame", metri: 1 },
  legno: { trama: "legno", metri: 1 },
  stipite: { trama: "legno", metri: 1.15 },
  tessuto: { trama: "tessuto", metri: .13 },
  tessuto_cuscino: { trama: "tessuto", metri: .13 },
  pavimento_piastrelle: { trama: "lastre", metri: 1.2 },
  pavimento_gres: { trama: "lastre", metri: 1.2 },
};

// ─── Il motore dell'aspetto ──────────────────────────────────────────────────

export interface Aspetto {
  /** Applica (o toglie) l'aspetto alla scena: ricostruisce materiali, cielo, sole, alberi. Va chiamato dopo `adattaAmbiente`. */
  applica(gruppo: THREE.Group | null, scena: Scena3D, opzioni: OpzioniAspetto & { sfondoNeutro?: boolean }, ambiente: { sole: THREE.DirectionalLight; terreno: THREE.Mesh; hemi: THREE.HemisphereLight | null }, finestra?: FinestraLuce): void;
  /** Disegna un fotogramma (con gli effetti se ci sono). */
  disegna(): void;
  dimensiona(larghezza: number, altezza: number): void;
  libera(): void;
}

interface FinestraLuce { centro: V3; fuori: [number, number] }

/** La luce diurna entra dal vano più grande della stanza, dal lato opposto alla sua faccia interna. */
export function finestraPerLuce(pianta: PiantaPer3D, localeId: string, vista: Vista3D, quotaPiano = 0): FinestraLuce | undefined {
  const vano = apertureDelLocale(pianta, localeId, vista)
    .filter(a => a.tipo === "finestra" || a.tipo === "portafinestra")
    .sort((a, b) => b.larghezza_cm * b.altezza_cm - a.larghezza_cm * a.altezza_cm)[0];
  if (!vano) return;
  const muro = pianta.muri.find(m => m.id === vano.muroId);
  if (!muro) return;
  const [a, , c] = vano.angoli;
  const centro: V3 = [(a[0] + c[0]) / 2, quotaPiano + (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const dx = muro.b.x - muro.a.x, dz = muro.b.y - muro.a.y;
  const lungo = Math.hypot(dx, dz);
  if (!lungo) return;
  const nx = -dz / lungo, nz = dx / lungo;
  const dentro = (centro[0] - muro.a.x / 100) * nx + (centro[2] - muro.a.y / 100) * nz;
  const segno = dentro >= 0 ? -1 : 1;
  return { centro, fuori: [nx * segno, nz * segno] };
}

let profiliLuminosiInizializzati = false;

/** Emissione continua lungo il diffusore, anche per arredi ruotati. */
function sorgentiLed(scena: Scena3D) {
  return scena.mesh.flatMap(m => {
    if (m.materiale !== "luce_calda" || m.posizioni.length < 9) return [];
    let quota = Infinity;
    for (let i = 1; i < m.posizioni.length; i += 3) quota = Math.min(quota, m.posizioni[i]);
    const base: [number, number][] = [];
    for (let i = 0; i < m.posizioni.length; i += 3) {
      if (m.posizioni[i + 1] <= quota + .04) base.push([m.posizioni[i], m.posizioni[i + 2]]);
    }
    const x = base.reduce((a, p) => a + p[0], 0) / base.length;
    const z = base.reduce((a, p) => a + p[1], 0) / base.length;
    let varX = 0, varZ = 0, cov = 0;
    for (const [px, pz] of base) {
      varX += (px - x) ** 2;
      varZ += (pz - z) ** 2;
      cov += (px - x) * (pz - z);
    }
    const angolo = .5 * Math.atan2(2 * cov, varX - varZ);
    const cos = Math.cos(angolo), sin = Math.sin(angolo);
    let inizio = Infinity, fine = -Infinity;
    for (const [px, pz] of base) {
      const u = px * cos + pz * sin;
      inizio = Math.min(inizio, u);
      fine = Math.max(fine, u);
    }
    return [{ posizione: new THREE.Vector3(x, quota - .046, z), cos, sin, lunghezza: Math.max(.1, fine - inizio) }];
  });
}

interface Avvio { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera }

export function telaTrama(id: string): HTMLCanvasElement | null {
  const trama = TRAME[id];
  if (!trama || typeof document === "undefined") return null;
  const tela = document.createElement("canvas");
  tela.width = tela.height = trama.lato;
  const ctx = tela.getContext("2d");
  if (!ctx) return null;
  trama.disegna(ctx, trama.lato, generatore(id.length * 7919 + trama.lato));
  return tela;
}

export function creaAspetto({ renderer, scene, camera }: Avvio): Aspetto {
  const texture = new Map<string, THREE.CanvasTexture>();
  const materiali = new Map<string, THREE.MeshStandardMaterial>();
  let cielo: THREE.Mesh | null = null;
  let alberi: THREE.Group | null = null;
  let ambienteCielo: THREE.Texture | null = null;
  let oraCielo: string | null = null;
  let scenaLed: Scena3D | null = null;
  let posizioniLed: ReturnType<typeof sorgentiLed> = [];
  const luciLed = Array.from({ length: 3 }, () => new THREE.RectAreaLight("#ffd8a8", 0, 1, .12));
  let raggioPrato = 0;
  let tramaPrato: THREE.Texture | null = null;
  let scenaAlberi: Scena3D | null = null;
  let compositore: EffectComposer | null = null;
  let gtao: GTAOPass | null = null;
  let dimensioni = { w: 1, h: 1 };
  const sfondoOriginale = scene.background;
  const ambienteOriginale = scene.environment;
  const intensitaAmbienteOriginale = scene.environmentIntensity;
  const esposizioneOriginale = renderer.toneMappingExposure;

  const trama = (id: string): THREE.CanvasTexture | null => {
    const gia = texture.get(id);
    if (gia) return gia;
    const tela = telaTrama(id);
    if (!tela) return null;
    const tex = new THREE.CanvasTexture(tela);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.set(id, tex);
    return tex;
  };

  const materialeAspetto = (chiave: string, base: THREE.MeshStandardMaterial, opz: OpzioniAspetto): THREE.MeshStandardMaterial | null => {
    // Un campione scelto per la stanza resta lo stesso anche girando intorno.
    if (base.userData.finitura) return base;
    const faccia = chiave === "muro" && !opz.dentro ? FACCIATE[opz.facciata] : null;
    const look = faccia ? { trama: faccia.trama, metri: faccia.metri } : chiave === "muro" ? { trama: "intonaco", metri: 1 } : LOOK[chiave];
    const colorePerInfissi = chiave === "telaio" || (chiave === "oscurante" && !opz.dentro) ? INFISSI[opz.infissi].colore : null;
    if (!look && !colorePerInfissi && chiave !== "vetro") return null;
    const id = `${chiave}|${opz.dentro ? "interno" : opz.facciata}|${colorePerInfissi ? opz.infissi : ""}`;
    const gia = materiali.get(id);
    if (gia) return gia;
    const m = base.clone();
    m.userData.materialeAspetto = true;
    if (colorePerInfissi) {
      m.color.set(colorePerInfissi);
      m.metalness = opz.infissi === "legno" ? .03 : .28;
      m.roughness = opz.infissi === "legno" ? .47 : .32;
    }
    if (chiave === "vetro") {
      m.color.set(opz.dentro ? "#dce8ee" : "#b1cddd");
      m.opacity = opz.dentro ? .13 : .26;
      m.roughness = 0.04;
      m.metalness = 0.1;
      m.envMapIntensity = 2.2;
    }
    if (look) {
      const t = trama(look.trama);
      if (t) {
        const tm = t.clone();
        tm.needsUpdate = true;
        m.map = tm;
        const def = TRAME[look.trama];
        if (def?.rilievo) { m.bumpMap = tm; m.bumpScale = def.rilievo * 2; }
        if (faccia) m.color = new THREE.Color(faccia.colore);
        else if (look.trama !== "intonaco" && look.trama !== "tessuto" && chiave !== "stipite") m.color.set("#ffffff");
        if ("metallo" in look && look.metallo) m.metalness = look.metallo;
        if ("ruvidita" in look && look.ruvidita) m.roughness = look.ruvidita;
      }
    }
    m.userData.metri = look?.metri ?? 0;
    m.needsUpdate = true;
    materiali.set(id, m);
    return m;
  };

  const costruisciCielo = (stato: StatoSole, raggioScena: number) => {
    if (cielo) { cielo.geometry.dispose(); (cielo.material as THREE.Material).dispose(); scene.remove(cielo); }
    const g = new THREE.SphereGeometry(Math.max(300, raggioScena * 8), 32, 20);
    const colori: number[] = [];
    const alto = new THREE.Color(stato.cielo.zenit), basso = new THREE.Color(stato.cielo.orizzonte);
    const pos = g.getAttribute("position");
    const raggio = g.parameters.radius;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / raggio);
      const c = basso.clone().lerp(alto, Math.pow(t, 0.38));
      colori.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colori, 3));
    cielo = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    cielo.name = "Cielo";
    cielo.renderOrder = -10;
    scene.add(cielo);
  };

  const rimuoviAlberi = () => {
    alberi?.traverse((o) => { if (o instanceof THREE.InstancedMesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    if (alberi) scene.remove(alberi);
    alberi = null;
    scenaAlberi = null;
  };

  const costruisciAlberi = (scena: Scena3D) => {
    rimuoviAlberi();
    scenaAlberi = scena;
    // se la pianta ha un lotto disegnato (prato, aiuole, alberi suoi) il giardino lo ha deciso chi l'ha fatta
    if (!ammetteAlberiDiContesto(scena)) return;
    const posti = postiAlberi(scena.limiti);
    if (!posti.length) return;
    const alberiVeri = posti.filter((p) => !p.cespuglio), cespugli = posti.filter((p) => p.cespuglio);
    const g = new THREE.Group();
    g.name = "Alberi";
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 1, 7), new THREE.MeshStandardMaterial({ color: "#6b4f37", roughness: 1 }), Math.max(1, alberiVeri.length));
    const chiome = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: false }), posti.length);
    tronco.count = alberiVeri.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), colore = new THREE.Color();
    alberiVeri.forEach((a, i) => {
      p.set(a.x, a.altezzaTronco / 2, a.z); s.set(1, a.altezzaTronco, 1);
      tronco.setMatrixAt(i, m4.compose(p, q, s));
    });
    posti.forEach((a, i) => {
      p.set(a.x, a.altezzaTronco + a.raggioChioma * (a.cespuglio ? 0.6 : 0.75), a.z);
      s.set(a.raggioChioma, a.raggioChioma * (a.cespuglio ? 0.8 : 0.95), a.raggioChioma);
      chiome.setMatrixAt(i, m4.compose(p, q, s));
      colore.setHSL(0.24 + a.tinta * 0.07, 0.45 + a.tinta * 0.15, 0.27 + a.tinta * 0.12);
      chiome.setColorAt(i, colore);
    });
    // una seconda chioma, più piccola e storta, per non avere palline perfette
    const chiome2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), alberiVeri.length);
    alberiVeri.forEach((a, i) => {
      const dx = (a.tinta - 0.5) * a.raggioChioma * 0.9, dz = (((a.x * 7.3) % 1) - 0.5) * a.raggioChioma * 0.8;
      p.set(a.x + dx, a.altezzaTronco + a.raggioChioma * 1.2, a.z + dz);
      s.set(a.raggioChioma * 0.72, a.raggioChioma * 0.7, a.raggioChioma * 0.72);
      chiome2.setMatrixAt(i, m4.compose(p, q, s));
      colore.setHSL(0.25 + a.tinta * 0.06, 0.5 + a.tinta * 0.12, 0.33 + a.tinta * 0.1);
      chiome2.setColorAt(i, colore);
    });
    for (const o of [tronco, chiome, chiome2]) { o.castShadow = true; o.receiveShadow = true; o.instanceMatrix.needsUpdate = true; }
    if (chiome.instanceColor) chiome.instanceColor.needsUpdate = true;
    if (chiome2.instanceColor) chiome2.instanceColor.needsUpdate = true;
    g.add(tronco, chiome, chiome2);
    scene.add(g);
    alberi = g;
  };

  const spegniEffetti = () => {
    if (compositore) {
      compositore.passes.forEach(p => p.dispose());
      compositore.dispose();
      compositore = null;
      gtao = null;
    }
  };
  const accendiEffetti = () => {
    if (compositore) return;
    try {
      const rt = new THREE.WebGLRenderTarget(dimensioni.w, dimensioni.h, { type: THREE.HalfFloatType, samples: 4 });
      compositore = new EffectComposer(renderer, rt);
      compositore.addPass(new RenderPass(scene, camera));
      gtao = new GTAOPass(scene, camera, dimensioni.w, dimensioni.h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = .66;
      gtao.updateGtaoMaterial({ radius: .5, distanceExponent: 1.5, thickness: .72, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      compositore.addPass(gtao);
      compositore.addPass(new OutputPass());
      compositore.setSize(dimensioni.w, dimensioni.h);
    } catch {
      spegniEffetti();
    }
  };

  return {
    applica(gruppo, scena, opz, ambiente, finestra) {
      const attiva = opz.realistico;
      const luce = opz.luce ?? "giorno", sera = luce === "sera", diffusa = luce === "diffusa";
      renderer.shadowMap.needsUpdate = true;
      ambiente.sole.shadow.needsUpdate = true;
      // materiali: si parte sempre da quelli di base della scena
      if (gruppo) {
        gruppo.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          if (o.userData.genere === "soffitto") o.castShadow = attiva && !!opz.dentro;
          const chiave = o.userData.materiale as string | undefined;
          if (!o.userData.materialeBase) o.userData.materialeBase = o.material;
          const base = o.userData.materialeBase as THREE.MeshStandardMaterial;
          if (!attiva || !chiave) { o.material = base; return; }
          const nuovo = materialeAspetto(chiave, base, opz);
          if (!nuovo) { o.material = base; return; }
          o.material = nuovo;
          const metri = nuovo.userData.metri as number;
          if (metri && nuovo.map) {
            const geo = o.geometry as THREE.BufferGeometry;
            const chiaveUv = `uv|${metri}`;
            if (o.userData.uv !== chiaveUv) {
              geo.setAttribute("uv", new THREE.BufferAttribute(uvPerProiezione(geo.getAttribute("position").array, geo.getAttribute("normal").array, metri), 2));
              o.userData.uv = chiaveUv;
            }
          }
        });
      }
      const { min, max } = scena.limiti;
      const r = Math.max(4, Math.hypot(max[0] - min[0], max[2] - min[2]) / 2);
      const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
      const mt = ambiente.terreno.material as THREE.MeshStandardMaterial;
      if (scenaLed !== scena) {
        scenaLed = scena;
        posizioniLed = sorgentiLed(scena);
      }
      const centroLuci = finestra ? new THREE.Vector3(...finestra.centro) : camera.position;
      const vicine = attiva && opz.dentro ? [...posizioniLed]
        .sort((a, b) => a.posizione.distanceToSquared(centroLuci) - b.posizione.distanceToSquared(centroLuci))
        .filter(l => Math.abs(l.posizione.y - centroLuci.y) < 2.1) : [];
      if (vicine.length && !profiliLuminosiInizializzati) {
        RectAreaLightUniformsLib.init();
        profiliLuminosiInizializzati = true;
      }
      luciLed.forEach((lampada, i) => {
        const led = vicine[i];
        if (!led) { scene.remove(lampada); return; }
        if (!lampada.parent) scene.add(lampada);
        lampada.position.copy(led.posizione);
        lampada.width = led.lunghezza;
        lampada.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
          new THREE.Vector3(led.cos, 0, led.sin), new THREE.Vector3(led.sin, 0, -led.cos), new THREE.Vector3(0, 1, 0),
        ));
        lampada.intensity = sera ? 7 : diffusa ? 2.8 : 1.5;
      });
      if (!attiva || opz.dentro || opz.sfondoNeutro) {
        if (cielo) cielo.visible = false;
        rimuoviAlberi();
        mt.map = null; mt.color.set("#dfe3e6"); mt.needsUpdate = true;
        scene.background = sfondoOriginale;
        scene.environment = ambienteOriginale;
        scene.environmentIntensity = intensitaAmbienteOriginale;
        scene.fog = null;
        renderer.toneMappingExposure = esposizioneOriginale;
        ambiente.sole.color.set("#fff4e5"); ambiente.sole.intensity = 1.6;
        if (ambiente.hemi) {
          ambiente.hemi.color.set("#fff");
          ambiente.hemi.intensity = .9;
        }
      }
      if (!attiva) {
        spegniEffetti();
        return;
      }
      const st = sole(opz.ora, scena.nord);
      if (sera) st.cielo = { orizzonte: "#56667f", zenit: "#23354e" };
      if (diffusa) st.cielo = { orizzonte: "#e5e8ed", zenit: "#bac5d1" };
      if (opz.sfondoNeutro && !opz.dentro) {
        scene.background = new THREE.Color("#ecece7");
        scene.environmentIntensity = .72;
        mt.color.set("#deddd5");
        ambiente.sole.intensity = st.intensita * (sera ? .14 : diffusa ? .23 : .48);
        ambiente.sole.color.set(st.colore);
        const [dx, dy, dz] = st.direzione;
        ambiente.sole.position.set(cx + dx * r * 3, (scena.nord === undefined ? Math.max(dy, .48) : dy) * r * 3, cz + dz * r * 3);
        ambiente.sole.target.position.set(cx, 0, cz);
        if (ambiente.hemi) ambiente.hemi.intensity = sera ? .51 : 1.05;
        if (opz.effetti) accendiEffetti(); else spegniEffetti();
        return;
      }
      if (opz.dentro) {
        scene.background = new THREE.Color(st.cielo.orizzonte);
        scene.environmentIntensity = sera ? .18 : diffusa ? .52 : .42;
        renderer.toneMappingExposure = sera ? 1.18 : .95;
        if (ambiente.hemi) {
          ambiente.hemi.color.set(sera ? "#a8b7d1" : "#f5f0ee");
          ambiente.hemi.intensity = sera ? .4 : diffusa ? 1.03 : finestra ? .76 : .96;
        }
        ambiente.sole.intensity = sera ? .06 : diffusa ? .27 : scena.nord !== undefined || finestra ? 2.55 : .46;
        ambiente.sole.color.set(st.colore);
        if (scena.nord !== undefined) {
          const [dx, dy, dz] = st.direzione;
          ambiente.sole.position.set(cx + dx * r * 3, dy * r * 3, cz + dz * r * 3);
          ambiente.sole.target.position.set(cx, 0, cz);
        } else if (finestra) {
          const [x, y, z] = finestra.centro, [nx, nz] = finestra.fuori;
          const lato = 3.4 * Math.sin((opz.ora - 13) * Math.PI / 12);
          ambiente.sole.position.set(x + nx * 8 - nz * lato, y + 1.35 + st.direzione[1] * 3.2, z + nz * 8 + nx * lato);
          ambiente.sole.target.position.set(x - nx * 2, y - .74, z - nz * 2);
          const cam = ambiente.sole.shadow.camera;
          cam.left = cam.bottom = -6;
          cam.right = cam.top = 6;
          cam.far = 32;
          cam.updateProjectionMatrix();
        }
        if (opz.effetti) accendiEffetti(); else spegniEffetti();
        return;
      }
      // cielo, nebbia, riflessi del cielo sui vetri
      const chiaveCielo = `${opz.ora}/${luce}`;
      if (oraCielo !== chiaveCielo) {
        costruisciCielo(st, r);
        oraCielo = chiaveCielo;
        ambienteCielo?.dispose();
        ambienteCielo = null;
        try {
          const pm = new THREE.PMREMGenerator(renderer);
          const riflessi = new THREE.Scene();
          riflessi.add(cielo!.clone());
          ambienteCielo = pm.fromScene(riflessi, 0.02).texture;
          pm.dispose();
        } catch { /* si resta con l'ambiente di sempre */ }
      }
      if (cielo) cielo.visible = true;
      scene.background = new THREE.Color(st.cielo.orizzonte);
      scene.fog = new THREE.Fog(st.cielo.orizzonte, r * 4.5, r * 10);
      renderer.toneMappingExposure = st.esposizione;
      scene.environment = ambienteCielo ?? ambienteOriginale;
      scene.environmentIntensity = .9;
      // sole (con la sua ombra) e luce del cielo
      const d = st.direzione;
      ambiente.sole.position.set(cx + d[0] * r * 3, d[1] * r * 3, cz + d[2] * r * 3);
      ambiente.sole.target.position.set(cx, 0, cz);
      ambiente.sole.color.set(st.colore);
      ambiente.sole.intensity = st.intensita * (sera ? .10 : diffusa ? .17 : 1);
      if (ambiente.hemi) { ambiente.hemi.intensity = sera ? .61 : st.emisfero; ambiente.hemi.color.set(st.cielo.zenit); }
      // il prato
      ambiente.terreno.scale.setScalar(r * 12);
      const prato = trama("prato");
      if (prato) {
        tramaPrato ??= prato.clone();
        if (raggioPrato !== r) {
          tramaPrato.repeat.set((r * 24) / 3, (r * 24) / 3);
          tramaPrato.needsUpdate = true;
          raggioPrato = r;
        }
        mt.map = tramaPrato; mt.color.set("#c8e6a8"); mt.needsUpdate = true;
      }
      if (opz.alberi && scenaAlberi !== scena) costruisciAlberi(scena);
      else if (!opz.alberi && alberi) rimuoviAlberi();
      if (opz.effetti) accendiEffetti(); else spegniEffetti();
    },
    disegna() {
      if (compositore) compositore.render();
      else renderer.render(scene, camera);
    },
    dimensiona(w, h) {
      dimensioni = { w, h };
      compositore?.setSize(w, h);
      gtao?.setSize(w, h);
    },
    libera() {
      spegniEffetti();
      texture.forEach((t) => t.dispose());
      tramaPrato?.dispose();
      materiali.forEach((m) => { m.map?.dispose(); m.dispose(); });
      luciLed.forEach(luce => scene.remove(luce));
      if (cielo) { cielo.geometry.dispose(); (cielo.material as THREE.Material).dispose(); }
      if (ambienteCielo) ambienteCielo.dispose();
      rimuoviAlberi();
    },
  };
}
