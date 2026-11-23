import { useRef, useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { warehouseRpc, movementOutcomeUnknown } from '@/lib/magazzino/protocolloMovimenti';
import { useWarehouseOperation, useWarehouseProtocol } from '@/hooks/warehouse/useWarehouseOperations';
import { leggiQuantitaMovimento, formattaQuantitaMovimento as fmt } from '@/lib/magazzino/quantitaMovimento';
import { unitaConsumoConfrontabile } from '@/lib/distinta/consumiMateriali';
import { toast } from 'sonner';
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Row {key:string;stockId:string;quantity:string;serials:string[]}
interface Stock {id:string;name:string;quantity:number;quantity_available:number;unita_misura:string|null;tracking_mode:string}
interface TransferHistory {id:string;status:string;transfer_date:string;from_warehouse:{name:string};to_warehouse:{name:string}}
export function WarehouseTransferPanel(props:{open:boolean;onOpenChange:(value:boolean)=>void}) {
 const {effectiveCompany}=useAuth();
 return props.open ? <TransferSession key={effectiveCompany?.id} {...props}/> : null;
}
function TransferSession({onOpenChange}:{onOpenChange:(value:boolean)=>void}) {
  const tr = useT();
 const {effectiveCompany}=useAuth();const companyId=effectiveCompany?.id;const permissions=usePermissions();
 const canWrite=!permissions.isLoading&&permissions.canEditWarehouse;const {warehouses}=useWarehouses();
 const protocol=useWarehouseProtocol(companyId);const v3=!!protocol.data?.atomic_transfers;
 const [from,setFrom]=useState('');const [to,setTo]=useState('');const [date,setDate]=useState(new Date().toLocaleDateString('en-CA'));
 const [notes,setNotes]=useState('');const [rows,setRows]=useState<Row[]>([]);const [review,setReview]=useState(false);const [historyOpen,setHistoryOpen]=useState(false);
 const [error,setError]=useState<string|null>(null);const [uncertain,setUncertain]=useState(false);const flight=useRef(false);
 const save=useWarehouseOperation('transfer');const attemptedPayload=useRef<Record<string,unknown>|null>(null);
 const stock=useQuery({queryKey:['warehouse-stock-for-transfer',companyId,from],enabled:!!companyId&&!!from,retry:false,staleTime:0,queryFn:async()=>{
  const r=await supabase.from('warehouse_stock').select('id,name,quantity,quantity_available,unita_misura,tracking_mode').eq('company_id',companyId!).eq('warehouse_id',from).gt('quantity',0).order('name');if(r.error)throw r.error;return r.data as Stock[];
 }});
 const units=useQuery({queryKey:['warehouse','transfer-units',companyId,from],enabled:v3&&!!from&&rows.some(r=>(stock.data??[]).find(s=>s.id===r.stockId)?.tracking_mode==='serialized'),retry:false,queryFn:async()=>{
  const r=await supabase.from('stock_units').select('id,stock_item_id,serial_number,status').eq('company_id',companyId!).eq('warehouse_id',from).eq('status','available').order('serial_number');if(r.error)throw r.error;return r.data??[];
 }});
 const history=useQuery({queryKey:['warehouse-transfers',companyId,protocol.data?.version],enabled:historyOpen&&!!companyId&&!!protocol.data,retry:false,queryFn:async():Promise<TransferHistory[]>=>{
  if(v3){const r=await warehouseRpc('warehouse_transfer_list_v3',{p_company_id:companyId});if(r.error)throw r.error;return r.data as TransferHistory[];}
  const r=await supabase.from('warehouse_transfers').select('*,from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name)').eq('company_id',companyId!).order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;return r.data as unknown as TransferHistory[];
 }});
 const problem=()=>{
  if(!canWrite)return tr("Non hai il permesso di modificare il magazzino.");
  if(!protocol.data)return tr("Verifica le funzioni disponibili prima di continuare.");
  if(!from||!to||from===to)return tr("Scegli due magazzini diversi.");
  if(!rows.length)return tr("Aggiungi almeno un articolo.");
  const seen=new Set<string>();
  for(const row of rows){const item=stock.data?.find(s=>s.id===row.stockId);const q=leggiQuantitaMovimento(row.quantity);
   if(!item)return tr("Scegli un articolo per ogni riga.");if(seen.has(item.id))return tr("Un articolo può comparire una sola volta.");seen.add(item.id);
   if(q===null)return tr("Inserisci quantità positive valide.");
   if(q>Number(item.quantity_available))return tr("{nome}: disponibili {quantita} {unita}.", { nome: item.name, quantita: fmt(Number(item.quantity_available)), unita: item.unita_misura??"" });
   if((!v3||item.tracking_mode==='serialized'||unitaConsumoConfrontabile(item.unita_misura)==='pz')&&!Number.isInteger(q))return tr("{nome}: il servizio richiede unità intere.", { nome: item.name });
   if(item.tracking_mode==='serialized'&&(!v3||row.serials.length!==q))return v3?tr("Seleziona un seriale per ogni pezzo."):tr("Per trasferire matricole serve il servizio aggiornato.");
  }return null;
 };
 const validation=problem();
 function patch(key:string,values:Partial<Row>){setRows(old=>old.map(r=>r.key===key?{...r,...values}:r));setError(null);}
 async function confirm(){if(flight.current||save.isPending||(!uncertain&&validation))return;flight.current=true;setError(null);
  try {const payload=uncertain&&attemptedPayload.current?attemptedPayload.current:{p_company_id:companyId,p_from_warehouse_id:from,p_to_warehouse_id:to,p_transfer_date:date,p_notes:notes.trim()||null,
   p_items:rows.map(row=>({stock_item_id:row.stockId,quantity:leggiQuantitaMovimento(row.quantity),...(v3?{serial_numbers:row.serials}:{})}))};
   attemptedPayload.current=payload;await save.mutateAsync({rpc:v3?'warehouse_transfer_v3':'create_warehouse_transfer_atomic',payload,legacy:!v3});
   toast.success(tr("Trasferimento registrato: entrambi i magazzini sono aggiornati."));onOpenChange(false);
  }catch(e){setError((e as Error).message);setUncertain(v3&&movementOutcomeUnknown(e));}finally{flight.current=false;}
 }
 return <Dialog open onOpenChange={value=>{if(!save.isPending)onOpenChange(value);}}><DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
  <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRight className="h-5 w-5"/>{review?tr("Conferma trasferimento"):tr("Trasferisci tra magazzini")}</DialogTitle><DialogDescription>{tr("Il trasferimento diretto scarica la partenza e carica la destinazione insieme. Gli impegni delle commesse restano protetti.")}</DialogDescription></DialogHeader>
  {review?<>
   <div className="grid gap-3 rounded-xl bg-eic-navy-deep p-4 text-white sm:grid-cols-3"><div><p className="text-xs text-blue-100">{tr("Partenza")}</p><p className="mt-1 font-semibold">{warehouses.find(w=>w.id===from)?.name}</p></div><div><p className="text-xs text-blue-100">{tr("Destinazione")}</p><p className="mt-1 font-semibold">{warehouses.find(w=>w.id===to)?.name}</p></div><div><p className="text-xs text-blue-100">{tr("Data")}</p><p className="mt-1 font-semibold">{new Date(date+'T12:00:00').toLocaleDateString(intlCampo())}</p></div></div>
   <ul className="divide-y rounded-xl border">{rows.map(row=><li key={row.key} className="p-3"><div className="flex justify-between gap-3"><strong>{stock.data?.find(s=>s.id===row.stockId)?.name}</strong><span>{row.quantity.replace('.',',')} {stock.data?.find(s=>s.id===row.stockId)?.unita_misura}</span></div>{row.serials.length>0&&<p className="mt-1 font-mono text-xs">{row.serials.join(' · ')}</p>}</li>)}</ul>
   <p className="text-sm text-muted-foreground">{tr("Quantità, costo registrato e garanzia delle matricole rimangono tracciati. Nessun ordine o documento di trasporto viene creato.")}</p>
  </>:<>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>{tr("Da magazzino")}</Label><Select value={from} onValueChange={v=>{setFrom(v);setRows([]);}}><SelectTrigger aria-label={tr("Da magazzino")}><SelectValue placeholder={tr("Scegli la partenza")}/></SelectTrigger><SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id} disabled={w.id===to}>{w.name}</SelectItem>)}</SelectContent></Select></div><div><Label>{tr("A magazzino")}</Label><Select value={to} onValueChange={setTo}><SelectTrigger aria-label={tr("A magazzino")}><SelectValue placeholder={tr("Scegli la destinazione")}/></SelectTrigger><SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id} disabled={w.id===from}>{w.name}</SelectItem>)}</SelectContent></Select></div></div>
   <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">{tr("Data trasferimento")}<Input aria-label={tr("Data trasferimento")} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="space-y-1 text-sm">{tr("Note")}<Textarea value={notes} aria-label={tr("Note trasferimento")} onChange={e=>setNotes(e.target.value)} rows={1}/></label></div>
   {stock.isError&&<p role="alert" className="text-sm text-destructive">{tr("Disponibilità non verificata.")} <Button variant="outline" size="sm" onClick={()=>void stock.refetch()}>{tr("Riprova articoli")}</Button></p>}
   <div className="space-y-3">{rows.map((row,index)=>{const item=stock.data?.find(s=>s.id===row.stockId);return <div key={row.key} className="space-y-2 rounded-xl border p-3"><div className="flex items-center gap-2"><Select value={row.stockId} onValueChange={v=>patch(row.key,{stockId:v,quantity:'1',serials:[]})}><SelectTrigger aria-label={tr("Articolo {index}", { index: index+1 })} className="flex-1"><SelectValue placeholder={tr("Scegli articolo")}/></SelectTrigger><SelectContent>{(stock.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{tr("{name} · disponibili {valore} {unita_misura}", { name: String(s.name ?? ""), valore: fmt(Number(s.quantity_available)), unita_misura: String(s.unita_misura ?? "") })}</SelectItem>)}</SelectContent></Select><Input aria-label={tr("Quantità riga {index}", { index: index+1 })} inputMode="decimal" value={row.quantity} onChange={e=>patch(row.key,{quantity:e.target.value})} className="w-24"/><Button variant="ghost" size="icon" aria-label={tr("Rimuovi riga {index}", { index: index+1 })} onClick={()=>setRows(old=>old.filter(r=>r.key!==row.key))}><Trash2 className="h-4 w-4"/></Button></div>
    {item&&<p className="text-xs text-muted-foreground">{tr("Disponibili {valore} {unita_misura}. Gli articoli prenotati non vengono trasferiti.", { valore: fmt(Number(item.quantity_available)), unita_misura: String(item.unita_misura ?? "") })}</p>}
    {item?.tracking_mode==='serialized'&&v3&&<fieldset><legend className="text-sm font-medium">{tr("Matricole da trasferire")}</legend>{units.isError?<p role="alert" className="text-sm text-destructive">{tr("Impossibile verificare i seriali.")}</p>:units.isLoading?<p role="status">{tr("Controllo matricole…")}</p>:(units.data??[]).filter(u=>u.stock_item_id===item.id).map(u=><label key={u.id} className="mr-4 inline-flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={row.serials.includes(u.serial_number)} onChange={e=>patch(row.key,{serials:e.target.checked?[...row.serials,u.serial_number]:row.serials.filter(s=>s!==u.serial_number)})}/>{u.serial_number}</label>)}</fieldset>}
   </div>;})}</div>
   <Button variant="outline" disabled={!from||!canWrite} onClick={()=>setRows(old=>[...old,{key:crypto.randomUUID(),stockId:'',quantity:'1',serials:[]}])}><Plus className="mr-2 h-4 w-4"/>{tr("Aggiungi articolo")}</Button>
   <Button variant="ghost" size="sm" onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?tr("Nascondi storico"):tr("Mostra storico trasferimenti")}</Button>
   {historyOpen&&(history.isError?<p role="alert">{tr("Impossibile caricare lo storico.")} <Button variant="outline" onClick={()=>void history.refetch()}>{tr("Riprova storico")}</Button></p>:history.isLoading?<p role="status">{tr("Caricamento storico…")}</p>:<ul className="max-h-40 divide-y overflow-auto rounded-xl border">{(history.data??[]).length===0?<li className="p-3 text-sm text-muted-foreground">{tr("Nessun trasferimento registrato.")}</li>:(history.data??[]).map(t=><li key={t.id} className="flex justify-between gap-3 p-3 text-sm"><span>{t.from_warehouse?.name} → {t.to_warehouse?.name}</span><span>{t.status==='ricevuto'?tr("Completato"):t.status} · {new Date(t.transfer_date+'T12:00:00').toLocaleDateString(intlCampo())}</span></li>)}</ul>)}
  </>}
  {validation&&rows.length>0&&!review&&<p className="text-sm text-destructive">{validation}</p>}
  {protocol.isError&&<p role="alert" className="text-sm text-destructive">{tr("Impossibile verificare il servizio.")} <Button variant="outline" onClick={()=>void protocol.refetch()}>{tr("Riprova servizio")}</Button></p>}
  {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}{uncertain&&` ${tr("Puoi verificare l’esito ripetendo gli stessi dati, senza creare un nuovo trasferimento.")}`}</p>}
  <DialogFooter><Button variant="outline" disabled={save.isPending||uncertain} onClick={review?()=>setReview(false):()=>onOpenChange(false)}>{review?tr("Modifica trasferimento"):tr("Annulla")}</Button>{review?<Button disabled={save.isPending||(!uncertain&&!!validation)} onClick={()=>void confirm()}>{save.isPending?tr("Registrazione…"):uncertain?tr("Verifica esito trasferimento"):tr("Conferma trasferimento")}</Button>:<Button disabled={!!validation||stock.isLoading} onClick={()=>{setError(null);setReview(true);}}>{tr("Controlla trasferimento")}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}
