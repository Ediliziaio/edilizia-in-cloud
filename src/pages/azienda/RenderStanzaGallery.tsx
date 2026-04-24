import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sofa } from "lucide-react";
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

type StanzaConfig = {
  tipo_stanza?: string;
  stile_target?: string;
  intensita?: string;
  pavimento_attivo?: boolean;
};

type StanzaGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: StanzaConfig | null;
  config_summary: Record<string, string> | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderStanzaGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: gallery = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-stanza-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_stanza_sessions")
        .select("id, status, original_photo_url, result_urls, config, config_summary, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<StanzaGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as StanzaConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as StanzaGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => gallery.map((item) => {
    const summaryValues = item.config_summary ? Object.values(item.config_summary) : [];
    const tags = compact([
      item.config?.tipo_stanza,
      item.config?.stile_target,
      item.config?.intensita,
      ...summaryValues.slice(0, 2),
    ]);
    return {
      id: item.id,
      title: item.config?.tipo_stanza ? `Restyling ${item.config.tipo_stanza.replace(/_/g, " ")}` : "Render stanza",
      date: item.created_at,
      detailPath: `/azienda/render/stanza/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([...summaryValues, ...tags]).join(" "),
      createdById: item.created_by,
      createdByName: item.meta.createdByName,
      contactId: item.contact_id,
      contactName: item.meta.contactName,
      opportunityId: item.opportunity_id,
      opportunityName: item.meta.opportunityName,
    };
  }), [gallery]);

  return (
    <RenderUnifiedGallery
      moduleName="Stanza"
      badgeLabel="Galleria stanza"
      title="Render interni salvati, leggibili e collegati al CRM."
      description="Gestisci i restyling stanza con filtri per stile, data, autore, contatto e opportunita, mantenendo chiaro cosa e stato generato."
      backPath="/azienda/render/stanza"
      newPath="/azienda/render/stanza/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render stanza completati appariranno qui."
      searchPlaceholder="Cerca stanza, stile, autore, contatto..."
      emptyIcon={Sofa}
      accentClassName="text-purple-600"
    />
  );
}
