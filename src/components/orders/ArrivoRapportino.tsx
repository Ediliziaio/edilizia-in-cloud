import { useState } from "react";
import { CarFront, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViaggioSelect } from "@/components/mezzi/ViaggioSelect";
import { erroreArrivi, MAX_MEZZI_TRASPORTO, type ArrivoRapportino as DatiArrivo } from "@/lib/campo/arrivoRapportino";

interface MezzoArrivo { id: string; nome: string; targa?: string | null }

export function ArrivoRapportino({ valore, onChange, mezzi, suggeriti = [], caricamento, errore, riprova }: {
  valore: DatiArrivo[];
  onChange: (value: DatiArrivo[]) => void;
  mezzi: MezzoArrivo[];
  suggeriti?: string[];
  caricamento?: boolean;
  errore?: boolean;
  riprova?: () => void;
}) {
  const [scegli, setScegli] = useState(false);
  const perId = new Map(mezzi.map(m => [m.id, m]));
  const disponibili = mezzi.filter(m => !valore.some(a => a.mezzoId === m.id));
  const proposte = disponibili.filter(m => suggeriti.includes(m.id)).slice(0, 3);
  const aggiungibile = valore.length < MAX_MEZZI_TRASPORTO;
  const avviso = erroreArrivi(valore);
  const conferma = (mezzoId: string) => {
    if (!aggiungibile || !disponibili.some(m => m.id === mezzoId)) return;
    onChange([...valore, { mezzoId, partenza: "", km: "" }]);
    setScegli(false);
  };
  const aggiorna = (mezzoId: string, modifica: Partial<DatiArrivo>) =>
    onChange(valore.map(a => a.mezzoId === mezzoId ? { ...a, ...modifica } : a));

  return <section aria-label="Trasporto al cantiere" className="space-y-2 rounded-xl border bg-card px-3 py-2.5">
    <header className="flex flex-wrap items-center justify-between gap-1.5">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <CarFront className="size-4 text-primary" aria-hidden /> Trasporto al cantiere
        {valore.length > 0 && <span className="text-xs font-normal tabular-nums text-muted-foreground">{valore.length}</span>}
      </h4>
      {aggiungibile && <Button type="button" size="sm" variant="ghost" aria-expanded={scegli}
        onClick={() => setScegli(v => !v)} className="h-8 gap-1 px-2">
        {scegli ? "Chiudi scelta" : <><Plus className="size-4" aria-hidden /> Aggiungi mezzo</>}
      </Button>}
    </header>
    {errore && <p role="alert" className="text-xs text-destructive">Elenco mezzi non disponibile. <button type="button" className="underline" onClick={riprova}>Riprova</button></p>}
    {aggiungibile && proposte.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">Quali mezzi hai usato?</span>
      {proposte.map(m => <Button key={m.id} type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => conferma(m.id)}>
        <Plus className="size-3.5 text-primary" aria-hidden />{m.nome}{m.targa ? ` · ${m.targa}` : ""}
      </Button>)}
    </div>}
    {scegli && aggiungibile && <ViaggioSelect
      label="Mezzo di trasporto" value="" disabled={caricamento || errore}
      options={[{ value: "", label: caricamento ? "Carico i mezzi…" : "Scegli il mezzo" },
        ...disponibili.map(m => ({ value: m.id, label: [m.nome, m.targa].filter(Boolean).join(" · ") }))]}
      emptyMessage="Nessun altro mezzo stradale disponibile."
      onValueChange={conferma}
    />}
    {valore.length > 0 && <ul className="divide-y rounded-md border">
      {valore.map(a => {
        const m = perId.get(a.mezzoId);
        const nome = m?.nome ?? "Mezzo già dichiarato";
        return <li key={a.mezzoId} className="flex min-w-0 items-start gap-1.5 px-2.5 py-1.5">
          <details className="min-w-0 flex-1">
            <summary className="min-h-8 cursor-pointer break-words py-1 text-sm font-medium">
              {nome}{m?.targa ? ` · ${m.targa}` : ""}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{a.km.trim() ? `${a.km} km all’andata` : "Partenza e km facoltativi"}</span>
            </summary>
            <div className="mb-1 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">Partenza
                <Input className="h-8" maxLength={150} placeholder="Es. sede o deposito" value={a.partenza}
                  onChange={e => aggiorna(a.mezzoId, { partenza: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-medium">Km percorsi all’andata
                <Input className="h-8" inputMode="decimal" maxLength={8} placeholder="Es. 18,5" value={a.km}
                  onChange={e => aggiorna(a.mezzoId, { km: e.target.value })} />
              </label>
            </div>
          </details>
          <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Rimuovi ${nome}`}
            onClick={() => onChange(valore.filter(x => x.mezzoId !== a.mezzoId))}><X className="size-4" /></Button>
        </li>;
      })}
    </ul>}
    {valore.length > 0 && <p className="text-xs text-muted-foreground">All’invio, i mezzi compaiono nel registro viaggi della commessa.</p>}
    {avviso && <p role="alert" className="text-xs text-destructive">{avviso}</p>}
  </section>;
}
