import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import {
  ArrowLeft, Download, Share2, Loader2, Image, Home,
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

export default function RenderTettoGalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: session, isLoading } = useQuery({
    queryKey: ["render-tetto-session-detail", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const { data, error } = await supabase
        .from("render_tetto_sessions" as never)
        .select("*")
        .eq("id" as never, id as never)
        .eq("company_id" as never, companyId as never)
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

  // Build signed URL for private tetto-originals bucket
  const { data: originalUrl = null } = useQuery({
    queryKey: ["tetto-original-signed", session?.original_photo_url],
    queryFn: async () => {
      if (!session?.original_photo_url) return null;
      const { data, error } = await supabase.storage
        .from("tetto-originals")
        .createSignedUrl(session.original_photo_url, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!session?.original_photo_url,
    staleTime: 50 * 60 * 1000,
  });

  const resultUrl = session?.result_urls?.[0] ?? null;

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `render_tetto_${id?.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  };

  const handleShare = () => {
    if (!resultUrl) return;
    const text = encodeURIComponent(`Ecco come apparirà il tetto con la nuova copertura!\n${resultUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
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
        <Button variant="outline" onClick={() => navigate("/azienda/render/tetto")}>
          Torna alla dashboard
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const manto = (session.config as { manto?: { tipo?: string; colore_nome?: string; colore_hex?: string } } | null)?.manto;
  const grondaie = (session.config as { grondaie?: { attivo?: boolean; materiale?: string } } | null)?.grondaie;
  const lucernari = (session.config as { lucernari?: { attivo?: boolean; azione?: string } } | null)?.lucernari;
  const pannelli = (session.config as { pannelli_solari?: { attivo?: boolean; tipo?: string } } | null)?.pannelli_solari;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/tetto/gallery")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Home className="h-5 w-5 text-red-600" />
            Dettaglio render tetto
          </h1>
          <p className="text-xs text-muted-foreground">
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
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-red-600 animate-spin" />
            <p className="font-medium">Render in elaborazione...</p>
            <p className="text-sm text-muted-foreground">La pagina si aggiornerà automaticamente</p>
          </CardContent>
        </Card>
      )}

      {/* Failed state */}
      {session.status === "failed" && (
        <Card className="border-destructive/40">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium text-destructive">Render fallito</p>
            {session.error_message && (
              <p className="text-sm text-muted-foreground max-w-md">{session.error_message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Before / After */}
      {session.status === "completed" && resultUrl && (
        <Card>
          <CardContent className="py-4">
            {originalUrl ? (
              <BeforeAfterSlider
                beforeSrc={originalUrl}
                afterSrc={resultUrl}
                beforeLabel="Prima"
                afterLabel="Dopo"
              />
            ) : (
              <div className="rounded-lg overflow-hidden">
                <img src={resultUrl} alt="Render tetto" className="w-full object-cover" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {session.status === "completed" && resultUrl && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            WhatsApp
          </Button>
        </div>
      )}

      {/* Config summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurazione utilizzata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {manto && (
            <div className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full border"
                style={{ backgroundColor: manto.colore_hex ?? "#b5651d" }}
              />
              <div>
                <p className="text-sm font-medium capitalize">{manto.tipo?.replace(/_/g, " ")}</p>
                {manto.colore_nome && (
                  <p className="text-xs text-muted-foreground">{manto.colore_nome}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {grondaie?.attivo && (
              <Badge variant="outline" className="text-xs capitalize">
                Grondaie: {grondaie.materiale}
              </Badge>
            )}
            {lucernari?.attivo && (
              <Badge variant="outline" className="text-xs capitalize">
                Lucernari: {lucernari.azione}
              </Badge>
            )}
            {pannelli?.attivo && (
              <Badge variant="outline" className="text-xs capitalize">
                Pannelli: {pannelli.tipo?.replace(/_/g, " ")}
              </Badge>
            )}
          </div>

          {session.processing_started_at && session.processing_completed_at && (
            <p className="text-xs text-muted-foreground">
              Tempo elaborazione:{" "}
              {Math.round(
                (new Date(session.processing_completed_at).getTime() -
                  new Date(session.processing_started_at).getTime()) /
                  1000
              )}
              s
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
