import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Image,
  Plus,
  GalleryHorizontalEnd,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ensurePersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

export default function RenderPersianeGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

  const { data: sessions = [], isLoading } = useQuery({
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
      const rows = (data ?? []) as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        created_at: string;
        created_by: string | null;
        contact_id: string | null;
        opportunity_id: string | null;
      }[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({ ...row, meta: resolveRenderGalleryMeta(row, metaMaps) }));
    },
    enabled: !!companyId,
  });

  const normalizedSessions = useMemo(
    () =>
      sessions.map((item) => ({
        ...item,
        renderConfig: item.config
          ? ensurePersianeRenderConfig(item.config as Record<string, unknown>)
          : null,
      })),
    [sessions],
  );

  const filtered = normalizedSessions.filter((item) => {
    const s = search.toLowerCase();
    const conf = item.renderConfig?.legacy_config ?? null;
    const matchesSearch = !search || (
      (conf?.tipo ?? "").toLowerCase().includes(s) ||
      (conf?.colore_nome ?? "").toLowerCase().includes(s) ||
      item.renderConfig?.target_selection.targetLabels.join(", ").toLowerCase().includes(s) ||
      (item.meta.createdByName ?? "").toLowerCase().includes(s) ||
      (item.meta.contactName ?? "").toLowerCase().includes(s) ||
      (item.meta.opportunityName ?? "").toLowerCase().includes(s) ||
      format(new Date(item.created_at), "d MMMM yyyy", { locale: it }).toLowerCase().includes(s)
    );
    return matchesSearch &&
      (creatorFilter === "all" || item.created_by === creatorFilter) &&
      (contactFilter === "all" || item.contact_id === contactFilter) &&
      (opportunityFilter === "all" || item.opportunity_id === opportunityFilter);
  });

  const creatorOptions = [...new Map(normalizedSessions.filter((item) => item.created_by && item.meta.createdByName).map((item) => [item.created_by!, item.meta.createdByName!])).entries()];
  const contactOptions = [...new Map(normalizedSessions.filter((item) => item.contact_id && item.meta.contactName).map((item) => [item.contact_id!, item.meta.contactName!])).entries()];
  const opportunityOptions = [...new Map(normalizedSessions.filter((item) => item.opportunity_id && item.meta.opportunityName).map((item) => [item.opportunity_id!, item.meta.opportunityName!])).entries()];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/azienda/render/persiane")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-green-600" />
            Galleria Render Persiane
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} di {normalizedSessions.length} render completati
          </p>
        </div>
        <Button
          className="bg-green-600 hover:bg-green-700"
          onClick={() => navigate("/azienda/render/persiane/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo render
        </Button>
      </div>

      {normalizedSessions.length > 0 && (
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca render, autore, contatto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={creatorFilter} onValueChange={setCreatorFilter}>
            <SelectTrigger><SelectValue placeholder="Creato da" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli autori</SelectItem>
              {creatorOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contactFilter} onValueChange={setContactFilter}>
            <SelectTrigger><SelectValue placeholder="Contatto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i contatti</SelectItem>
              {contactOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={opportunityFilter} onValueChange={setOpportunityFilter}>
            <SelectTrigger><SelectValue placeholder="Opportunità" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte opportunità</SelectItem>
              {opportunityOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : normalizedSessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Image className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">
                I render persiane completati appariranno qui
              </p>
            </div>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => navigate("/azienda/render/persiane/new")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nessun render trovato</p>
              <p className="text-sm text-muted-foreground mt-1">
                Prova con un'altra ricerca per tipo persiana, colore o data.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const resultUrl = item.result_urls?.[0];
            const conf = item.renderConfig?.legacy_config ?? null;

            return (
              <div
                key={item.id}
                className="group relative rounded-lg overflow-hidden cursor-pointer border hover:border-green-600/50 transition-all hover:shadow-md bg-muted min-h-[220px]"
                onClick={() =>
                  navigate(`/azienda/render/persiane/gallery/${item.id}`)
                }
              >
                {resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="Render persiane"
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300 bg-muted/20"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}

                {/* Overlay info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                  <p className="text-white text-xs font-medium truncate">
                    {format(new Date(item.created_at), "d MMM yyyy", {
                      locale: it,
                    })}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {conf?.tipo && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0 capitalize"
                      >
                        {String(conf.tipo).replace(/_/g, " ")}
                      </Badge>
                    )}
                    {conf?.colore_nome && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0"
                      >
                        {String(conf.colore_nome)}
                      </Badge>
                    )}
                    {item.renderConfig?.target_selection.targetLabels[0] && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {item.renderConfig.target_selection.targetLabels.join(", ")}
                      </Badge>
                    )}
                    {item.meta.createdByName && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {item.meta.createdByName}
                      </Badge>
                    )}
                    {item.meta.contactName && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {item.meta.contactName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
