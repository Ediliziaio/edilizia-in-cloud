import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { htmlPerEditorContratto } from '@/lib/preventivi/contrattoEditor';
import { fontiCondizioni, type FonteCondizioni } from '@/lib/preventivi/fontiCondizioni';

/** Read-only sources. Copying changes only the caller's draft, never the source. */
export function CopiaCondizioni({ companyId, value, onChange, disabled = false }: {
  companyId?: string | null; value: string; onChange: (html: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [copied, setCopied] = useState(false);
  const { data = [], isPending, isError, refetch } = useQuery<FonteCondizioni[]>({
    queryKey: ['fonti-condizioni', companyId], enabled: open && !!companyId && !disabled,
    staleTime: 0,
    queryFn: async () => {
      const [classic, modules] = await Promise.all([
        supabase.from('quote_templates').select('*').eq('company_id', companyId!).eq('is_active', true),
        // Same table and tenant filter used by archivioModelli; generated types lag behind it.
        supabase.from('modelli_libreria_azienda' as never).select('company_id,chiave,contenuto').eq('company_id', companyId!),
      ]);
      if (classic.error || modules.error) throw classic.error ?? modules.error;
      return fontiCondizioni(companyId!, classic.data ?? [], modules.data ?? []);
    },
  });
  const source = data.find(item => item.id === selected && item.companyId === companyId);
  const copy = () => {
    if (!source || disabled) return;
    if (value.trim() && !window.confirm('Sostituire le condizioni attuali con una copia? Le modifiche non salvate a questo testo andranno perse. Il modello di origine non cambia.')) return;
    onChange(htmlPerEditorContratto(source.testo));
    setCopied(true);
    setOpen(false);
    setSelected('');
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Modifica il testo qui, oppure parti da una copia.</p>
      <Button type="button" variant="outline" size="sm" disabled={disabled || !companyId} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setCopied(false); }}>Copia da…</Button>
    </div>
    {copied && <p role="status" className="text-xs text-emerald-700">Testo copiato. Puoi adattarlo: l’originale non cambia. Salva il modello per confermare.</p>}
    {open && <div id={id} className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <p className="text-xs text-muted-foreground">Scegli condizioni generali o un modello salvato della tua azienda. Copiamo solo le clausole, non prezzi, immagini o altre impostazioni. Le copie restano indipendenti.</p>
      {isPending ? <p role="status" className="text-xs">Caricamento delle condizioni…</p> : isError ? <div role="alert" className="text-xs">Non riesco a leggere i modelli. Il tuo testo non cambia. <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button></div> : <>
        <select aria-label="Copia condizioni da" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={source ? selected : ''} onChange={e => setSelected(e.target.value)}>
          <option value="">Scegli da dove copiare…</option>
          {data.filter(item => item.companyId === companyId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
        {!data.length && <p className="text-xs">Non ci sono ancora condizioni salvate da copiare. Puoi scriverle direttamente qui.</p>}
        {source && <div className="max-h-36 overflow-auto whitespace-pre-wrap rounded border bg-background p-3 text-xs" aria-label="Anteprima del testo da copiare">{source.testo.replace(/<[^>]*>/g, ' ').slice(0, 1800)}</div>}
        <Button type="button" size="sm" disabled={!source || disabled} onClick={copy}>Copia e modifica qui</Button>
      </>}
    </div>}
  </div>;
}
