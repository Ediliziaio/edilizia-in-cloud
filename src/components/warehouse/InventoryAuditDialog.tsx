import { useRef, useState } from 'react';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryPreview, useInventoryHistory, useWarehouseOperation, type InventorySnapshot, type InventoryCount } from '@/hooks/warehouse/useWarehouseOperations';
import { formattaQuantitaMovimento as fmt, leggiQuantitaNonNegativa } from '@/lib/magazzino/quantitaMovimento';
import { unitaConsumoConfrontabile } from '@/lib/distinta/consumiMateriali';
import { movementOutcomeUnknown } from '@/lib/magazzino/protocolloMovimenti';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
interface Props {open:boolean;onOpenChange:(open:boolean)=>void;stockItem:{id:string;name:string;quantity:number}|null;companyId:string;warehouseName?:string}
export default function InventoryAuditDialog(props:Props) {
 return props.open&&props.stockItem?<InventorySession key={`${props.companyId}:${props.stockItem.id}`} {...props} stockItem={props.stockItem}/>:null;
}
function InventorySession({onOpenChange,stockItem,companyId,warehouseName}:Props & {stockItem:NonNullable<Props['stockItem']>}) {
 const permissions=usePermissions();const {user}=useAuth();const canWrite=!permissions.isLoading&&permissions.canEditWarehouse;
 const {protocol,snapshot}=useInventoryPreview(companyId,stockItem.id,true);const history=useInventoryHistory(companyId,stockItem.id,true);
 const [actual,setActual]=useState('');const [notes,setNotes]=useState('');const [checked,setChecked]=useState<string[]|null>(null);
 const [review,setReview]=useState<InventorySnapshot|null>(null);const [apply,setApply]=useState<InventoryCount|null>(null);const [error,setError]=useState<string|null>(null);
 const [uncertain,setUncertain]=useState(false);const flight=useRef(false);
 const [reviewedInput,setReviewedInput]=useState<{quantity:number;serials:string[];notes:string|null}|null>(null);const attemptedCount=useRef<Record<string,unknown>|null>(null);const capture=useWarehouseOperation('inventory-count');const adjustment=useWarehouseOperation('inventory-apply');const pending=capture.isPending||adjustment.isPending;
 const state=snapshot.data;const v3=!!protocol.data?.inventory_counts;const serialized=v3&&state?.tracking==='serialized';
 const selected=checked??(state?.serials??[]).filter(u=>u.status!=='inventory_missing').map(u=>u.serial_number);
 const q=review&&reviewedInput?reviewedInput.quantity:serialized?selected.length:leggiQuantitaNonNegativa(actual);
 const whole=!v3||serialized||unitaConsumoConfrontabile(state?.unit)==='pz';
 const coherent=!serialized||state?.quantity===(state?.serials??[]).filter(u=>u.status!=='inventory_missing').length;
 const valid=!!state&&canWrite&&q!==null&&(!whole||Number.isInteger(q))&&q>=state.reserved&&coherent&&(!state.tracking.includes('serialized')||v3);
 const difference=q!==null&&state?q-(review?.quantity??state.quantity):null;
 async function saveCount(){if(flight.current||pending||!review||(!uncertain&&!canWrite))return;flight.current=true;setError(null);
  try {
   if(v3){const payload=uncertain&&attemptedCount.current?attemptedCount.current:{p_stock_item_id:stockItem.id,p_counted:q,p_snapshot:review,p_serial_numbers:reviewedInput?.serials??[],p_notes:reviewedInput?.notes??null};attemptedCount.current=payload;await capture.mutateAsync({rpc:'warehouse_inventory_count_v3',payload});}
   else {if(!user?.id)throw new Error('Sessione non disponibile.');const {error}=await supabase.from('inventory_audits').insert({company_id:companyId,stock_item_id:stockItem.id,expected_quantity:review.quantity,counted_quantity:q!,notes:notes||null,performed_by:user.id});if(error)throw error;}
   toast.success('Conteggio registrato. La giacenza cambia soltanto applicando la rettifica.');setReview(null);setActual('');setNotes('');setChecked(null);setUncertain(false);void history.refetch();void snapshot.refetch();
  }catch(e){setError((e as Error).message);setUncertain(v3&&movementOutcomeUnknown(e));}finally{flight.current=false;}
 }
 async function applyCount(){if(!apply||flight.current||pending||!canWrite)return;flight.current=true;setError(null);
  try {await adjustment.mutateAsync({rpc:apply.protocol_version===3?'warehouse_inventory_apply_v3':'apply_inventory_audit_adjustment',payload:apply.protocol_version===3?{p_audit_id:apply.id}:{p_audit_id:apply.id,p_company_id:companyId},legacy:apply.protocol_version!==3});
   toast.success('Rettifica applicata: giacenza e storico aggiornati.');setApply(null);setUncertain(false);setChecked(null);void snapshot.refetch();void history.refetch();
  }catch(e){setError((e as Error).message);setUncertain(apply.protocol_version===3&&movementOutcomeUnknown(e));}finally{flight.current=false;}
 }
 return <Dialog open onOpenChange={value=>{if(!pending)onOpenChange(value);}}><DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
  <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5"/>{apply?'Conferma rettifica':review?'Conferma conteggio':'Inventario fisico'} · {stockItem.name}</DialogTitle><DialogDescription>Registra ciò che trovi fisicamente. Il conteggio e l’applicazione della rettifica sono due passaggi distinti.</DialogDescription></DialogHeader>
  {protocol.isError||snapshot.isError?<p role="alert" className="text-sm text-destructive">Giacenza non verificata. <Button variant="outline" size="sm" onClick={()=>{void protocol.refetch();void snapshot.refetch();}}>Riprova disponibilità</Button></p>:!state?<p role="status">Verifica della giacenza e degli impegni…</p>:<>
   <dl className="grid grid-cols-3 gap-3 rounded-xl bg-eic-navy-deep p-4 text-white"><div><dt className="text-xs text-blue-100">Nel sistema</dt><dd className="mt-1 text-xl font-semibold">{fmt(state.quantity)} {state.unit}</dd></div><div><dt className="text-xs text-blue-100">Prenotato</dt><dd className="mt-1 text-xl font-semibold">{fmt(state.reserved)} {state.unit}</dd></div><div><dt className="text-xs text-blue-100">Magazzino</dt><dd className="mt-1 font-semibold">{warehouseName??'Articolo selezionato'}</dd></div></dl>
   {apply?<div className="space-y-2 rounded-xl border p-4"><p>Conteggio registrato: <strong>{fmt(apply.counted_quantity)} {state.unit}</strong></p><p>Rettifica: <strong>{apply.difference>0?'+':''}{fmt(apply.difference)} {state.unit}</strong></p><p className="text-sm text-muted-foreground">Il servizio ricontrolla la scheda prima di modificare la giacenza. Se è cambiata, il conteggio va ripetuto. Il movimento conserva il costo medio registrato.</p></div>:review?<div className="space-y-2 rounded-xl border p-4"><p>Quantità trovata: <strong>{fmt(q??0)} {state.unit}</strong></p><p>Differenza rispetto al sistema: <strong>{difference!==null&&difference>0?'+':''}{fmt(difference??0)} {state.unit}</strong></p>{serialized&&<p className="font-mono text-sm">{reviewedInput?.serials.join(' · ')||'Nessuna matricola presente'}</p>}<p className="text-sm text-muted-foreground">Questa conferma salva il conteggio; non modifica la giacenza. Puoi poi applicare la rettifica dallo storico.</p></div>:<>
    {serialized?<fieldset className="space-y-1"><legend className="mb-2 text-sm font-medium">Matricole trovate fisicamente</legend><div className="max-h-48 divide-y overflow-y-auto rounded-xl border">{state.serials.map(u=><label key={u.id} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" checked={selected.includes(u.serial_number)} disabled={u.status==='reserved'||!canWrite} onChange={e=>setChecked(e.target.checked?[...selected,u.serial_number]:selected.filter(s=>s!==u.serial_number))}/><span className="font-mono">{u.serial_number}</span><span className="ml-auto text-xs text-muted-foreground">{u.status==='reserved'?'Prenotata':u.status==='inventory_missing'?'Da ritrovare':'A magazzino'}</span></label>)}</div><p className="text-xs text-muted-foreground">{selected.length} {selected.length===1?'matricola trovata':'matricole trovate'}. Quelle non trovate restano nello storico e si possono ritrovare con un nuovo conteggio; la garanzia non cambia.</p></fieldset>:<label className="space-y-1 text-sm"><span className="font-medium">Quantità conteggiata fisicamente</span><Input aria-label="Quantità conteggiata fisicamente" inputMode={whole?'numeric':'decimal'} value={actual} onChange={e=>setActual(e.target.value)} placeholder="Anche zero, se non c’è materiale"/></label>}
    {!coherent&&<p role="alert" className="text-sm text-destructive">Giacenza e matricole non coincidono: verifica prima le matricole registrate.</p>}
    {difference!==null&&<p className={`rounded-xl border p-3 text-sm ${valid?'text-foreground':'text-destructive'}`}>Differenza: {difference>0?'+':''}{fmt(difference)} {state.unit}{q!==null&&q<state.reserved?' · Il conteggio è inferiore alla quantità prenotata.':whole&&q!==null&&!Number.isInteger(q)?' · Per questo articolo servono unità intere.':''}</p>}
    <Button variant="outline" size="sm" disabled={pending||snapshot.isFetching} onClick={()=>{setChecked(null);void snapshot.refetch();}}>Aggiorna giacenza</Button>
    <Textarea aria-label="Note inventario" placeholder="Note sul conteggio (facoltative)" value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/>
    {state.tracking==='serialized'&&!v3&&<p role="alert" className="text-sm text-destructive">Per contare le matricole serve il servizio aggiornato.</p>}
   </>}
  </>}
  {!canWrite&&<p role="alert" className="text-sm text-destructive">Non hai il permesso di modificare il magazzino.</p>}
  {error&&<p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error} I dati compilati sono conservati.</p>}
  <DialogFooter><Button variant="outline" disabled={pending||uncertain} onClick={apply?()=>setApply(null):review?()=>setReview(null):()=>onOpenChange(false)}>{apply||review?'Torna al conteggio':'Chiudi'}</Button>{apply?<Button disabled={pending||!canWrite} onClick={()=>void applyCount()}>{pending?'Applicazione…':uncertain?'Verifica esito rettifica':'Applica rettifica'}</Button>:review?<Button disabled={pending||!canWrite} onClick={()=>void saveCount()}>{pending?'Registrazione…':uncertain?'Verifica esito conteggio':'Registra conteggio'}</Button>:<Button disabled={!valid||snapshot.isFetching} onClick={()=>{setError(null);setReviewedInput({quantity:q!,serials:serialized?[...selected]:[],notes:notes.trim()||null});setReview(state!);}}>Controlla conteggio</Button>}</DialogFooter>
  {!review&&!apply&&<section className="space-y-2 border-t pt-3" aria-label="Storico inventari"><h3 className="text-sm font-semibold">Storico conteggi</h3>{history.isLoading?<p role="status">Caricamento storico…</p>:history.isError?<p role="alert">Impossibile caricare lo storico. <Button variant="outline" size="sm" onClick={()=>void history.refetch()}>Riprova storico</Button></p>:(history.data??[]).length===0?<p className="text-sm text-muted-foreground">Nessun conteggio registrato.</p>:<ul className="max-h-48 divide-y overflow-auto rounded-xl border">{(history.data??[]).map(a=><li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p>Nel sistema {fmt(a.expected_quantity)} → Trovati {fmt(a.counted_quantity)} {state?.unit}</p><p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('it-IT')}{a.notes?` · ${a.notes}`:''}</p></div>{a.adjustment_applied?<span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Applicata</span>:<Button variant="outline" size="sm" disabled={!canWrite||pending} onClick={()=>{setError(null);setApply(a);}}>Prepara rettifica</Button>}</li>)}</ul>}</section>}
 </DialogContent></Dialog>;
}
