import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  RenderUnifiedGallery,
  type UnifiedRenderGalleryItem,
} from "@/components/render/RenderUnifiedGallery";
import { ensureFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";

type FacciataGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: Record<string, unknown> | null;
  foto_analisi: unknown;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

export default function RenderFacciataGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-facciata-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("id, status, original_photo_url, result_urls, config, foto_analisi, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<FacciataGalleryRow, "meta">>;
      const metaSources = rows.map((row) => ({
        created_by: row.created_by,
        contact_id: row.contact_id,
        opportunity_id: row.opportunity_id,
      }));
      const metaMaps = await loadRenderGalleryMeta(metaSources);
      return rows.map((row, index) => ({
        ...row,
        meta: resolveRenderGalleryMeta(metaSources[index], metaMaps),
      })) as FacciataGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const config = ensureFacciataRenderConfig(item.config ?? {}, item.foto_analisi);
    const tags = [
      config.legacy_config.tipo_intervento,
      ...config.replacement_manifest.targetedZones.slice(0, 2),
      ...config.replacement_manifest.activeSystems.slice(0, 1),
    ].filter(Boolean);

    return {
      id: item.id,
      title: config.scene_analysis.buildingType || "Render facciata",
      date: item.created_at,
      detailPath: `/azienda/render/facciata/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: [
        config.legacy_config.tipo_intervento,
        config.scene_analysis.buildingStyle,
        config.scene_analysis.buildingType,
        ...config.replacement_manifest.activeSystems,
        ...config.replacement_manifest.targetedZones,
      ].join(" "),
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
      moduleName="Facciata"
      badgeLabel="Galleria facciate"
      title="Render facciata salvati, filtrabili per zona e CRM."
      description="Ogni proposta di facciata mostra intervento, zone target, autore e collegamenti commerciali senza dover aprire il dettaglio."
      backPath="/azienda/render/facciata"
      newPath="/azienda/render/facciata/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render facciata completati appariranno qui."
      searchPlaceholder="Cerca intervento, zona, autore, contatto..."
      emptyIcon={Building2}
      accentClassName="text-orange-600"
    />
  );
}
