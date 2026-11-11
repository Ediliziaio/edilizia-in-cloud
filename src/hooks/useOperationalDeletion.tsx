import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
export type DeletionKind = "oda" | "rfq" | "surveys" | "ddt";
interface Row { id: string; label: string }
interface PreviewRow extends Row { allowed: boolean; reason: string | null; version: string }
interface Result { documents: PreviewRow[]; deleted: number }
async function call(company: string, kind: DeletionKind, ids: string[], preview: boolean, expected?: Record<string, string>): Promise<Result> {
  const { data, error } = await supabase.rpc("operational_documents_delete" as never, { p_company_id: company, p_kind: kind, p_ids: ids, p_preview: preview, p_expected: expected ?? null } as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("L’eliminazione protetta richiede l’attivazione della funzione sul database. Nessun documento è stato eliminato.");
    throw new Error(error.message || "Impossibile completare l’eliminazione");
  }
  const result = data as unknown as Result;
  if (!result || !Array.isArray(result.documents) || result.documents.length !== ids.length || new Set(result.documents.map(d => d.id)).size !== ids.length || result.documents.some(d => !ids.includes(d.id) || typeof d.allowed !== "boolean" || typeof d.version !== "string") || (!preview && result.deleted !== ids.length)) throw new Error("Risposta del server incompleta: aggiorna l’elenco e ricontrolla prima di riprovare.");
  return result;
}
/** Selection is scoped to the current page and company; hidden rows cannot be deleted accidentally. */
export function useOperationalDeletion(kind: DeletionKind, rows: Row[], enabled: boolean) {
  const { effectiveCompany } = useAuth(); const company = effectiveCompany?.id ?? "";
  const client = useQueryClient();
  const context = JSON.stringify([company, enabled, rows.map(r => r.id)]);
  const [selection, setSelection] = useState<{ context: string; ids: Set<string> }>({ context: "", ids: new Set() });
  const selected = enabled && selection.context === context ? selection.ids : new Set<string>();
  const [review, setReview] = useState<{ context: string; docs: PreviewRow[] } | null>(null);
  const [message, setMessage] = useState("");
  const dialog = review?.context === context ? review : null;
  const preview = useMutation({ mutationFn: async () => {
    if (!enabled || !company || selected.size === 0) throw new Error("Seleziona almeno un documento");
    if (selected.size > 100) throw new Error("Puoi eliminare al massimo 100 documenti per volta");
    return { result: await call(company, kind, [...selected], true), context };
  }, onSuccess: payload => { if (payload.context !== context) return; setMessage(""); setReview({ context, docs: payload.result.documents }); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: async () => {
    if (!enabled || !company || !dialog || dialog.docs.some(d => !d.allowed)) throw new Error("Ricontrolla i documenti selezionati");
    return { result: await call(company, kind, dialog.docs.map(d => d.id), false, Object.fromEntries(dialog.docs.map(d => [d.id, d.version]))), context };
  }, onSuccess: payload => {
    if (payload.context === context) {
    setSelection({ context, ids: new Set() });setReview(null);setMessage(""); }
    toast.success("Documenti eliminati"); refreshMaterialQueries(client);
    void client.invalidateQueries({ predicate: q => /purchase-order|supplier-rfq|ddt|survey|sopralluog|numerazione-ordini|supplier/i.test(String(q.queryKey[0])) });
  }, onError: (e: Error) => setMessage(e.message) });
  const busy = preview.isPending || remove.isPending;
  const toggle = (id: string, checked: boolean) => {
    const ids = new Set(selected); if (checked) ids.add(id); else ids.delete(id);
    setSelection({ context, ids });
  };
  const checkbox = (id: string, label: string) => <input type="checkbox" aria-label={`Seleziona ${label}`} checked={selected.has(id)} disabled={!enabled || busy} onClick={e => e.stopPropagation()} onChange={e => toggle(id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-orange-600" />;
  const all = rows.length > 0 && selected.size === rows.length;
  const header = <input type="checkbox" aria-label="Seleziona documenti di questa pagina" aria-checked={selected.size > 0 && !all ? "mixed" : all} ref={node => { if (node) node.indeterminate = selected.size > 0 && !all; }} checked={all} disabled={!enabled || !rows.length || busy} onChange={e => setSelection({ context, ids: e.target.checked ? new Set(rows.slice(0, 100).map(r => r.id)) : new Set() })} className="h-4 w-4 cursor-pointer accent-orange-600" />;
  const toolbar = enabled && selected.size > 0 ? <div role="region" aria-label="Azioni documenti selezionati" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm"><span>{selected.size} {selected.size === 1 ? "documento selezionato" : "documenti selezionati"} nella pagina corrente</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setSelection({ context, ids: new Set() })}>Deseleziona</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => preview.mutate()}>{preview.isPending ? "Verifica collegamenti…" : "Elimina selezionati"}</Button></div></div> : null;
  const confirmation = <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) setReview(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Elimina documenti selezionati</DialogTitle><DialogDescription>Questa eliminazione è definitiva. Controlla i numeri e i collegamenti prima di confermare.</DialogDescription></DialogHeader>
    <div className="max-h-64 overflow-auto rounded-lg border divide-y">{dialog?.docs.map(d => <div key={d.id} className="p-3 text-sm"><p className="font-medium">{d.label}</p><p className={d.allowed ? "text-muted-foreground" : "text-destructive"}>{d.allowed ? "Bozza eliminabile" : d.reason}</p></div>)}</div>
    {kind === "oda" && <p className="text-xs text-muted-foreground">Gli ordini rimasti mantengono il loro numero. Si recuperano solo gli ultimi numeri delle bozze eliminate mai inviate; i numeri intermedi non fanno rinumerare gli altri ordini.</p>}
    {dialog?.docs.some(d => !d.allowed) && <p role="alert" className="text-sm text-destructive">Alcuni documenti non possono essere eliminati. Chiudi e deselezionali: nessun documento verrà cancellato con questa selezione.</p>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Annulla</Button><Button variant="destructive" disabled={busy || !dialog?.docs.length || dialog.docs.some(d => !d.allowed)} onClick={() => remove.mutate()}>{remove.isPending ? "Eliminazione…" : `Elimina definitivamente ${dialog?.docs.length ?? 0} ${dialog?.docs.length === 1 ? "documento" : "documenti"}`}</Button></div>
  </DialogContent></Dialog>;
  return { enabled, checkbox, header, toolbar, confirmation };
}
