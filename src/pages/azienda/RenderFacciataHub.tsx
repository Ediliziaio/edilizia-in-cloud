import { useNavigate, Link } from "react-router-dom";
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
  Upload, Wand2, Share2, Sparkles, Building2,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_CONFIG = {
  pending:    { label: "In coda",         color: "secondary",    icon: Clock },
  processing: { label: "In elaborazione", color: "default",      icon: Zap },
  completed:  { label: "Completato",      color: "secondary",    icon: CheckCircle2 },
  failed:     { label: "Fallito",         color: "destructive",  icon: XCircle },
} as const;

const HOW_IT_WORKS = [
  {
    icon: Upload,
    title: "1. Carica la foto",
    desc: "Foto frontale della facciata dell'edificio. JPG, PNG o WEBP.",
  },
  {
    icon: Wand2,
    title: "2. Analisi AI",
    desc: "L'AI identifica edificio, piani, intonaco attuale e stato conservazione.",
  },
  {
    icon: Sparkles,
    title: "3. Configura",
    desc: "Scegli intonaco, rivestimento, cappotto e dettagli architettonici.",
  },
  {
    icon: Share2,
    title: "4. Render & condividi",
    desc: "Ottieni un'immagine fotorealistica e condividila con il cliente.",
  },
];

export default function RenderFacciataHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // ── Sessioni recenti (ultime 10) ─────────────────────────────────────────────
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["render-facciata-sessions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);
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
    refetchInterval: (query) =>
      (query.state.data as Array<{ status: string }> | undefined)?.some(s => s.status === "processing")
        ? 12_000
        : false,
  });

  const hasProcessing = sessions.some(s => s.status === "processing");

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">Facciata</span>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-orange-600 p-6 sm:p-8 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-white/80" />
              <span className="text-sm font-medium text-white/80 uppercase tracking-wider">Render AI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Rinnova la facciata
              <br className="hidden sm:block" /> del tuo edificio
            </h1>
            <p className="mt-2 text-white/80 text-sm max-w-md">
              Carica una foto, configura intonaco, rivestimento e cappotto, e ottieni
              un render fotorealistico in pochi secondi.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <div className="sm:hidden">
              <RenderCreditsWidget />
            </div>
            <Button
              size="lg"
              className="bg-white text-orange-600 hover:bg-white/90 font-semibold gap-2 shadow-lg"
              onClick={() => navigate("/azienda/render/facciata/new")}
            >
              <Plus className="h-4 w-4" />
              Nuovo render
            </Button>
            <Button
              variant="outline"
              className="border-white/40 text-white hover:bg-white/10 gap-2"
              onClick={() => navigate("/azienda/render/facciata/gallery")}
            >
              <GalleryHorizontalEnd className="h-4 w-4" />
              Galleria
            </Button>
          </div>
          <div className="hidden sm:block absolute top-4 right-4">
            <RenderCreditsWidget />
          </div>
        </div>
      </div>

      {/* ── Come funziona ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Come funziona
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-muted/20">
              <CardContent className="py-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-orange-600" />
                </div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Sessioni recenti ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Sessioni di lavoro
            {hasProcessing && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-600">
                <Zap className="h-3 w-3 animate-pulse" />
                In elaborazione
              </span>
            )}
          </h2>
        </div>

        {loadingSessions ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Image className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium">Nessun render facciata ancora</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Carica una foto della facciata e configura il tuo intervento
                </p>
              </div>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={() => navigate("/azienda/render/facciata/new")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Crea il primo render
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => {
              const cfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const resultUrl = session.result_urls?.[0];
              const tipoIntervento = (session.config as { tipo_intervento?: string } | null)?.tipo_intervento;

              return (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:border-orange-400 transition-colors"
                  onClick={() => navigate(`/azienda/render/facciata/gallery/${session.id}`)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-16 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                      {resultUrl ? (
                        <img src={resultUrl} alt="render" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={cfg.color as "default" | "secondary" | "destructive"}
                          className="gap-1 text-xs h-5"
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </Badge>
                        {tipoIntervento && (
                          <Badge variant="outline" className="text-xs h-5 capitalize">
                            {tipoIntervento.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(session.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                      </p>
                    </div>
                    {session.status === "processing" && (
                      <Zap className="h-4 w-4 text-orange-600 animate-pulse shrink-0" />
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
