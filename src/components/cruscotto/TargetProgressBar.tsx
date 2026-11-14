import { memo } from "react";
import { cn } from "@/lib/utils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { safeNumber } from "@/hooks/useCruscottoData";

interface Props {
  current: number;
  target: number;
  label: string;
}

export const TargetProgressBar = memo(function TargetProgressBar({ current, target, label }: Props) {
  const pct = target > 0 ? Math.min(100, (safeNumber(current) / target) * 100) : 0;
  const reached = current >= target;

  // Riquadro scuro dell'obiettivo, come nel Controllo di Gestione: la
  // percentuale grande, la barra che cresce, fatto / obiettivo / manca.
  const manca = Math.max(0, target - safeNumber(current));
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm dark:border-slate-700">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="text-xs text-slate-300">
          {reached ? "Target raggiunto" : `Mancano ${fmtCur(manca)}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{safeNumber(pct).toFixed(0)}%</span>
        <div
          className="h-2.5 min-w-[160px] flex-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={label}
        >
          <div
            className={cn("cg-barra-cresce h-full rounded-full bg-gradient-to-r", reached ? "from-emerald-400 to-teal-300" : "from-sky-400 to-blue-500")}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <dl className="flex gap-5 text-[11px]">
          <div><dt className="text-slate-400">Fatto</dt><dd className="font-semibold tabular-nums">{fmtCur(safeNumber(current))}</dd></div>
          <div><dt className="text-slate-400">Obiettivo</dt><dd className="font-semibold tabular-nums">{fmtCur(target)}</dd></div>
        </dl>
      </div>
    </div>
  );
});
