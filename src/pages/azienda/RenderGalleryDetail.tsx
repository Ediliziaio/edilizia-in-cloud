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

export default function RenderGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-session-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_sessions")
        .select("*")
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
        provider_key: string | null;
        cost_billed: number | null;
        prompt_used: string | null;
        processing_started_at: string | null;
        processing_completed_at: string | null;
        created_at: string;
        error_message: string | null;
      } | null;
    },
    enabled: !!id && !!companyId,
    refetchInterval: (data) =>
      data?.status === "processing" ? 5_000 : false,
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

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `render_${id}.png`;
    a.click();
  };

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
  const config = session.config as Record<string, unknown> | null;

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
                beforeUrl={originalUrl}
                afterUrl={resultUrl}
                title="Render AI Infissi"
                filename={`render_infissi_${id}.pdf`}
                metadata={[
                  { label: "Data", value: format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: it }) },
                  { label: "Provider", value: session.provider_key },
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
            <img src={resultUrl} alt="Render AI" className="w-full rounded-lg" />
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
                <img
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
        createdBy={(session as { created_by?: string | null }).created_by}
        contactId={(session as { contact_id?: string | null }).contact_id}
        opportunityId={(session as { opportunity_id?: string | null }).opportunity_id}
      />

      {/* Configurazione */}
      {config && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configurazione infissi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(config).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="bg-muted/50 rounded-md p-2">
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {k.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm font-medium capitalize">
                    {String(v).replace(/-/g, " ")}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {session.provider_key && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Zap className="h-3 w-3" />
                  {session.provider_key}
                </Badge>
              )}
              {session.cost_billed != null && (
                <Badge variant="outline" className="text-xs">
                  €{session.cost_billed?.toFixed(3)} addebitato
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
