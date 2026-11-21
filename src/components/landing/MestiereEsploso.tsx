/**
 * MestiereEsploso — l'oggetto del mestiere che si smonta in pezzi (vista esplosa),
 * per l'hero delle pagine «Per chi».
 *
 * Ogni mestiere ha il SUO oggetto, disegnato apposta e diviso in cinque pezzi:
 * la finestra dei serramentisti (telaio, guarnizione, vetrocamera, anta, maniglia),
 * il muro dei muratori, l'escavatore del movimento terra, la caldaia degli
 * impiantisti, il quadro elettrico, il furgone della piccola impresa… Ogni pezzo
 * porta il nome di un modulo della pagina (`config.modules`).
 *
 * Quando entra nello schermo l'oggetto si apre da solo: i pezzi si separano, ognuno
 * con la sua etichetta, poi si richiude e ricomincia. Passando col mouse (o toccando)
 * decide chi guarda: l'oggetto resta aperto e il pezzo sotto il cursore si accende.
 *
 * Ogni pezzo è disegnato da montato, in coordinate assolute su una tela 1000×720, e
 * dichiara di quanto si sposta quando l'oggetto si apre (`off`) e dove si aggancia
 * la sua etichetta (`a`). Animazioni continue in SMIL, apertura con transizioni CSS;
 * rispetta prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type MestiereModulo = { name: string; desc: string; icon: LucideIcon };

const W = 1000;
const H = 720;
const CX = 500;
const CY = 385;
const S = 0.96; // scala della scena attorno al centro: lascia spazio alle etichette

type Pezzo = {
  /** spostamento a oggetto aperto */
  off: [number, number];
  /** punto di aggancio dell'etichetta, a oggetto montato */
  a: [number, number];
  side: "l" | "r";
  el: ReactNode;
};

// ───────────────────────── Colori ─────────────────────────
const AR = "#F97415"; // arancione EiC
const LEGNO = "#d9a066";
const LEGNO_S = "#b97a3f";
const VETRO = "#bfe3f7";
const ACC = "#cbd5e1";
const ACC_S = "#94a3b8";
const SCURO = "#334155";
const CEM = "#d6d3d1";
const CEM_S = "#a8a29e";
const MATT = "#e07a4f";
const INK = "#1f2937";
const st = { stroke: INK, strokeOpacity: 0.28, strokeWidth: 1.5, strokeLinejoin: "round" as const };

// ───────────────────────── Aiuti di disegno ─────────────────────────
/** Una fila di mattoni sfalsati. `buchi`: indici dei mattoni mancanti (muro in costruzione). */
const Mattoni = ({ x, y, w, rows, buchi = [] }: { x: number; y: number; w: number; rows: number; buchi?: number[] }) => {
  const out: ReactNode[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const sfalsa = r % 2 ? 22 : 0;
    for (let bx = x - sfalsa; bx < x + w; bx += 44) {
      const x0 = Math.max(x, bx);
      const x1 = Math.min(x + w, bx + 42);
      if (x1 - x0 < 6) continue;
      if (!buchi.includes(n)) out.push(<rect key={n} x={x0} y={y + r * 20} width={x1 - x0} height={18} rx="2" fill={r % 2 ? "#d96f44" : MATT} {...st} />);
      n++;
    }
  }
  return <>{out}</>;
};

/** Griglia di finestre su una facciata. */
const Finestre = ({ x, y, cols, rows, w = 26, h = 30, gx = 14, gy = 14, fill = VETRO }: { x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number; fill?: string }) => (
  <>
    {Array.from({ length: cols * rows }, (_, k) => (
      <rect key={k} x={x + (k % cols) * (w + gx)} y={y + Math.floor(k / cols) * (h + gy)} width={w} height={h} rx="2" fill={fill} {...st} />
    ))}
  </>
);

/** Gru a torre: base del traliccio in (x, y), alta `h`, braccio lungo `l` verso destra (o sinistra se negativo). */
const GruTorre = ({ x, y, h, l }: { x: number; y: number; h: number; l: number }) => {
  const dir = l > 0 ? 1 : -1;
  const zig: string[] = [];
  for (let k = 0; k < h; k += 24) zig.push(`M${x - 8} ${y - k}L${x + 8} ${y - k - 24}M${x + 8} ${y - k}L${x - 8} ${y - k - 24}`);
  return (
    <g>
      <path d={`M${x - 8} ${y}V${y - h}M${x + 8} ${y}V${y - h}`} stroke={AR} strokeWidth="4" />
      <path d={zig.join("")} stroke={AR} strokeWidth="1.5" opacity="0.7" />
      <rect x={x - 14} y={y - h - 18} width="28" height="20" rx="3" fill={SCURO} />
      <path d={`M${x - dir * 60} ${y - h - 8}H${x + l}`} stroke={AR} strokeWidth="6" strokeLinecap="round" />
      <path d={`M${x} ${y - h - 48}L${x + l * 0.7} ${y - h - 10}M${x} ${y - h - 48}L${x - dir * 55} ${y - h - 10}M${x} ${y - h - 48}V${y - h - 18}`} stroke={SCURO} strokeWidth="1.5" />
      <rect x={x - dir * 66 - 10} y={y - h - 6} width="20" height="20" fill={CEM_S} {...st} />
      <g>
        <path d={`M${x + l * 0.75} ${y - h - 6}v46`} stroke={SCURO} strokeWidth="1.5" />
        <rect x={x + l * 0.75 - 11} y={y - h + 40} width="22" height="16" fill={MATT} {...st} />
        <animateTransform attributeName="transform" type="translate" values={`0 0;${-l * 0.3} 0;0 0`} dur="7s" repeatCount="indefinite" />
      </g>
    </g>
  );
};

// ───────────────────────── Gli oggetti ─────────────────────────
// Profondità per gli oggetti a strati (finestra, parete, fascicolo): ogni strato
// scorre in diagonale, come nelle viste esplose dei manuali di montaggio.
const prof = (k: number): [number, number] => [k * 62, k * -36];

const FINESTRA: Pezzo[] = [
  { // telaio fisso
    off: prof(-2), a: [362, 300], side: "l",
    el: (
      <g>
        <path fillRule="evenodd" d="M360 200h280v360h-280zM390 230v300h220v-300z" fill={LEGNO} {...st} />
        <path fillRule="evenodd" d="M360 200h280v360h-280zM366 206v348h268v-348z" fill={LEGNO_S} opacity="0.5" />
        <rect x="346" y="558" width="308" height="16" rx="3" fill={CEM} {...st} />
      </g>
    ),
  },
  { // guarnizione
    off: prof(-1), a: [616, 500], side: "r",
    el: <path fillRule="evenodd" d="M384 224h232v312h-232zM396 236v288h208v-288z" fill={SCURO} {...st} />,
  },
  { // vetrocamera
    off: prof(0), a: [400, 470], side: "l",
    el: (
      <g>
        <rect x="396" y="236" width="208" height="288" rx="3" fill={ACC_S} {...st} />
        <rect x="402" y="242" width="196" height="276" rx="2" fill={VETRO} />
        <path d="M420 500L500 260h26L446 500zM470 500L530 320h12L482 500z" fill="#fff" opacity="0.55">
          <animate attributeName="opacity" values="0.25;0.7;0.25" dur="4s" repeatCount="indefinite" />
        </path>
      </g>
    ),
  },
  { // anta
    off: prof(1), a: [620, 300], side: "r",
    el: (
      <g>
        <path fillRule="evenodd" d="M380 220h240v320h-240zM408 248v264h184v-264z" fill="#e6b27a" {...st} />
        <rect x="372" y="262" width="10" height="34" rx="3" fill={ACC_S} {...st} />
        <rect x="372" y="464" width="10" height="34" rx="3" fill={ACC_S} {...st} />
      </g>
    ),
  },
  { // maniglia
    off: prof(2), a: [612, 392], side: "r",
    el: (
      <g>
        <rect x="598" y="352" width="14" height="52" rx="5" fill={ACC} {...st} />
        <path d="M605 368h-52a8 8 0 0 0 0 16h52z" fill={AR} {...st} />
      </g>
    ),
  },
];

const MURO: Pezzo[] = [
  { off: [0, 56], a: [336, 548], side: "l", el: <rect x="326" y="524" width="348" height="46" rx="4" fill={CEM} {...st} /> },
  { off: [0, 0], a: [652, 482], side: "r", el: <Mattoni x={350} y={444} w={300} rows={4} /> },
  { off: [0, -66], a: [352, 400], side: "l", el: <Mattoni x={350} y={364} w={300} rows={4} buchi={[0, 1, 2]} /> },
  { // intonaco
    off: [-118, -6], a: [352, 470], side: "l",
    el: (
      <g>
        <path d="M350 384h150v140h-150z" fill="#f5efe6" {...st} />
        <path d="M362 410c40-14 80 12 126-4M362 450c40-14 80 12 126-4M362 490c40-14 80 12 126-4" stroke="#d8c9b3" strokeWidth="3" fill="none" />
      </g>
    ),
  },
  { // cazzuola e livella
    off: [70, -116], a: [640, 318], side: "r",
    el: (
      <g>
        <rect x="520" y="336" width="130" height="16" rx="3" fill="#facc15" {...st} />
        <rect x="574" y="339" width="22" height="10" rx="3" fill="#bbf7d0" {...st} />
        <path d="M560 328l64-34 18 26z" fill={ACC} {...st} />
        <path d="M624 294l22-14" stroke={AR} strokeWidth="10" strokeLinecap="round" />
      </g>
    ),
  },
];

const FOTOVOLTAICO: Pezzo[] = [
  { // falda del tetto
    off: [0, 86], a: [330, 520], side: "l",
    el: (
      <g>
        <path d="M320 500L680 400v70L320 570z" fill="#c2410c" {...st} />
        {[0, 1, 2, 3].map((k) => <path key={k} d={`M320 ${514 + k * 14}L680 ${414 + k * 14}`} stroke="#fdba74" strokeWidth="1.5" opacity="0.7" />)}
      </g>
    ),
  },
  { // binari
    off: [0, 22], a: [676, 418], side: "r",
    el: (
      <g stroke={ACC_S} strokeWidth="7" strokeLinecap="round">
        <path d="M340 484L660 396" />
        <path d="M340 524L660 436" />
      </g>
    ),
  },
  { // pannelli
    off: [0, -52], a: [350, 470], side: "l",
    el: (
      <g>
        <path d="M344 474L656 388v62L344 536z" fill="#1e3a8a" {...st} />
        {[1, 2, 3, 4, 5].map((k) => <path key={k} d={`M${344 + k * 52} ${474 - k * 14.3}v62`} stroke="#60a5fa" strokeWidth="1.5" />)}
        <path d="M344 505L656 419" stroke="#60a5fa" strokeWidth="1.5" />
        <path d="M344 474L656 388v62L344 536z" fill="#fff" opacity="0">
          <animate attributeName="opacity" values="0;0.22;0" dur="5s" repeatCount="indefinite" />
        </path>
      </g>
    ),
  },
  { // inverter
    off: [76, 50], a: [690, 540], side: "r",
    el: (
      <g>
        <rect x="620" y="500" width="76" height="92" rx="8" fill="#f8fafc" {...st} />
        <rect x="632" y="514" width="52" height="24" rx="4" fill="#dcfce7" {...st} />
        <path d="M660 548l-10 16h10l-6 14" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
  { // sole
    off: [-46, -50], a: [330, 250], side: "l",
    el: (
      <g transform="translate(360 250)">
        <g stroke="#f59e0b" strokeWidth="5" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => <path key={d} d="M0 -46V-60" transform={`rotate(${d})`} />)}
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="24s" repeatCount="indefinite" />
        </g>
        <circle r="34" fill="#fbbf24" {...st} />
      </g>
    ),
  },
];

const CASA: Pezzo[] = [
  { off: [0, 54], a: [346, 556], side: "l", el: <rect x="336" y="540" width="328" height="34" rx="4" fill={CEM} {...st} /> },
  { // muri
    off: [0, 0], a: [642, 500], side: "r",
    el: (
      <g>
        <rect x="360" y="384" width="280" height="156" fill="#f5efe6" {...st} />
        <Mattoni x={560} y={480} w={80} rows={3} />
      </g>
    ),
  },
  { // infissi
    off: [-136, 26], a: [386, 450], side: "l",
    el: (
      <g>
        <rect x="384" y="420" width="58" height="56" rx="3" fill={VETRO} stroke={LEGNO_S} strokeWidth="5" />
        <path d="M413 420v56M384 448h58" stroke={LEGNO_S} strokeWidth="3" />
        <rect x="470" y="446" width="60" height="94" rx="3" fill={LEGNO} {...st} />
        <circle cx="520" cy="496" r="4" fill={AR} />
      </g>
    ),
  },
  { // tetto
    off: [0, -86], a: [372, 356], side: "l",
    el: (
      <g>
        <rect x="580" y="292" width="26" height="50" fill={MATT} {...st} />
        <path d="M336 384L500 270l164 114z" fill="#c2410c" {...st} />
        <path d="M376 356h248M416 328h168M456 300h88" stroke="#fdba74" strokeWidth="1.5" opacity="0.7" />
      </g>
    ),
  },
  { // rullo
    off: [96, -24], a: [700, 420], side: "r",
    el: (
      <g>
        <rect x="640" y="404" width="12" height="96" rx="4" fill={AR} opacity="0.35" />
        <rect x="656" y="396" width="50" height="26" rx="8" fill={AR} {...st} />
        <path d="M706 409h14v34h-38v52" stroke={SCURO} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <animateTransform attributeName="transform" type="translate" values="0 0;0 34;0 0" dur="3s" repeatCount="indefinite" />
      </g>
    ),
  },
];

const CALDAIA: Pezzo[] = [
  { // radiatore
    off: [-76, 24], a: [336, 470], side: "l",
    el: (
      <g>
        {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={330 + k * 20} y="410" width="16" height="120" rx="7" fill="#f8fafc" {...st} />)}
        <path d="M330 424h96M330 516h96" stroke={ACC_S} strokeWidth="4" />
      </g>
    ),
  },
  { // tubi
    off: [0, 64], a: [470, 520], side: "l",
    el: (
      <g fill="none" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M490 432v60h-64" stroke="#ef4444" />
        <path d="M550 432v96h-124" stroke="#3b82f6" />
      </g>
    ),
  },
  { // scocca
    off: [0, 0], a: [592, 300], side: "r",
    el: (
      <g>
        <rect x="450" y="246" width="140" height="188" rx="12" fill="#ffffff" {...st} />
        <rect x="470" y="266" width="100" height="30" rx="5" fill="#0f172a" />
        <text x="520" y="287" textAnchor="middle" fontSize="16" fontWeight="800" fill="#4ade80">21.5°</text>
        <rect x="474" y="330" width="92" height="74" rx="8" fill="#f1f5f9" {...st} />
      </g>
    ),
  },
  { // bruciatore
    off: [126, 4], a: [560, 380], side: "r",
    el: (
      <g>
        <rect x="484" y="384" width="72" height="12" rx="4" fill={SCURO} />
        {[0, 1, 2, 3].map((k) => (
          <path key={k} d={`M${494 + k * 18} 384c-8-12 4-16 0-30c10 8 12 20 0 30z`} fill={k % 2 ? "#60a5fa" : AR}>
            <animateTransform attributeName="transform" type="scale" values="1 1;1 0.8;1 1" dur={`${0.5 + k * 0.12}s`} repeatCount="indefinite" additive="sum" />
          </path>
        ))}
      </g>
    ),
  },
  { // termostato
    off: [66, -64], a: [660, 250], side: "r",
    el: (
      <g>
        <circle cx="640" cy="250" r="34" fill="#f8fafc" {...st} />
        <circle cx="640" cy="250" r="24" fill="none" stroke={AR} strokeWidth="5" strokeDasharray="110 150" strokeLinecap="round" transform="rotate(-210 640 250)" />
        <text x="640" y="256" textAnchor="middle" fontSize="15" fontWeight="800" fill={INK}>21°</text>
      </g>
    ),
  },
];

const QUADRO: Pezzo[] = [
  { off: [-84, 46], a: [404, 300], side: "l", el: <rect x="400" y="240" width="200" height="284" rx="12" fill={ACC} {...st} /> },
  { // cavi
    off: [0, 76], a: [470, 560], side: "l",
    el: (
      <g fill="none" strokeWidth="7" strokeLinecap="round">
        <path d="M460 516c0 40-30 30-30 70" stroke="#f59e0b" />
        <path d="M500 516v70" stroke="#22c55e" />
        <path d="M540 516c0 40 30 30 30 70" stroke="#3b82f6" />
      </g>
    ),
  },
  { // interruttori
    off: [0, 0], a: [584, 380], side: "r",
    el: (
      <g>
        <rect x="416" y="372" width="168" height="10" fill={ACC_S} />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <g key={k}>
            <rect x={420 + k * 27} y="338" width="23" height="78" rx="4" fill="#f8fafc" {...st} />
            <rect x={427 + k * 27} y={k === 2 ? 372 : 352} width="9" height="20" rx="2" fill={k === 2 ? "#ef4444" : SCURO}>
              {k === 2 && <animate attributeName="y" values="372;352;352;372" keyTimes="0;0.3;0.8;1" dur="4s" repeatCount="indefinite" />}
            </rect>
          </g>
        ))}
      </g>
    ),
  },
  { // sportello
    off: [112, -62], a: [590, 290], side: "r",
    el: (
      <g>
        <rect x="408" y="250" width="184" height="264" rx="8" fill="#93c5fd" fillOpacity="0.35" stroke={ACC_S} strokeWidth="3" />
        <rect x="574" y="366" width="8" height="34" rx="3" fill={SCURO} />
      </g>
    ),
  },
  { // lampadina
    off: [0, -62], a: [470, 180], side: "l",
    el: (
      <g>
        <circle cx="500" cy="176" r="46" fill="#fde68a" opacity="0.5">
          <animate attributeName="opacity" values="0.15;0.6;0.15" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <path d="M500 146a28 28 0 0 1 16 51v11h-32v-11a28 28 0 0 1 16-51z" fill="#fbbf24" {...st} />
        <rect x="486" y="208" width="28" height="14" rx="3" fill={ACC_S} {...st} />
      </g>
    ),
  },
];

const PARETE: Pezzo[] = [
  { // orditura metallica
    off: prof(-2), a: [364, 300], side: "l",
    el: (
      <g fill={ACC} {...st}>
        <rect x="356" y="222" width="288" height="14" />
        <rect x="356" y="528" width="288" height="14" />
        {[360, 428, 496, 564, 630].map((x) => <rect key={x} x={x} y="236" width="12" height="292" />)}
      </g>
    ),
  },
  { // isolante
    off: prof(-1), a: [634, 500], side: "r",
    el: (
      <g>
        <rect x="366" y="232" width="268" height="300" rx="6" fill="#fde047" {...st} />
        {[0, 1, 2, 3, 4, 5].map((k) => <path key={k} d={`M374 ${262 + k * 46}c30-16 50 16 80 0s50 16 80 0s50 16 92 0`} stroke="#eab308" strokeWidth="3" fill="none" />)}
      </g>
    ),
  },
  { // lastra
    off: prof(0), a: [364, 470], side: "l",
    el: (
      <g>
        <rect x="360" y="226" width="280" height="312" fill="#f1f0ec" {...st} />
        <path d="M500 226v312" stroke={CEM_S} strokeWidth="1.5" />
        {[250, 320, 390, 460, 520].map((y) => [372, 488, 512, 628].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={CEM_S} />))}
      </g>
    ),
  },
  { // stucco dei giunti
    off: prof(1), a: [520, 250], side: "r",
    el: (
      <g>
        <rect x="486" y="226" width="28" height="312" fill="#ffffff" {...st} />
        <path d="M520 420l52-14 8 30-52 14z" fill={ACC} {...st} />
        <path d="M576 410l34-22" stroke={AR} strokeWidth="10" strokeLinecap="round" />
      </g>
    ),
  },
  { // pittura
    off: prof(2), a: [640, 330], side: "r",
    el: (
      <g>
        <rect x="360" y="226" width="150" height="312" fill={AR} opacity="0.85" {...st} />
        <rect x="524" y="300" width="60" height="28" rx="9" fill="#fff7ed" {...st} />
        <path d="M584 314h16v38h-46v70" stroke={SCURO} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
];

const Pilastro = ({ x }: { x: number }) => (
  <g fill={ACC_S} {...st}>
    <rect x={x - 26} y="306" width="12" height="216" />
    <rect x={x + 14} y="306" width="12" height="216" />
    <rect x={x - 14} y="306" width="28" height="216" fill={ACC} />
  </g>
);
const Plinto = ({ x }: { x: number }) => <path d={`M${x - 60} 572v-30h26v-20h68v20h26v30z`} fill={CEM} {...st} />;

// Un portale in acciaio: due plinti, due pilastri, la trave, la piastra bullonata, il controvento.
const CARPENTERIA: Pezzo[] = [
  { off: [0, 56], a: [336, 556], side: "l", el: <g><Plinto x={390} /><Plinto x={610} /></g> },
  { off: [0, 0], a: [366, 440], side: "l", el: <g><Pilastro x={390} /><Pilastro x={610} /></g> },
  { // trave
    off: [0, -78], a: [340, 286], side: "l",
    el: (
      <g fill={ACC_S} {...st}>
        <rect x="330" y="266" width="340" height="10" />
        <rect x="330" y="296" width="340" height="10" />
        <rect x="330" y="276" width="340" height="20" fill={ACC} />
        {[400, 470, 540, 610].map((x) => <path key={x} d={`M${x} 276v20`} strokeWidth="2" />)}
      </g>
    ),
  },
  { // piastra coi bulloni
    off: [104, -26], a: [646, 312], side: "r",
    el: (
      <g>
        <rect x="574" y="280" width="72" height="64" rx="4" fill="#fed7aa" {...st} />
        {[[590, 296], [630, 296], [590, 328], [630, 328]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill={AR} {...st} />)}
      </g>
    ),
  },
  { // controvento e saldatura
    off: [0, 26], a: [560, 380], side: "r",
    el: (
      <g>
        <path d="M418 512L582 322M418 322L582 512" stroke={ACC_S} strokeWidth="9" strokeLinecap="round" />
        <circle cx="500" cy="417" r="12" fill={ACC} {...st} />
        <g fill="#fbbf24">
          {[0, 1, 2, 3, 4].map((k) => (
            <circle key={k} cx="420" cy="510" r="3.5">
              <animate attributeName="cx" values={`420;${380 + k * 20}`} dur="0.7s" begin={`${k * 0.14}s`} repeatCount="indefinite" />
              <animate attributeName="cy" values={`510;${468 + (k % 2) * 28}`} dur="0.7s" begin={`${k * 0.14}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0" dur="0.7s" begin={`${k * 0.14}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      </g>
    ),
  },
];

const ESCAVATORE: Pezzo[] = [
  { // cingoli
    off: [0, 54], a: [366, 530], side: "l",
    el: (
      <g>
        <rect x="350" y="500" width="220" height="56" rx="28" fill={SCURO} {...st} />
        {[378, 420, 460, 500, 542].map((x) => <circle key={x} cx={x} cy="528" r="13" fill={ACC_S} {...st} />)}
      </g>
    ),
  },
  { // torretta e cabina
    off: [0, 0], a: [376, 440], side: "l",
    el: (
      <g>
        <path d="M372 500v-70h76v-36h74l22 54v52z" fill={AR} {...st} />
        <path d="M458 404h58l16 40h-74z" fill={VETRO} {...st} />
        <rect x="380" y="444" width="56" height="10" rx="3" fill="#c2560c" />
      </g>
    ),
  },
  { // braccio
    off: [44, -74], a: [600, 300], side: "r",
    el: (
      <g>
        <g fill="none" stroke={AR} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
          <path d="M524 436L630 306" />
          <path d="M630 306L704 420" strokeWidth="16" />
        </g>
        <path d="M560 380L616 330" stroke={ACC_S} strokeWidth="7" strokeLinecap="round" />
        <animateTransform attributeName="transform" type="rotate" values="0 524 436;-4 524 436;0 524 436" dur="5s" repeatCount="indefinite" />
      </g>
    ),
  },
  { // benna
    off: [116, -12], a: [730, 440], side: "r",
    el: (
      <g>
        <path d="M684 410h46l8 44-30 22-36-28z" fill={SCURO} {...st} />
        <path d="M672 448l-4 14M690 462l-2 14M708 476l2 12" stroke={ACC_S} strokeWidth="5" strokeLinecap="round" />
      </g>
    ),
  },
  { // terra
    off: [66, 62], a: [740, 550], side: "r",
    el: (
      <g>
        <path d="M620 574c20-50 50-64 76-40c16-22 50-14 64 40z" fill="#a16207" {...st} />
        <path d="M650 556l8 4M690 548l8 5M722 560l8 3" stroke="#fde68a" strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  },
];

const PROGETTO: Pezzo[] = [
  { // terreno
    off: [0, 56], a: [350, 546], side: "l",
    el: (
      <g>
        <path d="M330 566l60-56h280l-60 56z" fill="#86efac" {...st} />
        {[[336, 566], [392, 512], [668, 512], [612, 566]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="#ef4444" {...st} />)}
      </g>
    ),
  },
  { // planimetria
    off: [0, 0], a: [372, 440], side: "l",
    el: (
      <g>
        <rect x="370" y="304" width="260" height="196" rx="6" fill="#1d4ed8" {...st} />
        <path d="M390 344h220M390 384h220M390 424h220M390 464h220M430 320v164M490 320v164M550 320v164" stroke="#bfdbfe" strokeWidth="0.8" opacity="0.5" />
        <path d="M410 336h130v60h60v84h-190zM480 336v60M410 420h70" stroke="#fff" strokeWidth="3" fill="none" strokeDasharray="700" strokeDashoffset="700">
          <animate attributeName="stroke-dashoffset" values="700;0;0;700" keyTimes="0;0.55;0.9;1" dur="6s" repeatCount="indefinite" />
        </path>
      </g>
    ),
  },
  { // casa in filo di ferro
    off: [0, -84], a: [570, 250], side: "r",
    el: (
      <g fill="none" stroke={AR} strokeWidth="3" strokeLinejoin="round">
        <path d="M430 300v-60l50-34 50 34v60zM530 300l50-22v-60l-50 22M480 206l50-22 50 34M530 184v56" />
      </g>
    ),
  },
  { // squadra e matita
    off: [94, 12], a: [700, 440], side: "r",
    el: (
      <g>
        <path d="M640 500v-110l90 110zM660 482v-46l38 46z" fill="#fde68a" fillRule="evenodd" {...st} />
        <path d="M716 372l-34 60" stroke={AR} strokeWidth="9" strokeLinecap="round" />
        <path d="M682 432l-4 12 10-8z" fill={INK} />
      </g>
    ),
  },
  { // timbro
    off: [-84, -52], a: [356, 260], side: "l",
    el: (
      <g transform="rotate(-14 384 258)">
        <circle cx="384" cy="258" r="42" fill="#dcfce7" stroke="#16a34a" strokeWidth="5" />
        <circle cx="384" cy="258" r="32" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M366 258l12 13l24-27" stroke="#16a34a" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
];

const FASCICOLO: Pezzo[] = [
  { // cartella
    off: [-92, 50], a: [372, 330], side: "l",
    el: <path d="M366 290h90l18 22h160v214h-268z" fill="#fbbf24" {...st} />,
  },
  { // registro
    off: [0, 0], a: [402, 480], side: "l",
    el: (
      <g>
        <rect x="396" y="300" width="208" height="210" rx="6" fill="#ffffff" {...st} />
        <path d="M412 336h176M412 372h176M412 408h176M412 444h176M412 480h176M470 320v176M530 320v176" stroke={ACC} strokeWidth="2" />
      </g>
    ),
  },
  { // fattura
    off: [86, -50], a: [610, 320], side: "r",
    el: (
      <g>
        <rect x="410" y="286" width="196" height="216" rx="6" fill="#fff7ed" {...st} />
        <rect x="410" y="286" width="196" height="30" rx="6" fill={AR} />
        <path d="M428 344h120M428 370h150M428 396h100M428 422h140" stroke="#fdba74" strokeWidth="6" strokeLinecap="round" />
        <text x="566" y="484" fontSize="40" fontWeight="900" fill={AR}>€</text>
      </g>
    ),
  },
  { // calcolatrice
    off: [96, 46], a: [700, 500], side: "r",
    el: (
      <g>
        <rect x="620" y="440" width="84" height="116" rx="10" fill={SCURO} {...st} />
        <rect x="630" y="450" width="64" height="24" rx="4" fill="#bbf7d0" />
        {Array.from({ length: 9 }, (_, k) => <rect key={k} x={630 + (k % 3) * 23} y={484 + Math.floor(k / 3) * 22} width="18" height="16" rx="3" fill={k === 8 ? AR : ACC} />)}
      </g>
    ),
  },
  { // grafico
    off: [0, -76], a: [440, 220], side: "l",
    el: (
      <g>
        {[{ x: 440, h: 34 }, { x: 472, h: 52 }, { x: 504, h: 44 }, { x: 536, h: 76 }].map((b, k) => (
          <rect key={b.x} x={b.x} y={264 - b.h} width="24" height={b.h} rx="4" fill={k === 3 ? AR : ACC_S} {...st}>
            <animate attributeName="height" values={`${b.h * 0.4};${b.h};${b.h}`} keyTimes="0;0.4;1" dur="4s" repeatCount="indefinite" />
            <animate attributeName="y" values={`${264 - b.h * 0.4};${264 - b.h};${264 - b.h}`} keyTimes="0;0.4;1" dur="4s" repeatCount="indefinite" />
          </rect>
        ))}
        <path d="M430 266h144" stroke={INK} strokeOpacity="0.4" strokeWidth="2" />
      </g>
    ),
  },
];

const FURGONE: Pezzo[] = [
  { // ruote
    off: [0, 54], a: [384, 548], side: "l",
    el: (
      <g>
        {[414, 596].map((x) => (
          <g key={x}>
            <circle cx={x} cy="540" r="36" fill={SCURO} {...st} />
            <circle cx={x} cy="540" r="15" fill={ACC} {...st} />
          </g>
        ))}
      </g>
    ),
  },
  { // furgone
    off: [0, 0], a: [344, 430], side: "l",
    el: (
      <g>
        <path d="M336 380h226v140h-226z" fill="#f8fafc" {...st} />
        <path d="M562 404h56l44 50v66h-100z" fill="#f8fafc" {...st} />
        <path d="M574 416h40l32 38h-72z" fill={VETRO} {...st} />
        <rect x="336" y="462" width="226" height="18" fill={AR} />
        <rect x="640" y="486" width="22" height="12" rx="4" fill="#fde68a" />
      </g>
    ),
  },
  { // scala
    off: [0, -72], a: [560, 364], side: "r",
    el: (
      <g stroke={ACC_S} strokeWidth="5" strokeLinecap="round">
        <path d="M346 360h216M346 376h216" />
        {[366, 402, 438, 474, 510, 546].map((x) => <path key={x} d={`M${x} 360v16`} />)}
      </g>
    ),
  },
  { // cassetta attrezzi
    off: [-150, 36], a: [420, 470], side: "l",
    el: (
      <g>
        <rect x="408" y="446" width="84" height="54" rx="6" fill="#ef4444" {...st} />
        <path d="M430 446v-12h40v12" stroke={SCURO} strokeWidth="5" fill="none" strokeLinejoin="round" />
        <rect x="440" y="464" width="20" height="10" rx="2" fill="#fde68a" />
      </g>
    ),
  },
  { // casco
    off: [64, -84], a: [650, 330], side: "r",
    el: (
      <g>
        <path d="M578 344a36 36 0 0 1 72 0z" fill={AR} {...st} />
        <rect x="568" y="342" width="92" height="10" rx="5" fill="#c2560c" />
        <rect x="608" y="306" width="12" height="38" rx="5" fill="#fdba74" />
      </g>
    ),
  },
];

const PALAZZINA: Pezzo[] = [
  { off: [0, 48], a: [352, 558], side: "l", el: <rect x="346" y="542" width="308" height="30" rx="4" fill={CEM} {...st} /> },
  { // piano terra
    off: [0, 0], a: [632, 500], side: "r",
    el: (
      <g>
        <rect x="370" y="452" width="260" height="90" fill="#f5efe6" {...st} />
        <rect x="476" y="478" width="48" height="64" rx="3" fill={LEGNO} {...st} />
        <Finestre x={392} y={474} cols={1} rows={1} w={54} h={36} />
        <Finestre x={554} y={474} cols={1} rows={1} w={54} h={36} />
      </g>
    ),
  },
  { // primo piano
    off: [0, -54], a: [372, 410], side: "l",
    el: (
      <g>
        <rect x="370" y="362" width="260" height="90" fill="#ece5d8" {...st} />
        <Finestre x={392} y={386} cols={3} rows={1} w={54} h={40} gx={27} />
        <path d="M356 362v90M356 396h14M356 430h14" stroke={ACC_S} strokeWidth="4" />
      </g>
    ),
  },
  { // solaio di copertura
    off: [0, -108], a: [380, 350], side: "l",
    el: (
      <g>
        <rect x="360" y="342" width="280" height="20" fill={CEM_S} {...st} />
        {[390, 440, 490, 540, 590].map((x) => <path key={x} d={`M${x} 342v-26`} stroke="#b45309" strokeWidth="3" strokeLinecap="round" />)}
      </g>
    ),
  },
  { off: [70, -30], a: [690, 300], side: "r", el: <GruTorre x={684} y={572} h={300} l={-160} /> },
];

const TORRE: Pezzo[] = [
  { // podio
    off: [0, 48], a: [386, 540], side: "l",
    el: (
      <g>
        <rect x="376" y="500" width="248" height="72" fill={CEM} {...st} />
        <rect x="470" y="522" width="60" height="50" fill={VETRO} {...st} />
        <path d="M500 522v50" stroke={ACC_S} strokeWidth="2" />
      </g>
    ),
  },
  { // corpo basso
    off: [0, 0], a: [412, 450], side: "l",
    el: (
      <g>
        <rect x="408" y="400" width="184" height="100" fill="#93c5fd" {...st} />
        <path d="M408 433h184M408 466h184M454 400v100M500 400v100M546 400v100" stroke="#fff" strokeWidth="2" opacity="0.8" />
      </g>
    ),
  },
  { // corpo alto
    off: [0, -54], a: [412, 350], side: "l",
    el: (
      <g>
        <rect x="408" y="300" width="184" height="100" fill="#bfdbfe" {...st} />
        <path d="M408 333h184M408 366h184M454 300v100M500 300v100M546 300v100" stroke="#fff" strokeWidth="2" opacity="0.8" />
      </g>
    ),
  },
  { // coronamento
    off: [0, -108], a: [430, 270], side: "l",
    el: (
      <g>
        <rect x="428" y="244" width="144" height="56" fill={SCURO} {...st} />
        <path d="M500 244v-66" stroke={SCURO} strokeWidth="4" strokeLinecap="round" />
        <circle cx="500" cy="176" r="6" fill="#ef4444">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </g>
    ),
  },
  { off: [76, -34], a: [690, 300], side: "r", el: <GruTorre x={672} y={572} h={330} l={-150} /> },
];

const BETONIERA: Pezzo[] = [
  { // telaio e ruote
    off: [0, 54], a: [400, 540], side: "l",
    el: (
      <g>
        <path d="M410 540L470 440h80l50 100" stroke={SCURO} strokeWidth="9" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {[420, 592].map((x) => <circle key={x} cx={x} cy="546" r="26" fill={SCURO} stroke={ACC} strokeWidth="6" />)}
      </g>
    ),
  },
  { // motore
    off: [-98, 12], a: [384, 470], side: "l",
    el: (
      <g>
        <rect x="376" y="430" width="78" height="72" rx="8" fill={SCURO} {...st} />
        <path d="M390 448h50M390 462h50M390 476h50" stroke={ACC_S} strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  },
  { // tamburo
    off: [0, -40], a: [586, 330], side: "r",
    el: (
      <g>
        <path d="M452 430l30-120h76l40 120c-30 34-116 34-146 0z" fill={AR} {...st} />
        <ellipse cx="520" cy="310" rx="38" ry="12" fill="#431407" {...st} />
        <path d="M470 400c36 16 76 16 110 0M476 366c30 12 62 12 92 0" stroke="#fdba74" strokeWidth="4" fill="none">
          <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2.4s" repeatCount="indefinite" />
        </path>
      </g>
    ),
  },
  { // pala
    off: [96, 0], a: [680, 420], side: "r",
    el: (
      <g>
        <path d="M660 350v150" stroke={LEGNO_S} strokeWidth="9" strokeLinecap="round" />
        <path d="M640 496h40v36c0 22-40 22-40 0z" fill={ACC} {...st} />
        <path d="M644 350h32" stroke={LEGNO_S} strokeWidth="9" strokeLinecap="round" />
      </g>
    ),
  },
  { // sacco di cemento
    off: [74, 64], a: [700, 556], side: "r",
    el: (
      <g>
        <path d="M612 520c20-8 76-8 96 0l6 50c-30 10-78 10-108 0z" fill="#e7e5e4" {...st} />
        <text x="660" y="556" textAnchor="middle" fontSize="18" fontWeight="900" fill={SCURO}>CEM</text>
      </g>
    ),
  },
];

const OGGETTI: Record<string, { nome: string; pezzi: Pezzo[] }> = {
  serramentisti: { nome: "La finestra, pezzo per pezzo", pezzi: FINESTRA },
  muratori: { nome: "Il muro, corso per corso", pezzi: MURO },
  fotovoltaico: { nome: "L'impianto, pezzo per pezzo", pezzi: FOTOVOLTAICO },
  ristrutturatori: { nome: "La casa, pezzo per pezzo", pezzi: CASA },
  impiantisti: { nome: "L'impianto, pezzo per pezzo", pezzi: CALDAIA },
  installatori: { nome: "Il quadro, pezzo per pezzo", pezzi: QUADRO },
  cartongessisti: { nome: "La parete, strato per strato", pezzi: PARETE },
  "carpenteria-metallica": { nome: "La struttura, pezzo per pezzo", pezzi: CARPENTERIA },
  "movimento-terra": { nome: "L'escavatore, pezzo per pezzo", pezzi: ESCAVATORE },
  geometri: { nome: "Il progetto, foglio per foglio", pezzi: PROGETTO },
  "commercialista-edilizia": { nome: "Il fascicolo, carta per carta", pezzi: FASCICOLO },
  "piccole-imprese": { nome: "Il furgone, pezzo per pezzo", pezzi: FURGONE },
  "medie-imprese": { nome: "Il cantiere, piano per piano", pezzi: PALAZZINA },
  "grandi-imprese": { nome: "La torre, blocco per blocco", pezzi: TORRE },
};
const PREDEFINITO = { nome: "Il cantiere, pezzo per pezzo", pezzi: BETONIERA };

const CSS = `
.mest-layer { transition: transform 1000ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease, filter 300ms ease; }
.mest-stage[data-open] .mest-layer { filter: drop-shadow(5px 9px 7px rgba(15, 23, 42, 0.16)); }
.mest-stage[data-open] .mest-layer:not([data-lit]) { opacity: 0.72; }
.mest-stage[data-open] .mest-layer[data-lit] { opacity: 1; filter: drop-shadow(0 10px 16px rgba(249, 116, 21, 0.45)); }
.mest-chip { opacity: 0; transition: opacity 400ms ease, border-color 250ms ease, box-shadow 250ms ease; pointer-events: none; }
.mest-stage[data-open] .mest-chip { opacity: 1; pointer-events: auto; transition-delay: 350ms; }
.mest-line { opacity: 0; transition: opacity 400ms ease; }
.mest-stage[data-open] .mest-line { opacity: 1; transition-delay: 350ms; }
.mest-hint { transition: opacity 300ms ease; }
.mest-stage[data-open] .mest-hint { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .mest-layer, .mest-chip, .mest-line { transition: none; } }
`;

// dalla tela dell'oggetto (scalata attorno al centro) alla tela 1000×720
const sx = (x: number) => CX + (x - CX) * S;
const sy = (y: number) => CY + (y - CY) * S;

export default function MestiereEsploso({ mestiere, titolo, moduli }: { mestiere: string; titolo: string; moduli: MestiereModulo[] }) {
  const { nome, pezzi } = OGGETTI[mestiere] ?? PREDEFINITO;
  const [autoOpen, setAutoOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const [tour, setTour] = useState(0);
  const toccato = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = hover || autoOpen;

  // All'ingresso nello schermo si apre da solo; poi si richiude e ricomincia,
  // finché chi guarda non ci mette il mouse o il dito.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t: number | undefined;
    let visibile = false;
    const ciclo = (apri: boolean, attesa: number) => {
      t = window.setTimeout(() => {
        if (toccato.current || !visibile) return;
        setAutoOpen(apri);
        ciclo(!apri, apri ? 6500 : 2200);
      }, attesa);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visibile = e.isIntersecting;
        window.clearTimeout(t);
        if (visibile && !toccato.current) ciclo(true, 700);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  // Ad oggetto aperto, senza un pezzo scelto, i pezzi si accendono a turno.
  useEffect(() => {
    if (lit !== null || !open) return;
    const id = window.setInterval(() => setTour((v) => (v + 1) % pezzi.length), 1300);
    return () => window.clearInterval(id);
  }, [lit, open, pezzi.length]);

  const active = lit ?? tour;
  const modOf = (i: number) => moduli[i % Math.max(1, moduli.length)];
  const current = modOf(active);

  // Agganci (a oggetto aperto) e righe delle etichette: per lato, ordinate dall'alto,
  // con una distanza minima così non si sovrappongono.
  const agganci = pezzi.map((p) => [sx(p.a[0] + p.off[0]), sy(p.a[1] + p.off[1])] as [number, number]);
  const righe: number[] = pezzi.map(() => 0);
  (["l", "r"] as const).forEach((lato) => {
    const idx = pezzi.map((p, i) => (p.side === lato ? i : -1)).filter((i) => i >= 0).sort((a, b) => agganci[a][1] - agganci[b][1]);
    let prec = 20;
    idx.forEach((i) => {
      const y = Math.max(agganci[i][1], prec + 96);
      righe[i] = y;
      prec = y;
    });
    const sfora = prec - (H - 70);
    if (sfora > 0) idx.forEach((i) => (righe[i] -= sfora));
  });

  return (
    <div
      ref={rootRef}
      className="mest-stage relative overflow-hidden rounded-[28px] border border-gray-200 bg-white text-left shadow-xl"
      data-open={open ? "" : undefined}
      style={{ containerType: "inline-size" }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        toccato.current = true;
        setHover(true);
      }}
      onPointerLeave={() => {
        setHover(false);
        setAutoOpen(false);
        setLit(null);
      }}
      onClick={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
        toccato.current = true;
        setAutoOpen((v) => !v);
      }}
    >
      <style>{CSS}</style>
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative flex items-center justify-between gap-2 px-4 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-eic-orange-dark sm:text-[10px]">
          {titolo}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700 sm:text-[10px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {nome}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${nome}: ogni pezzo è un modulo di Edilizia in Cloud`}>
          <ellipse cx={CX} cy={sy(590)} rx="230" ry="26" fill="#0f172a" opacity="0.07" />
          {/* fili dalle etichette ai pezzi */}
          {pezzi.map((p, i) => {
            const [ax, ay] = agganci[i];
            const x2 = p.side === "l" ? 235 : 765;
            const on = active === i;
            return (
              <g key={`f${i}`} className="mest-line">
                <path d={`M${ax.toFixed(1)} ${ay.toFixed(1)}L${x2} ${righe[i].toFixed(1)}`} stroke={on ? AR : "#cbd5e1"} strokeWidth={on ? 2.2 : 1.4} strokeDasharray={on ? undefined : "4 5"} fill="none" />
                <circle cx={ax} cy={ay} r={on ? 6 : 4} fill={on ? AR : "#94a3b8"} />
              </g>
            );
          })}
          <g transform={`translate(${CX} ${CY}) scale(${S}) translate(${-CX} ${-CY})`}>
            {pezzi.map((p, i) => (
              <g
                key={i}
                className="mest-layer"
                data-lit={open && active === i ? "" : undefined}
                style={{
                  transform: open ? `translate(${p.off[0]}px, ${p.off[1]}px)` : "translate(0px, 0px)",
                  transitionDelay: `${open ? i * 0.07 : (pezzi.length - i) * 0.04}s`,
                  cursor: "pointer",
                }}
                onPointerEnter={(e) => e.pointerType === "mouse" && setLit(i)}
                onClick={() => setLit(i)}
              >
                {p.el}
              </g>
            ))}
          </g>
        </svg>

        {/* etichette dei moduli, una per pezzo */}
        <div className="absolute inset-0 text-[clamp(9px,1.8cqw,12px)]">
          {pezzi.map((p, i) => {
            const mod = modOf(i);
            if (!mod) return null;
            const Icon = mod.icon;
            const on = active === i;
            return (
              <button
                key={i}
                type="button"
                className="mest-chip absolute flex -translate-y-1/2 items-center gap-[0.45em] rounded-2xl border bg-white/95 py-[0.35em] pl-[0.35em] pr-[0.7em] text-left shadow-sm"
                style={{
                  top: `${(righe[i] / H) * 100}%`,
                  [p.side === "l" ? "left" : "right"]: "1.5%",
                  maxWidth: "23%",
                  borderColor: on ? AR : "#e5e7eb",
                  boxShadow: on ? "0 8px 22px rgba(249,116,21,0.25)" : undefined,
                }}
                onPointerEnter={(e) => e.pointerType === "mouse" && setLit(i)}
                onFocus={() => setLit(i)}
                onClick={(e) => {
                  e.stopPropagation();
                  setLit(i);
                }}
              >
                <span className="flex h-[1.8em] w-[1.8em] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: on ? AR : "#FFF1E6", color: on ? "#fff" : AR }}>
                  <Icon className="h-[1em] w-[1em]" />
                </span>
                <span className="font-black leading-[1.15] text-[#111111]">{mod.name}</span>
              </button>
            );
          })}
        </div>

        <p className="mest-hint pointer-events-none absolute inset-x-0 bottom-[3%] m-0 text-center text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          <span className="[@media(hover:none)]:hidden">Passa sopra: si smonta pezzo per pezzo</span>
          <span className="hidden [@media(hover:none)]:inline">Tocca: si smonta pezzo per pezzo</span>
        </p>
      </div>

      {current && (
        <div className="relative mx-3 mb-3 rounded-2xl border border-gray-200 bg-slate-50 p-3 sm:mx-4 sm:mb-4 sm:p-4">
          <p className="flex items-center gap-2 text-sm font-black text-[#111111]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-eic-orange-dark">
              <current.icon className="h-4 w-4" />
            </span>
            {current.name}
          </p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-gray-600 sm:text-[13px]">{current.desc}</p>
        </div>
      )}
    </div>
  );
}
