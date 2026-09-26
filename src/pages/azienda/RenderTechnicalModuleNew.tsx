import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Share2,
  Upload,
  Zap,
  ImagePlus,
  Camera,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ZonaFotoMobile } from "@/components/render/ZonaFotoMobile";
import { MandaRenderMobile } from "@/components/render/MandaRenderMobile";
import { DettagliTelefono } from "@/components/render/DettagliTelefono";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { preloadImage } from "@/lib/render/preloadImage";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";
import {
  getTechnicalRenderModuleSpec,
  type TechnicalRenderConfig,
  type TechnicalRenderModuleId,
} from "@/lib/render/technicalRenderModules";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";

import { CatalogReferencePicker } from "@/components/render-bagno/CatalogReferencePicker";
import type { RenderCatalogVerticale } from "@/lib/render/renderCatalog";
type Step = 1 | 2 | 3 | 4;

type DynamicRenderDbQuery<T = unknown> = PromiseLike<{ data: T | null; error: { message?: string } | null }> & {
  select: <R = T>(columns?: string) => DynamicRenderDbQuery<R>;
  insert: <R = T>(values: unknown) => DynamicRenderDbQuery<R>;
  update: <R = T>(values: unknown) => DynamicRenderDbQuery<R>;
  eq: (column: string, value: unknown) => DynamicRenderDbQuery<T>;
  single: () => Promise<{ data: T | null; error: { message?: string } | null }>;
};

type DynamicRenderDb = {
  from: <T = unknown>(table: string) => DynamicRenderDbQuery<T>;
};

const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 420;

function isIdleTimeoutMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("idle timeout") || normalized.includes("timeout limit") || normalized.includes("150s");
}

function normalizeFileExt(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

async function getImageDimensions(src: string): Promise<{ width?: number; height?: number }> {
  const img = new window.Image();
  img.src = src;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  return {
    width: img.naturalWidth || undefined,
    height: img.naturalHeight || undefined,
  };
}

/** Verticale e categorie del catalogo render per ogni modulo tecnico. */
const CATALOGO_PER_MODULO: Partial<Record<TechnicalRenderModuleId, { verticale: RenderCatalogVerticale; categorie: string[] }>> = {
  "porte-interne": { verticale: "porte", categorie: ["porta_interna", "maniglia"] },
  "porte-blindate": { verticale: "porte", categorie: ["porta_blindata", "maniglia"] },
  giardini: { verticale: "esterni", categorie: ["giardino"] },
  "pavimenti-esterni": { verticale: "esterni", categorie: ["pavimento_esterno"] },
};

export default function RenderTechnicalModuleNew({ moduleId }: { moduleId: TechnicalRenderModuleId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const db = supabase as unknown as DynamicRenderDb;
  const spec = getTechnicalRenderModuleSpec(moduleId);
  const catalogoModulo = CATALOGO_PER_MODULO[moduleId];
  const hubConfig = renderModuleHubConfigs[moduleId];

  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [config, setConfig] = useState<TechnicalRenderConfig>(spec.defaultConfig);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [dots, setDots] = useState(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const resetPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setSessionId(null);
    setResultUrls([]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Formato non supportato. Usa JPG, PNG o WEBP.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setSessionId(null);
    setResultUrls([]);
  };

  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;
    setUploading(true);
    try {
      const ext = normalizeFileExt(photo.name);
      const path = `${companyId}/${moduleId}/${Date.now()}_${moduleId}_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "render-originals",
        path,
        file: photo,
      });

      const { data: session, error } = await db
        .from("render_technical_sessions")
        .insert({
          company_id: companyId,
          created_by: user.id,
          module_type: moduleId,
          status: "pending",
          original_photo_url: storagePath,
          config,
          contact_id: contactId,
          opportunity_id: opportunityId,
        })
        .select("id")
        .single();

      if (error || !session) throw new Error(error?.message ?? "Creazione sessione fallita");
      setSessionId(session.id as string);
      setStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload foto fallito");
    } finally {
      setUploading(false);
    }
  }, [companyId, config, contactId, db, moduleId, opportunityId, photo, user]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
    pollRef.current = null;
    dotsIntervalRef.current = null;
  }, []);

  const startPolling = useCallback((sid: string) => {
    stopPolling();
    pollCountRef.current = 0;
    elapsedRef.current = 0;

    dotsIntervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
      setDots((value) => (value + 1) % 4);
    }, 1000);

    const poll = async () => {
      if (elapsedRef.current >= MAX_POLL_SEC) {
        stopPolling();
        setGenerating(false);
        setStep(2);
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova più tardi.");
        return;
      }

      const { data: session } = await db
        .from("render_technical_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      if (session?.status === "completed" && session.result_urls?.length) {
        stopPolling();
        if (session.result_urls[0]) await preloadImage(session.result_urls[0]);
        setResultUrls(session.result_urls);
        setGenerating(false);
        await queryClient.invalidateQueries({ queryKey: ["render-module-hub", companyId, moduleId] });
        await queryClient.invalidateQueries({ queryKey: ["render-technical-gallery", companyId, moduleId] });
        await queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        setStep(4);
        return;
      }

      if (session?.status === "failed") {
        stopPolling();
        setGenerating(false);
        setStep(2);
        toast.error(session.error_message || "Render fallito. Riprova.");
        return;
      }

      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, db, moduleId, queryClient, stopPolling]);

  const startRender = useCallback(async () => {
    if (!sessionId || !companyId || generating) return;
    setGenerating(true);
    setResultUrls([]);
    setElapsedSec(0);
    setDots(0);
    setStep(3);

    try {
      await db
        .from("render_technical_sessions")
        .update({
          config,
          status: "pending",
          result_urls: null,
          error_message: null,
        })
        .eq("id", sessionId);

      const dims = photoPreview ? await getImageDimensions(photoPreview) : {};
      const headers = await getEdgeFunctionAuthHeaders();
      startPolling(sessionId);
      const { data, error } = await supabase.functions.invoke("generate-technical-render", {
        body: {
          session_id: sessionId,
          config,
          ...(dims.width && dims.height ? { target_width: dims.width, target_height: dims.height } : {}),
        },
        headers,
      });

      if (error || data?.error) {
        const message = await resolveEdgeFunctionErrorMessage({
          error,
          data,
          fallback: "Generazione fallita",
        });
        if (isIdleTimeoutMessage(message)) {
          toast.info("Render avviato: continuo a controllare lo stato in automatico.");
          return;
        }
        stopPolling();
        throw new Error(message.includes("insufficient_credits") ? "Crediti render insufficienti. Acquista nuovi crediti." : message);
      }

      const urls: string[] = data?.result_urls ?? (data?.result_url ? [data.result_url] : []);
      if (urls.length) {
        stopPolling();
        if (urls[0]) await preloadImage(urls[0]);
        setResultUrls(urls);
        setGenerating(false);
        await queryClient.invalidateQueries({ queryKey: ["render-module-hub", companyId, moduleId] });
        await queryClient.invalidateQueries({ queryKey: ["render-technical-gallery", companyId, moduleId] });
        await queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        setStep(4);
        return;
      }
    } catch (error) {
      stopPolling();
      setGenerating(false);
      setStep(2);
      toast.error(error instanceof Error ? error.message : "Render fallito");
    }
  }, [companyId, config, db, generating, moduleId, photoPreview, queryClient, sessionId, startPolling, stopPolling]);

  const downloadResult = async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      await downloadRenderImage(url, `render_${moduleId}_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  };

  const shareWhatsApp = () => {
    const url = resultUrls[0];
    if (!url) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ecco il render ${spec.singularLabel}:\n${url}`)}`, "_blank");
  };

  const isMobile = useIsMobile();
  const nuovoRender = () => {
    resetPhoto();
    setStep(1);
    setConfig(spec.defaultConfig);
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
    <div ref={radiceRef} className="mx-auto max-w-3xl space-y-6 pb-12 scroll-mt-3 max-md:space-y-3">
      <RenderWizardHeader
        onBack={() => {
          if (step === 1 || step === 4) navigate(`/azienda/render/${moduleId}`);
          else if (step === 2) setStep(1);
          else if (step === 3 && !generating) setStep(2);
        }}
        eyebrow="Render tecnico fotorealistico"
        title="Sostituzione modulo tecnico"
        mobileTitle={`Render ${spec.label}`}
        description="Genera il render dell'elemento tecnico mantenendo coerenza con la foto originale."
        badgeLabel="Render AI — Tecnico"
        stepLabels={["Foto", "Configura", "Elaborazione", "Risultato"]}
        currentStep={step}
        accent="orange"
      />
      {/* Telefono: il saldo non occupa una riga (se finisce, avvisa il RenderCreditGate). */}
      <div className="flex justify-end max-md:hidden">
        <RenderCreditsWidget />
      </div>

      <RenderCreditGate />

      {step === 1 && (
        <div className="space-y-4 max-md:space-y-3">
          {isMobile && !photoPreview ? (
            <>
              <ZonaFotoMobile
                onScegli={() => fileRef.current?.click()}
                suggerimento={spec.uploadTitle}
                accento="orange"
              />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            </>
          ) : (
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                {spec.uploadTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              {photoPreview ? (
                <div className="relative overflow-hidden rounded-lg">
                  <img loading="lazy" src={photoPreview} alt="Foto caricata" className="max-h-96 w-full object-cover" />
                  {/* Telefono: una pastiglia leggera sulla foto invece del bottone pieno. */}
                  <Button variant="secondary" size="sm" className="absolute right-3 top-3 gap-1.5 max-md:right-2 max-md:top-2 max-md:h-8 max-md:rounded-full max-md:bg-black/55 max-md:px-3 max-md:text-[13px] max-md:text-white max-md:backdrop-blur-sm max-md:hover:bg-black/65" onClick={resetPhoto}>
                    <RefreshCw className="h-3.5 w-3.5 max-md:hidden" />
                    <Camera className="hidden h-3.5 w-3.5 max-md:block" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-muted-foreground/30 p-12 text-center transition-colors hover:border-primary/60"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full ${hubConfig.iconBgClassName}`}>
                    <ImageIcon className={`h-8 w-8 ${hubConfig.accentClassName}`} />
                  </div>
                  <div>
                    <p className="font-semibold">{spec.uploadTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, WEBP - Max 20 MB</p>
                  </div>
                  <span className="rounded-md border bg-background px-3 py-2 text-sm font-medium">Sfoglia file</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            </CardContent>
          </Card>
          )}

          <RenderCrmLinker
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
          />

          {/* Telefono: compare con la foto (prima era un bottone spento). */}
          {(!isMobile || photo) && (
          <Button className={`w-full ${spec.buttonClassName}`} size="lg" disabled={!photo || uploading} onClick={goToStep2}>
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Caricamento...</> : "Continua con la configurazione"}
          </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 max-md:space-y-3">
          {photoPreview && (
            <div className="overflow-hidden rounded-lg">
              <img loading="lazy" src={photoPreview} alt="Foto render" className="max-h-56 w-full object-cover" />
            </div>
          )}

          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base">{spec.configTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 max-md:gap-3 max-md:p-0">
              <div className="grid gap-2 max-md:gap-1.5">
                <Label className="max-md:text-[13px] max-md:font-semibold">Tipo intervento</Label>
                <Select
                  value={config.interventionPreset}
                  onValueChange={(value) => setConfig((prev) => ({ ...prev, interventionPreset: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spec.presets.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground max-md:text-[11px]">
                  {spec.presets.find((preset) => preset.value === config.interventionPreset)?.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 max-md:grid-cols-2 max-md:gap-2">
                <div className="grid gap-2">
                  <Label className="max-md:text-[11px]">Area target</Label>
                  <Input value={config.targetArea} onChange={(event) => setConfig((prev) => ({ ...prev, targetArea: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label className="max-md:text-[11px]">Intensità</Label>
                  <Select value={config.intensity} onValueChange={(value: TechnicalRenderConfig["intensity"]) => setConfig((prev) => ({ ...prev, intensity: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leggera">Leggera</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="completa">Completa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 max-md:grid-cols-2 max-md:gap-2">
                <div className="grid gap-2">
                  <Label className="max-md:text-[11px]">Materiale / sistema</Label>
                  <Input value={config.materialOrSystem} onChange={(event) => setConfig((prev) => ({ ...prev, materialOrSystem: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label className="max-md:text-[11px]">Colore / finitura</Label>
                  <Input value={config.colorAndFinish} onChange={(event) => setConfig((prev) => ({ ...prev, colorAndFinish: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-2 max-md:gap-1.5">
                <Label className="max-md:text-[13px] max-md:font-semibold">Dettagli tecnici</Label>
                <Textarea rows={4} value={config.technicalDetails} onChange={(event) => setConfig((prev) => ({ ...prev, technicalDetails: event.target.value }))} className="max-md:min-h-[88px]" />
              </div>

              {/* Telefono: gli elementi da preservare hanno già un testo di partenza: riga chiusa. */}
              <DettagliTelefono titolo="Elementi da preservare">
              <div className="grid gap-2">
                <Label className="max-md:hidden">Elementi da preservare</Label>
                <Textarea rows={3} value={config.preserveNotes} onChange={(event) => setConfig((prev) => ({ ...prev, preserveNotes: event.target.value }))} />
              </div>
              </DettagliTelefono>

              {catalogoModulo && (
                <CatalogReferencePicker
                  companyId={companyId}
                  verticale={catalogoModulo.verticale}
                  categorie={catalogoModulo.categorie}
                  selectedIds={config.catalogo_reference_ids ?? []}
                  onChange={(ids) => setConfig((prev) => ({ ...prev, catalogo_reference_ids: ids }))}
                />
              )}
            </CardContent>
          </Card>

          {/* Telefono: il riepilogo a etichette (con i codici) resta al computer. */}
          <Card className="max-md:hidden">
            <CardContent className="flex flex-wrap gap-2 py-4">
              <Badge variant="secondary">{spec.label}</Badge>
              <Badge variant="outline">{config.interventionPreset.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">{config.intensity}</Badge>
              <Badge variant="outline">{config.targetArea}</Badge>
            </CardContent>
          </Card>

          <Button className={`w-full ${spec.buttonClassName}`} size="lg" onClick={startRender}>
            <Zap className="mr-2 h-4 w-4" />
            Genera render {spec.singularLabel}
          </Button>
        </div>
      )}

      {step === 3 && (
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={elapsedSec}
          dots={dots}
          accent="orange"
          subjectLabel="L'AI sta elaborando il render tecnico"
        />
      )}

      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4 max-md:space-y-3">
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardContent className="py-4 max-md:p-0">
              {/* Telefono: parla l'immagine. */}
              <div className="mb-4 flex items-center gap-2 max-md:hidden">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700">{spec.resultTitle}</span>
              </div>
              {photoPreview ? (
                <BeforeAfterSlider beforeUrl={photoPreview} afterUrl={resultUrls[0]} />
              ) : (
                <img loading="lazy" src={resultUrls[0]} alt="Render completato" className="w-full rounded-lg object-cover" />
              )}
            </CardContent>
          </Card>

          {/* Telefono: nuovo render a icona e «Manda al cliente» (l'immagine, non un link). */}
          {isMobile && (
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 shrink-0 px-0" onClick={nuovoRender} aria-label="Nuovo render">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <MandaRenderMobile resultUrl={resultUrls[0]} nomeFile={`render-${moduleId}`} className="min-w-0 flex-1" />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3 max-md:hidden">
            <Button variant="outline" className="gap-2" onClick={downloadResult}><Download className="h-4 w-4" />Scarica</Button>
            <Button variant="outline" className="gap-2" onClick={shareWhatsApp}><Share2 className="h-4 w-4" />WhatsApp</Button>
            <Button className="gap-2" onClick={() => navigate(`/azienda/render/${moduleId}/gallery`)}>Apri galleria</Button>
          </div>

          <RenderResultRefinementPanel
            config={config}
            noteValue={config.technicalDetails}
            notePlaceholder="Scrivi una variante precisa. Esempio: mantieni identici porta e pavimento, cambia solo la finitura del pannello, evita arredi nuovi."
            onNoteChange={(technicalDetails) => setConfig((current) => ({ ...current, technicalDetails }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel={`Genera nuova variante ${spec.singularLabel}`}
          />

          <Button
            variant="outline"
            className="w-full gap-2 max-md:hidden"
            onClick={nuovoRender}
          >
            <RefreshCw className="h-4 w-4" />
            Nuovo render {spec.singularLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
