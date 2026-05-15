import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import {
  WIZARD_CERNIERE_OPTIONS,
  WIZARD_CASS_MATERIALI,
  WIZARD_HANDLE_TYPES,
  WIZARD_HW_COLORS,
  WIZARD_LEGNO,
  WIZARD_PROFILI,
  WIZARD_NODO_OPTIONS,
  WIZARD_RAL,
  WIZARD_TAPP_OPTIONS,
  WIZARD_TAPP_COLORS,
  WIZARD_TRAVERSO_OPTIONS,
  WIZARD_TIPI,
  RAL_FAMILY_LABELS,
  getColorById,
  getRalsByFamily,
  getTappColorsByFamily,
  profileSupportsAsymmetricNode,
  getReferenceImageUrl,
  mapWizardToConfig,
  profileSupportsHiddenHinges,
  type RalFamily,
  type WizardCerniere,
  type WizardHandleType,
  type WizardHw,
  type WizardNodo,
  type WizardProfilo,
  type WizardState,
  type WizardTapp,
  type WizardTraverso,
  type WizardTipo,
} from "@/modules/render/lib/configMapper";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import {
  createFallbackWindowSceneAnalysis,
  normalizeWindowSceneAnalysis,
} from "@/modules/render/lib/windowSceneAnalysis";
import type { WindowPhotoMeta, WindowRenderConfig, WindowSceneAnalysis } from "@/modules/render/lib/types";
import { preloadImage } from "@/lib/render/preloadImage";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";

const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
// v8.4.2 — Aumentato 180s → 300s (5 min) per allinearsi al caso peggiore
// di generate-render con retry corrective (multi-criterion QA). Il polling
// si stoppa appena status diventa "completed" o "failed" → 300s è solo il
// safety net per casi davvero estremi (provider degradato + retry + QA).
const MAX_POLL_SEC = 300;
const STEP_LABELS = ["Foto", "Analisi", "Aperture", "Infisso", "Finiture", "Accessori", "Render"];

const INITIAL_STATE: WizardState = {
  tipo: "",
  profilo: "",
  manigliaCentrale: false,
  coloreInfisso: "",
  tipoManiglia: "classica_dritta",
  coloreHw: "cromo",
  cass: false,
  cassMat: "stesso_colore",
  cassCol: "",
  tapp: "no",
  tappCol: "stesso",
  // v8.x — nuovi controlli wizard
  traverso: "auto",
  cerniere: "visibili",
  nodo: "simmetrico",
};

function readImageDimensions(file: File): Promise<WindowPhotoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve({
        width,
        height,
        orientation: width === height ? "square" : width > height ? "landscape" : "portrait",
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere le dimensioni della foto."));
    };
    img.src = url;
  });
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function RenderNewV2() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // Embed mode: usato dal Dialog del wizard preventivo Serramenti per
  // mostrare il builder in iframe senza CompanyLayout (navbar/sidebar).
  // Attivato via `?embed=1` nella URL. Side-effect:
  //   - Postmessage al parent quando il render e' completed -> il parent
  //     puo' chiudere il dialog e auto-importare nel BOM.
  //   - Nascosti i bottoni di navigazione cross-pagina.
  const isEmbed = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("embed") === "1";

  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<WindowPhotoMeta | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // v8.4 — persistenza wizard state in sessionStorage:
  // refresh durante il wizard non perde piu' le scelte (tipo/profilo/colori).
  // Solo la foto File non e' serializzabile e va ricaricata se l'utente
  // refresha (preview/photoPath possono essere ricreati da photoPath).
  const [state, setState] = useState<WizardState>(() => {
    if (typeof window === "undefined") return INITIAL_STATE;
    try {
      const saved = sessionStorage.getItem("render-wizard-state");
      if (saved) return { ...INITIAL_STATE, ...JSON.parse(saved) };
    } catch {
      // sessionStorage non disponibile (Safari private mode) o JSON corrotto
    }
    return INITIAL_STATE;
  });
  const [notes, setNotes] = useState("");

  const [sceneAnalysis, setSceneAnalysis] = useState<WindowSceneAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedOpeningIds, setSelectedOpeningIds] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalSignedUrl, setOriginalSignedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const crmPersistedRef = useRef(false);

  // v8.4 — Persistenza wizard state in sessionStorage:
  // ogni cambio di state viene salvato per sopravvivere al refresh pagina.
  // Esclude i campi non-serializzabili (File preview) gestiti separatamente.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem("render-wizard-state", JSON.stringify(state));
    } catch {
      // sessionStorage quota piena o private mode — ignora silenziosamente
    }
  }, [state]);

  // Removed v8.3.8: l'effect che forzava cerniere=visibili su profili
  // non-compatibili contraddiceva la scelta utente. Le cerniere a scomparsa
  // sono ora liberamente selezionabili (premium architectural upsell) e
  // l'UI mostra un caveat informativo invece di sovrascrivere lo state.

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const renderPreview = useMemo<WindowRenderConfig | null>(() => {
    if (!sceneAnalysis || !state.tipo || !state.profilo || !state.coloreInfisso) return null;
    try {
      return mapWizardToConfig(state, notes, {
        sceneAnalysis,
        selectedOpeningIds,
        photoMeta,
      });
    } catch {
      return null;
    }
  }, [sceneAnalysis, selectedOpeningIds, state, notes, photoMeta]);

  const handleFileChange = useCallback((file: File | null) => {
    if (!file) {
      setPhoto(null);
      setPhotoPreview(null);
      setPhotoMeta(null);
      setPhotoPath(null);
      setSessionId(null);
      setSceneAnalysis(null);
      setSelectedOpeningIds([]);
      setAnalysisError(null);
      setResultUrl(null);
      setGenerateError(null);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoPreview(nextPreview);
    setPhotoMeta(null);
    setPhotoPath(null);
    setSessionId(null);
    setSceneAnalysis(null);
    setSelectedOpeningIds([]);
    setAnalysisError(null);
    setResultUrl(null);
    setGenerateError(null);

    void readImageDimensions(file)
      .then(setPhotoMeta)
      .catch(() => setPhotoMeta(null));
  }, []);

  const startWindowAnalysis = useCallback(async (path: string, sid: string) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const { data: signed } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(path, 300);

      if (!signed?.signedUrl) {
        throw new Error("Signed URL non disponibile per l'analisi.");
      }

      const headers = await getEdgeFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("analyze-window-photo", {
        body: { image_url: signed.signedUrl, session_id: sid },
        headers,
      });

      if (error || data?.error) {
        throw new Error(
          await resolveEdgeFunctionErrorMessage({
            error,
            data,
            fallback: "Analisi ambiente non disponibile.",
          }),
        );
      }

      const normalized = normalizeWindowSceneAnalysis(data?.foto_analisi ?? data, photoMeta);
      setSceneAnalysis(normalized);
      setSelectedOpeningIds(normalized.openings.map((opening) => opening.id));
    } catch (err) {
      const fallback = createFallbackWindowSceneAnalysis(photoMeta);
      setSceneAnalysis(fallback);
      setSelectedOpeningIds(fallback.openings.map((opening) => opening.id));
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysisLoading(false);
    }
  }, [photoMeta]);

  const uploadAndCreateSession = useCallback(async (): Promise<{ sid: string; path: string } | null> => {
    if (!user) {
      toast.error("Devi essere autenticato per creare un render.");
      return null;
    }
    if (!companyId) {
      toast.error("Azienda non identificata. Ricarica la pagina o riprova.");
      return null;
    }
    if (!photo) {
      toast.error("Carica una foto prima di procedere.");
      return null;
    }
    if (sessionId && photoPath) {
      return { sid: sessionId, path: photoPath };
    }

    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_original.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("render-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });

      if (upErr) {
        const message = upErr.message ?? "";
        if (/row-level security|permission|policy/i.test(message)) {
          throw new Error("Permessi insufficienti per caricare la foto. Verifica l'azienda attiva.");
        }
        if (/not found|bucket/i.test(message)) {
          throw new Error("Bucket 'render-originals' non disponibile. Contatta l'assistenza.");
        }
        throw new Error(`Upload foto fallito: ${message || "errore sconosciuto"}`);
      }

      const { data: sess, error: sessErr } = await supabase
        .from("render_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: path,
          config: {},
        })
        .select("id")
        .single();

      if (sessErr || !sess) {
        throw new Error(sessErr?.message ?? "Creazione sessione render fallita.");
      }

      setPhotoPath(path);
      setSessionId(sess.id);
      return { sid: sess.id, path };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setUploading(false);
    }
  }, [companyId, photo, photoPath, sessionId, user]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sid: string) => {
    // Always cancel any existing poll before starting a new one — guards
    // against doppio-click "Genera" che produrrebbe due loop concorrenti.
    stopPolling();
    let intervalIdx = 0;

    const poll = async () => {
      if (elapsedRef.current >= MAX_POLL_SEC) {
        stopPolling();
        setGenerating(false);
        setGenerateError("Timeout: il render sta impiegando troppo tempo.");
        return;
      }

      const { data: sess, error: pollError } = await supabase
        .from("render_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      if (pollError) {
        stopPolling();
        setGenerating(false);
        setGenerateError(`Non riesco a verificare lo stato del render: ${pollError.message}`);
        return;
      }

      if (sess?.status === "completed" && sess.result_urls?.length) {
        stopPolling();
        await preloadImage(sess.result_urls[0]);
        setResultUrl(sess.result_urls[0]);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
        // EMBED MODE: notifica il parent (Dialog StepAccessori) che il
        // render e' pronto. Il parent chiude il dialog e auto-importa.
        if (isEmbed && typeof window !== "undefined" && window.parent !== window) {
          try {
            window.parent.postMessage(
              { type: "sr-render-completed", sessionId: sid },
              window.location.origin,
            );
          } catch {
            // Parent non raggiungibile: il render resta comunque completato nella pagina corrente.
          }
        }
        return;
      }

      if (sess?.status === "failed") {
        const errorMessage = sess.error_message || "Render fallito";
        stopPolling();
        setGenerating(false);
        setGenerateError(errorMessage);
        // EMBED MODE: notifica anche in caso di fallimento -> il parent
        // (Dialog StepAccessori) puo' mostrare un banner errore e
        // consentire all'utente di chiudere/riprovare.
        if (isEmbed && typeof window !== "undefined" && window.parent !== window) {
          try {
            window.parent.postMessage(
              { type: "sr-render-failed", sessionId: sid, error: errorMessage },
              window.location.origin,
            );
          } catch {
            // Parent non raggiungibile: l'errore resta visibile nella pagina corrente.
          }
        }
        return;
      }

      pollRef.current = setTimeout(
        poll,
        POLL_INTERVALS[Math.min(intervalIdx++, POLL_INTERVALS.length - 1)],
      );
    };

    poll();
  }, [companyId, queryClient, stopPolling, isEmbed]);

  const startRender = useCallback(async () => {
    if (!sessionId || !companyId || generating) return;

    let config: WindowRenderConfig;
    try {
      config = mapWizardToConfig(state, notes, {
        sceneAnalysis,
        selectedOpeningIds,
        photoMeta,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }

    stopPolling();

    setGenerating(true);
    setGenerateError(null);
    setResultUrl(null);
    elapsedRef.current = 0;
    setElapsedSec(0);

    const { error: updateError } = await supabase
      .from("render_sessions")
      .update({
        config,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
      .eq("id", sessionId);

    if (updateError) {
      setGenerating(false);
      setGenerateError(updateError.message);
      toast.error(`Salvataggio configurazione render fallito: ${updateError.message}`);
      return;
    }

    tickRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
    }, 1000);

    try {
      const headers = await getEdgeFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("generate-render", {
        body: {
          session_id: sessionId,
          config,
          target_width: photoMeta?.width,
          target_height: photoMeta?.height,
        },
        headers,
      });

      if (error || data?.error) {
        throw new Error(
          await resolveEdgeFunctionErrorMessage({
            error,
            data,
            fallback: "Generazione render non riuscita.",
          }),
        );
      }

      if (data?.result_url) {
        stopPolling();
        await preloadImage(data.result_url as string);
        setResultUrl(data.result_url as string);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
        return;
      }

      startPolling(sessionId);
    } catch (err) {
      // v8.4.2 — Fallback resiliente: se l'invoke timeoutta (es. il render
      // sta legittimamente impiegando >240s con QA retry) la edge function
      // probabilmente continua in background. Attiviamo comunque il polling
      // su render_sessions: se la function completa, il polling raccoglie
      // il risultato. Se davvero ha fallito, il polling vedrà status="failed"
      // o timeoutterà a sua volta (MAX_POLL_SEC = 180s).
      const message = err instanceof Error ? err.message : String(err);
      const isTimeoutLike = /timeout|aborted|Failed to send a request/i.test(message);
      if (isTimeoutLike && sessionId) {
        console.warn("[render] invoke timed out, falling back to polling");
        startPolling(sessionId);
        // Mostra un messaggio non-bloccante invece di error rosso
        toast.message("Il render sta impiegando più tempo del previsto. Attendi...");
        return;
      }
      stopPolling();
      setGenerating(false);
      setGenerateError(message);
      toast.error(message);
    }
  }, [companyId, generating, notes, photoMeta, queryClient, sceneAnalysis, selectedOpeningIds, sessionId, startPolling, stopPolling, state]);

  useEffect(() => {
    if (!photoPath || originalSignedUrl) return;
    void (async () => {
      const { data: signed } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(photoPath, 3600);
      if (signed?.signedUrl) setOriginalSignedUrl(signed.signedUrl);
    })();
  }, [originalSignedUrl, photoPath]);

  useEffect(() => {
    if (!sessionId) return;
    if (!contactId && !opportunityId && !crmPersistedRef.current) return;
    crmPersistedRef.current = true;
    void supabase
      .from("render_sessions")
      .update({ contact_id: contactId, opportunity_id: opportunityId })
      .eq("id", sessionId);
  }, [contactId, opportunityId, sessionId]);

  const goNext = useCallback(async () => {
    if (step === 1) {
      const created = await uploadAndCreateSession();
      if (!created) return;
      setStep(2);
      void startWindowAnalysis(created.path, created.sid);
      return;
    }
    if (step < 7) setStep((current) => (current + 1) as Step);
  }, [startWindowAnalysis, step, uploadAndCreateSession]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((current) => (current - 1) as Step);
  }, [step]);

  const reset = useCallback(() => {
    stopPolling();
    crmPersistedRef.current = false;

    setStep(1);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoMeta(null);
    setPhotoPath(null);
    setSessionId(null);
    setState(INITIAL_STATE);
    setNotes("");
    // v8.4 — Pulisci anche la persistenza sessionStorage al reset wizard
    try {
      sessionStorage.removeItem("render-wizard-state");
    } catch {
      // sessionStorage non disponibile, ignora
    }
    setSceneAnalysis(null);
    setSelectedOpeningIds([]);
    setAnalysisLoading(false);
    setAnalysisError(null);
    setResultUrl(null);
    setOriginalSignedUrl(null);
    setGenerateError(null);
    setGenerating(false);
    setElapsedSec(0);
    setContactId(null);
    setOpportunityId(null);
  }, [stopPolling]);

  const downloadResult = useCallback(async () => {
    if (!resultUrl) return;
    try {
      await downloadRenderImage(resultUrl, `render_infissi_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrl]);

  const canGoNextFromStep = useCallback((current: Step) => {
    switch (current) {
      case 1:
        return Boolean(photo);
      case 2:
        return !analysisLoading && Boolean(sceneAnalysis);
      case 3:
        return selectedOpeningIds.length > 0;
      case 4:
        return Boolean(state.tipo && state.profilo);
      case 5:
        return Boolean(state.coloreInfisso);
      case 6:
        return true;
      default:
        return false;
    }
  }, [analysisLoading, photo, sceneAnalysis, selectedOpeningIds.length, state.coloreInfisso, state.profilo, state.tipo]);

  const progressValue = ((step - 1) / (STEP_LABELS.length - 1)) * 100;

  return (
    <div className={cn("mx-auto pb-8", isEmbed ? "max-w-5xl" : "max-w-5xl")}>
      {/* HEADER:
          - modalita' standalone: header completo con titolo + descrizione
            promozionale + step counter + progress bar
          - modalita' EMBED (Dialog): header compatto SOLO progress +
            step labels (l'header del Dialog gia' fornisce titolo).
            Niente descrizione promozionale che ruba spazio verticale
            prezioso dentro il modale. */}
      {isEmbed ? (
        <div className="mb-4 rounded-b-2xl bg-gradient-to-br from-slate-800 to-slate-700 px-5 py-3 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-white/80">
              Step {step} / {STEP_LABELS.length} · {STEP_LABELS[step - 1] ?? ""}
            </span>
            <Badge variant="secondary" className="gap-1 bg-white/15 text-white hover:bg-white/20 text-[10px] py-0">
              <Zap className="h-2.5 w-2.5" /> Render AI
            </Badge>
          </div>
          <Progress value={progressValue} className="h-1 bg-white/20" />
        </div>
      ) : (
        <div className="mb-6 rounded-b-2xl bg-gradient-to-br from-slate-800 to-slate-700 px-5 py-5 text-white">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-xs opacity-70 transition hover:opacity-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Indietro
            </button>
            <Badge variant="secondary" className="gap-1 bg-white/15 text-white hover:bg-white/20">
              <Zap className="h-3 w-3" />
              Render AI — Infissi
            </Badge>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
                Sostituzione serramenti fotorealistica
              </div>
              <div className="text-2xl font-bold">
                Stessa casa, stessa foto, nuovi infissi
              </div>
              <div className="mt-1 max-w-2xl text-sm text-white/70">
                Guidiamo l'AI a sostituire solo le aperture selezionate, mantenendo ambiente, prospettiva,
                arredi, luce e formato della foto esattamente coerenti con l'originale.
              </div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80">
              Step {step} / {STEP_LABELS.length}
            </div>
          </div>

          <div className="mt-4">
            <Progress value={progressValue} className="h-1.5 bg-white/20" />
            <div className="mt-2 grid grid-cols-7 gap-2">
              {STEP_LABELS.map((label, index) => (
                <div key={label} className="text-center">
                  <div
                    className={cn(
                      "mx-auto mb-1 h-2 w-2 rounded-full transition-colors",
                      step >= index + 1 ? "bg-orange-400" : "bg-white/30",
                    )}
                  />
                  <div className={cn("text-[10px] font-semibold", step >= index + 1 ? "text-white" : "text-white/40")}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 px-4">
        <RenderCreditGate />

        {step === 1 && (
          <StepPhoto
            preview={photoPreview}
            meta={photoMeta}
            onFile={handleFileChange}
            onNext={goNext}
            uploading={uploading}
            fileRef={fileRef}
          />
        )}

        {step === 2 && (
          <StepAnalysis
            analysis={sceneAnalysis}
            loading={analysisLoading}
            error={analysisError}
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!canGoNextFromStep(2)}
            onRetry={() => {
              if (photoPath && sessionId) {
                void startWindowAnalysis(photoPath, sessionId);
              }
            }}
          />
        )}

        {step === 3 && sceneAnalysis && (
          <StepTargeting
            analysis={sceneAnalysis}
            selectedOpeningIds={selectedOpeningIds}
            onChange={setSelectedOpeningIds}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 4 && (
          <StepInfisso
            state={state}
            setState={setState}
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!canGoNextFromStep(4)}
          />
        )}

        {step === 5 && (
          <StepFiniture
            state={state}
            setState={setState}
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!canGoNextFromStep(5)}
          />
        )}

        {step === 6 && (
          <StepAccessori
            state={state}
            setState={setState}
            notes={notes}
            onNotesChange={setNotes}
            sceneAnalysis={sceneAnalysis}
            selectedOpeningIds={selectedOpeningIds}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 7 && (
          <StepRender
            preview={renderPreview}
            originalSignedUrl={originalSignedUrl}
            localPreview={photoPreview}
            resultUrl={resultUrl}
            generating={generating}
            elapsedSec={elapsedSec}
            error={generateError}
            contactId={contactId}
            opportunityId={opportunityId}
            notes={notes}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
            onNotesChange={setNotes}
            onGenerate={startRender}
            onRetry={startRender}
            onReset={reset}
            onBack={goBack}
            onDownload={downloadResult}
            onCreateQuote={() => {
              const qs = new URLSearchParams();
              if (contactId) qs.set("contact_id", contactId);
              navigate(`/azienda/marketing/preventivi/nuovo${qs.toString() ? `?${qs}` : ""}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

function StepPhoto({
  preview,
  meta,
  onFile,
  onNext,
  uploading,
  fileRef,
}: {
  preview: string | null;
  meta: WindowPhotoMeta | null;
  onFile: (file: File | null) => void;
  onNext: () => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Anteprima foto" className="block max-h-[520px] w-full object-contain bg-slate-100" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="absolute right-3 top-3"
                onClick={() => onFile(null)}
              >
                Cambia foto
              </Button>
              {meta && (
                <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white">
                  {meta.width}×{meta.height} · {meta.orientation}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-[360px] w-full flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 transition hover:border-orange-400 hover:bg-orange-50"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
                <Camera className="h-7 w-7" />
              </div>
              <div className="space-y-1 text-center">
                <div className="text-lg font-bold">Carica la foto reale dell'ambiente</div>
                <div className="text-sm text-muted-foreground">
                  L'obiettivo è sostituire solo gli infissi visibili mantenendo identico tutto il resto.
                </div>
              </div>
              <div className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white">
                <Upload className="mr-2 inline h-4 w-4" />
                Sfoglia file
              </div>
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 1</div>
            <h2 className="mt-1 text-xl font-bold">Foto sorgente</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Più la foto è chiara e leggibile, più il render finale sembrerà una sostituzione reale e non una reinterpretazione AI.
            </p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <div>1. Inquadra bene le aperture da modificare.</div>
            <div>2. Evita tagli eccessivi dei bordi del vano finestra.</div>
            <div>3. Mantieni visibili elementi di contorno utili: tende, davanzale, radiatore, cassonetto.</div>
            <div>4. Se la foto è verticale, il render resterà verticale.</div>
          </div>

          <Button
            size="lg"
            className="w-full gap-2 bg-slate-800 hover:bg-slate-700"
            disabled={!preview || uploading}
            onClick={onNext}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Upload e preparazione…
              </>
            ) : (
              <>
                Analizza ambiente
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StepAnalysis({
  analysis,
  loading,
  error,
  onBack,
  onNext,
  nextDisabled,
  onRetry,
}: {
  analysis: WindowSceneAnalysis | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  onRetry?: () => void;
}) {
  const openings = analysis?.openings ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 2</div>
              <h2 className="mt-1 text-xl font-bold">Analisi ambiente esistente</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Leggiamo la scena per capire aperture visibili, accessori esistenti e punti da preservare.
              </p>
            </div>
            <Badge className="gap-1 bg-slate-900 text-white hover:bg-slate-900">
              <ScanSearch className="h-3.5 w-3.5" />
              Scene analysis
            </Badge>
          </div>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
              <div className="mt-3 text-base font-semibold">Analisi in corso…</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Stiamo identificando aperture, contorni e accessori da trattare con precisione.
              </div>
            </div>
          ) : analysis ? (
            <div className="mt-5 space-y-4">
              {error && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Analisi AI parziale: abbiamo attivato una fallback analysis per non bloccarti. Dettaglio: {error}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Aperture visibili" value={String(analysis.estimatedOpeningsVisible)} />
                <MetricCard label="Ambiente percepito" value={analysis.environmentType.replace(/_/g, " ")} />
                <MetricCard label="Vista" value={analysis.viewMode} />
                <MetricCard label="Luce" value={analysis.lightingDirection} />
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-sm font-semibold">Lettura scena</div>
                <div className="mt-2 text-sm text-muted-foreground">{analysis.environmentSummary}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {analysis.untouchedElements.slice(0, 8).map((item) => (
                    <Badge key={item} variant="outline" className="bg-white">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {openings.map((opening) => (
                  <Card key={opening.id} className="border-slate-200">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 font-bold text-orange-600">
                            {opening.label}
                          </div>
                          <div>
                            <div className="font-semibold">{opening.typeCurrent.replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{opening.approximatePlacement}</div>
                          </div>
                        </div>
                        <Badge variant="outline">{opening.sashCount} ante</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {opening.hasCassonetto && <MiniBadge text="cassonetto" />}
                        {opening.hasRollerShutter && <MiniBadge text="tapparella" />}
                        {opening.hasBelt && <MiniBadge text="cinghia visibile" intent="warning" />}
                        {opening.hasCurtains && <MiniBadge text="tende" />}
                        {opening.radiatorNearby && <MiniBadge text="radiatore vicino" />}
                        {opening.hasSill && <MiniBadge text="davanzale" />}
                        {opening.hasGrates && <MiniBadge text="grate" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {opening.materialPerceived} · {opening.colorPerceived}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : error ? (
            // v8.4 — Empty/error state con CTA esplicita: niente piu' schermata
            // vuota quando l'analisi fallisce senza fallback.
            <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-6 text-center">
              <div className="text-base font-semibold text-red-900">Analisi non riuscita</div>
              <div className="mt-2 text-sm text-red-800">
                Non siamo riusciti a leggere la scena. {error}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                {onRetry && (
                  <Button onClick={onRetry} variant="default" className="gap-2">
                    Riprova analisi
                  </Button>
                )}
                <Button onClick={onBack} variant="outline">
                  Cambia foto
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">
              In attesa di una foto da analizzare. Torna al primo step per caricarla.
            </div>
          )}
        </CardContent>
      </Card>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={nextDisabled} nextLabel="Scegli aperture target" />
    </div>
  );
}

function StepTargeting({
  analysis,
  selectedOpeningIds,
  onChange,
  onBack,
  onNext,
}: {
  analysis: WindowSceneAnalysis;
  selectedOpeningIds: string[];
  onChange: (ids: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const allIds = analysis.openings.map((opening) => opening.id);
  const allSelected = selectedOpeningIds.length === allIds.length;

  const toggle = (id: string) => {
    if (selectedOpeningIds.includes(id)) {
      const next = selectedOpeningIds.filter((item) => item !== id);
      if (next.length > 0) onChange(next);
      return;
    }
    onChange([...selectedOpeningIds, id]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 3</div>
            <h2 className="mt-1 text-xl font-bold">Quali aperture vuoi modificare?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Se nella foto ci sono più infissi, decidiamo con precisione quali sostituire e quali lasciare identici.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={allSelected ? "default" : "outline"}
              className={cn(allSelected && "bg-slate-800 hover:bg-slate-700")}
              onClick={() => onChange(allIds)}
            >
              Applica a tutte le aperture visibili
            </Button>
            <Button type="button" variant="outline" onClick={() => onChange(allIds.slice(0, 1))}>
              Solo apertura principale
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {analysis.openings.map((opening) => {
              const checked = selectedOpeningIds.includes(opening.id);
              return (
                <button
                  key={opening.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(opening.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    checked ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-300",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <SelectionMark checked={checked} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">
                          Apertura {opening.label}
                        </div>
                        <Badge variant={checked ? "default" : "outline"}>{checked ? "Target" : "Intatta"}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {opening.typeCurrent.replace(/_/g, " ")} · {opening.sashCount} ante · {opening.approximatePlacement}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {opening.hasBelt && <MiniBadge text="cinghia da gestire" intent="warning" />}
                        {opening.hasCassonetto && <MiniBadge text="cassonetto" />}
                        {opening.hasCurtains && <MiniBadge text="tende" />}
                        {opening.radiatorNearby && <MiniBadge text="radiatore vicino" />}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={selectedOpeningIds.length === 0} nextLabel="Configura il nuovo infisso" />
    </div>
  );
}

function StepInfisso({
  state,
  setState,
  onBack,
  onNext,
  nextDisabled,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 4</div>
            <h2 className="mt-1 text-xl font-bold">Nuovo infisso</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Definiamo tipologia, materiale e famiglia di profilo del serramento da installare.
            </p>
          </div>

          <div>
            <SectionTitle>Tipologia apertura</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {WIZARD_TIPI.map((option) => (
                <ChoiceCard
                  key={option.id}
                  title={option.label}
                  desc={option.desc}
                  selected={state.tipo === option.id}
                  onClick={() => setState((current) => ({ ...current, tipo: option.id as WizardTipo }))}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Famiglia profilo</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {WIZARD_PROFILI.map((option) => (
                <ChoiceCard
                  key={option.id}
                  title={option.label}
                  desc={option.desc}
                  selected={state.profilo === option.id}
                  onClick={() => setState((current) => ({ ...current, profilo: option.id as WizardProfilo }))}
                />
              ))}
            </div>
          </div>

          {state.profilo && (state.tipo === "F2A" || state.tipo === "PF2A") && (
            <div className="space-y-2">
              <SectionTitle>Configurazione nodo centrale (solo 2 ante)</SectionTitle>
              <div className="grid gap-3 md:grid-cols-3">
                {WIZARD_NODO_OPTIONS.map((option) => {
                  const supportsAsymmetric = profileSupportsAsymmetricNode(state.profilo as WizardProfilo);
                  const disabled = option.id !== "simmetrico" && !supportsAsymmetric;
                  return (
                    <ChoiceCard
                      key={option.id}
                      title={`${option.label}${option.upsell ? " · premium" : ""}`}
                      desc={disabled ? "Disponibile su alluminio, minimal o legno-alluminio." : option.desc}
                      selected={state.nodo === option.id}
                      disabled={disabled}
                      onClick={() => setState((current) => ({
                        ...current,
                        nodo: option.id as WizardNodo,
                        // backward-compat: tiene allineato il vecchio flag
                        manigliaCentrale: option.id === "maniglia_centrale",
                      }))}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={nextDisabled} nextLabel="Definisci finiture" />
    </div>
  );
}

function StepFiniture({
  state,
  setState,
  onBack,
  onNext,
  nextDisabled,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  const [tab, setTab] = useState<"ral" | "legno">("ral");
  // v8.3 — colorList rimosso: la griglia colori ora usa getRalsByFamily / WIZARD_LEGNO direttamente.
  const handleOptions = useMemo(
    () => state.tipo === "SCORR"
      ? WIZARD_HANDLE_TYPES.filter((item) => item.id === "alzante")
      : WIZARD_HANDLE_TYPES.filter((item) => item.id !== "alzante"),
    [state.tipo],
  );

  useEffect(() => {
    if (!handleOptions.some((item) => item.id === state.tipoManiglia)) {
      setState((current) => ({
        ...current,
        tipoManiglia: (handleOptions[0]?.id ?? "classica_dritta") as WizardHandleType,
      }));
    }
  }, [handleOptions, setState, state.tipoManiglia]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 5</div>
            <h2 className="mt-1 text-xl font-bold">Finiture e ferramenta</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Colore telaio, effetto legno e finitura maniglie devono essere coerenti con il posizionamento premium del render.
            </p>
          </div>

          <div>
            <SectionTitle>Finitura telaio</SectionTitle>
            <div className="mb-3 flex overflow-hidden rounded-lg border">
              {(["ral", "legno"] as const).map((item, index) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-bold transition",
                    tab === item ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                    index > 0 && "border-l",
                  )}
                >
                  {item === "ral" ? "Colori RAL" : "Effetti legno"}
                </button>
              ))}
            </div>

            {tab === "legno" && (
              <div className="mb-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3 text-sm text-slate-700">
                Le anteprime sono foto reali dei campioni del fornitore. Il render AI usa
                anche la descrizione materica del colore (venatura, finitura, tono caldo/freddo)
                non solo il nome commerciale.
              </div>
            )}

            {/* v8.3 — Mazzetta colori RAL raggruppata per famiglia, con foto reali */}
            {tab === "ral" ? (
              <div className="space-y-4">
                {(["bianchi", "grigi", "marroni", "blu", "rossi", "premium"] as const).map((family) => {
                  const colors = getRalsByFamily(family as RalFamily);
                  if (!colors.length) return null;
                  return (
                    <div key={family}>
                      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {RAL_FAMILY_LABELS[family as RalFamily]}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                        {colors.map((c) => (
                          <ColorSwatch
                            key={c.id}
                            color={c}
                            selected={state.coloreInfisso === c.id}
                            onClick={() => setState((current) => ({ ...current, coloreInfisso: c.id }))}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {WIZARD_LEGNO.map((c) => (
                  <ColorSwatch
                    key={c.id}
                    color={c}
                    selected={state.coloreInfisso === c.id}
                    onClick={() => setState((current) => ({ ...current, coloreInfisso: c.id }))}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionTitle>Tipologia maniglia</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {handleOptions.map((handleType) => {
                // v8.3 — foto reale della maniglia se disponibile, altrimenti SVG fallback.
                const opt = handleType as typeof handleType & { referenceImage?: string | null };
                const previewUrl = opt.referenceImage ? getReferenceImageUrl(opt.referenceImage) : null;
                const selected = state.tipoManiglia === handleType.id;
                return (
                  <button
                    key={handleType.id}
                    type="button"
                    onClick={() => setState((current) => ({ ...current, tipoManiglia: handleType.id as WizardHandleType }))}
                    className={cn(
                      "rounded-2xl border-2 p-3 text-left transition flex gap-3",
                      selected ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-300",
                    )}
                  >
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 border">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={handleType.label}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <HandlePreview kind={handleType.family} finish={WIZARD_HW_COLORS.find((item) => item.id === state.coloreHw)?.hex ?? "#C0C0C0"} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{handleType.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{handleType.desc}</div>
                      {!previewUrl && (
                        <div className="mt-1 text-[10px] italic text-amber-600">Anteprima generica</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionTitle>Finitura maniglie e cerniere</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {WIZARD_HW_COLORS.map((hardware) => (
                <button
                  key={hardware.id}
                  type="button"
                  onClick={() => setState((current) => ({ ...current, coloreHw: hardware.id as WizardHw }))}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    state.coloreHw === hardware.id ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-300",
                  )}
                >
                  <div className="h-11 rounded-xl border" style={{ background: hardware.hex }} />
                  <div className="mt-2 text-sm font-semibold">{hardware.nome}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    La finitura si applica a maniglia e cerniere visibili.
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={nextDisabled} nextLabel="Accessori e regole" />
    </div>
  );
}

function StepAccessori({
  state,
  setState,
  notes,
  onNotesChange,
  sceneAnalysis,
  selectedOpeningIds,
  onBack,
  onNext,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  notes: string;
  onNotesChange: (value: string) => void;
  sceneAnalysis: WindowSceneAnalysis | null;
  selectedOpeningIds: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  const targetOpenings = sceneAnalysis?.openings.filter((opening) => selectedOpeningIds.includes(opening.id)) ?? [];
  const hasVisibleManualBelt = targetOpenings.some((opening) => opening.hasBelt || opening.hasBeltBox);
  const hasNoVisibleCurtain = targetOpenings.some((opening) =>
    opening.hasRollerShutter && opening.rollerCurtainState !== "partially_lowered" && opening.rollerCurtainState !== "fully_lowered",
  );
  const isDoorWindow = state.tipo === "PF1A" || state.tipo === "PF2A" || state.tipo === "PF3A";
  const hasDetectedTransom = targetOpenings.some((opening) => opening.hasHorizontalTransom);
  const hasCompositionChange = targetOpenings.some((opening) => opening.sashCount !== Number(String(state.tipo).match(/\d/)?.[0] ?? opening.sashCount));
  const hiddenHingesSupported = profileSupportsHiddenHinges(state.profilo as WizardProfilo);
  const infissoColor = getColorById(state.coloreInfisso);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 6</div>
            <h2 className="mt-1 text-xl font-bold">Oscuranti, accessori e dettagli</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Qui definiamo cassonetti, tapparelle e note libere che influenzeranno le regole di sostituzione.
            </p>
          </div>

          <div className="space-y-3">
            <SectionTitle>Cassonetto</SectionTitle>
            <button
              type="button"
              aria-pressed={state.cass}
              onClick={() => setState((current) => ({ ...current, cass: !current.cass }))}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                state.cass ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-300",
              )}
            >
              <SelectionMark checked={state.cass} />
              <div>
                <div className="font-semibold">Sostituisci il cassonetto</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Il prompt tratterà il cassonetto come elemento separato dal serramento.
                </div>
              </div>
            </button>

            {state.cass && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {WIZARD_CASS_MATERIALI.map((option) => (
                  <ChoiceCard
                    key={option.id}
                    title={option.label}
                    desc={option.desc}
                    selected={state.cassMat === option.id}
                    onClick={() => setState((current) => ({ ...current, cassMat: option.id as typeof current.cassMat }))}
                  />
                ))}
              </div>
            )}

            {state.cass && state.cassMat === "colore_custom" && (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold">Colore cassonetto personalizzato</div>
                <div className="space-y-3">
                  {(["bianchi", "grigi", "marroni", "verdi", "blu", "rossi", "premium"] as RalFamily[]).map((family) => {
                    const colors = getRalsByFamily(family);
                    if (colors.length === 0) return null;
                    return (
                      <div key={family}>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {RAL_FAMILY_LABELS[family]}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {colors.map((color) => (
                            <button
                              key={color.id}
                              type="button"
                              title={color.nome}
                              onClick={() => setState((current) => ({ ...current, cassCol: color.id }))}
                              className={cn(
                                "h-10 w-10 rounded-lg border-2 border-white shadow-sm transition",
                                state.cassCol === color.id ? "ring-2 ring-orange-500 ring-offset-1" : "hover:ring-1 hover:ring-orange-300",
                              )}
                              style={{ background: color.hex }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {state.cassCol && (() => {
                  const selected = WIZARD_RAL.find((c) => c.id === state.cassCol);
                  return selected ? (
                    <div className="mt-3 text-xs text-slate-600">
                      Selezionato: <strong>{selected.nome}</strong>
                      {selected.code ? ` (RAL ${selected.code})` : ""}
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {state.cass && state.cassMat === "stesso_colore" && infissoColor && (
              <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
                Cassonetto coordinato in <strong>{infissoColor.nome}</strong>.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionTitle>Tapparella / oscurante</SectionTitle>
            <div className="grid gap-3 md:grid-cols-3">
              {WIZARD_TAPP_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  title={option.label}
                  desc={option.desc}
                  selected={state.tapp === option.id}
                  onClick={() => setState((current) => ({ ...current, tapp: option.id as WizardTapp }))}
                />
              ))}
            </div>

            {(state.tapp === "motorizzate" || state.tapp === "nuove") && (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold">Colore tapparella</div>
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setState((current) => ({ ...current, tappCol: "stesso" }))}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                      state.tappCol === "stesso" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border bg-white hover:border-orange-300",
                    )}
                  >
                    Stesso colore infisso
                  </button>
                </div>
                <div className="space-y-3">
                  {(["bianchi", "grigi", "marroni", "verdi", "blu", "rossi", "premium"] as RalFamily[]).map((family) => {
                    const colors = getTappColorsByFamily(family);
                    if (colors.length === 0) return null;
                    return (
                      <div key={family}>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {RAL_FAMILY_LABELS[family]}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {colors.map((color) => (
                            <button
                              key={color.id}
                              type="button"
                              title={color.nome}
                              onClick={() => setState((current) => ({ ...current, tappCol: color.id }))}
                              className={cn(
                                "h-10 w-10 rounded-lg border-2 border-white shadow-sm transition",
                                state.tappCol === color.id ? "ring-2 ring-orange-500 ring-offset-1" : "hover:ring-1 hover:ring-orange-300",
                              )}
                              style={{ background: color.hex }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {state.tappCol && state.tappCol !== "stesso" && (() => {
                  const selected = WIZARD_TAPP_COLORS.find((c) => c.id === state.tappCol)
                    ?? WIZARD_RAL.find((c) => c.id === state.tappCol);
                  return selected ? (
                    <div className="mt-3 text-xs text-slate-600">
                      Selezionato: <strong>{selected.nome}</strong>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {state.tapp === "motorizzate" && hasVisibleManualBelt && (
              <div className="rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                Rilevata cinghia manuale su almeno una apertura target: il prompt imporrà rimozione cinghia,
                placca/avvolgitore e ripristino parete senza lasciare tracce del vecchio sistema.
              </div>
            )}

            {(state.tapp === "motorizzate" || state.tapp === "nuove") && hasNoVisibleCurtain && (
              <div className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                Nella foto non si vede una tapparella abbassata: il render la manterrà aperta e nascosta nel cassonetto,
                evitando fasce colorate artificiali sopra il vetro.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionTitle>Cerniere</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {WIZARD_CERNIERE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  title={`${option.label}${option.upsell ? " · premium" : ""}`}
                  desc={option.desc}
                  selected={state.cerniere === option.id}
                  onClick={() =>
                    setState((current) => ({ ...current, cerniere: option.id as WizardCerniere }))
                  }
                />
              ))}
            </div>
            {state.cerniere === "scomparsa" && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Il render userà cerniere a scomparsa: lato telaio pulito, senza cilindri o placche visibili.
                {!hiddenHingesSupported && (
                  <span className="mt-1 block text-xs text-emerald-800">
                    Nota tecnica: su profili PVC/legno classici le cerniere a scomparsa
                    sono un upsell architettonico — il render le forzerà comunque come da richiesta.
                  </span>
                )}
              </div>
            )}
          </div>

          {isDoorWindow && (
            <div className="space-y-3">
              <SectionTitle>Traverso portafinestra</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {WIZARD_TRAVERSO_OPTIONS.map((option) => (
                  <ChoiceCard
                    key={option.id}
                    title={option.label}
                    desc={option.desc}
                    selected={state.traverso === option.id}
                    onClick={() => setState((current) => ({ ...current, traverso: option.id as WizardTraverso }))}
                  />
                ))}
              </div>
              {hasDetectedTransom && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  La foto sembra avere un traverso orizzontale: scegli se mantenerlo o pulire la composizione.
                </div>
              )}
            </div>
          )}

          {hasCompositionChange && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Hai scelto una composizione diversa dalla foto: il render cambierà solo ante e vetri del serramento,
              mantenendo foro murario, soglia, pareti e contesto invariati.
            </div>
          )}

          <div className="space-y-3">
            <SectionTitle>Note operative per l'AI</SectionTitle>
            <Textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Esempio: mantieni tende e radiatore identici, resa molto fotorealistica, profilo minimal ma senza cambiare il vano esistente."
              className="min-h-[120px]"
            />
          </div>
        </CardContent>
      </Card>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={false} nextLabel="Riepilogo e genera" nextIcon={<Wand2 className="h-4 w-4" />} nextAccent />
    </div>
  );
}

function StepRender({
  preview,
  originalSignedUrl,
  localPreview,
  resultUrl,
  generating,
  elapsedSec,
  error,
  contactId,
  opportunityId,
  notes,
  onContactChange,
  onOpportunityChange,
  onNotesChange,
  onGenerate,
  onRetry,
  onReset,
  onBack,
  onDownload,
  onCreateQuote,
}: {
  preview: WindowRenderConfig | null;
  originalSignedUrl: string | null;
  localPreview: string | null;
  resultUrl: string | null;
  generating: boolean;
  elapsedSec: number;
  error: string | null;
  contactId: string | null;
  opportunityId: string | null;
  notes: string;
  onContactChange: (id: string | null) => void;
  onOpportunityChange: (id: string | null) => void;
  onNotesChange: (value: string) => void;
  onGenerate: () => void;
  onRetry: () => void;
  onReset: () => void;
  onBack: () => void;
  onDownload: () => void;
  onCreateQuote: () => void;
}) {

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Step 7</div>
            <h2 className="mt-1 text-xl font-bold">Riepilogo finale e generazione</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Controlliamo target, specifiche e regole di sostituzione prima di lanciare il render.
            </p>
          </div>

          {preview ? (
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-slate-200">
                <CardContent className="space-y-4 p-4">
                  <div className="text-sm font-semibold">Scope render</div>
                  <div className="flex flex-wrap gap-2">
                    {preview.target_selection.targetLabels.map((label) => (
                      <Badge key={label} className="bg-slate-800 text-white hover:bg-slate-800">
                        Apertura {label}
                      </Badge>
                    ))}
                    {preview.target_selection.preservedOpeningIds.map((label) => (
                      <Badge key={label} variant="outline">
                        Apertura {label} invariata
                      </Badge>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Specifiche tecniche</div>
                    {preview.technical_specification.map((spec) => (
                      <div key={spec.openingId} className="rounded-xl border bg-slate-50 p-3 text-sm">
                        <div className="font-semibold">
                          Apertura {spec.openingLabel} · {spec.desiredOpeningType.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {spec.material} · {spec.profileId} · {spec.finish.mode === "legno"
                            ? `${spec.finish.name} wood-effect`
                            : `${spec.finish.name}${spec.finish.ral ? ` (RAL ${spec.finish.ral})` : ""}`}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <MiniBadge text={`maniglia ${spec.handleStyle.replace(/_/g, " ")}`} />
                          <MiniBadge text={`hardware ${spec.handleFinish}`} />
                          {spec.hingeMode === "hidden" && <MiniBadge text="cerniere a scomparsa" />}
                          {spec.hingeMode === "visible" && <MiniBadge text={`${spec.hingesPerSash} cerniere per anta`} />}
                          {spec.hingeMode === "visible" && <MiniBadge text="cerniere uniformi come maniglia" />}
                          {spec.compositionChange && <MiniBadge text="composizione aggiornata" intent="warning" />}
                          {spec.transomRule && <MiniBadge text={`traverso ${spec.transomMode}`} />}
                          {spec.cassonetto.replace && <MiniBadge text={`cassonetto ${spec.cassonetto.colorLabel ?? ""}`.trim()} />}
                          {spec.cassonetto.replace && <MiniBadge text="ingombro cassonetto come esistente" />}
                          {spec.shutter.replace && <MiniBadge text={spec.shutter.isMotorized ? "tapparella motorizzata" : "tapparella nuova"} />}
                          {spec.shutter.electricButton?.install && <MiniBadge text="pulsante elettrico coerente" />}
                          {spec.shutter.replace && spec.shutter.visibilityState === "fully_raised_hidden" && <MiniBadge text="tapparella aperta nascosta nel cassonetto" />}
                          {spec.manualControlCleanupRule && <MiniBadge text="rimozione totale comando manuale" intent="warning" />}
                          {spec.reducedNode && <MiniBadge text="profilo ridotto" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="space-y-4 p-4">
                  <div className="text-sm font-semibold">Regole di sostituzione</div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {preview.replacement_manifest.removals.length > 0 ? (
                      preview.replacement_manifest.removals.map((rule) => (
                        <div key={`${rule.code}-${rule.openingIds.join("-")}`} className="rounded-xl border bg-slate-50 p-3">
                          <div className="font-medium text-foreground">{rule.summary}</div>
                          {rule.repairInstruction && <div className="mt-1">{rule.repairInstruction}</div>}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border bg-slate-50 p-3">
                        Nessuna rimozione critica oltre alla sostituzione del serramento.
                      </div>
                    )}
                  </div>

                  <div className="text-sm font-semibold">Elementi da preservare</div>
                  <div className="flex flex-wrap gap-2">
                    {preview.replacement_manifest.keepExactly.slice(0, 12).map((item) => (
                      <Badge key={item} variant="outline">{item}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Completa i passaggi precedenti per costruire un payload render completo.
            </div>
          )}

          {!resultUrl && !generating && !error && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600" onClick={onGenerate} disabled={!preview}>
                <Sparkles className="h-4 w-4" />
                Genera render AI
              </Button>
              <Button size="lg" variant="outline" onClick={onBack}>
                Torna ai dettagli
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <RefreshCw className="h-4 w-4" />
              Render non riuscito
            </div>
            <div className="text-sm text-muted-foreground">{error}</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Riprova
              </Button>
              <Button variant="outline" onClick={onBack}>
                Rivedi configurazione
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : generating ? (
        <RenderProcessingCard
          photoPreview={originalSignedUrl ?? localPreview ?? undefined}
          elapsedSec={elapsedSec}
          accent="orange"
          subjectLabel="L'AI sostituisce gli infissi mantenendo l'ambiente originale"
          tips={[
            "L'AI individua le aperture target e preserva intatti gli elementi non selezionati.",
            "Più la foto è frontale e ben illuminata, più il render risulterà fedele.",
            "Una volta pronto, potrai confrontare prima/dopo e collegare il render al CRM.",
          ]}
        />
      ) : resultUrl ? (
        <>
          <Card className="border-emerald-500/30 bg-emerald-50">
            <CardContent className="flex items-center gap-3 p-4 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-semibold">Render completato</div>
                <div className="text-sm text-emerald-800">
                  Il risultato è pronto per confronto, download e collegamento CRM.
                </div>
              </div>
            </CardContent>
          </Card>

          {(originalSignedUrl || localPreview) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Prima / Dopo
                </div>
                <Badge className="bg-orange-500 text-white hover:bg-orange-600">RENDER AI</Badge>
              </div>
              <BeforeAfterSlider
                beforeUrl={originalSignedUrl ?? localPreview ?? ""}
                afterUrl={resultUrl}
                className="border"
              />
            </div>
          )}

          <Card>
            <CardContent className="p-2">
              <RenderCrmLinker
                contactId={contactId}
                opportunityId={opportunityId}
                onContactChange={onContactChange}
                onOpportunityChange={onOpportunityChange}
              />
            </CardContent>
          </Card>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" />
              Scarica render
            </Button>
            <Button variant="outline" onClick={onReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Nuovo render
            </Button>
          </div>

          <RenderResultRefinementPanel
            config={preview}
            noteValue={notes}
            onNoteChange={onNotesChange}
            onEditChoices={onBack}
            onRegenerate={onGenerate}
            disabled={generating}
            regenerateLabel="Genera nuova variante infissi"
          />

          <Button
            onClick={onCreateQuote}
            disabled={!contactId}
            size="lg"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <FileText className="h-4 w-4" />
            {contactId ? "Crea preventivo da questo render" : "Collega un contatto per creare il preventivo"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold capitalize">{value}</div>
    </div>
  );
}

// v8.3 — Card colore con foto reference reale.
// Fallback al gradient CSS se la foto non c'è o non carica (no UI rotta).
function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: {
    id: string;
    nome: string;
    hex: string;
    referenceImage?: string | null;
    code?: string | null;
    family?: string;
    touch?: string;
    upsell?: boolean;
  };
  selected: boolean;
  onClick: () => void;
}) {
  const previewUrl = color.referenceImage ? getReferenceImageUrl(color.referenceImage) : null;
  const [imgError, setImgError] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 transition-all text-left",
        selected
          ? "border-orange-500 ring-2 ring-orange-200"
          : "border-border hover:border-orange-300",
      )}
      title={color.nome}
    >
      <div className="aspect-square w-full overflow-hidden bg-slate-100">
        {previewUrl && !imgError ? (
          <img
            src={previewUrl}
            alt={color.nome}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full" style={getFrameFinishPreviewStyle(color)} />
        )}
      </div>
      <div className="bg-white px-2 py-1.5">
        <div className="flex items-center gap-1">
          {color.code && (
            <span className="text-[10px] font-mono text-muted-foreground">{color.code}</span>
          )}
          {color.upsell && (
            <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold text-white">
              TOUCH
            </span>
          )}
        </div>
        <div className="truncate text-xs font-semibold">{color.nome}</div>
      </div>
      {selected && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </button>
  );
}

function getFrameFinishPreviewStyle(color: { hex: string; grad?: string; grain?: string; accent?: string }) {
  if ("grad" in color && color.grad) {
    return {
      backgroundImage: [
        "linear-gradient(140deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 42%, rgba(0,0,0,0.08) 100%)",
        `repeating-linear-gradient(102deg, ${color.grain ?? "rgba(90,60,30,0.25)"} 0px, ${color.grain ?? "rgba(90,60,30,0.25)"} 2px, transparent 2px, transparent 11px)`,
        `repeating-linear-gradient(8deg, ${color.accent ?? "rgba(255,255,255,0.12)"} 0px, ${color.accent ?? "rgba(255,255,255,0.12)"} 7px, transparent 7px, transparent 18px)`,
        color.grad,
      ].join(", "),
      backgroundBlendMode: "soft-light, multiply, screen, normal",
    } as const;
  }

  return { background: color.hex } as const;
}

function HandlePreview({ kind, finish }: { kind: string; finish: string }) {
  const metalStyle = {
    background: `linear-gradient(180deg, rgba(255,255,255,0.9), ${finish} 52%, rgba(0,0,0,0.16))`,
  } as const;

  if (kind === "pomolo") {
    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full border shadow-sm" style={metalStyle} />
        <div className="h-1.5 w-10 rounded-full border shadow-sm" style={metalStyle} />
      </div>
    );
  }

  if (kind === "rosetta") {
    return (
      <div className="relative flex h-12 w-20 items-center justify-center">
        <div className="absolute left-4 h-8 w-8 rounded-lg border shadow-sm" style={metalStyle} />
        <div className="absolute left-9 h-1.5 w-10 rounded-full border shadow-sm" style={metalStyle} />
      </div>
    );
  }

  if (kind === "curva") {
    return (
      <div className="relative flex h-12 w-20 items-center justify-center">
        <div className="absolute left-6 h-8 w-2 rounded-full border shadow-sm" style={metalStyle} />
        <div className="absolute left-8 top-[18px] h-2 w-9 rounded-full border shadow-sm" style={{ ...metalStyle, transform: "rotate(-18deg)" }} />
      </div>
    );
  }

  if (kind === "alzante") {
    return (
      <div className="relative flex h-12 w-20 items-center justify-center">
        <div className="absolute left-7 h-9 w-3 rounded-md border shadow-sm" style={metalStyle} />
        <div className="absolute left-10 top-[16px] h-2 w-6 rounded-sm border shadow-sm" style={metalStyle} />
      </div>
    );
  }

  if (kind === "squadrata") {
    return (
      <div className="relative flex h-12 w-20 items-center justify-center">
        <div className="absolute left-6 h-8 w-2 rounded-sm border shadow-sm" style={metalStyle} />
        <div className="absolute left-8 top-[18px] h-2 w-10 rounded-sm border shadow-sm" style={metalStyle} />
      </div>
    );
  }

  return (
    <div className="relative flex h-12 w-20 items-center justify-center">
      <div className="absolute left-6 h-8 w-2 rounded-full border shadow-sm" style={metalStyle} />
      <div className="absolute left-8 top-[18px] h-2 w-10 rounded-full border shadow-sm" style={metalStyle} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold">{children}</div>;
}

function SelectionMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
        checked ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white text-transparent",
      )}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
    </span>
  );
}

function ChoiceCard({
  title,
  desc,
  selected,
  disabled = false,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-70"
          : selected
            ? "border-orange-500 bg-orange-50"
            : "border-border hover:border-orange-300",
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </button>
  );
}

function MiniBadge({
  text,
  intent = "neutral",
}: {
  text: string;
  intent?: "neutral" | "warning";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        intent === "warning" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-700",
      )}
    >
      {text}
    </span>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Avanti",
  nextIcon,
  nextAccent = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel?: string;
  nextIcon?: React.ReactNode;
  nextAccent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="outline" onClick={onBack} className="gap-1">
        <ArrowLeft className="h-4 w-4" />
        Indietro
      </Button>
      <Button
        onClick={onNext}
        disabled={nextDisabled}
        className={cn("flex-1 gap-2", nextAccent ? "bg-orange-500 hover:bg-orange-600" : "bg-slate-800 hover:bg-slate-700")}
      >
        {nextLabel}
        {nextIcon ?? <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
