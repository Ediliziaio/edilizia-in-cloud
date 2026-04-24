import { useState } from "react";
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
import { ArrowLeft, Sofa, Plus, GalleryHorizontalEnd, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

export default function RenderStanzaGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

  const { data: gallery = [], isLoading } = useQuery({
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
      const rows = (data ?? []) as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        config_summary: Record<string, string> | null;
        created_at: string;
        created_by: string | null;
        contact_id: string | null;
        opportunity_id: string | null;
      }[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      }));
    },
    enabled: !!companyId,
  });

  const filtered = gallery.filter((item) => {
    const s = search.toLowerCase();
    const cfg = item.config as { tipo_stanza?: string; stile_target?: string } | null;
    const matchesSearch = !search || (
      (cfg?.tipo_stanza ?? "").toLowerCase().includes(s) ||
      (cfg?.stile_target ?? "").toLowerCase().includes(s) ||
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

  const creatorOptions = [...new Map(gallery.filter((item) => item.created_by && item.meta.createdByName).map((item) => [item.created_by!, item.meta.createdByName!])).entries()];
  const contactOptions = [...new Map(gallery.filter((item) => item.contact_id && item.meta.contactName).map((item) => [item.contact_id!, item.meta.contactName!])).entries()];
  const opportunityOptions = [...new Map(gallery.filter((item) => item.opportunity_id && item.meta.opportunityName).map((item) => [item.opportunity_id!, item.meta.opportunityName!])).entries()];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/stanza")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-purple-600" />
            Galleria Render Stanza
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} render completati</p>
        </div>
        <Button onClick={() => navigate("/azienda/render/stanza/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo render
        </Button>
      </div>

      {gallery.length > 0 && (
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
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      ) : gallery.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Sofa className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">
                I render stanza completati appariranno qui
              </p>
            </div>
            <Button onClick={() => navigate("/azienda/render/stanza/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => {
            const resultUrl = item.result_urls?.[0];
            const cfg = item.config as { tipo_stanza?: string; stile_target?: string } | null;
            return (
              <div
                key={item.id}
                className="group relative aspect-video rounded-lg overflow-hidden cursor-pointer border hover:border-purple-400/50 transition-all hover:shadow-md bg-muted"
                onClick={() => navigate(`/azienda/render/stanza/gallery/${item.id}`)}
              >
                {resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="Render stanza"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Sofa className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}

                {/* Overlay info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                  <p className="text-white text-xs font-medium truncate">
                    {format(new Date(item.created_at), "d MMM yyyy", { locale: it })}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {cfg?.tipo_stanza && (
                      <Badge variant="secondary" className="text-[10px] py-0 capitalize">
                        {cfg.tipo_stanza.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {cfg?.stile_target && (
                      <Badge variant="secondary" className="text-[10px] py-0 capitalize">
                        {cfg.stile_target.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {item.meta.contactName && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {item.meta.contactName}
                      </Badge>
                    )}
                    {item.meta.createdByName && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {item.meta.createdByName}
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
