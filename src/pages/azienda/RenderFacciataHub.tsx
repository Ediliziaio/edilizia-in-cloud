import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  Building2,
  CheckCircle2,
  GalleryHorizontalEnd,
  Image,
  PaintbrushVertical,
  Plus,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ensureFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";

const HOW_IT_WORKS = [
  {
    icon: Upload,
    title: "1. Carica la facciata",
    desc: "Partiamo dalla foto reale dell’edificio, senza perdere contesto e proporzioni.",
  },
  {
    icon: Wand2,
    title: "2. Analisi AI",
    desc: "Leggiamo piani, aperture, dettagli architettonici, contesto e finitura esistente.",
  },
  {
    icon: PaintbrushVertical,
    title: "3. Configura l’intervento",
    desc: "Definisci intonaco, rivestimenti, cappotto e dettagli con targeting di zona.",
  },
  {
    icon: Sparkles,
    title: "4. Render professionale",
    desc: "Ottieni una fotografia credibile dell’edificio dopo l’intervento.",
  },
];

const STATUS_CONFIG = {
  pending: { label: "In coda", variant: "secondary", icon: Zap },
  processing: { label: "In elaborazione", variant: "default", icon: Zap },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: Zap },
} as const;

export default function RenderFacciataHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-facciata-sessions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("id, status, original_photo_url, result_urls, config, foto_analisi, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: !!companyId,
    refetchInterval: (query) => {
      const rows = (query.state.data as Array<Record<string, unknown>> | undefined) ?? [];
      return rows.some((row) => row.status === "processing" || row.status === "pending") ? 12000 : false;
    },
  });

  const normalized = sessions.map((row) => {
    const config = ensureFacciataRenderConfig(
      (row.config as Record<string, unknown> | null) ?? {},
      row.foto_analisi,
    );
    return {
      id: String(row.id),
      status: String(row.status ?? "pending") as keyof typeof STATUS_CONFIG,
      createdAt: String(row.created_at),
      resultUrl: Array.isArray(row.result_urls) ? String(row.result_urls[0] ?? "") : "",
      config,
    };
  });

  const hasProcessing = normalized.some((item) => item.status === "processing" || item.status === "pending");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">Facciata</span>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-orange-600 p-6 sm:p-8 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white" />
        </div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-white/80" />
              <span className="text-sm font-medium uppercase tracking-wider text-white/80">Render AI</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              Rinnova la facciata
              <br className="hidden sm:block" /> del tuo edificio reale
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              Gestisci tinteggiatura, rivestimenti, cappotto termico e dettagli architettonici mantenendo la stessa casa, la stessa facciata e la stessa prospettiva.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" className="bg-white text-orange-600 hover:bg-white/90" onClick={() => navigate("/azienda/render/facciata/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo render
            </Button>
            <Button variant="outline" className="border-white/40 text-white hover:bg-white/10" onClick={() => navigate("/azienda/render/facciata/gallery")}>
              <GalleryHorizontalEnd className="mr-2 h-4 w-4" />
              Galleria
            </Button>
          </div>
          <div className="sm:absolute sm:right-4 sm:top-4">
            <RenderCreditsWidget />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HOW_IT_WORKS.map(({ icon: Icon, title, desc }) => (
          <Card key={title}>
            <CardContent className="space-y-2 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                <Icon className="h-4 w-4 text-orange-600" />
              </div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <Thermometer className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium">Cappotto e imbotti</p>
                <p className="text-sm text-muted-foreground">Profondità vani, davanzali e raccordi coerenti.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <PaintbrushVertical className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium">Finiture leggibili</p>
                <p className="text-sm text-muted-foreground">Intonaci, rivestimenti e zoccolature con fisicità credibile.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium">Contesto protetto</p>
                <p className="text-sm text-muted-foreground">Cielo, strada, vegetazione e volumi restano invariati.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sessioni recenti
            {hasProcessing && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-600">
                <Zap className="h-3 w-3 animate-pulse" />
                In elaborazione
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
          </div>
        ) : normalized.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <Image className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Nessun render facciata ancora</p>
                <p className="mt-1 text-sm text-muted-foreground">Carica una foto e configuriamo il primo intervento.</p>
              </div>
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/azienda/render/facciata/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Crea il primo render
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {normalized.map((session) => {
              const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:border-orange-400 transition-colors"
                  onClick={() => navigate(`/azienda/render/facciata/gallery/${session.id}`)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {session.resultUrl ? (
                        <img src={session.resultUrl} alt="render" className="max-h-full w-full object-contain" />
                      ) : (
                        <Image className="h-5 w-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={cfg.variant as "default" | "secondary" | "destructive"} className="gap-1 text-xs">
                          <StatusIcon className={`h-3 w-3 ${session.status === "processing" || session.status === "pending" ? "animate-pulse" : ""}`} />
                          {cfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {session.config.legacy_config.tipo_intervento.replace(/_/g, " ")}
                        </Badge>
                        {session.config.replacement_manifest.targetedZones.slice(0, 2).map((zone) => (
                          <Badge key={zone} variant="outline" className="text-xs">{zone}</Badge>
                        ))}
                      </div>
                      <p className="mt-1 text-sm font-medium">{session.config.scene_analysis.buildingType}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(session.createdAt), "d MMM yyyy, HH:mm", { locale: it })}</p>
                    </div>
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
