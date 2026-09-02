import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Wand2, Grid3X3,
} from "lucide-react";

import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";
import { PavimentoConfigForm } from "@/components/render-pavimento/PavimentoConfigForm";
import { DEFAULT_PAVIMENTO_CONFIG } from "@/components/render-pavimento/defaultPavimentoConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { preloadImage } from "@/lib/render/preloadImage";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import type { ConfigurazionePavimento, AnalisiPavimento } from "@/modules/render-pavimento/lib/types";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { createRenderOriginalSignedUrl, uploadRenderOriginal } from "@/lib/render/renderStorage";

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
export default function RenderPavimentoNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ──────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Analysis ───────────────────────────────────────────────────────────
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [analisi, setAnalisi] = useState<AnalisiPavimento | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 2: Config ─────────────────────────────────────────────────────
  const [config, setConfig] = useState<ConfigurazionePavimento>(DEFAULT_PAVIMENTO_CONFIG);

  // ── Step 3: Processing ─────────────────────────────────────────────────
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

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // ── Step 4: Result ─────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  // ── File handling ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setAnalisi(null);
    setAnalysisError(undefined);
    setSessionId(null);
    setPhotoPath(null);
  };

  // ── Step 1 -> Step 2: upload + analyze ─────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      // 1. Upload foto
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "pavimento-originals",
        path,
        file: photo,
      });
      setPhotoPath(storagePath);

      // 2. Crea sessione render (status: pending)
      const { data: sess, error: sessErr } = await supabase
        .from("render_pavimento_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: storagePath,
          config: config as unknown,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("Creazione sessione fallita");
      const sid = (sess as { id: string }).id;
      setSessionId(sid);

      setStep(2);

      // 3. Analisi AI in background (facoltativa)
      const imageUrl = await createRenderOriginalSignedUrl("pavimento-originals", storagePath, 300);

      if (imageUrl) {
        setAnalysisLoading(true);
        setAnalysisError(undefined);
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          const token = authSession?.access_token;
          const resp = await supabase.functions.invoke("generate-floor-render", {
            body: { action: "analyze", image_url: imageUrl, session_id: sid },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (resp.error) {
            // FIX P3.5: rimossi `as any`. Parsing type-safe del FunctionsHttpError.
            let errBody: { error?: string; message?: string } | null = null;
            try {
              const ctx = (resp.error as unknown as { context?: unknown }).context;
              if (ctx instanceof Response) errBody = await ctx.json() as { error?: string; message?: string };
            } catch { /* ignore parse error, fall through to message below */ }
            throw new Error(errBody?.error ?? errBody?.message ?? resp.error.message ?? "Errore");
          }
          if (resp.data?.analisi) {
            setAnalisi(resp.data.analisi as AnalisiPavimento);
          }
        } catch (err) {
          setAnalysisError(`Analisi AI non disponibile: ${String(err)}`);
        } finally {
          setAnalysisLoading(false);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload foto fallito");
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
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova piu tardi.");
        setStep(2);
        return;
      }

      const { data: sess } = await supabase
        .from("render_pavimento_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      const s = sess as {
        status: string;
        result_urls: string[] | null;
        error_message?: string | null;
      } | null;

      if (s?.status === "completed" && s.result_urls?.length) {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        if (s.result_urls[0]) await preloadImage(s.result_urls[0]);
        setResultUrls(s.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-pavimento-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        setStep(4);
        return;
      }

      if (s?.status === "failed") {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        setGenerating(false);
        toast.error(s.error_message || "Render fallito. Riprova.");
        setStep(2);
        return;
      }

      setPollState((prev) => ({ ...prev, status: s?.status ?? "processing" }));

      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, queryClient]);

  // ── Step 2 -> Step 3: start render ─────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    if (generating) return;

    setGenerating(true);
    setResultUrls([]);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    if (photo) {
      try {
        const img = new window.Image();
        img.src = photoPreview ?? "";
        await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
        targetWidth = img.naturalWidth || undefined;
        targetHeight = img.naturalHeight || undefined;
      } catch { /* ignore */ }
    }

    const photoMeta = targetWidth && targetHeight
      ? {
          width: targetWidth,
          height: targetHeight,
          orientation: targetWidth > targetHeight ? "landscape" : targetWidth < targetHeight ? "portrait" : "square",
        }
      : undefined;

    await supabase
      .from("render_pavimento_sessions")
      .update({
        config: config as unknown,
        status: "pending",
        result_urls: null,
        error_message: null,
        ...(analisi ? { analisi_pavimento: analisi as unknown } : {}),
      })
      .eq("id", sessionId);

    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-floor-render", {
      body: {
        action: "render",
        session_id: sessionId,
        config,
        analysis: analisi,
        photo_meta: photoMeta,
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
      if (urls[0]) await preloadImage(urls[0]);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-pavimento-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }

    startPolling(sessionId);
  }, [sessionId, companyId, generating, photo, photoPreview, config, analisi, queryClient, startPolling]);

  // ── Download result ────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      await downloadRenderImage(url, `render_pavimento_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrls]);

  // ── WhatsApp share ─────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparira la stanza con il nuovo pavimento!\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <RenderWizardHeader
        onBack={() => {
          if (step === 1 || step === 4) navigate("/azienda/render/pavimento");
          else if (step === 2) setStep(1);
          else if (step === 3 && !generating) setStep(2);
        }}
        eyebrow="Sostituzione pavimento fotorealistica"
        title="Stessa stanza, nuovo pavimento"
        description="Cambia il pavimento senza toccare arredi e prospettiva: gres, parquet, resina, marmo."
        badgeLabel="Render AI — Pavimenti"
        stepLabels={["Foto", "Configura", "Elaborazione", "Risultati"]}
        currentStep={step}
        accent="emerald"
      />
      <div className="flex justify-end">
        <RenderCreditsWidget />
      </div>

      {/* FIX P2.5 + P5.1: banner pre-wizard su saldo crediti */}
      <RenderCreditGate />

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1 -- Foto
      ══════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto stanza con pavimento attuale
              </CardTitle>
            </CardHeader>
            <CardContent>
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img loading="lazy"
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
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-amber-500/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-amber-600/60" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto stanza</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPG, PNG, WEBP - Max 20 MB - Foto con pavimento ben visibile
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

          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <p className="text-xs font-semibold mb-1.5">Consigli per il miglior risultato</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Foto prospettica della stanza, luce naturale</li>
                <li>Pavimento ben visibile senza troppi oggetti che lo coprono</li>
                <li>Risoluzione almeno 800x600 px</li>
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
            className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
            size="lg"
            disabled={!photo || uploading}
            onClick={goToStep2}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Caricamento in corso...</>
            ) : (
              <><Wand2 className="h-4 w-4" />Analizza con AI e configura</>
            )}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2 -- Configura
      ══════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Foto preview compatta */}
          {photoPreview && (
            <div className="rounded-xl overflow-hidden h-40 relative">
              <img loading="lazy" src={photoPreview} alt="Stanza" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium">Foto caricata</div>
            </div>
          )}

          {/* AI Analysis Card */}
          {analysisLoading && (
            <Card className="border-amber-500/30 bg-amber-50/50">
              <CardContent className="py-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                <div>
                  <p className="text-sm font-medium">Analisi AI in corso...</p>
                  <p className="text-xs text-muted-foreground">Identificazione pavimento e stanza</p>
                </div>
              </CardContent>
            </Card>
          )}

          {analysisError && (
            <Card className="border-yellow-500/30 bg-yellow-50/50">
              <CardContent className="py-3">
                <p className="text-xs text-yellow-700">{analysisError}</p>
              </CardContent>
            </Card>
          )}

          {analisi && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Analisi completata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Tipo stanza", analisi.tipo_stanza],
                    ["Pavimento attuale", analisi.pavimento_attuale],
                    ["Colore attuale", analisi.colore_attuale],
                    ["Dimensione", analisi.dimensione_stimata],
                    ["Stato", analisi.stato_conservazione],
                    ["Battiscopa", analisi.battiscopa_presente ? "Presente" : "Assente"],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-muted/50 rounded-md p-2">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-xs font-medium capitalize">{val}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Config form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Configurazione pavimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PavimentoConfigForm
                value={config}
                onChange={setConfig}
                disabled={false}
                companyId={companyId}
              />
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
            size="lg"
            onClick={startRender}
          >
            <Zap className="h-4 w-4" />
            Genera render pavimento
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3 -- Elaborazione
      ══════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={pollState.elapsedSec}
          dots={pollState.dots}
          accent="emerald"
          subjectLabel="L'AI sta elaborando il render del pavimento"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 4 -- Risultati
      ══════════════════════════════════════════════════════════════════ */}
      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card className="border-green-500/30 bg-green-50/30">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700">Render completato!</p>
                <p className="text-xs text-muted-foreground">
                  Il nuovo pavimento e stato applicato con successo.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Before/After slider */}
          {photoPreview && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Confronto prima/dopo</CardTitle>
                <p className="text-xs text-muted-foreground">Trascina il cursore per confrontare</p>
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

          {/* Render result */}
          <Card>
            <CardContent className="p-4">
              <img loading="lazy"
                src={resultUrls[0]}
                alt="Render pavimento"
                className="w-full rounded-lg"
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700" onClick={downloadResult}>
              <Download className="h-4 w-4" />
              Scarica render
            </Button>
          </div>

          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante pavimento"
          />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/azienda/render/pavimento")}
          >
            Torna alla dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
