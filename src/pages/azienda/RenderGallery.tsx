import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

type InfissiGalleryRow = {
  id: string;
  title: string | null;
  original_url: string | null;
  render_url: string | null;
  tags: string[] | null;
  config_summary: Record<string, string> | null;
  created_at: string;
  session_id: string | null;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compactStrings = (items: Array<string | null | undefined>) =>
  items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));

function getDisplayTitle(item: InfissiGalleryRow) {
  return item.title || item.config_summary?.materiale || "Render infissi";
}

function getSummaryBadges(item: InfissiGalleryRow) {
  return compactStrings([
    item.config_summary?.materiale,
    item.config_summary?.colore,
    item.config_summary?.tipo,
    ...(item.tags ?? []),
  ]).slice(0, 4);
}

export default function RenderGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: gallery = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_gallery")
        .select("id, title, original_url, render_url, tags, config_summary, created_at, session_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<InfissiGalleryRow, "created_by" | "contact_id" | "opportunity_id" | "meta">>;
      const sessionIds = rows.map((row) => row.session_id).filter(Boolean) as string[];
      const { data: sessions, error: sessionError } = sessionIds.length
        ? await supabase
            .from("render_sessions")
            .select("id, created_by, contact_id, opportunity_id")
            .in("id", sessionIds)
        : { data: [], error: null };
      if (sessionError) throw sessionError;

      const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
      const metaSources = rows.map((row) => {
        const session = row.session_id ? sessionById.get(row.session_id) : null;
        return {
          created_by: session?.created_by ?? null,
          contact_id: session?.contact_id ?? null,
          opportunity_id: session?.opportunity_id ?? null,
        };
      });
      const metaMaps = await loadRenderGalleryMeta(metaSources);

      return rows.map((row, index) => {
        const source = metaSources[index];
        return {
          ...row,
          created_by: source.created_by,
          contact_id: source.contact_id,
          opportunity_id: source.opportunity_id,
          meta: resolveRenderGalleryMeta(source, metaMaps),
        };
      }) as InfissiGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => gallery.map((item) => ({
    id: item.id,
    title: getDisplayTitle(item),
    date: item.created_at,
    detailPath: item.session_id ? `/azienda/render/infissi/gallery/${item.session_id}` : null,
    imageUrl: item.render_url,
    originalUrl: item.original_url,
    tags: getSummaryBadges(item),
    searchableText: compactStrings([
      item.tags?.join(" "),
      item.config_summary ? Object.values(item.config_summary).join(" ") : null,
    ]).join(" "),
    createdById: item.created_by,
    createdByName: item.meta.createdByName,
    contactId: item.contact_id,
    contactName: item.meta.contactName,
    opportunityId: item.opportunity_id,
    opportunityName: item.meta.opportunityName,
  })), [gallery]);

  return (
    <RenderUnifiedGallery
      moduleName="Infissi"
      badgeLabel="Galleria infissi"
      title="Render infissi salvati, filtrabili per data e CRM."
      description="Trova subito il render giusto per cliente, opportunita, autore, materiale o intervallo di date. Ogni card mostra chi lo ha generato e se e collegato al CRM."
      backPath="/azienda/render/infissi"
      newPath="/azienda/render/infissi/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render infissi completati appariranno qui."
      searchPlaceholder="Cerca render, materiale, autore, contatto..."
      accentClassName="text-blue-600"
    />
  );
}
