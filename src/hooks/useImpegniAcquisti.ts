import { useQuery } from '@tanstack/react-query';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { documentiDb as db } from '@/lib/ddt/documentiPersistenti';
import { readAllOrderRows } from '@/lib/orders/listScope';
import { impegniAcquisti, type OrdineImpegno, type CostoImpegno, type QuotaImpegno, type NotaImpegno } from '@/lib/orders/impegniAcquisti';

/** Solo gli ODA della commessa aperta, paginati; nessuna lettura di tutte le aziende. */
export function useImpegniAcquisti(orderId: string, enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ['commessa-impegni-acquisti', companyId, orderId],
    enabled: enabled && !!companyId && !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const ordini = await readAllOrderRows<OrdineImpegno>((from, to) => db.from('purchase_orders')
        .select('id,subtotal').eq('company_id', companyId).eq('order_id', orderId)
        .in('status', ['inviato', 'confermato', 'parziale', 'ricevuto']).order('id').range(from, to));
      const costi: CostoImpegno[] = [], quote: QuotaImpegno[] = [], note: NotaImpegno[] = [];
      for (let i = 0; i < ordini.length; i += 100) {
        const ids = ordini.slice(i, i + 100).map(o => o.id);
        const [c, q] = await Promise.all([
          readAllOrderRows<CostoImpegno>((from, to) => db.from('company_costs').select('id,purchase_order_id,amount')
            .eq('company_id', companyId).in('purchase_order_id', ids).order('id').range(from, to)),
          readAllOrderRows<QuotaImpegno>((from, to) => db.from('fattura_ricevuta_ordini')
            .select('purchase_order_id,importo,fattura:fatture_ricevute(stato,company_cost_id)')
            .eq('company_id', companyId).in('purchase_order_id', ids).order('id').range(from, to)),
        ]);
        costi.push(...c); quote.push(...q);
      }
      for (let i = 0; i < costi.length; i += 100) {
        note.push(...await readAllOrderRows<NotaImpegno>((from, to) => db.from('fatture_ricevute')
          .select('company_cost_id,imponibile_totale').eq('company_id', companyId)
          .in('company_cost_id', costi.slice(i, i + 100).map(c => c.id)).in('tipo_documento', ['TD04', 'passive_credit_note'])
          .order('id').range(from, to)));
      }
      return impegniAcquisti(ordini, costi, quote, note);
    },
  });
}
