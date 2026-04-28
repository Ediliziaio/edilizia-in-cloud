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
  ArrowLeft, Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Home,
} from "lucide-react";

import { TettoConfigForm, DEFAULT_TETTO_CONFIG } from "@/components/render-tetto/TettoConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { preloadImage } from "@/lib/render/preloadImage";
import type { ConfigurazioneTetto } from "@/modules/render-tetto/lib/types";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";

// ── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

// ── Polling config ───────────────────────────────────────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 420;

function isIdleTimeoutMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("idle timeout") || normalized.includes("timeout limit") || normalized.includes("150s");
}

const TETTO_TIPS = [
  "L'AI riconosce la geometria del tetto dalla foto e applica la nuova copertura preservando luci e ombre.",
  "Più la foto è nitida e in piano, più il render risulterà realistico.",
  "Puoi rigenerare il render con piccoli ritocchi senza dover ricaricare la foto.",
  "Una volta pronto, potrai scaricarlo o inviarlo direttamente al cliente via WhatsApp.",
];

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderTettoNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ─────────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── CRM linking ───────────────────────────────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  // ── Session ───────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 2: Config ────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ConfigurazioneTetto>(DEFAULT_TETTO_CONFIG);

  // ── Step 3: Processing ────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [pollState, setPollState] = useState<PollState>({ dots: 0, elapsedSec: 0, status: "pending" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    };
  }, []);

  // ── Step 4: Result ────────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  // ── File handling ─────────────────────────────────────────────────────────
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

  // ── Step 1 -> 2: upload ───────────────────────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;
    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_tetto_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "tetto-originals",
        path,
        file: photo,
      });
      setPhotoPath(storagePath);

      const { data: sess, error: sessErr } = await supabase
        .from("render_tetto_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: storagePath,
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
      toast.error(err instanceof Error ? err.message : "Upload foto fallito");
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config, contactId, opportunityId]);

  // ── Polling helpers ───────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (dotsIntervalRef.current) {
      clearInterval(dotsIntervalRef.current);
      dotsIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sid: string) => {
    stopPolling();
    pollCountRef.current = 0;
    elapsedRef.current = 0;

    dotsIntervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setPollState(prev => ({
        ...prev,
        dots: (prev.dots + 1) % 4,
        elapsedSec: elapsedRef.current,
      }));
    }, 1000);

    const poll = async () => {
      if (elapsedRef.current >= MAX_POLL_SEC) {
        stopPolling();
        setGenerating(false);
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova più tardi.");
        setStep(2);
        return;
      }

      const { data: sess } = await supabase
        .from("render_tetto_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      const s = sess as { status: string; result_urls: string[] | null; error_message?: string | null } | null;

      if (s?.status === "completed" && s.result_urls?.length) {
        stopPolling();
        // Pre-load to avoid CDN propagation race causing empty <img>.
        await preloadImage(s.result_urls[0]);
        setResultUrls(s.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-tetto-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        setStep(4);
        return;
      }

      if (s?.status === "failed") {
        stopPolling();
        setGenerating(false);
        toast.error(s.error_message || "Render fallito. Riprova.");
        setStep(2);
        return;
      }

      setPollState(prev => ({ ...prev, status: s?.status ?? "processing" }));
      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, queryClient, stopPolling]);

  // ── Step 2 -> 3: start render ─────────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    if (generating) return;
    setGenerating(true);
    setResultUrls([]);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    try {
    await supabase
      .from("render_tetto_sessions")
      .update({
        config: config,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
      .eq("id", sessionId);

    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    if (photo) {
      try {
        const img = new window.Image();
        img.src = photoPreview ?? "";
        await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
        targetWidth = img.naturalWidth || undefined;
        targetHeight = img.naturalHeight || undefined;
      } catch { /* ignore */ }
    }

    startPolling(sessionId);

    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-roof-render", {
      body: {
        session_id: sessionId,
        config: config,
        ...(targetWidth && targetHeight ? { target_width: targetWidth, target_height: targetHeight } : {}),
      },
      headers,
    });

    if (fnErr || fnData?.error) {
      const msg = await resolveEdgeFunctionErrorMessage({
        error: fnErr,
        data: fnData,
        fallback: "Generazione fallita",
      });
      if (isIdleTimeoutMessage(msg)) {
        toast.info("Render avviato: continuo a controllare lo stato in automatico.");
        return;
      }
      stopPolling();
      setGenerating(false);
      if (msg.includes("insufficient_credits")) {
        toast.error("Crediti render insufficienti. Acquista nuovi crediti.");
      } else {
        toast.error(msg);
      }
      setStep(2);
      return;
    }

    if (fnData?.result_url || fnData?.result_urls) {
      const urls: string[] = fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      stopPolling();
      if (urls[0]) await preloadImage(urls[0]);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-tetto-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }
    } catch (err) {
      stopPolling();
      setGenerating(false);
      setStep(2);
      toast.error(err instanceof Error ? err.message : "Render fallito");
    }
  }, [sessionId, companyId, config, photo, photoPreview, queryClient, startPolling, stopPolling, generating]);

  // ── Download result ───────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_tetto_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  // ── WhatsApp share ────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparirà il tetto con la nuova copertura!\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 4) navigate("/azienda/render/tetto");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 3 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Home className="h-5 w-5 text-red-600" />
            Nuovo render tetto
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto del tetto"}
            {step === 2 && "Configura la nuova copertura"}
            {step === 3 && "Generazione in corso..."}
            {step === 4 && "Render completato!"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* FIX P2.5 + P5.1: banner pre-wizard su saldo crediti */}
      <RenderCreditGate />

      {/* ── Progress stepper ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {["Foto", "Configura", "Elaborazione", "Risultati"].map((label, i) => (
            <span
              key={label}
              className={step === i + 1 ? "text-red-600 font-semibold" : step > i + 1 ? "text-foreground" : ""}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
        <Progress value={(step / 4) * 100} className="h-1.5" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — Foto
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto del tetto attuale
              </CardTitle>
            </CardHeader>
            <CardContent>
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img
                    src={photoPreview}
                    alt="Foto caricata"
                    className="w-full max-h-80 object-cover"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-red-500/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto del tetto</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPG, PNG, WEBP - Max 20 MB - Foto frontale o aerea
                    </p>
                  </div>
                  <Button variant="outline" size="sm" type="button">
                    Sfoglia file
                  </Button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </CardContent>
          </Card>

          <RenderCrmLinker
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
          />

          <Button
            className="w-full bg-red-600 hover:bg-red-700"
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
              "Continua con la configurazione"
            )}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Configurazione
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {photoPreview && (
            <div className="rounded-lg overflow-hidden max-h-48">
              <img src={photoPreview} alt="Foto tetto" className="w-full h-full object-cover" />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurazione nuova copertura</CardTitle>
            </CardHeader>
            <CardContent>
              <TettoConfigForm value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            size="lg"
            onClick={startRender}
          >
            <Zap className="h-4 w-4 mr-2" />
            Genera render tetto
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Elaborazione
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={pollState.elapsedSec}
          dots={pollState.dots}
          accent="red"
          tips={TETTO_TIPS}
          subjectLabel="L'AI sta elaborando il render del tetto"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 4 — Risultato
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700">Render completato!</span>
              </div>

              {photoPreview ? (
                <BeforeAfterSlider
                  beforeSrc={photoPreview}
                  afterSrc={resultUrls[0]}
                  beforeLabel="Prima"
                  afterLabel="Dopo"
                />
              ) : (
                <div className="rounded-lg overflow-hidden">
                  <img
                    src={resultUrls[0]}
                    alt="Render tetto"
                    className="w-full object-cover"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={downloadResult}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
          </div>

          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante tetto"
          />

          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={() => {
              setStep(1);
              setPhoto(null);
              setPhotoPreview(null);
              setPhotoPath(null);
              setSessionId(null);
              setResultUrls([]);
              setConfig(DEFAULT_TETTO_CONFIG);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render tetto
          </Button>
        </div>
      )}
    </div>
  );
}
