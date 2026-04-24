import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid3X3 } from "lucide-react";
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

type PavimentoConfig = {
  tipo?: string;
  colore_nome?: string;
  finitura?: string;
  posa?: string;
  formato?: string;
};

type PavimentoGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: PavimentoConfig | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderPavimentoGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-pavimento-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_pavimento_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<PavimentoGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as PavimentoConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as PavimentoGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const tags = compact([
      item.config?.tipo,
      item.config?.colore_nome,
      item.config?.finitura,
      item.config?.posa,
    ]);
    return {
      id: item.id,
      title: item.config?.tipo ? `Pavimento ${item.config.tipo.replace(/_/g, " ")}` : "Render pavimento",
      date: item.created_at,
      detailPath: `/azienda/render/pavimento/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([item.config?.formato, ...tags]).join(" "),
      createdById: item.created_by,
      createdByName: item.meta.createdByName,
      contactId: item.contact_id,
      contactName: item.meta.contactName,
      opportunityId: item.opportunity_id,
      opportunityName: item.meta.opportunityName,
    };
  }), [sessions]);

  return (
    <RenderUnifiedGallery
      moduleName="Pavimento"
      badgeLabel="Galleria pavimenti"
      title="Render pavimento salvati, con filtri per materiale, data e CRM."
      description="Ritrova ogni proposta di pavimento con materiali, colori, autore e associazioni commerciali sempre visibili sulla card."
      backPath="/azienda/render/pavimento"
      newPath="/azienda/render/pavimento/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render pavimento completati appariranno qui."
      searchPlaceholder="Cerca pavimento, colore, posa, autore..."
      emptyIcon={Grid3X3}
      accentClassName="text-amber-600"
    />
  );
}
