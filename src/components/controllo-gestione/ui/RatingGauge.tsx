import { angoloLancetta, FASCE_RATING, type ClasseRating } from "@/lib/controlloGestione/indiciBanca";

interface RatingGaugeProps {
  score: number;
  classe: ClasseRating;
  /** Valutazione non validata: colori spenti e scritta «provvisorio». */
  provvisorio?: boolean;
}

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

/**
 * Semicerchio da CCC (sinistra, punteggio 0) ad AAA (destra, 100), con ogni
 * fascia larga quanto il suo intervallo di punteggio. Prima le fasce erano
 * uguali e in ordine inverso (AAA a sinistra) mentre la lancetta andava verso
 * destra col punteggio: con 95/100 indicava la zona CCC.
 */
export function RatingGauge({ score, classe, provvisorio = false }: RatingGaugeProps) {
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const needle = polar(CX, CY, R - STROKE / 2 - 6, angoloLancetta(clamped));
  const meta = FASCE_RATING.find((c) => c.classe === classe);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 300 180"
        className={provvisorio ? "w-full max-w-[300px] opacity-60 grayscale" : "w-full max-w-[300px]"}
        role="img"
        aria-label={`Classe ${classe}, punteggio ${Math.round(clamped)} su 100`}
      >
        {FASCE_RATING.map((f) => (
          <path
            key={f.classe}
            d={arcPath(angoloLancetta(f.da), angoloLancetta(f.a))}
            stroke={f.colore}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="butt"
          />
        ))}
        <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="hsl(var(--foreground))" strokeWidth={3} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={6} fill="hsl(var(--foreground))" />
        {FASCE_RATING.map((f) => {
          const p = polar(CX, CY, R + 16, angoloLancetta((f.da + f.a) / 2));
          return (
            <text
              key={f.classe}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight={f.classe === classe ? 700 : 500}
              fill={f.classe === classe ? f.colore : "hsl(var(--muted-foreground))"}
            >
              {f.classe}
            </text>
          );
        })}
      </svg>
      <div className="text-center">
        <p className="text-3xl font-bold tabular-nums" style={{ color: provvisorio ? undefined : meta?.colore }}>
          {classe}
        </p>
        <p className="text-sm text-muted-foreground">
          Punteggio <span className="font-semibold tabular-nums">{Math.round(clamped)}</span> su 100
        </p>
        {meta && <p className="text-xs text-muted-foreground">{provvisorio ? "Stima provvisoria" : meta.giudizio}</p>}
      </div>
    </div>
  );
}
