import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { perOgniLotto, raccogliALotti } from "@/lib/lottiDiId";

interface BulkEnrollAutomationDropdownProps {
  selectedIds: Set<string>;
}

async function getCompanyScopedContactIds(contactIds: string[], companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");
  if (contactIds.length === 0) throw new Error("Seleziona almeno un contatto");

  // A lotti: vedi lottiDiId.ts — l'URL non regge 25.000 id e PostgREST
  // risponde al massimo con mille righe.
  const safeIds = await raccogliALotti(contactIds, async (lotto) => {
    const { data, error } = await supabase
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", companyId)
      .in("id", lotto);
    if (error) throw error;
    return (data || []).map((row) => row.id);
  });
  if (safeIds.length !== contactIds.length) {
    throw new Error("Alcuni contatti selezionati non appartengono all'azienda corrente");
  }

  return safeIds;
}

export function BulkEnrollAutomationDropdown({ selectedIds }: BulkEnrollAutomationDropdownProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: flows = [] } = useQuery({
    queryKey: ["automation-flows-active", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id, name, status, version")
        .eq("company_id", companyId)
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && open,
  });

  const enrollMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const flow = flows.find((f) => f.id === flowId);
      if (!flow || !companyId) throw new Error("Flusso non trovato");
      const contactIds = await getCompanyScopedContactIds(Array.from(selectedIds), companyId);

      // Tutto server-side via RPC. Il vecchio codice client-side non poteva
      // funzionare per tre motivi indipendenti:
      //  1. upsert(onConflict:"flow_id,entity_id") -> 42P10, non esiste
      //     l'indice unico (e non va aggiunto: il motore vuole piu' righe)
      //  2. l'insert su automation_trigger_events e' vietato dalle RLS
      //     (unica policy: service_role)
      //  3. l'evento "manual_enrollment" non lo legge nessuno, e comunque a
      //     far partire un flusso e' la riga in automation_queue, non
      //     l'iscrizione
      // La RPC inserisce iscrizione + coda dal primo nodo dopo il trigger.
      // Anche la RPC va a lotti: gli id viaggiano nel corpo, ma iscrivere
      // 25.000 contatti in un colpo solo significa una transazione lunghissima
      // che finisce in timeout e non lascia iscritto nessuno.
      let enrolled = 0;
      let saltati = 0;
      try {
        await perOgniLotto(contactIds, async (lotto) => {
          const { data, error } = await supabase.rpc("enroll_entities_in_flow", {
            p_flow_id: flowId,
            p_entity_ids: lotto,
            p_entity_type: "contact",
          });
          if (error) throw error;
          const parziale = (data ?? {}) as { enrolled?: number; skipped?: number };
          enrolled += parziale.enrolled ?? 0;
          saltati += parziale.skipped ?? 0;
        });
      } catch (errore) {
        // A lotti si può fallire a metà strada: chi è già entrato nel flusso
        // ci resta, e va detto — altrimenti si riprova su tutti e si iscrive
        // due volte chi era già dentro.
        if (enrolled > 0) {
          throw new Error(
            `${enrolled} contatti iscritti, poi l'iscrizione si è fermata: ${userErrorMessage(errore, "errore del database")}`,
            { cause: errore },
          );
        }
        throw errore;
      }

      if (enrolled === 0) {
        throw new Error("Nessun contatto iscritto: risultano già tutti in questa automazione");
      }
      return { enrolled, skipped: saltati };
    },
    onSuccess: ({ enrolled, skipped }) => {
      // Prima si annunciava selectedIds.size: contava anche chi non era stato
      // iscritto davvero.
      toast.success(
        skipped > 0
          ? `${enrolled} contatti iscritti · ${skipped} già presenti nel flusso`
          : `${enrolled} contatti iscritti all'automazione`,
      );
      queryClient.invalidateQueries({ queryKey: ["automation-enrollments"] });
      setOpen(false);
    },
    onError: (err) => {
      // Gli errori Supabase sono PostgrestError, non istanze di Error: il
      // vecchio `err instanceof Error` era sempre falso e mangiava la causa
      // vera (es. 42P10 su ON CONFLICT), lasciando solo il messaggio generico.
      console.error("[BulkEnrollAutomation] iscrizione fallita", err);
      toast.error(userErrorMessage(err, "Errore nell'iscrizione all'automazione"));
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || enrollMutation.isPending}>
          <Workflow className="h-4 w-4 mr-1" /> Aggiungi ad automazione
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 mb-1">
          Flussi pubblicati
        </p>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {flows.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">Nessun flusso pubblicato</p>
          ) : (
            flows.map((f) => (
              <button
                key={f.id}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                onClick={() => enrollMutation.mutate(f.id)}
                disabled={enrollMutation.isPending}
              >
                {f.name}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
