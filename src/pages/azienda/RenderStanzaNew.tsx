import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Wand2, Sofa, ImagePlus, Camera,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ZonaFotoMobile } from "@/components/render/ZonaFotoMobile";
import { MandaRenderMobile } from "@/components/render/MandaRenderMobile";

import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";
import { StanzaConfigForm, DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { preloadImage } from "@/lib/render/preloadImage";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
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

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

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
      toast.error(err instanceof Error ? err.message : "Upload foto fallito");
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config, contactId, opportunityId]);

  // ── Polling helpers (declared before startRender so the callback can capture them stably) ──
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
        if (s.result_urls[0]) await preloadImage(s.result_urls[0]);
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
  }, [companyId, queryClient, stopPolling]);

  // ── Step 2 → Step 3: start render ──────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    if (generating) return;

    setGenerating(true);
    setResultUrls([]);
    setSavedToGallery(false);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    try {
    // Update config on session
    await supabase
      .from("render_stanza_sessions")
      .update({
        config: config,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
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
      if (urls[0]) await preloadImage(urls[0]);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-stanza-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isIdleTimeoutMessage(msg)) {
        toast.info("Render avviato: continuo a controllare lo stato in automatico.");
        return;
      }
      stopPolling();
      setGenerating(false);
      setStep(2);
      toast.error(msg || "Render fallito");
    }
  }, [sessionId, companyId, config, photo, photoPreview, queryClient, startPolling, stopPolling, generating]);

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
      await downloadRenderImage(url, `render_stanza_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
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

  const isMobile = useIsMobile();
  const nuovoRender = () => {
    setStep(1);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoPath(null);
    setSessionId(null);
    setResultUrls([]);
    setSavedToGallery(false);
    setConfig(DEFAULT_STANZA_CONFIG);
  };

  // A ogni passo si riparte dalla testata (prima si restava a metà pagina).
  const radiceRef = useRef<HTMLDivElement>(null);
  const primoPassoRef = useRef(true);
  useEffect(() => {
    if (primoPassoRef.current) {
      primoPassoRef.current = false;
      return;
    }
    radiceRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  return (
    <div ref={radiceRef} className="space-y-6 max-w-2xl mx-auto pb-12 scroll-mt-3 max-md:space-y-3">
      <RenderWizardHeader
        onBack={() => {
          if (step === 1 || step === 4) navigate("/azienda/render/stanza");
          else if (step === 2) setStep(1);
          else if (step === 3 && !generating) setStep(2);
        }}
        eyebrow="Restyling stanza fotorealistico"
        title="Stessa stanza, nuovo stile"
        mobileTitle="Render Stanza"
        description="Cambia colori, finiture e arredi mantenendo struttura e proporzioni della stanza originale."
        badgeLabel="Render AI — Stanze"
        stepLabels={["Foto", "Configura", "Elaborazione", "Risultati"]}
        currentStep={step}
        accent="violet"
      />
      {/* Telefono: il saldo non occupa una riga (se finisce, avvisa il RenderCreditGate). */}
      <div className="flex justify-end max-md:hidden">
        <RenderCreditsWidget />
      </div>

      {/* FIX P2.5 + P5.1: banner pre-wizard su saldo crediti */}
      <RenderCreditGate />

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — Foto
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4 max-md:space-y-3">
          {isMobile && !photoPreview ? (
            <>
              <ZonaFotoMobile
                onScegli={() => fileRef.current?.click()}
                suggerimento="Frontale e luminosa, con pareti e pavimento visibili"
                accento="violet"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          ) : (
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto della stanza
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img loading="lazy"
                    src={photoPreview}
                    alt="Foto caricata"
                    className="w-full max-h-80 object-cover"
                  />
                  {/* Telefono: una pastiglia leggera sulla foto invece del bottone pieno. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 max-md:right-2 max-md:top-2 max-md:h-8 max-md:rounded-full max-md:bg-black/55 max-md:px-3 max-md:text-[13px] max-md:text-white max-md:backdrop-blur-sm max-md:hover:bg-black/65"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                      setSessionId(null);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 max-md:hidden" />
                    <Camera className="hidden h-3.5 w-3.5 max-md:block" />
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
          )}

          {/* Tips — telefono: la riga nella zona foto basta. */}
          <Card className="bg-muted/30 max-md:hidden">
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

          {/* Telefono: compare con la foto (prima era un bottone spento). */}
          {(!isMobile || photo) && (
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
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Configura
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4 max-md:space-y-3">
          {/* Foto preview */}
          {photoPreview && (
            <div className="rounded-xl overflow-hidden h-40 relative">
              <img loading="lazy" src={photoPreview} alt="Stanza" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium max-md:text-[11px]">Foto caricata</div>
            </div>
          )}

          {/* Config form */}
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <Sofa className="h-4 w-4" />
                Configura la trasformazione
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              <StanzaConfigForm value={config} onChange={setConfig} companyId={companyId} />
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
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={pollState.elapsedSec}
          dots={pollState.dots}
          accent="violet"
          subjectLabel="L'AI sta elaborando il render della stanza"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 4 — Risultati
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-4 max-md:space-y-3">
          {/* Success banner — telefono: parla l'immagine. */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900 max-md:hidden">
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
            <Card className="overflow-hidden max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <CardHeader className="max-md:hidden">
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
                <img loading="lazy"
                  src={resultUrls[0]}
                  alt="Render AI"
                  className="w-full object-cover"
                />
              </CardContent>
            </Card>
          )}

          {/* Telefono: nuovo render a icona e «Manda al cliente» (l'immagine, non un link). */}
          {isMobile && resultUrls[0] && (
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 shrink-0 px-0" onClick={nuovoRender} aria-label="Nuovo render">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <MandaRenderMobile resultUrl={resultUrls[0]} nomeFile="render-stanza" className="min-w-0 flex-1" />
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 max-md:hidden">
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
            variant={savedToGallery ? "secondary" : isMobile ? "outline" : "default"}
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

          <Separator className="max-md:hidden" />

          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante stanza"
          />

          {/* Telefono: «Nuovo render» sta accanto a «Manda al cliente», la galleria è nel modulo. */}
          <div className="flex gap-3 max-md:hidden">
            <Button
              variant="outline"
              className="flex-1"
              onClick={nuovoRender}
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
