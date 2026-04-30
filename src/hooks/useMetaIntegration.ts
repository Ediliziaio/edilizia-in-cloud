import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Integration, MetaAsset, MetaLeadForm, IntegrationFieldMapping } from "@/types/integrations";

type MetaProxyParams = Record<string, unknown>;
type MetaProxyResponse = Record<string, any>;

interface UpdateFormStatusInput {
  formId: string;
  formName: string;
  pageAssetId: string;
  status: MetaLeadForm["status"];
  syncMode?: MetaLeadForm["sync_mode"];
}

function getFunctionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Errore imprevisto durante la chiamata Meta";
}

export function useMetaIntegration(integration: Integration | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
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
      toast.error("Azienda non trovata");
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke<{
        oauth_url?: string;
        error?: string;
      }>("meta-oauth-start", {
        body: { company_id: companyId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.oauth_url) throw new Error("URL OAuth Meta non ricevuto");

      return data.oauth_url;
    } catch (error) {
      toast.error(`Errore avvio OAuth: ${getFunctionErrorMessage(error)}`);
      return null;
    }
  }, [companyId]);

  // Call meta-api-proxy
  const callProxy = useCallback(
    async (action: string, params: MetaProxyParams = {}): Promise<MetaProxyResponse> => {
      if (!companyId || !integration?.id) {
        throw new Error("Contesto azienda o integrazione mancante");
      }

      const { data, error } = await supabase.functions.invoke<MetaProxyResponse>("meta-api-proxy", {
        body: {
          action,
          company_id: companyId,
          integration_id: integration.id,
          ...params,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data || {};
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
      queryClient.invalidateQueries({ queryKey: ["integration-meta-stats"] });
      toast.success("Selezione pagina aggiornata");
    },
    onError: (err: Error) => {
      toast.error(`Errore aggiornamento pagina: ${err.message}`);
    },
  });

  // Save form status
  const updateFormStatus = useMutation({
    mutationFn: async ({ formId, formName, pageAssetId, status, syncMode }: UpdateFormStatusInput) => {
      if (!companyId || !integration?.id) throw new Error("Missing context");

      // Upsert form record
      const { error } = await supabase
        .from("meta_lead_forms")
        .upsert(
          {
            company_id: companyId,
            integration_id: integration.id,
            page_asset_id: pageAssetId,
            form_id: formId,
            form_name: formName || formId,
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
      queryClient.invalidateQueries({ queryKey: ["integration-meta-stats"] });
      toast.success("Modulo aggiornato");
    },
    onError: (err: Error) => {
      toast.error(`Errore aggiornamento modulo: ${err.message}`);
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
      queryClient.invalidateQueries({ queryKey: ["meta-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["integration-meta-stats"] });
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
