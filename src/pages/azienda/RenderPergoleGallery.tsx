import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun } from "lucide-react";
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

type DbError = { message?: string } | null;
type DbQuery = {
  select: (columns?: string) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  order: (column: string, options?: { ascending?: boolean }) => DbQuery;
  then: <TResult1 = { data: unknown; error: DbError }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: DbError }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => PromiseLike<TResult1 | TResult2>;
};
type DynamicSupabase = { from: (table: string) => DbQuery };

type PergoleConfig = {
  struttura?: { tipo?: string; colore_nome?: string; materiale?: string };
  copertura?: { tipo?: string; stato?: string };
  installazione?: { zona?: string; tipologia?: string };
  chiusure?: { tipo?: string; stato?: string };
};

type PergoleGalleryRow = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: PergoleConfig | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

export default function RenderPergoleGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = supabase as unknown as DynamicSupabase;

  const { data: sessions = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-pergole-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await db
        .from("render_pergole_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Omit<PergoleGalleryRow, "config" | "meta"> & { config: Record<string, unknown> | null }>;
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        config: row.config as PergoleConfig | null,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as PergoleGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => sessions.map((item) => {
    const tags = compact([
      item.config?.installazione?.tipologia,
      item.config?.struttura?.tipo,
      item.config?.copertura?.tipo,
      item.config?.chiusure?.tipo,
    ]);
    return {
      id: item.id,
      title: item.config?.struttura?.tipo ? `Pergola ${item.config.struttura.tipo.replace(/_/g, " ")}` : "Render pergola",
      date: item.created_at,
      detailPath: `/azienda/render/pergole/gallery/${item.id}`,
      imageUrl: item.result_urls?.[0] ?? null,
      originalUrl: item.original_photo_url,
      tags,
      searchableText: compact([
        ...tags,
        item.config?.struttura?.colore_nome,
        item.config?.struttura?.materiale,
        item.config?.copertura?.stato,
        item.config?.installazione?.zona,
        item.config?.chiusure?.stato,
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
      moduleName="Pergole"
      badgeLabel="Galleria pergole"
      title="Render pergole salvati, organizzati per sistema e CRM."
      description="Vedi subito tipologia, copertura, chiusure, autore e collegamenti commerciali di ogni proposta outdoor."
      backPath="/azienda/render/pergole"
      newPath="/azienda/render/pergole/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render pergola completati appariranno qui."
      searchPlaceholder="Cerca pergola, copertura, zona, autore..."
      emptyIcon={Sun}
      accentClassName="text-emerald-600"
    />
  );
}
