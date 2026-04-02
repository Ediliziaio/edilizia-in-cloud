import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  Image, Plus, GalleryHorizontalEnd, Zap, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_CONFIG = {
  pending:    { label: "In coda",       color: "secondary",    icon: Clock },
  processing: { label: "In elaborazione",color: "default",    icon: Zap },
  completed:  { label: "Completato",    color: "secondary",   icon: CheckCircle2 },
  failed:     { label: "Fallito",       color: "destructive", icon: XCircle },
} as const;

export default function RenderHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-sessions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_sessions" as never)
        .select("id, status, original_photo_url, result_urls, config, provider_key, created_at")
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        provider_key: string | null;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
    refetchInterval: 10_000, // poll per session in processing
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Image className="h-6 w-6 text-primary" />
            Render AI — Infissi
          </h1>
          <p className="text-muted-foreground text-sm">
            Genera render fotorealistici delle facciate con i nuovi infissi
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RenderCreditsWidget />
          <Button variant="outline" onClick={() => navigate("/azienda/render/gallery")}>
            <GalleryHorizontalEnd className="h-4 w-4 mr-2" />
            Galleria
          </Button>
          <Button onClick={() => navigate("/azienda/render/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo render
          </Button>
        </div>
      </div>

      {/* Sessioni recenti */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Sessioni recenti</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
              <Image className="h-14 w-14 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Nessun render ancora</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Carica una foto della facciata e configura i tuoi infissi
                </p>
              </div>
              <Button onClick={() => navigate("/azienda/render/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Crea il primo render
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const cfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const resultUrl = session.result_urls?.[0];
              const config = session.config as { materiale?: string; colore?: string } | null;

              return (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => navigate(`/azienda/render/gallery/${session.id}`)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    {/* Thumbnail — render-results is public; render-originals is private (no direct URL) */}
                    <div className="w-20 h-14 rounded-md overflow-hidden bg-muted shrink-0">
                      {resultUrl ? (
                        <img src={resultUrl} alt="render" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={cfg.color as "default" | "secondary" | "destructive"} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        {config?.materiale && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {config.materiale}
                          </Badge>
                        )}
                        {config?.colore && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {String(config.colore).replace(/-/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(session.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                        {session.provider_key && ` · ${session.provider_key}`}
                      </p>
                    </div>

                    {session.status === "processing" && (
                      <Zap className="h-4 w-4 text-primary animate-pulse shrink-0" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
