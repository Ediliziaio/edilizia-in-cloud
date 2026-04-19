import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Loader2,
  Zap,
  CheckCircle2,
  Download,
  Share2,
  RefreshCw,
  Wand2,
} from "lucide-react";

import {
  PersianeConfigForm,
  DEFAULT_PERSIANE_CONFIG,
} from "@/components/render-persiane/PersianeConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import type { ConfigurazionePersiane } from "@/modules/render-persiane/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

// ── Polling intervals (exponential backoff) ──────────────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 180;

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderPersianeNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ──────────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── CRM linking ────────────────────────────────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  // ── Step 2: Config ─────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ConfigurazionePersiane>(DEFAULT_PERSIANE_CONFIG);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 3: Processing ─────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [pollState, setPollState] = useState<PollState>({
    dots: 0,
    elapsedSec: 0,
    status: "pending",
  });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  // ── Cleanup polling ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    };
  }, []);

  // ── Step 4: Result ─────────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setSessionId(null);
    setPhotoPath(null);
  };

  // ── Step 1 -> Step 2: upload ───────────────────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_persiane_original.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("persiane-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);
      setPhotoPath(path);

      // Crea sessione
      const { data: sess, error: sessErr } = await supabase
        .from("render_persiane_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: path,
          config: config,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("Creazione sessione fallita");
      const sid = (sess as { id: string }).id;
      setSessionId(sid);
      setStep(2);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config]);

  // ── Step 2 -> Step 3: start render ─────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;

    setGenerating(true);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    // Aggiorna config nella sessione
    await supabase
      .from("render_persiane_sessions")
      .update({ config: config })
      .eq("id", sessionId);

    // Ottieni dimensioni foto
    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    if (photo) {
      try {
        const img = new window.Image();
        img.src = photoPreview ?? "";
        await new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });
        targetWidth = img.naturalWidth || undefined;
        targetHeight = img.naturalHeight || undefined;
      } catch (_) {
        /* ignore */
      }
    }

    // Invoca generate-shutter-render
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "generate-shutter-render",
      {
        body: {
          session_id: sessionId,
          config: config,
          ...(targetWidth && targetHeight
            ? { target_width: targetWidth, target_height: targetHeight }
            : {}),
        },
      },
    );

    if (fnErr || fnData?.error) {
      const msg =
        fnErr?.message ?? fnData?.message ?? fnData?.error ?? "Generazione fallita";
      setGenerating(false);
      if (msg.includes("insufficient_credits")) {
        toast.error("Crediti render insufficienti. Acquista nuovi crediti.");
      } else {
        toast.error(msg);
      }
      setStep(2);
      return;
    }

    // Se risposta sincrona
    if (fnData?.result_url || fnData?.result_urls) {
      const urls: string[] =
        fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({
        queryKey: ["render-persiane-sessions", companyId],
      });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }

    // Polling
    startPolling(sessionId);
  }, [sessionId, companyId, config, photo, photoPreview, queryClient]);

  const startPolling = useCallback(
    (sid: string) => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
      pollCountRef.current = 0;

      dotsIntervalRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setPollState((prev) => ({
          ...prev,
          dots: (prev.dots + 1) % 4,
          elapsedSec: elapsedRef.current,
        }));
      }, 1000);

      const poll = async () => {
        if (elapsedRef.current >= MAX_POLL_SEC) {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setGenerating(false);
          toast.error(
            "Timeout: il render sta impiegando troppo tempo. Riprova.",
          );
          setStep(2);
          return;
        }

        const { data: sess } = await supabase
          .from("render_persiane_sessions")
          .select("status, result_urls")
          .eq("id", sid)
          .single();

        const s = sess as {
          status: string;
          result_urls: string[] | null;
        } | null;

        if (s?.status === "completed" && s.result_urls?.length) {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setResultUrls(s.result_urls);
          setGenerating(false);
          queryClient.invalidateQueries({
            queryKey: ["render-persiane-sessions", companyId],
          });
          queryClient.invalidateQueries({
            queryKey: ["render-credits", companyId],
          });
          setStep(4);
          return;
        }

        if (s?.status === "failed") {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setGenerating(false);
          toast.error("Render fallito. Riprova.");
          setStep(2);
          return;
        }

        setPollState((prev) => ({
          ...prev,
          status: s?.status ?? "processing",
        }));

        const intervalIdx = Math.min(
          pollCountRef.current,
          POLL_INTERVALS.length - 1,
        );
        pollCountRef.current += 1;
        pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
      };

      poll();
    },
    [companyId, queryClient],
  );

  // ── Download result ────────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_persiane_${Date.now()}.png`;
      a.click();
    } catch (_) {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  // ── WhatsApp share ─────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(
      `Ecco come appariranno le nuove persiane sulla facciata!\n${url}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 4) navigate("/azienda/render/persiane");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 3 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Nuovo render persiane</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto della facciata"}
            {step === 2 && "Configura le persiane"}
            {step === 3 && "Generazione in corso..."}
            {step === 4 && "Render completato!"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* ── Progress stepper ────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {["Foto", "Configura", "Elaborazione", "Risultati"].map(
            (label, i) => (
              <span
                key={label}
                className={
                  step === i + 1
                    ? "text-green-600 font-semibold"
                    : step > i + 1
                      ? "text-foreground"
                      : ""
                }
              >
                {i + 1}. {label}
              </span>
            ),
          )}
        </div>
        <Progress value={(step / 4) * 100} className="h-1.5" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          STEP 1 — Foto
      ══════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto facciata con persiane attuali
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {!photoPreview ? (
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-green-600/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">
                    Clicca per caricare una foto
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG o WEBP. Max 20 MB.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border">
                    <img
                      src={photoPreview}
                      alt="Anteprima"
                      className="w-full max-h-80 object-contain bg-muted/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                      Cambia foto
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <RenderCrmLinker
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
          />

          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            disabled={!photo || uploading}
            onClick={goToStep2}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Caricamento...
              </>
            ) : (
              <>
                Avanti
                <Wand2 className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 2 — Configurazione
      ══════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Photo thumbnail */}
          {photoPreview && (
            <div className="rounded-lg overflow-hidden border h-32">
              <img
                src={photoPreview}
                alt="Originale"
                className="w-full h-full object-cover opacity-70"
              />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configura le persiane
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PersianeConfigForm value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            onClick={startRender}
          >
            <Zap className="h-4 w-4 mr-2" />
            Genera render
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 3 — Processing
      ══════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <Card className="border-green-600/30 bg-green-50/30">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-lg">
                Generazione in corso
                {".".repeat(pollState.dots)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                L&apos;AI sta modificando le persiane sulla facciata
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Tempo trascorso: {pollState.elapsedSec}s
              </p>
            </div>
            <Progress
              value={Math.min((pollState.elapsedSec / 60) * 100, 95)}
              className="w-48 h-1.5"
            />
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 4 — Risultato
      ══════════════════════════════════════════════════════════════ */}
      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card className="border-green-600/30">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700">
                  Render completato con successo!
                </p>
                <p className="text-xs text-muted-foreground">
                  Confronta il prima/dopo e condividi con il cliente
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Before / After */}
          {photoPreview && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Confronto prima/dopo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Trascina il cursore per confrontare
                </p>
              </CardHeader>
              <CardContent>
                <BeforeAfterSlider
                  beforeUrl={photoPreview}
                  afterUrl={resultUrls[0]}
                  className="aspect-video"
                />
              </CardContent>
            </Card>
          )}

          {/* Render image */}
          <Card>
            <CardContent className="p-4">
              <img
                src={resultUrls[0]}
                alt="Render persiane"
                className="w-full rounded-lg"
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={shareWhatsApp}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Condividi
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={downloadResult}>
              <Download className="h-4 w-4 mr-2" />
              Scarica
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/azienda/render/persiane/new")}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render
          </Button>
        </div>
      )}
    </div>
  );
}
