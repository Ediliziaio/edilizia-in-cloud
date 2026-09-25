import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { isLocalCrewBackend } from "@/lib/orders/internalTeamRoster";
import { loadCrewSnapshot, saveCrewRoster, type CrewRpcClient } from "@/lib/orders/internalTeamRosterApi";
import { InternalTeamRosterEditor } from "./InternalTeamRosterEditor";

const config = { url: import.meta.env.VITE_SUPABASE_URL, optIn: import.meta.env.VITE_INTERNAL_TEAM_ROSTERS_LOCAL };
const enabled = isLocalCrewBackend(config.url, config.optIn);
const client = supabase as unknown as CrewRpcClient;

export function InternalTeamRosterDialog({ team, onClose }: { team: { id: string; name: string }; onClose: () => void }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [saving, setSaving] = useState(false);
  const queryKey = ["internal-team-roster", companyId, team.id];
  const query = useQuery({
    queryKey, enabled: enabled && !!companyId, retry: false,
    queryFn: () => loadCrewSnapshot(client, config, companyId!, team.id),
  });
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader className="pr-6 text-left"><DialogTitle>Dipendenti · {team.name}</DialogTitle><DialogDescription>Componi la squadra interna e scegli il referente abituale.</DialogDescription></DialogHeader>
      {!enabled ? <div className="space-y-3 rounded-lg border p-4 text-sm" role="status"><p className="font-medium">Composizione in preparazione</p><p>Il nuovo salvataggio richiede l'attivazione e il collaudo del database dedicato. Su questo ambiente non è ancora disponibile.</p><p className="text-muted-foreground">Le assegnazioni individuali già presenti continuano a funzionare. Nessun dato è stato modificato.</p></div>
        : query.isPending ? <p role="status">Caricamento dipendenti…</p>
        : query.isError ? <div role="alert" className="space-y-3"><p>Non è possibile caricare la composizione. Non viene mostrata una squadra vuota al posto di un errore.</p><Button variant="outline" onClick={() => void query.refetch()}>Riprova</Button></div>
        : query.data && <InternalTeamRosterEditor key={`${companyId}:${team.id}:${editorGeneration}`} snapshot={query.data}
          onReload={async () => { const result = await query.refetch(); if (!result.isError) setEditorGeneration(n => n + 1); }}
          onSave={async draft => {
            setSaving(true);
            try {
              await saveCrewRoster(client, config, query.data, { ...draft, companyId: companyId!, teamId: team.id });
              void qc.invalidateQueries({ queryKey });
              toast.success("Composizione salvata", { description: "Assegnazioni e accessi Campo non sono stati modificati." });
              onClose();
            } finally { setSaving(false); }
          }} />}
    </DialogContent>
  </Dialog>;
}
