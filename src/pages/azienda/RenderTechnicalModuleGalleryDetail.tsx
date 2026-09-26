import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Image,
  Loader2,
  MessageCircle,
  Share2,
  XCircle,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmSummaryCard } from "@/components/render/RenderCrmSummaryCard";
import { RenderPdfDownloadButton } from "@/components/render/RenderPdfDownloadButton";
import { MandaRenderMobile } from "@/components/render/MandaRenderMobile";
import { useIsMobile } from "@/hooks/use-mobile";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { createRenderOriginalSignedUrl } from "@/lib/render/renderStorage";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";
import {
  getTechnicalRenderModuleSpec,
  summarizeTechnicalConfig,
  type TechnicalRenderConfig,
  type TechnicalRenderModuleId,
} from "@/lib/render/technicalRenderModules";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: "In coda", variant: "secondary", icon: Clock },
  processing: { label: "In elaborazione", variant: "default", icon: Zap },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: XCircle },
} as const;

type TechnicalDetailRow = {
  id: string;
  status: keyof typeof STATUS_CONFIG;
  module_type: TechnicalRenderModuleId;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: TechnicalRenderConfig | null;
  config_snapshot: Record<string, unknown> | null;
  scene_analysis: Record<string, unknown> | null;
  target_map: Record<string, unknown> | null;
  replacement_manifest: Record<string, unknown> | null;
  validation_result: Record<string, unknown> | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
  error_message: string | null;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
};

type DbError = { message?: string } | null;
type DbQuery = {
  select: (columns?: string) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  single: () => PromiseLike<{ data: unknown; error: DbError }>;
};
type DynamicSupabase = { from: (table: string) => DbQuery };

function label(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "Non specificato";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data non disponibile" : format(date, "d MMMM yyyy, HH:mm", { locale: it });
}

export default function RenderTechnicalModuleGalleryDetail({ moduleId }: { moduleId: TechnicalRenderModuleId }) {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = supabase as unknown as DynamicSupabase;
  const spec = getTechnicalRenderModuleSpec(moduleId);
  const hubConfig = renderModuleHubConfigs[moduleId];
  const ModuleIcon = hubConfig.icon;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-technical-detail", companyId, moduleId, id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await db
        .from("render_technical_sessions")
        .select("id, status, module_type, original_photo_url, result_urls, config, config_snapshot, scene_analysis, target_map, replacement_manifest, validation_result, processing_started_at, processing_completed_at, created_at, error_message, created_by, contact_id, opportunity_id")
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("module_type", moduleId)
        .single();
      if (error) throw error;
      return data as TechnicalDetailRow | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      return status === "processing" || status === "pending" ? 5000 : false;
    },
  });

  const { data: originalUrl = null } = useQuery({
    queryKey: ["render-technical-original-signed", session?.original_photo_url],
    queryFn: async () => {
      if (!session?.original_photo_url) return null;
      try {
        return await createRenderOriginalSignedUrl("render-originals", session.original_photo_url, 3600);
      } catch {
        return null;
      }
    },
    enabled: !!session?.original_photo_url,
    staleTime: 50 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Image className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button variant="outline" onClick={() => navigate(`/azienda/render/${moduleId}`)}>Torna alla dashboard</Button>
      </div>
    );
  }

  const resultUrl = session.result_urls?.[0] ?? null;
  const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const cfg = session.config ?? spec.defaultConfig;
  const technicalSummary = [
    { label: "Intervento", value: label(cfg.interventionPreset) },
    { label: "Area target", value: cfg.targetArea },
    { label: "Materiale / sistema", value: cfg.materialOrSystem },
    { label: "Colore / finitura", value: cfg.colorAndFinish },
    { label: "Intensità", value: label(cfg.intensity) },
    { label: "Preservare", value: cfg.preserveNotes },
  ];

  const handleDownload = async () => {
    if (!resultUrl) return;
    try {
      await downloadRenderImage(resultUrl, `render_${moduleId}_${id ?? "session"}_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  };

  const handleShare = () => {
    if (!resultUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ecco il render ${spec.singularLabel}:\n${resultUrl}`)}`, "_blank");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/azienda/render/${moduleId}/gallery`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold max-md:text-lg">
            <ModuleIcon className={`h-5 w-5 ${hubConfig.accentClassName}`} />
            Dettaglio render {spec.label.toLowerCase()}
          </h1>
          <p className="text-xs text-muted-foreground">{formatDate(session.created_at)}</p>
        </div>
        <Badge variant={statusCfg.variant as "default" | "secondary" | "destructive"} className="gap-1">
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {session.status === "processing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className={`h-10 w-10 animate-spin ${hubConfig.accentClassName}`} />
            <p className="font-medium">Render in elaborazione...</p>
            <p className="text-sm text-muted-foreground">La pagina si aggiorna automaticamente.</p>
          </CardContent>
        </Card>
      )}

      {session.status === "failed" && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium text-destructive">Render fallito</p>
            {session.error_message && <p className="max-w-md text-sm text-muted-foreground">{session.error_message}</p>}
          </CardContent>
        </Card>
      )}

      {session.status === "completed" && resultUrl && (
        <Card>
          <CardContent className="py-4">
            {originalUrl ? (
              <BeforeAfterSlider beforeUrl={originalUrl} afterUrl={resultUrl} />
            ) : (
              <div className="overflow-hidden rounded-lg">
                <img loading="lazy" src={resultUrl} alt={`Render ${spec.label}`} className="w-full object-cover" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Telefono: «Manda al cliente» (l'immagine col foglio di condivisione) al posto di link WhatsApp, Condividi, PDF e Scarica. */}

      {isMobile && session.status === "completed" && resultUrl && <MandaRenderMobile resultUrl={resultUrl} nomeFile="render" className="w-full" />}

      {session.status === "completed" && resultUrl && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 max-md:hidden">
          <Button variant="outline" className="gap-2 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={handleShare}>
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Condividi
          </Button>
          <RenderPdfDownloadButton
            beforeUrl={originalUrl}
            afterUrl={resultUrl}
            title={`Render AI ${spec.label}`}
            subtitle="Confronto prima / dopo"
            filename={`render_${moduleId}_${id}.pdf`}
            size="default"
            className="gap-2"
            metadata={[
              { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
              { label: "Modulo", value: spec.label },
              { label: "Intervento", value: label(cfg.interventionPreset) },
              { label: "Area", value: cfg.targetArea },
            ]}
          />
          <Button variant="outline" className="gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      )}

      <RenderCrmSummaryCard
        createdBy={session.created_by}
        contactId={session.contact_id}
        opportunityId={session.opportunity_id}
        sessionId={session.id}
        sessionTable="render_technical_sessions"
        editable
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base max-md:text-[13px]">Scelte tecniche applicate</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {technicalSummary.map((item) => (
            <div key={item.label} className="rounded-lg border p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-medium">{item.value || "Non specificato"}</p>
            </div>
          ))}
          <div className="rounded-lg border p-3 sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dettagli tecnici</p>
            <p className="mt-1 text-sm text-muted-foreground">{cfg.technicalDetails}</p>
          </div>
          {session.processing_started_at && session.processing_completed_at && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Tempo elaborazione: {Math.round((new Date(session.processing_completed_at).getTime() - new Date(session.processing_started_at).getTime()) / 1000)}s
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base max-md:text-[13px]">Controlli backend</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summarizeTechnicalConfig(cfg).slice(0, 6).map((item) => (
            <Badge key={item} variant="outline">{item.replace(/_/g, " ")}</Badge>
          ))}
          {session.validation_result && <Badge variant="secondary">Validazione prompt registrata</Badge>}
          {session.replacement_manifest && <Badge variant="secondary">Manifest backend salvato</Badge>}
        </CardContent>
      </Card>
    </div>
  );
}
