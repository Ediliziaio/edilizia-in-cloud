import type { FaseModello } from "@/lib/orders/modelliFasi";

/** La stessa sequenza in elenco e nell'editor, senza scritture o calcoli sulle commesse. */
export function AnteprimaModelloFasi({ fasi }: { fasi: FaseModello[] }) {
  return <ol aria-label="Sequenza delle fasi" className="space-y-0">
    {fasi.map((fase, i) => <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex w-7 shrink-0 flex-col items-center" aria-hidden="true">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
        {i < fasi.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="break-words text-sm font-medium">{fase.nome.trim() || "Fase senza nome"}</p>
        {fase.giorni != null && <p className="text-xs text-muted-foreground">{fase.giorni} giorni di lavoro</p>}
        {fase.sottofasi.length > 0 && <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          {fase.sottofasi.map((s, j) => <li key={j} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 break-words">{s.nome.trim() || "Sottofase senza nome"}</span>
            <span>Peso {s.peso}{s.giorni != null ? ` · ${s.giorni} gg` : ""}{s.in_parallelo ? " · In parallelo" : ""}</span>
          </li>)}
        </ul>}
      </div>
    </li>)}
  </ol>;
}
