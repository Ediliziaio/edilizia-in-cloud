import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

interface BulkEnrollAutomationDropdownProps {
  selectedIds: Set<string>;
}

async function getCompanyScopedContactIds(contactIds: string[], companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");
  if (contactIds.length === 0) throw new Error("Seleziona almeno un contatto");

  const { data, error } = await supabase
    .from("marketing_contacts")
    .select("id")
    .eq("company_id", companyId)
    .in("id", contactIds);

  if (error) throw error;

  const safeIds = (data || []).map((row) => row.id);
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

      const rows = contactIds.map((contactId) => ({
        company_id: companyId,
        flow_id: flowId,
        entity_id: contactId,
        entity_type: "contact",
        flow_version: flow.version,
        status: "active",
      }));

      const { error } = await supabase
        .from("automation_enrollments")
        .upsert(rows, { onConflict: "flow_id,entity_id" });
      if (error) throw error;

      // Fire trigger events so the automation engine picks them up
      const events = contactIds.map((contactId) => ({
        company_id: companyId,
        trigger_event: "manual_enrollment",
        entity_id: contactId,
        entity_type: "contact",
        payload: { flow_id: flowId, bulk: true },
      }));
      const { error: eventError } = await supabase.from("automation_trigger_events").insert(events);
      if (eventError) throw eventError;
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} contatti iscritti all'automazione`);
      queryClient.invalidateQueries({ queryKey: ["automation-enrollments"] });
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Errore nell'iscrizione all'automazione"),
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
