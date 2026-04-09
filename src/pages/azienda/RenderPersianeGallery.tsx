import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Image,
  Plus,
  GalleryHorizontalEnd,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_CONFIG = {
  pending:    { label: "In coda",         color: "secondary",   icon: Clock },
  processing: { label: "In elaborazione", color: "default",     icon: Zap },
  completed:  { label: "Completato",      color: "secondary",   icon: CheckCircle2 },
  failed:     { label: "Fallito",         color: "destructive", icon: XCircle },
} as const;

export default function RenderPersianeGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-persiane-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_persiane_sessions" as never)
        .select("id, status, original_photo_url, result_urls, config, created_at")
        .eq("company_id" as never, companyId as never)
        .eq("status" as never, "completed" as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
  });

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
            {sessions.length} render completati
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sessions.map((item) => {
            const resultUrl = item.result_urls?.[0];
            const conf = item.config as {
              tipo?: string;
              colore_nome?: string;
            } | null;

            return (
              <div
                key={item.id}
                className="group relative aspect-video rounded-lg overflow-hidden cursor-pointer border hover:border-green-600/50 transition-all hover:shadow-md bg-muted"
                onClick={() =>
                  navigate(`/azienda/render/persiane/gallery/${item.id}`)
                }
              >
                {resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="Render persiane"
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
