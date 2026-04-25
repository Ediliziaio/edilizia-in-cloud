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
  Loader2,
  Zap,
  CheckCircle2,
  Download,
  Share2,
  RefreshCw,
  Building2,
  PaintbrushVertical,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";

import { FacciataConfigForm } from "@/components/render-facciata/FacciataConfigForm";
import { DEFAULT_FACCIATA_CONFIG } from "@/components/render-facciata/defaultFacciataConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import type {
  AnalisiFacciata,
  ConfigurazioneFacciata,
  FacciataPhotoMeta,
  FacciataRenderConfig,
} from "@/modules/render-facciata/lib/types";
import { buildFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";
import { normalizeFacciataSceneAnalysis } from "@/modules/render-facciata/lib/facciataSceneAnalysis";
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

function readPhotoMeta(file: File, fallbackUrl?: string | null): Promise<FacciataPhotoMeta | null> {
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

export default function RenderFacciataNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<FacciataPhotoMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfigurazioneFacciata>(DEFAULT_FACCIATA_CONFIG);
  const [analysis, setAnalysis] = useState<AnalisiFacciata | null>(null);
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
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const renderPlan = useMemo<FacciataRenderConfig | null>(() => {
    if (!analysis) return null;
    return buildFacciataRenderConfig(config, {
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

      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);

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
    async (sid: string, originalPath: string, meta: FacciataPhotoMeta | null) => {
      setAnalyzing(true);
      setAnalysisError(null);
      setStep(2);

      try {
        const signedUrl = await createRenderOriginalSignedUrl("facciata-originals", originalPath, 600);

        const headers = await getEdgeFunctionAuthHeaders();
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          "generate-facade-render",
          {
            body: {
              action: "analyze",
              session_id: sid,
              image_url: signedUrl,
            },
            headers,
          },
        );

        if (fnErr || fnData?.error) {
          throw new Error(
            await resolveEdgeFunctionErrorMessage({
              error: fnErr,
              data: fnData,
              fallback: "Analisi AI facciata fallita",
            }),
          );
        }

        const normalized = normalizeFacciataSceneAnalysis(fnData?.analisi_facciata, meta);
        setAnalysis(normalized);
        toast.success("Analisi facciata completata");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analisi AI facciata fallita";
        setAnalysis(normalizeFacciataSceneAnalysis(null, meta));
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
      const path = `${companyId}/${Date.now()}_facciata_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "facciata-originals",
        path,
        file: photo,
      });

      const meta = photoMeta ?? (await readPhotoMeta(photo, photoPreview));
      setPhotoMeta(meta);
      setPhotoPath(storagePath);

      const { data: sess, error: sessErr } = await supabase
        .from("render_facciata_sessions")
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
          .from("render_facciata_sessions")
          .select("status, result_urls")
          .eq("id", sid)
          .single();

        const statusRow = sess as { status: string; result_urls: string[] | null } | null;

        if (statusRow?.status === "completed" && statusRow.result_urls?.length) {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setResultUrls(statusRow.result_urls);
          setGenerating(false);
          queryClient.invalidateQueries({ queryKey: ["render-facciata-sessions", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-facciata-gallery", companyId] });
          queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
          setStep(5);
          return;
        }

        if (statusRow?.status === "failed") {
          if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
          setGenerating(false);
          toast.error("Render fallito. Ricontrolliamo intervento e vincoli e riproviamo.");
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
    setResultUrls([]);
    setStep(4);
    pollCountRef.current = 0;
    elapsedRef.current = 0;
    setPollState({ dots: 0, elapsedSec: 0, status: "pending" });

    await supabase
      .from("render_facciata_sessions")
      .update({
        config: renderPlan,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
      .eq("id", sessionId);

    const headers = await getEdgeFunctionAuthHeaders();
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "generate-facade-render",
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
      const urls: string[] = fnData.result_urls ?? (fnData.result_url ? [fnData.result_url] : []);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-facciata-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-facciata-gallery", companyId] });
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
      a.download = `render_facciata_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    const text = encodeURIComponent(`Ecco come apparirà la facciata dopo l'intervento!\n${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [resultUrls]);

  const rerunAnalysis = useCallback(async () => {
    if (!sessionId || !photoPath) return;
    await runAnalysis(sessionId, photoPath, photoMeta);
  }, [photoMeta, photoPath, runAnalysis, sessionId]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step > 1 && step < 5) {
              setStep((step - 1) as Step);
            } else {
              navigate("/azienda/render/facciata");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-600" />
            Render Facciata
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la facciata da rinnovare"}
            {step === 2 && "Lettura AI dell’edificio e dei dettagli esistenti"}
            {step === 3 && "Configuriamo materiali, zone e dettagli architettonici"}
            {step === 4 && "Sto generando il render fotorealistico"}
            {step === 5 && "Risultato pronto per confronto e condivisione"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      <RenderCreditGate />

      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors ${index <= step ? "bg-orange-500" : "bg-muted"}`}
          />
        ))}
      </div>

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
              className="cursor-pointer border-2 border-dashed hover:border-orange-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
                  <Upload className="h-8 w-8 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Carica una foto della facciata</p>
                  <p className="mt-1 text-sm text-muted-foreground">JPG, PNG o WEBP — max 20 MB</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="overflow-hidden rounded-lg bg-muted">
                  <img
                    src={photoPreview}
                    alt="Anteprima facciata"
                    className="max-h-[560px] w-full object-contain"
                  />
                </div>
                <RenderCrmLinker
                  contactId={contactId}
                  opportunityId={opportunityId}
                  onContactChange={setContactId}
                  onOpportunityChange={setOpportunityId}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                      fileRef.current?.click();
                    }}
                  >
                    Cambia foto
                  </Button>
                  <Button className="ml-auto bg-orange-600 hover:bg-orange-700" onClick={goToAnalysis} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Upload...
                      </>
                    ) : (
                      <>
                        <ScanSearch className="mr-2 h-4 w-4" />
                        Avvia analisi facciata
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  {analyzing ? (
                    <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  <div>
                    <p className="font-medium">
                      {analyzing ? "Sto leggendo edificio, aperture e dettagli" : "Analisi edificio pronta"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {analyzing
                        ? "Mi sto portando dietro geometria, contesto, rilievi e zone sensibili prima di configurare il render."
                        : "Abbiamo una base strutturata da usare nel wizard e nel prompt finale."}
                    </p>
                  </div>
                </div>
                {!analyzing && (
                  <Button variant="outline" onClick={() => setStep(3)}>
                    Continua alla configurazione
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {analysisError && (
            <Card className="border-amber-200 bg-amber-50/70">
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-amber-900">Analisi AI parziale</p>
                  <p className="mt-1 text-sm text-amber-800">{analysisError}</p>
                </div>
                <Button variant="outline" size="sm" onClick={rerunAnalysis}>
                  Riprova analisi
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-orange-600" />
                Scenario letto dalla facciata
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Edificio</p>
                <p className="mt-1 font-medium">{analysis?.buildingType ?? "in lettura..."}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Stile</p>
                <p className="mt-1 font-medium">{analysis?.buildingStyle ?? "in lettura..."}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Piani</p>
                <p className="mt-1 font-medium">{analysis?.floorsCount ?? "-"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Aperture visibili</p>
                <p className="mt-1 font-medium">{analysis?.openingsVisible ?? "-"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && renderPlan && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
          <FacciataConfigForm config={config} analysis={analysis} onChange={setConfig} />

          <div className="space-y-4 xl:sticky xl:top-6 self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PaintbrushVertical className="h-4 w-4 text-orange-600" />
                  Riepilogo tecnico intervento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sistemi attivi</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderPlan.replacement_manifest.activeSystems.map((item) => (
                      <Badge key={item} variant="secondary">{item.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Zone coinvolte</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderPlan.replacement_manifest.targetedZones.map((item) => (
                      <Badge key={item} variant="outline">{item}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {renderPlan.replacement_manifest.replacements.slice(0, 5).map((line) => (
                    <div key={line} className="rounded-lg border p-3 text-sm">
                      {line}
                    </div>
                  ))}
                  {renderPlan.replacement_manifest.repaintActions.map((line) => (
                    <div key={line} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
                      {line}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Elementi da preservare</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {uniqueStrings(renderPlan.replacement_manifest.keepExactly).slice(0, 10).map((item) => (
                      <Badge key={item} variant="outline">{item}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="py-4 text-sm text-emerald-950">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Regole che stiamo imponendo al render
                </div>
                <p className="mt-2">
                  Stesso edificio, stessa prospettiva, stesso contesto, giunti puliti, transizioni nette e nessun intervento fuori scope.
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Indietro
              </Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={startRender}>
                <Zap className="mr-2 h-4 w-4" />
                Genera render
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">Render facciata in corso{".".repeat(pollState.dots)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sto applicando l’intervento architettonico richiesto mantenendo edificio, geometrie, contesto e luce originali.
              </p>
            </div>
            <div className="w-full max-w-sm">
              <Progress value={Math.min((pollState.elapsedSec / 60) * 100, 95)} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">{pollState.elapsedSec}s trascorsi</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Render completato</p>
                <p className="text-sm text-green-700/80">Confronta prima e dopo, scarica o condividi il risultato.</p>
              </div>
            </CardContent>
          </Card>

          {photoPreview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prima / Dopo</CardTitle>
              </CardHeader>
              <CardContent>
                <BeforeAfterSlider
                  beforeUrl={photoPreview}
                  afterUrl={resultUrls[0]}
                  className="rounded-xl"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <img
                src={resultUrls[0]}
                alt="Render facciata"
                className="max-h-[720px] w-full rounded-lg object-contain"
              />
            </CardContent>
          </Card>

          {renderPlan && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Intervento applicato</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{config.tipo_intervento.replace(/_/g, " ")}</Badge>
                  {renderPlan.replacement_manifest.targetedZones.map((item) => (
                    <Badge key={item} variant="outline">{item}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={shareWhatsApp}>
              <Share2 className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
            <Button variant="outline" className="flex-1" onClick={downloadResult}>
              <Download className="mr-2 h-4 w-4" />
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
            regenerateLabel="Genera nuova variante facciata"
          />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStep(1);
              setPhoto(null);
              setPhotoPreview(null);
              setPhotoPath(null);
              setPhotoMeta(null);
              setResultUrls([]);
              setSessionId(null);
              setAnalysis(null);
              setAnalysisError(null);
              setConfig(DEFAULT_FACCIATA_CONFIG);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Nuovo render facciata
          </Button>
        </div>
      )}
    </div>
  );
}
