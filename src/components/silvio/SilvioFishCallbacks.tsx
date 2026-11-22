import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCallTranscript } from "@/hooks/useCallTranscript";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { useFishCallbacks, type FishCallback } from "@/lib/fishCallbacks";
import { Button } from "@/components/ui/button";
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
          close();
        }}
      />
    </Suspense>
  );
}

function CallbackRow({ callback, companyId, focused, canViewContact, canEdit }: {
  callback: FishCallback;
  companyId: string;
  focused: boolean;
  canViewContact: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(focused);
  const [editing, setEditing] = useState(false);
  const transcript = useCallTranscript(companyId, open ? callback.fish_call_id : undefined);
  return (
    <FishCallbackCard callback={callback} open={open} onToggle={() => setOpen(current => !current)}
      links={<>
        {canViewContact && callback.contact_id && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/azienda/marketing/contatti/${callback.contact_id}?pannello=chiamate`}>Apri scheda CRM</Link>
          </Button>
        )}
        {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(current => !current)}>Gestisci attività</Button>}
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

export function SilvioFishCallbacks({ callbackId }: { callbackId?: string }) {
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const allowed = permissions.isAdmin || permissions.canViewOrders;
  const query = useFishCallbacks(companyId, { callbackId }, allowed);
  if (!allowed) return <p className="rounded-lg border p-3 text-sm">Serve l’accesso alle attività per consultare i richiami.</p>;
  return (
    <section aria-label="Richiami del centralino" className="space-y-2">
      {callbackId && <Button asChild variant="ghost" size="sm"><Link to="/azienda/silvio-ai/attivita?vista=richiami">Tutti i richiami</Link></Button>}
      {!companyId || query.isPending ? <p role="status" className="text-sm">Carico i richiami…</p>
        : query.isError ? (
          <p role="alert" className="text-sm">{query.error.message}{" "}
            <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Riprova</Button>
          </p>
        ) : !query.data.length ? <p className="rounded-lg border p-3 text-sm">Nessun richiamo disponibile.</p>
          : query.data.map(callback => (
            <CallbackRow key={callback.id} companyId={companyId} callback={callback}
              focused={!!callbackId} canViewContact={permissions.canViewMarketingContacts}
              canEdit={permissions.isAdmin || permissions.canEditOrders} />
          ))}
    </section>
  );
}
