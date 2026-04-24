import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home } from "lucide-react";
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

type TettoConfig = {
  manto?: { tipo?: string; colore?: string; finitura?: string };
  intervento?: { tipo?: string; scope?: string };
  fotovoltaico?: { attivo?: boolean; tipologia?: string };
  lattonerie?: { materiale?: string; colore?: string };
};

type TettoGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: TettoConfig | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderTettoGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-tetto-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_tetto_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<TettoGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as TettoConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as TettoGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const tags = compact([
      item.config?.manto?.tipo,
      item.config?.manto?.colore,
      item.config?.intervento?.tipo,
      item.config?.fotovoltaico?.attivo ? "fotovoltaico" : null,
    ]);
    return {
      id: item.id,
      title: item.config?.manto?.tipo ? `Tetto ${item.config.manto.tipo.replace(/_/g, " ")}` : "Render tetto",
      date: item.created_at,
      detailPath: `/azienda/render/tetto/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([
        ...tags,
        item.config?.manto?.finitura,
        item.config?.intervento?.scope,
        item.config?.lattonerie?.materiale,
        item.config?.lattonerie?.colore,
        item.config?.fotovoltaico?.tipologia,
      ]).join(" "),
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
      moduleName="Tetto"
      badgeLabel="Galleria tetti"
      title="Render tetto salvati, con lettura tecnica e CRM."
      description="Filtra per manto, fotovoltaico, autore, contatto, opportunita o data e apri il dettaglio commerciale del tetto generato."
      backPath="/azienda/render/tetto"
      newPath="/azienda/render/tetto/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render del tetto completati appariranno qui."
      searchPlaceholder="Cerca tetto, manto, fotovoltaico, autore..."
      emptyIcon={Home}
      accentClassName="text-red-600"
    />
  );
}
