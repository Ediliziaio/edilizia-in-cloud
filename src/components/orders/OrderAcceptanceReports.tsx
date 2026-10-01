import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Plus,
  FileText,
  LockKeyhole,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { AcceptanceTaskActions } from "./AcceptanceTaskActions";
import {
  emptyAcceptance,
  validateAcceptance,
  outcomes,
  results,
  type AcceptanceContent,
} from "../../../supabase/functions/collaudo-commessa/model";

interface Report {
  id: string;
  version: number;
  content: AcceptanceContent;
  status: "draft" | "finalized";
  document_hash: string | null;
  pdf_path: string | null;
  created_at: string;
}
interface Props {
  orderId: string;
  companyId: string;
  customer?: string;
  onOpenTasks?: () => void;
}
const today = () => new Date().toLocaleDateString("en-CA");
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function OrderAcceptanceReports({
  orderId,
  companyId,
  customer = "",
  onOpenTasks,
}: Props) {
  const qc = useQueryClient();
  const { canEditOrders } = usePermissions();
  const key = ["order-acceptance-reports", companyId, orderId];
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [content, setContent] = useState<AcceptanceContent>(() =>
    emptyAcceptance(today()),
  );
  const [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(false);
  const previewBlob = useCallback(async () => {
    if (!preview) throw new Error("Apri prima il PDF");
    const response = await fetch(preview, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        "Anteprima scaduta o non disponibile. Premi Apri PDF per rinnovarla.",
      );
    return URL.createObjectURL(await response.blob());
  }, [preview]);
  useEffect(() => {
    setOpen(false);
    setReport(null);
    setPreview(null);
  }, [orderId, companyId]);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_acceptance_reports")
        .select("*")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Report[];
    },
    enabled: !!companyId && !!orderId,
  });
  const readonly = !canEditOrders || report?.status === "finalized";
  const errors = validateAcceptance(content, true);
  const edit = (next: AcceptanceContent) => {
    setContent(next);
    setDirty(true);
    setPreview(null);
    setReviewed(false);
  };
  const start = (row: Report | null) => {
    setReport(row);
    setContent(
      row
        ? structuredClone(row.content)
        : { ...emptyAcceptance(today()), customer },
    );
    setDirty(!row);
    setPreview(null);
    setReviewed(false);
    setOpen(true);
  };
  const invoke = async (action: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "collaudo-commessa",
        {
          body: {
            action,
            order_id: orderId,
            id: report?.id,
            version: report?.version,
            content,
            document_hash: report?.document_hash,
            reviewed,
          },
        },
      );
      if (error) {
        let message = error.message;
        try {
          const payload = await error.context?.json();
          message = payload?.error ?? message;
        } catch {
          /* use invocation error */
        }
        throw new Error(message);
      }
      if (data?.error || !data?.report)
        throw new Error(data?.error ?? "Risposta non valida");
      setReport(data.report);
      setContent(data.report.content);
      setDirty(false);
      if (data.url) setPreview(data.url);
      if (action === "save") {
        setPreview(null);
        setReviewed(false);
        toast.success("Bozza salvata");
      }
      if (action === "finalize") {
        setReviewed(false);
        toast.success("Edizione congelata. Non è una firma del cliente.");
      }
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };
  const close = (next: boolean) => {
    if (busy) return;
    if (
      !next &&
      dirty &&
      !window.confirm("Chiudere senza salvare le modifiche al verbale?")
    )
      return;
    setOpen(next);
  };
  return (
    <Card id="section-collaudo" className="scroll-mt-24">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5 text-orange-500" />
            Collaudo e consegna
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifiche, riserve e interventi da completare, in un solo verbale.
          </p>
        </div>
        {canEditOrders && (
          <Button
            onClick={() => start(null)}
            disabled={query.isLoading || query.isError}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuovo verbale
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <p role="status">Caricamento verbali…</p>
        ) : query.isError ? (
          <div role="alert">
            Non riesco a caricare i verbali.{" "}
            <Button variant="outline" onClick={() => query.refetch()}>
              Riprova
            </Button>
          </div>
        ) : !query.data?.length ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">
            Nessun verbale. Parti dai controlli e registra ciò che è stato
            effettivamente verificato. Le fasi completate non valgono come
            accettazione del cliente.
          </p>
        ) : (
          query.data.map((row) => (
            <button
              key={row.id}
              onClick={() => start(row)}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="min-w-0">
                <span className="block break-words font-medium">
                  {row.content.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {row.content.date} · {outcomes[row.content.outcome]}
                </span>
              </span>
              <Badge variant="outline">
                {row.status === "finalized"
                  ? "Congelato · non firmato"
                  : "Bozza"}
              </Badge>
            </button>
          ))
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b p-5 pr-10">
            <DialogTitle>Verbale di verifica e consegna</DialogTitle>
            <DialogDescription>
              1. Compila · 2. Controlla il PDF · 3. Congela l’edizione
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-6 overflow-y-auto p-5">
            {report?.status === "finalized" && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                <LockKeyhole className="mb-2 h-4 w-4" />
                Edizione conservata e non modificabile. Non firmata dal cliente.
                Per correggerla, crea una nuova bozza.
              </div>
            )}
        {report?.status === "finalized" && (
          <AcceptanceTaskActions
            reportId={report.id} companyId={companyId} orderId={orderId}
            actions={report.content.actions} canCreate={canEditOrders}
            onOpenTasks={onOpenTasks ? () => { setOpen(false); onOpenTasks(); } : undefined}
          />
        )}
        <fieldset
              disabled={readonly || busy}
              className="space-y-5 disabled:opacity-80"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div>
                  <Label htmlFor="acceptance-title">Titolo</Label>
                  <Input
                    id="acceptance-title"
                    maxLength={200}
                    value={content.title}
                    onChange={(e) =>
                      edit({ ...content, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="acceptance-date">Data verifica</Label>
                  <Input
                    id="acceptance-date"
                    type="date"
                    value={content.date}
                    onChange={(e) => edit({ ...content, date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["inspector", "customer"] as const).map((field) => (
                  <div key={field}>
                    <Label htmlFor={"acceptance-" + field}>
                      {field === "inspector"
                        ? "Verificatore / referente impresa"
                        : "Cliente"}
                    </Label>
                    <Input
                      id={"acceptance-" + field}
                      maxLength={200}
                      value={content[field]}
                      onChange={(e) =>
                        edit({ ...content, [field]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor="acceptance-scope">
                  Quali lavori sono stati verificati?
                </Label>
                <Textarea
                  id="acceptance-scope"
                  maxLength={4000}
                  value={content.scope}
                  onChange={(e) => edit({ ...content, scope: e.target.value })}
                  placeholder="Ambienti, lavorazioni e limiti della verifica"
                />
              </div>
              <section className="space-y-3">
                <h3 className="font-semibold">Controlli effettuati</h3>
                <p className="text-sm text-muted-foreground">
                  Nessun controllo viene confermato automaticamente. Motiva le
                  riserve e le voci non applicabili.
                </p>
                {content.checks.map((check, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-lg border bg-slate-50/50 p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
                      <Input
                        aria-label={`Verifica ${i + 1}`}
                        value={check.label}
                        maxLength={200}
                        onChange={(e) =>
                          edit({
                            ...content,
                            checks: content.checks.map((v, j) =>
                              j === i ? { ...v, label: e.target.value } : v,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={`Esito verifica ${i + 1}`}
                        className={selectClass}
                        value={check.result}
                        onChange={(e) =>
                          edit({
                            ...content,
                            checks: content.checks.map((v, j) =>
                              j === i
                                ? {
                                    ...v,
                                    result: e.target
                                      .value as typeof check.result,
                                  }
                                : v,
                            ),
                          })
                        }
                      >
                        {Object.entries(results).map(([v, l]) => (
                          <option value={v} key={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Textarea
                      aria-label={`Note verifica ${i + 1}`}
                      placeholder="Note e riscontri"
                      maxLength={2000}
                      value={check.note}
                      onChange={(e) =>
                        edit({
                          ...content,
                          checks: content.checks.map((v, j) =>
                            j === i ? { ...v, note: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    {content.checks.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          edit({
                            ...content,
                            checks: content.checks.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Rimuovi verifica {i + 1}
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={content.checks.length >= 30}
                  onClick={() =>
                    edit({
                      ...content,
                      checks: [
                        ...content.checks,
                        {
                          label: "Nuova verifica",
                          result: "pending",
                          note: "",
                        },
                      ],
                    })
                  }
                >
                  Aggiungi verifica
                </Button>
              </section>
              <div>
                <Label htmlFor="acceptance-outcome">Esito complessivo</Label>
                <select
                  id="acceptance-outcome"
                  className={selectClass}
                  value={content.outcome}
                  onChange={(e) =>
                    edit({
                      ...content,
                      outcome: e.target.value as AcceptanceContent["outcome"],
                    })
                  }
                >
                  {Object.entries(outcomes).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="acceptance-reserves">
                  Riserve e difetti riscontrati
                </Label>
                <Textarea
                  id="acceptance-reserves"
                  maxLength={4000}
                  value={content.reservations}
                  onChange={(e) =>
                    edit({ ...content, reservations: e.target.value })
                  }
                />
              </div>
              <section className="space-y-3">
                <h3 className="font-semibold">Interventi da completare</h3>
                {content.actions.map((action, i) => (
                  <div key={i} className="space-y-3 rounded-lg border p-3">
                    <Textarea
                      aria-label={`Intervento ${i + 1}`}
                      maxLength={2000}
                      value={action.work}
                      placeholder="Cosa resta da fare"
                      onChange={(e) =>
                        edit({
                          ...content,
                          actions: content.actions.map((v, j) =>
                            i === j ? { ...v, work: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        aria-label={`Responsabile intervento ${i + 1}`}
                        maxLength={200}
                        value={action.owner}
                        placeholder="Responsabile"
                        onChange={(e) =>
                          edit({
                            ...content,
                            actions: content.actions.map((v, j) =>
                              i === j ? { ...v, owner: e.target.value } : v,
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`Scadenza intervento ${i + 1}`}
                        type="date"
                        min={content.date}
                        value={action.due}
                        onChange={(e) =>
                          edit({
                            ...content,
                            actions: content.actions.map((v, j) =>
                              i === j ? { ...v, due: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        edit({
                          ...content,
                          actions: content.actions.filter((_, j) => i !== j),
                        })
                      }
                    >
                      Rimuovi intervento {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={content.actions.length >= 30}
                  onClick={() =>
                    edit({
                      ...content,
                      actions: [
                        ...content.actions,
                        { work: "", owner: "", due: "" },
                      ],
                    })
                  }
                >
                  Aggiungi intervento
                </Button>
              </section>
              <div>
                <Label htmlFor="acceptance-documents">
                  Documenti e istruzioni consegnati
                </Label>
                <Textarea
                  id="acceptance-documents"
                  maxLength={4000}
                  value={content.documents}
                  onChange={(e) =>
                    edit({ ...content, documents: e.target.value })
                  }
                  placeholder="Elenca documenti, riferimenti e ciò che manca. Se non previsti, specificalo."
                />
              </div>
              <div>
                <Label htmlFor="acceptance-notes">
                  Note condivise con il cliente
                </Label>
                <Textarea
                  id="acceptance-notes"
                  maxLength={4000}
                  value={content.notes}
                  onChange={(e) => edit({ ...content, notes: e.target.value })}
                />
              </div>
            </fieldset>
            {!readonly && errors.length > 0 && (
              <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Da completare prima di congelare ({errors.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            {preview && (
              <section className="space-y-3">
                <a
                  className="text-sm font-medium text-primary underline"
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apri il PDF in una nuova scheda
                </a>
                <div className="h-[55dvh] min-h-64">
                  <PdfBlobLivePreviewPanel
                    renderBlobUrl={previewBlob}
                    depsKey={preview}
                    debounceMs={0}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Link riservato valido 5 minuti. Se scade, premi di nuovo “Apri
                  PDF”.
                </p>
                {!readonly && (
                  <label className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    Ho controllato il PDF. Congelando questa edizione non potrò
                    modificarla e non acquisirò una firma del cliente.
                  </label>
                )}
              </section>
            )}
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
              La firma elettronica del verbale non è ancora collegata: nessuna
              richiesta viene inviata da questa schermata. Il verbale non
              sostituisce certificazioni tecniche e non approva eventuali costi
              extra.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-white p-4">
            {busy && (
              <Loader2
                aria-label="Operazione in corso"
                className="h-4 w-4 animate-spin"
              />
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => close(false)}
            >
              Chiudi
            </Button>
            {!readonly && (
              <Button
                variant="outline"
                disabled={busy || !dirty}
                onClick={() => invoke("save")}
              >
                Salva bozza
              </Button>
            )}
            <Button
              variant="outline"
              disabled={
                busy ||
                dirty ||
                !report ||
                (!canEditOrders && !report?.pdf_path)
              }
              onClick={() => invoke(report?.pdf_path ? "open" : "preview")}
            >
              <FileText className="mr-2 h-4 w-4" />
              {report?.pdf_path ? "Apri PDF" : "Genera anteprima"}
            </Button>
            {!readonly && (
              <Button
                disabled={
                  busy || dirty || !preview || !reviewed || errors.length > 0
                }
                onClick={() => invoke("finalize")}
              >
                <LockKeyhole className="mr-2 h-4 w-4" />
                Congela edizione
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
