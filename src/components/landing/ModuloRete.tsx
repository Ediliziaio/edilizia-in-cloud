/**
 * ModuloRete — la rete viva di un modulo, per l'hero delle pagine funzionalità.
 *
 * Il modulo della pagina sta al centro; intorno i moduli che lo alimentano (presi
 * dalla config della pagina, `familyItems`): ognuno è una pallina che ondeggia, e
 * lungo i collegamenti i dati scorrono verso il centro. Passando su un modulo si
 * accende il suo collegamento e sotto compare cosa porta; cliccandolo si apre la
 * sua pagina. Fondo bianco, come il cervello di Silvio in home.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";

export type ReteItem = { title: string; text: string; icon: LucideIcon; to?: string };

const W = 1000;
const H = 700;
const C: [number, number] = [500, 330];
const ORANGE = "#F97415";
const PALETTE = ["#F97415", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899"];

// Puntini di fondo, sparsi con un seme fisso (uguali nel prerender e nel browser).
const DUST = Array.from({ length: 46 }, (_, i) => {
  const a = i * 2.399963;
  const r = 90 + ((i * 97) % 330);
  return { x: C[0] + Math.cos(a) * r * 1.25, y: C[1] + Math.sin(a) * r * 0.72, r: 1.6 + (i % 3) * 0.9, d: 5 + (i % 5) };
});

// Nome su una o due righe, senza tagliarlo.
const Etichetta = ({ text, y, size, weight, color }: { text: string; y: number; size: number; weight: number; color: string }) => {
  const words = text.split(" ");
  let lines = [text];
  if (text.length > 15 && words.length > 1) {
    let best = 1;
    let bestDiff = Infinity;
    for (let k = 1; k < words.length; k++) {
      const diff = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length);
      if (diff < bestDiff) {
        best = k;
        bestDiff = diff;
      }
    }
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  return (
    <text y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fill={color}>
      {lines.map((l, i) => (
        <tspan key={i} x="0" dy={i === 0 ? 0 : size * 1.15}>
          {l}
        </tspan>
      ))}
    </text>
  );
};

export default function ModuloRete({
  center,
  items,
  badgeLeft = "Collegato a tutto il resto",
  badgeRight = "Dati in tempo reale",
}: {
  center: { title: string; icon?: LucideIcon };
  items: ReteItem[];
  badgeLeft?: string;
  badgeRight?: string;
}) {
  const nodes = items.slice(0, 6);
  const [active, setActive] = useState<number | null>(null);
  const [tour, setTour] = useState(0);
  const CenterIcon = center.icon ?? Sparkles;

  // Senza interazione, i moduli si accendono uno alla volta.
  useEffect(() => {
    if (active !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTour((v) => (v + 1) % Math.max(1, nodes.length)), 3200);
    return () => window.clearInterval(id);
  }, [active, nodes.length]);

  const lit = active ?? tour;
  const pos = nodes.map((_, i) => {
    const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
    return [C[0] + Math.cos(a) * 345, C[1] + Math.sin(a) * 225] as [number, number];
  });
  const pathTo = ([x, y]: [number, number]) => {
    const mx = (x + C[0]) / 2 + (y - C[1]) * 0.18;
    const my = (y + C[1]) / 2 - (x - C[0]) * 0.18;
    return `M${x.toFixed(1)} ${y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${C[0]} ${C[1]}`;
  };
  const current = nodes[lit];

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-gray-200 bg-white text-left shadow-xl" style={{ containerType: "inline-size" }}>
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative flex items-center justify-between px-4 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-eic-orange-dark sm:text-[10px]">
          {badgeLeft}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700 sm:text-[10px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {badgeRight}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="relative block w-full" role="img" aria-label={`${center.title}: i moduli collegati che lo alimentano`}>
        <defs>
          <radialGradient id="rete-glow">
            <stop offset="0" stopColor={ORANGE} stopOpacity="0.35" />
            <stop offset="1" stopColor={ORANGE} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* polvere di dati che ondeggia */}
        {DUST.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={PALETTE[i % PALETTE.length]} opacity="0.35">
            <animate attributeName="cy" values={`${p.y};${p.y - 10};${p.y}`} dur={`${p.d}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* collegamenti e dati che scorrono verso il centro */}
        {pos.map((p, i) => {
          const d = pathTo(p);
          const on = i === lit;
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={on ? color : "#cbd5e1"} strokeWidth={on ? 4 : 2.2} strokeDasharray={on ? undefined : "6 8"} style={{ transition: "stroke 300ms ease" }} />
              {[0, 1, 2].map((k) => (
                <circle key={k} r={on ? 7 : 5} fill={color} opacity={on ? 1 : 0.6}>
                  <animateMotion dur={on ? "1.6s" : "3.2s"} begin={`${-k * (on ? 0.53 : 1.07)}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
            </g>
          );
        })}

        {/* centro: il modulo della pagina */}
        <g transform={`translate(${C[0]} ${C[1]})`}>
          <circle r="150" fill="url(#rete-glow)">
            <animate attributeName="r" values="130;165;130" dur="3.4s" repeatCount="indefinite" />
          </circle>
          <g>
            <circle r="106" fill="none" stroke={ORANGE} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="10 9" />
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="24s" repeatCount="indefinite" />
          </g>
          <circle r="86" fill="#ffffff" stroke={ORANGE} strokeWidth="5" />
          <CenterIcon x={-30} y={-52} width={60} height={60} color={ORANGE} strokeWidth={1.8} />
          <Etichetta text={center.title} y={30} size={22} weight={900} color="#111111" />
        </g>

        {/* moduli collegati */}
        {pos.map(([x, y], i) => {
          const it = nodes[i];
          const Icon = it.icon;
          const on = i === lit;
          const color = PALETTE[i % PALETTE.length];
          return (
            <g
              key={it.title}
              style={{ cursor: it.to ? "pointer" : "default" }}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive(i)}
            >
              <g>
                <animateTransform attributeName="transform" type="translate" values={`0 0;0 ${i % 2 ? -8 : 8};0 0`} dur={`${4 + (i % 3)}s`} repeatCount="indefinite" />
                <g transform={`translate(${x} ${y})`}>
                  {on && (
                    <circle r="62" fill="none" stroke={color} strokeWidth="2.5">
                      <animate attributeName="r" values="60;82" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={on ? 60 : 52} fill="#ffffff" stroke={color} strokeWidth={on ? 4 : 2.5} />
                  <circle r={on ? 60 : 52} fill={color} opacity={on ? 0.16 : 0.07} />
                  <Icon x={-24} y={-24} width={48} height={48} color={color} strokeWidth={1.9} />
                  <Etichetta text={it.title} y={on ? 92 : 84} size={25} weight={on ? 900 : 700} color={on ? "#111111" : "#475569"} />
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      {/* cosa porta il modulo acceso */}
      {current && (
        <div className="relative mx-3 mb-3 rounded-2xl border border-gray-200 bg-slate-50 p-3 sm:mx-4 sm:mb-4 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-black text-[#111111]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${PALETTE[lit % PALETTE.length]}1f`, color: PALETTE[lit % PALETTE.length] }}>
                <current.icon className="h-4 w-4" />
              </span>
              {current.title}
            </p>
            {current.to && (
              <Link to={current.to} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-eic-orange-dark hover:text-eic-orange">
                Apri <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-gray-600 sm:text-[13px]">{current.text}</p>
        </div>
      )}
    </div>
  );
}
