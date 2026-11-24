import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Waves } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  RenderUnifiedGallery,
  type UnifiedRenderGalleryItem,
} from "@/components/render/RenderUnifiedGallery";
import { getPiscineDb } from "@/modules/render-piscine/lib/dynamicSupabase";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type PiscineConfig = {
  piscina?: { tipo?: string; sistema_bordo?: string; colore_acqua?: string };
  finiture?: { rivestimento_interno?: string; coping?: string; area_perimetrale?: string };
  inserimento?: { zona?: string };
  accessi?: { tipo?: string };
};

type PiscineGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: PiscineConfig | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderPiscineGallery() {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = getPiscineDb();

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-piscine-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await db
        .from("render_piscine_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<PiscineGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as PiscineConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as PiscineGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const tags = compact([
      item.config?.piscina?.tipo,
      item.config?.piscina?.sistema_bordo,
      item.config?.finiture?.rivestimento_interno,
      item.config?.finiture?.coping,
    ]);
    return {
      id: item.id,
      title: item.config?.piscina?.tipo ? t("Piscina {tipo}", { tipo: item.config.piscina.tipo.replace(/_/g, " ") }) : t("Render piscina"),
      date: item.created_at,
      detailPath: `/azienda/render/piscine/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([
        ...tags,
        item.config?.piscina?.colore_acqua,
        item.config?.finiture?.area_perimetrale,
        item.config?.inserimento?.zona,
        item.config?.accessi?.tipo,
      ]).join(" "),
      createdById: item.created_by,
      createdByName: item.meta.createdByName,
      contactId: item.contact_id,
      contactName: item.meta.contactName,
      opportunityId: item.opportunity_id,
      opportunityName: item.meta.opportunityName,
    };
  }), [sessions, t]);

  return (
    <RenderUnifiedGallery
      moduleName={t("Piscine")}
      badgeLabel={t("Galleria piscine")}
      title={t("Render piscine salvati, filtrabili per sistema acqua e CRM.")}
      description={t("Confronta le proposte piscina con tipologia, bordo, rivestimento, autore, data e associazioni commerciali sempre in evidenza.")}
      backPath="/azienda/render/piscine"
      newPath="/azienda/render/piscine/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle={t("Galleria vuota")}
      emptyDescription={t("I render piscina completati appariranno qui.")}
      searchPlaceholder={t("Cerca piscina, sfioro, rivestimento, autore...")}
      emptyIcon={Waves}
      accentClassName="text-teal-600"
    />
  );
}
