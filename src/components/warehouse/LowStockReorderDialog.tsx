import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useWarehouseOperation, useWarehouseProtocol, type ReorderCandidate } from '@/hooks/warehouse/useWarehouseOperations';
import { warehouseRpc, movementOutcomeUnknown } from '@/lib/magazzino/protocolloMovimenti';
import { leggiQuantitaNonNegativa, formattaQuantitaMovimento as fmt } from '@/lib/magazzino/quantitaMovimento';
import { unitaConsumoConfrontabile } from '@/lib/distinta/consumiMateriali';
import { formatCurrency } from '@/lib/formatters';
import { useWarehouses } from '@/hooks/useWarehouses';
interface Props {open:boolean;onOpenChange:(value:boolean)=>void;companyId:string;readOnly?:boolean;warehouseId?:string|null;articoliVisibili?:Set<string>|null}
interface Review {supplierId:string;name:string;warehouseId:string|null;rows:(ReorderCandidate&{quantity:number})[]}
interface Receipt {purchase_order_id:string|null;oda_number:string|null;righe:number;gia_in_ordine:{nome:string;oda_number:string}[]}
export function LowStockReorderDialog(props:Props){return props.open?<ReorderSession key={`${props.companyId}:${props.warehouseId??'all'}`} {...props}/>:null;}
function ReorderSession({onOpenChange,companyId,readOnly=false,warehouseId=null,articoliVisibili=null}:Props){
 const permissions=usePermissions();const canWrite=!readOnly&&!permissions.isLoading&&permissions.canEditWarehouse&&permissions.canManagePurchasing;
 const showCosts=!permissions.isLoading&&permissions.canViewCosts;const {warehouses}=useWarehouses();
 const protocol=useWarehouseProtocol(companyId);const v3=!!protocol.data?.reorder;const save=useWarehouseOperation('reorder');const flight=useRef(false);
 const [quantities,setQuantities]=useState<Record<string,string>>({});const [review,setReview]=useState<Review|null>(null);const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [error,setError]=useState<string|null>(null);const [uncertain,setUncertain]=useState(false);
 const candidates=useQuery({queryKey:['warehouse','reorder-preview',companyId,warehouseId,protocol.data?.version,showCosts],enabled:!!protocol.data,retry:false,staleTime:0,queryFn:async():Promise<ReorderCandidate[]>=>{
  if(v3){const r=await warehouseRpc('warehouse_reorder_preview_v3',{p_company_id:companyId,p_warehouse_id:warehouseId});if(r.error)throw r.error;return r.data as ReorderCandidate[];}
  const r=await warehouseRpc('get_low_stock_alerts',{p_company_id:companyId});if(r.error)throw r.error;
  const alerts=r.data as {stock_item_id:string;name:string;quantity_available:number;min_stock_level:number;deficit:number;supplier_name:string|null}[];
  if(!alerts.length)return [];
  const meta=await supabase.from('warehouse_stock').select(`id,supplier_id,warehouse_id,unita_misura,tracking_mode${showCosts?',unit_cost':''}`).eq('company_id',companyId).in('id',alerts.map(a=>a.stock_item_id));if(meta.error)throw meta.error;
  const map=new Map((meta.data as unknown as {id:string;supplier_id:string|null;warehouse_id:string|null;unita_misura:string|null;tracking_mode:string;unit_cost?:number}[]).map(s=>[s.id,s]));
  return alerts.map(a=>{const s=map.get(a.stock_item_id);return {stockItemId:a.stock_item_id,name:a.name,warehouseId:s?.warehouse_id??null,unit:s?.unita_misura??null,tracking:s?.tracking_mode??'fungible',available:Number(a.quantity_available),reserved:0,minLevel:Number(a.min_stock_level),incoming:0,deficit:Number(a.deficit),suggested:Math.ceil(Number(a.deficit)),supplierId:s?.supplier_id??null,supplierName:a.supplier_name,unitCost:s?.unit_cost??null};});
 }});
 const rows=(candidates.data??[]).filter(r=>(!warehouseId||r.warehouseId===warehouseId)&&(!articoliVisibili||articoliVisibili.has(r.stockItemId)));
 const groups=new Map<string,{supplierId:string|null;name:string;warehouseId:string|null;rows:ReorderCandidate[]}>();
 for(const row of rows){const key=`${row.supplierId}:${row.warehouseId}`;if(!groups.has(key))groups.set(key,{supplierId:row.supplierId,name:row.supplierName||'Senza fornitore',warehouseId:row.warehouseId,rows:[]});groups.get(key)!.rows.push(row);}
 const value=(row:ReorderCandidate)=>quantities[row.stockItemId]??String(row.suggested);
 const amount=(row:ReorderCandidate)=>leggiQuantitaNonNegativa(value(row));
 const valid=(row:ReorderCandidate)=>{const q=amount(row);return q!==null&&((v3&&row.tracking!=='serialized'&&unitaConsumoConfrontabile(row.unit)!=='pz')||Number.isInteger(q));};
 function prepare(group:NonNullable<ReturnType<typeof groups.get>>){
  if(!group.supplierId||!canWrite||group.rows.some(r=>!valid(r)))return;
  const proposed=group.rows.filter(r=>r.deficit>0&&(amount(r)??0)>0).map(r=>({...r,quantity:amount(r)!}));
  if(!proposed.length)return;setError(null);setReview({supplierId:group.supplierId,name:group.name,warehouseId:group.warehouseId,rows:proposed});
 }
 async function confirm(){if(!review||flight.current||save.isPending||!canWrite)return;flight.current=true;setError(null);
  try {const result=await save.mutateAsync({rpc:v3?'warehouse_reorder_v3':'magazzino_riordina',legacy:!v3,payload:{p_company_id:companyId,p_supplier_id:review.supplierId,...(v3?{p_lines:review.rows.map(r=>({stock_item_id:r.stockItemId,quantity:r.quantity,...(r.updatedAt?{expected_updated_at:r.updatedAt}:{})}))}:{p_righe:review.rows.map(r=>({stock_item_id:r.stockItemId,quantity:r.quantity}))}),p_warehouse_id:review.warehouseId}});
   setReceipt(result as Receipt);setUncertain(false);setQuantities({});void candidates.refetch();
  }catch(e){setError((e as Error).message);setUncertain(v3&&movementOutcomeUnknown(e));}finally{flight.current=false;}
 }
 const total=review&&review.rows.every(r=>r.unitCost!==null&&!r.pricePending)?review.rows.reduce((sum,r)=>sum+r.quantity*(r.unitCost??0),0):null;
 return <Dialog open onOpenChange={v=>{if(!save.isPending)onOpenChange(v);}}><DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
  <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5"/>{receipt?'Riordino registrato':review?'Conferma riordino':'Riordina sotto scorta'}</DialogTitle><DialogDescription>Quantità disponibili, soglia e arrivi già ordinati restano distinti. La conferma crea solo una bozza ODA, senza inviarla al fornitore.</DialogDescription></DialogHeader>
  {receipt?<div className="space-y-3 rounded-xl border p-4"><p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5"/>{receipt.oda_number?`Bozza ${receipt.oda_number}`:'Nessun nuovo ordine necessario'}</p><p className="text-sm">{receipt.righe} righe create. La giacenza non cambia fino alla ricezione della merce.</p>{receipt.gia_in_ordine.length>0&&<ul className="space-y-1 text-sm">{receipt.gia_in_ordine.map((r,i)=><li key={i}>{r.nome}: già nell’ordine {r.oda_number}.</li>)}</ul>}{receipt.purchase_order_id&&<Button asChild variant="outline"><a href={`/azienda/ordini-acquisto/${receipt.purchase_order_id}`}>Apri bozza ODA</a></Button>}</div>:review?<>
   <dl className="grid gap-3 rounded-xl bg-eic-navy-deep p-4 text-white sm:grid-cols-3"><div><dt className="text-xs text-blue-100">Fornitore</dt><dd className="mt-1 font-semibold">{review.name}</dd></div><div><dt className="text-xs text-blue-100">Destinazione</dt><dd className="mt-1 font-semibold">{warehouses.find(w=>w.id===review.warehouseId)?.name??'Da verificare'}</dd></div><div><dt className="text-xs text-blue-100">Stato ordine</dt><dd className="mt-1 font-semibold">Bozza · nessun invio</dd></div></dl>
   <ul className="divide-y rounded-xl border">{review.rows.map(r=><li key={r.stockItemId} className="flex justify-between gap-3 p-3"><div><strong>{r.name}</strong><p className="text-xs text-muted-foreground">Disponibili {fmt(r.available)} · In bozze / ordini {fmt(r.incoming)} · Minimo {fmt(r.minLevel)}</p></div><strong>{fmt(r.quantity)} {r.unit}</strong></li>)}</ul>
   {showCosts&&<p className="text-right text-sm">Imponibile indicativo: <strong>{total===null?'Prezzi da verificare':formatCurrency(total)}</strong></p>}
   <p className="text-sm text-muted-foreground">Verifica eventuali confezioni e minimi del fornitore. Un altro riordino già aperto per lo stesso articolo viene segnalato dal servizio e non duplicato.</p>
  </>:protocol.isError||candidates.isError?<p role="alert" className="text-sm text-destructive">Impossibile verificare il fabbisogno. <Button variant="outline" onClick={()=>{void protocol.refetch();void candidates.refetch();}}>Riprova riordino</Button></p>:!candidates.data?<p role="status">Verifica giacenze e ordini aperti…</p>:rows.length===0?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun articolo sotto la soglia nel magazzino selezionato.</p>:<div className="space-y-4">{[...groups].map(([key,group])=>{
   const canPrepare=canWrite&&!!group.supplierId&&group.rows.every(valid)&&group.rows.some(r=>r.deficit>0&&(amount(r)??0)>0);
   return <section key={key} className="overflow-hidden rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4"/>{group.name}</h3><p className="mt-1 text-xs text-muted-foreground">{warehouses.find(w=>w.id===group.warehouseId)?.name??'Magazzino da verificare'}</p></div><Button size="sm" disabled={!canPrepare} onClick={()=>prepare(group)}>Controlla riordino</Button></div>
   <ul className="divide-y">{group.rows.map(row=><li key={row.stockItemId} className="space-y-2 p-3"><div className="flex items-center justify-between gap-3"><div><strong className="text-sm">{row.name}</strong><p className="text-xs text-muted-foreground">Disponibili {fmt(row.available)} {row.unit} · Minimo {fmt(row.minLevel)} · In bozze / ordini {fmt(row.incoming)}</p></div><label className="flex items-center gap-2 text-xs">Ordina<Input aria-label={`Quantità da ordinare ${row.name}`} inputMode="decimal" className="w-24" value={value(row)} onChange={e=>setQuantities(old=>({...old,[row.stockItemId]:e.target.value}))} disabled={!canWrite||!group.supplierId||row.deficit<=0}/>{row.unit}</label></div>{row.deficit<=0?<p className="text-xs text-emerald-700">Fabbisogno coperto dagli ordini aperti.</p>:<p className="text-xs text-muted-foreground">Da coprire: {fmt(row.deficit)} {row.unit}.</p>}{!valid(row)&&<p role="alert" className="text-xs text-destructive">Inserisci una quantità valida{!v3||row.tracking==='serialized'||unitaConsumoConfrontabile(row.unit)==='pz'?' in unità intere':''}. Nessun valore viene troncato.</p>}{!group.supplierId&&<p className="text-xs text-amber-700">Assegna prima un fornitore alla scheda dell’articolo.</p>}</li>)}</ul></section>;
  })}</div>}
  {!canWrite&&<p role="alert" className="text-sm text-destructive">Per riordinare servono i permessi di modifica del magazzino e gestione acquisti.</p>}
  {error&&<p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error} Le quantità sono conservate.</p>}
  <DialogFooter><Button variant="outline" disabled={save.isPending||uncertain} onClick={receipt?()=>{setReceipt(null);setReview(null);}:review?()=>setReview(null):()=>onOpenChange(false)}>{receipt?'Torna al riordino':review?'Modifica riordino':'Chiudi'}</Button>{review&&!receipt&&<Button disabled={save.isPending||!canWrite} onClick={()=>void confirm()}>{save.isPending?'Creazione…':uncertain?'Verifica esito riordino':'Crea ODA in bozza'}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}
