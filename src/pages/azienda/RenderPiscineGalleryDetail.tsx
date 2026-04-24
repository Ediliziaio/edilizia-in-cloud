import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderPdfDownloadButton } from "@/components/render/RenderPdfDownloadButton";
import { RenderCrmSummaryCard } from "@/components/render/RenderCrmSummaryCard";
import {
  ArrowLeft, Download, Share2, MessageCircle, Loader2, Image, Waves,
  CheckCircle2, XCircle, Zap, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getPiscineDb } from "@/modules/render-piscine/lib/dynamicSupabase";

const STATUS_CONFIG = {
  pending: { label: "In coda", variant: "secondary", icon: Clock },
  processing: { label: "In elaborazione", variant: "default", icon: Zap },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: XCircle },
} as const;

function label(value?: string | null) {
  return value ? value.replace(/_/g, " ") : null;
}

type PiscineSessionDetail = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: Record<string, unknown> | null;
  config_snapshot: Record<string, unknown> | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
  error_message: string | null;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export default function RenderPiscineGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = getPiscineDb();

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-piscine-session-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await db
        .from("render_piscine_sessions")
        .select("id, status, original_photo_url, result_urls, config, config_snapshot, processing_started_at, processing_completed_at, created_at, error_message, created_by, contact_id, opportunity_id")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data as PiscineSessionDetail | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (data) => data?.status === "processing" ? 5000 : false,
  });

  const { data: originalUrl = null } = useQuery({
    queryKey: ["piscine-original-signed", session?.original_photo_url],
    queryFn: async () => {
      if (!session?.original_photo_url) return null;
      const { data, error } = await supabase.storage
        .from("piscine-originals")
        .createSignedUrl(session.original_photo_url, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!session?.original_photo_url,
    staleTime: 50 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Image className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button variant="outline" onClick={() => navigate("/azienda/render/piscine")}>Torna alla dashboard</Button>
      </div>
    );
  }

  const resultUrl = session.result_urls?.[0] ?? null;
  const statusCfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const cfg = asObject(session.config);
  const piscina = asObject(cfg.piscina);
  const finiture = asObject(cfg.finiture);
  const comfort = asObject(cfg.comfort);
  const inserimento = asObject(cfg.inserimento);
  const accessori = Array.isArray(comfort.accessori)
    ? comfort.accessori.filter((item): item is string => typeof item === "string")
    : [];

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `render_piscine_${id?.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  };

  const handleShare = () => {
    if (!resultUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ecco il render della nuova piscina!\n${resultUrl}`)}`, "_blank");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/piscine/gallery")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Waves className="h-5 w-5 text-emerald-600" />
            Dettaglio render piscina
          </h1>
          <p className="text-xs text-muted-foreground">{format(new Date(session.created_at), "d MMMM yyyy, HH:mm", { locale: it })}</p>
        </div>
        <Badge variant={statusCfg.variant as "default" | "secondary" | "destructive"} className="gap-1">
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {session.status === "processing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <p className="font-medium">Render in elaborazione...</p>
            <p className="text-sm text-muted-foreground">La pagina si aggiornerà automaticamente</p>
          </CardContent>
        </Card>
      )}

      {session.status === "failed" && (
        <Card className="border-destructive/40">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium text-destructive">Render fallito</p>
            {session.error_message && <p className="text-sm text-muted-foreground max-w-md">{session.error_message}</p>}
          </CardContent>
        </Card>
      )}

      {session.status === "completed" && resultUrl && (
        <Card>
          <CardContent className="py-4">
            {originalUrl ? (
              <BeforeAfterSlider beforeSrc={originalUrl} afterSrc={resultUrl} beforeLabel="Prima" afterLabel="Dopo" />
            ) : (
              <div className="rounded-lg overflow-hidden"><img src={resultUrl} alt="Render piscina" className="w-full object-cover" /></div>
            )}
          </CardContent>
        </Card>
      )}

      {session.status === "completed" && resultUrl && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Button variant="outline" className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleShare}>
            <MessageCircle className="h-4 w-4" />WhatsApp
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" />Condividi
          </Button>
          <RenderPdfDownloadButton
            beforeUrl={originalUrl}
            afterUrl={resultUrl}
            title="Render AI Piscina"
            filename={`render_piscine_${id}.pdf`}
            size="default"
            className="gap-2"
            metadata={[
              { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
              { label: "Tipologia", value: label(asString(piscina.tipo)) },
              { label: "Sistema bordo", value: label(asString(piscina.sistema_bordo)) },
              { label: "Rivestimento", value: label(asString(finiture.rivestimento_interno)) },
            ]}
          />
          <Button variant="outline" className="gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" />Download
          </Button>
        </div>
      )}

      <RenderCrmSummaryCard
        createdBy={session.created_by}
        contactId={session.contact_id}
        opportunityId={session.opportunity_id}
        sessionId={session.id}
        sessionTable="render_piscine_sessions"
        editable
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scelte tecniche applicate</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Piscina</p>
            <p className="font-medium capitalize">{label(asString(piscina.tipo)) ?? "Piscina"}</p>
            <p className="text-muted-foreground capitalize">{label(asString(piscina.forma))} · {label(asString(piscina.dimensione_apparente))}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Acqua e bordo</p>
            <p className="font-medium capitalize">{label(asString(piscina.sistema_bordo)) ?? "Skimmer"}</p>
            <p className="text-muted-foreground capitalize">{label(asString(piscina.colore_acqua))} · {label(asString(finiture.coping))}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rivestimento e solarium</p>
            <p className="font-medium capitalize">{label(asString(finiture.rivestimento_interno)) ?? "Non specificato"}</p>
            <p className="text-muted-foreground capitalize">{label(asString(finiture.area_perimetrale))}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inserimento e comfort</p>
            <p className="font-medium capitalize">{label(asString(inserimento.zona))}</p>
            <p className="text-muted-foreground capitalize">{label(asString(comfort.accesso))} · {label(asString(comfort.illuminazione))}</p>
          </div>
          {accessori.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Accessori scelti</p>
              <div className="flex flex-wrap gap-1.5">
                {accessori.map((item) => (
                  <Badge key={item} variant="outline" className="capitalize">{label(item)}</Badge>
                ))}
              </div>
            </div>
          )}
          {session.processing_started_at && session.processing_completed_at && (
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Tempo elaborazione: {Math.round((new Date(session.processing_completed_at).getTime() - new Date(session.processing_started_at).getTime()) / 1000)}s
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
