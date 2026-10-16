import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function OrdersTrashDialog({open,onOpenChange,companyId,onChanged}: {
  open:boolean; onOpenChange:(v:boolean)=>void; companyId:string; onChanged:()=>void;
}) {
  const [restoring,setRestoring]=useState<string|null>(null);
  const query=useQuery({queryKey:['orders-trash',companyId],enabled:open&&!!companyId,queryFn:async()=>{
    const {data,error}=await supabase.from('orders').select('id,order_code,description,deleted_at')
      .eq('company_id',companyId).not('deleted_at','is',null).order('deleted_at',{ascending:false}).limit(101);
    if(error)throw error;
    return data??[];
  }});
  const restore=async(id:string)=>{
    setRestoring(id);
    try {
      const {error}=await supabase.rpc('set_order_trashed' as never,{p_order_id:id,p_company_id:companyId,p_trashed:false} as never);
      if(error)throw error;
      toast.success('Commessa ripristinata');
      onChanged();
      await query.refetch();
    } catch(e) {toast.error('Ripristino non riuscito',{description:e&&typeof e==='object'&&'message'in e?String(e.message):'Riprova.'});}
    finally {setRestoring(null);}
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Cestino commesse</DialogTitle><DialogDescription>Le commesse create per errore possono essere ripristinate insieme alle rate previste. Nessuna cancellazione definitiva da questa schermata.</DialogDescription></DialogHeader>
    {query.isPending?<p role="status">Caricamento cestino…</p>:query.isError?<div role="alert"><p>Il cestino non è disponibile.</p><Button onClick={()=>void query.refetch()}>Riprova</Button></div>:!query.data?.length?<p>Il cestino è vuoto.</p>:<ul className="divide-y">{query.data.slice(0,100).map(r=><li key={r.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{r.order_code||'Commessa senza codice'}</p><p className="break-words text-sm text-muted-foreground">{r.description}</p>{r.deleted_at&&<p className="text-xs text-muted-foreground">Spostata nel cestino il {new Date(r.deleted_at).toLocaleDateString('it-IT')}</p>}</div><Button variant="outline" disabled={!!restoring} onClick={()=>void restore(r.id)}>{restoring===r.id?'Ripristino…':'Ripristina'}</Button></li>)}</ul>}
    {(query.data?.length??0)>100&&<p className="text-xs text-muted-foreground">Sono mostrate le 100 commesse cestinate più recenti.</p>}
  </DialogContent></Dialog>;
}
