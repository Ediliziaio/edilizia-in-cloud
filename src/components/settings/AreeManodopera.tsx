import { areePerTariffe, tariffaNellArea, type FiltroAreaTariffe } from "@/lib/tariffe/areeTariffe";

export function AreeManodopera({ tariffe, value, onChange }: {
  tariffe: Array<{ vertical_associato?: string | null }>;
  value: FiltroAreaTariffe;
  onChange: (value: FiltroAreaTariffe) => void;
}) {
  const aree = [
    { filtro: "all" as FiltroAreaTariffe, nome: "Tutte le aree", numero: tariffe.length },
    ...areePerTariffe(tariffe).map(a => ({ filtro: `area:${a.chiave}` as FiltroAreaTariffe, nome: a.nome, numero: tariffe.filter(t => tariffaNellArea(t.vertical_associato, `area:${a.chiave}`)).length })),
    { filtro: "global" as FiltroAreaTariffe, nome: "Comuni / non assegnate", numero: tariffe.filter(t => tariffaNellArea(t.vertical_associato, "global")).length },
  ];
  return <details open className="rounded-xl border bg-card p-3">
    <summary className="cursor-pointer text-sm font-semibold">Aree di lavoro</summary>
    <p className="mb-3 mt-1 text-xs text-muted-foreground">Scegli un'area, poi filtra il gruppo di lavorazioni. I conteggi includono voci attive, archiviate e basi da completare.</p>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" role="group" aria-label="Aree della manodopera">
      {aree.map(a => <button key={a.filtro} type="button" aria-pressed={value === a.filtro} onClick={() => onChange(a.filtro)} className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === a.filtro ? "border-primary bg-primary/5 font-semibold text-primary" : "hover:bg-muted"}`}>
        <span>{a.nome}</span><span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">{a.numero}</span>
      </button>)}
    </div>
  </details>;
}
