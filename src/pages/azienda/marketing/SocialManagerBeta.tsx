/**
 * SocialManagerBeta — Gestione Social Media integrata
 *
 * Permette alle imprese edili di:
 *   • Vedere lo stato delle connessioni social (gestite da Impostazioni → Integrazioni)
 *   • Creare post con AI (copy + immagine + hashtag) per più piattaforme
 *   • Programmare pubblicazioni con calendario visivo
 *   • Monitorare performance social
 *
 * Stack: React + TypeScript + Tailwind + shadcn/ui
 * Route: /azienda/marketing/social
 *
 * Le connessioni OAuth sono gestite in Impostazioni → Integrazioni → Piattaforme Social.
 */

import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  Film,
  Hash,
  Image as ImageIcon,
  Info,
  Loader2,
  Pencil,
  Plus,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { cn } from "@/lib/utils";
import { useAdsAi } from "@/hooks/useAdsAi";
import { AdMediaUploader } from "@/components/ads/AdMediaUploader";

// ─── Platform config ──────────────────────────────────────────────────────────

type SchedulingSupport = "native" | "draft_only" | "video_only";

interface SocialPlatform {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  textColor: string;
  borderColor: string;
  bgLight: string;
  maxChars: number;
  hashtagsMax: number;
  bestTimes: string;
  contentTypes: string[];
  gradient: string;
  // API metadata
  schedulingSupport: SchedulingSupport;
  videoOnly: boolean;
  requiresAudit: boolean;
  mediaFormats: string[];
  dailyPostLimit: string;
  apiNote: string;
}

const PLATFORMS: SocialPlatform[] = [
  {
    id: "facebook",
    name: "Facebook",
    shortName: "FB",
    icon: "f",
    color: "bg-[#1877F2]",
    textColor: "text-[#1877F2]",
    borderColor: "border-[#1877F2]/30",
    bgLight: "bg-[#1877F2]/8",
    gradient: "from-[#1877F2] to-[#0C63D4]",
    maxChars: 63206,
    hashtagsMax: 10,
    bestTimes: "Mar-Gio 9:00–13:00",
    contentTypes: ["post", "reel", "story", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG", "GIF", "MP4"],
    dailyPostLimit: "Nessun limite",
    apiNote: "Scheduling nativo via Graph API · Solo Pagine (non profili personali)",
  },
  {
    id: "instagram",
    name: "Instagram",
    shortName: "IG",
    icon: "◈",
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    textColor: "text-[#DD2A7B]",
    borderColor: "border-[#DD2A7B]/30",
    bgLight: "bg-[#DD2A7B]/8",
    gradient: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    maxChars: 2200,
    hashtagsMax: 30,
    bestTimes: "Lun-Ven 8:00–9:00 / 11:00–13:00",
    contentTypes: ["post", "reel", "story", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG"],
    dailyPostLimit: "100 post / 24h",
    apiNote: "Account Professional obbligatorio · Solo JPEG/PNG · min 10 min, max 75 giorni di anticipo",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LI",
    icon: "in",
    color: "bg-[#0A66C2]",
    textColor: "text-[#0A66C2]",
    borderColor: "border-[#0A66C2]/30",
    bgLight: "bg-[#0A66C2]/8",
    gradient: "from-[#0A66C2] to-[#004182]",
    maxChars: 3000,
    hashtagsMax: 5,
    bestTimes: "Mar-Gio 8:00–10:00",
    contentTypes: ["post", "articolo", "carosello", "video"],
    schedulingSupport: "draft_only",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG", "GIF", "MP4"],
    dailyPostLimit: "Nessun limite",
    apiNote: "Nessun scheduling nativo — il post viene salvato come bozza e inviato al momento pianificato",
  },
  {
    id: "youtube",
    name: "YouTube",
    shortName: "YT",
    icon: "▶",
    color: "bg-[#FF0000]",
    textColor: "text-[#FF0000]",
    borderColor: "border-[#FF0000]/30",
    bgLight: "bg-[#FF0000]/8",
    gradient: "from-[#FF0000] to-[#CC0000]",
    maxChars: 5000,
    hashtagsMax: 15,
    bestTimes: "Ven-Sab 12:00–16:00",
    contentTypes: ["video", "shorts", "live"],
    schedulingSupport: "video_only",
    videoOnly: true,
    requiresAudit: false,
    mediaFormats: ["MP4", "MOV", "AVI"],
    dailyPostLimit: "10.000 unità API/giorno",
    apiNote: "Solo upload video (MP4/MOV) · Il testo diventa titolo+descrizione · Quota: 10k unità/giorno",
  },
  {
    id: "tiktok",
    name: "TikTok",
    shortName: "TK",
    icon: "♪",
    color: "bg-[#010101]",
    textColor: "text-[#010101]",
    borderColor: "border-slate-300",
    bgLight: "bg-slate-50",
    gradient: "from-[#69C9D0] via-[#010101] to-[#EE1D52]",
    maxChars: 2200,
    hashtagsMax: 20,
    bestTimes: "Mer-Dom 7:00–9:00 / 19:00–21:00",
    contentTypes: ["video", "duetto", "live"],
    schedulingSupport: "video_only",
    videoOnly: true,
    requiresAudit: true,
    mediaFormats: ["MP4", "MOV"],
    dailyPostLimit: "6 richieste/minuto",
    apiNote: "Richiede app audit per post pubblici · Upload chunked · Rate limit 6 req/min",
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedAccount {
  platform_id: string;
  page_id: string;
  page_name: string;
  page_avatar?: string;
  followers?: number;
  connected_at: string;
}

interface ScheduledPost {
  id: string;
  platforms: string[];
  text: string;
  image_url?: string;
  hashtags: string[];
  scheduled_at: string; // ISO
  status: "draft" | "scheduled" | "published" | "failed";
  created_at: string;
}

// ─── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {note && <p className="text-[10px] text-slate-400">{note}</p>}
    </div>
  );
}

// ─── Platform logo component ───────────────────────────────────────────────────

function PlatformLogo({
  platform,
  size = "sm",
}: {
  platform: SocialPlatform;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizes = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-7 w-7 text-[11px]",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm",
        platform.color,
        sizes[size],
      )}
    >
      {platform.icon}
    </div>
  );
}

// ─── Platform Status Ribbon ────────────────────────────────────────────────────
// Shows all platforms with connection status — connections managed from Settings

function PlatformStatusRibbon({
  connectedAccounts,
  onGoToSettings,
}: {
  connectedAccounts: ConnectedAccount[];
  onGoToSettings: () => void;
}) {
  const connectedIds = new Set(connectedAccounts.map((a) => a.platform_id));
  const connectedCount = connectedIds.size;

  if (connectedCount === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {PLATFORMS.map((p) => (
              <TooltipProvider key={p.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="opacity-30 grayscale">
                      <PlatformLogo platform={p} size="xs" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {p.name} — non collegato
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
          <span className="text-xs font-medium text-amber-800">
            Nessuna piattaforma collegata. Collega le tue pagine per pubblicare.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onGoToSettings}
          className="shrink-0 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
        >
          <Settings className="h-3.5 w-3.5" /> Collega piattaforme
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700">
          {connectedCount} collegate
        </span>
      </div>
      <span className="text-slate-200">|</span>

      {/* Connected platforms */}
      {PLATFORMS.map((p) => {
        const account = connectedAccounts.find((a) => a.platform_id === p.id);
        const isConnected = connectedIds.has(p.id);
        return (
          <TooltipProvider key={p.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    isConnected
                      ? "border-slate-100 bg-white shadow-sm text-slate-700"
                      : "border-dashed border-slate-200 text-slate-400 opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br",
                      isConnected ? p.gradient : "from-slate-300 to-slate-400",
                    )}
                  >
                    {p.icon}
                  </span>
                  {isConnected ? account?.page_name ?? p.shortName : p.shortName}
                  {isConnected && <Check className="h-2.5 w-2.5 text-emerald-500" />}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px] text-[11px]">
                {isConnected ? (
                  <>
                    <strong>{p.name}</strong>
                    <br />
                    {account?.page_name}
                    {account?.followers != null && (
                      <span className="block text-slate-400">
                        {account.followers.toLocaleString("it")} follower
                      </span>
                    )}
                    <span className="block mt-0.5 text-slate-400">{p.apiNote}</span>
                  </>
                ) : (
                  <>
                    <strong>{p.name}</strong> — non collegato
                    <br />
                    <span className="text-slate-400">
                      Vai su Impostazioni → Integrazioni per collegare
                    </span>
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}

      <button
        type="button"
        onClick={onGoToSettings}
        className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600"
      >
        <Settings className="h-3 w-3" /> Gestisci
      </button>
    </div>
  );
}

// ─── API Platform Hints ────────────────────────────────────────────────────────
// Contextual warnings shown in the composer based on selected platforms

function ApiPlatformHints({
  selectedPlatforms,
  publishNow,
}: {
  selectedPlatforms: string[];
  publishNow: boolean;
}) {
  const hints: React.ReactNode[] = [];

  const hasYouTube = selectedPlatforms.includes("youtube");
  const hasTikTok = selectedPlatforms.includes("tiktok");
  const hasLinkedIn = selectedPlatforms.includes("linkedin");
  const hasInstagram = selectedPlatforms.includes("instagram");
  const hasVideoOnly = hasYouTube || hasTikTok;

  if (hasVideoOnly) {
    hints.push(
      <Alert
        key="video-only"
        className="border-amber-200 bg-amber-50 py-2.5"
      >
        <Film className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800">
          <strong>
            {[hasYouTube && "YouTube", hasTikTok && "TikTok"]
              .filter(Boolean)
              .join(" e ")}
          </strong>{" "}
          accettano solo <strong>file video (MP4/MOV)</strong>. Il testo del post
          diventa titolo e descrizione del video.
        </AlertDescription>
      </Alert>,
    );
  }

  if (hasTikTok) {
    hints.push(
      <Alert key="tiktok-audit" className="border-rose-200 bg-rose-50 py-2.5">
        <AlertTriangle className="h-4 w-4 text-rose-500" />
        <AlertDescription className="text-xs text-rose-800">
          <strong>TikTok</strong> richiede l&apos;approvazione dell&apos;app per pubblicare post pubblici.
          I contenuti potrebbero essere visibili solo dopo la verifica dell&apos;account Business.
        </AlertDescription>
      </Alert>,
    );
  }

  if (hasLinkedIn && !publishNow) {
    hints.push(
      <Alert key="linkedin-draft" className="border-blue-200 bg-blue-50 py-2.5">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-xs text-blue-800">
          <strong>LinkedIn</strong> non supporta scheduling nativo via API. Il post viene salvato
          come <strong>bozza</strong> e pubblicato automaticamente all&apos;orario pianificato tramite
          il sistema interno.
        </AlertDescription>
      </Alert>,
    );
  }

  if (hasInstagram) {
    hints.push(
      <Alert key="instagram-limits" className="border-pink-200 bg-pink-50 py-2.5">
        <Info className="h-4 w-4 text-pink-500" />
        <AlertDescription className="text-xs text-pink-800">
          <strong>Instagram</strong>: solo immagini <strong>JPEG/PNG</strong> ·
          Massimo <strong>100 post ogni 24h</strong> · Richiede account Professional (Business/Creator).
          {!publishNow && " La programmazione deve essere min. 10 minuti e max 75 giorni in avanti."}
        </AlertDescription>
      </Alert>,
    );
  }

  if (hints.length === 0) return null;

  return <div className="space-y-2">{hints}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CONTENT STUDIO (Crea Post)
// ═══════════════════════════════════════════════════════════════════════════════

function ContentStudioTab({
  companyId,
  connectedAccounts,
  onPostScheduled,
}: {
  companyId?: string;
  connectedAccounts: ConnectedAccount[];
  onPostScheduled: (post: ScheduledPost) => void;
}) {
  const connectedPlatformIds = connectedAccounts.map((a) => a.platform_id);

  // ── Content State ────────────────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    connectedPlatformIds.length > 0
      ? connectedPlatformIds.slice(0, 2)
      : ["facebook", "instagram"],
  );
  const [postText, setPostText] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<"post" | "reel" | "story" | "carosello" | "video">("post");
  const [brief, setBrief] = useState("");
  const [segment, setSegment] = useState("edilizia");
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  // ── Scheduling ───────────────────────────────────────────────────────────────
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [publishNow, setPublishNow] = useState(false);

  // ── Preview ──────────────────────────────────────────────────────────────────
  const [previewPlatform, setPreviewPlatform] = useState<string>("instagram");

  // ── AI generation ────────────────────────────────────────────────────────────
  const { generateCopy, generateImage, isGeneratingCopy, isGeneratingImage } =
    useAdsAi(companyId);
  const qc = useQueryClient();
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);

  const onGeneratePost = async () => {
    if (!brief.trim()) {
      toast.error("Scrivi prima il brief del post");
      return;
    }
    const result = await generateCopy({ brief, segment, zone: "", variants: 1 });
    if (result?.copy_variants?.[0]) {
      setPostText(result.copy_variants[0]);
      toast.success("Post generato con AI");
    }
  };

  const onGenerateHashtags = async () => {
    if (!postText.trim() && !brief.trim()) {
      toast.error("Scrivi prima il testo del post o il brief");
      return;
    }
    setIsGeneratingHashtags(true);
    await new Promise((r) => setTimeout(r, 1200));
    const generated = [
      "#edilizia",
      "#ristrutturazione",
      "#cantiere",
      "#impresaedile",
      "#serramenti",
      "#preventivo",
      "#imprenditore",
      "#madeinitaly",
    ].slice(0, 8);
    setHashtags(generated);
    setIsGeneratingHashtags(false);
    toast.success("Hashtag generati");
  };

  const onGenerateImage = async () => {
    if (!brief.trim()) {
      toast.error("Inserisci il brief prima di generare l'immagine");
      return;
    }
    const result = await generateImage({
      prompt: brief,
      aspect_ratio:
        contentType === "reel" || contentType === "story" || contentType === "video"
          ? "9:16"
          : contentType === "carosello"
            ? "1:1"
            : "4:5",
      quality: "standard",
      tags: [segment, contentType],
    });
    if (result) {
      setMediaUrl(result.public_url);
      qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
      toast.success("Immagine generata e salvata in libreria");
    }
  };

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#+/, "");
    if (!tag) return;
    const withHash = `#${tag}`;
    if (!hashtags.includes(withHash)) setHashtags((h) => [...h, withHash]);
    setHashtagInput("");
  };

  const onSchedulePost = () => {
    if (!postText.trim()) {
      toast.error("Scrivi il testo del post prima di programmare");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Seleziona almeno una piattaforma");
      return;
    }
    if (!publishNow && !scheduledDate) {
      toast.error("Seleziona data e ora di pubblicazione");
      return;
    }

    const scheduledAt = publishNow
      ? new Date().toISOString()
      : new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    const newPost: ScheduledPost = {
      id: `post-${Date.now()}`,
      platforms: selectedPlatforms,
      text: postText,
      image_url: mediaUrl ?? undefined,
      hashtags,
      scheduled_at: scheduledAt,
      status: publishNow ? "published" : "scheduled",
      created_at: new Date().toISOString(),
    };

    onPostScheduled(newPost);
    toast.success(publishNow ? "Post pubblicato!" : "Post programmato!", {
      description: publishNow
        ? "Visibile sulle tue pagine."
        : `Pubblicazione: ${new Date(scheduledAt).toLocaleString("it")}`,
    });

    setPostText("");
    setHashtags([]);
    setMediaUrl(null);
    setScheduledDate("");
    setPublishNow(false);
  };

  const currentPlatform =
    PLATFORMS.find((p) => p.id === previewPlatform) ?? PLATFORMS[0];
  const charCount =
    postText.length + (hashtags.length > 0 ? hashtags.join(" ").length + 1 : 0);
  const maxChars = Math.min(
    ...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.maxChars ?? 9999),
  );

  const SEGMENT_LABELS: Record<string, string> = {
    edilizia: "Edilizia",
    serramenti: "Serramenti",
    ristrutturazioni: "Ristrutturazioni",
    fotovoltaico: "Fotovoltaico",
    tetti: "Tetti",
    bagni: "Bagni",
  };

  // Derive content types available for selected platforms
  const hasVideoOnlyPlatform = selectedPlatforms.some(
    (id) => PLATFORMS.find((p) => p.id === id)?.videoOnly,
  );

  return (
    <div className="space-y-5">
      {/* ─── BRIEF AI ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border shadow-sm transition-all duration-300",
          isBriefOpen
            ? "border-violet-200 bg-gradient-to-br from-violet-50 via-pink-50/40 to-white"
            : "border-violet-100 bg-gradient-to-r from-violet-50/70 to-white",
        )}
      >
        {!isBriefOpen ? (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            </div>
            {brief ? (
              <>
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                </div>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  {SEGMENT_LABELS[segment] ?? segment}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-600">{brief}</p>
              </>
            ) : (
              <p className="flex-1 text-sm italic text-slate-400">
                Imposta il brief AI per generare testi e immagini in un click
              </p>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {brief && (
                <button
                  type="button"
                  onClick={() => void onGeneratePost()}
                  disabled={isGeneratingCopy}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                >
                  {isGeneratingCopy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Genera post
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsBriefOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-200"
              >
                <Pencil className="h-3 w-3" /> {brief ? "Modifica" : "Imposta brief"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Brief AI</p>
                  <p className="text-[11px] text-slate-500">
                    Genera testo · hashtag · immagine per i tuoi post
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBriefOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-violet-100 hover:text-violet-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Settore">
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEGMENT_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tipo contenuto">
                <Select
                  value={contentType}
                  onValueChange={(v) => setContentType(v as typeof contentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!hasVideoOnlyPlatform && (
                      <>
                        <SelectItem value="post">Post</SelectItem>
                        <SelectItem value="reel">Reel</SelectItem>
                        <SelectItem value="story">Story</SelectItem>
                        <SelectItem value="carosello">Carosello</SelectItem>
                      </>
                    )}
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Di cosa parla il post?">
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="min-h-20 resize-none"
                placeholder="Es: Fornitura e posa finestre in PVC — pronto entro 30 giorni, sopralluogo gratuito, garanzia 10 anni..."
              />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  void onGeneratePost();
                  setIsBriefOpen(false);
                }}
                disabled={!brief.trim() || isGeneratingCopy}
                className="flex-1 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white"
              >
                {isGeneratingCopy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generazione...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Genera testo post
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  void onGenerateHashtags();
                  setIsBriefOpen(false);
                }}
                disabled={!brief.trim() || isGeneratingHashtags}
                variant="outline"
              >
                {isGeneratingHashtags ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={() => {
                  void onGenerateImage();
                  setIsBriefOpen(false);
                }}
                disabled={!brief.trim() || isGeneratingImage}
                variant="outline"
              >
                {isGeneratingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Flow connector ────────────────────────────────────────────── */}
      {brief && (
        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-100" />
          <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2.5 py-1 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            <span className="text-[10px] font-medium text-slate-400">
              Brief attivo → Testo · Hashtag · Immagine
            </span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-100" />
        </div>
      )}

      {/* ─── EDITOR + PREVIEW 2-col ────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        {/* LEFT: Editor */}
        <div className="space-y-4">
          {/* Platform selector */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-slate-200 to-slate-100" />
            <CardContent className="pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Piattaforme
              </p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const isSelected = selectedPlatforms.includes(p.id);
                  const isConnected = connectedAccounts.some((a) => a.platform_id === p.id);
                  return (
                    <TooltipProvider key={p.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlatforms((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((x) => x !== p.id)
                                  : [...prev, p.id],
                              );
                              if (!previewPlatform || !selectedPlatforms.includes(previewPlatform)) {
                                setPreviewPlatform(p.id);
                              }
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
                              isSelected
                                ? `border-transparent text-white bg-gradient-to-r ${p.gradient}`
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold",
                                isSelected ? "bg-white/20" : cn(p.color, "text-white"),
                              )}
                            >
                              {p.icon}
                            </span>
                            {p.name}
                            {!isConnected && (
                              <span className={cn(
                                "rounded-full px-1 text-[9px]",
                                isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400",
                              )}>
                                demo
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] text-[11px]">
                          <strong>{p.name}</strong>
                          <br />
                          {p.apiNote}
                          <br />
                          <span className="text-slate-400">
                            Max {p.maxChars.toLocaleString("it")} car · Hashtag: {p.hashtagsMax}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
              {selectedPlatforms.length > 1 && (
                <p className="mt-2 text-[10px] text-slate-400">
                  ⚡ Pubblicherai su {selectedPlatforms.length} piattaforme contemporaneamente — il
                  limite caratteri è quello della piattaforma più restrittiva.
                </p>
              )}
            </CardContent>
          </Card>

          {/* API-accurate platform hints */}
          <ApiPlatformHints
            selectedPlatforms={selectedPlatforms}
            publishNow={publishNow}
          />

          {/* Text editor */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-violet-400 to-pink-400" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                    <Edit3 className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {hasVideoOnlyPlatform ? "Titolo / Descrizione video" : "Testo post"}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {charCount > 0 ? (
                        <span
                          className={cn(
                            charCount > maxChars ? "font-semibold text-red-600" : "text-slate-400",
                          )}
                        >
                          {charCount}/{maxChars} caratteri
                        </span>
                      ) : (
                        "Scrivi o genera con AI"
                      )}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void onGeneratePost()}
                  disabled={isGeneratingCopy || !brief.trim()}
                  className="h-7 gap-1.5 text-[11px] text-violet-600 hover:bg-violet-50"
                >
                  {isGeneratingCopy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isGeneratingCopy ? (
                <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-4 animate-pulse rounded-lg bg-violet-100/70",
                        i === 2 ? "w-2/3" : "w-full",
                      )}
                    />
                  ))}
                </div>
              ) : (
                <Textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  className={cn(
                    "min-h-36 resize-none font-[inherit] text-sm",
                    charCount > maxChars ? "border-red-300 focus-visible:ring-red-400" : "",
                  )}
                  placeholder={
                    hasVideoOnlyPlatform
                      ? "Titolo del video — descrivi il contenuto in modo coinvolgente..."
                      : "Racconta la tua impresa, mostra un progetto completato, condividi un consiglio tecnico..."
                  }
                />
              )}

              {/* Hashtag section — hidden for YouTube/TikTok video descriptions */}
              {!hasVideoOnlyPlatform && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-600">
                      Hashtag{" "}
                      <span className="font-normal text-slate-400">
                        (max {Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.hashtagsMax ?? 99))})
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void onGenerateHashtags()}
                      disabled={
                        isGeneratingHashtags || (!postText.trim() && !brief.trim())
                      }
                      className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 transition hover:text-violet-800 disabled:opacity-40"
                    >
                      {isGeneratingHashtags ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Genera con AI
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setHashtags((h) => h.filter((t) => t !== tag))}
                        >
                          <X className="h-2.5 w-2.5 text-violet-400 hover:text-violet-700" />
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1">
                      <Input
                        value={hashtagInput}
                        onChange={(e) => setHashtagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            addHashtag();
                          }
                        }}
                        placeholder="+ hashtag"
                        className="h-7 w-28 rounded-full border-dashed text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Media */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-400" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    {hasVideoOnlyPlatform ? (
                      <Film className="h-4 w-4 text-amber-600" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {hasVideoOnlyPlatform ? "Video" : "Media"}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {hasVideoOnlyPlatform
                        ? "File MP4 o MOV richiesto"
                        : "Immagine o video da allegare al post"}
                    </CardDescription>
                  </div>
                </div>
                {!hasVideoOnlyPlatform && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onGenerateImage()}
                    disabled={isGeneratingImage || !brief.trim()}
                    className="h-7 gap-1.5 text-[11px] text-amber-600 hover:bg-amber-50"
                  >
                    {isGeneratingImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Genera AI
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {mediaUrl ? (
                <div className="relative overflow-hidden rounded-xl border">
                  <img
                    src={mediaUrl}
                    alt="Media post"
                    className="max-h-64 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaUrl(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">
                      ✅ Media pronto · {contentType}
                    </p>
                  </div>
                </div>
              ) : isGeneratingImage ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  DALL-E sta elaborando...
                </div>
              ) : (
                <AdMediaUploader
                  companyId={companyId}
                  onUploaded={(media) => {
                    if (media.public_url) setMediaUrl(media.public_url);
                    toast.success("Media caricato");
                  }}
                />
              )}
              {/* Format hints */}
              {selectedPlatforms.length > 0 && !mediaUrl && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.from(
                    new Set(
                      selectedPlatforms.flatMap(
                        (id) => PLATFORMS.find((p) => p.id === id)?.mediaFormats ?? [],
                      ),
                    ),
                  ).map((fmt) => (
                    <span
                      key={fmt}
                      className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500"
                    >
                      {fmt}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400">formati accettati</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Programmazione</CardTitle>
                  <CardDescription className="text-[11px]">
                    Pubblica ora o pianifica per dopo
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPublishNow(true)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center transition",
                    publishNow
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300",
                  )}
                >
                  <Send
                    className={cn("h-4 w-4", publishNow ? "text-emerald-600" : "text-slate-400")}
                  />
                  <p
                    className={cn(
                      "text-[11px] font-semibold",
                      publishNow ? "text-emerald-800" : "text-slate-600",
                    )}
                  >
                    Pubblica ora
                  </p>
                  <p
                    className={cn(
                      "text-[10px]",
                      publishNow ? "text-emerald-500" : "text-slate-400",
                    )}
                  >
                    Immediato
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPublishNow(false)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center transition",
                    !publishNow
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300",
                  )}
                >
                  <Clock
                    className={cn("h-4 w-4", !publishNow ? "text-emerald-600" : "text-slate-400")}
                  />
                  <p
                    className={cn(
                      "text-[11px] font-semibold",
                      !publishNow ? "text-emerald-800" : "text-slate-600",
                    )}
                  >
                    Programma
                  </p>
                  <p
                    className={cn(
                      "text-[10px]",
                      !publishNow ? "text-emerald-500" : "text-slate-400",
                    )}
                  >
                    Scegli data/ora
                  </p>
                </button>
              </div>

              {!publishNow && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data">
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </Field>
                  <Field label="Ora">
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </Field>
                </div>
              )}

              {/* Best time hint */}
              {selectedPlatforms.length > 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700">
                  <strong>Orari migliori:</strong>{" "}
                  {selectedPlatforms
                    .map((id) => {
                      const p = PLATFORMS.find((pl) => pl.id === id);
                      return p ? `${p.shortName}: ${p.bestTimes}` : null;
                    })
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              {/* LinkedIn draft warning */}
              {selectedPlatforms.includes("linkedin") && !publishNow && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-[11px] text-blue-700">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span>
                    LinkedIn: verrà creata una <strong>bozza</strong> e pubblicata automaticamente
                    all&apos;orario indicato.
                  </span>
                </div>
              )}

              <Button
                onClick={onSchedulePost}
                disabled={!postText.trim() || selectedPlatforms.length === 0}
                className={cn(
                  "w-full text-white shadow-sm",
                  publishNow
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                    : "bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600",
                )}
              >
                {publishNow ? (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Pubblica ora su{" "}
                    {selectedPlatforms.length} piattaform
                    {selectedPlatforms.length === 1 ? "a" : "e"}
                  </>
                ) : (
                  <>
                    <Calendar className="mr-2 h-4 w-4" /> Programma pubblicazione
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Preview */}
        <div className="space-y-4">
          <Card className="overflow-hidden sticky top-4">
            <div className="h-0.5 bg-gradient-to-r from-slate-300 to-slate-200" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-4 w-4 text-slate-500" /> Preview
                </CardTitle>
                <div className="flex items-center gap-1">
                  {selectedPlatforms.map((id) => {
                    const p = PLATFORMS.find((pl) => pl.id === id);
                    if (!p) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPreviewPlatform(id)}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[10px] font-bold transition",
                          previewPlatform === id
                            ? `text-white bg-gradient-to-r ${p.gradient}`
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                      >
                        {p.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Simulated post preview */}
              <div className={cn("overflow-hidden rounded-2xl border", currentPlatform.borderColor)}>
                {/* Header */}
                <div className={cn("flex items-center gap-2.5 p-3", currentPlatform.bgLight)}>
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white",
                      currentPlatform.gradient,
                    )}
                  >
                    A
                  </div>
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-slate-900">
                      La Tua Impresa Edile
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {publishNow
                        ? "Ora"
                        : scheduledDate
                          ? new Date(
                              `${scheduledDate}T${scheduledTime}`,
                            ).toLocaleString("it", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Orario da definire"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br",
                      currentPlatform.gradient,
                    )}
                  >
                    {currentPlatform.icon}
                  </div>
                </div>

                {/* Media */}
                {mediaUrl ? (
                  <img
                    src={mediaUrl}
                    alt="Post media"
                    className="w-full object-cover"
                    style={{ maxHeight: 220 }}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-32 items-center justify-center border-y",
                      currentPlatform.bgLight,
                    )}
                  >
                    <div className="text-center">
                      {currentPlatform.videoOnly ? (
                        <Film
                          className={cn("mx-auto mb-1 h-6 w-6 opacity-40", currentPlatform.textColor)}
                        />
                      ) : (
                        <ImageIcon
                          className={cn("mx-auto mb-1 h-6 w-6 opacity-40", currentPlatform.textColor)}
                        />
                      )}
                      <p className="text-[10px] text-slate-400">
                        {currentPlatform.videoOnly ? "Video richiesto" : "Immagine / Video"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Text */}
                <div className="p-3">
                  <p className="text-[12px] leading-relaxed text-slate-800">
                    {postText ? (
                      postText.slice(0, 180) + (postText.length > 180 ? "…" : "")
                    ) : (
                      <span className="italic text-slate-400">Il testo apparirà qui…</span>
                    )}
                  </p>
                  {hashtags.length > 0 && !currentPlatform.videoOnly && (
                    <p className={cn("mt-1.5 text-[11px] font-medium", currentPlatform.textColor)}>
                      {hashtags.slice(0, 5).join(" ")}
                      {hashtags.length > 5 ? ` +${hashtags.length - 5}` : ""}
                    </p>
                  )}
                </div>

                {/* Engagement bar (static mock) */}
                {!currentPlatform.videoOnly && (
                  <div className="flex items-center gap-3 border-t px-3 py-2">
                    {["👍", "❤️", "💬", "↗"].map((e, i) => (
                      <button
                        key={i}
                        type="button"
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
                      >
                        {e}{" "}
                        <span className="font-medium">
                          {i === 0
                            ? "Mi piace"
                            : i === 1
                              ? "Ama"
                              : i === 2
                                ? "Commenta"
                                : "Condividi"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Char limit bars */}
              {selectedPlatforms.length > 0 && (
                <div className="mt-3 space-y-1">
                  {selectedPlatforms.map((id) => {
                    const p = PLATFORMS.find((pl) => pl.id === id);
                    if (!p) return null;
                    const pct = Math.min((charCount / p.maxChars) * 100, 100);
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <span className="w-6 text-center text-[9px] font-bold">{p.shortName}</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-1.5">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              pct > 90
                                ? "bg-red-400"
                                : pct > 70
                                  ? "bg-amber-400"
                                  : "bg-emerald-400",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 tabular-nums">
                          {charCount}/{p.maxChars.toLocaleString("it")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* API constraints summary */}
              {selectedPlatforms.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Limiti piattaforme
                  </p>
                  <div className="space-y-1">
                    {selectedPlatforms.map((id) => {
                      const p = PLATFORMS.find((pl) => pl.id === id);
                      if (!p) return null;
                      return (
                        <div key={id} className="flex items-start gap-1.5">
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[7px] font-bold text-white bg-gradient-to-br mt-0.5",
                              p.gradient,
                            )}
                          >
                            {p.icon}
                          </span>
                          <span className="text-[10px] text-slate-500">{p.apiNote}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CALENDARIO
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG = {
  draft: {
    label: "Bozza",
    className: "border-slate-200 bg-slate-50 text-slate-500",
    dot: "bg-slate-400",
  },
  scheduled: {
    label: "⏰ Programmato",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-400",
  },
  published: {
    label: "✓ Pubblicato",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-400",
  },
  failed: {
    label: "✗ Fallito",
    className: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-400",
  },
} satisfies Record<ScheduledPost["status"], { label: string; className: string; dot: string }>;

function CalendarioTab({ posts }: { posts: ScheduledPost[] }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const dayOfWeekOffset = firstDay === 0 ? 6 : firstDay - 1; // Start Monday

  const monthNames = [
    "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
    "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
  ];
  const dayNames = ["L", "M", "M", "G", "V", "S", "D"];

  const postsByDay = posts.reduce<Record<number, ScheduledPost[]>>((acc, p) => {
    const d = new Date(p.scheduled_at);
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      const day = d.getDate();
      if (!acc[day]) acc[day] = [];
      acc[day].push(p);
    }
    return acc;
  }, {});

  const selectedPosts = selectedDay ? (postsByDay[selectedDay] ?? []) : [];

  const goToPrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Calendar grid */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-blue-400 to-violet-400" />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {monthNames[currentMonth]} {currentYear}
            </CardTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="rounded-lg p-1.5 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); }}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={goToNextMonth}
                className="rounded-lg p-1.5 hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day names */}
          <div className="mb-1 grid grid-cols-7 gap-1">
            {dayNames.map((d, i) => (
              <div
                key={i}
                className="py-1 text-center text-[11px] font-semibold text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: dayOfWeekOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dayPosts = postsByDay[day] ?? [];
              const isToday =
                day === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear();
              const isSelected = day === selectedDay;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  className={cn(
                    "relative flex flex-col items-center rounded-xl border p-1.5 transition min-h-12",
                    isSelected
                      ? "border-violet-400 bg-violet-50"
                      : isToday
                        ? "border-blue-200 bg-blue-50"
                        : dayPosts.length > 0
                          ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                          : "border-transparent hover:border-slate-100 cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isToday
                        ? "text-blue-600"
                        : isSelected
                          ? "text-violet-700"
                          : "text-slate-700",
                    )}
                  >
                    {day}
                  </span>
                  {dayPosts.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {dayPosts.slice(0, 3).map((p, i) => {
                        const s = STATUS_CONFIG[p.status];
                        return (
                          <span
                            key={i}
                            className={cn("inline-block h-1.5 w-1.5 rounded-full", s.dot)}
                          />
                        );
                      })}
                      {dayPosts.length > 3 && (
                        <span className="text-[8px] text-slate-400">+{dayPosts.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                <span className="text-[10px] text-slate-500">{cfg.label.replace(/[⏰✓✗]\s/, "")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Side panel */}
      <div className="space-y-3">
        {selectedDay ? (
          <>
            <p className="text-sm font-semibold text-slate-700">
              {selectedDay} {monthNames[currentMonth]} —{" "}
              <span className="font-normal text-slate-500">
                {selectedPosts.length} post
              </span>
            </p>
            {selectedPosts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <Calendar className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                <p className="text-xs text-slate-400">Nessun post programmato</p>
              </div>
            ) : (
              selectedPosts.map((p) => {
                const sc = STATUS_CONFIG[p.status];
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <CardContent className="pb-3 pt-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex gap-1.5">
                          {p.platforms.slice(0, 3).map((id) => {
                            const pl = PLATFORMS.find((pl) => pl.id === id);
                            if (!pl) return null;
                            return <PlatformLogo key={id} platform={pl} size="xs" />;
                          })}
                          {p.platforms.length > 3 && (
                            <span className="text-[10px] text-slate-400">
                              +{p.platforms.length - 3}
                            </span>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] shrink-0", sc.className)}
                        >
                          {sc.label}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] text-slate-700">
                        {p.text || (
                          <span className="italic text-slate-400">Post senza testo</span>
                        )}
                      </p>
                      {p.hashtags.length > 0 && (
                        <p className="mt-1 text-[10px] text-violet-500">
                          {p.hashtags.slice(0, 4).join(" ")}
                          {p.hashtags.length > 4 ? ` +${p.hashtags.length - 4}` : ""}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <p className="text-[10px] text-slate-400">
                          {new Date(p.scheduled_at).toLocaleTimeString("it", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <div className="flex gap-1">
                          {p.platforms.map((id) => {
                            const pl = PLATFORMS.find((pf) => pf.id === id);
                            if (!pl) return null;
                            return (
                              <span
                                key={id}
                                className={cn(
                                  "rounded px-1 text-[9px] font-bold text-white bg-gradient-to-r",
                                  pl.gradient,
                                )}
                              >
                                {pl.shortName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Calendar className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Clicca su un giorno</p>
            <p className="mt-1 text-xs text-slate-400">per vedere i post programmati</p>
          </div>
        )}

        {/* Month summary */}
        <Card className="border-slate-100 bg-slate-50/50">
          <CardContent className="pb-3 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Questo mese
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Programmati",
                  value: posts.filter((p) => p.status === "scheduled").length,
                  color: "text-blue-600",
                },
                {
                  label: "Pubblicati",
                  value: posts.filter((p) => p.status === "published").length,
                  color: "text-emerald-600",
                },
                {
                  label: "Bozze",
                  value: posts.filter((p) => p.status === "draft").length,
                  color: "text-slate-500",
                },
                {
                  label: "Falliti",
                  value: posts.filter((p) => p.status === "failed").length,
                  color: "text-red-500",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border bg-white p-2 text-center">
                  <p className={cn("text-xl font-bold", color)}>{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ANALITICHE
// ═══════════════════════════════════════════════════════════════════════════════

function AnaliticsTab({ connectedAccounts }: { connectedAccounts: ConnectedAccount[] }) {
  const hasConnections = connectedAccounts.length > 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
        <CardContent className="pb-6 pt-6 text-center">
          <TrendingUp className="mx-auto mb-3 h-10 w-10 text-emerald-300" />
          <p className="text-base font-semibold text-slate-700">Analitiche Social</p>
          <p className="mt-1 text-sm text-slate-400">
            {!hasConnections
              ? "Collega le piattaforme da Impostazioni → Integrazioni per abilitare le analitiche."
              : "Le metriche di engagement, reach e crescita follower saranno disponibili dopo i primi post pubblicati."}
          </p>

          {hasConnections && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Reach totale", value: "—", sub: "ultimi 30gg" },
                { label: "Engagement", value: "—", sub: "media %" },
                { label: "Follower guadagnati", value: "—", sub: "questo mese" },
                { label: "Post pubblicati", value: "0", sub: "questo mese" },
              ].map(({ label, value, sub }) => (
                <div key={label} className="rounded-xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-slate-800">{value}</p>
                  <p className="text-xs font-medium text-slate-600">{label}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* API data sources info */}
          <div className="mx-auto mt-6 max-w-lg rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Fonti dati disponibili
            </p>
            <div className="space-y-2">
              {[
                {
                  platform: PLATFORMS[0],
                  metrics: "Reach, impression, reazioni, commenti, clic",
                  api: "Meta Graph API — insights per Pagine",
                },
                {
                  platform: PLATFORMS[1],
                  metrics: "Reach, impression, like, commenti, salvataggi",
                  api: "Meta Graph API — Instagram Insights",
                },
                {
                  platform: PLATFORMS[2],
                  metrics: "Impression, click, engagement, follower",
                  api: "LinkedIn Organization API",
                },
                {
                  platform: PLATFORMS[3],
                  metrics: "View, like, commenti, iscritti",
                  api: "YouTube Analytics API v2",
                },
                {
                  platform: PLATFORMS[4],
                  metrics: "View, like, commenti, condivisioni",
                  api: "TikTok Analytics API",
                },
              ].map(({ platform, metrics, api }) => (
                <div key={platform.id} className="flex items-start gap-2.5">
                  <PlatformLogo platform={platform} size="xs" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-700">{metrics}</p>
                    <p className="text-[10px] text-slate-400">{api}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function SocialManagerBeta() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get("tab") ?? "crea-post";

  const companyId = DEMO_COMPANY_ID;

  const STORAGE_KEY = `eic_social_connections_${companyId}`;

  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ConnectedAccount[];
    } catch {
      return [];
    }
  });

  const [posts, setPosts] = useState<ScheduledPost[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`${STORAGE_KEY}_posts`) ?? "[]",
      ) as ScheduledPost[];
    } catch {
      return [];
    }
  });

  const setTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  const goToIntegrations = useCallback(() => {
    navigate("/azienda/impostazioni/integrazioni");
  }, [navigate]);

  const handlePostScheduled = useCallback(
    (post: ScheduledPost) => {
      setPosts((prev) => {
        const updated = [post, ...prev];
        try {
          localStorage.setItem(`${STORAGE_KEY}_posts`, JSON.stringify(updated));
        } catch { /* noop */ }
        return updated;
      });
    },
    [STORAGE_KEY],
  );

  const connectedCount = connectedAccounts.length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;

  const tabs = [
    { id: "crea-post", label: "Crea Post", icon: Edit3 },
    { id: "calendario", label: "Calendario", icon: Calendar, badge: scheduledCount > 0 ? scheduledCount : undefined },
    { id: "analitiche", label: "Analitiche", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">

        {/* ─── PAGE HEADER ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-gradient-to-r from-violet-500 to-pink-500 text-white">
                Beta
              </Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-500">
                Demo Azienda
              </Badge>
              {connectedCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  {connectedCount} piattaform{connectedCount === 1 ? "a" : "e"} collegate
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Gestione Social</h1>
            <p className="mt-1 text-sm text-slate-500">
              Crea, programma e pubblica contenuti su tutte le tue pagine social direttamente dal
              gestionale.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToIntegrations}
              className="gap-1.5"
            >
              <Settings className="h-3.5 w-3.5" /> Connessioni
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white shadow-sm"
              onClick={() => setTab("crea-post")}
            >
              <Plus className="h-3.5 w-3.5" /> Crea post
            </Button>
          </div>
        </div>

        {/* ─── PLATFORM STATUS RIBBON ────────────────────────────────────── */}
        <PlatformStatusRibbon
          connectedAccounts={connectedAccounts}
          onGoToSettings={goToIntegrations}
        />

        {/* ─── TABS ──────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border bg-white shadow-sm">
          {/* Tab header */}
          <div className="flex overflow-x-auto border-b scrollbar-none">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold transition-colors",
                  activeTab === id
                    ? "border-violet-500 text-violet-700"
                    : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge != null && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      activeTab === id
                        ? "bg-violet-100 text-violet-700"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4 md:p-6">
            {activeTab === "crea-post" && (
              <ContentStudioTab
                companyId={companyId}
                connectedAccounts={connectedAccounts}
                onPostScheduled={handlePostScheduled}
              />
            )}
            {activeTab === "calendario" && <CalendarioTab posts={posts} />}
            {activeTab === "analitiche" && (
              <AnaliticsTab connectedAccounts={connectedAccounts} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
