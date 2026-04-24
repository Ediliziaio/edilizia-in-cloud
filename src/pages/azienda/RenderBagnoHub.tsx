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
  Upload, Wand2, Share2, Sparkles, Bath,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_CONFIG = {
  pending:      { label: "In coda",         color: "secondary",   icon: Clock },
  analyzing:    { label: "Analisi",         color: "default",     icon: Wand2 },
  analysis_done:{ label: "Analizzato",      color: "secondary",   icon: CheckCircle2 },
  processing:   { label: "In elaborazione", color: "default",     icon: Zap },
  completato:   { label: "Completato",      color: "secondary",   icon: CheckCircle2 },
  errore:       { label: "Errore",          color: "destructive", icon: XCircle },
} as const;

const HOW_IT_WORKS = [
  {
    icon: Upload,
    title: "1. Carica la foto",
    desc: "Foto del bagno attuale. JPG, PNG o WEBP.",
  },
  {
    icon: Wand2,
    title: "2. Analisi AI",
    desc: "L'AI identifica piastrelle, sanitari, arredi e stato di conservazione.",
  },
  {
    icon: Sparkles,
    title: "3. Configura",
    desc: "Scegli piastrelle, doccia, vasca, mobile, sanitari e rubinetteria.",
  },
  {
    icon: Share2,
    title: "4. Render & condividi",
    desc: "Ottieni un'immagine fotorealistica e condividila con il cliente.",
  },
];

export default function RenderBagnoHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // ── Sessioni recenti (ultime 10) ──────────────────────────────────
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["render-bagno-sessions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_bagno_sessions")
        .select("id, stato, foto_originale_url, render_result_url, configurazione, tipo_intervento, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        stato: string;
        foto_originale_url: string | null;
        render_result_url: string | null;
        configurazione: Record<string, unknown> | null;
        tipo_intervento: string | null;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
    refetchInterval: (query) =>
      (query.state.data as Array<{ stato: string }> | undefined)?.some((s) => s.stato === "processing" || s.stato === "analyzing")
        ? 12_000
        : false,
  });

  // ── Galleria recente (ultime 6) ───────────────────────────────────
  const { data: gallery = [], isLoading: loadingGallery } = useQuery({
    queryKey: ["render-bagno-gallery", companyId, "hub"],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_bagno_sessions")
        .select("id, render_result_url, tipo_intervento, created_at")
        .eq("company_id", companyId)
        .eq("stato", "completato")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        render_result_url: string | null;
        tipo_intervento: string | null;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
  });

  const hasProcessing = sessions.some(
    (s) => s.stato === "processing" || s.stato === "analyzing" || s.stato === "pending",
  );

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">Bagno</span>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600/90 to-cyan-800 p-6 sm:p-8 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bath className="h-5 w-5 text-white/80" />
              <span className="text-sm font-medium text-white/80 uppercase tracking-wider">Render AI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Visualizza il nuovo bagno
              <br className="hidden sm:block" /> sulla foto reale
            </h1>
            <p className="mt-2 text-white/80 text-sm max-w-md">
              Carica una foto, configura piastrelle, sanitari e arredi e ottieni un render
              fotorealistico in pochi secondi.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <div className="sm:hidden">
              <RenderCreditsWidget />
            </div>
            <Button
              size="lg"
              className="bg-white text-cyan-700 hover:bg-white/90 font-semibold gap-2 shadow-lg"
              onClick={() => navigate("/azienda/render/bagno/new")}
            >
              <Plus className="h-4 w-4" />
              Nuovo render
            </Button>
            <Button
              variant="outline"
              className="border-white/50 bg-transparent text-white hover:bg-white/10 hover:text-white gap-2"
              onClick={() => navigate("/azienda/render/bagno/gallery")}
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

      {/* ── Come funziona ────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Come funziona
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-muted/20">
              <CardContent className="py-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-cyan-600" />
                </div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Galleria recente ─────────────────────────────────────── */}
      {(gallery.length > 0 || loadingGallery) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Render recenti
            </h2>
            {gallery.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/render/bagno/gallery")}>
                Vedi tutti
              </Button>
            )}
          </div>
          {loadingGallery ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {gallery.map(item => (
                <div
                  key={item.id}
                  className="aspect-[4/5] rounded-xl overflow-hidden cursor-pointer hover:ring-2 ring-cyan-400/40 transition-all group relative bg-muted/40"
                  onClick={() => navigate(`/azienda/render/bagno/gallery/${item.id}`)}
                >
                  {item.render_result_url ? (
                    <img
                      src={item.render_result_url}
                      alt="Render bagno"
                      className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Image className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  {item.tipo_intervento && (
                    <div className="absolute bottom-1 left-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px] capitalize px-1 py-0 bg-black/60 text-white border-0"
                      >
                        {item.tipo_intervento.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sessioni recenti ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Sessioni di lavoro
            {hasProcessing && (
              <span className="ml-2 inline-flex items-center gap-1 text-cyan-600">
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
                <Bath className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium">Nessun render bagno ancora</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Carica una foto del bagno e configura il nuovo look
                </p>
              </div>
              <Button onClick={() => navigate("/azienda/render/bagno/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Crea il primo render
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => {
              const cfg = STATUS_CONFIG[session.stato as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const previewUrl = session.render_result_url || session.foto_originale_url;
              const isOriginalPreview = Boolean(!session.render_result_url && session.foto_originale_url);

              return (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:border-cyan-400/40 transition-colors"
                  onClick={() => navigate(`/azienda/render/bagno/gallery/${session.id}`)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={isOriginalPreview ? "Foto originale bagno" : "Render bagno"}
                          className={`w-full h-full object-contain ${isOriginalPreview ? "opacity-80" : ""}`}
                        />
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
                        {session.tipo_intervento && (
                          <Badge variant="outline" className="text-xs h-5 capitalize">
                            {session.tipo_intervento.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(session.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                      </p>
                    </div>

                    {session.stato === "processing" && (
                      <Zap className="h-4 w-4 text-cyan-600 animate-pulse shrink-0" />
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
