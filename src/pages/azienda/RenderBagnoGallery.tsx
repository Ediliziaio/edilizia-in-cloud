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
import { ArrowLeft, Image, Plus, GalleryHorizontalEnd, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

export default function RenderBagnoGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

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
      const rows = (data ?? []) as {
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
      }[];
      const metaSources = rows.map((row) => ({
        created_by: row.user_id,
        contact_id: row.contact_id,
        opportunity_id: row.opportunity_id,
      }));
      const metaMaps = await loadRenderGalleryMeta(metaSources);
      return rows.map((row, index) => ({ ...row, meta: resolveRenderGalleryMeta(metaSources[index], metaMaps) }));
    },
    enabled: !!companyId,
  });

  const filtered = gallery.filter((item) => {
    const s = search.toLowerCase();
    const matchesSearch = !search || (
      (item.galleria_titolo ?? "").toLowerCase().includes(s) ||
      (item.tipo_intervento ?? "").toLowerCase().includes(s) ||
      (item.meta.createdByName ?? "").toLowerCase().includes(s) ||
      (item.meta.contactName ?? "").toLowerCase().includes(s) ||
      (item.meta.opportunityName ?? "").toLowerCase().includes(s) ||
      format(new Date(item.created_at), "d MMMM yyyy", { locale: it }).toLowerCase().includes(s)
    );
    return matchesSearch &&
      (creatorFilter === "all" || item.user_id === creatorFilter) &&
      (contactFilter === "all" || item.contact_id === contactFilter) &&
      (opportunityFilter === "all" || item.opportunity_id === opportunityFilter);
  });
  const showingFilteredResults = Boolean(search.trim() || creatorFilter !== "all" || contactFilter !== "all" || opportunityFilter !== "all");
  const creatorOptions = [...new Map(gallery.filter((item) => item.user_id && item.meta.createdByName).map((item) => [item.user_id!, item.meta.createdByName!])).entries()];
  const contactOptions = [...new Map(gallery.filter((item) => item.contact_id && item.meta.contactName).map((item) => [item.contact_id!, item.meta.contactName!])).entries()];
  const opportunityOptions = [...new Map(gallery.filter((item) => item.opportunity_id && item.meta.opportunityName).map((item) => [item.opportunity_id!, item.meta.opportunityName!])).entries()];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/bagno")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-cyan-600" />
            Galleria Render Bagno
          </h1>
          <p className="text-sm text-muted-foreground">
            {showingFilteredResults ? `${filtered.length} di ${gallery.length}` : filtered.length} render completati
          </p>
        </div>
        <Button onClick={() => navigate("/azienda/render/bagno/new")}>
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
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="aspect-[4/5] rounded-lg" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center" role="alert" aria-live="assertive">
            <AlertTriangle className="h-12 w-12 text-destructive/70" aria-hidden="true" />
            <div>
              <p className="font-medium">Impossibile caricare la galleria</p>
              <p className="text-sm text-muted-foreground mt-1">
                Problema temporaneo. Riprova tra qualche secondo.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : gallery.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Image className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">
                I render bagno completati appariranno qui
              </p>
            </div>
            <Button onClick={() => navigate("/azienda/render/bagno/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
            <Search className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nessun render trovato</p>
              <p className="text-sm text-muted-foreground mt-1">
                Nessun render bagno corrisponde a <span className="font-medium text-foreground">&quot;{search}&quot;</span>.
              </p>
            </div>
            <Button variant="outline" onClick={() => setSearch("")}>
              Azzera ricerca
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className="group relative aspect-[4/5] rounded-lg overflow-hidden cursor-pointer border hover:border-cyan-400/50 transition-all hover:shadow-md bg-muted/40"
              onClick={() => navigate(`/azienda/render/bagno/gallery/${item.id}`)}
            >
              {item.render_result_url ? (
                <img
                  src={item.render_result_url}
                  alt={item.galleria_titolo ?? "Render bagno"}
                  className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}

              {/* Overlay info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                <p className="text-white text-xs font-medium truncate">
                  {item.galleria_titolo ?? format(new Date(item.created_at), "d MMM yyyy", { locale: it })}
                </p>
                {(item.tipo_intervento || item.meta.createdByName || item.meta.contactName) && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.tipo_intervento && (
                    <Badge variant="secondary" className="text-[10px] py-0 capitalize">
                      {item.tipo_intervento.replace(/_/g, " ")}
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
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
