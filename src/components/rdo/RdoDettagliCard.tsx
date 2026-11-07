import type {TablesUpdate} from "@/integrations/supabase/types";
import {useState,type FormEvent} from "react";
import {Pencil,Save,Loader2,CalendarClock} from "lucide-react";
import {QuoteCard} from "@/components/marketing/preventivi/ui/builderUI";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {CommessaCombobox} from "@/components/orders/CommessaCombobox";
import type {SupplierRfq} from "@/hooks/useSupplierRfqs";
import {dataIt} from "@/lib/documentiOperativi/modello";
type Props={rfq:SupplierRfq;disabled:boolean;onSave:(updates:TablesUpdate<"supplier_rfqs">)=>Promise<unknown>;onEditingChange:(editing:boolean)=>void};
export function RdoDettagliCard({rfq,disabled,onSave,onEditingChange}:Props){
 const [editing,setEditing]=useState(false);
 const toggle=(v:boolean)=>{setEditing(v);onEditingChange(v);};
 return <QuoteCard title="Dettagli richiesta" icon={<CalendarClock className="h-4 w-4"/>} action={!disabled && !editing && <Button variant="outline" size="sm" onClick={()=>toggle(true)}><Pencil className="mr-1 h-3.5 w-3.5"/>Modifica dettagli</Button>}>
 {editing ? <RdoForm rfq={rfq} onSave={async patch=>{await onSave(patch);toggle(false);}} onCancel={()=>toggle(false)}/> : <><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div><dt className="text-xs text-slate-500">Commessa (facoltativa)</dt><dd className="mt-1 text-sm font-medium">{rfq.orders?.order_code || "Magazzino / materiali di consumo"}</dd></div><div><dt className="text-xs text-slate-500">Materiale necessario entro</dt><dd className="mt-1 text-sm font-medium">{dataIt(rfq.data_fabbisogno) || "Da indicare"}</dd></div><div><dt className="text-xs text-slate-500">Scadenza offerte</dt><dd className="mt-1 text-sm font-medium">{dataIt(rfq.scadenza_offerte) || "Da indicare"}</dd></div></dl>{rfq.descrizione && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{rfq.descrizione}</p>}{rfq.note && <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Note per i fornitori</p><p className="mt-1 whitespace-pre-wrap text-sm">{rfq.note}</p></div>}</>}
 </QuoteCard>;
}
function RdoForm({rfq,onSave,onCancel}:{rfq:SupplierRfq;onSave:Props["onSave"];onCancel:()=>void}){
 const [d,setD]=useState(()=>({titolo:rfq.titolo,descrizione:rfq.descrizione || "",note:rfq.note || "",data_fabbisogno:rfq.data_fabbisogno || "",scadenza_offerte:rfq.scadenza_offerte || "",order_id:rfq.order_id}));
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;if(!d.titolo.trim()){setError("Inserisci il titolo della richiesta.");return;}setBusy(true);setError(null);try{await onSave({...d,titolo:d.titolo.trim(),descrizione:d.descrizione.trim() || null,note:d.note.trim() || null,data_fabbisogno:d.data_fabbisogno || null,scadenza_offerte:d.scadenza_offerte || null});}catch{setError("Richiesta non salvata. Le modifiche restano qui: riprova.");setBusy(false);}};
 return <form onSubmit={save}><fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="rdo-titolo">Titolo richiesta</Label><Input id="rdo-titolo" required value={d.titolo} onChange={e=>setD({...d,titolo:e.target.value})}/></div><div><Label>Commessa (facoltativa)</Label><CommessaCombobox value={d.order_id} onChange={order_id=>setD({...d,order_id})} nessunaLabel="Magazzino / materiali di consumo"/></div><div><Label htmlFor="rdo-fabbisogno">Materiale necessario entro</Label><Input id="rdo-fabbisogno" type="date" value={d.data_fabbisogno} onChange={e=>setD({...d,data_fabbisogno:e.target.value})}/></div><div><Label htmlFor="rdo-scadenza">Scadenza offerte</Label><Input id="rdo-scadenza" type="date" value={d.scadenza_offerte} onChange={e=>setD({...d,scadenza_offerte:e.target.value})}/></div></div><div><Label htmlFor="rdo-descrizione">Descrizione della richiesta</Label><Textarea id="rdo-descrizione" value={d.descrizione} onChange={e=>setD({...d,descrizione:e.target.value})}/></div><div><Label htmlFor="rdo-note">Note per i fornitori</Label><Textarea id="rdo-note" value={d.note} onChange={e=>setD({...d,note:e.target.value})}/></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button><Button type="submit">{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Save className="mr-1.5 h-4 w-4"/>}Salva richiesta</Button></div></fieldset></form>;
}
