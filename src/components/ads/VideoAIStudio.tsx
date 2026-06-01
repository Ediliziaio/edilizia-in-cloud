/**
 * VideoAIStudio — Genera video brevi per Meta Reels / Stories / Feed.
 *
 * Ispirato a Higgsfield.ai: effect cards cinematici + jobs queue asincrona.
 *
 * Modalità:
 *   • img2vid — carica una foto del cantiere → la AI la anima (SVD)
 *   • txt2vid — scrivi cosa vuoi vedere → la AI lo genera da zero (MiniMax)
 *
 * Backend: Replicate API via edge functions ai-ads-video-generate + ai-ads-video-status.
 * Setup: l'admin deve inserire REPLICATE_API_TOKEN nei Supabase Secrets.
 */

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  Info,
  Loader2,
  Play,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useVideoAI, type VideoJob } from "@/hooks/useVideoAI";

// ─── Effect presets ───────────────────────────────────────────────────────────

interface Effect {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  motionPrompt: string;
  bgFrom: string;
  bgTo: string;
  category: "base" | "cantiere" | "cinematic";
}

const EFFECTS: Effect[] = [
  { id: "zoom-slow",    label: "Zoom lento",      emoji: "🔍", desc: "Avvicinati al soggetto",           motionPrompt: "ultra smooth slow zoom in, cinematic depth",                bgFrom: "#1e3a5f", bgTo: "#2563eb", category: "base"     },
  { id: "reveal",       label: "Reveal",           emoji: "✨", desc: "Svela la scena con stile",         motionPrompt: "slow pull back zoom out reveal, dramatic",                  bgFrom: "#4a1d96", bgTo: "#7c3aed", category: "base"     },
  { id: "drone-rise",   label: "Drone rise",       emoji: "🚁", desc: "Ascesa cinematografica",           motionPrompt: "drone camera slowly rising vertically, aerial construction view", bgFrom: "#0c4a6e", bgTo: "#0284c7", category: "cantiere" },
  { id: "dolly-in",     label: "Dolly forward",    emoji: "🎬", desc: "Entra nello spazio",               motionPrompt: "smooth dolly forward tracking into the space",              bgFrom: "#1c1917", bgTo: "#44403c", category: "cinematic"},
  { id: "pan-pan",      label: "Panoramica",       emoji: "🌄", desc: "Scorri da sinistra a destra",      motionPrompt: "smooth horizontal panoramic camera pan right",              bgFrom: "#064e3b", bgTo: "#059669", category: "base"     },
  { id: "before-after", label: "Prima/Dopo",       emoji: "↔️", desc: "Wipe prima e dopo lavori",         motionPrompt: "horizontal wipe transition revealing transformation, split screen", bgFrom: "#7c2d12", bgTo: "#ea580c", category: "cantiere" },
  { id: "float",        label: "Float up",         emoji: "☁️", desc: "Fluttuante verso l'alto",          motionPrompt: "gentle upward floating camera movement, soft drift",         bgFrom: "#312e81", bgTo: "#6366f1", category: "base"     },
  { id: "orbital",      label: "Orbital",          emoji: "🔄", desc: "Orbita attorno al soggetto",       motionPrompt: "slow orbital rotation around the subject",                  bgFrom: "#881337", bgTo: "#e11d48", category: "cinematic"},
  { id: "golden-hour",  label: "Golden hour",      emoji: "🌅", desc: "Luce dorata serale",               motionPrompt: "warm golden hour light rays, gentle slow drift, sunset glow", bgFrom: "#78350f", bgTo: "#d97706", category: "cantiere" },
  { id: "handheld",     label: "Handheld",         emoji: "📹", desc: "Camera a spalla, autentico",       motionPrompt: "authentic handheld camera movement, documentary feel",       bgFrom: "#134e4a", bgTo: "#0d9488", category: "base"     },
  { id: "cinematic",    label: "Cinematic",        emoji: "🎭", desc: "Tracking shot Hollywood",          motionPrompt: "cinematic tracking shot, anamorphic lens flare, film quality", bgFrom: "#0f172a", bgTo: "#334155", category: "cinematic"},
  { id: "construction", label: "Cantiere vivo",    emoji: "🏗️", desc: "Attività di costruzione",         motionPrompt: "dynamic construction site activity, workers moving, fast paced", bgFrom: "#365314", bgTo: "#65a30d", category: "cantiere" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(startedAt: number): string {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  // Force re-render every second
  useCallback(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [])();
  return <span>{formatElapsed(startedAt)}</span>;
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, onClear }: { job: VideoJob; onClear: () => void }) {
  const isActive = job.status === "pending" || job.status === "processing";
  const isDone = job.status === "succeeded";
  const isFailed = job.status === "failed";

  const effect = EFFECTS.find(e => e.id === job.effect_id);

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border transition-all",
      isDone ? "border-emerald-200 bg-white shadow-md" :
      isFailed ? "border-red-200 bg-red-50" :
      "border-slate-200 bg-white shadow-sm",
    )}>
      {/* Thumbnail / video */}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-900">
        {isDone && job.video_url ? (
          <video
            src={job.video_url}
            className="h-full w-full object-cover"
            loop
            muted
            playsInline
            autoPlay
            onMouseEnter={e => { void (e.currentTarget as HTMLVideoElement).play(); }}
          />
        ) : job.input_image_url ? (
          <img loading="lazy" src={job.input_image_url} alt="" className={cn("h-full w-full object-cover", isActive && "opacity-40")} />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${effect?.bgFrom ?? "#1e293b"}, ${effect?.bgTo ?? "#475569"})` }}
          >
            <span className="text-4xl opacity-60">{effect?.emoji ?? "🎬"}</span>
          </div>
        )}

        {/* Processing overlay */}
        {isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="mb-2 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <p className="text-xs font-semibold text-white">Generazione...</p>
            <p className="mt-0.5 text-[10px] text-white/60">
              <ElapsedTimer startedAt={job.started_at} />
            </p>
          </div>
        )}

        {/* Success badge */}
        {isDone && (
          <div className="absolute left-2 top-2">
            <Badge className="bg-emerald-500/90 text-white backdrop-blur-sm">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Pronto
            </Badge>
          </div>
        )}

        {/* Failed badge */}
        {isFailed && (
          <div className="absolute left-2 top-2">
            <Badge className="bg-red-500/90 text-white">Fallito</Badge>
          </div>
        )}

        {/* Close button */}
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/80"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Info footer */}
      <div className="space-y-1.5 p-2">
        <p className="truncate text-xs font-semibold text-slate-900">
          {effect?.emoji} {effect?.label ?? job.effect_id ?? "Video AI"}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[9px]">{job.duration_seconds}s</Badge>
          <Badge variant="outline" className="text-[9px]">{job.aspect_ratio}</Badge>
          {job.cost_eur_cents_est && (
            <Badge variant="outline" className="text-[9px] text-slate-500">~{(job.cost_eur_cents_est / 100).toFixed(2)}€</Badge>
          )}
        </div>

        {isDone && job.video_url && (
          <div className="flex gap-1 pt-1">
            <Button size="sm" className="h-7 flex-1 text-[11px]" asChild>
              <a href={job.video_url} download>
                <Download className="mr-1 h-3 w-3" /> Scarica
              </a>
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0"
              onClick={() => window.open(job.video_url!, "_blank")}>
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0"
              onClick={() => { void navigator.clipboard?.writeText(job.video_url!); toast.success("URL copiato"); }}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isFailed && (
          <p className="text-[10px] text-red-600">{job.error ?? "Generazione fallita"}</p>
        )}
      </div>
    </div>
  );
}

// ─── Setup guide ──────────────────────────────────────────────────────────────

function SetupGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Configura Video AI</p>
          <p className="text-sm text-slate-600">Serve REPLICATE_API_TOKEN — gratuito per iniziare</p>
        </div>
        <button type="button" onClick={onDismiss} className="ml-auto rounded-full p-1 hover:bg-violet-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <ol className="space-y-3">
        {[
          { n: 1, text: "Crea account su", link: "https://replicate.com", linkLabel: "replicate.com" },
          { n: 2, text: "Dashboard → Account → API Tokens → Create token" },
          { n: 3, text: "Supabase Dashboard → Settings → Secrets → aggiungi REPLICATE_API_TOKEN" },
          { n: 4, text: "Supabase Dashboard → Edge Functions → Riavvia ai-ads-video-generate e ai-ads-video-status" },
        ].map((step) => (
          <li key={step.n} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
              {step.n}
            </span>
            <span className="pt-0.5 text-sm text-slate-700">
              {step.text}{" "}
              {step.link && (
                <a href={step.link} target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-violet-600 underline">
                  {step.linkLabel}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-violet-200 bg-white/60 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <p className="text-[11px] text-slate-600">
          <strong>Costi:</strong> img2vid (foto animata) ~0.03€ · txt2vid (da testo) ~0.20€ per video.
          Replicate offre $5 di crediti gratuiti all'iscrizione.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  companyId: string | undefined;
  /** Lista di immagini già in libreria da poter riusare */
  libraryImages?: Array<{ id: string; name: string; public_url: string }>;
}

export function VideoAIStudio({ companyId, libraryImages = [] }: Props) {
  const qc = useQueryClient();

  const { jobs, activeCount, isStarting, setupStatus, startJob, clearJob, clearCompleted, setSetupStatus } =
    useVideoAI(companyId, {
      onCompleted: () => {
        qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
      },
    });

  // ── Input state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"img2vid" | "txt2vid">("img2vid");
  const [selectedEffect, setSelectedEffect] = useState<Effect>(EFFECTS[0]);
  const [duration, setDuration] = useState<3 | 5 | 8>(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [prompt, setPrompt] = useState("");

  // Image upload
  const [uploadedImage, setUploadedImage] = useState<{ url: string; file?: File } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "base" | "cantiere" | "cinematic">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image handling ─────────────────────────────────────────────────────────
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Formato non supportato"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Immagine troppo grande (max 15 MB)"); return; }
    const url = URL.createObjectURL(file);
    setUploadedImage({ url, file });
  }, []);

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const ok = await startJob({
      company_id: companyId!,
      mode,
      image_url: mode === "img2vid" ? uploadedImage?.url : undefined,
      prompt: mode === "txt2vid" ? prompt : `${selectedEffect.motionPrompt} — professional construction photography`,
      effect_id: selectedEffect.id,
      effect_label: selectedEffect.label,
      effect_emoji: selectedEffect.emoji,
      effect_motion: selectedEffect.motionPrompt,
      duration_seconds: duration,
      aspect_ratio: aspectRatio,
    });
    if (ok) {
      // Reset for next generation
      if (mode === "txt2vid") setPrompt("");
    }
  };

  const filteredEffects = categoryFilter === "all" ? EFFECTS : EFFECTS.filter(e => e.category === categoryFilter);

  const canGenerate = companyId && !isStarting &&
    (mode === "txt2vid" ? prompt.length >= 10 : !!uploadedImage);

  return (
    <div className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-500">
            <Clapperboard className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Video AI Studio</h2>
            <p className="text-[11px] text-slate-500">Foto → Reel · Testo → Video · Effetti cinematici</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge className="bg-rose-500 text-white">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {activeCount} in corso
            </Badge>
          )}
          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Beta</Badge>
        </div>
      </div>

      {/* ─── Setup guide ─────────────────────────────────────────────── */}
      {setupStatus === "not_configured" && (
        <SetupGuide onDismiss={() => setSetupStatus("unknown")} />
      )}

      {/* ─── Main studio card ────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5 space-y-5">

          {/* Mode tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            <button type="button"
              onClick={() => setMode("img2vid")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition",
                mode === "img2vid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              )}>
              <ImagePlus className="h-4 w-4" />
              Da immagine
            </button>
            <button type="button"
              onClick={() => setMode("txt2vid")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition",
                mode === "txt2vid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              )}>
              <Sparkles className="h-4 w-4" />
              Da testo
            </button>
          </div>

          {/* Input area */}
          {mode === "img2vid" ? (
            <div className="space-y-3">
              {!uploadedImage ? (
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleImageFile(f);
                    }}
                    className={cn(
                      "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
                      isDragging ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    )}>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <Upload className="h-6 w-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Trascina la foto del cantiere</p>
                      <p className="text-xs text-gray-500">JPG, PNG, WebP · max 15 MB</p>
                    </div>
                    {libraryImages.length > 0 && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setShowLibraryPicker(p => !p); }}
                        className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        Scegli da Libreria ({libraryImages.length})
                      </button>
                    )}
                  </button>

                  {/* Library picker */}
                  {showLibraryPicker && libraryImages.length > 0 && (
                    <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-gray-50 border border-gray-200 p-2">
                      {libraryImages.slice(0, 12).map(img => (
                        <button key={img.id} type="button"
                          onClick={() => { setUploadedImage({ url: img.public_url }); setShowLibraryPicker(false); }}
                          className="aspect-square overflow-hidden rounded-lg border border-gray-200 hover:border-orange-400">
                          <img loading="lazy" src={img.public_url} alt={img.name} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-xl">
                  <img loading="lazy" src={uploadedImage.url} alt="Selected" className="max-h-48 w-full object-cover" />
                  <button type="button" onClick={() => setUploadedImage(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                    <p className="text-xs font-medium text-white">L'AI animerà questa foto con l'effetto selezionato</p>
                  </div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrivi la scena</p>
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Es. Operaio installa nuove finestre in appartamento luminoso, Milano, mattina, luce naturale..."
                className="min-h-20 resize-none focus-visible:ring-orange-500"
              />
              {/* Quick prompts */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Ristrutturazione bagno prima e dopo, Milano",
                  "Cantiere edile drone view, tramonto",
                  "Serramenti premium installazione, interno luminoso",
                  "Tetto in costruzione, operai al lavoro",
                ].map(p => (
                  <button key={p} type="button" onClick={() => setPrompt(p)}
                    className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 hover:border-orange-400 hover:text-orange-600">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Effect picker ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Effetto cinematico</p>
              <div className="flex gap-1">
                {(["all", "base", "cantiere", "cinematic"] as const).map(c => (
                  <button key={c} type="button"
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium transition",
                      categoryFilter === c ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-800"
                    )}>
                    {c === "all" ? "Tutti" : c === "cantiere" ? "🏗️ Cantiere" : c === "cinematic" ? "🎭 Cinematic" : "Base"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {filteredEffects.map(effect => (
                <TooltipProvider key={effect.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSelectedEffect(effect)}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border-2 p-0 transition-all",
                          selectedEffect.id === effect.id
                            ? "border-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.4)] scale-105"
                            : "border-slate-800 hover:border-slate-600"
                        )}>
                        {/* Gradient background */}
                        <div
                          className="flex aspect-square flex-col items-center justify-center gap-1"
                          style={{ background: `linear-gradient(135deg, ${effect.bgFrom}, ${effect.bgTo})` }}>
                          <span className="text-xl">{effect.emoji}</span>
                          <span className="px-1 text-center text-[9px] font-semibold leading-tight text-white/90">
                            {effect.label}
                          </span>
                        </div>

                        {/* Selected ring */}
                        {selectedEffect.id === effect.id && (
                          <div className="absolute right-1 top-1">
                            <CheckCircle2 className="h-3 w-3 text-orange-400" />
                          </div>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-40">
                      <p className="font-semibold">{effect.label}</p>
                      <p className="text-xs opacity-80">{effect.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>

            {/* Selected effect info */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-lg">{selectedEffect.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">{selectedEffect.label}</p>
                <p className="truncate text-[10px] text-gray-500">{selectedEffect.desc}</p>
              </div>
            </div>
          </div>

          {/* ─── Duration + Format + Aspect ────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Durata</p>
              <div className="flex gap-1.5">
                {([3, 5, 8] as const).map(d => (
                  <button key={d} type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      "flex-1 rounded-lg border py-1.5 text-sm font-bold transition",
                      duration === d
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Formato</p>
              <div className="flex gap-1.5">
                {(["9:16", "1:1", "16:9"] as const).map(ar => (
                  <button key={ar} type="button"
                    onClick={() => setAspectRatio(ar)}
                    className={cn(
                      "flex-1 rounded-lg border py-1.5 text-[11px] font-bold transition",
                      aspectRatio === ar
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}>
                    {ar}
                    <span className="ml-0.5 hidden text-[9px] font-normal opacity-60 sm:inline">
                      {ar === "9:16" ? "Reel" : ar === "1:1" ? "Feed" : "YT"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Cost estimate + Generate button ─────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" /> ~30-60s generazione
              </span>
              <span>
                Costo stimato: {mode === "img2vid" ? "~0.03€" : "~0.20€"}
              </span>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={cn(
                "w-full rounded-xl py-5 text-base font-bold transition",
                canGenerate
                  ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white hover:from-orange-400 hover:to-rose-400 shadow-lg shadow-orange-500/25"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}>
              {isStarting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Avvio generazione...</>
              ) : (
                <><Film className="mr-2 h-5 w-5" /> Genera video AI</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Jobs queue ──────────────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Generazioni {activeCount > 0 && <span className="text-rose-500">({activeCount} in corso)</span>}
            </h3>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500"
              onClick={clearCompleted}>
              <Trash2 className="mr-1 h-3 w-3" /> Pulisci completate
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onClear={() => clearJob(job.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Empty state ─────────────────────────────────────────────── */}
      {jobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100">
              <Play className="h-7 w-7 text-rose-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">I video generati appariranno qui</p>
              <p className="mt-1 text-xs text-slate-500">
                Seleziona un effetto, carica una foto (o scrivi un prompt), e premi Genera.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> ~30-60s per video</span>
              <span>·</span>
              <span>Salvati in Libreria asset</span>
              <span>·</span>
              <span>Pronti per Meta Reels</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default VideoAIStudio;
