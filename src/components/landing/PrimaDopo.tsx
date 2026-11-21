/**
 * PrimaDopo — il prima/dopo animato dei confronti.
 *
 * Prima: i pezzi del lavoro (fogli, foglietti, chat, bolle…) sparsi e storti, che
 * tremano. Dopo: si mettono in fila dentro un'unica finestra di Edilizia in Cloud,
 * collegati tra loro, coi dati che scorrono. Il passaggio avviene da solo a ciclo;
 * passando col mouse resta sul «dopo». Fondo bianco. Nessun giudizio sui concorrenti:
 * si confronta il modo di lavorare, non il prodotto altrui.
 */
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type Pezzo = { label: string; icon: LucideIcon };

const W = 1000;
const H = 620;
const TILE_W = 204;
const TILE_H = 96;

// Posizioni "prima": sparse e storte. "Dopo": griglia 3×2 dentro la finestra.
const CAOS = [
  { x: 190, y: 170, r: -14 },
  { x: 470, y: 120, r: 9 },
  { x: 790, y: 190, r: -7 },
  { x: 250, y: 430, r: 11 },
  { x: 560, y: 360, r: -12 },
  { x: 820, y: 460, r: 15 },
];
const ORDINE = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 270 + (i % 3) * 230, y: 270 + Math.floor(i / 3) * 150, r: 0 }));

const CSS = `
.pd-tile { transition: transform 1000ms cubic-bezier(0.65, 0, 0.35, 1); }
.pd-wobble { animation: pd-wobble 1.6s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
@keyframes pd-wobble { from { transform: rotate(-2.5deg) translateY(-3px); } to { transform: rotate(2.5deg) translateY(3px); } }
.pd-fade { transition: opacity 600ms ease; }
@media (prefers-reduced-motion: reduce) { .pd-tile, .pd-fade { transition: none; } .pd-wobble { animation: none; } }
`;

export default function PrimaDopo({ prima, pezzi }: { prima: string; pezzi: Pezzo[] }) {
  const items = pezzi.slice(0, 6);
  const [dopo, setDopo] = useState(false);
  const [hover, setHover] = useState(false);
  const ordered = hover || dopo;

  useEffect(() => {
    if (hover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setDopo((v) => !v), 3400);
    return () => window.clearInterval(id);
  }, [hover]);

  const links: [number, number][] = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]];

  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-gray-200 bg-white text-left shadow-xl"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={() => setDopo((v) => !v)}
    >
      <style>{CSS}</style>
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative flex items-center justify-between gap-2 px-4 pt-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-all sm:text-[10px] ${ordered ? "border-gray-200 bg-white text-gray-400" : "border-red-200 bg-red-50 text-red-600 shadow-sm"}`}
        >
          Prima · {prima}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-all sm:text-[10px] ${ordered ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm" : "border-gray-200 bg-white text-gray-400"}`}
        >
          Dopo · Edilizia in Cloud
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="relative block w-full" role="img" aria-label={`Prima: ${prima}, pezzi sparsi. Dopo: tutto in ordine dentro Edilizia in Cloud.`}>
        {/* la finestra di Edilizia in Cloud */}
        <g className="pd-fade" style={{ opacity: ordered ? 1 : 0 }}>
          <rect x="110" y="150" width="780" height="360" rx="22" fill="#ffffff" stroke="#e5e7eb" strokeWidth="2" />
          <rect x="110" y="150" width="780" height="48" rx="22" fill="#fff7ed" />
          <rect x="110" y="176" width="780" height="22" fill="#fff7ed" />
          {["#f87171", "#fbbf24", "#34d399"].map((c, i) => (
            <circle key={c} cx={140 + i * 22} cy="174" r="6.5" fill={c} />
          ))}
          <text x="500" y="180" textAnchor="middle" fontSize="18" fontWeight="900" fill="#c2410c">
            Edilizia in Cloud · una commessa, tutto collegato
          </text>
          {links.map(([a, b]) => {
            const p = ORDINE[a];
            const q = ORDINE[b];
            const d = `M${p.x} ${p.y}L${q.x} ${q.y}`;
            return (
              <g key={`${a}-${b}`}>
                <path d={d} stroke="#fdba74" strokeWidth="3" strokeDasharray="6 7" />
                <circle r="5" fill="#F97415">
                  <animateMotion dur="2.2s" begin={`${-(a + b) * 0.3}s`} repeatCount="indefinite" path={d} />
                </circle>
              </g>
            );
          })}
        </g>

        {/* i pezzi del lavoro */}
        {items.map((it, i) => {
          const p = ordered ? ORDINE[i] : CAOS[i];
          const Icon = it.icon;
          return (
            <g key={it.label} className="pd-tile" style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`, transitionDelay: `${i * 0.06}s` }}>
              <g className={ordered ? undefined : "pd-wobble"} style={{ animationDelay: `${-i * 0.4}s` }}>
                <rect
                  x={-TILE_W / 2}
                  y={-TILE_H / 2}
                  width={TILE_W}
                  height={TILE_H}
                  rx="16"
                  fill={ordered ? "#ffffff" : "#fefce8"}
                  stroke={ordered ? "#F97415" : "#e5e7eb"}
                  strokeWidth={ordered ? 2.5 : 2}
                  style={{ filter: ordered ? "drop-shadow(0 8px 14px rgba(249,116,21,0.18))" : "drop-shadow(0 8px 12px rgba(15,23,42,0.12))" }}
                />
                <g transform={`translate(${-TILE_W / 2 + 18} -20)`}>
                  <rect width="40" height="40" rx="11" fill={ordered ? "#FFF1E6" : "#f1f5f9"} />
                  <Icon x={8} y={8} width={24} height={24} color={ordered ? "#F97415" : "#64748b"} strokeWidth={2} />
                </g>
                <text x={-TILE_W / 2 + 70} y="6" fontSize="15.5" fontWeight="800" fill="#111111">
                  {it.label}
                </text>
                {/* segni del caos: un punto rosso; in ordine, la spunta */}
                <g className="pd-fade" style={{ opacity: ordered ? 0 : 1 }}>
                  <circle cx={TILE_W / 2 - 8} cy={-TILE_H / 2 + 8} r="11" fill="#ef4444" />
                  <text x={TILE_W / 2 - 8} y={-TILE_H / 2 + 13} textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">
                    !
                  </text>
                </g>
                <g className="pd-fade" style={{ opacity: ordered ? 1 : 0 }}>
                  <circle cx={TILE_W / 2 - 8} cy={-TILE_H / 2 + 8} r="11" fill="#10b981" />
                  <path d={`M${TILE_W / 2 - 13} ${-TILE_H / 2 + 8}l4 4l6 -7`} stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      <p className="relative mx-4 mb-4 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-gray-600 sm:text-[13px]">
        {ordered
          ? "Dopo: gli stessi pezzi stanno nella stessa commessa e si parlano tra loro. Niente da ricopiare."
          : `Prima: il lavoro vive in posti diversi e qualcuno deve rimetterlo insieme a mano.`}
      </p>
    </div>
  );
}
