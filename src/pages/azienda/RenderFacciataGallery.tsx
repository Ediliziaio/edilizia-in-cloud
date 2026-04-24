import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, GalleryHorizontalEnd, Image, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ensureFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";
import { loadRenderGalleryMeta, resolveRenderGalleryMeta } from "@/lib/render/renderGalleryMeta";

export default function RenderFacciataGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-facciata-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("id, status, original_photo_url, result_urls, config, foto_analisi, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const metaMaps = await loadRenderGalleryMeta(rows.map((row) => ({
        created_by: typeof row.created_by === "string" ? row.created_by : null,
        contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
        opportunity_id: typeof row.opportunity_id === "string" ? row.opportunity_id : null,
      })));
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta({
          created_by: typeof row.created_by === "string" ? row.created_by : null,
          contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
          opportunity_id: typeof row.opportunity_id === "string" ? row.opportunity_id : null,
        }, metaMaps),
      }));
    },
    enabled: !!companyId,
  });

  const normalized = useMemo(() => sessions.map((item) => {
    const config = ensureFacciataRenderConfig(
      (item.config as Record<string, unknown> | null) ?? {},
      item.foto_analisi,
    );
    return {
      id: String(item.id),
      createdAt: String(item.created_at),
      resultUrl: Array.isArray(item.result_urls) ? String(item.result_urls[0] ?? "") : "",
      createdBy: typeof item.created_by === "string" ? item.created_by : null,
      contactId: typeof item.contact_id === "string" ? item.contact_id : null,
      opportunityId: typeof item.opportunity_id === "string" ? item.opportunity_id : null,
      meta: item.meta as ReturnType<typeof resolveRenderGalleryMeta>,
      config,
    };
  }), [sessions]);

  const filtered = normalized.filter((item) => {
    if (!search.trim()) return true;
    const haystack = [
      item.config.legacy_config.tipo_intervento,
      ...item.config.replacement_manifest.activeSystems,
      ...item.config.replacement_manifest.targetedZones,
      item.config.scene_analysis.buildingType,
      item.config.scene_analysis.buildingStyle,
      item.meta.createdByName,
      item.meta.contactName,
      item.meta.opportunityName,
      format(new Date(item.createdAt), "d MMMM yyyy", { locale: it }),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase()) &&
      (creatorFilter === "all" || item.createdBy === creatorFilter) &&
      (contactFilter === "all" || item.contactId === contactFilter) &&
      (opportunityFilter === "all" || item.opportunityId === opportunityFilter);
  });

  const creatorOptions = [...new Map(normalized.filter((item) => item.createdBy && item.meta.createdByName).map((item) => [item.createdBy!, item.meta.createdByName!])).entries()];
  const contactOptions = [...new Map(normalized.filter((item) => item.contactId && item.meta.contactName).map((item) => [item.contactId!, item.meta.contactName!])).entries()];
  const opportunityOptions = [...new Map(normalized.filter((item) => item.opportunityId && item.meta.opportunityName).map((item) => [item.opportunityId!, item.meta.opportunityName!])).entries()];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/facciata")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-orange-600" />
            Galleria Facciata
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} di {normalized.length} render completati</p>
        </div>
        <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/azienda/render/facciata/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo render
        </Button>
      </div>

      {normalized.length > 0 && (
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca intervento, autore, contatto..."
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

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : normalized.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Building2 className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="mt-1 text-sm text-muted-foreground">I render facciata completati appariranno qui.</p>
            </div>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/azienda/render/facciata/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Search className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nessun render corrisponde al filtro</p>
              <p className="mt-1 text-sm text-muted-foreground">Prova a cercare per intervento, zona o materiale.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer overflow-hidden hover:border-orange-400 transition-colors"
              onClick={() => navigate(`/azienda/render/facciata/gallery/${item.id}`)}
            >
              <div className="flex h-56 items-center justify-center bg-muted p-2">
                {item.resultUrl ? (
                  <img src={item.resultUrl} alt="Render facciata" className="max-h-full w-full object-contain" />
                ) : (
                  <Image className="h-10 w-10 text-muted-foreground/30" />
                )}
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{item.config.legacy_config.tipo_intervento.replace(/_/g, " ")}</Badge>
                  {item.config.replacement_manifest.targetedZones.slice(0, 2).map((zone) => (
                    <Badge key={zone} variant="outline">{zone}</Badge>
                  ))}
                  {item.meta.contactName && <Badge variant="outline">{item.meta.contactName}</Badge>}
                  {item.meta.createdByName && <Badge variant="outline">{item.meta.createdByName}</Badge>}
                </div>
                <div>
                  <p className="font-medium">{item.config.scene_analysis.buildingType}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: it })}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
