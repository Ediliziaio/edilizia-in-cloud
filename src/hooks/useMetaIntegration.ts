import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Integration, MetaAsset, MetaLeadForm, IntegrationFieldMapping } from "@/types/integrations";

export function useMetaIntegration(integration: Integration | null) {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();

  // Fetch assets (pages)
  const { data: assets = [], refetch: refetchAssets } = useQuery({
    queryKey: ["meta-assets", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data, error } = await supabase
        .from("meta_assets")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("asset_name");
      if (error) throw error;
      return (data || []) as MetaAsset[];
    },
    enabled: !!companyId && !!integration?.id,
  });

  // Fetch lead forms
  const { data: forms = [], refetch: refetchForms } = useQuery({
    queryKey: ["meta-forms", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data, error } = await supabase
        .from("meta_lead_forms")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("form_name");
      if (error) throw error;
      return (data || []) as MetaLeadForm[];
    },
    enabled: !!companyId && !!integration?.id,
  });

  // Fetch field mappings
  const { data: mappings = [], refetch: refetchMappings } = useQuery({
    queryKey: ["meta-mappings", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data, error } = await supabase
        .from("integration_field_mappings")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id);
      if (error) throw error;
      return (data || []) as unknown as IntegrationFieldMapping[];
    },
    enabled: !!companyId && !!integration?.id,
  });

  // Start OAuth
  const startOAuth = useCallback(async () => {
    if (!companyId) {
      toast.error("Company not found");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth-start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ company_id: companyId }),
        }
      );

      const result = await res.json();
      if (result.error) {
        toast.error(result.error);
        return null;
      }

      return result.oauth_url as string;
    } catch (error: any) {
      toast.error(`Errore avvio OAuth: ${error.message}`);
      return null;
    }
  }, [companyId]);

  // Call meta-api-proxy
  const callProxy = useCallback(
    async (action: string, params: Record<string, any> = {}) => {
      if (!companyId || !integration?.id) throw new Error("Missing context");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-api-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            company_id: companyId,
            integration_id: integration.id,
            ...params,
          }),
        }
      );

      const result = await res.json();
      if (result.error) throw new Error(result.error);
      return result;
    },
    [companyId, integration?.id]
  );

  // Toggle page selection
  const togglePageSelection = useMutation({
    mutationFn: async ({ assetId, selected }: { assetId: string; selected: boolean }) => {
      const { error } = await supabase
        .from("meta_assets")
        .update({ selected, updated_at: new Date().toISOString() })
        .eq("id", assetId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchAssets();
    },
  });

  // Save form status
  const updateFormStatus = useMutation({
    mutationFn: async ({ formId, status, syncMode }: { formId: string; status: string; syncMode?: string }) => {
      if (!companyId || !integration?.id) throw new Error("Missing context");

      // Upsert form record
      const { error } = await supabase
        .from("meta_lead_forms")
        .upsert(
          {
            company_id: companyId,
            integration_id: integration.id,
            form_id: formId,
            form_name: formId, // will be updated with actual name
            status,
            sync_mode: syncMode || "new_only",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,form_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      refetchForms();
      toast.success("Modulo aggiornato");
    },
  });

  // Save field mapping
  const saveMapping = useMutation({
    mutationFn: async ({ formId, rules }: { formId: string; rules: any }) => {
      if (!companyId || !integration?.id) throw new Error("Missing context");

      // Get current version
      const existing = mappings.find((m) => m.form_id === formId);
      const newVersion = (existing?.mapping_version || 0) + 1;

      const { error } = await supabase
        .from("integration_field_mappings")
        .upsert(
          {
            company_id: companyId,
            integration_id: integration.id,
            form_id: formId,
            mapping_version: newVersion,
            rules,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,integration_id,form_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      refetchMappings();
      toast.success("Mappatura salvata");
    },
  });

  // Disconnect
  const disconnect = useMutation({
    mutationFn: async () => {
      await callProxy("disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["meta-assets"] });
      queryClient.invalidateQueries({ queryKey: ["meta-forms"] });
      toast.success("Integrazione disconnessa");
    },
    onError: (err: Error) => {
      toast.error(`Errore disconnessione: ${err.message}`);
    },
  });

  return {
    assets,
    forms,
    mappings,
    pages: assets.filter((a) => a.asset_type === "page"),
    selectedPages: assets.filter((a) => a.asset_type === "page" && a.selected),
    startOAuth,
    callProxy,
    togglePageSelection,
    updateFormStatus,
    saveMapping,
    disconnect,
    refetchAssets,
    refetchForms,
    refetchMappings,
  };
}
