import { CarFront } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ViaggioSelect } from "@/components/mezzi/ViaggioSelect";
import { ARRIVO_VUOTO, erroreArrivo, type ArrivoRapportino as DatiArrivo } from "@/lib/campo/arrivoRapportino";

interface MezzoArrivo { id: string; nome: string; targa?: string | null }

export function ArrivoRapportino({ valore, onChange, mezzi, caricamento, errore, riprova }: {
  valore: DatiArrivo;
  onChange: (value: DatiArrivo) => void;
  mezzi: MezzoArrivo[];
  caricamento?: boolean;
  errore?: boolean;
  riprova?: () => void;
}) {
  const selezionato = mezzi.find(m => m.id === valore.mezzoId);
  const opzioni = mezzi.map(m => ({ value: m.id, label: [m.nome, m.targa].filter(Boolean).join(" · ") }));
  if (valore.mezzoId && !selezionato) opzioni.push({ value: valore.mezzoId, label: "Mezzo già dichiarato" });
  const avviso = erroreArrivo(valore);
  return (
    <details open={valore.mezzoId ? true : undefined} className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">
        <CarFront className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />
        Arrivo in cantiere{selezionato ? ` · ${selezionato.nome}` : ""}
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">Il mezzo usato per raggiungere il cantiere compare nei viaggi della commessa all’invio.</p>
        {errore && <p role="alert" className="text-xs text-destructive">Elenco mezzi non disponibile. <button type="button" className="underline" onClick={riprova}>Riprova</button></p>}
        <ViaggioSelect
          label="Mezzo usato per arrivare"
          value={valore.mezzoId}
          disabled={caricamento || errore}
          options={[{ value: "", label: caricamento ? "Carico i mezzi…" : "Scegli il mezzo, se usato" }, ...opzioni]}
          emptyMessage="Nessun mezzo stradale disponibile."
          onValueChange={mezzoId => { if (mezzoId !== valore.mezzoId) onChange({ ...ARRIVO_VUOTO, mezzoId }); }}
        />
        {!caricamento && !errore && !mezzi.length && !valore.mezzoId && <p className="text-xs text-muted-foreground">Qui compaiono i mezzi stradali a tua disposizione.</p>}
        {valore.mezzoId && <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">Da dove sei partito (facoltativo)
              <Input className="h-10" maxLength={150} placeholder="Es. sede, deposito" value={valore.partenza} onChange={e => onChange({ ...valore, partenza: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium">Km percorsi all’andata (facoltativi)
              <Input className="h-10" inputMode="decimal" maxLength={8} placeholder="Es. 18,5" value={valore.km} onChange={e => onChange({ ...valore, km: e.target.value })} />
            </label>
          </div>
          {avviso && <p role="alert" className="text-xs text-destructive">{avviso}</p>}
        </>}
      </div>
    </details>
  );
}
