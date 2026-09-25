import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, ImagePlus, Camera,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ZonaFotoMobile } from "@/components/render/ZonaFotoMobile";
import { MandaRenderMobile } from "@/components/render/MandaRenderMobile";
import { RenderWizardHeader } from "@/components/render/RenderWizardHeader";
import { PergoleConfigForm } from "@/components/render-pergole/PergoleConfigForm";
import { DEFAULT_PERGOLE_CONFIG } from "@/components/render-pergole/defaultPergoleConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";
import { preloadImage } from "@/lib/render/preloadImage";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { buildPergoleRenderConfig } from "@/modules/render-pergole/lib/pergoleRenderConfig";
import type { ConfigurazionePergole } from "@/modules/render-pergole/lib/types";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";

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

export default function RenderPergoleNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const db = supabase as unknown as DynamicRenderDb;

  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigurazionePergole>(DEFAULT_PERGOLE_CONFIG);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [dots, setDots] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const renderPlan = buildPergoleRenderConfig(config);

  useEffect(() => () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (dotsIntervalRef.current) {
      clearInterval(dotsIntervalRef.current);
      dotsIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

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

  const goToStep2 = useCallback(async () => {
    if (!photo || !companyId || !user) return;
    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_pergole_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "pergole-originals",
        path,
        file: photo,
      });
      setPhotoPath(storagePath);

      const { data: sess, error: sessErr } = await db
        .from("render_pergole_sessions")
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
      if (sessErr || !sess) throw new Error(sessErr?.message ?? "Creazione sessione fallita");
      setSessionId(sess.id as string);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }, [photo, companyId, user, db, config, contactId, opportunityId]);

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
        toast.error("Timeout: il render sta impiegando troppo tempo. Riprova più tardi.");
        setStep(2);
        return;
      }

      const { data: sess } = await db
        .from("render_pergole_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      if (sess?.status === "completed" && sess.result_urls?.length) {
        stopPolling();
        if (sess.result_urls[0]) await preloadImage(sess.result_urls[0]);
        setResultUrls(sess.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-pergole-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
        setStep(4);
        return;
      }

      if (sess?.status === "failed") {
        stopPolling();
        setGenerating(false);
        toast.error(sess.error_message || "Render fallito. Riprova.");
        setStep(2);
        return;
      }

      const intervalIdx = Math.min(pollCountRef.current, POLL_INTERVALS.length - 1);
      pollCountRef.current += 1;
      pollRef.current = setTimeout(poll, POLL_INTERVALS[intervalIdx]);
    };

    poll();
  }, [companyId, db, queryClient, stopPolling]);

  const startRender = useCallback(async () => {
    if (!sessionId || !companyId || generating) return;
    setGenerating(true);
    setResultUrls([]);
    setStep(3);
    setElapsedSec(0);
    setDots(0);

    try {
    await db
      .from("render_pergole_sessions")
      .update({
        config,
        status: "pending",
        result_urls: null,
        error_message: null,
      })
      .eq("id", sessionId);

    let targetWidth: number | undefined;
    let targetHeight: number | undefined;
    if (photo && photoPreview) {
      const img = new window.Image();
      img.src = photoPreview;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
      targetWidth = img.naturalWidth || undefined;
      targetHeight = img.naturalHeight || undefined;
    }

    const headers = await getEdgeFunctionAuthHeaders();
    startPolling(sessionId);
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-pergola-render", {
      body: {
        session_id: sessionId,
        config,
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
      toast.error(msg.includes("insufficient_credits") ? "Crediti render insufficienti. Acquista nuovi crediti." : msg);
      setStep(2);
      return;
    }

    const urls: string[] = fnData?.result_urls ?? (fnData?.result_url ? [fnData.result_url] : []);
    if (urls.length) {
      stopPolling();
      if (urls[0]) await preloadImage(urls[0]);
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-pergole-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      setStep(4);
      return;
    }
    } catch (err) {
      stopPolling();
      setGenerating(false);
      setStep(2);
      toast.error(err instanceof Error ? err.message : "Render fallito");
    }
  }, [sessionId, companyId, generating, db, config, photo, photoPreview, queryClient, startPolling, stopPolling]);

  const downloadResult = useCallback(async () => {
    const url = resultUrls[0];
    if (!url) return;
    try {
      await downloadRenderImage(url, `render_pergole_${Date.now()}.png`);
    } catch {
      toast.error("Download fallito. Tieni premuto sull'immagine per salvarla.");
    }
  }, [resultUrls]);

  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ecco il render della nuova pergola!\n${url}`)}`, "_blank");
  }, [resultUrls]);

  const isMobile = useIsMobile();
  const nuovoRender = () => {
    setStep(1);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoPath(null);
    setSessionId(null);
    setResultUrls([]);
    setConfig(DEFAULT_PERGOLE_CONFIG);
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
    <div ref={radiceRef} className="space-y-6 max-w-3xl mx-auto pb-12 scroll-mt-3 max-md:space-y-3">
      <RenderWizardHeader
        onBack={() => {
          if (step === 1 || step === 4) navigate("/azienda/render/pergole");
          else if (step === 2) setStep(1);
          else if (step === 3 && !generating) setStep(2);
        }}
        eyebrow="Render pergola fotorealistico"
        title="Stesso esterno, nuova pergola"
        mobileTitle="Render Pergola"
        description="Visualizza la pergola sul tuo terrazzo o giardino con materiali, colori e copertura scelti."
        badgeLabel="Render AI — Pergole"
        stepLabels={["Foto", "Configura", "Elaborazione", "Risultato"]}
        currentStep={step}
        accent="violet"
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
                suggerimento="Terrazza, patio o giardino, con la parete di appoggio"
                accento="emerald"
              />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            </>
          ) : (
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardHeader className="max-md:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto area esterna
              </CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img loading="lazy" src={photoPreview} alt="Foto caricata" className="w-full max-h-96 object-cover" />
                  {/* Telefono: una pastiglia leggera sulla foto invece del bottone pieno. */}
                  <Button variant="secondary" size="sm" className="absolute top-3 right-3 gap-1.5 max-md:right-2 max-md:top-2 max-md:h-8 max-md:rounded-full max-md:bg-black/55 max-md:px-3 max-md:text-[13px] max-md:text-white max-md:backdrop-blur-sm max-md:hover:bg-black/65" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                    <RefreshCw className="h-3.5 w-3.5 max-md:hidden" />
                    <Camera className="hidden h-3.5 w-3.5 max-md:block" />
                    Cambia foto
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-emerald-500/60 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Carica foto di terrazza, patio, giardino o bordo piscina</p>
                    <p className="text-sm text-muted-foreground mt-1">JPG, PNG, WEBP - Max 20 MB</p>
                  </div>
                  <Button variant="outline" size="sm" type="button">Sfoglia file</Button>
                </div>
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
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" disabled={!photo || uploading} onClick={goToStep2}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Caricamento...</> : "Continua con la configurazione"}
          </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 max-md:space-y-3">
          {photoPreview && (
            <div className="rounded-lg overflow-hidden max-h-56">
              <img loading="lazy" src={photoPreview} alt="Foto pergola" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 max-md:gap-3">
            <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              <CardHeader className="max-md:hidden">
                <CardTitle className="text-base">Configura pergola e installazione</CardTitle>
              </CardHeader>
              <CardContent className="max-md:p-0">
                <PergoleConfigForm value={config} onChange={setConfig} />
              </CardContent>
            </Card>
            {/* Telefono: ambito e regole di installazione (testo tecnico) restano al computer. */}
            <div className="space-y-3 max-md:hidden">
              <Card>
                <CardHeader><CardTitle className="text-sm">Scope render</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Badge className="bg-emerald-600">{renderPlan.target_installation_map.zone.replace(/_/g, " ")}</Badge>
                  <p className="text-muted-foreground">{renderPlan.target_installation_map.footprint}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Regole installazione</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p className="rounded-lg bg-muted p-2">{renderPlan.installability_envelope.facadeRelation}</p>
                  <p className="rounded-lg bg-muted p-2">{renderPlan.installability_envelope.drainageLogic}</p>
                </CardContent>
              </Card>
            </div>
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={startRender}>
            <Zap className="h-4 w-4 mr-2" />
            Genera render pergola
          </Button>
        </div>
      )}

      {step === 3 && (
        <RenderProcessingCard
          photoPreview={photoPreview}
          elapsedSec={elapsedSec}
          dots={dots}
          accent="violet"
          subjectLabel="L'AI sta elaborando il render della pergola"
        />
      )}

      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4 max-md:space-y-3">
          <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            <CardContent className="py-4 max-md:p-0">
              {/* Telefono: parla l'immagine. */}
              <div className="flex items-center gap-2 mb-4 max-md:hidden">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700">Render completato!</span>
              </div>
              {photoPreview ? (
                <BeforeAfterSlider beforeSrc={photoPreview} afterSrc={resultUrls[0]} beforeLabel="Prima" afterLabel="Dopo" />
              ) : (
                <img loading="lazy" src={resultUrls[0]} alt="Render pergola" className="w-full object-cover rounded-lg" />
              )}
            </CardContent>
          </Card>
          {/* Telefono: nuovo render a icona e «Manda al cliente» (l'immagine, non un link). */}
          {isMobile && (
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 shrink-0 px-0" onClick={nuovoRender} aria-label="Nuovo render">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <MandaRenderMobile resultUrl={resultUrls[0]} nomeFile="render-pergola" className="min-w-0 flex-1" />
            </div>
          )}
          <div className="flex gap-2 max-md:hidden">
            <Button variant="outline" className="flex-1 gap-2" onClick={downloadResult}><Download className="h-4 w-4" />Scarica</Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={shareWhatsApp}><Share2 className="h-4 w-4" />WhatsApp</Button>
          </div>
          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante pergola"
          />
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 max-md:hidden"
            onClick={nuovoRender}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render pergola
          </Button>
        </div>
      )}
    </div>
  );
}
