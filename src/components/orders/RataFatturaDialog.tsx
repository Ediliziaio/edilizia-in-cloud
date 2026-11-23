import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useFattureByOrdine } from '@/hooks/billing/useFatturaOrdineLink';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { impedimentoFatturaRata } from '@/lib/orders/rataFattura';
import type { Installment } from '@/lib/orderUtils';
import { useT } from '@/lib/campo/lingua/LinguaCampo';

export default function RataFatturaDialog({ orderId, installment, amount, onClose, onManageAllocations }: {
  orderId: string; installment: Installment; amount: number; onClose: () => void; onManageAllocations?: (id?:string)=>void;
}) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const invoices = useFattureByOrdine(orderId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const canWrite = permissions.canViewBilling && !permissions.solaLettura && !!companyId && !!installment.id;
  const documentIds = (invoices.data ?? []).filter(f => f.origine !== 'importata').map(f => f.id).sort();
  const links = useQuery({
    queryKey: ['rate-fatture-disponibili', companyId, orderId, documentIds],
    enabled: !!companyId && invoices.isSuccess,
    queryFn: async () => {
      if (!documentIds.length) return [];
      const { data, error } = await supabase.from('order_installments')
        .select('id, documento_fiscale_id, order:orders!inner(company_id)')
        .eq('order.company_id', companyId!).in('documento_fiscale_id', documentIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const blocked = invoices.isPending || invoices.isFetching || invoices.isError || links.isPending || links.isFetching || links.isError;
  const reason = (f: NonNullable<typeof invoices.data>[number], rows = links.data ?? []) =>
    impedimentoFatturaRata(f, amount, rows.some(r => r.documento_fiscale_id === f.id && r.id !== installment.id));
  const chosen = invoices.data?.find(f => f.id === selected);
  const linkedId = installment.documento_fiscale_id;
  const linked = invoices.data?.find(f => f.id === linkedId);
  const invoiceLabel = linked?.numero || installment.fattura?.numero || t("senza numero");
  const rows = (invoices.data ?? []).filter(f => `${f.numero} ${f.stato} ${f.totale_documento ?? f.totale_da_pagare}`.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it')))
    .sort((a, b) => Number(!!reason(a)) - Number(!!reason(b)));
  async function save(unlink = false) {
    if (saving.current || !canWrite || !installment.id || (!unlink && (blocked || !chosen || reason(chosen)))) return;
    saving.current = true; setPending(true); setError('');
    try {
      if (unlink) {
        const ok = await confirm({ title: t("Scollegare la fattura dalla rata?"), description: t("Gli incassi già registrati sulla fattura restano salvati. Verifica poi lo stato e il residuo del piano pagamenti."), confirmLabel: t("Scollega fattura") });
        if (!ok) return;
      } else {
        const [freshInvoices, freshLinks] = await Promise.all([invoices.refetch(), links.refetch()]);
        if (freshInvoices.error || freshLinks.error) throw new Error(t("Impossibile aggiornare le fatture. Riprova."));
        const fresh = freshInvoices.data?.find(f => f.id === selected);
        const problem = fresh ? reason(fresh, freshLinks.data ?? []) : t("La fattura non è più disponibile.");
        if (problem) throw new Error(problem);
      }
      const result = unlink
        ? await supabase.rpc('scollega_rata_fattura', { p_rata_id: installment.id })
        : await supabase.rpc('collega_rata_fattura', { p_rata_id: installment.id, p_documento_id: selected });
      if (result.error) throw result.error;
      refreshFinancialQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['ordine-fatture', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['rate-fatture-disponibili'] });
      toast.success(unlink ? t("Fattura scollegata dalla rata.") : t("Fattura collegata. Incassi e rata aggiornati."));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message || t("Collegamento non riuscito. Riprova.")); }
    finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving.current) onClose(); }}>
    <DialogContent ampiezza="conferma" className="flex max-h-[90dvh] flex-col overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b p-4 pr-10">
        <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" aria-hidden />{linkedId ? t("Fattura della rata") : t("Collega fattura alla rata")}</DialogTitle>
        <DialogDescription>{linkedId ? t("Apri il documento o correggi il collegamento alla rata.") : t("Scegli una fattura esistente della commessa, intera e con lo stesso importo della rata.")}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3"><div><p className="font-medium">{installment.label}</p><p className="text-xs text-muted-foreground">{installment.is_paid ? t("Incassata") : t("Da incassare")} · {t("IVA inclusa")}</p></div><strong className="tabular-nums">{formatCurrency(amount)}</strong></div>
        {linkedId ? <div className="space-y-3 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{t("FATTURA COLLEGATA")}</p>
          <Link className="flex items-center gap-2 font-medium text-primary hover:underline" to={`/azienda/documenti/${linkedId}/dettaglio`}><FileText className="h-4 w-4" aria-hidden />{t("Fattura n. {numero}", { numero: invoiceLabel })}</Link>
          <p className="text-sm text-muted-foreground">{linked?.stato || installment.fattura?.stato}{linked && ` · ${t("{importo} IVA inclusa", { importo: formatCurrency(Number(linked.totale_documento ?? linked.totale_da_pagare)) })}`}</p>
          <p className="text-xs text-muted-foreground">{t("Per correggere il collegamento, scollega questa fattura e poi scegli quella corretta. Gli incassi registrati restano sulla fattura.")}</p>
        </div> : <>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label={t("Cerca fattura")} placeholder={t("Cerca numero o stato fattura…")} className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
          {(invoices.isError || links.isError) ? <div role="alert" className="text-sm text-destructive">{t("Fatture non disponibili.")} <Button variant="outline" size="sm" onClick={() => { void invoices.refetch(); void links.refetch(); }}>{t("Riprova")}</Button></div> : blocked ? <p role="status" className="text-sm text-muted-foreground">{t("Controllo fatture e collegamenti…")}</p> : <div role="radiogroup" aria-label={t("Fattura da collegare")} className="max-h-64 space-y-2 overflow-y-auto">
            {rows.map(f => { const problem = reason(f); return <button type="button" key={f.id} role="radio" aria-checked={selected === f.id} disabled={!!problem || pending} onClick={() => setSelected(f.id)} className={`w-full rounded-lg border p-3 text-left disabled:bg-muted/20 disabled:text-muted-foreground ${selected === f.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}>
              <span className="flex justify-between gap-3 text-sm font-medium"><span>{f.numero || t("Fattura senza numero")}</span><span className="shrink-0 tabular-nums">{formatCurrency(Number(f.totale_documento ?? f.totale_da_pagare))}</span></span>
              <span className="mt-1 block text-xs">{f.stato} · {problem || t("Importo corrispondente · disponibile")}</span>
            </button>; })}
            {!rows.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{search ? t("Nessuna fattura corrisponde alla ricerca.") : t("Nessuna fattura associata a questa commessa.")}</p>}
          </div>}
          {chosen && !reason(chosen) && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><strong>{t("Collegamento e incasso")}</strong><p className="mt-1">{installment.is_paid ? t("La rata risulta già incassata: il servizio allinea anche l’incasso della fattura.") : chosen.stato === 'pagata' ? t("La fattura è già pagata: anche la rata risulterà incassata.") : t("Il servizio mantiene sincronizzati stato e incassi della rata e della fattura, inclusi eventuali incassi parziali.")}</p></div>}
          <Link className="inline-flex text-sm text-primary hover:underline" to={`/azienda/ordini/${orderId}?tab=finanza&vista_economia=pagamenti`}>{t("Non trovi la fattura? Apri Fatture e Incassi →")}</Link>
        </>}
        {onManageAllocations && <Button variant="outline" onClick={()=>onManageAllocations(linkedId ?? (selected||undefined))}>{t("Gestisci più rate della stessa fattura")}</Button>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t p-4"><Button variant="outline" disabled={pending} onClick={onClose}>{t("Chiudi")}</Button>{linkedId ? <Button variant="outline" disabled={!canWrite || pending} onClick={() => void save(true)}>{t("Scollega fattura")}</Button> : <Button disabled={!canWrite || pending || blocked || !chosen || !!reason(chosen)} onClick={() => void save()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{t("Collega fattura")}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
