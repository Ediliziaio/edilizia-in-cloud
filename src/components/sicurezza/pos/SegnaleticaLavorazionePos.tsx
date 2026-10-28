import {
  SEGNALI_POS, segnalePosSvg, type SceltaSegnalePos,
} from '../../../../supabase/functions/_shared/posSegnaletica';
import type { Lavorazione } from '../../../../supabase/functions/_shared/posModello';
import { Input } from '@/components/ui/input';

export function SegnaleticaLavorazionePos({ l, ro, onChange }: {
  l: Lavorazione; ro: boolean; onChange: (v: SceltaSegnalePos[]) => void;
}) {
  const scelte = l.segnaletica ?? [];
  const modifica = (id: string, campi: Partial<SceltaSegnalePos>) =>
    onChange(scelte.map(v => v.id === id ? { ...v, ...campi } : v));
  return (
    <details className="rounded-lg border p-3 sm:col-span-2">
      <summary className="cursor-pointer text-sm font-medium">
        Segnaletica della lavorazione <span className="text-muted-foreground">({scelte.length} selezionati)</span>
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Seleziona i segnali pertinenti e indica dove prevedi di collocarli. I disegni sono schematici per il POS: la selezione non registra l’installazione sul cantiere.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SEGNALI_POS.filter(s => !ro || scelte.some(v => v.id === s.id)).map(s => {
          const selezionato = scelte.some(v => v.id === s.id);
          return <label key={s.id} className={`flex items-center gap-2 rounded-md border p-2 text-xs ${selezionato ? 'border-blue-300 bg-blue-50/50' : ''}`}>
            <input type="checkbox" disabled={ro} checked={selezionato} onChange={e => onChange(e.target.checked
              ? [...scelte, { id: s.id, ubicazione: '', note: '' }]
              : scelte.filter(v => v.id !== s.id))} />
            <img className="h-9 w-9 shrink-0" alt="" src={`data:image/svg+xml,${encodeURIComponent(segnalePosSvg(s.id))}`} />
            <span>{s.nome}<small className="block text-muted-foreground">{s.famiglia}</small></span>
          </label>;
        })}
      </div>
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        {scelte.map(v => <div key={v.id} className="space-y-2 rounded-md border bg-slate-50/50 p-3">
          <p className="text-sm font-medium">{SEGNALI_POS.find(s => s.id === v.id)?.nome}</p>
          <label className="block text-xs">Ubicazione prevista
            <Input aria-label={`Ubicazione: ${SEGNALI_POS.find(s => s.id === v.id)?.nome}`} disabled={ro} value={v.ubicazione}
              placeholder="Es. accesso all’area di posa" maxLength={1000} onChange={e => modifica(v.id, { ubicazione: e.target.value })} />
          </label>
          <label className="block text-xs">Indicazioni
            <Input aria-label={`Indicazioni: ${SEGNALI_POS.find(s => s.id === v.id)?.nome}`} disabled={ro} value={v.note}
              maxLength={2000} placeholder="Condizioni, periodo o riferimento alla planimetria" onChange={e => modifica(v.id, { note: e.target.value })} />
          </label>
        </div>)}
      </div>
      {ro && !scelte.length && <p className="text-sm text-muted-foreground">Nessuna segnaletica selezionata.</p>}
    </details>
  );
}
