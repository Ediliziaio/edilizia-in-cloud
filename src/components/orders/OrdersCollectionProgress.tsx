interface Props {
  collected: number;
  pending: number;
  period: string;
  loading?: boolean;
}

const percentage = (value: number) => value.toLocaleString("it-IT", { maximumFractionDigits: 1 });

/** Quote sul totale riscosso e ancora da riscuotere, nello stesso perimetro e con IVA. */
export function OrdersCollectionProgress({ collected, pending, period, loading }: Props) {
  const received = Number.isFinite(collected) ? Math.max(0, collected) : 0;
  const remaining = Number.isFinite(pending) ? Math.max(0, pending) : 0;
  const total = received + remaining;
  const share = total > 0 ? (received / total) * 100 : 0;
  return (
    <section aria-label="Situazione incassi" aria-busy={loading || undefined} className="mt-3 border-t border-white/15 pt-2.5">
      {loading ? <p className="text-xs text-blue-100">Caricamento situazione incassi…</p> : total > 0 ? <>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 text-blue-50"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />Incassato <strong className="tabular-nums text-white">{percentage(share)}%</strong></span>
          <span className="inline-flex items-center gap-1.5 text-blue-50"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-300" />Da incassare <strong className="tabular-nums text-white">{percentage(100 - share)}%</strong></span>
        </div>
        <div role="progressbar" aria-label="Quota incassata" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(share.toFixed(1))} aria-valuetext={`${percentage(share)}% incassato, ${percentage(100 - share)}% da incassare`} className="h-2 overflow-hidden rounded-full bg-amber-300">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-1 text-[10px] leading-4 text-blue-100/75">Incassato e residuo delle commesse {period} · IVA inclusa</p>
      </> : <p className="text-xs text-blue-100">Nessun importo incassato o da incassare nel periodo.</p>}
    </section>
  );
}
