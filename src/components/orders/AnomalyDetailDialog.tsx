import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { anomalyNotes, anomalyPriority, anomalyPatch, type AnomalyWorkflowRecord, type AnomalyDraft, type AnomalyStatus, type AnomalyPriority } from "@/lib/orders/anomalyWorkflow";
import { refreshOrderErrorQueries } from "@/lib/orders/refreshOrderErrorQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface AnomalyActor { id: string; name: string; kind: string }
interface Props { companyId: string; record: AnomalyWorkflowRecord | null; actors: AnomalyActor[]; canEdit: boolean; onClose: () => void }
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
export function AnomalyDetailDialog({ companyId, record: receivedRecord, actors, canEdit, onClose }: Props) {
  const [record] = useState(receivedRecord);
  const { user, effectiveCompany, profile } = useAuth(); const client = useQueryClient();
  const notes = record ? anomalyNotes(record) : null;
  const [draft, setDraft] = useState<AnomalyDraft>(() => ({ description: notes?.body ?? "", orderId: record?.order_id ?? "", date: record?.error_date ?? format(new Date(), "yyyy-MM-dd"), type: record?.error_type ?? "altro", category: record?.error_category ?? "altro",
    estimate: String(notes?.estimate ?? 0), status: record?.review_status ?? "aperta", priority: record ? anomalyPriority(record) : "low",
    actorKind: record?.confirmed_responsibility_kind ?? "internal", actorId: record?.confirmed_responsibility_id ?? "", actorName: record?.confirmed_responsibility_name ?? "",
    action: record?.corrective_action ?? "", dueDate: record?.corrective_due_date ?? "", finalCost: notes?.finalCost == null ? "" : String(notes.finalCost), recovered: String(notes?.recovered ?? 0), resolution: notes?.resolution ?? "" }));
  const [priorityChosen, setPriorityChosen] = useState(!!record);
  const [message, setMessage] = useState("");
  const change = <K extends keyof AnomalyDraft>(key: K, value: AnomalyDraft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const orders = useQuery({ queryKey: ["anomaly-order-options", companyId], enabled: !record, queryFn: async () => {
    const result: Array<{ id: string; order_code: string | null; description: string | null }> = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabase.from("orders").select("id,order_code,description").eq("company_id", companyId).is("deleted_at", null).order("id").range(start, start + 499);
      if (error) throw error; result.push(...(data ?? [])); if ((data?.length ?? 0) < 500) return result;
    }
  } });
  const save = useMutation({ mutationFn: async () => {
    if (!canEdit || !user?.id || effectiveCompany?.id !== companyId) throw new Error("Sessione o permessi cambiati. Riapri la pagina.");
    const patch = anomalyPatch(record, draft, user.id, new Date().toISOString(), [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Utente");
    if (record) {
      let query = supabase.from("order_errors").update(patch).eq("company_id", companyId).eq("id", record.id);
      // Compare the complete snapshot, including writers which do not update updated_at.
      query = record.description == null ? query.is("description", null) : query.eq("description", record.description);
      if (record.updated_at) query = query.eq("updated_at", record.updated_at);
      const { data, error } = await query.select("id").single();
      if (error || !data) throw new Error("Salvataggio non riuscito: verifica i permessi o ricarica la pagina, l'anomalia potrebbe essere stata modificata da un altro utente.");
    } else {
      const { error } = await supabase.from("order_errors").insert({ ...patch, company_id: companyId, order_id: draft.orderId, error_date: draft.date, error_type: draft.type, error_category: draft.category, created_by: user.id });
      if (error) throw new Error("Impossibile registrare l'anomalia. Verifica i dati e riprova.");
    }
  }, onSuccess: () => { refreshOrderErrorQueries(client, draft.orderId, companyId); toast.success(record ? "Anomalia aggiornata" : "Anomalia registrata"); onClose(); }, onError: (error: Error) => setMessage(error.message) });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
    <DialogHeader className="shrink-0 border-b px-6 py-5"><DialogTitle>{record ? "Dettaglio anomalia" : "Nuova anomalia"}</DialogTitle><DialogDescription>{record?.orders?.order_code || "Registra il problema, assegna chi interviene e segui la soluzione."}</DialogDescription></DialogHeader>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {message && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{message}</p>}
      <fieldset disabled={!canEdit || save.isPending} className="space-y-5">
        {!record && <div className="space-y-2"><Label htmlFor="anomaly-order">Commessa</Label><select id="anomaly-order" className={selectClass} value={draft.orderId} onChange={e => change("orderId", e.target.value)}><option value="">Scegli commessa</option>{orders.data?.map(o => <option key={o.id} value={o.id}>{o.order_code || o.description || o.id}</option>)}</select>{orders.isError && <p role="alert">Commesse non disponibili. <button type="button" onClick={() => void orders.refetch()}>Riprova</button></p>}</div>}
        <div className="space-y-2"><Label htmlFor="anomaly-description">Problema e contesto</Label><Textarea id="anomaly-description" rows={3} value={draft.description} onChange={e => change("description", e.target.value)} /></div>
        {!record && <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="anomaly-date">Data</Label><Input id="anomaly-date" type="date" value={draft.date} onChange={e => change("date", e.target.value)} /></div><div><Label htmlFor="anomaly-type">Sorgente</Label><select id="anomaly-type" className={selectClass} value={draft.type} onChange={e => change("type", e.target.value)}>{["merce","fornitura","logistica","manodopera","esecuzione","altro"].map(v => <option key={v} value={v}>{v}</option>)}</select></div><div><Label htmlFor="anomaly-category">Causa</Label><select id="anomaly-category" className={selectClass} value={draft.category} onChange={e => change("category", e.target.value)}>{["fornitore","misura","quantita","lavorazione","comunicazione","difetto_prodotto","difetto_materiale","danno_materiale","ritardo","altro"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></div></div>}
        <section className="space-y-3 rounded-xl border bg-muted/20 p-4"><h3 className="font-semibold">Chi interviene e cosa deve fare</h3>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="anomaly-actor">Soggetti collegati alla commessa</Label><select id="anomaly-actor" className={selectClass} value={actors.some(a => a.kind === draft.actorKind && a.id === draft.actorId) ? `${draft.actorKind}:${draft.actorId}` : ""} onChange={e => { const actor = actors.find(a => `${a.kind}:${a.id}` === e.target.value); setDraft(old => ({ ...old, actorKind: actor?.kind ?? "internal", actorId: actor?.id ?? "", actorName: actor?.name ?? "" })); }}><option value="">Da assegnare / altro responsabile</option>{actors.map(a => <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.name} · {({ employee: "Operaio", salesperson: "Venditore", supplier: "Fornitore", subcontractor: "Subappaltatore", creator: "Utente interno" } as Record<string, string>)[a.kind] || "Responsabile"}</option>)}</select><p className="text-xs text-muted-foreground">I collegamenti sono suggerimenti: seleziona il responsabile solo dopo la verifica.</p></div><div className="space-y-2"><Label htmlFor="anomaly-name">Responsabile effettivo</Label><Input id="anomaly-name" value={draft.actorName} onChange={e => setDraft(old => ({ ...old, actorName: e.target.value, actorId: "", actorKind: "internal" }))} placeholder="Nome della persona o dell'impresa" /></div></div>
          <div className="space-y-2"><Label htmlFor="anomaly-action">Azione correttiva</Label><Textarea id="anomaly-action" rows={2} value={draft.action} onChange={e => change("action", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="anomaly-due">Scadenza intervento</Label><Input id="anomaly-due" type="date" value={draft.dueDate} onChange={e => change("dueDate", e.target.value)} /></div><div><Label htmlFor="anomaly-priority">Priorità operativa</Label><select id="anomaly-priority" className={selectClass} value={draft.priority} onChange={e => { setPriorityChosen(true); change("priority", e.target.value as AnomalyPriority); }}><option value="low">Minore</option><option value="medium">Da gestire</option><option value="high">Critica</option></select></div><div><Label htmlFor="anomaly-status">Stato</Label><select id="anomaly-status" className={selectClass} value={draft.status} onChange={e => change("status", e.target.value as AnomalyStatus)}><option value="aperta">Aperta</option><option value="in_verifica">In verifica</option><option value="assegnata">Assegnata</option><option value="risolta">Risolta</option><option value="non_imputabile">Non imputabile</option></select></div></div>
        </section>
        <section className="space-y-3"><h3 className="font-semibold">Costi e chiusura</h3><div className="grid gap-3 sm:grid-cols-3">{([ ["estimate", "Costo stimato (€)"], ["finalCost", "Costo finale (€)"], ["recovered", "Importo recuperato (€)"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`anomaly-${key}`}>{label}</Label><Input id={`anomaly-${key}`} type="number" step="0.01" min="0" value={draft[key]} onChange={e => { const value = e.target.value; setDraft(old => ({ ...old, [key]: value, ...(key === "estimate" && !priorityChosen ? { priority: Number(value) >= 1000 ? "high" : Number(value) >= 300 ? "medium" : "low" } : {}) })); }} /></div>)}</div><p className="text-xs text-muted-foreground">La perdita registrata è il costo finale meno i recuperi, quando confermi il costo finale; altrimenti resta la stima. “Non imputabile” non azzera il costo.</p><div className="space-y-2"><Label htmlFor="anomaly-resolution">Soluzione o motivazione di chiusura</Label><Textarea id="anomaly-resolution" value={draft.resolution} onChange={e => change("resolution", e.target.value)} placeholder="Descrivi cosa è stato fatto o perché il caso non è imputabile" /></div></section>
      </fieldset>
      {notes?.history.length ? <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Aggiornamenti registrati ({notes.history.length})</summary><ol className="mt-3 space-y-2">{notes.history.map((entry, i) => <li key={i} className="break-words border-t pt-2 text-xs text-muted-foreground">{entry}</li>)}</ol></details> : <p className="text-xs text-muted-foreground">Lo storico degli aggiornamenti parte dal primo salvataggio in questa gestione.</p>}
      <p className="text-xs text-muted-foreground">Foto, allegati e documenti collegati si consultano dalla commessa.</p>
    </div>
    <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t bg-background px-6 py-4"><div>{record && <Button asChild variant="outline"><Link to={`/azienda/ordini/${record.order_id}`}>Apri commessa e documenti</Link></Button>}</div><div className="flex gap-2"><Button variant="outline" disabled={save.isPending} onClick={onClose}>Chiudi</Button>{canEdit && <Button disabled={save.isPending} onClick={() => { setMessage(""); save.mutate(); }}>{save.isPending ? "Salvataggio…" : "Salva anomalia"}</Button>}</div></div>
  </DialogContent></Dialog>;
}
