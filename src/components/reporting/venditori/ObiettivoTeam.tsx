/**
 * Riquadro scuro «Obiettivo del team» (14/11/2026): il fatturato del periodo
 * contro la somma degli obiettivi mensili (sales_targets), con la barra che
 * cresce e, accanto, gli agenti con un obiettivo dal più avanti al più indietro.
 */
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { VendorKPI } from "@/hooks/useVendorReport";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ObiettivoTeam({
  kpiList,
  obiettivi,
  agentId,
}: {
  kpiList: VendorKPI[];
  obiettivi: Map<string, { fatturato: number; contratti: number }> | undefined;
  /** «tutti» o l'agente scelto nel filtro. */
  agentId: string;
}) {
  const t = useT();
  if (!obiettivi || obiettivi.size === 0) return null;
  const righe = kpiList
    .map((k) => ({ k, obiettivo: obiettivi.get(k.agent_id)?.fatturato ?? 0 }))
    .filter((r) => r.obiettivo > 0 && (agentId === "tutti" || r.k.agent_id === agentId))
    .map((r) => ({ nome: r.k.nome_agente, fatto: Number(r.k.fatturato_generato) || 0, obiettivo: r.obiettivo }))
    .map((r) => ({ ...r, pct: (r.fatto / r.obiettivo) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  if (righe.length === 0) return null;
  const fatto = righe.reduce((s, r) => s + r.fatto, 0);
  const obiettivo = righe.reduce((s, r) => s + r.obiettivo, 0);
  const pct = obiettivo > 0 ? (fatto / obiettivo) * 100 : 0;
  const raggiunto = pct >= 100;
  const manca = Math.max(0, obiettivo - fatto);
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 dark:border-slate-700 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {agentId === "tutti" ? t("Obiettivo del team") : t("Obiettivo dell'agente")}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums tracking-tight">{Math.round(pct)}%</span>
          <span className="text-xs text-slate-400">{raggiunto ? t("raggiunto") : t("del fatturato previsto")}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(pct, 100))} aria-label={t("Obiettivo del team")}>
          <div className={cn("cg-barra-cresce h-full rounded-full bg-gradient-to-r", raggiunto ? "from-emerald-400 to-teal-300" : "from-orange-400 to-amber-300")} style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div><dt className="text-slate-400">{t("Fatturato")}</dt><dd className="font-semibold tabular-nums" title={formatCurrency(fatto)}>{formatCurrencyCompact(fatto)}</dd></div>
          <div><dt className="text-slate-400">{t("Obiettivo")}</dt><dd className="font-semibold tabular-nums" title={formatCurrency(obiettivo)}>{formatCurrencyCompact(obiettivo)}</dd></div>
          <div><dt className="text-slate-400">{t("Manca")}</dt><dd className={cn("font-semibold tabular-nums", manca === 0 && "text-emerald-300")}>{manca === 0 ? t("niente") : formatCurrencyCompact(manca)}</dd></div>
        </dl>
      </div>
      {righe.length > 1 && (
        <ol className="grid content-start gap-x-6 gap-y-2 sm:grid-cols-2">
          {righe.slice(0, 8).map((r, i) => (
            <li key={r.nome + i} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-slate-200">{r.nome}</span>
                <span className="shrink-0 tabular-nums">
                  <strong className={r.pct >= 100 ? "text-emerald-300" : r.pct < 50 ? "text-rose-300" : "text-white"}>{Math.round(r.pct)}%</strong>
                  <span className="ml-1.5 text-slate-400">{formatCurrencyCompact(r.fatto)} / {formatCurrencyCompact(r.obiettivo)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn("cg-barra-cresce h-full rounded-full bg-gradient-to-r", r.pct >= 100 ? "from-emerald-400 to-teal-300" : r.pct < 50 ? "from-rose-400 to-orange-400" : "from-sky-400 to-blue-500")}
                  style={{ width: `${Math.max(2, Math.min(r.pct, 100))}%`, animationDelay: `${300 + i * 70}ms` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
