import { useState, useRef, useCallback, useEffect, useMemo, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  Zap,
  CheckCircle2,
  Download,
  Share2,
  RefreshCw,
  Wand2,
  ScanSearch,
  Building2,
  ShieldCheck,
  ImagePlus,
  Camera,
  ArrowLeft,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ZonaFotoMobile } from "@/components/render/ZonaFotoMobile";
import { MandaRenderMobile } from "@/components/render/MandaRenderMobile";
import { etichettaAnalisiPersiane } from "@/components/render-persiane/etichetteAnalisiPersiane";

import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";

import {
  PersianeConfigForm,
} from "@/components/render-persiane/PersianeConfigForm";
import { DEFAULT_PERSIANE_CONFIG } from "@/components/render-persiane/defaultPersianeConfig";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { preloadImage } from "@/lib/render/preloadImage";
import type {
  AnalisiPersiane,
  ConfigurazionePersiane,
  PersianePhotoMeta,
  PersianeRenderConfig,
} from "@/modules/render-persiane/lib/types";
import { buildPersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import { normalizePersianeSceneAnalysis } from "@/modules/render-persiane/lib/persianeSceneAnalysis";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { createRenderOriginalSignedUrl, uploadRenderOriginal } from "@/lib/render/renderStorage";

type Step = 1 | 2 | 3 | 4 | 5;

interface PollState {
  dots: number;
  elapsedSec: number;
  status: string;
}

const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 180;

function readPhotoMeta(file: File, fallbackUrl?: string | null): Promise<PersianePhotoMeta | null> {
  return new Promise((resolve) => {
    const previewUrl = fallbackUrl ?? URL.createObjectURL(file);
    const image = new window.Image();
    const revokeAfter = fallbackUrl ? null : previewUrl;

    image.onload = () => {
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      if (revokeAfter) URL.revokeObjectURL(revokeAfter);
      if (!width || !height) {
        resolve(null);
        return;
      }
      resolve({
        width,
        height,
        orientation: width === height ? "square" : width > height ? "landscape" : "portrait",
      });
    };

    image.onerror = () => {
      if (revokeAfter) URL.revokeObjectURL(revokeAfter);
      resolve(null);
    };

    image.src = previewUrl;
  });
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export default function RenderPersianeNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PersianePhotoMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfigurazionePersiane>(DEFAULT_PERSIANE_CONFIG);
  const [analysis, setAnalysis] = useState<AnalisiPersiane | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

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

  const [resultUrls, setResultUrls] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      if (dotsIntervalRef.current) {
        clearInterval(dotsIntervalRef.current);
        dotsIntervalRef.current = null;
      }
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const renderPlan = useMemo<PersianeRenderConfig | null>(() => {
    if (!analysis) return null;
    return buildPersianeRenderConfig(config, {
      sceneAnalysis: analysis,
      photoMeta,
      notes: config.note_libere,
    });
  }, [analysis, config, photoMeta]);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        toast.error("File troppo grande (max 20 MB)");
        return;
      }

      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }

      const preview = URL.createObjectURL(file);
      setPhoto(file);
      setPhotoPreview(preview);
      setPhotoPath(null);
      setPhotoMeta(await readPhotoMeta(file, preview));
      setSessionId(null);
      setAnalysis(null);
      setAnalysisError(null);
      setResultUrls([]);
      setStep(1);
    },
    [photoPreview],
  );

  const runAnalysis = useCallback(
    async (sid: string, originalPath: string, meta: PersianePhotoMeta | null) => {
      setAnalyzing(true);
      setAnalysisError(null);
      setStep(2);

      try {
        const signedUrl = await createRenderOriginalSignedUrl("persiane-originals", originalPath, 600);

        const headers = await getEdgeFunctionAuthHeaders();
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          "generate-shutter-render",
          {
            body: {
              action: "analyze",
              session_id: sid,
              image_url: signedUrl,
              ...(meta ? { target_width: meta.width, target_height: meta.height } : {}),
            },
            headers,
          },
        );

        if (fnErr || fnData?.error) {
          throw new Error(
            await resolveEdgeFunctionErrorMessage({
              error: fnErr,
              data: fnData,
              fallback: "Analisi AI persiane fallita",
            }),
          );
        }

        const normalized = normalizePersianeSceneAnalysis(fnData?.analisi_persiane, meta);
        setAnalysis(normalized);
        toast.success("Analisi facciata completata");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analisi AI persiane fallita";
        setAnalysis(normalizePersianeSceneAnalysis(null, meta));
        setAnalysisError(message);
        toast.error(`${message}. Continuo con una lettura assistita di fallback.`);
      } finally {
        setAnalyzing(false);
      }
    },
    [],
  );

  const goToAnalysis = useCallback(async () => {
    if (!photo || !companyId || !user) return;

    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_persiane_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "persiane-originals",
        path,
        file: photo,
      });

      const meta = photoMeta ?? (await readPhotoMeta(photo, photoPreview));
      setPhotoMeta(meta);
      setPhotoPath(storagePath);

      const { data: sess, error: sessErr } = await supabase
        .from("render_persiane_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: storagePath,
          config,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();

      if (sessErr || !sess) throw new Error("Creazione sessione fallita");

      const sid = (sess as { id: string }).id;
      setSessionId(sid);
      await runAnalysis(sid, storagePath, meta ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante il caricamento");
    } finally {
      setUploading(false);
    }
  }, [companyId, config, contactId, opportunityId, photo, photoMeta, photoPreview, runAnalysis, user]);

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

  const startPolling = useCallback(
    (sid: string) => {
      stopPolling();
      pollCountRef.current = 0;
      elapsedRef.current = 0;

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
          stopPolling();
          setGenerating(false);
          toast.error("Timeout: il render sta impiegando troppo tempo. Riprova.");
          setStep(3);
          return;
        }

        const { data: sess } = await supabase
          .from("render_persiane_sessions")
          .select("status, result_urls, error_message")
          .eq("id", sid)
          .single();

        const statusRow = sess as {
          status: string;
          result_urls: string[] | null;
          error_message?: string | null;
        } | null;

        if (statusRow?.status === "completed" && statusRow.result_urls?.length) {
          stopPolling();
          if (statusRow.result_urls[0]) await preloadImage(statusRow.result_urls[0]);
          setResultUrls(statusRow.result_urls);
          setGenerating(false);
          queryClient.invalidateQueries({ queryKey: ["render-persiane-sessions", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-persiane-gallery", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
          setStep(5);
          return;
        }

        if (statusRow?.status === "failed") {
          stopPolling();
          setGenerating(false);
          toast.error(statusRow.error_message || "Render fallito. Controlliamo configurazione e prompt e riproviamo.");
          setStep(3);
          return;
        }

        setPollState((prev) => ({
          ...prev,
          status: statusRow?.status ?? "processing",
        }));

        const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
        pollCountRef.current += 1;
        pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
      };

      poll();
    },
    [companyId, queryClient, stopPolling],
  );

  const startRender = useCallback(async () => {
    if (!sessionId || !companyId || !renderPlan || generating) return;

    setGenerating(true);
    setResultUrls([]);
    setStep(4);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    await supabase
      .from("render_persiane_sessions")
      .update({
        config: renderPlan,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
      .eq("id", sessionId);

    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "generate-shutter-render",
      {
        body: {
          session_id: sessionId,
          config: renderPlan,
          ...(photoMeta ? { target_width: photoMeta.width, target_height: photoMeta.height } : {}),
        },
        headers,
      },
    );

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
      setStep(3);
      return;
    }

    if (fnData?.result_url || fnData?.result_urls) {
      const urls: string[] =
        fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      if (urls[0]) await preloadImage(urls[0]);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-persiane-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-persiane-gallery", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(5);
      return;
    }

    startPolling(sessionId);
  }, [companyId, generating, photoMeta, queryClient, renderPlan, sessionId, startPolling]);

  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      await downloadRenderImage(url, `render_persiane_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrls]);

  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(
      `Ecco come appariranno le nuove persiane sulla facciata!\n${url}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  const rerunAnalysis = useCallback(async () => {
    if (!sessionId || !photoPath) return;
    await runAnalysis(sessionId, photoPath, photoMeta);
  }, [photoMeta, photoPath, runAnalysis, sessionId]);

  const preservePills = useMemo(
    () => uniqueStrings(renderPlan?.replacement_manifest.keepExactly ?? []).slice(0, 10),
    [renderPlan],
  );

  const isMobile = useIsMobile();
  // «Nuovo render» riparte davvero dalla foto: prima navigava alla stessa
  // pagina, che non si rimonta, e non succedeva niente.
  const nuovoRender = () => {
    setStep(1);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoPath(null);
    setPhotoMeta(null);
    setAnalysis(null);
    setAnalysisError(null);
    setSessionId(null);
    setResultUrls([]);
    setConfig(DEFAULT_PERSIANE_CONFIG);
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
    <div ref={radiceRef} className="space-y-6 max-w-5xl mx-auto pb-12 scroll-mt-3 max-md:space-y-3">
      <RenderWizardHeader
        onBack={() => {
          if (step === 1 || step === 5) navigate("/azienda/render/persiane");
          else if (step === 2) setStep(1);
          else if (step === 3) setStep(2);
          else if (step === 4 && !generating) setStep(3);
        }}
        eyebrow="Sostituzione persiane fotorealistica"
        title="Stessa casa, nuove persiane"
        mobileTitle="Render Persiane"
        description="L'AI sostituisce solo le persiane mantenendo serramenti, contorno e arredo della foto originale."
        badgeLabel="Render AI — Persiane"
        stepLabels={["Foto", "Analisi", "Configura", "Elaborazione", "Risultato"]}
        currentStep={step}
        accent="rose"
      />
      {/* Telefono: il saldo non occupa una riga (se finisce, avvisa il RenderCreditGate). */}
      <div className="flex justify-end max-md:hidden">
        <RenderCreditsWidget />
      </div>

      <RenderCreditGate />

      {step === 1 && (
        <div className="space-y-4 max-md:space-y-3">
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto facciata / finestra con oscuranti esistenti
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {!photoPreview && isMobile ? (
                <ZonaFotoMobile
                  onScegli={() => fileRef.current?.click()}
                  suggerimento="Frontale, con le finestre e gli oscuranti ben visibili"
                  accento="emerald"
                />
              ) : !photoPreview ? (
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-green-600/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">Clicca per caricare una foto</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Facciata o finestra, JPG/PNG/WEBP, max 20 MB.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border bg-muted/20">
                    <img loading="lazy"
                      src={photoPreview}
                      alt="Anteprima"
                      className="w-full max-h-[420px] object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Telefono: dimensioni e orientamento restano al computer. */}
                    {photoMeta && (
                      <>
                        <Badge variant="secondary" className="max-md:hidden">{photoMeta.width} x {photoMeta.height}</Badge>
                        <Badge variant="secondary" className="max-md:hidden">{etichettaAnalisiPersiane("orientamento", photoMeta.orientation)}</Badge>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <RefreshCw className="h-3 w-3 mr-1.5 max-md:hidden" />
                      <Camera className="hidden h-3.5 w-3.5 mr-1.5 max-md:block" />
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

          {/* Telefono: compare con la foto (prima era un bottone spento). */}
          {(!isMobile || photo) && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            disabled={!photo || uploading}
            onClick={goToAnalysis}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Caricamento e preparazione analisi...
              </>
            ) : (
              <>
                Avvia analisi facciata
                <Wand2 className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 max-md:space-y-3">
          <Card className={cn(analysisError ? "border-amber-400/40" : "", "max-md:border-0 max-md:bg-transparent max-md:shadow-none")}>
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <ScanSearch className="h-4 w-4" />
                Analisi facciata e aperture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-md:space-y-3 max-md:p-0">
              {photoPreview && (
                <div className="rounded-lg overflow-hidden border bg-muted/20">
                  <img loading="lazy"
                    src={photoPreview}
                    alt="Foto originale"
                    className="w-full max-h-[360px] object-contain"
                  />
                </div>
              )}

              {analyzing ? (
                <div className="rounded-xl border bg-muted/20 p-6 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-green-600" />
                  <p className="mt-3 font-medium max-md:text-[13px]">Sto leggendo facciata, aperture e oscuranti esistenti</p>
                  <p className="text-sm text-muted-foreground mt-1 max-md:hidden">
                    Questa analisi serve a capire target, geometrie da preservare e dettagli da non contaminare.
                  </p>
                </div>
              ) : analysis ? (
                <>
                  {analysisError && (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4">
                      <p className="text-sm font-medium text-amber-900">Analisi AI parziale</p>
                      <p className="text-sm text-amber-800 mt-1">
                        {analysisError}. Ho preparato comunque una base strutturata, così non restiamo bloccati.
                      </p>
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] max-md:grid-cols-1 max-md:gap-3">
                    {/* Telefono: lo scenario (etichette dell'AI e nota lunga) resta al computer; restano le aperture. */}
                    <Card className="bg-muted/20 max-md:hidden">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Scenario rilevato</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{analysis.facadeType}</Badge>
                          <Badge variant="secondary">{analysis.buildingStyle}</Badge>
                          <Badge variant="secondary">{analysis.openingsVisible} aperture visibili</Badge>
                          <Badge variant="secondary">{etichettaAnalisiPersiane("orientamento", analysis.imageOrientation)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {analysis.noteAnalisi}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Luce / camera</p>
                            <p className="text-sm mt-1">{analysis.cameraAngle}</p>
                            <p className="text-xs text-muted-foreground mt-1">{analysis.lightingCondition}</p>
                          </div>
                          <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Muro facciata</p>
                            <p className="text-sm mt-1">{analysis.wallTexture}</p>
                            <p className="text-xs text-muted-foreground mt-1">{analysis.wallColor}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-muted/20">
                      <CardHeader className="pb-3 max-md:p-3 max-md:pb-2">
                        <CardTitle className="text-sm max-md:text-[13px]">Aperture rilevate</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 max-md:p-3 max-md:pt-0">
                        {analysis.openings.map((opening) => (
                          <div key={opening.id} className="rounded-lg border bg-background p-3 max-md:px-3 max-md:py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium max-md:text-[13px]">Apertura {opening.label}</p>
                              <Badge variant="outline" className="max-md:px-1.5 max-md:py-0 max-md:text-[11px] max-md:font-normal">{etichettaAnalisiPersiane("posizione", opening.position)}</Badge>
                            </div>
                            <p className="text-sm mt-1 first-letter:uppercase max-md:mt-0.5 max-md:text-[13px]">
                              {etichettaAnalisiPersiane("oscurante", opening.existingShutterType)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 max-md:mt-0.5 max-md:text-[11px]">
                              {etichettaAnalisiPersiane("apertura", opening.openingKind)} · {opening.materialPerceived} · {opening.colorPerceived}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Telefono: una riga — indietro e rianalizza a icona, «Continua» che prende il resto. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between max-md:flex-row max-md:gap-2">
            <Button variant="outline" onClick={() => setStep(1)} disabled={analyzing} className="max-md:w-11 max-md:shrink-0 max-md:px-0" aria-label="Torna alla foto">
              <ArrowLeft className="hidden h-4 w-4 max-md:block" />
              <span className="max-md:hidden">Torna alla foto</span>
            </Button>
            <div className="flex gap-2 max-md:min-w-0 max-md:flex-1">
              <Button variant="outline" onClick={rerunAnalysis} disabled={analyzing || !sessionId || !photoPath} className="max-md:w-11 max-md:shrink-0 max-md:px-0" aria-label="Rianalizza">
                <RefreshCw className="h-4 w-4 mr-2 max-md:mr-0" />
                <span className="max-md:hidden">Rianalizza</span>
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 max-md:min-w-0 max-md:flex-1"
                disabled={analyzing || !analysis}
                onClick={() => setStep(3)}
              >
                Continua alla configurazione
                <Wand2 className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 max-md:space-y-3">
          {photoPreview && (
            <div className="rounded-xl overflow-hidden border bg-muted/20">
              <img loading="lazy"
                src={photoPreview}
                alt="Originale"
                className="w-full max-h-[260px] object-contain"
              />
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] max-md:grid-cols-1 max-md:gap-3">
            <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <CardHeader className="max-md:hidden">
                <CardTitle className="text-base">Configura persiane e dettagli tecnici</CardTitle>
              </CardHeader>
              <CardContent className="max-md:p-0">
                <PersianeConfigForm
                  value={config}
                  onChange={setConfig}
                  analysis={analysis}
                />
              </CardContent>
            </Card>

            {/* Telefono: ambito, regole e elementi da preservare (testo tecnico) restano al computer. */}
            <div className="space-y-4 max-md:hidden">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scope render</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {renderPlan?.target_selection.targetLabels.map((label) => (
                      <Badge key={label}>Apertura {label}</Badge>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {renderPlan?.technical_specification.map((spec) => (
                      <div key={spec.openingId} className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-sm font-medium">Apertura {spec.openingLabel}</p>
                        <p className="text-sm text-muted-foreground mt-1 capitalize">
                          {spec.targetType ? spec.targetType.replace(/_/g, " ") : "rimozione oscurante"}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {spec.material && <Badge variant="secondary">{spec.material.replace(/_/g, " ")}</Badge>}
                          {spec.finish && <Badge variant="secondary">{spec.finish.label}</Badge>}
                          {spec.openingState && <Badge variant="secondary">{spec.openingState.replace(/_/g, " ")}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Regole di sostituzione</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {renderPlan?.replacement_manifest.targetOpenings.map((item) => (
                    <div key={item.openingId} className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-sm">{item.summary}</p>
                    </div>
                  ))}
                  {renderPlan?.replacement_manifest.removals.slice(0, 4).map((rule) => (
                    <div key={rule.code} className="rounded-lg border bg-background p-3">
                      <p className="text-sm">{rule.summary}</p>
                      {rule.repairInstruction && (
                        <p className="text-xs text-muted-foreground mt-1">{rule.repairInstruction}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Elementi da preservare
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {preservePills.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            onClick={startRender}
            disabled={!renderPlan || generating}
          >
            <Zap className="h-4 w-4 mr-2" />
            Genera render AI
          </Button>
        </div>
      )}

      {step === 4 && (
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={pollState.elapsedSec}
          dots={pollState.dots}
          accent="rose"
          subjectLabel="L'AI sta elaborando il render delle persiane"
        />
      )}

      {step === 5 && resultUrls.length > 0 && (
        <div className="space-y-4 max-md:space-y-3">
          {/* Telefono: parla l'immagine. */}
          <Card className="border-green-600/30 max-md:hidden">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700">Render completato con successo</p>
                <p className="text-xs text-muted-foreground">
                  Confronta il prima/dopo e valida se il tipo persiana scelto risulta chiarissimo e credibile.
                </p>
              </div>
            </CardContent>
          </Card>

          {photoPreview && (
            <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <CardHeader className="pb-3 max-md:hidden">
                <CardTitle className="text-base">Confronto prima / dopo</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Il confronto mantiene il rapporto reale della foto originale.
                </p>
              </CardHeader>
              <CardContent className="max-md:p-0">
                <BeforeAfterSlider beforeUrl={photoPreview} afterUrl={resultUrls[0]} />
              </CardContent>
            </Card>
          )}

          {/* Telefono: c'è già «Render AI» nel confronto. */}
          <Card className="max-md:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Render finale
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="rounded-xl overflow-hidden border bg-muted/20">
                <img loading="lazy"
                  src={resultUrls[0]}
                  alt="Render persiane"
                  className="w-full max-h-[75vh] object-contain"
                />
              </div>
            </CardContent>
          </Card>

          {/* Telefono: nuovo render a icona e «Manda al cliente» (l'immagine, non un link). */}
          {isMobile && (
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 shrink-0 px-0" onClick={nuovoRender} aria-label="Nuovo render">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <MandaRenderMobile resultUrl={resultUrls[0]} nomeFile="render-persiane" className="min-w-0 flex-1" />
            </div>
          )}

          <div className="flex gap-2 max-md:hidden">
            <Button variant="outline" className="flex-1" onClick={shareWhatsApp}>
              <Share2 className="h-4 w-4 mr-2" />
              Condividi
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={downloadResult}>
              <Download className="h-4 w-4 mr-2" />
              Scarica
            </Button>
          </div>

          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(3)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante persiane"
          />

          <Button
            variant="outline"
            className="w-full max-md:hidden"
            onClick={nuovoRender}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render
          </Button>
        </div>
      )}
    </div>
  );
}
