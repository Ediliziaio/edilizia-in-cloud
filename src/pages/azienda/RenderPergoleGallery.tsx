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
import { ArrowLeft, Image, Plus, GalleryHorizontalEnd, Sun, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function RenderPergoleGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = supabase as any;
  const [search, setSearch] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
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
      return (data ?? []) as {
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
    },
    enabled: !!companyId,
  });

  const filtered = sessions.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const cfg = item.config as { struttura?: { tipo?: string; colore_nome?: string }; copertura?: { tipo?: string }; installazione?: { zona?: string } } | null;
    return (
      (cfg?.struttura?.tipo ?? "").toLowerCase().includes(s) ||
      (cfg?.struttura?.colore_nome ?? "").toLowerCase().includes(s) ||
      (cfg?.copertura?.tipo ?? "").toLowerCase().includes(s) ||
      (cfg?.installazione?.zona ?? "").toLowerCase().includes(s) ||
      format(new Date(item.created_at), "d MMMM yyyy", { locale: it }).toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/pergole")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-emerald-600" />
            Galleria Render Pergole
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} render completati</p>
        </div>
        <Button onClick={() => navigate("/azienda/render/pergole/new")} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo render
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cerca per tipologia, copertura, colore..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Sun className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">I render pergola completati appariranno qui</p>
            </div>
            <Button onClick={() => navigate("/azienda/render/pergole/new")} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const resultUrl = item.result_urls?.[0];
            const cfg = item.config as { struttura?: { tipo?: string }; copertura?: { tipo?: string } } | null;
            return (
              <div key={item.id} className="aspect-video rounded-xl overflow-hidden cursor-pointer hover:ring-2 ring-emerald-400/40 transition-all group relative bg-muted" onClick={() => navigate(`/azienda/render/pergole/gallery/${item.id}`)}>
                {resultUrl ? (
                  <img src={resultUrl} alt="Render pergola" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Image className="h-8 w-8 text-muted-foreground/30" /></div>
                )}
                <div className="absolute bottom-1 left-1 flex gap-1">
                  {cfg?.struttura?.tipo && <Badge variant="secondary" className="text-[10px] capitalize px-1 py-0 bg-black/60 text-white border-0">{cfg.struttura.tipo.replace(/_/g, " ")}</Badge>}
                  {cfg?.copertura?.tipo && <Badge variant="secondary" className="text-[10px] capitalize px-1 py-0 bg-black/40 text-white border-0">{cfg.copertura.tipo.replace(/_/g, " ")}</Badge>}
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
