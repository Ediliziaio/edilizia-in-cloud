import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bath } from "lucide-react";
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

type BagnoGalleryRow = {
  id: string;
  galleria_titolo: string | null;
  foto_originale_url: string | null;
  render_result_url: string | null;
  tipo_intervento: string | null;
  salvato_in_galleria: boolean;
  created_at: string;
  user_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

export default function RenderBagnoGallery() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: gallery = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-bagno-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_bagno_sessions")
        .select("id, galleria_titolo, foto_originale_url, render_result_url, tipo_intervento, salvato_in_galleria, created_at, user_id, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("stato", "completato")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Omit<BagnoGalleryRow, "meta">[];
      const metaSources = rows.map((row) => ({
        created_by: row.user_id,
        contact_id: row.contact_id,
        opportunity_id: row.opportunity_id,
      }));
      const metaMaps = await loadRenderGalleryMeta(metaSources);
      return rows.map((row, index) => ({
        ...row,
        meta: resolveRenderGalleryMeta(metaSources[index], metaMaps),
      })) as BagnoGalleryRow[];
    },
    enabled: !!companyId,
  });

  const items = useMemo<UnifiedRenderGalleryItem[]>(() => gallery.map((item) => ({
    id: item.id,
    title: item.galleria_titolo || "Render bagno",
    date: item.created_at,
    detailPath: `/azienda/render/bagno/gallery/${item.id}`,
    imageUrl: item.render_result_url,
    originalUrl: item.foto_originale_url,
    tags: item.tipo_intervento ? [item.tipo_intervento.replace(/_/g, " ")] : [],
    searchableText: item.tipo_intervento ?? undefined,
    createdById: item.user_id,
    createdByName: item.meta.createdByName,
    contactId: item.contact_id,
    contactName: item.meta.contactName,
    opportunityId: item.opportunity_id,
    opportunityName: item.meta.opportunityName,
    imageFit: "contain",
  })), [gallery]);

  return (
    <RenderUnifiedGallery
      moduleName="Bagno"
      badgeLabel="Galleria bagno"
      title="Render bagno salvati, ordinati per cliente e intervento."
      description="Consulta velocemente i render bagno generati, filtra per autore, CRM o data e apri il dettaglio con prima/dopo e scelte tecniche applicate."
      backPath="/azienda/render/bagno"
      newPath="/azienda/render/bagno/new"
      items={items}
      isLoading={isLoading}
      error={error}
      isRefetching={isRefetching}
      onRetry={refetch}
      emptyTitle="Galleria vuota"
      emptyDescription="I render bagno completati appariranno qui."
      searchPlaceholder="Cerca bagno, intervento, autore, contatto..."
      emptyIcon={Bath}
      accentClassName="text-cyan-600"
    />
  );
}
