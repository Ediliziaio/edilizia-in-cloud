import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAROLA_CONFERMA, confermaScrittaOk, descriviTabelle } from "@/lib/orders/eliminazioneCollegamenti";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { exportToCSV, exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import { savePipelineTransition } from "@/lib/api/pipelineTransitions";
import { BULK_PHASES, executeBulkPhase, reviewBulkPhase } from "@/lib/orders/operationalBulkActions";
import type { PipelineDocument } from "@/lib/orders/pipelineTransitions";

export type DeletionKind = "oda" | "rfq" | "surveys" | "ddt";
interface Row { id: string; label: string; href?: string; phase?: PipelineDocument; values?: Record<string, string> }
interface Options { canDelete?: boolean; canChangePhase?: boolean; columns?: CsvColumn[]; filename?: string }
interface PreviewRow extends Row {
  allowed: boolean; reason: string | null; version: string;
  /** Dal 12/11/2026: cosa si sta eliminando, cosa sparisce con lui, cosa resta scollegato. */
  avviso?: string | null; cancella?: Record<string, number>; scollega?: Record<string, number>; conferma_scritta?: boolean;
}
interface Result { documents: PreviewRow[]; deleted: number }
async function call(company: string, kind: DeletionKind, ids: string[], preview: boolean, expected?: Record<string, string>, conferma?: string): Promise<Result> {
  // La parola di conferma va solo quando serve: così la chiamata resta valida anche col database di prima.
  const { data, error } = await supabase.rpc("operational_documents_delete" as never, { p_company_id: company, p_kind: kind, p_ids: ids, p_preview: preview, p_expected: expected ?? null, ...(conferma ? { p_conferma: conferma } : {}) } as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("L’eliminazione protetta richiede l’attivazione della funzione sul database. Nessun documento è stato eliminato.");
    throw new Error(error.message || "Impossibile completare l’eliminazione");
  }
  const result = data as unknown as Result;
  if (!result || !Array.isArray(result.documents) || result.documents.length !== ids.length || new Set(result.documents.map(d => d.id)).size !== ids.length || result.documents.some(d => !ids.includes(d.id) || typeof d.allowed !== "boolean" || typeof d.version !== "string") || (!preview && result.deleted !== ids.length)) throw new Error("Risposta del server incompleta: aggiorna l’elenco e ricontrolla prima di riprovare.");
  return result;
}
/** Selection is scoped to the current page/company. All mutations require an explicit review. */
export function useOperationalDeletion(kind: DeletionKind, rows: Row[], enabled: boolean, options: Options = {}) {
  const { effectiveCompany, user } = useAuth();
  const company = effectiveCompany?.id ?? "";
  const client = useQueryClient();
  const canDelete = enabled && options.canDelete !== false;
  const canChangePhase = enabled && options.canChangePhase !== false;
  const context = JSON.stringify([company, user?.id, kind, enabled, canDelete, canChangePhase, rows.map(r => r.id)]);
  const current = useRef(context);
  useLayoutEffect(() => { current.current = context; }, [context]);
  const lock = useRef(false);
  const [selection, setSelection] = useState<{ context: string; ids: Set<string> }>({ context: "", ids: new Set() });
  const selected = enabled && selection.context === context ? selection.ids : new Set<string>();
  const selectedRows = rows.filter(r => selected.has(r.id));
  const [review, setReview] = useState<{ context: string; docs: PreviewRow[] } | null>(null);
  const [message, setMessage] = useState("");
  const [parola, setParola] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailContext, setDetailContext] = useState<string | null>(null);
  const [phaseReview, setPhaseReview] = useState<{ context: string; target: string; label: string; docs: PipelineDocument[] } | null>(null);
  const [phaseSaving, setPhaseSaving] = useState(false);
  const [outcomes, setOutcomes] = useState<Awaited<ReturnType<typeof executeBulkPhase>> | null>(null);
  const dialog = review?.context === context && canDelete ? review : null;
  const phaseDialog = phaseReview?.context === context && canChangePhase ? phaseReview : null;
  const phaseKind = kind === "surveys" ? "survey" : kind;
  const refresh = () => {
    refreshMaterialQueries(client);
    void client.invalidateQueries({ predicate: q => /purchase-order|supplier-rfq|ddt|survey|sopralluog|numerazione-ordini|supplier/i.test(String(q.queryKey[0])) });
  };
  const preview = useMutation({ retry: false, mutationFn: async () => {
    if (!canDelete || !company || selected.size === 0) throw new Error("Seleziona almeno un documento");
    if (selected.size > 100) throw new Error("Puoi eliminare al massimo 100 documenti per volta");
    return { result: await call(company, kind, [...selected], true), context };
  }, onSuccess: payload => { if (payload.context !== current.current) return; setMessage(""); setParola(""); setReview({ context: payload.context, docs: payload.result.documents }); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ retry: false, mutationFn: async () => {
    if (!canDelete || !company || !dialog || dialog.docs.some(d => !d.allowed)) throw new Error("Ricontrolla i documenti selezionati");
    if (serveParola && !confermaScrittaOk(parola)) throw new Error(`Scrivi ${PAROLA_CONFERMA} per confermare`);
    return { result: await call(company, kind, dialog.docs.map(d => d.id), false, Object.fromEntries(dialog.docs.map(d => [d.id, d.version])), serveParola ? PAROLA_CONFERMA : undefined), context };
  }, onSuccess: payload => {
    if (payload.context === current.current) { setSelection({ context, ids: new Set() }); setReview(null); setMessage(""); }
    toast.success("Documenti eliminati"); refresh();
  }, onError: (e: Error) => setMessage(e.message) });
  const serveParola = !!dialog?.docs.some(d => d.conferma_scritta);
  const busy = preview.isPending || remove.isPending || phaseSaving || exporting;
  const exportSelected = async (excel: boolean) => {
    if (!enabled || busy || lock.current || !selectedRows.length) return;
    lock.current = true; setExporting(true);
    try {
      const data = selectedRows.map(r => ({ documento: r.label, ...r.values }));
      const columns = options.columns ?? [{ key: "documento", label: "Documento" }];
      const filename = `${options.filename ?? kind}-selezionati-${new Date().toISOString().slice(0, 10)}`;
      if (excel) await exportToXLSX(data, columns, `${filename}.xlsx`);
      else exportToCSV(data, columns, `${filename}.csv`);
      toast.success(`${data.length} documenti esportati`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Esportazione non riuscita"); }
    finally { lock.current = false; setExporting(false); }
  };
  const confirmPhase = async () => {
    if (!phaseDialog || !company || !user || !canChangePhase || busy || lock.current || outcomes) return;
    const checked = reviewBulkPhase(phaseKind, phaseDialog.docs, phaseDialog.target);
    if (checked.some(r => !r.plan)) return;
    lock.current = true; setPhaseSaving(true);
    try {
      const result = await executeBulkPhase(checked.map(r => r.plan!), plan => savePipelineTransition(plan, company, user.id), () => current.current === phaseDialog.context);
      const successes = result.filter(r => r.ok).length;
      if (current.current === phaseDialog.context) {
        setOutcomes(result);
        setSelection({ context, ids: new Set(result.filter(r => !r.ok).map(r => r.id)) });
      }
      if (successes === result.length) toast.success(`${successes} documenti aggiornati`);
      else toast.error(`${successes} aggiornati, ${result.length - successes} non aggiornati: controlla l’esito`);
      refresh();
    } finally { lock.current = false; setPhaseSaving(false); }
  };
  const toggle = (id: string, checked: boolean) => {
    const ids = new Set(selected); if (checked) ids.add(id); else ids.delete(id);
    setSelection({ context, ids });
  };
  const checkbox = (id: string, label: string) => <input type="checkbox" aria-label={`Seleziona ${label}`} checked={selected.has(id)} disabled={!enabled || busy} onClick={e => e.stopPropagation()} onChange={e => toggle(id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-orange-600" />;
  const all = rows.length > 0 && selected.size === rows.length;
  const header = <input type="checkbox" aria-label="Seleziona documenti di questa pagina" aria-checked={selected.size > 0 && !all ? "mixed" : all} ref={node => { if (node) node.indeterminate = selected.size > 0 && !all; }} checked={all} disabled={!enabled || !rows.length || busy} onChange={e => setSelection({ context, ids: e.target.checked ? new Set(rows.slice(0, 100).map(r => r.id)) : new Set() })} className="h-4 w-4 cursor-pointer accent-orange-600" />;
  const phases = selectedRows.every(r => r.phase) ? BULK_PHASES[phaseKind] : [];
  const toolbar = enabled && selected.size > 0 ? <div role="region" aria-label="Azioni documenti selezionati" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
    <span>{selected.size} {selected.size === 1 ? "documento selezionato" : "documenti selezionati"} nella pagina corrente</span>
    <div className="flex flex-wrap items-center gap-2">
      {selectedRows.every(r => r.href) && <Button size="sm" variant="outline" disabled={busy} onClick={() => setDetailContext(context)}>Apri dettagli</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportSelected(false)}>Esporta CSV</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportSelected(true)}>Esporta Excel</Button>
      {canChangePhase && phases.length > 0 && <select aria-label="Azione sui documenti selezionati" value="" disabled={busy} className="h-9 max-w-full rounded-md border bg-background px-3 text-xs" onChange={e => {
        const action = phases.find(p => p.target === e.target.value);
        if (action) { setOutcomes(null); setPhaseReview({ context, ...action, docs: selectedRows.map(r => r.phase!) }); }
      }}><option value="">Cambia fase…</option>{phases.map(a => <option key={a.target} value={a.target}>{a.label}</option>)}</select>}
      {canDelete && <Button size="sm" variant="destructive" disabled={busy} onClick={() => preview.mutate()}>{preview.isPending ? "Verifica collegamenti…" : "Elimina selezionati"}</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelection({ context, ids: new Set() })}>Deseleziona</Button>
    </div>
  </div> : null;
  const phaseRows = phaseDialog ? reviewBulkPhase(phaseKind, phaseDialog.docs, phaseDialog.target) : [];
  const confirmation = <>
    <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) setReview(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Elimina documenti selezionati</DialogTitle><DialogDescription>Questa eliminazione è definitiva. Controlla i numeri e i collegamenti prima di confermare.</DialogDescription></DialogHeader>
      <div className="max-h-72 overflow-auto rounded-lg border divide-y">{dialog?.docs.map(d => {
        const via = descriviTabelle(d.cancella);
        const restano = descriviTabelle(d.scollega);
        return <div key={d.id} className="space-y-0.5 p-3 text-sm">
          <p className="font-medium">{d.label}</p>
          {!d.allowed ? <p className="text-destructive">{d.reason}</p> : <>
            {d.avviso && <p className="text-amber-700">{d.avviso}</p>}
            {via && <p className="text-muted-foreground">Si cancellano con lui: {via}.</p>}
            {restano && <p className="text-muted-foreground">Restano, ma scollegati: {restano}.</p>}
            {!d.avviso && !via && !restano && <p className="text-muted-foreground">Documento eliminabile</p>}
          </>}
        </div>;
      })}</div>
      {kind === "oda" && <p className="text-xs text-muted-foreground">Gli ordini rimasti mantengono il loro numero. Si recuperano solo gli ultimi numeri delle bozze eliminate mai inviate; i numeri intermedi non fanno rinumerare gli altri ordini.</p>}
      {dialog?.docs.some(d => !d.allowed) && <p role="alert" className="text-sm text-destructive">Alcuni documenti non possono essere eliminati. Chiudi e deselezionali: nessun documento verrà cancellato con questa selezione.</p>}
      {serveParola && !dialog?.docs.some(d => !d.allowed) && <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <label htmlFor="conferma-eliminazione" className="text-sm">Ci sono documenti già partiti o collegati. Le associazioni si perdono e non si recuperano. Per confermare scrivi <strong>{PAROLA_CONFERMA}</strong>.</label>
        <Input id="conferma-eliminazione" value={parola} autoComplete="off" disabled={busy} onChange={e => setParola(e.target.value)} placeholder={PAROLA_CONFERMA} />
      </div>}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Annulla</Button><Button variant="destructive" disabled={busy || !dialog?.docs.length || dialog.docs.some(d => !d.allowed) || (serveParola && !confermaScrittaOk(parola))} onClick={() => remove.mutate()}>{remove.isPending ? "Eliminazione…" : `Elimina definitivamente ${dialog?.docs.length ?? 0} ${dialog?.docs.length === 1 ? "documento" : "documenti"}`}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!phaseDialog} onOpenChange={open => { if (!open && !phaseSaving) setPhaseReview(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{phaseDialog?.label}</DialogTitle><DialogDescription>Controlla tutti i documenti prima di confermare. Il salvataggio ricontrolla stato e permessi per ciascuno e mostra gli eventuali errori.</DialogDescription></DialogHeader>
      <div className="max-h-72 divide-y overflow-auto rounded-lg border">{outcomes ? outcomes.map(r => <div key={r.id} className="p-3 text-sm"><strong>{r.label}</strong><p className={r.ok ? "text-green-700" : "text-destructive"}>{r.ok ? "Aggiornato" : r.error}</p></div>) : phaseRows.map(r => <div key={r.document.id} className="p-3 text-sm"><strong>{r.document.label}</strong><p className={r.plan ? "text-muted-foreground" : "text-destructive"}>{r.reason}</p></div>)}</div>
      {!outcomes && phaseRows.some(r => !r.plan) && <p role="alert" className="text-sm text-destructive">La selezione comprende documenti non compatibili. Chiudi e deselezionali prima di riprovare.</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={phaseSaving} onClick={() => setPhaseReview(null)}>{outcomes ? "Chiudi" : "Annulla"}</Button>{!outcomes && <Button disabled={busy || !user || !phaseRows.length || phaseRows.some(r => !r.plan)} onClick={() => void confirmPhase()}>{phaseSaving ? "Aggiornamento…" : `Conferma su ${phaseRows.length} documenti`}</Button>}</div>
    </DialogContent></Dialog>
    <Dialog open={detailContext === context} onOpenChange={open => { if (!open) setDetailContext(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Dettagli documenti selezionati</DialogTitle><DialogDescription>Apri ciascun documento per modifiche, allegati, invii, ricezioni e altre azioni specifiche.</DialogDescription></DialogHeader><div className="max-h-72 divide-y overflow-auto rounded-lg border">{selectedRows.map(r => <a key={r.id} href={r.href} className="flex items-center justify-between gap-3 p-3 text-sm text-primary underline"><span>{r.label}</span><span>Apri dettaglio →</span></a>)}</div></DialogContent></Dialog>
  </>;
  return { enabled, checkbox, header, toolbar, confirmation };
}
