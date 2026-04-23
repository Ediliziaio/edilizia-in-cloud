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
import { ArrowLeft, Building2, GalleryHorizontalEnd, Image, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ensureFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";

export default function RenderFacciataGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-facciata-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("id, status, original_photo_url, result_urls, config, foto_analisi, created_at")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
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
      format(new Date(item.createdAt), "d MMMM yyyy", { locale: it }),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per intervento, zona o tipologia edificio..."
          className="pl-9"
        />
      </div>

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
