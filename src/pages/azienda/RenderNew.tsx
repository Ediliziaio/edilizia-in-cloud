import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Wand2, ChevronDown, ChevronUp,
  AlertTriangle,
} from "lucide-react";

import { RenderConfigForm, type RenderConfig } from "@/components/render/RenderConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import PhotoAnalysisCard from "@/components/render/PhotoAnalysisCard";
import StructuralChangeBox from "@/components/render/StructuralChangeBox";
import ManigliaSelector, { type ManigliaConfig } from "@/components/render/ManigliaSelector";
import { RalColorPicker, type ColorMode } from "@/components/render/RalColorPicker";
import {
  getTrasformazioniDisponibili,
  type TrasformazioneRule,
} from "@/modules/render/lib/trasformazioneCompatibility";
import type { FotoAnalisi, TipoApertura } from "@/modules/render/lib/promptBuilder";

// ── Default config ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: RenderConfig = {
  nuovo_infisso: {
    materiale: "pvc",
    colore: { ral: "9016", nome: "Bianco puro", finitura: "liscio_opaco" },
    colore_mode: "ral",
    profilo: { dimensione: "70mm", forma: "europeo" },
    vetro: { tipo: "trasparente", prompt_fragment: "double glazed clear glass" },
    ferramenta: {
      maniglia_stile: "classica_dritta",
      colore_hardware_id: "cromo_lucido",
      colore_hardware_finish: "polished chrome — bright specular reflection",
    },
    cerniere: { tipo: "europea", colore: "argento", num_per_anta: 2 },
    num_ante: 2,
    stile_telaio: "europeo_classico",
    sostituzione: { infissi: true, cassonetto: false, tapparella: false },
  },
  apertura_default: "battente_2_ante",
  notes: "",
};

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

// ── Feasibility color ─────────────────────────────────────────────────────────
const FEASIBILITY_COLOR: Record<string, string> = {
  facile: "text-green-600",
  media: "text-yellow-600",
  complessa: "text-red-600",
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Photo ───────────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Analysis ────────────────────────────────────────────────────────────────
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [fotoAnalisi, setFotoAnalisi] = useState<FotoAnalisi | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── Step 2: Config ──────────────────────────────────────────────────────────
  const [config, setConfig] = useState<RenderConfig>(DEFAULT_CONFIG);
  const [manigliaConfig, setManigliaConfig] = useState<ManigliaConfig>({
    stile: "classica_dritta",
    colore_hardware_id: "cromo_lucido",
    colore_hardware_finish: "polished chrome — bright specular reflection",
  });
  const [colorMode, setColorMode] = useState<ColorMode>("ral");
  const [showAdvancedColor, setShowAdvancedColor] = useState(false);
  const [showTrasformazioni, setShowTrasformazioni] = useState(false);
  const [selectedTrasformazione, setSelectedTrasformazione] = useState<TrasformazioneRule | null>(null);

  // ── Step 3: Processing ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [pollState, setPollState] = useState<PollState>({ dots: 0, elapsedSec: 0, status: "pending" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  // ── Step 4: Result ──────────────────────────────────────────────────────────
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const tipoAperturaAttuale = fotoAnalisi?.tipo_apertura as TipoApertura | undefined;
  const trasformazioniDisponibili = tipoAperturaAttuale
    ? getTrasformazioniDisponibili(tipoAperturaAttuale)
    : [];
  const materialeAttuale = fotoAnalisi?.materiale_attuale;
  const materialeNuovo = config.nuovo_infisso.materiale;
  const hasMaterialChange = materialeAttuale &&
    materialeAttuale !== materialeNuovo &&
    !materialeAttuale.startsWith(materialeNuovo);

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
    setFotoAnalisi(null);
    setAnalysisError(undefined);
    setSessionId(null);
    setPhotoPath(null);
  };

  // ── ManigliaSelector sync → RenderConfigForm ────────────────────────────────
  const handleManigliaChange = (mc: ManigliaConfig) => {
    setManigliaConfig(mc);
    setConfig(prev => ({
      ...prev,
      nuovo_infisso: {
        ...prev.nuovo_infisso,
        ferramenta: {
          maniglia_stile: mc.stile,
          colore_hardware_id: mc.colore_hardware_id,
          colore_hardware_finish: mc.colore_hardware_finish,
        },
      },
    }));
  };

  // ── Trasformazione selection ─────────────────────────────────────────────────
  const handleTrasformazione = (t: TrasformazioneRule) => {
    setSelectedTrasformazione(t === selectedTrasformazione ? null : t);
    if (t !== selectedTrasformazione) {
      setConfig(prev => ({ ...prev, apertura_default: t.to }));
    }
  };

  // ── Step 1 → Step 2: upload + analyze ──────────────────────────────────────
  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      // 1. Upload foto
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_original.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("render-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);
      setPhotoPath(path);

      // 2. Crea sessione render (status: pending)
      const { data: sess, error: sessErr } = await supabase
        .from("render_sessions" as never)
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: path,
          config: config,
        } as never)
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("Creazione sessione fallita");
      const sid = (sess as { id: string }).id;
      setSessionId(sid);

      // 3. Signed URL per analisi
      const { data: signed } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(path, 300);
      const imageUrl = signed?.signedUrl ?? "";

      setStep(2);

      // 4. Analisi in background (non bloccante per step 2)
      if (imageUrl) {
        setAnalysisLoading(true);
        setAnalysisError(undefined);
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          const token = authSession?.access_token;
          const resp = await supabase.functions.invoke("analyze-window-photo", {
            body: { image_url: imageUrl, session_id: sid },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (resp.error) throw new Error(resp.error.message);
          if (resp.data?.foto_analisi) {
            setFotoAnalisi(resp.data.foto_analisi as FotoAnalisi);
            // Auto-apply tipo apertura from analysis
            if (resp.data.foto_analisi.tipo_apertura) {
              setConfig(prev => ({
                ...prev,
                apertura_default: resp.data.foto_analisi.tipo_apertura as string,
              }));
            }
          }
        } catch (err) {
          setAnalysisError(`Analisi AI non disponibile: ${String(err)}`);
        } finally {
          setAnalysisLoading(false);
        }
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, config]);

  // ── Step 2 → Step 3: start render ──────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;

    setGenerating(true);
    setStep(3);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    // Aggiorna config nella sessione
    await supabase
      .from("render_sessions" as never)
      .update({ config: config } as never)
      .eq("id" as never, sessionId as never);

    // Ottieni dimensioni foto per target_width/target_height
    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    if (photo) {
      try {
        const img = new window.Image();
        img.src = photoPreview ?? "";
        await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
        targetWidth = img.naturalWidth || undefined;
        targetHeight = img.naturalHeight || undefined;
      } catch (_) { /* ignore */ }
    }

    // Invoca generate-render
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-render", {
      body: {
        session_id: sessionId,
        config: config,
        ...(targetWidth && targetHeight ? { target_width: targetWidth, target_height: targetHeight } : {}),
      },
    });

    if (fnErr || fnData?.error) {
      const msg = fnErr?.message ?? fnData?.message ?? fnData?.error ?? "Generazione fallita";
      setGenerating(false);
      if (msg.includes("insufficient_credits")) {
        toast.error("Crediti render insufficienti. Acquista nuovi crediti.");
      } else {
        toast.error(msg);
      }
      setStep(2);
      return;
    }

    // Se risposta sincrona con result_url già disponibile
    if (fnData?.result_url || fnData?.result_urls) {
      const urls: string[] = fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
      setStep(4);
      return;
    }

    // Altrimenti polling status
    startPolling(sessionId);
  }, [sessionId, companyId, config, photo, photoPreview, queryClient]);

  const startPolling = useCallback((sid: string) => {
    const dotsInterval = setInterval(() => {
      elapsedRef.current += 1;
      setPollState(prev => ({
        ...prev,
        dots: (prev.dots + 1) % 4,
        elapsedSec: elapsedRef.current,
      }));
    }, 1000);

    const poll = async () => {
      if (elapsedRef.current >= MAX_POLL_SEC) {
        clearInterval(dotsInterval);
        setGenerating(false);
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova più tardi.");
        setStep(2);
        return;
      }

      const { data: sess } = await supabase
        .from("render_sessions" as never)
        .select("status, result_urls")
        .eq("id" as never, sid as never)
        .single();

      const s = sess as { status: string; result_urls: string[] | null } | null;

      if (s?.status === "completed" && s.result_urls?.length) {
        clearInterval(dotsInterval);
        setResultUrls(s.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
        setStep(4);
        return;
      }

      if (s?.status === "failed") {
        clearInterval(dotsInterval);
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

  // ── Save to gallery ─────────────────────────────────────────────────────────
  const saveToGallery = useCallback(async () => {
    if (!sessionId || !companyId || savedToGallery) return;
    setSavingGallery(true);
    try {
      const shareToken = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
      const configSummary = {
        materiale: config.nuovo_infisso.materiale,
        colore: config.nuovo_infisso.colore.nome,
        apertura: config.apertura_default,
      };
      const { error } = await supabase
        .from("render_gallery" as never)
        .insert({
          company_id: companyId,
          session_id: sessionId,
          result_url: resultUrls[0],
          original_url: photoPath ?? "",
          config_summary: configSummary,
          share_token: shareToken,
        } as never);
      if (error) throw error;
      setSavedToGallery(true);
      toast.success("Render salvato in galleria!");
      queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
    } catch (err) {
      toast.error(`Salvataggio fallito: ${String(err)}`);
    } finally {
      setSavingGallery(false);
    }
  }, [sessionId, companyId, savedToGallery, config, resultUrls, photoPath, queryClient]);

  // ── Download result ─────────────────────────────────────────────────────────
  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_infissi_${Date.now()}.png`;
      a.click();
    } catch (_) {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  // ── WhatsApp share ──────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparirà la facciata con i nuovi infissi!\n${url}`);
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
            if (step === 1 || step === 4) navigate("/azienda/render");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 3 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Nuovo render infissi</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto della facciata"}
            {step === 2 && "Configura i nuovi infissi"}
            {step === 3 && "Generazione in corso..."}
            {step === 4 && "Render completato!"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* ── Progress stepper ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {["Foto", "Configura", "Elaborazione", "Risultati"].map((label, i) => (
            <span
              key={label}
              className={step === i + 1 ? "text-primary font-semibold" : step > i + 1 ? "text-foreground" : ""}
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
                Foto facciata con infissi attuali
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
                      setFotoAnalisi(null);
                      setAnalysisError(undefined);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-primary/60" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto facciata</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPG, PNG, WEBP · Max 20 MB · Foto frontale per risultati ottimali
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
              <p className="text-xs font-semibold mb-1.5">💡 Consigli per il miglior risultato</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Foto frontale della facciata, luce naturale</li>
                <li>Finestre/porte ben visibili senza ostruzioni</li>
                <li>Risoluzione almeno 800×600 px</li>
              </ul>
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
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

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Configura
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Foto preview compatta */}
          {photoPreview && (
            <div className="rounded-xl overflow-hidden h-40 relative">
              <img src={photoPreview} alt="Facciata" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 text-white text-xs font-medium">Foto caricata</div>
            </div>
          )}

          {/* AI Analysis */}
          <PhotoAnalysisCard
            analysisData={fotoAnalisi}
            loading={analysisLoading}
            error={analysisError}
            onRetry={async () => {
              if (!photoPath) return;
              setAnalysisError(undefined);
              setAnalysisLoading(true);
              try {
                const { data: signed } = await supabase.storage
                  .from("render-originals")
                  .createSignedUrl(photoPath, 300);
                if (!signed?.signedUrl) throw new Error("URL non disponibile");
                const resp = await supabase.functions.invoke("analyze-window-photo", {
                  body: { image_url: signed.signedUrl, session_id: sessionId },
                });
                if (resp.data?.foto_analisi) {
                  setFotoAnalisi(resp.data.foto_analisi as FotoAnalisi);
                  if (resp.data.foto_analisi.tipo_apertura) {
                    setConfig(prev => ({
                      ...prev,
                      apertura_default: resp.data.foto_analisi.tipo_apertura as string,
                    }));
                  }
                }
              } catch (err) {
                setAnalysisError(`Analisi non disponibile: ${String(err)}`);
              } finally {
                setAnalysisLoading(false);
              }
            }}
          />

          {/* Trasformazioni suggerite */}
          {trasformazioniDisponibili.length > 0 && (
            <Card className="border-primary/20">
              <CardContent className="py-3">
                <button
                  className="flex items-center justify-between w-full text-sm font-semibold"
                  onClick={() => setShowTrasformazioni(v => !v)}
                >
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Trasformazioni suggerite ({trasformazioniDisponibili.length})
                  </span>
                  {showTrasformazioni ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showTrasformazioni && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5">
                    {trasformazioniDisponibili.map(t => (
                      <button
                        key={`${t.from}-${t.to}`}
                        onClick={() => handleTrasformazione(t)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-xs transition-all ${
                          selectedTrasformazione?.to === t.to
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <span className="font-medium">{t.label}</span>
                        <span className={`font-medium capitalize ${FEASIBILITY_COLOR[t.feasibility] ?? ""}`}>
                          {t.feasibility}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cambio strutturale */}
          {hasMaterialChange && (
            <StructuralChangeBox
              analisi={fotoAnalisi}
              nuovoMateriale={materialeNuovo}
              nuovoColore={config.nuovo_infisso.colore.nome}
            />
          )}

          {/* Configurazione base */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Configura infissi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RenderConfigForm value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          {/* Maniglia avanzata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maniglia e hardware</CardTitle>
            </CardHeader>
            <CardContent>
              <ManigliaSelector value={manigliaConfig} onChange={handleManigliaChange} />
            </CardContent>
          </Card>

          {/* Colore avanzato RAL */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Selezione colore avanzata (RAL/Legno)</span>
                <Switch
                  checked={showAdvancedColor}
                  onCheckedChange={setShowAdvancedColor}
                />
              </div>
              {showAdvancedColor && (
                <div className="mt-4">
                  <RalColorPicker
                    colorMode={colorMode}
                    onColorModeChange={setColorMode}
                    ralValue={config.nuovo_infisso.colore.ral || null}
                    onRalChange={(ral) => {
                      setConfig(prev => ({
                        ...prev,
                        nuovo_infisso: {
                          ...prev.nuovo_infisso,
                          colore: { ral: ral.ral, nome: ral.name, finitura: "liscio_opaco" },
                          colore_mode: "ral",
                        },
                      }));
                    }}
                    woodValue={null}
                    onWoodChange={(wood) => {
                      setConfig(prev => ({
                        ...prev,
                        nuovo_infisso: {
                          ...prev.nuovo_infisso,
                          colore: { ral: "", nome: wood.name, finitura: "venatura_legno" },
                          colore_mode: "legno",
                        },
                      }));
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sostituzione scope */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cosa sostituire</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { key: "infissi" as const, label: "Infissi (telaio + ante)", desc: "Sostituisce i profili e il vetro" },
                  { key: "cassonetto" as const, label: "Cassonetto avvolgibile", desc: "Sostituisce il vano cassonetto" },
                  { key: "tapparella" as const, label: "Tapparella/persiana", desc: "Sostituisce il sistema di oscuramento" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={config.nuovo_infisso.sostituzione[key]}
                      onCheckedChange={(v) =>
                        setConfig(prev => ({
                          ...prev,
                          nuovo_infisso: {
                            ...prev.nuovo_infisso,
                            sostituzione: { ...prev.nuovo_infisso.sostituzione, [key]: v },
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
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

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Elaborazione
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-8 flex flex-col items-center gap-6 text-center">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="h-8 w-8 text-primary animate-pulse" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  Render in elaborazione{".".repeat(pollState.dots)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  L&apos;AI sta modificando la foto con i nuovi infissi
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Tempo trascorso: {pollState.elapsedSec}s · Può richiedere 30–90 secondi
                </p>
              </div>
              <Progress value={Math.min((pollState.elapsedSec / 90) * 100, 95)} className="w-full h-2" />
            </CardContent>
          </Card>

          {/* Foto originale durante elaborazione */}
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

          {/* Riepilogo config */}
          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <p className="text-xs font-semibold mb-2">Configurazione applicata</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.nuovo_infisso.materiale}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {config.nuovo_infisso.colore.nome}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {config.apertura_default.replace(/_/g, " ")}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {config.nuovo_infisso.vetro.tipo}
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
                Il render fotorealistico è pronto
              </p>
            </div>
          </div>

          {/* Before/After slider */}
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

          {/* Result image solo */}
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
                  {config.nuovo_infisso.materiale}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {config.nuovo_infisso.colore.nome}
                  {config.nuovo_infisso.colore.ral ? ` RAL ${config.nuovo_infisso.colore.ral}` : ""}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {config.apertura_default.replace(/_/g, " ")}
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
                setFotoAnalisi(null);
                setAnalysisError(undefined);
                setSessionId(null);
                setResultUrls([]);
                setSavedToGallery(false);
                setSelectedTrasformazione(null);
                setConfig(DEFAULT_CONFIG);
              }}
            >
              Nuovo render
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate("/azienda/render/gallery")}
            >
              Vai alla galleria
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
