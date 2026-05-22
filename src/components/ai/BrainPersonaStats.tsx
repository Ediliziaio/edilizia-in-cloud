/**
 * BrainPersonaStats — mini-statistiche di una persona AI per detail panel.
 *
 * Mostra:
 *   • Donut chart distribuzione tipi memoria (SVG inline, no deps)
 *   • Sparkline cumulativa memorie create ultimi 30 giorni
 *   • Top 3 memorie più richiamate (hits_count desc)
 *
 * Tutto computed runtime dai dati raw (memories filtrate per persona).
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MemoryLite {
  id: string;
  persona_key: string;
  content: string;
  memory_type: string;
  hits_count: number | null;
  enabled: boolean;
  created_at: string;
}

interface Props {
  /** Memorie di QUESTA persona (già filtrate) */
  memories: MemoryLite[];
  typeColors: Record<string, string>;
  typeLabels: Record<string, string>;
}

/**
 * Donut chart SVG inline.
 * Disegna anelli per ogni tipo memoria proporzionali al count.
 */
function DonutChart({
  segments,
  size = 60,
  strokeWidth = 9,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  strokeWidth?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div
        className="rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-[8px] text-slate-300"
        style={{ width: size, height: size }}
      >
        Nessuna
      </div>
    );
  }
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(148, 163, 184, 0.15)"
        strokeWidth={strokeWidth}
      />
      {segments.map((s, i) => {
        if (s.value === 0) return null;
        const dash = (s.value / total) * circumference;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

/**
 * Sparkline area SVG inline.
 * Mostra hits cumulativi nel tempo.
 */
function Sparkline({
  values,
  color = "#fb923c",
  width = 100,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[8px] text-slate-300 border-t border-dashed border-slate-700"
        style={{ width, height }}
      >
        Nessun dato
      </div>
    );
  }
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
    .join(" ");
  // Area fill below the line
  const areaPath = `M0,${height} L${points
    .split(" ")
    .map((p) => p)
    .join(" L")} L${width},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-grad)" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.length > 0 && (
        <circle
          cx={(values.length - 1) * step}
          cy={height - (values[values.length - 1] / max) * (height - 2) - 1}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}

export function BrainPersonaStats({ memories, typeColors, typeLabels }: Props) {
  const stats = useMemo(() => {
    const enabled = memories.filter((m) => m.enabled);

    // Distribuzione per tipo
    const byType: Record<string, number> = {};
    for (const m of enabled) {
      byType[m.memory_type] = (byType[m.memory_type] ?? 0) + 1;
    }
    const segments = Object.entries(byType).map(([type, count]) => ({
      value: count,
      color: typeColors[type] ?? "#94a3b8",
      label: typeLabels[type] ?? type,
    }));

    // Sparkline: memorie create nei 30 giorni (cumulative count)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const buckets = new Array(30).fill(0);
    for (const m of enabled) {
      const age = Math.floor((now - new Date(m.created_at).getTime()) / dayMs);
      if (age >= 0 && age < 30) {
        // Reverse: today is index 29, 30 days ago is index 0
        buckets[29 - age]++;
      }
    }
    // Cumulative
    const cumulative: number[] = [];
    let acc = 0;
    for (const b of buckets) {
      acc += b;
      cumulative.push(acc);
    }

    // Top 3 memorie per hits
    const top = [...enabled]
      .sort((a, b) => (b.hits_count ?? 0) - (a.hits_count ?? 0))
      .slice(0, 3);

    // Confidence average (se exposed)
    // total hits
    const totalHits = enabled.reduce((s, m) => s + (m.hits_count ?? 0), 0);

    return { segments, sparkline: cumulative, top, totalHits, total: enabled.length };
  }, [memories, typeColors, typeLabels]);

  if (stats.total === 0) {
    return <p className="text-[10px] text-slate-300 italic">Nessuna memoria attiva.</p>;
  }

  return (
    <div className="space-y-2.5">
      {/* Donut + breakdown */}
      <div className="flex items-center gap-3">
        <div className="shrink-0 relative">
          <DonutChart segments={stats.segments} size={56} strokeWidth={8} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-white tabular-nums">{stats.total}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          {stats.segments.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-slate-300 truncate">{s.label}</span>
              <span className="text-slate-300 tabular-nums ml-auto">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sparkline trend 30gg */}
      <div className="pt-1.5 border-t border-slate-700">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold">Trend 30gg</span>
          <span className="text-[9px] text-slate-300">{stats.totalHits} richiami</span>
        </div>
        <Sparkline values={stats.sparkline} color="#fb923c" width={228} height={26} />
      </div>

      {/* Top 3 memorie più richiamate */}
      {stats.top.length > 0 && (
        <div className="pt-1.5 border-t border-slate-700">
          <p className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold mb-1">Top richiamate</p>
          <div className="space-y-1">
            {stats.top.map((m) => {
              const color = typeColors[m.memory_type] ?? "#94a3b8";
              return (
                <div key={m.id} className="text-[10px] flex items-start gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-slate-100 leading-tight flex-1 line-clamp-2">
                    {m.content.length > 90 ? m.content.slice(0, 87) + "…" : m.content}
                  </span>
                  <span className={cn(
                    "shrink-0 text-[9px] font-bold tabular-nums px-1 rounded",
                    (m.hits_count ?? 0) >= 10 ? "text-orange-300 bg-orange-500/10" : "text-slate-300",
                  )}>
                    {m.hits_count ?? 0}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
