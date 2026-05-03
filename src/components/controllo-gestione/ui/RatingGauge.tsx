import { cn } from "@/lib/utils";
import type { RatingClasse } from "@/hooks/controlloGestione/useStatoPatrimoniale";

interface RatingGaugeProps {
  score: number;
  classe: RatingClasse;
}

const CLASSI: { code: RatingClasse; color: string; label: string }[] = [
  { code: "AAA", color: "#15803d", label: "Eccellente" },
  { code: "AA",  color: "#22c55e", label: "Molto buono" },
  { code: "A",   color: "#84cc16", label: "Buono" },
  { code: "BBB", color: "#eab308", label: "Adeguato" },
  { code: "BB",  color: "#f97316", label: "Sotto media" },
  { code: "B",   color: "#ef4444", label: "Critico" },
  { code: "CCC", color: "#991b1b", label: "Default" },
];

const CX = 150;
const CY = 150;
const R = 120;
const STROKE = 28;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(start: number, end: number) {
  const s = polar(CX, CY, R, start);
  const e = polar(CX, CY, R, end);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function RatingGauge({ score, classe }: RatingGaugeProps) {
  const segCount = CLASSI.length;
  const segSize = 180 / segCount;
  const clamped = Math.max(0, Math.min(100, score));
  const needleAngle = 180 + (clamped / 100) * 180; // 180° = sinistra, 360° = destra
  const needle = polar(CX, CY, R - STROKE / 2 - 6, needleAngle);

  const meta = CLASSI.find((c) => c.code === classe);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 300 180" className="w-full max-w-[300px]">
        {CLASSI.map((c, i) => {
          const start = 180 + i * segSize;
          const end = 180 + (i + 1) * segSize;
          return (
            <path
              key={c.code}
              d={arcPath(start, end)}
              stroke={c.color}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="butt"
            />
          );
        })}
        {/* Lancetta */}
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          stroke="hsl(var(--foreground))"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={6} fill="hsl(var(--foreground))" />
        {/* Etichette classi */}
        {CLASSI.map((c, i) => {
          const mid = 180 + i * segSize + segSize / 2;
          const p = polar(CX, CY, R + 14, mid);
          return (
            <text
              key={c.code}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight={c.code === classe ? 700 : 500}
              fill={c.code === classe ? c.color : "hsl(var(--muted-foreground))"}
            >
              {c.code}
            </text>
          );
        })}
      </svg>
      <div className="text-center">
        <p
          className={cn("text-3xl font-bold tabular-nums")}
          style={{ color: meta?.color }}
        >
          {classe}
        </p>
        <p className="text-sm text-muted-foreground">
          Punteggio <span className="font-semibold tabular-nums">{Math.round(clamped)}</span> / 100
        </p>
        {meta && <p className="text-xs text-muted-foreground">{meta.label}</p>}
      </div>
    </div>
  );
}
