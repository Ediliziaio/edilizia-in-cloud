import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Wand2, Sofa,
} from "lucide-react";

import { StanzaConfigForm, DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

// ── Polling intervals (exponential backoff) ───────────────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 420;

function isIdleTimeoutMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("idle timeout") || normalized.includes("timeout limit") || normalized.includes("150s");
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderStanzaNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ───────────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── CRM linking ─────────────────────────────────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  // ── Session ─────────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 2: Config ──────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ConfigurazioneStanza>(DEFAULT_STANZA_CONFIG);

  // ── Step 3: Processing ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [pollState, setPollState] = useState<PollState>({ dots: 0, elapsedSec: 0, status: "pending" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  // ── Cleanup polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    };
  }, []);

  // ── Step 4: Result ──────────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  // ── File handling ───────────────────────────────────────────────────────────
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

  // ── Step 1 → Step 2: upload ────────────────────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      // 1. Upload foto
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "stanza-originals",
        path,
        file: photo,
      });
      setPhotoPath(storagePath);

      // 2. Crea sessione (status: pending)
      const { data: sess, error: sessErr } = await supabase
        .from("render_stanza_sessions")
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
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config, contactId, opportunityId]);

  // ── Step 2 → Step 3: start render ──────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    if (generating) return;

    setGenerating(true);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    // Update config on session
    await supabase
      .from("render_stanza_sessions")
      .update({ config: config })
      .eq("id", sessionId);

    // Get image dimensions
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

    // Start visible timer/polling before invoking the edge function. The edge
    // now accepts the job quickly, but this also protects the UI if the network
    // request itself becomes slow.
    startPolling(sessionId);

    // Invoke edge function
    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-room-render", {
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

    // Sync response
    if (fnData?.result_url || fnData?.result_urls) {
      const urls: string[] = fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      stopPolling();
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-stanza-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }
  }, [sessionId, companyId, config, photo, photoPreview, queryClient, startPolling, generating]);

  function stopPolling() {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (dotsIntervalRef.current) {
      clearInterval(dotsIntervalRef.current);
      dotsIntervalRef.current = null;
    }
  }

  function startPolling(sid: string) {
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
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        setGenerating(false);
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova.");
        setStep(2);
        return;
      }

      const { data: sess } = await supabase
        .from("render_stanza_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      const s = sess as { status: string; result_urls: string[] | null; error_message?: string | null } | null;

      if (s?.status === "completed" && s.result_urls?.length) {
        stopPolling();
        setResultUrls(s.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-stanza-sessions", companyId] });
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
  }

  // ── Save to gallery ─────────────────────────────────────────────────────────
  const saveToGallery = useCallback(async () => {
    if (!sessionId || !companyId || savedToGallery) return;
    setSavingGallery(true);
    try {
      const configSummary = {
        tipo_stanza: config.tipo_stanza,
        stile_target: config.stile_target,
        intensita: config.intensita,
      };
      const { error } = await supabase
        .from("render_stanza_sessions")
        .update({
          saved_to_gallery: true,
          config_summary: configSummary,
        })
        .eq("id", sessionId);
      if (error) throw error;
      setSavedToGallery(true);
      toast.success("Render salvato in galleria!");
    } catch (err) {
      toast.error(`Salvataggio fallito: ${String(err)}`);
    } finally {
      setSavingGallery(false);
    }
  }, [sessionId, companyId, savedToGallery, config]);

  // ── Download ────────────────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_stanza_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  // ── WhatsApp ────────────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparira la stanza con il nuovo design!\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 4) navigate("/azienda/render/stanza");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 3 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Nuovo render stanza</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto della stanza"}
            {step === 2 && "Configura lo stile e gli interventi"}
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
              className={step === i + 1 ? "text-purple-600 font-semibold" : step > i + 1 ? "text-foreground" : ""}
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
                Foto della stanza
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
                      setSessionId(null);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-purple-500/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-purple-500/60" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto della stanza</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPG, PNG, WEBP &middot; Max 20 MB &middot; Foto frontale per risultati ottimali
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

          {/* Tips */}
          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <p className="text-xs font-semibold mb-1.5">Consigli per il miglior risultato</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Foto frontale della stanza con buona illuminazione</li>
                <li>Pavimento e pareti visibili il piu possibile</li>
                <li>Risoluzione almeno 800x600 px</li>
                <li>Evita foto con persone o animali domestici</li>
              </ul>
            </CardContent>
          </Card>

          <RenderCrmLinker
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
          />

          <Button
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
            disabled={!photo || uploading}
            onClick={goToStep2}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Caricamento in corso...</>
            ) : (
              <><Wand2 className="h-4 w-4" />Carica e configura</>
            )}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Configura
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Foto preview */}
          {photoPreview && (
            <div className="rounded-xl overflow-hidden h-40 relative">
              <img src={photoPreview} alt="Stanza" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium">Foto caricata</div>
            </div>
          )}

          {/* Config form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sofa className="h-4 w-4" />
                Configura la trasformazione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StanzaConfigForm value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
            onClick={startRender}
          >
            <Zap className="h-4 w-4" />
            Genera render AI
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Elaborazione
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          <Card className="border-purple-300/30 bg-purple-50/50 dark:bg-purple-950/20">
            <CardContent className="py-8 flex flex-col items-center gap-6 text-center">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-purple-300/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-purple-100/50 flex items-center justify-center">
                  <Zap className="h-8 w-8 text-purple-600 animate-pulse" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  Render in elaborazione{".".repeat(pollState.dots)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  L&apos;AI sta trasformando la stanza con il nuovo design
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Tempo trascorso: {pollState.elapsedSec}s &middot; Puo richiedere 1-4 minuti
                </p>
              </div>
              <Progress value={Math.min((pollState.elapsedSec / 240) * 100, 95)} className="w-full h-2" />
            </CardContent>
          </Card>

          {photoPreview && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground mb-2">Foto originale caricata</p>
                <img
                  src={photoPreview}
                  alt="Originale"
                  className="w-full max-h-52 object-cover rounded-lg"
                />
              </CardContent>
            </Card>
          )}

          {/* Config summary */}
          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <p className="text-xs font-semibold mb-2">Configurazione applicata</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.tipo_stanza.replace(/_/g, " ")}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.stile_target.replace(/_/g, " ")}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.intensita}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 4 — Risultati
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-400 text-sm">Render completato!</p>
              <p className="text-xs text-green-700 dark:text-green-500">
                Il render fotorealistico della stanza e pronto
              </p>
            </div>
          </div>

          {/* Before/After */}
          {photoPreview && resultUrls[0] && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Confronto Prima / Dopo</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <BeforeAfterSlider
                  beforeUrl={photoPreview}
                  afterUrl={resultUrls[0]}
                />
              </CardContent>
            </Card>
          )}

          {resultUrls[0] && !photoPreview && (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <img
                  src={resultUrls[0]}
                  alt="Render AI"
                  className="w-full object-cover"
                />
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={downloadResult}>
              <Download className="h-4 w-4" />
              Scarica
            </Button>
            <Button variant="outline" className="gap-2" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
          </div>

          <Button
            className="w-full gap-2"
            variant={savedToGallery ? "secondary" : "default"}
            disabled={savedToGallery || savingGallery}
            onClick={saveToGallery}
          >
            {savingGallery ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Salvataggio...</>
            ) : savedToGallery ? (
              <><CheckCircle2 className="h-4 w-4" />Salvato in galleria</>
            ) : (
              "Salva in galleria"
            )}
          </Button>

          <Separator />

          {/* Config summary */}
          <Card className="bg-muted/30">
            <CardContent className="py-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Configurazione applicata</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {config.tipo_stanza.replace(/_/g, " ")}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  Stile: {config.stile_target.replace(/_/g, " ")}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {config.intensita}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStep(1);
                setPhoto(null);
                setPhotoPreview(null);
                setPhotoPath(null);
                setSessionId(null);
                setResultUrls([]);
                setSavedToGallery(false);
                setConfig(DEFAULT_STANZA_CONFIG);
              }}
            >
              Nuovo render
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate("/azienda/render/stanza/gallery")}
            >
              Vai alla galleria
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
