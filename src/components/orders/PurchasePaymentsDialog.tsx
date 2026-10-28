import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { OdaAccountingCard } from './OdaAccountingCard';

export function PurchasePaymentsDialog({orderId,onClose}:{orderId:string;onClose:()=>void}) {
  const order=useQuery({queryKey:['oda-contabilita-documento',orderId],queryFn:async()=>{const {data,error}=await supabase.from('purchase_orders').select('id,oda_number,status,total').eq('id',orderId).single();if(error)throw new Error(error.message);return data;}});
  return <Dialog open onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Ordine d’acquisto {order.data?.oda_number??''}</DialogTitle><DialogDescription>Fatture, costo registrato e pagamenti. Chiudendo torni alla commessa.</DialogDescription></DialogHeader>
    {order.isPending?<p>Caricamento ordine…</p>:order.isError?<p role="alert">{order.error.message}</p>:order.data&&<OdaAccountingCard odaId={orderId} totaleOrdine={Number(order.data.total)} stato={order.data.status}/>}
  </DialogContent></Dialog>;
}
