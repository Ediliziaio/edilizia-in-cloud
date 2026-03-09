import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  InternalAutomationFlow,
  InternalAutomationNode,
  InternalAutomationConnection,
} from "@/types/internalAutomationBuilder";

const QK = "internal-automation-flows";

export function useInternalAutomationFlows() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: [QK, companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_automation_flows")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InternalAutomationFlow[];
    },
    enabled: !!companyId,
  });
}

export function useInternalAutomationFlow(flowId: string | undefined) {
  return useQuery({
    queryKey: [QK, "detail", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_automation_flows")
        .select("*")
        .eq("id", flowId!)
        .single();
      if (error) throw error;
      return data as InternalAutomationFlow;
    },
    enabled: !!flowId,
  });
}

export function useInternalAutomationNodes(flowId: string | undefined) {
  return useQuery({
    queryKey: [QK, "nodes", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_automation_nodes")
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as InternalAutomationNode[];
    },
    enabled: !!flowId,
  });
}

export function useInternalAutomationConnections(flowId: string | undefined) {
  return useQuery({
    queryKey: [QK, "connections", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_automation_connections")
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as InternalAutomationConnection[];
    },
    enabled: !!flowId,
  });
}

export function useInternalAutomationExecutionLog(flowId: string | undefined) {
  return useQuery({
    queryKey: [QK, "log", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_automation_execution_log")
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });
}

// ── Mutations ─────────────────────────────────────────

export function useCreateInternalFlow() {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!effectiveCompany?.id || !user?.id) {
        throw new Error("Azienda o utente non ancora caricati. Riprova tra poco.");
      }
      const { data, error } = await (supabase as any)
        .from("internal_automation_flows")
        .insert({
          company_id: effectiveCompany.id,
          name,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as InternalAutomationFlow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateInternalFlow(flowId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<InternalAutomationFlow>) => {
      const { error } = await (supabase as any)
        .from("internal_automation_flows")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", flowId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteInternalFlow() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      const { error } = await (supabase as any)
        .from("internal_automation_flows")
        .delete()
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ── Node mutations ────────────────────────────────────

export function useSaveInternalNodes(flowId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      nodes,
      connections,
    }: {
      nodes: InternalAutomationNode[];
      connections: InternalAutomationConnection[];
    }) => {
      const companyId = effectiveCompany!.id;

      // Delete existing nodes + connections then re-insert
      await (supabase as any)
        .from("internal_automation_connections")
        .delete()
        .eq("flow_id", flowId!);
      await (supabase as any)
        .from("internal_automation_nodes")
        .delete()
        .eq("flow_id", flowId!);

      if (nodes.length > 0) {
        const { error: ne } = await (supabase as any)
          .from("internal_automation_nodes")
          .insert(
            nodes.map((n) => ({
              id: n.id,
              flow_id: flowId!,
              company_id: companyId,
              node_type: n.node_type,
              config_json: n.config_json,
              label: n.label,
              position_x: n.position_x,
              position_y: n.position_y,
            }))
          );
        if (ne) throw ne;
      }

      if (connections.length > 0) {
        const { error: ce } = await (supabase as any)
          .from("internal_automation_connections")
          .insert(
            connections.map((c) => ({
              id: c.id,
              flow_id: flowId!,
              company_id: companyId,
              from_node_id: c.from_node_id,
              to_node_id: c.to_node_id,
              label: c.label,
            }))
          );
        if (ce) throw ce;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK, "nodes", flowId] });
      qc.invalidateQueries({ queryKey: [QK, "connections", flowId] });
    },
  });
}
