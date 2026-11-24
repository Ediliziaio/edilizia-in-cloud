import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  RenderUnifiedGallery,
  type UnifiedRenderGalleryItem,
} from "@/components/render/RenderUnifiedGallery";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";
import {
  getTechnicalRenderModuleSpec,
  summarizeTechnicalConfig,
  type TechnicalRenderConfig,
  type TechnicalRenderModuleId,
} from "@/lib/render/technicalRenderModules";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type TechnicalGalleryRow = {
  id: string;
  status: string;
  module_type: TechnicalRenderModuleId;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: TechnicalRenderConfig | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

type DbError = { message?: string } | null;
type DbQuery = {
  select: (columns?: string) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  order: (column: string, options?: { ascending?: boolean }) => PromiseLike<{ data: unknown; error: DbError }>;
};
type DynamicSupabase = { from: (table: string) => DbQuery };

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

export default function RenderTechnicalModuleGallery({ moduleId }: { moduleId: TechnicalRenderModuleId }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = supabase as unknown as DynamicSupabase;
  const spec = getTechnicalRenderModuleSpec(moduleId);
  const hubConfig = renderModuleHubConfigs[moduleId];

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-technical-gallery", companyId, moduleId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await db
        .from("render_technical_sessions")
        .select("id, status, module_type, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("module_type", moduleId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<TechnicalGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as unknown as TechnicalRenderConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as TechnicalGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const config = item.config;
    const tags = compact([
      config?.interventionPreset,
      config?.targetArea,
      config?.materialOrSystem,
      config?.colorAndFinish,
      config?.intensity,
    ]);
    return {
      id: item.id,
      title: config?.interventionPreset
        ? `${t(spec.label)} · ${config.interventionPreset.replace(/_/g, " ")}`
        : t("Render {tipo}", { tipo: t(spec.singularLabel) }),
      date: item.created_at,
      detailPath: `/azienda/render/${moduleId}/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags: tags.slice(0, 5),
      searchableText: compact([
        ...summarizeTechnicalConfig(config ?? spec.defaultConfig),
        item.meta.createdByName,
        item.meta.contactName,
        item.meta.opportunityName,
      ]).join(" "),
      createdById: item.created_by,
      createdByName: item.meta.createdByName,
      contactId: item.contact_id,
      contactName: item.meta.contactName,
      opportunityId: item.opportunity_id,
      opportunityName: item.meta.opportunityName,
    };
  }), [moduleId, sessions, spec, t]);

  return (
    <RenderUnifiedGallery
      moduleName={t(spec.label)}
      badgeLabel={t("Galleria {label}", { label: t(spec.label).toLowerCase() })}
      title={t(spec.galleryTitle)}
      description={t(spec.galleryDescription)}
      backPath={`/azienda/render/${moduleId}`}
      newPath={`/azienda/render/${moduleId}/new`}
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle={t("Galleria vuota")}
      emptyDescription={t("I render {singularLabel} completati appariranno qui.", { singularLabel: t(spec.singularLabel) })}
      searchPlaceholder={t("Cerca {singularLabel}, materiale, autore, cliente...", { singularLabel: t(spec.singularLabel) })}
      emptyIcon={Image}
      accentClassName={hubConfig.accentClassName}
    />
  );
}
