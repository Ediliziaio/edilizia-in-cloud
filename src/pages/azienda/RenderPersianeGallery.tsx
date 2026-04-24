import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftClose } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  RenderUnifiedGallery,
  type UnifiedRenderGalleryItem,
} from "@/components/render/RenderUnifiedGallery";
import { ensurePersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";

type PersianeGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderPersianeGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-persiane-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_persiane_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Omit<PersianeGalleryRow, "meta">[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as PersianeGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const renderConfig = item.config ? ensurePersianeRenderConfig(item.config) : null;
    const legacy = renderConfig?.legacy_config;
    const targetLabels = renderConfig?.target_selection.targetLabels ?? [];
    const tags = compact([
      legacy?.tipo ? String(legacy.tipo) : null,
      legacy?.colore_nome ? String(legacy.colore_nome) : null,
      targetLabels[0],
    ]);

    return {
      id: item.id,
      title: legacy?.tipo ? `Persiane ${String(legacy.tipo).replace(/_/g, " ")}` : "Render persiane",
      date: item.created_at,
      detailPath: `/azienda/render/persiane/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([
        ...tags,
        targetLabels.join(" "),
        renderConfig?.replacement_manifest.scope,
      ]).join(" "),
      createdById: item.created_by,
      createdByName: item.meta.createdByName,
      contactId: item.contact_id,
      contactName: item.meta.contactName,
      opportunityId: item.opportunity_id,
      opportunityName: item.meta.opportunityName,
      imageFit: "contain",
    };
  }), [sessions]);

  return (
    <RenderUnifiedGallery
      moduleName="Persiane"
      badgeLabel="Galleria persiane"
      title="Render persiane e oscuranti salvati, con filtri data e CRM."
      description="Controlla rapidamente tipologia, colore, aperture target, autore e associazione a contatto o opportunita."
      backPath="/azienda/render/persiane"
      newPath="/azienda/render/persiane/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render persiane completati appariranno qui."
      searchPlaceholder="Cerca persiane, colore, apertura, autore..."
      emptyIcon={PanelLeftClose}
      accentClassName="text-green-600"
    />
  );
}
