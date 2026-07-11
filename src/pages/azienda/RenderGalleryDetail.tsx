import { useCallback, useMemo } from "react";
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
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { ensureWindowRenderConfig } from "@/modules/render/lib/configMapper";
import type { WindowRenderConfig, WindowTechnicalSpecification } from "@/modules/render/lib/types";
import {
  ArrowLeft, Download, Share2, MessageCircle, Loader2, Image,
  CheckCircle2, XCircle, Zap, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending:    { label: "In coda",        variant: "secondary",   icon: Clock },
  processing: { label: "In elaborazione", variant: "default",    icon: Zap },
  completed:  { label: "Completato",     variant: "secondary",   icon: CheckCircle2 },
  failed:     { label: "Fallito",        variant: "destructive", icon: XCircle },
} as const;

const INTERNAL_CONFIG_KEY_RE =
  /(schema|prompt|provider|openai|gemini|model|cost|costo|addeb|billing|token|api|manifest|rules|directives|analysis|analisi)/i;

function formatPublicLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPublicValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return formatPublicLabel(value);
  return null;
}

function fallbackConfigItems(config: Record<string, unknown>) {
  return Object.entries(config)
    .filter(([key, value]) => !INTERNAL_CONFIG_KEY_RE.test(key) && value && typeof value !== "object")
    .map(([key, value]) => ({
      label: formatPublicLabel(key),
      value: formatPublicValue(value),
    }))
    .filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function cassonettoLabel(spec: WindowTechnicalSpecification): string | null {
  if (!spec.cassonetto.replace) return "Cassonetto esistente mantenuto";
  return [
    spec.cassonetto.materialLabel,
    spec.cassonetto.colorLabel,
    spec.cassonetto.dimensionRule ? "dimensioni coerenti con il vano esistente" : null,
  ].filter(Boolean).join(" - ");
}

function tapparellaLabel(spec: WindowTechnicalSpecification): string | null {
  if (!spec.shutter.replace) return "Oscurante esistente mantenuto";
  return [
    formatPublicLabel(spec.shutter.mode),
    spec.shutter.isMotorized ? "motorizzata" : null,
    spec.shutter.colorLabel,
    spec.shutter.placementRule ? "posizionamento realistico nel cassonetto/vano" : null,
  ].filter(Boolean).join(" - ");
}

function hingeLabel(spec: WindowTechnicalSpecification): string {
  if (spec.hingeMode === "none") return "Nessuna cerniera laterale visibile";
  if (spec.hingeMode === "hidden") return "Cerniere a scomparsa, senza elementi laterali visibili";
  return `${spec.hingesPerSash} per anta, finitura ${spec.hingeFinish}`;
}

function specDisplayItems(spec: WindowTechnicalSpecification) {
  return [
    { label: "Tipologia", value: formatPublicValue(spec.desiredOpeningType) },
    { label: "Materiale", value: formatPublicValue(spec.material) },
    {
      label: "Finitura telaio",
      value: [
        spec.finish.name,
        spec.finish.ral ? `RAL ${spec.finish.ral}` : null,
        spec.finish.mode === "legno" ? "effetto legno" : null,
      ].filter(Boolean).join(" - "),
    },
    { label: "Profilo", value: `${formatPublicLabel(spec.profileId)} - ${spec.slimnessLabel}` },
    { label: "Maniglia", value: `${formatPublicLabel(spec.handleStyle)} - ${spec.handleFinish}` },
    { label: "Cerniere", value: hingeLabel(spec) },
    { label: "Cassonetto", value: cassonettoLabel(spec) },
    { label: "Tapparella/oscurante", value: tapparellaLabel(spec) },
    { label: "Vetro", value: spec.glassSpec },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

export default function RenderGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading, isError, refetch } = useQuery({
    queryKey: ["render-session-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_sessions")
        .select("id, status, original_photo_url, result_urls, config, processing_started_at, processing_completed_at, created_at, error_message, created_by, contact_id, opportunity_id")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        processing_started_at: string | null;
        processing_completed_at: string | null;
        created_at: string;
        error_message: string | null;
        created_by: string | null;
        contact_id: string | null;
        opportunity_id: string | null;
      } | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      return status === "processing" || status === "pending" ? 5_000 : false;
    },
  });

  // Build signed URL for private render-originals bucket
  const { data: originalUrl = null } = useQuery({
    queryKey: ["render-original-signed", session?.original_photo_url],
    queryFn: async () => {
      if (!session?.original_photo_url) return null;
      const { data, error } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(session.original_photo_url, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!session?.original_photo_url,
    staleTime: 50 * 60 * 1000, // 50 min (URL valido 60 min)
  });

  const resultUrl = session?.result_urls?.[0] ?? null;
  const rawConfig = session?.config as Record<string, unknown> | null;
  const windowRenderPlan = useMemo<WindowRenderConfig | null>(() => {
    if (!rawConfig) return null;
    try {
      return ensureWindowRenderConfig(rawConfig);
    } catch {
      return null;
    }
  }, [rawConfig]);
  const firstSpec = windowRenderPlan?.technical_specification[0] ?? null;

  const handleDownload = useCallback(async () => {
    if (!resultUrl) return;
    try {
      await downloadRenderImage(resultUrl, `render_${id}_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrl, id]);

  const handleShare = async () => {
    if (!resultUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Render AI — Infissi", url: resultUrl });
    } else {
      await navigator.clipboard.writeText(resultUrl);
      toast.success("Link copiato negli appunti");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-12 text-center space-y-3">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <p className="font-medium">Errore di caricamento</p>
          <p className="text-sm text-muted-foreground">
            Non siamo riusciti a leggere il render. Controlla la connessione e riprova.
          </p>
          <Button onClick={() => refetch()}>Riprova</Button>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/azienda/render/infissi")}>
          Torna ai render
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ??
    STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/infissi/gallery")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dettaglio render</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(session.created_at), "d MMMM yyyy, HH:mm", { locale: it })}
          </p>
        </div>
        <Badge variant={statusCfg.variant as "default" | "secondary" | "destructive"} className="gap-1">
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {/* Processing state */}
      {session.status === "processing" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Render in elaborazione...</p>
              <p className="text-xs text-muted-foreground">
                L&apos;AI sta modificando la foto. Aggiornamento automatico ogni 5 secondi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {session.status === "failed" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Render fallito</p>
              {session.error_message && (
                <p className="text-xs text-muted-foreground mt-0.5">{session.error_message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Before/After slider (solo se completato) */}
      {session.status === "completed" && resultUrl && originalUrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Confronto prima/dopo</CardTitle>
            <p className="text-xs text-muted-foreground">Trascina il cursore per confrontare</p>
          </CardHeader>
          <CardContent>
            <BeforeAfterSlider
              beforeUrl={originalUrl}
              afterUrl={resultUrl}
              className="aspect-video"
            />
            {/* Tap target ≥44px su mobile (h-11): sono le azioni commerciali
                chiave — mostrare/condividere il render al cliente. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 [&_button]:h-11 sm:[&_button]:h-9">
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => {
                  if (!resultUrl) return;
                  const text = encodeURIComponent(`Guarda il render AI che ho creato! ${resultUrl}`);
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Condividi
              </Button>
              <RenderPdfDownloadButton
                beforeUrl={originalUrl}
                afterUrl={resultUrl}
                title="Render AI Infissi"
                filename={`render_infissi_${id}.pdf`}
                metadata={[
                  { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
                  { label: "Tipo", value: firstSpec ? formatPublicValue(firstSpec.desiredOpeningType) : null },
                  { label: "Materiale", value: firstSpec ? formatPublicValue(firstSpec.material) : null },
                  { label: "Finitura", value: firstSpec?.finish.name },
                ]}
              />
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Solo foto render se non c'è originale con signed URL */}
      {session.status === "completed" && resultUrl && !originalUrl && (
        <Card>
          <CardContent className="p-4">
            <img loading="lazy" src={resultUrl} alt="Render AI" className="w-full rounded-lg" />
            <div className="flex gap-2 mt-4 justify-end">
              <RenderPdfDownloadButton
                afterUrl={resultUrl}
                title="Render AI Infissi"
                filename={`render_infissi_${id}.pdf`}
              />
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Foto originale (pending/processing) */}
      {session.status !== "completed" && session.original_photo_url && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Foto originale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              {originalUrl ? (
                <img loading="lazy"
                  src={originalUrl}
                  alt="Originale"
                  className="w-full h-full object-cover opacity-60"
                />
              ) : (
                <Image className="h-10 w-10 text-muted-foreground/30" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <RenderCrmSummaryCard
        createdBy={session.created_by}
        contactId={session.contact_id}
        opportunityId={session.opportunity_id}
        sessionId={session.id}
        sessionTable="render_sessions"
        editable
      />

      {/* Configurazione */}
      {rawConfig && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Scelte infissi e finiture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {windowRenderPlan?.technical_specification.length ? (
              windowRenderPlan.technical_specification.map((spec) => (
                <div key={spec.openingId} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{spec.openingLabel}</Badge>
                    <p className="text-sm font-semibold">
                      {formatPublicLabel(spec.desiredOpeningType)}
                    </p>
                    <Badge variant="outline">{spec.desiredSashCount} ante</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {specDisplayItems(spec).map((item) => (
                      <div key={`${spec.openingId}-${item.label}`} className="rounded-md bg-background p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="text-sm font-medium leading-snug">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fallbackConfigItems(rawConfig).map((item) => (
                  <div key={item.label} className="bg-muted/50 rounded-md p-2">
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {windowRenderPlan?.replacement_manifest.untouchedOpenings.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aperture non modificate
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {windowRenderPlan.replacement_manifest.untouchedOpenings.map((opening) => (
                    <Badge key={opening.openingId} variant="outline">
                      {opening.openingLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {!windowRenderPlan && fallbackConfigItems(rawConfig).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Riepilogo commerciale non disponibile per questa sessione.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
