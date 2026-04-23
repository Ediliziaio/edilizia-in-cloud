import { useState, useRef, useCallback, useEffect, useMemo, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  ScanSearch,
  Building2,
  ShieldCheck,
} from "lucide-react";

import {
  PersianeConfigForm,
} from "@/components/render-persiane/PersianeConfigForm";
import { DEFAULT_PERSIANE_CONFIG } from "@/components/render-persiane/defaultPersianeConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
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
      if (pollRef.current) clearTimeout(pollRef.current);
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
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
        const { data: signed, error: signedError } = await supabase.storage
          .from("persiane-originals")
          .createSignedUrl(originalPath, 600);

        if (signedError || !signed?.signedUrl) {
          throw new Error("Impossibile ottenere l'URL firmato della foto originale");
        }

        const headers = await getEdgeFunctionAuthHeaders();
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          "generate-shutter-render",
          {
            body: {
              action: "analyze",
              session_id: sid,
              image_url: signed.signedUrl,
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
      const { error: uploadError } = await supabase.storage
        .from("persiane-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });

      if (uploadError) throw new Error(`Upload foto fallito: ${uploadError.message}`);

      const meta = photoMeta ?? (await readPhotoMeta(photo, photoPreview));
      setPhotoMeta(meta);
      setPhotoPath(path);

      const { data: sess, error: sessErr } = await supabase
        .from("render_persiane_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: path,
          config,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();

      if (sessErr || !sess) throw new Error("Creazione sessione fallita");

      const sid = (sess as { id: string }).id;
      setSessionId(sid);
      await runAnalysis(sid, path, meta ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante il caricamento");
    } finally {
      setUploading(false);
    }
  }, [companyId, config, contactId, opportunityId, photo, photoMeta, photoPreview, runAnalysis, user]);

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
          toast.error("Timeout: il render sta impiegando troppo tempo. Riprova.");
          setStep(3);
          return;
        }

        const { data: sess } = await supabase
          .from("render_persiane_sessions")
          .select("status, result_urls")
          .eq("id", sid)
          .single();

        const statusRow = sess as { status: string; result_urls: string[] | null } | null;

        if (statusRow?.status === "completed" && statusRow.result_urls?.length) {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setResultUrls(statusRow.result_urls);
          setGenerating(false);
          queryClient.invalidateQueries({ queryKey: ["render-persiane-sessions", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-persiane-gallery", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
          setStep(5);
          return;
        }

        if (statusRow?.status === "failed") {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setGenerating(false);
          toast.error("Render fallito. Controlliamo configurazione e prompt e riproviamo.");
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
    [companyId, queryClient],
  );

  const startRender = useCallback(async () => {
    if (!sessionId || !companyId || !renderPlan || generating) return;

    setGenerating(true);
    setStep(4);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    await supabase
      .from("render_persiane_sessions")
      .update({ config: renderPlan })
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
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_persiane_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 5) navigate("/azienda/render/persiane");
            else if (step === 2) setStep(1);
            else if (step === 3) setStep(2);
            else if (step === 4 && !generating) setStep(3);
          }}
          disabled={step === 4 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Nuovo render persiane</h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la facciata o la finestra da trasformare"}
            {step === 2 && "Lettura AI della facciata e delle aperture esistenti"}
            {step === 3 && "Configura oscuranti, finiture e regole di sostituzione"}
            {step === 4 && "Generazione render in corso"}
            {step === 5 && "Render persiane completato"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      <RenderCreditGate />

      <div className="space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          {["Foto", "Analisi", "Configura", "Elaborazione", "Risultato"].map((label, i) => (
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
          ))}
        </div>
        <Progress value={(step / 5) * 100} className="h-1.5" />
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto facciata / finestra con oscuranti esistenti
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
                  <p className="text-sm font-medium">Clicca per caricare una foto</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Facciata o finestra, JPG/PNG/WEBP, max 20 MB.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border bg-muted/20">
                    <img
                      src={photoPreview}
                      alt="Anteprima"
                      className="w-full max-h-[420px] object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {photoMeta && (
                      <>
                        <Badge variant="secondary">{photoMeta.width} x {photoMeta.height}</Badge>
                        <Badge variant="secondary">{photoMeta.orientation}</Badge>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
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
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card className={analysisError ? "border-amber-400/40" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ScanSearch className="h-4 w-4" />
                Analisi facciata e aperture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {photoPreview && (
                <div className="rounded-lg overflow-hidden border bg-muted/20">
                  <img
                    src={photoPreview}
                    alt="Foto originale"
                    className="w-full max-h-[360px] object-contain"
                  />
                </div>
              )}

              {analyzing ? (
                <div className="rounded-xl border bg-muted/20 p-6 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-green-600" />
                  <p className="mt-3 font-medium">Sto leggendo facciata, aperture e oscuranti esistenti</p>
                  <p className="text-sm text-muted-foreground mt-1">
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

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <Card className="bg-muted/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Scenario rilevato</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{analysis.facadeType}</Badge>
                          <Badge variant="secondary">{analysis.buildingStyle}</Badge>
                          <Badge variant="secondary">{analysis.openingsVisible} aperture visibili</Badge>
                          <Badge variant="secondary">{analysis.imageOrientation}</Badge>
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
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Aperture rilevate</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {analysis.openings.map((opening) => (
                          <div key={opening.id} className="rounded-lg border bg-background p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">Apertura {opening.label}</p>
                              <Badge variant="outline">{opening.position.replace(/_/g, " ")}</Badge>
                            </div>
                            <p className="text-sm mt-1 capitalize">
                              {opening.existingShutterType.replace(/_/g, " ")}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {opening.openingKind.replace(/_/g, " ")} · {opening.materialPerceived} · {opening.colorPerceived}
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setStep(1)} disabled={analyzing}>
              Torna alla foto
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={rerunAnalysis} disabled={analyzing || !sessionId || !photoPath}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Rianalizza
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
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
        <div className="space-y-4">
          {photoPreview && (
            <div className="rounded-xl overflow-hidden border bg-muted/20">
              <img
                src={photoPreview}
                alt="Originale"
                className="w-full max-h-[260px] object-contain"
              />
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configura persiane e dettagli tecnici</CardTitle>
              </CardHeader>
              <CardContent>
                <PersianeConfigForm
                  value={config}
                  onChange={setConfig}
                  analysis={analysis}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
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
        <Card className="border-green-600/30 bg-green-50/30">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-600/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                Generazione render persiane
                {".".repeat(pollState.dots)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Sto applicando la sostituzione chirurgica degli oscuranti mantenendo facciata, aperture e geometrie originali.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Tempo trascorso: {pollState.elapsedSec}s · stato: {pollState.status}
              </p>
            </div>
            <Progress value={Math.min((pollState.elapsedSec / 60) * 100, 95)} className="w-56 h-1.5" />
          </CardContent>
        </Card>
      )}

      {step === 5 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card className="border-green-600/30">
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Confronto prima / dopo</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Il confronto mantiene il rapporto reale della foto originale.
                </p>
              </CardHeader>
              <CardContent>
                <BeforeAfterSlider beforeUrl={photoPreview} afterUrl={resultUrls[0]} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Render finale
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="rounded-xl overflow-hidden border bg-muted/20">
                <img
                  src={resultUrls[0]}
                  alt="Render persiane"
                  className="w-full max-h-[75vh] object-contain"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={shareWhatsApp}>
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
