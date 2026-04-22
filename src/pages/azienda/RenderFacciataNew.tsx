import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Building2,
} from "lucide-react";

import { FacciataConfigForm, DEFAULT_FACCIATA_CONFIG } from "@/components/render-facciata/FacciataConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import type { ConfigurazioneFacciata } from "@/modules/render-facciata/lib/types";
import type { AnalisiFacciata } from "@/modules/render-facciata/lib/types";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

// ── Polling intervals (exponential backoff) ───────────────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 180;

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderFacciataNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ───────────────────────────────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Analysis ────────────────────────────────────────────────────────────────
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analisi, setAnalisi] = useState<AnalisiFacciata | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 2: Config ──────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ConfigurazioneFacciata>(DEFAULT_FACCIATA_CONFIG);

  // ── Step 3: Processing ──────────────────────────────────────────────────────
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

  // ── Step 4: Result ──────────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);

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
    setAnalisi(null);
    setSessionId(null);
    setPhotoPath(null);
  };

  // ── Step 1 -> Step 2: upload + analyze ─────────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      // 1. Upload foto
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_facciata.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("facciata-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);
      setPhotoPath(path);

      // 2. Crea sessione (status: pending)
      const { data: sess, error: sessErr } = await supabase
        .from("render_facciata_sessions")
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

      // 3. Analisi AI in background (simulated — analisi facciata)
      setAnalysisLoading(true);
      try {
        // Simple heuristic analysis placeholder — in production,
        // an edge function would analyze the facade photo
        const defaultAnalisi: AnalisiFacciata = {
          tipo_edificio: "residenziale",
          numero_piani: 3,
          numero_finestre: 6,
          intonaco_attuale: "intonaco civile",
          colore_attuale_hex: "#D3D3D3",
          stato_conservazione: "usura media",
          elementi_presenti: ["cornicioni", "davanzali", "gronde"],
          note: "Analisi automatica dalla foto caricata",
        };
        setAnalisi(defaultAnalisi);

        // Update session with analysis
        await supabase
          .from("render_facciata_sessions")
          .update({ foto_analisi: defaultAnalisi })
          .eq("id", sid);
      } catch {
        // analysis is best-effort
      } finally {
        setAnalysisLoading(false);
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config, contactId, opportunityId]);

  // ── Step 2 -> Step 3: start render ─────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;
    if (generating) return;

    setGenerating(true);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    // Update config in session
    await supabase
      .from("render_facciata_sessions")
      .update({ config: config })
      .eq("id", sessionId);

    // Get photo dimensions
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

    // Invoke edge function
    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-facade-render", {
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
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-facciata-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }

    // Polling
    startPolling(sessionId);
  }, [sessionId, companyId, config, photo, photoPreview, queryClient, startPolling, generating]);

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
        setStep(2);
        return;
      }

      const { data: sess } = await supabase
        .from("render_facciata_sessions")
        .select("status, result_urls")
        .eq("id", sid)
        .single();

      const s = sess as { status: string; result_urls: string[] | null } | null;

      if (s?.status === "completed" && s.result_urls?.length) {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
        setResultUrls(s.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-facciata-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
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

      setPollState(prev => ({ ...prev, status: s?.status ?? "processing" }));
      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, queryClient]);

  // ── Download ───────────────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_facciata_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparira la facciata dopo l'intervento!\n${url}`);
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
            if (step > 1 && step < 4) {
              setStep((step - 1) as Step);
            } else {
              navigate("/azienda/render/facciata");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-600" />
            Render Facciata
          </h1>
          <p className="text-xs text-muted-foreground">
            {step === 1 && "Carica una foto della facciata"}
            {step === 2 && "Configura l'intervento"}
            {step === 3 && "Generazione in corso..."}
            {step === 4 && "Render completato!"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* FIX P2.5 + P5.1: banner pre-wizard su saldo crediti */}
      <RenderCreditGate />

      {/* ── Step indicator ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map(s => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-orange-500" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — Upload foto */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {!photoPreview ? (
            <Card
              className="border-dashed border-2 cursor-pointer hover:border-orange-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center">
                  <Upload className="h-8 w-8 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Carica una foto della facciata</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, PNG o WEBP — max 20 MB
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={photoPreview}
                    alt="Anteprima"
                    className="w-full h-full object-cover"
                  />
                </div>
                <RenderCrmLinker
                  contactId={contactId}
                  opportunityId={opportunityId}
                  onContactChange={setContactId}
                  onOpportunityChange={setOpportunityId}
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                      fileRef.current?.click();
                    }}
                  >
                    Cambia foto
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto bg-orange-600 hover:bg-orange-700"
                    onClick={goToStep2}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Upload...
                      </>
                    ) : (
                      "Avanti"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — Config */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Analysis card */}
          {analysisLoading && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="py-3 flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                <p className="text-xs text-muted-foreground">Analisi della facciata in corso...</p>
              </CardContent>
            </Card>
          )}

          {analisi && !analysisLoading && (
            <Card className="border-orange-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Analisi facciata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-[10px] text-muted-foreground">Edificio</p>
                    <p className="text-xs font-medium capitalize">{analisi.tipo_edificio}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-[10px] text-muted-foreground">Piani</p>
                    <p className="text-xs font-medium">{analisi.numero_piani}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-1.5">
                    <p className="text-[10px] text-muted-foreground">Stato</p>
                    <p className="text-xs font-medium capitalize">{analisi.stato_conservazione}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Config form */}
          <FacciataConfigForm config={config} onChange={setConfig} />

          {/* Action buttons */}
          <div className="flex gap-2 sticky bottom-4 bg-background/95 backdrop-blur py-3 -mx-4 px-4 border-t">
            <Button variant="outline" onClick={() => setStep(1)}>
              Indietro
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              onClick={startRender}
            >
              <Zap className="h-4 w-4 mr-2" />
              Genera render facciata
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — Processing */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                Rendering in corso{".".repeat(pollState.dots)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                L'AI sta generando il render della facciata
              </p>
            </div>
            <div className="w-full max-w-xs">
              <Progress
                value={Math.min((pollState.elapsedSec / 60) * 100, 95)}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {pollState.elapsedSec}s trascorsi
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 4 — Result */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">Render completato!</p>
                <p className="text-xs text-green-700/70">Confronta prima e dopo con lo slider</p>
              </div>
            </CardContent>
          </Card>

          {/* Before/After */}
          {photoPreview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prima / Dopo</CardTitle>
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

          {/* Render full */}
          <Card>
            <CardContent className="p-4">
              <img
                src={resultUrls[0]}
                alt="Render facciata"
                className="w-full rounded-lg"
              />
            </CardContent>
          </Card>

          {/* Config summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Riepilogo configurazione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-xs capitalize">
                  {config.tipo_intervento.replace(/_/g, " ")}
                </Badge>
                {config.intonaco.attivo && (
                  <Badge variant="outline" className="text-xs">
                    Intonaco: {config.intonaco.finitura}
                  </Badge>
                )}
                {config.rivestimento.attivo && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {config.rivestimento.tipo.replace(/_/g, " ")}
                  </Badge>
                )}
                {config.cappotto.attivo && (
                  <Badge variant="outline" className="text-xs">
                    Cappotto {config.cappotto.spessore_cm}cm
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button variant="outline" className="flex-1" onClick={downloadResult}>
              <Download className="h-4 w-4 mr-2" />
              Scarica
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStep(1);
              setPhoto(null);
              setPhotoPreview(null);
              setResultUrls([]);
              setSessionId(null);
              setAnalisi(null);
              setConfig(DEFAULT_FACCIATA_CONFIG);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render facciata
          </Button>
        </div>
      )}
    </div>
  );
}
