// RenderNewV2.tsx — 6-step wizard for AI window render
// Replaces legacy RenderNew.tsx. Mobile-first UX, one decision per screen.
// Flow: Foto → Tipo → Profilo → Colori → Opzioni → Genera/Risultato

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Upload, Camera, Loader2, Zap, CheckCircle2,
  Download, RefreshCw, Sparkles, ImageIcon, FileText,
} from "lucide-react";

import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import {
  WIZARD_TIPI, WIZARD_PROFILI, WIZARD_RAL, WIZARD_LEGNO, WIZARD_HW_COLORS,
  WIZARD_CASS_MATERIALI, WIZARD_TAPP_OPTIONS,
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  mapWizardToConfig, getColorById,
  type WizardState, type WizardTipo, type WizardProfilo, type WizardHw,
  type WizardCassMat, type WizardTapp,
} from "@/modules/render/lib/configMapper";

// ── Polling constants ─────────────────────────────────────────────────────────
const POLL_INTERVALS = [3000, 5000, 8000, 12000, 15000];
const MAX_POLL_SEC = 180;

const STEP_LABELS = ["Foto", "Tipo", "Profilo", "Colori", "Opzioni", "Render"];

// ── Default wizard state ──────────────────────────────────────────────────────
const INITIAL_STATE: WizardState = {
  tipo: "",
  profilo: "",
  manigliaCentrale: false,
  coloreInfisso: "",
  coloreHw: "cromo",
  cass: false,
  cassMat: "stesso_colore",
  cassCol: "",
  tapp: "no",
  tappCol: "stesso",
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function RenderNewV2() {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalSignedUrl, setOriginalSignedUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // CRM linking (populated in Step 6)
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileChange = (f: File | null) => {
    if (!f) {
      setPhoto(null); setPhotoPreview(null); setPhotoPath(null); setSessionId(null);
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
    setPhotoPath(null);
    setSessionId(null);
  };

  // ── Upload + create session (when user clicks "Avanti" from step 1) ────────
  const uploadAndCreateSession = useCallback(async (): Promise<string | null> => {
    if (!photo || !companyId || !user) {
      toast.error("Carica una foto prima di procedere");
      return null;
    }
    if (sessionId && photoPath) return sessionId;

    setUploading(true);
    try {
      const ext = photo.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${Date.now()}_original.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("render-originals")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);
      setPhotoPath(path);

      const { data: sess, error: sessErr } = await supabase
        .from("render_sessions" as never)
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "pending",
          original_photo_url: path,
          config: {},
        } as never)
        .select("id")
        .single();
      if (sessErr || !sess) throw new Error("Creazione sessione fallita");
      const sid = (sess as { id: string }).id;
      setSessionId(sid);

      // Background photo analysis (non-blocking — used as hint for prompt engine)
      void (async () => {
        try {
          const { data: signed } = await supabase.storage
            .from("render-originals")
            .createSignedUrl(path, 300);
          if (!signed?.signedUrl) return;
          const { data: { session: authSession } } = await supabase.auth.getSession();
          const token = authSession?.access_token;
          await supabase.functions.invoke("analyze-window-photo", {
            body: { image_url: signed.signedUrl, session_id: sid },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        } catch {
          // analysis is optional — fall back to defaults
        }
      })();

      return sid;
    } catch (err) {
      toast.error(String(err));
      return null;
    } finally {
      setUploading(false);
    }
  }, [photo, photoPath, sessionId, companyId, user]);

  // ── Generate render ────────────────────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!sessionId || !companyId) return;

    let config;
    try {
      config = mapWizardToConfig(state);
    } catch (err) {
      toast.error(String(err));
      return;
    }

    // Clear any previous timers (avoids double-run on retry)
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }

    setGenerating(true);
    setGenerateError(null);
    setResultUrl(null);
    elapsedRef.current = 0;
    setElapsedSec(0);

    // Update session config
    await supabase
      .from("render_sessions" as never)
      .update({ config } as never)
      .eq("id" as never, sessionId as never);

    // Get target dimensions from photo
    let target_width: number | undefined;
    let target_height: number | undefined;
    if (photoPreview) {
      try {
        const img = new window.Image();
        img.src = photoPreview;
        await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
        target_width = img.naturalWidth || undefined;
        target_height = img.naturalHeight || undefined;
      } catch { /* ignore */ }
    }

    // Start elapsed timer
    tickRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
    }, 1000);

    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-render", {
        body: {
          session_id: sessionId,
          config,
          ...(target_width && target_height ? { target_width, target_height } : {}),
        },
      });

      if (fnErr || fnData?.error) {
        throw new Error(fnErr?.message ?? fnData?.message ?? fnData?.error ?? "Generazione fallita");
      }

      // Synchronous response
      if (fnData?.result_url) {
        if (tickRef.current) clearInterval(tickRef.current);
        setResultUrl(fnData.result_url as string);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
        return;
      }

      // Otherwise poll
      startPolling(sessionId);
    } catch (err) {
      if (tickRef.current) clearInterval(tickRef.current);
      setGenerating(false);
      setGenerateError(String(err));
      toast.error(String(err));
    }
  }, [sessionId, companyId, state, photoPreview, queryClient]);

  const startPolling = useCallback((sid: string) => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    let intervalIdx = 0;
    const poll = async () => {
      if (elapsedRef.current >= MAX_POLL_SEC) {
        if (tickRef.current) clearInterval(tickRef.current);
        setGenerating(false);
        setGenerateError("Timeout: il render sta impiegando troppo tempo");
        return;
      }

      const { data: sess } = await supabase
        .from("render_sessions" as never)
        .select("status, result_urls")
        .eq("id" as never, sid as never)
        .single();

      const s = sess as { status: string; result_urls: string[] | null } | null;
      if (s?.status === "completed" && s.result_urls?.length) {
        if (tickRef.current) clearInterval(tickRef.current);
        setResultUrl(s.result_urls[0]);
        setGenerating(false);
        queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
        queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
        return;
      }
      if (s?.status === "failed") {
        if (tickRef.current) clearInterval(tickRef.current);
        setGenerating(false);
        setGenerateError("Render fallito");
        return;
      }
      pollRef.current = setTimeout(poll, POLL_INTERVALS[Math.min(intervalIdx++, POLL_INTERVALS.length - 1)]);
    };
    poll();
  }, [companyId, queryClient]);

  // ── Auto-start render when entering step 6 ─────────────────────────────────
  useEffect(() => {
    if (step === 6 && sessionId && !resultUrl && !generating && !generateError) {
      void startRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  // ── Build signed URL for original photo (needed by BeforeAfterSlider) ──────
  useEffect(() => {
    if (!photoPath || originalSignedUrl) return;
    void (async () => {
      const { data: signed } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(photoPath, 3600);
      if (signed?.signedUrl) setOriginalSignedUrl(signed.signedUrl);
    })();
  }, [photoPath, originalSignedUrl]);

  // ── Persist CRM link onto render_sessions (only when user actually selects) ─
  const crmPersistedRef = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    // Skip the initial run with null/null — only write when the user picks something,
    // or when clearing a previously written value.
    if (!contactId && !opportunityId && !crmPersistedRef.current) return;
    crmPersistedRef.current = true;
    void supabase
      .from("render_sessions" as never)
      .update({ contact_id: contactId, opportunity_id: opportunityId } as never)
      .eq("id" as never, sessionId as never);
  }, [sessionId, contactId, opportunityId]);

  // ── Reset wizard ───────────────────────────────────────────────────────────
  const reset = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    crmPersistedRef.current = false;
    setStep(1);
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoPath(null);
    setSessionId(null);
    setOriginalSignedUrl(null);
    setState(INITIAL_STATE);
    setResultUrl(null);
    setGenerateError(null);
    setGenerating(false);
    setElapsedSec(0);
    setContactId(null);
    setOpportunityId(null);
  };

  // ── Step navigation ────────────────────────────────────────────────────────
  const goNext = async () => {
    if (step === 1) {
      const sid = await uploadAndCreateSession();
      if (sid) setStep(2);
      return;
    }
    setStep(s => Math.min(s + 1, 6));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  // ── Download result ────────────────────────────────────────────────────────
  const downloadResult = async () => {
    if (!resultUrl) return;
    try {
      const resp = await fetch(resultUrl);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `render_infissi_${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Download fallito");
    }
  };

  const canGoNextFromStep = (s: number): boolean => {
    switch (s) {
      case 1: return !!photo;
      case 2: return !!state.tipo;
      case 3: return !!state.profilo;
      case 4: return !!state.coloreInfisso;
      case 5: return true;
      default: return false;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-xl pb-8">
      {/* Header with step progress */}
      <div className="mb-6 rounded-b-2xl bg-gradient-to-br from-slate-800 to-slate-700 px-5 py-5 text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Indietro
          </button>
          <Badge variant="secondary" className="gap-1 bg-white/15 text-white hover:bg-white/20">
            <Zap className="h-3 w-3" /> Render AI
          </Badge>
        </div>
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
            Render AI — Infissi
          </div>
          <div className="text-xl font-bold">
            {step <= 5 ? "Nuovo Render" : "Risultato"}
          </div>
        </div>
        {/* Progress dots */}
        <div className="mt-4 flex gap-1">
          {STEP_LABELS.map((l, i) => (
            <div key={l} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "h-1 w-full rounded transition-colors",
                  step >= i + 1 ? "bg-orange-500" : "bg-white/20",
                )}
              />
              <span className={cn("text-[9px] font-semibold", step >= i + 1 ? "opacity-100" : "opacity-40")}>
                {l}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4">
        {step === 1 && (
          <Step1Foto
            preview={photoPreview}
            onFile={handleFileChange}
            onNext={goNext}
            uploading={uploading}
            fileRef={fileRef}
          />
        )}

        {step === 2 && (
          <StepChoice
            title="Che tipo di serramento?"
            options={WIZARD_TIPI.map(t => ({ id: t.id, label: t.label, desc: t.desc }))}
            value={state.tipo}
            onChange={(v) => setState(s => ({ ...s, tipo: v as WizardTipo }))}
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!canGoNextFromStep(2)}
            columns={4}
          />
        )}

        {step === 3 && (
          <StepChoice
            title="Tipologia profilo"
            options={WIZARD_PROFILI.map(p => ({ id: p.id, label: p.label, desc: p.desc }))}
            value={state.profilo}
            onChange={(v) => setState(s => ({ ...s, profilo: v as WizardProfilo }))}
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!canGoNextFromStep(3)}
            columns={2}
            extra={
              state.profilo && PROFILI_MANIGLIA_CENTRALE_COMPATIBILI.includes(state.profilo) ? (
                <button
                  type="button"
                  onClick={() =>
                    setState(s => ({ ...s, manigliaCentrale: !s.manigliaCentrale }))
                  }
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                    state.manigliaCentrale
                      ? "border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                      : "border-border hover:border-orange-300",
                  )}
                  aria-pressed={state.manigliaCentrale}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded border-2 flex-none flex items-center justify-center",
                      state.manigliaCentrale
                        ? "border-orange-500 bg-orange-500"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {state.manigliaCentrale && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">Maniglia al centro</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">
                      Posiziona la maniglia al centro dell'anta (nodo ridotto).
                      Applicabile al profilo selezionato.
                    </div>
                  </div>
                </button>
              ) : null
            }
          />
        )}

        {step === 4 && (
          <Step4Colori
            state={state}
            setState={setState}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 5 && (
          <Step5Opzioni
            state={state}
            setState={setState}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 6 && (
          <Step6Render
            photoPreview={photoPreview}
            originalSignedUrl={originalSignedUrl}
            resultUrl={resultUrl}
            generating={generating}
            elapsedSec={elapsedSec}
            error={generateError}
            state={state}
            contactId={contactId}
            opportunityId={opportunityId}
            onContactChange={setContactId}
            onOpportunityChange={setOpportunityId}
            onCreateQuote={() => {
              const qs = new URLSearchParams();
              if (contactId) qs.set("contact_id", contactId);
              navigate(`/azienda/marketing/preventivi/nuovo${qs.toString() ? `?${qs}` : ""}`);
            }}
            onReset={reset}
            onRetry={startRender}
            onDownload={downloadResult}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Photo upload ────────────────────────────────────────────────────
function Step1Foto({
  preview, onFile, onNext, uploading, fileRef,
}: {
  preview: string | null;
  onFile: (f: File | null) => void;
  onNext: () => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {preview ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-border">
          <img src={preview} alt="" className="block max-h-[320px] w-full object-cover" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute right-3 top-3"
            onClick={() => onFile(null)}
          >
            Cambia
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-400 bg-slate-50 px-6 py-12 transition hover:border-orange-400 hover:bg-orange-50 dark:bg-slate-900 dark:hover:bg-orange-950/20"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
            <Camera className="h-7 w-7" />
          </div>
          <div className="text-center">
            <div className="text-base font-bold">Scatta o carica la foto</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Foto frontale della facciata con infissi attuali
            </div>
          </div>
          <div className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white">
            <Upload className="mr-2 inline h-4 w-4" /> Sfoglia file
          </div>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {preview && (
        <Button
          size="lg"
          className="w-full gap-2 bg-slate-800 hover:bg-slate-700"
          disabled={uploading}
          onClick={onNext}
        >
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</> : <>Avanti → Tipo serramento <ArrowRight className="h-4 w-4" /></>}
        </Button>
      )}
    </div>
  );
}

// ─── Generic choice step (used for Tipo and Profilo) ─────────────────────────
function StepChoice({
  title, options, value, onChange, onBack, onNext, nextDisabled, columns, extra,
}: {
  title: string;
  options: { id: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  columns: number;
  /** Contenuto opzionale tra la griglia delle opzioni e la NavButtons (es. toggle stilistici). */
  extra?: React.ReactNode;
}) {
  const gridClass = columns === 4 ? "grid-cols-4" : "grid-cols-2";
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>{title}</SectionTitle>
      <div className={cn("grid gap-2", gridClass)}>
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-left transition",
              value === opt.id
                ? "border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                : "border-border hover:border-orange-300",
              columns === 2 && "items-start p-3.5",
            )}
          >
            <span className={cn("text-sm font-bold", value === opt.id ? "text-orange-600" : "")}>
              {opt.label}
            </span>
            {opt.desc && (
              <span className="text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                {opt.desc}
              </span>
            )}
          </button>
        ))}
      </div>
      {extra}
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={nextDisabled} />
    </div>
  );
}

// ─── Step 4: Colors ──────────────────────────────────────────────────────────
function Step4Colori({
  state, setState, onBack, onNext,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<"ral" | "legno">("ral");
  const list = tab === "ral" ? WIZARD_RAL : WIZARD_LEGNO;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionTitle>Colore infisso</SectionTitle>
        <div className="mb-3 flex overflow-hidden rounded-lg border">
          {(["ral", "legno"] as const).map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-bold transition",
                tab === k ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                i > 0 && "border-l",
              )}
            >
              {k === "ral" ? "Colori RAL" : "Effetti Legno"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {list.map(c => (
            <ColorSwatch
              key={c.id}
              hex={c.hex}
              grad={"grad" in c ? c.grad : undefined}
              name={c.nome}
              selected={state.coloreInfisso === c.id}
              onClick={() => setState(s => ({ ...s, coloreInfisso: c.id }))}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Colore maniglie e cerniere</SectionTitle>
        <div className="grid grid-cols-6 gap-1.5">
          {WIZARD_HW_COLORS.map(c => (
            <ColorSwatch
              key={c.id}
              hex={c.hex}
              name={c.nome}
              selected={state.coloreHw === c.id}
              onClick={() => setState(s => ({ ...s, coloreHw: c.id as WizardHw }))}
              small
            />
          ))}
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!state.coloreInfisso} />
    </div>
  );
}

// ─── Step 5: Cassonetto + Tapparelle ─────────────────────────────────────────
function Step5Opzioni({
  state, setState, onBack, onNext,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onBack: () => void;
  onNext: () => void;
}) {
  const infissoColor = getColorById(state.coloreInfisso);
  return (
    <div className="flex flex-col gap-5">
      {/* Cassonetto */}
      <div>
        <SectionTitle>Cassonetto</SectionTitle>
        <button
          type="button"
          onClick={() => setState(s => ({ ...s, cass: !s.cass }))}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition",
            state.cass
              ? "border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30"
              : "border-border hover:border-orange-300",
          )}
        >
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg text-lg",
            state.cass ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800",
          )}>
            {state.cass ? <CheckCircle2 className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Sostituisci cassonetto</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Nuovo cassonetto coordinato o personalizzato
            </div>
          </div>
        </button>

        {state.cass && (
          <Card className="mt-2 bg-slate-50 dark:bg-slate-900">
            <CardContent className="p-3">
              <div className="mb-2 text-xs font-semibold">Materiale cassonetto</div>
              <div className="grid grid-cols-2 gap-1.5">
                {WIZARD_CASS_MATERIALI.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setState(s => ({ ...s, cassMat: m.id as WizardCassMat }))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition",
                      state.cassMat === m.id
                        ? "border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                        : "border-border bg-white dark:bg-slate-950 hover:border-orange-300",
                    )}
                  >
                    <span className="text-lg leading-none">{m.icon}</span>
                    <div>
                      <div className={cn("text-xs font-bold", state.cassMat === m.id && "text-orange-600")}>
                        {m.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {state.cassMat === "colore_custom" && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold">Colore RAL cassonetto</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {WIZARD_RAL.map(c => (
                      <ColorSwatch
                        key={c.id}
                        hex={c.hex}
                        name={c.nome}
                        selected={state.cassCol === c.id}
                        onClick={() => setState(s => ({ ...s, cassCol: c.id }))}
                        small
                      />
                    ))}
                  </div>
                </div>
              )}

              {state.cassMat === "stesso_colore" && infissoColor && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs dark:bg-slate-950">
                  <div
                    className="h-5 w-5 rounded border"
                    style={{ background: "grad" in infissoColor ? infissoColor.grad : infissoColor.hex }}
                  />
                  <span>Cassonetto in <strong>{infissoColor.nome}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tapparelle */}
      <div>
        <SectionTitle>Tapparelle</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {WIZARD_TAPP_OPTIONS.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setState(s => ({ ...s, tapp: o.id as WizardTapp }))}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition",
                state.tapp === o.id
                  ? "border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                  : "border-border hover:border-orange-300",
              )}
            >
              <span className="text-xl leading-none">{o.icon}</span>
              <span className={cn("text-xs font-bold", state.tapp === o.id && "text-orange-600")}>
                {o.label}
              </span>
              <span className="text-[9px] text-muted-foreground">{o.desc}</span>
            </button>
          ))}
        </div>

        {(state.tapp === "nuove" || state.tapp === "motorizzate") && (
          <Card className="mt-2 bg-slate-50 dark:bg-slate-900">
            <CardContent className="p-3">
              <div className="mb-2 text-xs font-semibold">
                Colore tapparelle{state.tapp === "motorizzate" ? " (motorizzate)" : ""}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setState(s => ({ ...s, tappCol: "stesso" }))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                    state.tappCol === "stesso"
                      ? "border-2 border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/30"
                      : "border-border bg-white dark:bg-slate-950 hover:border-orange-300",
                  )}
                >
                  {infissoColor && (
                    <div
                      className="h-3.5 w-3.5 rounded border"
                      style={{ background: "grad" in infissoColor ? infissoColor.grad : infissoColor.hex }}
                    />
                  )}
                  Stesso infisso
                </button>
                {WIZARD_RAL.slice(0, 6).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.nome}
                    onClick={() => setState(s => ({ ...s, tappCol: c.id }))}
                    className={cn(
                      "h-8 w-8 rounded-lg border transition",
                      state.tappCol === c.id ? "ring-2 ring-orange-500 ring-offset-1" : "hover:ring-1 hover:ring-orange-300",
                    )}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextDisabled={false}
        nextLabel="Genera Render AI"
        nextIcon={<Sparkles className="h-4 w-4" />}
        nextAccent
      />
    </div>
  );
}

// ─── Step 6: Generation + Result ─────────────────────────────────────────────
function Step6Render({
  photoPreview, originalSignedUrl, resultUrl, generating, elapsedSec, error, state,
  contactId, opportunityId, onContactChange, onOpportunityChange,
  onReset, onRetry, onDownload, onCreateQuote,
}: {
  photoPreview: string | null;
  originalSignedUrl: string | null;
  resultUrl: string | null;
  generating: boolean;
  elapsedSec: number;
  error: string | null;
  state: WizardState;
  contactId: string | null;
  opportunityId: string | null;
  onContactChange: (id: string | null) => void;
  onOpportunityChange: (id: string | null) => void;
  onReset: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onCreateQuote: () => void;
}) {
  const tipo = WIZARD_TIPI.find(t => t.id === state.tipo);
  const profilo = WIZARD_PROFILI.find(p => p.id === state.profilo);
  const colore = getColorById(state.coloreInfisso);
  const hw = WIZARD_HW_COLORS.find(c => c.id === state.coloreHw);
  const cassM = WIZARD_CASS_MATERIALI.find(m => m.id === state.cassMat);

  const progress = useMemo(() => Math.min(95, Math.round((elapsedSec / 45) * 95)), [elapsedSec]);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Card className="bg-slate-800/5 border-slate-800/20">
        <CardContent className="p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-800">
            Riepilogo
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <div><span className="text-muted-foreground">Tipo:</span> <strong>{tipo?.label}</strong></div>
            <div><span className="text-muted-foreground">Profilo:</span> <strong>{profilo?.label}</strong></div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Colore:</span>
              {colore && (
                <div
                  className="h-3.5 w-3.5 rounded border"
                  style={{ background: "grad" in colore ? colore.grad : colore.hex }}
                />
              )}
              <strong>{colore?.nome}</strong>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Hardware:</span>
              {hw && (
                <div className="h-3 w-3 rounded-full border" style={{ background: hw.hex }} />
              )}
              <strong>{hw?.nome}</strong>
            </div>
            {state.cass && (
              <div className="col-span-2">📦 <strong>Cassonetto: {cassM?.label}</strong></div>
            )}
            {state.tapp !== "no" && (
              <div className="col-span-2">
                ⚡ <strong>Tapparelle: {state.tapp === "motorizzate" ? "Motorizzate" : "Nuove"}</strong>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-destructive">
              <RefreshCw className="h-4 w-4" /> Render non riuscito
            </div>
            <div className="text-xs text-muted-foreground">{error}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onRetry} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Riprova
              </Button>
              <Button size="sm" variant="outline" onClick={onReset}>
                Nuovo render
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !resultUrl || generating ? (
        <Card className="bg-gradient-to-br from-slate-800 to-slate-700 text-white">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <div className="text-3xl"><Loader2 className="h-8 w-8 animate-spin" /></div>
            <div className="text-base font-bold">Render in elaborazione…</div>
            <div className="text-xs opacity-70">L'AI sta sostituendo gli infissi ({elapsedSec}s)</div>
            <Progress value={progress} className="h-1.5 w-full bg-white/20" />
            <div className="text-[11px] opacity-50">~30-60 secondi</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Render completato!
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  Immagine fotorealistica pronta
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Before/After interactive slider (primary) */}
          {(originalSignedUrl || photoPreview) ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Prima / Dopo — trascina il cursore
                </div>
                <Badge className="bg-orange-500 text-white hover:bg-orange-600">RENDER AI</Badge>
              </div>
              <BeforeAfterSlider
                beforeUrl={originalSignedUrl ?? photoPreview ?? ""}
                afterUrl={resultUrl}
                className="aspect-[4/3] border"
              />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border">
              <img src={resultUrl} alt="Render" className="block w-full" />
              <Badge className="absolute right-3 top-3 bg-orange-500 text-white hover:bg-orange-600">
                RENDER AI
              </Badge>
            </div>
          )}

          {/* CRM linking */}
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

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" /> Scarica
            </Button>
            <Button variant="outline" onClick={onReset} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Nuovo render
            </Button>
          </div>

          <Button
            onClick={onCreateQuote}
            disabled={!contactId}
            size="lg"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <FileText className="h-4 w-4" />
            {contactId ? "Crea preventivo per questo contatto" : "Collega un contatto per creare il preventivo"}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── UI primitives ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 text-sm font-semibold">{children}</div>;
}

function NavButtons({
  onBack, onNext, nextDisabled, nextLabel, nextIcon, nextAccent,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel?: string;
  nextIcon?: React.ReactNode;
  nextAccent?: boolean;
}) {
  return (
    <div className="mt-1 flex gap-2">
      <Button variant="outline" onClick={onBack} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Indietro
      </Button>
      <Button
        onClick={onNext}
        disabled={nextDisabled}
        className={cn(
          "flex-1 gap-2",
          nextAccent ? "bg-orange-500 hover:bg-orange-600" : "bg-slate-800 hover:bg-slate-700",
        )}
      >
        {nextLabel || "Avanti"} {nextIcon || <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function ColorSwatch({
  hex, grad, name, selected, onClick, small,
}: {
  hex?: string;
  grad?: string;
  name: string;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  const size = small ? "h-8 w-8" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg p-1.5 transition",
        selected ? "border-2 border-orange-500" : "border border-border hover:border-orange-300",
      )}
    >
      <div
        className={cn(
          size,
          small ? "rounded-full" : "rounded-md",
          "border border-black/10",
          selected && "ring-2 ring-orange-500 ring-offset-1",
        )}
        style={{ background: grad ?? hex }}
      />
      <span className="max-w-[56px] text-center text-[9px] font-semibold leading-tight">
        {name}
      </span>
    </button>
  );
}
