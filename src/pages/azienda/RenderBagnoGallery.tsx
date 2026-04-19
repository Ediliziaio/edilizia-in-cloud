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
import { ArrowLeft, Image, Plus, GalleryHorizontalEnd, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function RenderBagnoGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");

  const { data: gallery = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-bagno-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_bagno_sessions" as never)
        .select("id, galleria_titolo, foto_originale_url, render_result_url, tipo_intervento, salvato_in_galleria, created_at")
        .eq("company_id" as never, companyId as never)
        .eq("stato" as never, "completato" as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        galleria_titolo: string | null;
        foto_originale_url: string | null;
        render_result_url: string | null;
        tipo_intervento: string | null;
        salvato_in_galleria: boolean;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
  });

  const filtered = gallery.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (item.galleria_titolo ?? "").toLowerCase().includes(s) ||
      (item.tipo_intervento ?? "").toLowerCase().includes(s) ||
      format(new Date(item.created_at), "d MMMM yyyy", { locale: it }).toLowerCase().includes(s)
    );
  });

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
          <p className="text-sm text-muted-foreground">{filtered.length} render completati</p>
        </div>
        <Button onClick={() => navigate("/azienda/render/bagno/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo render
        </Button>
      </div>

      {gallery.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca render..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 max-w-sm"
          />
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="aspect-video rounded-lg" />)}
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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className="group relative aspect-video rounded-lg overflow-hidden cursor-pointer border hover:border-cyan-400/50 transition-all hover:shadow-md bg-muted"
              onClick={() => navigate(`/azienda/render/bagno/gallery/${item.id}`)}
            >
              {item.render_result_url ? (
                <img
                  src={item.render_result_url}
                  alt={item.galleria_titolo ?? "Render bagno"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                {item.tipo_intervento && (
                  <div className="flex gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px] py-0 capitalize">
                      {item.tipo_intervento.replace(/_/g, " ")}
                    </Badge>
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
