import { useCallback, useEffect, useRef, useState } from "react";
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
  ArrowLeft, Upload, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, Download, Share2, RefreshCw, Waves,
} from "lucide-react";
import { PiscineConfigForm } from "@/components/render-piscine/PiscineConfigForm";
import { DEFAULT_PISCINE_CONFIG } from "@/components/render-piscine/defaultPiscineConfig";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RenderCreditGate } from "@/components/render/RenderCreditGate";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderResultRefinementPanel } from "@/components/render/RenderResultRefinementPanel";
import { buildPiscineRenderConfig } from "@/modules/render-piscine/lib/piscineRenderConfig";
import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";
import { getPiscineDb } from "@/modules/render-piscine/lib/dynamicSupabase";
import {
  getEdgeFunctionAuthHeaders,
  resolveEdgeFunctionErrorMessage,
} from "@/modules/render/lib/edgeFunctionClient";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";

type Step = 1 | 2 | 3 | 4;

const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 420;

function isIdleTimeoutMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("idle timeout") || normalized.includes("timeout limit") || normalized.includes("150s");
}

export default function RenderPiscineNew() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const db = getPiscineDb();

  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigurazionePiscine>(DEFAULT_PISCINE_CONFIG);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [dots, setDots] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const elapsedRef = useRef(0);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const renderPlan = buildPiscineRenderConfig(config);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
  }, []);

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
      const path = `${companyId}/${Date.now()}_piscine_original.${ext}`;
      const { storagePath } = await uploadRenderOriginal({
        bucket: "piscine-originals",
        path,
        file: photo,
      });
      setPhotoPath(storagePath);

      const { data: sess, error: sessErr } = await db
        .from("render_piscine_sessions")
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
        .from("render_piscine_sessions")
        .select("status, result_urls, error_message")
        .eq("id", sid)
        .single();

      if (sess?.status === "completed" && sess.result_urls?.length) {
        stopPolling();
        setResultUrls(sess.result_urls);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-piscine-sessions", companyId] });
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
      .from("render_piscine_sessions")
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
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-pool-render", {
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
      setResultUrls(urls);
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["render-piscine-sessions", companyId] });
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
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_piscine_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  }, [resultUrls]);

  const shareWhatsApp = useCallback(() => {
    const url = resultUrls[0];
    if (!url) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ecco il render della nuova piscina!\n${url}`)}`, "_blank");
  }, [resultUrls]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === 1 || step === 4) navigate("/azienda/render/piscine");
            else if (step === 2) setStep(1);
            else if (step === 3 && !generating) setStep(2);
          }}
          disabled={step === 3 && generating}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Waves className="h-5 w-5 text-emerald-600" />
            Nuovo render piscine
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 && "Carica la foto dello spazio esterno"}
            {step === 2 && "Configura geometria, acqua, bordo, accessi e inserimento"}
            {step === 3 && "Generazione in corso..."}
            {step === 4 && "Render completato"}
          </p>
        </div>
        <RenderCreditsWidget />
      </div>

      <RenderCreditGate />

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {["Foto", "Configura", "Elaborazione", "Risultato"].map((label, i) => (
            <span key={label} className={step === i + 1 ? "text-emerald-700 font-semibold" : step > i + 1 ? "text-foreground" : ""}>
              {i + 1}. {label}
            </span>
          ))}
        </div>
        <Progress value={(step / 4) * 100} className="h-1.5" />
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Foto area esterna
              </CardTitle>
            </CardHeader>
            <CardContent>
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img src={photoPreview} alt="Foto caricata" className="w-full max-h-96 object-cover" />
                  <Button variant="secondary" size="sm" className="absolute top-3 right-3 gap-1.5" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                    <RefreshCw className="h-3.5 w-3.5" />
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

          <RenderCrmLinker
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
          />

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" disabled={!photo || uploading} onClick={goToStep2}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Caricamento...</> : "Continua con la configurazione"}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {photoPreview && (
            <div className="rounded-lg overflow-hidden max-h-56">
              <img src={photoPreview} alt="Foto piscina" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configura piscina e installazione</CardTitle>
              </CardHeader>
              <CardContent>
                <PiscineConfigForm value={config} onChange={setConfig} />
              </CardContent>
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Scope render</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Badge className="bg-emerald-600">{renderPlan.target_pool_insertion_map.zone.replace(/_/g, " ")}</Badge>
                  <p className="text-muted-foreground">{renderPlan.target_pool_insertion_map.footprint}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Regole installazione</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p className="rounded-lg bg-muted p-2">{renderPlan.buildability_envelope.groundPlaneRelation}</p>
                  <p className="rounded-lg bg-muted p-2">{renderPlan.buildability_envelope.deckMargins}</p>
                </CardContent>
              </Card>
            </div>
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={startRender}>
            <Zap className="h-4 w-4 mr-2" />
            Genera render piscina
          </Button>
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
              <Zap className="h-10 w-10 text-emerald-600 animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-lg">Generazione in corso{".".repeat(dots)}</p>
              <p className="text-sm text-muted-foreground mt-1">L'AI sta installando la piscina sulla stessa foto, preservando edificio e prospettiva.</p>
            </div>
            <div className="w-full max-w-xs">
              <Progress value={Math.min((elapsedSec / 240) * 100, 95)} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{elapsedSec}s trascorsi · può richiedere 1-4 minuti</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && resultUrls.length > 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700">Render completato!</span>
              </div>
              {photoPreview ? (
                <BeforeAfterSlider beforeSrc={photoPreview} afterSrc={resultUrls[0]} beforeLabel="Prima" afterLabel="Dopo" />
              ) : (
                <img src={resultUrls[0]} alt="Render piscina" className="w-full object-cover rounded-lg" />
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={downloadResult}><Download className="h-4 w-4" />Download</Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={shareWhatsApp}><Share2 className="h-4 w-4" />WhatsApp</Button>
          </div>
          <RenderResultRefinementPanel
            config={config}
            noteValue={config.note_libere ?? ""}
            onNoteChange={(note) => setConfig((current) => ({ ...current, note_libere: note }))}
            onEditChoices={() => setStep(2)}
            onRegenerate={startRender}
            disabled={generating}
            regenerateLabel="Genera nuova variante piscina"
          />
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              setStep(1);
              setPhoto(null);
              setPhotoPreview(null);
              setPhotoPath(null);
              setSessionId(null);
              setResultUrls([]);
              setConfig(DEFAULT_PISCINE_CONFIG);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Nuovo render piscina
          </Button>
        </div>
      )}
    </div>
  );
}
