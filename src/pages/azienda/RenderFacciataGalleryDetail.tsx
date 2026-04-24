import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderPdfDownloadButton } from "@/components/render/RenderPdfDownloadButton";
import { RenderCrmSummaryCard } from "@/components/render/RenderCrmSummaryCard";
import { ArrowLeft, Building2, CheckCircle2, Download, Image, Loader2, Share2, XCircle, Zap } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { ensureFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";

const STATUS_CONFIG = {
  pending: { label: "In coda", variant: "secondary", icon: Loader2 },
  processing: { label: "In elaborazione", variant: "default", icon: Zap },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: XCircle },
} as const;

export default function RenderFacciataGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-facciata-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_facciata_sessions")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (query) => {
      const status = (query.state.data as Record<string, unknown> | undefined)?.status;
      return status === "processing" || status === "pending" ? 5000 : false;
    },
  });

  const { data: originalUrl = null } = useQuery({
    queryKey: ["facciata-original-signed", session?.original_photo_url],
    queryFn: async () => {
      const path = session?.original_photo_url;
      if (typeof path !== "string" || !path) return null;
      const { data, error } = await supabase.storage
        .from("facciata-originals")
        .createSignedUrl(path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: typeof session?.original_photo_url === "string" && Boolean(session?.original_photo_url),
    staleTime: 50 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[460px] w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Sessione non trovata</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/azienda/render/facciata")}>
          Torna ai render facciata
        </Button>
      </div>
    );
  }

  const resultUrl = Array.isArray(session.result_urls) ? String(session.result_urls[0] ?? "") : "";
  const status = String(session.status ?? "pending") as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const renderConfig = ensureFacciataRenderConfig(
    (session.config as Record<string, unknown> | null) ?? {},
    session.foto_analisi,
  );

  const handleDownload = async () => {
    if (!resultUrl) return;
    const response = await fetch(resultUrl);
    const blob = await response.blob();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `render_facciata_${id}.png`;
    anchor.click();
  };

  const handleShare = async () => {
    if (!resultUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Render AI — Facciata", url: resultUrl });
    } else {
      await navigator.clipboard.writeText(resultUrl);
      toast.success("Link copiato negli appunti");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/facciata/gallery")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-600" />
            Dettaglio render facciata
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(String(session.created_at)), "d MMMM yyyy, HH:mm", { locale: it })}
          </p>
        </div>
        <Badge variant={statusCfg.variant as "default" | "secondary" | "destructive"} className="gap-1">
          <StatusIcon className={`h-3 w-3 ${status === "processing" || status === "pending" ? "animate-spin" : ""}`} />
          {statusCfg.label}
        </Badge>
      </div>

      {(status === "processing" || status === "pending") && (
        <Card className="border-orange-300 bg-orange-50/50">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
            <div>
              <p className="font-medium">Render in elaborazione</p>
              <p className="text-sm text-muted-foreground">
                La sessione si aggiorna automaticamente mentre applichiamo il nuovo intervento di facciata.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "failed" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Render fallito</p>
              {typeof session.error_message === "string" && session.error_message && (
                <p className="text-sm text-muted-foreground">{session.error_message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {status === "completed" && resultUrl && originalUrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Confronto prima / dopo</CardTitle>
          </CardHeader>
          <CardContent>
            <BeforeAfterSlider beforeUrl={originalUrl} afterUrl={resultUrl} className="rounded-xl" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Condividi
              </Button>
              <RenderPdfDownloadButton
                beforeUrl={originalUrl}
                afterUrl={resultUrl}
                title="Render AI Facciata"
                filename={`render_facciata_${id}.pdf`}
                size="default"
                metadata={[
                  { label: "Data", value: format(new Date(String(session.created_at)), "dd/MM/yyyy HH:mm", { locale: it }) },
                  { label: "Intervento", value: renderConfig.legacy_config.tipo_intervento?.replace(/_/g, " ") },
                ]}
              />
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status !== "completed" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Foto originale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[420px] items-center justify-center rounded-xl bg-muted p-3">
              {originalUrl ? (
                <img src={originalUrl} alt="Originale" className="max-h-[560px] w-full object-contain" />
              ) : (
                <Image className="h-10 w-10 text-muted-foreground/30" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <RenderCrmSummaryCard
        createdBy={typeof session.created_by === "string" ? session.created_by : null}
        contactId={typeof session.contact_id === "string" ? session.contact_id : null}
        opportunityId={typeof session.opportunity_id === "string" ? session.opportunity_id : null}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Scenario letto dall’edificio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{renderConfig.scene_analysis.buildingType}</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.buildingStyle}</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.floorsCount} piani</Badge>
                <Badge variant="secondary">{renderConfig.scene_analysis.currentCondition}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Finitura attuale</p>
                  <p className="mt-1 font-medium">{renderConfig.scene_analysis.currentPlasterFinish}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Colore attuale</p>
                  <p className="mt-1 font-medium">{renderConfig.scene_analysis.currentFacadeColor}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Intervento pianificato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {renderConfig.replacement_manifest.replacements.map((line) => (
                <div key={line} className="rounded-lg border p-3 text-sm">{line}</div>
              ))}
              {renderConfig.replacement_manifest.repaintActions.map((line) => (
                <div key={line} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">{line}</div>
              ))}
            </CardContent>
          </Card>

          {renderConfig.replacement_manifest.removals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Rimozioni e ripristini</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderConfig.replacement_manifest.removals.map((rule) => (
                  <div key={rule.code} className="rounded-lg border p-3 text-sm">
                    <p>{rule.summary}</p>
                    {rule.patchRule && <p className="mt-2 text-xs text-muted-foreground">{rule.patchRule}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Zone coinvolte</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {renderConfig.replacement_manifest.targetedZones.map((zone) => (
                <Badge key={zone} variant="secondary">{zone}</Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Elementi da preservare</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {renderConfig.replacement_manifest.keepExactly.slice(0, 14).map((item) => (
                <Badge key={item} variant="outline">{item}</Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
