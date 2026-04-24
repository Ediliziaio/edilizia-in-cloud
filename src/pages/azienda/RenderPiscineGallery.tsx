import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Image, Plus, GalleryHorizontalEnd, Waves, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getPiscineDb } from "@/modules/render-piscine/lib/dynamicSupabase";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta, type RenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

type PiscineGallerySession = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
};

type PiscineGalleryItem = PiscineGallerySession & { meta: RenderGalleryMeta };

export default function RenderPiscineGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = getPiscineDb();
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

  const { data: sessions = [], isLoading } = useQuery({
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
      const rows = (data ?? []) as PiscineGallerySession[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({ ...row, meta: resolveRenderGalleryMeta(row, metaMaps) })) as PiscineGalleryItem[];
    },
    enabled: !!companyId,
  });

  const filtered = sessions.filter((item) => {
    const s = search.toLowerCase();
    const cfg = item.config as {
      piscina?: { tipo?: string; sistema_bordo?: string; colore_acqua?: string };
      finiture?: { rivestimento_interno?: string; coping?: string; area_perimetrale?: string };
      inserimento?: { zona?: string };
    } | null;
    const matchesSearch = !search || (
      (cfg?.piscina?.tipo ?? "").toLowerCase().includes(s) ||
      (cfg?.piscina?.sistema_bordo ?? "").toLowerCase().includes(s) ||
      (cfg?.piscina?.colore_acqua ?? "").toLowerCase().includes(s) ||
      (cfg?.finiture?.rivestimento_interno ?? "").toLowerCase().includes(s) ||
      (cfg?.finiture?.coping ?? "").toLowerCase().includes(s) ||
      (cfg?.inserimento?.zona ?? "").toLowerCase().includes(s) ||
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

  const creatorOptions = [...new Map(sessions.filter((item) => item.created_by && item.meta.createdByName).map((item) => [item.created_by!, item.meta.createdByName!])).entries()];
  const contactOptions = [...new Map(sessions.filter((item) => item.contact_id && item.meta.contactName).map((item) => [item.contact_id!, item.meta.contactName!])).entries()];
  const opportunityOptions = [...new Map(sessions.filter((item) => item.opportunity_id && item.meta.opportunityName).map((item) => [item.opportunity_id!, item.meta.opportunityName!])).entries()];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/piscine")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-emerald-600" />
            Galleria Render Piscine
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} render completati</p>
        </div>
        <Button onClick={() => navigate("/azienda/render/piscine/new")} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo render
        </Button>
      </div>

      {sessions.length > 0 && (
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cerca tipologia, autore, contatto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Waves className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">I render piscina completati appariranno qui</p>
            </div>
            <Button onClick={() => navigate("/azienda/render/piscine/new")} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const resultUrl = item.result_urls?.[0];
            const cfg = item.config as {
              piscina?: { tipo?: string; sistema_bordo?: string };
              finiture?: { rivestimento_interno?: string };
            } | null;
            return (
              <div key={item.id} className="aspect-video rounded-xl overflow-hidden cursor-pointer hover:ring-2 ring-emerald-400/40 transition-all group relative bg-muted" onClick={() => navigate(`/azienda/render/piscine/gallery/${item.id}`)}>
                {resultUrl ? (
                  <img src={resultUrl} alt="Render piscina" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Image className="h-8 w-8 text-muted-foreground/30" /></div>
                )}
                <div className="absolute bottom-1 left-1 flex max-w-[78%] flex-wrap gap-1">
                  {cfg?.piscina?.tipo && <Badge variant="secondary" className="text-[10px] capitalize px-1 py-0 bg-black/60 text-white border-0">{cfg.piscina.tipo.replace(/_/g, " ")}</Badge>}
                  {cfg?.piscina?.sistema_bordo && <Badge variant="secondary" className="text-[10px] capitalize px-1 py-0 bg-black/40 text-white border-0">{cfg.piscina.sistema_bordo.replace(/_/g, " ")}</Badge>}
                  {cfg?.finiture?.rivestimento_interno && <Badge variant="secondary" className="text-[10px] capitalize px-1 py-0 bg-black/40 text-white border-0">{cfg.finiture.rivestimento_interno.replace(/_/g, " ")}</Badge>}
                  {item.meta.createdByName && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-black/50 text-white border-0">{item.meta.createdByName}</Badge>}
                  {item.meta.contactName && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-primary/80 text-white border-0">{item.meta.contactName}</Badge>}
                </div>
                <div className="absolute bottom-1 right-1">
                  <span className="text-[9px] text-white/80 bg-black/40 px-1 rounded">
                    {format(new Date(item.created_at), "d MMM", { locale: it })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
