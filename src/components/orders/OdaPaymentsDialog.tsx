import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DialogContentOperativo as DialogContent } from '@/components/orders/generali/design/ContestoOperativo';
import { Button } from '@/components/ui/button';
import { documentiDb } from '@/lib/ddt/documentiPersistenti';
import { formatCurrency } from '@/lib/formatters';
import { totalePagamentiFornitura } from '@/lib/orders/odaContabilita';
import { ExpensePaymentDialog, type ExpensePaymentDetail } from './ExpensePaymentDialog';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface SpesaFornitura { id: string; quota?: number }

/** L'ODA mostra tutte le spese; il pagamento si apre solo sul documento scelto. */
export function OdaPaymentsDialog({ odaId, spese, onClose }: { odaId: string; spese: SpesaFornitura[]; onClose: () => void }) {
  const t = useT();
  const [scelta, setScelta] = useState<string | null>(null);
  const ids = [...new Set(spese.map(s => s.id))].sort();
  const dettagli = useQuery({
    queryKey: ['oda-pagamenti-riepilogo', odaId, ids],
    staleTime: 0,
    queryFn: async () => {
      // Solo durante l'apertura, a gruppi piccoli: niente letture per ogni riga dell'ODA.
      const result: ExpensePaymentDetail[] = [];
      for (let i = 0; i < ids.length; i += 4) {
        const batch = await Promise.all(ids.slice(i, i + 4).map(async id => {
          const { data, error } = await documentiDb.rpc('dettaglio_pagamento_costo', { p_costo: id });
          if (error) throw new Error(error.message);
          if (!data || data.id !== id) throw new Error('Il dettaglio di una spesa non è disponibile.');
          return data as ExpensePaymentDetail;
        }));
        result.push(...batch);
      }
      return result;
    },
  });
  const righe = (dettagli.data ?? []).map(d => ({ ...d, quota: spese.find(s => s.id === d.id)?.quota ?? 1 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  const totale = totalePagamentiFornitura(righe);
  const quote = righe.some(d => d.quota !== 1);
  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent struttura="scorrevole" ampiezza="modulo" className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Fatture e pagamenti della fornitura")}</DialogTitle>
          <DialogDescription>{t("Tutte le spese collegate a questo ODA, IVA compresa. Scegli il documento per vedere o registrare il suo pagamento.")}</DialogDescription>
        </DialogHeader>
        {dettagli.isPending ? <p role="status">{t("Caricamento delle spese…")}</p> : dettagli.isError ? <p role="alert">{t("Non riesco a verificare tutti i pagamenti.")} <Button variant="link" onClick={() => void dettagli.refetch()}>{t("Riprova")}</Button></p> : <>
          <dl className="grid grid-cols-3 gap-2" aria-label={t("Totali della fornitura")}>
            {([['Dovuto', totale.totale], ['Pagato', totale.pagato], ['Residuo', totale.residuo]] as const).map(([nome, valore]) => <div className="rounded-lg border p-3" key={nome}><dt className="text-xs text-muted-foreground">{t(nome)}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(valore)}</dd></div>)}
          </dl>
          {totale.daVerificare && <p role="alert" className="text-sm text-amber-800">{t("Una spesa contiene pagamenti storici da verificare. Apri il documento prima di registrare altri pagamenti.")}</p>}
          {quote && <p className="text-xs text-muted-foreground">{t("Per le fatture divise tra più ordini, i totali riportano la quota di questo ODA; i pagamenti sono attribuiti in proporzione. Il dettaglio apre l'intero documento.")}</p>}
          <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><caption className="sr-only">{t("Spese e residui della fornitura")}</caption>
            <thead className="bg-muted/40"><tr><th className="p-3 text-left">{t("Documento")}</th><th className="p-3 text-right">{t("Dovuto")}</th><th className="p-3 text-right">{t("Pagato")}</th><th className="p-3 text-right">{t("Residuo")}</th><th className="p-3"><span className="sr-only">{t("Azioni")}</span></th></tr></thead>
            <tbody>{righe.map(d => <tr key={d.id} className="border-t"><th scope="row" className="p-3 text-left font-medium">{d.nome}{d.quota !== 1 && <span className="block text-xs font-normal text-muted-foreground">{t("Quota di questo ODA")}</span>}</th><td className="p-3 text-right tabular-nums">{formatCurrency(d.totale * d.quota)}</td><td className="p-3 text-right tabular-nums">{formatCurrency(d.pagato * d.quota)}</td><td className="p-3 text-right tabular-nums">{formatCurrency(d.residuo * d.quota)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => setScelta(d.id)} aria-label={t("Apri pagamenti {nome}", { nome: d.nome })}>{t("Apri")}</Button></td></tr>)}</tbody>
          </table></div>
        </>}
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{t("Chiudi riepilogo")}</Button></div>
      </DialogContent>
    </Dialog>
    {scelta && <ExpensePaymentDialog key={scelta} costId={scelta} onClose={() => setScelta(null)} />}
  </>;
}
