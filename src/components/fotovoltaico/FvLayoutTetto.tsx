/**
 * FvLayoutTetto — disegna la disposizione REALE dei pannelli sul tetto usando
 * le coordinate di Google Solar API (gap vs Reonic/Autarc: oggi mostravamo solo
 * un mock generico). Render via React <rect> dalla proiezione pura
 * `proiettaLayout` (niente dangerouslySetInnerHTML).
 */
import { proiettaLayout, type PannelloGeo } from "@/lib/fotovoltaico/layout";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PALETTE = ["#1e3a5f", "#2c5184", "#3b6ba5", "#f59e0b", "#10b981", "#8b5cf6"];

export function FvLayoutTetto({
  panels,
  className,
}: {
  panels?: PannelloGeo[] | null;
  className?: string;
}) {
  const t = useT();
  if (!panels || panels.length === 0) return null;
  const proj = proiettaLayout(panels, { targetWidth: 600, margin: 12 });
  if (proj.count === 0) return null;

  const segments = Array.from(new Set(proj.rects.map((r) => r.segment))).sort((a, b) => a - b);

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4", className)}>
      <h4 className="text-sm font-bold text-slate-900">{t("Disposizione reale dei pannelli")}</h4>
      <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
        {segments.length > 1
          ? t("Layout estratto da Google Solar API · {count} pannelli su {n} falde.", { count: proj.count, n: segments.length })
          : t("Layout estratto da Google Solar API · {count} pannelli.", { count: proj.count })}
      </p>
      <div className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
        <svg
          viewBox={`0 0 ${proj.width} ${proj.height}`}
          className="w-full h-auto"
          role="img"
          aria-label={t("Disposizione di {count} pannelli sul tetto", { count: String(proj.count ?? "") })}
        >
          <rect x={0} y={0} width={proj.width} height={proj.height} fill="#e2e8f0" />
          {proj.rects.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={1.5}
              fill={PALETTE[r.segment % PALETTE.length]}
              stroke="#0f172a"
              strokeWidth={0.6}
              opacity={0.92}
            />
          ))}
        </svg>
      </div>
      {segments.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2">
          {segments.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: PALETTE[s % PALETTE.length] }}
              />
              {t("Falda {n}", { n: s + 1 })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
