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

export function BulkEnrollAutomationDropdown({ selectedIds }: BulkEnrollAutomationDropdownProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: flows = [] } = useQuery({
    queryKey: ["automation-flows-active", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("automation_flows")
        .select("id, name, status, version")
        .eq("company_id", companyId)
        .eq("status", "published")
        .order("name");
      return data || [];
    },
    enabled: !!companyId && open,
  });

  const enrollMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const flow = flows.find((f) => f.id === flowId);
      if (!flow || !companyId) throw new Error("Flusso non trovato");

      const rows = Array.from(selectedIds).map((contactId) => ({
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
      const events = Array.from(selectedIds).map((contactId) => ({
        company_id: companyId,
        trigger_event: "manual_enrollment",
        entity_id: contactId,
        entity_type: "contact",
        payload: { flow_id: flowId, bulk: true },
      }));
      await supabase.from("automation_trigger_events").insert(events);
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} contatti iscritti all'automazione`);
      queryClient.invalidateQueries({ queryKey: ["automation-enrollments"] });
      setOpen(false);
    },
    onError: (err: any) => toast.error("Errore: " + err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
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
