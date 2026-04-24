import { useMemo } from "react";
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
import { BathroomSelectionSummary } from "@/components/render-bagno/BathroomSelectionSummary";
import { ensureBathroomRenderConfig } from "@/modules/render-bagno/lib/bathroomRenderConfig";
import {
  ArrowLeft, Download, Share2, MessageCircle, Loader2, Image,
  CheckCircle2, XCircle, Zap, Clock, Wand2, Bath,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending:      { label: "In coda",         variant: "secondary",   icon: Clock },
  analyzing:    { label: "Analisi",         variant: "default",     icon: Wand2 },
  analysis_done:{ label: "Analizzato",      variant: "secondary",   icon: CheckCircle2 },
  processing:   { label: "In elaborazione", variant: "default",     icon: Zap },
  completato:   { label: "Completato",      variant: "secondary",   icon: CheckCircle2 },
  errore:       { label: "Errore",          variant: "destructive", icon: XCircle },
} as const;

export default function RenderBagnoGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-bagno-session-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_bagno_sessions")
        .select("id, stato, foto_originale_path, foto_originale_url, render_result_url, configurazione, tipo_intervento, analisi_bagno, processing_started_at, processing_completed_at, created_at, galleria_titolo, galleria_note, user_id, contact_id, opportunity_id")
        .eq("id", id)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data as {
        id: string;
        stato: string;
        foto_originale_path: string | null;
        foto_originale_url: string | null;
        render_result_url: string | null;
        configurazione: Record<string, unknown> | null;
        tipo_intervento: string | null;
        analisi_bagno: Record<string, unknown> | null;
        processing_started_at: string | null;
        processing_completed_at: string | null;
        created_at: string;
        galleria_titolo: string | null;
        galleria_note: string | null;
        user_id: string | null;
        contact_id: string | null;
        opportunity_id: string | null;
      } | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.stato === "processing" || d?.stato === "analyzing" ? 5_000 : false;
    },
  });

  // Signed URL for private originals bucket
  const { data: originalUrl = null } = useQuery({
    queryKey: ["render-bagno-original-signed", session?.foto_originale_path],
    queryFn: async () => {
      if (!session?.foto_originale_path) return null;
      const { data, error } = await supabase.storage
        .from("bagno-originals")
        .createSignedUrl(session.foto_originale_path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!session?.foto_originale_path,
    staleTime: 50 * 60 * 1000,
  });

  const resultUrl = session?.render_result_url ?? null;
  const rawConfig = session?.configurazione as Record<string, unknown> | null;
  const originalDisplayUrl = originalUrl || session?.foto_originale_url || null;

  const renderPlan = useMemo(() => {
    if (!rawConfig) return null;
    try {
      return ensureBathroomRenderConfig(rawConfig, session?.analisi_bagno ?? undefined);
    } catch {
      return null;
    }
  }, [rawConfig, session?.analisi_bagno]);

  const sceneHighlights = useMemo(() => {
    if (!renderPlan) return [];
    const scene = renderPlan.scene_analysis;
    return [
      `layout ${scene.layoutType.replace(/_/g, " ")}`,
      `stato ${scene.overallCondition.replace(/_/g, " ")}`,
      scene.shower.present ? `doccia esistente ${scene.shower.type.replace(/_/g, " ")}` : "doccia non evidente",
      scene.bathtub.present ? `vasca esistente ${scene.bathtub.type.replace(/_/g, " ")}` : "vasca non evidente",
      scene.vanity.present ? `mobile ${scene.vanity.type.replace(/_/g, " ")}` : "mobile non evidente",
      scene.windowPresent ? `finestra ${scene.windowPosition.replace(/_/g, " ")}` : "senza finestra visibile",
      renderPlan.photo_meta?.orientation ? `foto ${renderPlan.photo_meta.orientation}` : "",
    ].filter(Boolean);
  }, [renderPlan]);

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `render_bagno_${id}.png`;
    a.click();
  };

  const handleShare = async () => {
    if (!resultUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Render AI — Bagno", url: resultUrl });
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
        <Button className="mt-4" variant="outline" onClick={() => navigate("/azienda/render/bagno")}>
          Torna ai render bagno
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[session.stato as keyof typeof STATUS_CONFIG] ??
    STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/bagno/gallery")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bath className="h-5 w-5 text-cyan-600" />
            Dettaglio render bagno
          </h1>
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
      {session.stato === "processing" && (
        <Card className="border-cyan-400/30 bg-cyan-50/50 dark:bg-cyan-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
            <div>
              <p className="text-sm font-medium">Render in elaborazione...</p>
              <p className="text-xs text-muted-foreground">
                L&apos;AI sta trasformando il bagno. Aggiornamento automatico ogni 5 secondi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {session.stato === "errore" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Render fallito</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si e verificato un errore durante la generazione. Riprova.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Before/After slider */}
      {session.stato === "completato" && resultUrl && originalDisplayUrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Confronto prima/dopo</CardTitle>
            <p className="text-xs text-muted-foreground">Trascina il cursore per confrontare</p>
          </CardHeader>
          <CardContent>
            <BeforeAfterSlider beforeUrl={originalDisplayUrl} afterUrl={resultUrl} className="mx-auto max-h-[78vh]" />
            <div className="flex gap-2 mt-4 justify-end">
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
                beforeUrl={originalDisplayUrl}
                afterUrl={resultUrl}
                title="Render AI Bagno"
                filename={`render_bagno_${id}.pdf`}
                metadata={[
                  { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
                  { label: "Intervento", value: session.tipo_intervento },
                ]}
              />
              <Button variant="secondary" size="sm" onClick={() => navigate(`/azienda/render/bagno/new?template=${session.id}`)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Modifica
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Only render result if no original */}
      {session.stato === "completato" && resultUrl && !originalUrl && (
        <Card>
          <CardContent className="p-4">
            <img src={resultUrl} alt="Render AI Bagno" className="w-full rounded-lg" />
            <div className="flex gap-2 mt-4 justify-end">
              <RenderPdfDownloadButton
                afterUrl={resultUrl}
                title="Render AI Bagno"
                filename={`render_bagno_${id}.pdf`}
              />
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Scarica render
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Original photo while processing */}
      {session.stato !== "completato" && (session.foto_originale_path || session.foto_originale_url) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4" />
              Foto originale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full max-h-[72vh] bg-muted/40 rounded-lg overflow-hidden flex items-center justify-center p-3">
              {originalDisplayUrl ? (
                <img
                  src={originalDisplayUrl}
                  alt="Originale"
                  className="max-h-[68vh] w-full object-contain opacity-80"
                />
              ) : (
                <Image className="h-10 w-10 text-muted-foreground/30" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <RenderCrmSummaryCard
        createdBy={session.user_id}
        contactId={session.contact_id}
        opportunityId={session.opportunity_id}
      />

      {renderPlan && <BathroomSelectionSummary renderPlan={renderPlan} />}

      {/* Public scene summary: no operational prompt or replacement manifest is exposed here. */}
      {renderPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Analisi sintetica della foto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ambiente rilevato
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sceneHighlights.map((item) => (
                  <Badge key={item} variant="secondary" className="capitalize">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
}
