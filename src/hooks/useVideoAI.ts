/**
 * useVideoAI — hook per generazione video AI via Replicate.
 *
 * Gestisce:
 *   • Avvio job (img2vid / txt2vid) → edge function ai-ads-video-generate
 *   • Polling status ogni 4s → ai-ads-video-status
 *   • Queue locale (persistita in localStorage per company)
 *   • Callback onCompleted quando video è pronto
 *
 * Il provider (Replicate) richiede REPLICATE_API_TOKEN nei Supabase Secrets.
 * Se non configurato, startJob ritorna { error: "provider_not_configured" }
 * e il componente mostra la guida di setup.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoJobStatus = "pending" | "processing" | "succeeded" | "failed";

export interface VideoJob {
  id: string;                  // job_id from edge function (or temp-replicate_id)
  replicate_id: string;
  replicate_get_url?: string;
  status: VideoJobStatus;
  mode: "img2vid" | "txt2vid";
  effect_id?: string;
  effect_label?: string;
  effect_emoji?: string;
  input_image_url?: string;    // preview
  prompt?: string;
  aspect_ratio: string;
  duration_seconds: number;
  cost_eur_cents_est?: number;
  started_at: number;          // timestamp
  video_url?: string;
  media_id?: string;
  error?: string;
  predict_time_seconds?: number;
}

export interface StartJobInput {
  company_id: string;
  mode: "img2vid" | "txt2vid";
  image_url?: string;
  prompt?: string;
  effect_id?: string;
  effect_label?: string;
  effect_emoji?: string;
  effect_motion?: string;
  duration_seconds?: 3 | 5 | 8;
  aspect_ratio?: "9:16" | "1:1" | "16:9";
}

export type VideoAISetupStatus = "unknown" | "checking" | "configured" | "not_configured";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4_000;
const MAX_JOBS_STORED = 20;
const STORAGE_KEY_PREFIX = "eic_video_jobs_";
// Tetto al polling (audit AI 2026-06): se una prediction Replicate resta
// appesa su "processing", senza limite il polling girava all'infinito
// (edge function ai-ads-video-status chiamata ogni 4s a vuoto). 10 minuti
// è ampiamente oltre il tempo di rendering di un video breve.
const MAX_POLL_MS = 10 * 60 * 1000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVideoAI(
  companyId: string | undefined,
  opts?: { onCompleted?: (job: VideoJob) => void },
) {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [setupStatus, setSetupStatus] = useState<VideoAISetupStatus>("unknown");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storageKey = companyId ? `${STORAGE_KEY_PREFIX}${companyId}` : null;

  // ── Persistence ──────────────────────────────────────────────────────────────

  // Load from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as VideoJob[];
        if (Array.isArray(stored)) setJobs(stored.slice(0, MAX_JOBS_STORED));
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Save to localStorage on change
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(jobs.slice(0, MAX_JOBS_STORED)));
    } catch { /* ignore */ }
  }, [jobs, storageKey]);

  // ── Polling ───────────────────────────────────────────────────────────────────

  const pollActiveJobs = useCallback(async () => {
    if (!companyId) return;
    const active = jobs.filter(j => j.status === "pending" || j.status === "processing");
    if (active.length === 0) return;

    // Timeout: i job appesi oltre MAX_POLL_MS vengono chiusi come "failed"
    // così il polling si ferma (il loop si arma solo se restano job attivi).
    const now = Date.now();
    const timedOut = active.filter(j => now - j.started_at > MAX_POLL_MS);
    if (timedOut.length > 0) {
      const timedOutIds = new Set(timedOut.map(j => j.id));
      setJobs(prev => prev.map(j =>
        timedOutIds.has(j.id)
          ? { ...j, status: "failed" as VideoJobStatus, error: "Timeout: generazione troppo lunga, riprova." }
          : j,
      ));
    }
    const stillActive = active.filter(j => now - j.started_at <= MAX_POLL_MS);
    if (stillActive.length === 0) return;

    for (const job of stillActive) {
      try {
        const { data, error } = await supabase.functions.invoke<{
          status: VideoJobStatus;
          video_url?: string;
          media_id?: string;
          predict_time_seconds?: number;
          error?: string;
        }>("ai-ads-video-status", {
          body: {
            company_id: companyId,
            job_id: job.id,
            replicate_id: job.replicate_id,
            replicate_get_url: job.replicate_get_url,
            effect_id: job.effect_id,
            aspect_ratio: job.aspect_ratio,
            duration_seconds: job.duration_seconds,
          },
        });

        if (error) continue; // network / auth error — retry next tick

        if (!data) continue;

        if (data.status === "succeeded" && data.video_url) {
          const updated: VideoJob = {
            ...job,
            status: "succeeded",
            video_url: data.video_url,
            media_id: data.media_id,
            predict_time_seconds: data.predict_time_seconds,
          };
          setJobs(prev => prev.map(j => j.id === job.id ? updated : j));
          opts?.onCompleted?.(updated);
          toast.success("🎬 Video pronto!", {
            description: `${job.effect_label ?? "Video AI"} — ${job.duration_seconds}s`,
          });
        } else if (data.status === "failed") {
          setJobs(prev => prev.map(j => j.id === job.id
            ? { ...j, status: "failed", error: data.error ?? "Generazione fallita" }
            : j));
          toast.error("Video non generato", { description: data.error ?? "Riprova." });
        } else if (data.status === "processing" && job.status !== "processing") {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "processing" } : j));
        }
      } catch { /* silently skip — retry next tick */ }
    }
  }, [companyId, jobs, opts]);

  // Start / stop polling based on active jobs
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === "pending" || j.status === "processing");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => { void pollActiveJobs(); }, POLL_INTERVAL_MS);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [jobs, pollActiveJobs]);

  // ── Start job ─────────────────────────────────────────────────────────────────

  const startJob = useCallback(async (input: StartJobInput): Promise<boolean> => {
    if (!companyId) { toast.error("Azienda non identificata"); return false; }

    if (input.mode === "img2vid" && !input.image_url) {
      toast.error("Carica un'immagine prima di generare il video");
      return false;
    }
    if (input.mode === "txt2vid" && (!input.prompt || input.prompt.length < 10)) {
      toast.error("Scrivi un prompt più dettagliato (min 10 caratteri)");
      return false;
    }

    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        job_id?: string;
        replicate_id?: string;
        replicate_get_url?: string;
        status?: string;
        cost_eur_cents_est?: number;
        error?: string;
        provider?: string;
        setup_steps?: string[];
      }>("ai-ads-video-generate", {
        body: {
          company_id: companyId,
          mode: input.mode,
          image_url: input.image_url,
          prompt: input.prompt,
          effect_id: input.effect_id,
          effect_motion: input.effect_motion,
          duration_seconds: input.duration_seconds ?? 5,
          aspect_ratio: input.aspect_ratio ?? "9:16",
        },
      });

      if (error) {
        toast.error("Errore avvio generazione", { description: error.message });
        return false;
      }

      if (data?.error === "provider_not_configured") {
        setSetupStatus("not_configured");
        return false;
      }

      if (data?.error) {
        toast.error("Errore generazione video", { description: data.error });
        return false;
      }

      if (!data?.replicate_id || !data?.job_id) {
        toast.error("Risposta edge function non valida");
        return false;
      }

      setSetupStatus("configured");

      const newJob: VideoJob = {
        id: data.job_id,
        replicate_id: data.replicate_id,
        replicate_get_url: data.replicate_get_url,
        status: "processing",
        mode: input.mode,
        effect_id: input.effect_id,
        effect_label: input.effect_label,
        effect_emoji: input.effect_emoji,
        input_image_url: input.image_url,
        prompt: input.prompt,
        aspect_ratio: input.aspect_ratio ?? "9:16",
        duration_seconds: input.duration_seconds ?? 5,
        cost_eur_cents_est: data.cost_eur_cents_est,
        started_at: Date.now(),
      };

      setJobs(prev => [newJob, ...prev].slice(0, MAX_JOBS_STORED));
      toast.success("🎬 Generazione avviata!", {
        description: `${input.effect_label ?? "Video AI"} · ${input.duration_seconds ?? 5}s — pronto in ~30-60s`,
      });
      return true;

    } catch (err) {
      toast.error("Errore generazione video", { description: String((err as Error).message ?? err) });
      return false;
    } finally {
      setIsStarting(false);
    }
  }, [companyId]);

  // ── Clear job ─────────────────────────────────────────────────────────────────

  const clearJob = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === "pending" || j.status === "processing"));
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const activeCount = jobs.filter(j => j.status === "pending" || j.status === "processing").length;
  const completedCount = jobs.filter(j => j.status === "succeeded").length;

  return {
    jobs,
    activeCount,
    completedCount,
    isStarting,
    setupStatus,
    startJob,
    clearJob,
    clearCompleted,
    setSetupStatus,
  };
}
