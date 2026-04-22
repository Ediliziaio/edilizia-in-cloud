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
  CheckCircle2, Download, Share2, RefreshCw, Wand2, Bath,
} from "lucide-react";

import {
  BathroomConfigForm,
  type BathroomConfig,
} from "@/components/render-bagno/BathroomConfigForm";
import { DEFAULT_BATHROOM_CONFIG } from "@/components/render-bagno/defaultBathroomConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import type { AnalisiBagno } from "@/modules/render-bagno/lib/types";

// ── Types ────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

interface PhotoMeta {
  width: number;
  height: number;
  orientation: "portrait" | "landscape" | "square";
}

// ── Polling intervals (exponential backoff) ──────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 180;

// ═════════════════════════════════════════════════════════════════════
export default function RenderBagnoNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ──────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Analysis ───────────────────────────────────────────────────────
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [analisi, setAnalisi] = useState<AnalisiBagno | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 3: Config ─────────────────────────────────────────────────
  const [config, setConfig] = useState<BathroomConfig>(DEFAULT_BATHROOM_CONFIG);

  // ── Step 4: Processing ─────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [pollState, setPollState] = useState<PollState>({ dots: 0, elapsedSec: 0, status: "pending" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  // ── CRM linking ────────────────────────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  // ── Result ─────────────────────────────────────────────────────────
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  // ── Cleanup polling al dismount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // ── File handling ──────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoPreview(previewUrl);
    setAnalisi(null);
    setAnalysisError(undefined);
    setSessionId(null);
    setResultUrl(null);
    setSavedToGallery(false);
    setPhotoMeta(null);

    const image = new window.Image();
    image.onload = () => {
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      if (width > 0 && height > 0) {
        setPhotoMeta({
          width,
          height,
          orientation: width === height ? "square" : width > height ? "landscape" : "portrait",
        });
      }
    };
    image.onerror = () => setPhotoMeta(null);
    image.src = previewUrl;
  };

  // ── Step 1 -> Step 2: upload + analyze ─────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      // 1. Upload foto
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_bagno_original.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("bagno-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);

      // 2. Crea sessione render_bagno_sessions
      const { data: sess, error: sessErr } = await supabase
        .from("render_bagno_sessions")
        .insert({
          company_id: companyId,
          user_id: user.id,
          stato: "pending",
          foto_originale_path: path,
          configurazione: config,
          tipo_intervento: config.tipo_intervento,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("Creazione sessione fallita");
      const sid = (sess as { id: string }).id;
      setSessionId(sid);

      // 3. Signed URL per analisi
      const { data: signed, error: signedErr } = await supabase.storage
        .from("bagno-originals")
        .createSignedUrl(path, 300);
      const imageUrl = signed?.signedUrl ?? "";
      if (signedErr || !imageUrl) {
        throw new Error(`Signed URL non disponibile: ${signedErr?.message ?? "URL immagine mancante"}`);
      }

      setStep(2);

        // 4. Analisi in background (bathroom-specific edge function)
        if (imageUrl) {
          setAnalysisLoading(true);
          setAnalysisError(undefined);

        // Update session status
        await supabase
          .from("render_bagno_sessions")
          .update({ stato: "analyzing" })
          .eq("id", sid);

        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          const token = authSession?.access_token;
          const resp = await supabase.functions.invoke("generate-bathroom-render", {
            body: { action: "analyze", image_url: imageUrl, session_id: sid },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (resp.error) {
            // FIX P3.5: rimossi `as any`. Il `FunctionsHttpError` di supabase-js
            // espone `context` come Response nel campo .context (runtime).
            let errBody: { error?: string; message?: string } | null = null;
            try {
              const ctx = (resp.error as unknown as { context?: unknown }).context;
              if (ctx instanceof Response) errBody = await ctx.json() as { error?: string; message?: string };
            } catch { /* ignore parse error, fall through to message below */ }
            throw new Error(errBody?.error ?? errBody?.message ?? resp.error.message ?? "Errore");
          }

          const analysisData = resp.data?.analisi_bagno || resp.data?.analisi || resp.data;
          if (analysisData) {
            setAnalisi(analysisData as AnalisiBagno);

            // Save analysis to session
            await supabase
              .from("render_bagno_sessions")
              .update({
                stato: "analysis_done",
                analisi_bagno: analysisData,
              })
              .eq("id", sid);
          }
        } catch (err) {
          setAnalysisError(`Analisi AI non disponibile: ${err instanceof Error ? err.message : String(err)}`);
          await supabase
            .from("render_bagno_sessions")
            .update({ stato: "analysis_done" })
            .eq("id", sid);
        } finally {
          setAnalysisLoading(false);
        }
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config, contactId, opportunityId]);

  const startPolling = useCallback((sid: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    pollCountRef.current = 0;

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
        setStep(3);
        return;
      }

      const { data: sess } = await supabase
        .from("render_bagno_sessions")
        .select("stato, render_result_url")
        .eq("id", sid)
        .single();

      const s = sess as { stato: string; render_result_url: string | null } | null;

      if (s?.stato === "completato" && s.render_result_url) {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        setResultUrl(s.render_result_url);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-bagno-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-bagno-gallery", companyId] });
        return;
      }

      if (s?.stato === "errore") {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        setGenerating(false);
        toast.error("Render fallito. Riprova.");
        setStep(3);
        return;
      }

      setPollState(prev => ({ ...prev, status: s?.stato ?? "processing" }));

      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, queryClient]);

  // ── Step 3 -> Step 4: start render ─────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    // P1 FIX: guard contro double-click / doppio credit deduction.
    // Se c'è già un render in corso, ignora il click (pulsante "Genera" / "Rigenera").
    if (generating) return;

    setGenerating(true);
    setStep(4);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    // Save latest config to session
    await supabase
      .from("render_bagno_sessions")
      .update({
        configurazione: config,
        tipo_intervento: config.tipo_intervento,
      })
      .eq("id", sessionId);

    const targetWidth = photoMeta?.width;
    const targetHeight = photoMeta?.height;
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;

    // Invoke generate-bathroom-render
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "generate-bathroom-render",
      {
        body: {
          session_id: sessionId,
          ...(targetWidth && targetHeight ? { target_width: targetWidth, target_height: targetHeight } : {}),
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );

    if (fnErr || fnData?.error) {
      let errBody: { error?: string; message?: string } | null = null;
      try {
        const ctx = (fnErr as unknown as { context?: unknown } | null)?.context;
        if (ctx instanceof Response) errBody = await ctx.json() as { error?: string; message?: string };
      } catch {
        // ignore parse error and fall back below
      }
      const msg =
        errBody?.message ??
        errBody?.error ??
        fnErr?.message ??
        fnData?.message ??
        fnData?.error ??
        "Generazione fallita";
      setGenerating(false);
      if (msg.includes("insufficient_credits")) {
        toast.error("Crediti render insufficienti. Acquista nuovi crediti.");
      } else {
        toast.error(msg);
      }
      setStep(3);
      return;
    }

    // Synchronous result
    if (fnData?.result_url) {
      setResultUrl(fnData.result_url);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-bagno-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-bagno-gallery", companyId] });
      return;
    }

    // Otherwise poll
    startPolling(sessionId);
  }, [sessionId, companyId, config, queryClient, generating, startPolling, photoMeta]);

  // ── Save to gallery ────────────────────────────────────────────────
  const saveToGallery = useCallback(async () => {
    if (!sessionId || !companyId || savedToGallery) return;
    setSavingGallery(true);
    try {
      const { error } = await supabase
        .from("render_bagno_sessions")
        .update({
          salvato_in_galleria: true,
          galleria_titolo: `Render bagno ${new Date().toLocaleDateString("it-IT")}`,
        } )
        .eq("id", sessionId);
      if (error) throw error;
      setSavedToGallery(true);
      toast.success("Render salvato in galleria!");
      queryClient.invalidateQueries({ queryKey: ["render-bagno-gallery", companyId] });
    } catch (err) {
      toast.error(`Salvataggio fallito: ${String(err)}`);
    } finally {
      setSavingGallery(false);
    }
  }, [sessionId, companyId, savedToGallery, queryClient]);

  // ── Download ───────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    if (!resultUrl) return;
    try {
      const resp = await fetch(resultUrl);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_bagno_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrl]);

  // ── WhatsApp share ─────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    if (!resultUrl) return;
    const text = encodeURIComponent(`Ecco come apparira il nuovo bagno!\n${resultUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrl]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  const photoMetaLabel = photoMeta
    ? `${photoMeta.orientation === "portrait" ? "Verticale" : photoMeta.orientation === "landscape" ? "Orizzontale" : "Quadrata"} · ${photoMeta.width}x${photoMeta.height}`
    : null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 4) navigate("/azienda/render/bagno");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 4 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bath className="h-5 w-5 text-cyan-600" />
            Nuovo render bagno
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto del bagno attuale"}
            {step === 2 && "Analisi in corso..."}
            {step === 3 && "Configura il nuovo bagno"}
            {step === 4 && (generating ? "Generazione in corso..." : "Render completato!")}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* FIX P2.5 + P5.1: banner pre-wizard su saldo crediti */}
      <RenderCreditGate />

      {/* ── Progress stepper ──────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {["Foto", "Analisi", "Configura", "Risultato"].map((label, i) => (
            <span
              key={label}
              className={step === i + 1 ? "text-cyan-600 font-semibold" : step > i + 1 ? "text-foreground" : ""}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
        <Progress value={(step / 4) * 100} className="h-1.5" />
      </div>

      {/* ═════════════════════════════════════════════════════════════
          STEP 1 — Foto
      ═════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto del bagno attuale
              </CardTitle>
            </CardHeader>
            <CardContent>
              {photoPreview ? (
                <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                  <div className="flex max-h-[34rem] min-h-[240px] items-center justify-center">
                    <img
                      src={photoPreview}
                      alt="Foto caricata"
                      className="max-h-[34rem] w-full object-contain"
                    />
                  </div>
                  {photoMetaLabel ? (
                    <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                      {photoMetaLabel}
                    </div>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                      setPhotoMeta(null);
                      setAnalisi(null);
                      setAnalysisError(undefined);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-cyan-400/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-cyan-600/60" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto del bagno</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPG, PNG, WEBP - Max 20 MB - Verticale resta verticale, orizzontale resta orizzontale
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
                <li>Inquadratura ampia che mostri pavimento, pareti e sanitari</li>
                <li>Luce naturale o ben illuminato</li>
                <li>Senza persone o oggetti che ostruiscano la visuale</li>
                <li>Risoluzione almeno 800x600 px</li>
                <li>Non serve rifare la foto: il render deve rispettare il formato originale</li>
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
            className="w-full gap-2"
            size="lg"
            disabled={!photo || uploading}
            onClick={goToStep2}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Caricamento in corso...</>
            ) : (
              <><Wand2 className="h-4 w-4" />Analizza con AI</>
            )}
          </Button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          STEP 2 — Analisi
      ═════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Foto preview */}
          {photoPreview && (
            <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              <div className="flex max-h-[22rem] min-h-[180px] items-center justify-center">
                <img src={photoPreview} alt="Bagno" className="max-h-[22rem] w-full object-contain" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium">Foto caricata</div>
              {photoMetaLabel ? (
                <div className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                  {photoMetaLabel}
                </div>
              ) : null}
            </div>
          )}

          {/* Analysis card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-cyan-600" />
                Analisi AI del bagno
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysisLoading ? (
                <div className="flex items-center gap-3 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
                  <div>
                    <p className="text-sm font-medium">Analisi in corso...</p>
                    <p className="text-xs text-muted-foreground">L&apos;AI sta identificando gli elementi del bagno</p>
                  </div>
                </div>
              ) : analysisError ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{analysisError}</p>
                  <p className="text-xs text-muted-foreground">
                    Puoi comunque procedere con la configurazione manuale.
                  </p>
                </div>
              ) : analisi ? (
                <div className="grid grid-cols-2 gap-2">
                  {analisi.tipo_stanza && (
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground">Tipo stanza</p>
                      <p className="text-sm font-medium capitalize">{analisi.tipo_stanza}</p>
                    </div>
                  )}
                  {analisi.dimensione_stimata && (
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground">Dimensione</p>
                      <p className="text-sm font-medium">{analisi.dimensione_stimata}</p>
                    </div>
                  )}
                  {analisi.piastrelle_parete_attuali && (
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground">Piastrelle parete</p>
                      <p className="text-sm font-medium capitalize">{analisi.piastrelle_parete_attuali}</p>
                    </div>
                  )}
                  {analisi.pavimento_attuale && (
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground">Pavimento</p>
                      <p className="text-sm font-medium capitalize">{analisi.pavimento_attuale}</p>
                    </div>
                  )}
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-[10px] text-muted-foreground">Doccia</p>
                    <p className="text-sm font-medium">{analisi.presenza_doccia ? "Presente" : "Assente"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-[10px] text-muted-foreground">Vasca</p>
                    <p className="text-sm font-medium">{analisi.presenza_vasca ? "Presente" : "Assente"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-[10px] text-muted-foreground">Mobile</p>
                    <p className="text-sm font-medium">{analisi.presenza_mobile ? "Presente" : "Assente"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <p className="text-[10px] text-muted-foreground">Conservazione</p>
                    <p className="text-sm font-medium capitalize">{analisi.stato_conservazione?.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  Analisi non disponibile. Procedi con la configurazione manuale.
                </p>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={() => setStep(3)}
            disabled={analysisLoading}
          >
            <Zap className="h-4 w-4" />
            {analysisLoading ? "Attendi analisi..." : "Procedi alla configurazione"}
          </Button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          STEP 3 — Configura
      ═════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Foto preview compatta */}
          {photoPreview && (
            <div className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              <div className="flex max-h-[18rem] min-h-[160px] items-center justify-center">
                <img src={photoPreview} alt="Bagno" className="max-h-[18rem] w-full object-contain" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium">Foto originale</div>
              {photoMetaLabel ? (
                <div className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                  {photoMetaLabel}
                </div>
              ) : null}
            </div>
          )}

          <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-sm dark:border-cyan-900 dark:bg-cyan-950/20">
            <p className="font-medium text-cyan-900 dark:text-cyan-200">Obiettivo del render bagno</p>
            <p className="mt-1 text-cyan-800/80 dark:text-cyan-200/80">
              Il risultato deve essere lo stesso bagno rivisitato: stessa prospettiva, stesso taglio foto e stesso orientamento dell&apos;immagine originale.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-600" />
                Configura il nuovo bagno
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BathroomConfigForm value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={startRender}
          >
            <Zap className="h-4 w-4" />
            Genera render AI
          </Button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          STEP 4 — Elaborazione / Risultato
      ═════════════════════════════════════════════════════════════ */}
      {step === 4 && generating && (
        <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
          <Card className="border-cyan-400/30 bg-cyan-50/50 dark:bg-cyan-950/20">
            <CardContent className="py-8 flex flex-col items-center gap-6 text-center">
              <div className="relative w-20 h-20" aria-hidden="true">
                <div className="absolute inset-0 rounded-full border-4 border-cyan-400/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <Bath className="h-8 w-8 text-cyan-600 animate-pulse" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  Render in elaborazione{".".repeat(pollState.dots)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  L&apos;AI sta trasformando il bagno con la nuova configurazione
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Tempo trascorso: {pollState.elapsedSec}s - Puo richiedere 30-90 secondi
                </p>
              </div>
              <Progress value={Math.min((pollState.elapsedSec / 90) * 100, 95)} className="w-full h-2" />
            </CardContent>
          </Card>

          {photoPreview && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground mb-2">Foto originale caricata</p>
                <div className="flex max-h-[18rem] min-h-[180px] items-center justify-center overflow-hidden rounded-lg bg-muted/20">
                  <img src={photoPreview} alt="Originale" className="max-h-[18rem] w-full object-contain" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <p className="text-xs font-semibold mb-2">Configurazione applicata</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.tipo_intervento.replace(/_/g, " ")}
                </Badge>
                {config.sostituzione.piastrelle_parete && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {config.piastrelle_parete.effetto.replace(/_/g, " ")}
                  </Badge>
                )}
                {config.sostituzione.doccia && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    Doccia {config.doccia.tipo.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 4 && !generating && resultUrl && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-400 text-sm">Render completato!</p>
              <p className="text-xs text-green-700 dark:text-green-500">
                Il render fotorealistico del bagno e pronto
              </p>
            </div>
          </div>

          {/* Before/After slider */}
          {photoPreview && resultUrl && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Confronto Prima / Dopo</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <BeforeAfterSlider
                  beforeUrl={photoPreview}
                  afterUrl={resultUrl}
                />
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
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
                  {config.tipo_intervento.replace(/_/g, " ")}
                </Badge>
                {config.sostituzione.piastrelle_parete && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Parete: {config.piastrelle_parete.effetto.replace(/_/g, " ")}
                  </Badge>
                )}
                {config.sostituzione.pavimento && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Pavimento: {config.pavimento.effetto.replace(/_/g, " ")}
                  </Badge>
                )}
                {config.sostituzione.doccia && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Doccia: {config.doccia.tipo.replace(/_/g, " ")}
                  </Badge>
                )}
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
                setPhotoMeta(null);
                setAnalisi(null);
                setAnalysisError(undefined);
                setSessionId(null);
                setResultUrl(null);
                setSavedToGallery(false);
                setConfig(DEFAULT_BATHROOM_CONFIG);
              }}
            >
              Nuovo render
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate("/azienda/render/bagno/gallery")}
            >
              Vai alla galleria
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
