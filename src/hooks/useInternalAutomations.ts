import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import type {
  InternalAutomationFlow,
  InternalAutomationNode,
  InternalAutomationConnection,
} from "@/types/internalAutomationBuilder";

export function useInternalAutomationFlows() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.internalAutomations.flows(companyId),
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
    queryKey: queryKeys.internalAutomations.flow(flowId),
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
    queryKey: queryKeys.internalAutomations.nodes(flowId),
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
    queryKey: queryKeys.internalAutomations.connections(flowId),
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
    queryKey: queryKeys.internalAutomations.log(flowId),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.internalAutomations.all }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.internalAutomations.all }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.internalAutomations.all }),
  });
}

// ── Atomic Node Save via RPC ──────────────────────────

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
      if (!effectiveCompany?.id) {
        throw new Error("Azienda non ancora caricata. Riprova tra poco.");
      }

      const nodesPayload = nodes.map((n) => ({
        id: n.id,
        node_type: n.node_type,
        config_json: n.config_json,
        label: n.label,
        position_x: n.position_x,
        position_y: n.position_y,
      }));

      const connectionsPayload = connections.map((c) => ({
        id: c.id,
        from_node_id: c.from_node_id,
        to_node_id: c.to_node_id,
        label: c.label,
      }));

      const { error } = await supabase.rpc("save_internal_automation_nodes" as any, {
        p_flow_id: flowId!,
        p_company_id: effectiveCompany.id,
        p_nodes: nodesPayload,
        p_connections: connectionsPayload,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.internalAutomations.nodes(flowId) });
      qc.invalidateQueries({ queryKey: queryKeys.internalAutomations.connections(flowId) });
    },
  });
}
