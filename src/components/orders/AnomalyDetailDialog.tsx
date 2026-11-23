import { anomalyDescription, restoreAnomalyDescription } from "@/lib/orders/anomalyDescription";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface AnomalyActor { id: string; name: string; kind: string }
interface Props { companyId: string; record: AnomalyWorkflowRecord | null; actors: AnomalyActor[]; canEdit: boolean; onClose: () => void }
function AnomalySelect({ id, value, onChange, children, invalid, describedBy }: {
  id: string; value: string; onChange: (value: string) => void; children: ReactNode; invalid?: boolean; describedBy?: string;
}) {
  return <Select value={value || "__unassigned"} onValueChange={value => onChange(value === "__unassigned" ? "" : value)}>
    <SelectTrigger id={id} className="h-10 w-full" aria-invalid={invalid} aria-describedby={describedBy}><SelectValue /></SelectTrigger>
    <SelectContent>{children}</SelectContent>
  </Select>;
}
export function AnomalyDetailDialog({ companyId, record: receivedRecord, actors, canEdit, onClose }: Props) {
  const t = useT();
  const [record] = useState(receivedRecord);
  const { user, effectiveCompany, profile } = useAuth(); const client = useQueryClient();
  const notes = record ? anomalyNotes(record) : null;
  const parsedDescription = anomalyDescription(notes?.body ?? "");
  const [draft, setDraft] = useState<AnomalyDraft>(() => ({ description: parsedDescription.detail, orderId: record?.order_id ?? "", date: record?.error_date ?? format(new Date(), "yyyy-MM-dd"), type: record?.error_type ?? "altro", category: record?.error_category ?? "altro",
    estimate: String(notes?.estimate ?? 0), status: record?.review_status ?? "aperta", priority: record ? anomalyPriority(record) : "low",
    actorKind: record?.confirmed_responsibility_kind ?? "internal", actorId: record?.confirmed_responsibility_id ?? "", actorName: record?.confirmed_responsibility_name ?? "",
    action: record?.corrective_action ?? parsedDescription.fields.find(field => field.label === "Azione correttiva")?.value ?? "", dueDate: record?.corrective_due_date ?? "", finalCost: notes?.finalCost == null ? "" : String(notes.finalCost), recovered: String(notes?.recovered ?? 0), resolution: notes?.resolution ?? "" }));
  const [customActor, setCustomActor] = useState(!!record?.confirmed_responsibility_name && !record.confirmed_responsibility_id);
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
    if (!canEdit || !user?.id || effectiveCompany?.id !== companyId) throw new Error(t("Sessione o permessi cambiati. Riapri la pagina."));
    if (!draft.description.trim()) throw new Error(t("Indica la descrizione del problema."));
    const patch = anomalyPatch(record, { ...draft, description: restoreAnomalyDescription(parsedDescription, draft.description, draft.action) }, user.id, new Date().toISOString(), [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Utente");
    if (record) {
      let query = supabase.from("order_errors").update(patch).eq("company_id", companyId).eq("id", record.id);
      // Compare the complete snapshot, including writers which do not update updated_at.
      query = record.description == null ? query.is("description", null) : query.eq("description", record.description);
      if (record.updated_at) query = query.eq("updated_at", record.updated_at);
      const { data, error } = await query.select("id").single();
      if (error || !data) throw new Error(t("Salvataggio non riuscito: verifica i permessi o ricarica la pagina, l'anomalia potrebbe essere stata modificata da un altro utente."));
    } else {
      const { error } = await supabase.from("order_errors").insert({ ...patch, company_id: companyId, order_id: draft.orderId, error_date: draft.date, error_type: draft.type, error_category: draft.category, created_by: user.id });
      if (error) throw new Error(t("Impossibile registrare l'anomalia. Verifica i dati e riprova."));
    }
  }, onSuccess: () => { refreshOrderErrorQueries(client, draft.orderId, companyId); toast.success(record ? t("Anomalia aggiornata") : t("Anomalia registrata")); onClose(); }, onError: (error: Error) => setMessage(error.message) });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent ampiezza="spazio" className="top-[50%] flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-xl p-0">
    <DialogHeader className="shrink-0 border-b px-5 py-3"><DialogTitle>{record ? t("Dettaglio anomalia") : t("Nuova anomalia")}</DialogTitle><DialogDescription>{record?.orders?.order_code || t("Registra il problema, assegna chi interviene e segui la soluzione.")}</DialogDescription></DialogHeader>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-4">
      {message && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{message}</p>}
      <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
        {!record && <div className="space-y-2"><Label htmlFor="anomaly-order">{t("Commessa")}</Label><AnomalySelect id="anomaly-order" value={draft.orderId} onChange={value => change("orderId", value)}><SelectItem value="__unassigned">{t("Scegli commessa")}</SelectItem>{orders.data?.map(o => <SelectItem key={o.id} value={o.id}>{o.order_code || o.description || o.id}</SelectItem>)}</AnomalySelect>{orders.isError && <p role="alert">{t("Commesse non disponibili.")} <button type="button" onClick={() => void orders.refetch()}>{t("Riprova")}</button></p>}</div>}
        {parsedDescription.fields.some(field => field.label !== "Azione correttiva") && <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">{parsedDescription.fields.filter(field => field.label !== "Azione correttiva").map((field, index) => <div key={index}><dt className="text-muted-foreground">{field.label}</dt><dd className="font-medium">{field.value}</dd></div>)}</dl>}
        <div className="space-y-2"><Label htmlFor="anomaly-description">{t("Problema e contesto")}</Label><Textarea id="anomaly-description" className="min-h-[84px] text-sm" rows={3} value={draft.description} onChange={e => change("description", e.target.value)} /></div>
        {!record && <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="anomaly-date">{t("Data")}</Label><Input id="anomaly-date" type="date" value={draft.date} onChange={e => change("date", e.target.value)} /></div><div><Label htmlFor="anomaly-type">{t("Sorgente")}</Label><AnomalySelect id="anomaly-type" value={draft.type} onChange={value => change("type", value)}>{["merce","fornitura","logistica","manodopera","esecuzione","altro"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</AnomalySelect></div><div><Label htmlFor="anomaly-category">{t("Causa")}</Label><AnomalySelect id="anomaly-category" value={draft.category} onChange={value => change("category", value)}>{["fornitore","misura","quantita","lavorazione","comunicazione","difetto_prodotto","difetto_materiale","danno_materiale","ritardo","altro"].map(v => <SelectItem key={v} value={v}>{v.replaceAll("_", " ")}</SelectItem>)}</AnomalySelect></div></div>}
        <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section className="space-y-3 lg:border-r lg:pr-5"><h3 className="font-semibold">{t("Chi interviene e cosa deve fare")}</h3>
          <div className="space-y-2">
            <Label htmlFor="anomaly-actor">{t("Soggetti collegati alla commessa")}</Label>
            <AnomalySelect id="anomaly-actor" invalid={draft.status === "assegnata" && !draft.actorName.trim()} describedBy="anomaly-actor-help" value={customActor ? "__custom" : draft.actorId ? `${draft.actorKind}:${draft.actorId}` : ""} onChange={value => {
              const custom = value === "__custom";
              const actor = actors.find(a => `${a.kind}:${a.id}` === value);
              setCustomActor(custom);
              setDraft(old => ({ ...old, actorKind: actor?.kind ?? "internal", actorId: actor?.id ?? "", actorName: actor?.name ?? "" }));
            }}>
              <SelectItem value="__unassigned">{t("Da assegnare")}</SelectItem>
              {draft.actorId && !actors.some(a => a.kind === draft.actorKind && a.id === draft.actorId) && <SelectItem value={`${draft.actorKind}:${draft.actorId}`}>{t("{nome} · Responsabile attuale", { nome: draft.actorName })}</SelectItem>}
              {actors.map(a => <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.name} · {t(({ employee: "Operaio", salesperson: "Venditore", supplier: "Fornitore", subcontractor: "Subappaltatore", creator: "Utente interno" } as Record<string, string>)[a.kind] || "Responsabile")}</SelectItem>)}
              <SelectItem value="__custom">{t("Altro responsabile…")}</SelectItem>
            </AnomalySelect>
            {customActor && <div className="space-y-1"><Label htmlFor="anomaly-name">{t("Responsabile effettivo")}</Label><Input id="anomaly-name" value={draft.actorName} onChange={e => change("actorName", e.target.value)} placeholder={t("Nome della persona o dell'impresa")} /></div>}
            <p id="anomaly-actor-help" className={draft.status === "assegnata" && !draft.actorName.trim() ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{draft.status === "assegnata" && !draft.actorName.trim() ? t("Scegli un responsabile per assegnare l’intervento.") : t("I soggetti collegati sono suggerimenti: conferma il responsabile dopo la verifica.")}</p>
          </div>
          <div className="space-y-2"><Label htmlFor="anomaly-action">{t("Azione correttiva")}</Label><Textarea id="anomaly-action" className="min-h-[76px]" rows={2} value={draft.action} onChange={e => change("action", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="anomaly-due">{t("Scadenza intervento")}</Label><Input id="anomaly-due" type="date" value={draft.dueDate} onChange={e => change("dueDate", e.target.value)} /></div><div><Label htmlFor="anomaly-priority">{t("Priorità operativa")}</Label><AnomalySelect id="anomaly-priority" value={draft.priority} onChange={value => { setPriorityChosen(true); change("priority", value as AnomalyPriority); }}><SelectItem value="low">{t("Minore")}</SelectItem><SelectItem value="medium">{t("Da gestire")}</SelectItem><SelectItem value="high">{t("Critica")}</SelectItem></AnomalySelect></div><div><Label htmlFor="anomaly-status">{t("Stato")}</Label><AnomalySelect id="anomaly-status" value={draft.status} onChange={value => change("status", value as AnomalyStatus)}><SelectItem value="aperta">{t("Aperta")}</SelectItem><SelectItem value="in_verifica">{t("In verifica")}</SelectItem><SelectItem value="assegnata">{t("Assegnata")}</SelectItem><SelectItem value="risolta">{t("Risolta")}</SelectItem><SelectItem value="non_imputabile">{t("Non imputabile")}</SelectItem></AnomalySelect></div></div>
        </section>
        <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t("Costi e chiusura")}</h3><output aria-label={t("Perdita prevista al salvataggio")} className="text-sm font-semibold text-red-700">{Number(draft.recovered) > Number(draft.finalCost || 0) ? t("Importi da verificare") : t(draft.finalCost.trim() === "" ? "Stima: {importo}" : "Perdita netta: {importo}", { importo: formatCurrency(draft.finalCost.trim() === "" ? Number(draft.estimate) || 0 : Math.max(0, (Number(draft.finalCost) || 0) - (Number(draft.recovered) || 0))) })}</output></div><div className="grid gap-3 sm:grid-cols-3">{([ ["estimate", "Costo stimato (€)"], ["finalCost", "Costo finale (€)"], ["recovered", "Importo recuperato (€)"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`anomaly-${key}`}>{t(label)}</Label><Input id={`anomaly-${key}`} type="number" step="0.01" min="0" aria-invalid={key === "recovered" && Number(draft.recovered) > Number(draft.finalCost || 0)} aria-describedby={key === "recovered" && Number(draft.recovered) > Number(draft.finalCost || 0) ? "anomaly-cost-error" : undefined} value={draft[key]} onChange={e => { const value = e.target.value; setDraft(old => ({ ...old, [key]: value, ...(key === "estimate" && !priorityChosen ? { priority: Number(value) >= 1000 ? "high" : Number(value) >= 300 ? "medium" : "low" } : {}) })); }} /></div>)}</div>{Number(draft.recovered) > Number(draft.finalCost || 0) && <p id="anomaly-cost-error" className="text-xs text-destructive">{t("I recuperi non possono superare il costo finale. Conferma il costo prima di indicare un recupero.")}</p>}<p className="text-xs text-muted-foreground">{t("La perdita registrata è il costo finale meno i recuperi, quando confermi il costo finale; altrimenti resta la stima. “Non imputabile” non azzera il costo.")}</p><details open={draft.status === "risolta" || draft.status === "non_imputabile" || !!draft.resolution} className="space-y-2"><summary className="cursor-pointer text-sm font-medium">{t("Soluzione e note di chiusura")}</summary><div className="space-y-2"><Label htmlFor="anomaly-resolution">{t("Soluzione o motivazione di chiusura")}</Label><Textarea id="anomaly-resolution" className="min-h-[76px]" rows={2} value={draft.resolution} onChange={e => change("resolution", e.target.value)} placeholder={t("Descrivi cosa è stato fatto o perché il caso non è imputabile")} /></div></details></section>
        </div>
      </fieldset>
      {notes?.history.length ? <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{t("Aggiornamenti registrati ({n})", { n: notes.history.length })}</summary><ol className="mt-3 space-y-2">{notes.history.map((entry, i) => <li key={i} className="break-words border-t pt-2 text-xs text-muted-foreground">{entry}</li>)}</ol></details> : <p className="text-xs text-muted-foreground">{t("Lo storico degli aggiornamenti parte dal primo salvataggio in questa gestione.")}</p>}
      <p className="text-xs text-muted-foreground">{t("Foto, allegati e documenti collegati si consultano dalla commessa.")}</p>
    </div>
    <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t bg-background px-6 py-4"><div>{record && <Button asChild variant="outline"><Link to={`/azienda/ordini/${record.order_id}`}>{t("Apri commessa e documenti")}</Link></Button>}</div><div className="flex gap-2"><Button variant="outline" disabled={save.isPending} onClick={onClose}>{t("Chiudi")}</Button>{canEdit && <Button disabled={save.isPending} onClick={() => { setMessage(""); save.mutate(); }}>{save.isPending ? t("Salvataggio…") : t("Salva anomalia")}</Button>}</div></div>
  </DialogContent></Dialog>;
}
