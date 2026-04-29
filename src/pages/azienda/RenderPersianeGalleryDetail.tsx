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
import { ensurePersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import {
  ArrowLeft,
  Download,
  Share2,
  MessageCircle,
  Loader2,
  Image,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: "In coda", variant: "secondary", icon: Clock },
  processing: { label: "In elaborazione", variant: "default", icon: Zap },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: XCircle },
} as const;

export default function RenderPersianeGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-persiane-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_persiane_sessions")
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
      return status === "processing" || status === "pending" ? 5000 : false;
    },
  });

  const { data: originalUrl = null } = useQuery({
    queryKey: ["persiane-original-signed", session?.original_photo_url],
    queryFn: async () => {
      if (!session?.original_photo_url) return null;
      const { data, error } = await supabase.storage
        .from("persiane-originals")
        .createSignedUrl(session.original_photo_url, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!session?.original_photo_url,
    staleTime: 50 * 60 * 1000,
  });

  const resultUrl = session?.result_urls?.[0] ?? null;
  const renderConfig = useMemo(
    () => (session?.config ? ensurePersianeRenderConfig(session.config as Record<string, unknown>) : null),
    [session?.config],
  );

  const handleDownload = useCallback(async () => {
    if (!resultUrl) return;
    try {
      await downloadRenderImage(resultUrl, `render_persiane_${id ?? "session"}_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrl, id]);

  const handleShare = async () => {
    if (!resultUrl) return;
    if (navigator.share) {
      await navigator.share({
        title: "Render AI - Persiane",
        url: resultUrl,
      });
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

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate("/azienda/render/persiane")}
        >
          Torna ai render
        </Button>
      </div>
    );
  }

  const statusCfg =
    STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/azienda/render/persiane/gallery")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dettaglio render persiane</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(session.created_at), "d MMMM yyyy, HH:mm", { locale: it })}
          </p>
        </div>
        <Badge
          variant={statusCfg.variant as "default" | "secondary" | "destructive"}
          className="gap-1"
        >
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {session.status === "processing" && (
        <Card className="border-green-600/30 bg-green-50/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-green-600" />
            <div>
              <p className="text-sm font-medium">Render in elaborazione</p>
              <p className="text-xs text-muted-foreground">
                La sessione si aggiorna automaticamente: stiamo applicando la sostituzione degli oscuranti senza cambiare la facciata.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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

      {session.status === "completed" && resultUrl && originalUrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Confronto prima / dopo</CardTitle>
            <p className="text-xs text-muted-foreground">
              Il confronto mantiene il rapporto reale della foto originale.
            </p>
          </CardHeader>
          <CardContent>
            <BeforeAfterSlider beforeUrl={originalUrl} afterUrl={resultUrl} />
            <div className="grid grid-cols-2 gap-2 mt-4 sm:grid-cols-4">
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => {
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
                title="Render AI Persiane"
                filename={`render_persiane_${id}.pdf`}
                metadata={[
                  { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
                  { label: "Operazione", value: renderConfig?.legacy_config.operazione ? String(renderConfig.legacy_config.operazione).replace(/_/g, " ") : null },
                ]}
              />
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(session.status !== "completed" || !originalUrl) && session.original_photo_url && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Foto originale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full rounded-lg bg-muted/20 overflow-hidden flex items-center justify-center min-h-[320px]">
              {originalUrl ? (
                <img
                  src={originalUrl}
                  alt="Originale"
                  className="w-full max-h-[70vh] object-contain"
                />
              ) : (
                <Image className="h-10 w-10 text-muted-foreground/30" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {session.status === "completed" && resultUrl && !originalUrl && (
        <Card>
          <CardContent className="p-4">
            <img
              src={resultUrl}
              alt="Render AI Persiane"
              className="w-full max-h-[75vh] object-contain rounded-lg"
            />
            <div className="grid grid-cols-2 gap-2 mt-4 sm:grid-cols-4">
              <RenderPdfDownloadButton
                afterUrl={resultUrl}
                title="Render AI Persiane"
                filename={`render_persiane_${id}.pdf`}
              />
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RenderCrmSummaryCard
        createdBy={session.created_by}
        contactId={session.contact_id}
        opportunityId={session.opportunity_id}
        sessionId={session.id}
        sessionTable="render_persiane_sessions"
        editable
      />

      {renderConfig && (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Scenario letto dalla facciata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{renderConfig.scene_analysis.facadeType}</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.buildingStyle}</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.openingsVisible} aperture visibili</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.imageOrientation}</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {renderConfig.scene_analysis.noteAnalisi}
              </p>
              <div className="space-y-2">
                {renderConfig.scene_analysis.openings.map((opening) => (
                  <div key={opening.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Apertura {opening.label}</p>
                      <Badge variant="outline">{opening.position.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-sm mt-1 capitalize">
                      {opening.existingShutterType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {opening.openingKind.replace(/_/g, " ")} · {opening.materialPerceived} · {opening.colorPerceived}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scelte applicate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {String(renderConfig.legacy_config.operazione ?? "sostituzione").replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {String(renderConfig.legacy_config.tipo ?? "persiane").replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {String(renderConfig.legacy_config.materiale ?? "materiale selezionato").replace(/_/g, " ")}
                  </Badge>
                  {renderConfig.legacy_config.colore_nome ? (
                    <Badge variant="outline" className="capitalize">
                      {String(renderConfig.legacy_config.colore_nome).replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Aperture coinvolte</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderConfig.replacement_manifest.targetOpenings.map((item) => (
                      <Badge key={item.openingId} variant="secondary">
                        Apertura {item.openingId}
                      </Badge>
                    ))}
                  </div>
                </div>
                {renderConfig.replacement_manifest.untouchedOpenings.length > 0 && (
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Aperture intoccate</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {renderConfig.replacement_manifest.untouchedOpenings.map((opening) => (
                        <Badge key={opening.openingId} variant="outline">
                          Apertura {opening.openingId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
