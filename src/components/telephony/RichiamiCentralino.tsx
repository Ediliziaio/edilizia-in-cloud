import { lazy, Suspense, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardCheck, Phone } from "lucide-react";
import { toast } from "sonner";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { getTaskStatusLabel } from "@/lib/taskStatuses";
import { centralinoCallbackHref } from "@/lib/centralinoNavigation";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useCallTranscript } from "@/hooks/useCallTranscript";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { fishCallbackOutcomes, phoneForFishCallback, saveFishCallbackOutcome, useFishCallbacks,
  type FishCallbackOutcome, type FishCallbackTask,
} from "@/lib/fishCallbacks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { CallTranscript } from "@/components/telephony/CallTranscript";
import { FishCallbackCard } from "./FishCallbackCard";

const TaskDialog = lazy(() => import("@/components/tasks/TaskDialog").then(({ TaskDialog }) => ({ default: TaskDialog })));

function CallbackTaskEditor({ id, companyId, close }: { id: string; companyId: string; close: () => void }) {
  const cache = useQueryClient();
  const task = useQuery({
    queryKey: ["fish-callback-task", companyId, id],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("company_id", companyId).eq("id", id).single();
      if (error) throw new Error("Attività non disponibile.");
      return data;
    },
  });
  if (task.isPending) return <p role="status" className="text-sm">Carico l’attività…</p>;
  if (task.isError) return <p role="alert" className="text-sm">{task.error.message}</p>;
  const scope = task.data.activity_scope;
  return (
    <Suspense fallback={<p role="status" className="text-sm">Apro l’attività…</p>}>
      <TaskDialog open onOpenChange={open => { if (!open) close(); }}
        task={{
          ...task.data,
          notes: task.data.notes || "",
          activity_scope: scope === "ufficio" || scope === "cantiere" ? scope : "generale",
        }}
        onSaved={() => {
          void cache.invalidateQueries({ queryKey: ["fish-callbacks", companyId] });
          void cache.invalidateQueries({ queryKey: ["fish-callback-task", companyId, id] });
          void cache.invalidateQueries({ queryKey: queryKeys.tasks.all });
          close();
        }}
      />
    </Suspense>
  );
}

function CallbackRow({ callback, companyId, focused, canViewContact, canEdit, canDial, closed, statusLabel }: {
  callback: FishCallbackTask;
  companyId: string;
  focused: boolean;
  canViewContact: boolean;
  canEdit: boolean;
  canDial: boolean;
  closed: boolean;
  statusLabel: string;
}) {
  const [open, setOpen] = useState(focused);
  const [editing, setEditing] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcome, setOutcome] = useState<FishCallbackOutcome | "">("");
  const [detail, setDetail] = useState("");
  const formId = useId();
  const canWork = canEdit && !closed;
  const softphone = useSoftphoneOptional();
  const callBusy = !!softphone && softphone.status !== "idle";
  const phone = phoneForFishCallback(callback.notes);
  const cache = useQueryClient();
  const transcript = useCallTranscript(companyId, open ? callback.fish_call_id : undefined);
  const result = useMutation({
    retry: false,
    mutationFn: (selection: FishCallbackOutcome) => saveFishCallbackOutcome(companyId, callback, selection, detail),
    onSuccess: (_data, selection) => {
      setOutcomeOpen(false);
      setOutcome("");
      setDetail("");
      toast.success(selection === "Contattato" ? "Esito salvato. Richiamo completato." : "Esito salvato. Il richiamo resta da gestire.");
      void cache.invalidateQueries({ queryKey: ["fish-callback-task", companyId, callback.id] });
      void cache.invalidateQueries({ queryKey: queryKeys.tasks.all });
      void cache.invalidateQueries({ queryKey: ["my-task-count"] });
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ["fish-callbacks", companyId] }),
  });

  function callBack() {
    if (!canWork || !canDial || !phone || !softphone || callBusy) return;
    const name = callback.title.match(/^Richiamare (.+?) \(assistente AI\)$/)?.[1];
    softphone.startCall(phone, { name, contactId: callback.contact_id ?? undefined });
    setOutcomeOpen(true);
  }
  return (
    <FishCallbackCard callback={callback} statusLabel={statusLabel} open={open} onToggle={() => setOpen(current => !current)}
      primaryActions={canWork && <>
        {canDial && <Button size="sm" disabled={!phone || !softphone || callBusy || result.isPending}
          className="eic-motion-button" title={phone ?? "Recapito del richiamo non disponibile"} onClick={callBack}>
          <Phone className="mr-1.5 h-4 w-4" /> Richiama
        </Button>}
        <Button size="sm" variant="outline" aria-expanded={outcomeOpen} aria-controls={formId}
          onClick={() => setOutcomeOpen(current => !current)}>
          <ClipboardCheck className="mr-1.5 h-4 w-4" /> Segna esito
        </Button>
      </>}
      followUp={canWork && outcomeOpen && (
        <form id={formId} aria-label="Registra esito" className="eic-workspace-header eic-motion-enter space-y-3 p-3"
          onSubmit={event => {
            event.preventDefault();
            if (outcome && !callBusy && !result.isPending) result.mutate(outcome);
          }}>
          <div className="grid gap-3 sm:grid-cols-[13rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-outcome`}>Esito del richiamo</Label>
              <select id={`${formId}-outcome`} required value={outcome} disabled={result.isPending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                onChange={event => setOutcome(fishCallbackOutcomes.find(value => value === event.target.value) ?? "")}>
                <option value="">Seleziona esito</option>
                {fishCallbackOutcomes.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              {outcome && <p className="text-xs text-muted-foreground">
                {outcome === "Contattato" ? "Il richiamo verrà completato." : "Il richiamo resterà da gestire."}
              </p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-note`}>Nota facoltativa</Label>
              <Textarea id={`${formId}-note`} rows={2} maxLength={500} value={detail} disabled={result.isPending}
                onChange={event => setDetail(event.target.value)} />
            </div>
          </div>
          {callBusy && <p role="status" className="text-xs text-muted-foreground">Puoi salvare l’esito al termine della chiamata.</p>}
          {result.isError && <p role="alert" className="text-sm text-destructive">{result.error.message}</p>}
          <Button type="submit" size="sm" className="eic-motion-button" disabled={!outcome || callBusy || result.isPending}>
            {result.isPending ? "Salvataggio…" : "Salva esito"}
          </Button>
        </form>
      )}
      links={<>
        {canViewContact && callback.contact_id && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/azienda/marketing/contatti/${callback.contact_id}?pannello=chiamate`}>Apri scheda CRM</Link>
          </Button>
        )}
        {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(current => !current)}>Gestisci richiamo</Button>}
        {editing && canEdit && <CallbackTaskEditor id={callback.id} companyId={companyId} close={() => setEditing(false)} />}
      </>}
    >
      {transcript.isPending ? <p role="status" className="text-sm">Carico la trascrizione…</p>
        : transcript.isError ? (
          <p role="alert" className="text-sm">{transcript.error.message}{" "}
            <Button size="sm" variant="ghost" onClick={() => void transcript.refetch()}>Riprova</Button>
          </p>
        ) : <CallTranscript turns={transcript.data} />}
    </FishCallbackCard>
  );
}

export function RichiamiCentralino({ callbackId }: { callbackId?: string }) {
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const [params] = useSearchParams();
  const [showAll, setShowAll] = useState(false);
  const allowed = permissions.isAdmin || permissions.canViewOrders;
  const { statuses } = useTaskStatuses(allowed ? companyId : undefined);
  const closedStatuses = [...new Set([
    "completato", "annullata", "annullato", ...statuses.filter(status => status.stage === "done").map(status => status.value),
  ])];
  const query = useFishCallbacks(companyId, { callbackId, closedStatuses: !callbackId && !showAll ? closedStatuses : undefined }, allowed);
  if (permissions.isLoading) return <p role="status" className="text-sm">Verifico i permessi…</p>;
  if (!allowed) return <p className="rounded-lg border p-3 text-sm">Serve l’accesso alle attività per consultare i richiami.</p>;
  return (
    <section aria-label="Richiami del centralino" className="w-full max-w-5xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{callbackId ? "Richiamo collegato" : "Coda richiami"}</h2>
        {callbackId ? (
          <Button asChild variant="outline" size="sm"><Link to={centralinoCallbackHref(undefined, params)}>Torna alla coda</Link></Button>
        ) : (
          <div role="group" aria-label="Stato dei richiami" className="flex gap-1 rounded-lg bg-muted p-1">
            <Button size="sm" variant={showAll ? "ghost" : "secondary"} aria-pressed={!showAll}
              onClick={() => setShowAll(false)}>Da gestire</Button>
            <Button size="sm" variant={showAll ? "secondary" : "ghost"} aria-pressed={showAll}
              onClick={() => setShowAll(true)}>Tutti</Button>
          </div>
        )}
      </div>
      {!companyId || query.isPending ? <p role="status" className="text-sm">Carico i richiami…</p>
        : query.isError ? (
          <p role="alert" className="text-sm">{query.error.message}{" "}
            <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Riprova</Button>
          </p>
        ) : !query.data.length ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            {callbackId ? "Richiamo non disponibile." : showAll ? "La coda è vuota." : "Non ci sono richiami da gestire."}
          </p>
        )
          : query.data.map(callback => (
            <CallbackRow key={callback.id} companyId={companyId} callback={callback}
              focused={!!callbackId} statusLabel={getTaskStatusLabel(callback.status, statuses)} canViewContact={permissions.canViewMarketingContacts}
              closed={closedStatuses.includes(callback.status)} canDial={permissions.isAdmin || permissions.canViewMarketingAiAgent}
              canEdit={!permissions.solaLettura && (permissions.isAdmin || permissions.canEditOrders)} />
          ))}
    </section>
  );
}
