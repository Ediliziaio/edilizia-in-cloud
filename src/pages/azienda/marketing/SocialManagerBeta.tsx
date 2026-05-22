/**
 * SocialManagerBeta — Gestione Social Media integrata
 *
 * Route: /azienda/marketing/social
 * Le connessioni OAuth sono gestite in Impostazioni → Integrazioni → Piattaforme Social.
 */

import { useState, useCallback, useRef, useEffect } from "react";
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
  Layers,
  Loader2,
  Pencil,
  Play,
  Plus,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
  Zap,
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

// ─── Platform config ───────────────────────────────────────────────────────────

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
  bestTimes: string[];
  contentTypes: string[];
  gradient: string;
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
    bestTimes: ["09:00", "13:00", "15:00"],
    contentTypes: ["post", "story", "reel", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG", "GIF", "MP4"],
    dailyPostLimit: "Nessun limite",
    apiNote: "Scheduling nativo via Graph API · Solo Pagine",
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
    bestTimes: ["08:00", "11:00", "19:00"],
    contentTypes: ["post", "story", "reel", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG"],
    dailyPostLimit: "100 post / 24h",
    apiNote: "Account Professional obbligatorio · Solo JPEG/PNG · min 10 min, max 75gg",
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
    bestTimes: ["08:00", "10:00", "12:00"],
    contentTypes: ["post", "carosello", "video"],
    schedulingSupport: "draft_only",
    videoOnly: false,
    requiresAudit: false,
    mediaFormats: ["JPEG", "PNG", "GIF", "MP4"],
    dailyPostLimit: "Nessun limite",
    apiNote: "No scheduling nativo — bozza + publish al momento pianificato",
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
    bestTimes: ["12:00", "15:00", "20:00"],
    contentTypes: ["video"],
    schedulingSupport: "video_only",
    videoOnly: true,
    requiresAudit: false,
    mediaFormats: ["MP4", "MOV", "AVI"],
    dailyPostLimit: "10.000 unità API/giorno",
    apiNote: "Solo video MP4/MOV · Testo = titolo+descrizione",
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
    bestTimes: ["07:00", "19:00", "21:00"],
    contentTypes: ["video"],
    schedulingSupport: "video_only",
    videoOnly: true,
    requiresAudit: true,
    mediaFormats: ["MP4", "MOV"],
    dailyPostLimit: "6 req/min",
    apiNote: "Richiede app audit · Upload chunked · Video obbligatorio",
  },
];

// ─── Content Type config ───────────────────────────────────────────────────────

interface ContentTypeConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  aspectRatio: string;          // for preview
  previewH: number;             // px height of preview frame
  previewW: number;
  supportedBy: string[];
  desc: string;
  hashtagsAllowed: boolean;
  maxDuration?: string;
  tips: string;
}

const CONTENT_TYPE_CONFIG: ContentTypeConfig[] = [
  {
    id: "post",
    label: "Post",
    icon: Edit3,
    aspectRatio: "4:5",
    previewH: 125,
    previewW: 100,
    supportedBy: ["facebook", "instagram", "linkedin"],
    desc: "Post nel feed",
    hashtagsAllowed: true,
    tips: "Il formato feed 4:5 è il più performante su Instagram — occupa più spazio e ha CTR maggiore.",
  },
  {
    id: "story",
    label: "Story",
    icon: Smartphone,
    aspectRatio: "9:16",
    previewH: 160,
    previewW: 90,
    supportedBy: ["facebook", "instagram"],
    desc: "Scompare dopo 24h",
    hashtagsAllowed: false,
    tips: "Le Stories hanno il 15-25% di engagement in più. Usa CTA diretti (\"Swipe up\", \"Rispondimi\"). Max 15 sec per slide.",
  },
  {
    id: "reel",
    label: "Reel",
    icon: Film,
    aspectRatio: "9:16",
    previewH: 160,
    previewW: 90,
    supportedBy: ["facebook", "instagram"],
    desc: "Video breve · max 90s",
    hashtagsAllowed: true,
    maxDuration: "90s",
    tips: "I Reel hanno reach organico 3x rispetto ai post foto. Inizia con hook nei primi 3 secondi.",
  },
  {
    id: "carosello",
    label: "Carosello",
    icon: Layers,
    aspectRatio: "1:1",
    previewH: 100,
    previewW: 100,
    supportedBy: ["facebook", "instagram", "linkedin"],
    desc: "Fino a 10 slide · swipe",
    hashtagsAllowed: true,
    tips: "I caroselli generano il doppio dei salvataggi rispetto ai post singoli. Usa la prima slide come 'copertina hook'.",
  },
  {
    id: "video",
    label: "Video",
    icon: Play,
    aspectRatio: "16:9",
    previewH: 90,
    previewW: 160,
    supportedBy: ["facebook", "instagram", "linkedin", "youtube", "tiktok"],
    desc: "Video lungo · tutti i canali",
    hashtagsAllowed: true,
    tips: "Per YouTube: titolo con keyword nei primi 40 caratteri. Per LinkedIn: i video nativi hanno 5x il reach rispetto ai link.",
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConnectedAccount {
  platform_id: string;
  page_id: string;
  page_name: string;
  followers?: number;
  connected_at: string;
}

interface ScheduledPost {
  id: string;
  platforms: string[];
  contentType: string;
  text: string;
  image_url?: string;
  hashtags: string[];
  firstComment?: string;
  scheduled_at: string;
  status: "draft" | "scheduled" | "published" | "failed";
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {note && <p className="text-[10px] text-slate-400">{note}</p>}
    </div>
  );
}

function PlatformLogo({ platform, size = "sm" }: { platform: SocialPlatform; size?: "xs" | "sm" | "md" | "lg" }) {
  const sizes = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm", platform.color, sizes[size])}>
      {platform.icon}
    </div>
  );
}

// ─── Platform Status Ribbon ────────────────────────────────────────────────────

function PlatformStatusRibbon({ connectedAccounts, onGoToSettings }: {
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
              <div key={p.id} className="opacity-30 grayscale">
                <PlatformLogo platform={p} size="xs" />
              </div>
            ))}
          </div>
          <span className="text-xs font-medium text-amber-800">
            Nessuna piattaforma collegata. Collega le tue pagine per pubblicare.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={onGoToSettings}
          className="shrink-0 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-50">
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
        <span className="text-xs font-semibold text-emerald-700">{connectedCount} collegate</span>
      </div>
      <span className="text-slate-200">|</span>
      {PLATFORMS.map((p) => {
        const account = connectedAccounts.find((a) => a.platform_id === p.id);
        const isConnected = connectedIds.has(p.id);
        return (
          <TooltipProvider key={p.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  isConnected ? "border-slate-100 bg-white shadow-sm text-slate-700" : "border-dashed border-slate-200 text-slate-400 opacity-50",
                )}>
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br", isConnected ? p.gradient : "from-slate-300 to-slate-400")}>{p.icon}</span>
                  {isConnected ? account?.page_name ?? p.shortName : p.shortName}
                  {isConnected && <Check className="h-2.5 w-2.5 text-emerald-500" />}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                {isConnected ? <>{account?.page_name}<br /><span className="text-slate-400">{p.apiNote}</span></> : `${p.name} — non collegato`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      <button type="button" onClick={onGoToSettings} className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
        <Settings className="h-3 w-3" /> Gestisci
      </button>
    </div>
  );
}

// ─── API Hints ─────────────────────────────────────────────────────────────────

function ApiPlatformHints({ selectedPlatforms, contentType, publishNow }: {
  selectedPlatforms: string[];
  contentType: string;
  publishNow: boolean;
}) {
  const hints: React.ReactNode[] = [];
  const hasYT = selectedPlatforms.includes("youtube");
  const hasTK = selectedPlatforms.includes("tiktok");
  const hasLI = selectedPlatforms.includes("linkedin");
  const hasIG = selectedPlatforms.includes("instagram");

  if (hasYT || hasTK) {
    hints.push(
      <Alert key="video-only" className="border-amber-200 bg-amber-50 py-2">
        <Film className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800">
          <strong>{[hasYT && "YouTube", hasTK && "TikTok"].filter(Boolean).join(" e ")}</strong>{" "}
          richiedono <strong>file video (MP4/MOV)</strong>. Carica il video nella sezione Media.
        </AlertDescription>
      </Alert>
    );
  }
  if (hasTK) {
    hints.push(
      <Alert key="tiktok" className="border-rose-200 bg-rose-50 py-2">
        <AlertTriangle className="h-4 w-4 text-rose-500" />
        <AlertDescription className="text-xs text-rose-800">
          <strong>TikTok</strong> richiede approvazione app prima della pubblicazione pubblica.
        </AlertDescription>
      </Alert>
    );
  }
  if (hasLI && !publishNow) {
    hints.push(
      <Alert key="linkedin" className="border-blue-200 bg-blue-50 py-2">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-xs text-blue-800">
          <strong>LinkedIn</strong>: nessun scheduling nativo — il post viene salvato come <strong>bozza</strong> e inviato all&apos;orario pianificato.
        </AlertDescription>
      </Alert>
    );
  }
  if (hasIG && contentType === "story") {
    hints.push(
      <Alert key="ig-story" className="border-pink-200 bg-pink-50 py-2">
        <Info className="h-4 w-4 text-pink-500" />
        <AlertDescription className="text-xs text-pink-800">
          <strong>Instagram Story</strong>: scompare dopo 24h · Solo JPEG/PNG o MP4 · Max 15s per clip · Nessun hashtag rilevante nelle Stories.
        </AlertDescription>
      </Alert>
    );
  }
  if (hints.length === 0) return null;
  return <div className="space-y-2">{hints}</div>;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: "Bozza",       dot: "bg-slate-400",   pill: "border-slate-200 bg-slate-50 text-slate-600",    calBg: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Programmato", dot: "bg-blue-400",    pill: "border-blue-200 bg-blue-50 text-blue-700",       calBg: "bg-blue-50 text-blue-700 border border-blue-100" },
  published: { label: "Pubblicato",  dot: "bg-emerald-400", pill: "border-emerald-200 bg-emerald-50 text-emerald-700", calBg: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  failed:    { label: "Fallito",     dot: "bg-red-400",     pill: "border-red-200 bg-red-50 text-red-700",           calBg: "bg-red-50 text-red-700 border border-red-100" },
} satisfies Record<ScheduledPost["status"], { label: string; dot: string; pill: string; calBg: string }>;

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CALENDARIO — redesign completo
// ═══════════════════════════════════════════════════════════════════════════════

const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES_SHORT = ["L","M","M","G","V","S","D"];
const DAY_NAMES_FULL  = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

function CalendarioTab({ posts, onNewPost }: { posts: ScheduledPost[]; onNewPost?: () => void }) {
  const today = new Date();
  const [view, setView]               = useState<"month" | "week">("month");
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [weekStart, setWeekStart]       = useState<Date>(() => {
    const d = new Date(today);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay]   = useState<string | null>(null); // "YYYY-MM-DD"
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);

  // Filtered posts
  const filteredPosts = filterPlatform
    ? posts.filter((p) => p.platforms.includes(filterPlatform))
    : posts;

  // Group by date key "YYYY-MM-DD"
  const postsByDate = filteredPosts.reduce<Record<string, ScheduledPost[]>>((acc, p) => {
    const key = new Date(p.scheduled_at).toISOString().split("T")[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const selectedPosts = selectedDay ? (postsByDate[selectedDay] ?? []) : [];

  // ── Month view helpers ─────────────────────────────────────────────────────
  const daysInMonth  = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayRaw  = new Date(currentYear, currentMonth, 1).getDay();
  const dayOffset    = firstDayRaw === 0 ? 6 : firstDayRaw - 1;

  const goMonthPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); } else setCurrentMonth((m) => m - 1); };
  const goMonthNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); } else setCurrentMonth((m) => m + 1); };

  // ── Week view helpers ──────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const TIME_SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];

  function postsForDateAndHour(date: Date, hour: string): ScheduledPost[] {
    const dateKey = date.toISOString().split("T")[0];
    return (postsByDate[dateKey] ?? []).filter((p) => {
      const h = new Date(p.scheduled_at).toTimeString().slice(0, 5);
      return h >= hour && h < `${String(parseInt(hour) + 1).padStart(2, "0")}:00`;
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const statsData = [
    { label: "Totale programmati", value: posts.filter((p) => p.status === "scheduled").length,  color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "Pubblicati",         value: posts.filter((p) => p.status === "published").length,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Bozze",             value: posts.filter((p) => p.status === "draft").length,       color: "text-slate-600",   bg: "bg-slate-50"   },
    { label: "Falliti",           value: posts.filter((p) => p.status === "failed").length,      color: "text-red-500",     bg: "bg-red-50"     },
    { label: "Piattaforme attive", value: new Set(posts.flatMap((p) => p.platforms)).size,       color: "text-violet-600",  bg: "bg-violet-50"  },
  ];

  // ── Upcoming posts (next 14 days) ──────────────────────────────────────────
  const upcomingPosts = [...posts]
    .filter((p) => {
      const d = new Date(p.scheduled_at);
      const diff = (d.getTime() - Date.now()) / 86400000;
      return diff > -1 && diff < 14 && p.status === "scheduled";
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statsData.map(({ label, value, color, bg }) => (
          <div key={label} className={cn("flex items-center gap-3 rounded-2xl border border-slate-100 p-3", bg)}>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
            <p className="text-[11px] leading-tight text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ── TOOLBAR ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
            {(["month","week"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cn("px-3.5 py-1.5 font-semibold transition",
                  view === v ? "bg-violet-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {v === "month" ? "Mese" : "Settimana"}
              </button>
            ))}
          </div>

          {/* Platform filter */}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setFilterPlatform(null)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                filterPlatform === null ? "border-violet-400 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
              Tutti
            </button>
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" onClick={() => setFilterPlatform(p.id === filterPlatform ? null : p.id)}
                className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  filterPlatform === p.id
                    ? `border-transparent text-white bg-gradient-to-r ${p.gradient}`
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
                <span className={cn("text-[9px]")}>{p.icon}</span>
                {p.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          {view === "month" ? (
            <>
              <button type="button" onClick={goMonthPrev} className="rounded-xl p-2 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[140px] text-center text-sm font-bold text-slate-800">{MONTH_NAMES[currentMonth]} {currentYear}</span>
              <button type="button" onClick={goMonthNext} className="rounded-xl p-2 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} className="rounded-xl p-2 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[200px] text-center text-sm font-bold text-slate-800">
                {weekDays[0].toLocaleDateString("it", { day:"2-digit", month:"short" })} — {weekDays[6].toLocaleDateString("it", { day:"2-digit", month:"short", year:"numeric" })}
              </span>
              <button type="button" onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="rounded-xl p-2 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
            </>
          )}
          <button type="button" onClick={() => {
            const now = new Date();
            setCurrentMonth(now.getMonth()); setCurrentYear(now.getFullYear());
            const d = new Date(now); const day = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - day); d.setHours(0,0,0,0);
            setWeekStart(d);
          }} className="ml-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
            Oggi
          </button>
        </div>
      </div>

      {/* ── CALENDAR BODY ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

        {/* MONTH VIEW */}
        {view === "month" && (
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400" />
            <CardContent className="p-3">
              {/* Day headers */}
              <div className="mb-1 grid grid-cols-7 gap-1">
                {DAY_NAMES_SHORT.map((d, i) => (
                  <div key={i} className="py-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: dayOffset }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayPosts = postsByDate[dateKey] ?? [];
                  const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                  const isSelected = dateKey === selectedDay;

                  return (
                    <button key={day} type="button"
                      onClick={() => setSelectedDay(dateKey === selectedDay ? null : dateKey)}
                      className={cn(
                        "group relative flex min-h-[72px] flex-col rounded-xl p-1.5 text-left transition",
                        isSelected ? "ring-2 ring-violet-400 bg-violet-50" : isToday ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50",
                      )}>
                      {/* Day number */}
                      <span className={cn(
                        "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                        isToday ? "bg-blue-500 text-white" : isSelected ? "bg-violet-500 text-white" : "text-slate-700",
                      )}>{day}</span>

                      {/* Post mini-cards */}
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {dayPosts.slice(0, 2).map((p, i) => {
                          const pl = PLATFORMS.find((pl) => pl.id === p.platforms[0]);
                          const sc = STATUS_CONFIG[p.status];
                          const ct = CONTENT_TYPE_CONFIG.find((c) => c.id === p.contentType);
                          const Icon = ct?.icon ?? Edit3;
                          return (
                            <div key={i} className={cn("flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate", sc.calBg)}>
                              <span className={cn("flex h-3 w-3 shrink-0 items-center justify-center rounded-sm text-[7px] font-bold text-white bg-gradient-to-br", pl?.gradient ?? "from-slate-300 to-slate-400")}>
                                {pl?.icon ?? "·"}
                              </span>
                              <span className="truncate">
                                {new Date(p.scheduled_at).toLocaleTimeString("it", { hour:"2-digit", minute:"2-digit" })}
                                {p.text ? ` · ${p.text.slice(0, 12)}…` : ""}
                              </span>
                            </div>
                          );
                        })}
                        {dayPosts.length > 2 && (
                          <div className="rounded px-1 py-0.5 text-[9px] font-semibold text-slate-400 bg-slate-100">
                            +{dayPosts.length - 2} altri
                          </div>
                        )}
                      </div>

                      {/* Add button on hover */}
                      {dayPosts.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 transition-opacity group-hover:opacity-100">
                          <Plus className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                    <span className="text-[10px] text-slate-500">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* WEEK VIEW */}
        {view === "week" && (
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400" />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  {/* Day headers */}
                  <div className="grid border-b" style={{ gridTemplateColumns: "56px repeat(7,1fr)" }}>
                    <div className="border-r" />
                    {weekDays.map((d, i) => {
                      const dateKey = d.toISOString().split("T")[0];
                      const dayPosts = postsByDate[dateKey] ?? [];
                      const isToday = d.toDateString() === today.toDateString();
                      return (
                        <div key={i} className={cn("flex flex-col items-center border-r py-2 last:border-r-0", isToday ? "bg-blue-50" : "")}>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{DAY_NAMES_FULL[i].slice(0,3)}</span>
                          <span className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold",
                            isToday ? "bg-blue-500 text-white" : "text-slate-700")}>
                            {d.getDate()}
                          </span>
                          {dayPosts.length > 0 && (
                            <span className="mt-0.5 rounded-full bg-violet-100 px-1.5 text-[9px] font-bold text-violet-700">{dayPosts.length}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Time rows */}
                  {TIME_SLOTS.map((hour) => (
                    <div key={hour} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "56px repeat(7,1fr)" }}>
                      <div className="flex items-start justify-center border-r pt-1.5">
                        <span className="text-[9px] font-medium text-slate-300">{hour}</span>
                      </div>
                      {weekDays.map((d, di) => {
                        const slotPosts = postsForDateAndHour(d, hour);
                        const isToday = d.toDateString() === today.toDateString();
                        return (
                          <div key={di} className={cn("min-h-[44px] border-r p-0.5 last:border-r-0", isToday ? "bg-blue-50/40" : "")}>
                            {slotPosts.map((p, pi) => {
                              const pl = PLATFORMS.find((pl) => pl.id === p.platforms[0]);
                              const sc = STATUS_CONFIG[p.status];
                              return (
                                <div key={pi} className={cn("mb-0.5 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight", sc.calBg)}>
                                  <div className="flex items-center gap-1">
                                    <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br", pl?.gradient)}>
                                      {pl?.icon}
                                    </span>
                                    <span className="font-semibold">
                                      {new Date(p.scheduled_at).toLocaleTimeString("it", { hour:"2-digit", minute:"2-digit" })}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-1 opacity-80">
                                    {p.text || "Post senza testo"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* RIGHT PANEL */}
        <div className="space-y-3">
          {selectedDay ? (
            /* Selected day detail */
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("it", { weekday:"long", day:"numeric", month:"long" })}
                </p>
                <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
              </div>
              {selectedPosts.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
                  <Calendar className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">Nessun post programmato</p>
                  <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onNewPost}>
                    <Plus className="h-3.5 w-3.5" /> Crea post per questo giorno
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPosts
                    .sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                    .map((p) => {
                      const sc = STATUS_CONFIG[p.status];
                      const ct = CONTENT_TYPE_CONFIG.find((c) => c.id === p.contentType);
                      return (
                        <Card key={p.id} className="overflow-hidden">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5">
                                {p.platforms.slice(0, 4).map((id) => {
                                  const pl = PLATFORMS.find((pl) => pl.id === id);
                                  if (!pl) return null;
                                  return (
                                    <span key={id} className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br", pl.gradient)}>
                                      {pl.icon}
                                    </span>
                                  );
                                })}
                                {ct && (
                                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                                    {ct.label}
                                  </span>
                                )}
                              </div>
                              <Badge variant="outline" className={cn("text-[9px] shrink-0 py-0", sc.pill)}>
                                {sc.label}
                              </Badge>
                            </div>
                            <p className="line-clamp-2 text-[12px] text-slate-700">
                              {p.text || <span className="italic text-slate-400">Nessun testo</span>}
                            </p>
                            {p.hashtags.length > 0 && (
                              <p className="mt-1 text-[10px] text-violet-500">
                                {p.hashtags.slice(0, 5).join(" ")}{p.hashtags.length > 5 ? ` +${p.hashtags.length - 5}` : ""}
                              </p>
                            )}
                            <p className="mt-1.5 text-[10px] font-semibold text-slate-400">
                              <Clock className="mr-1 inline h-2.5 w-2.5" />
                              {new Date(p.scheduled_at).toLocaleTimeString("it", { hour:"2-digit", minute:"2-digit" })}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </>
          ) : (
            /* Upcoming posts */
            <>
              <p className="text-sm font-bold text-slate-800">Prossimi 14 giorni</p>
              {upcomingPosts.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
                  <Zap className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">Nessun post in programma</p>
                  <p className="mt-1 text-xs text-slate-400">Inizia a pianificare i tuoi contenuti</p>
                  <Button size="sm" className="mt-3 gap-1.5 bg-gradient-to-r from-violet-500 to-pink-500 text-white" onClick={onNewPost}>
                    <Plus className="h-3.5 w-3.5" /> Crea il primo post
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingPosts.map((p) => {
                    const sc = STATUS_CONFIG[p.status];
                    const dateLabel = new Date(p.scheduled_at).toLocaleDateString("it", { weekday:"short", day:"numeric", month:"short" });
                    const timeLabel = new Date(p.scheduled_at).toLocaleTimeString("it", { hour:"2-digit", minute:"2-digit" });
                    return (
                      <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center gap-0.5 pt-0.5">
                          <span className={cn("h-2.5 w-2.5 rounded-full", sc.dot)} />
                          <div className="h-full w-px bg-slate-100" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            {p.platforms.slice(0,3).map((id) => {
                              const pl = PLATFORMS.find((pl) => pl.id === id);
                              if (!pl) return null;
                              return (
                                <span key={id} className={cn("flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br", pl.gradient)}>
                                  {pl.icon}
                                </span>
                              );
                            })}
                            <span className="text-[10px] text-slate-400">{dateLabel} · {timeLabel}</span>
                          </div>
                          <p className="line-clamp-1 text-[11px] font-medium text-slate-700">
                            {p.text || <span className="italic text-slate-400">Post senza testo</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={onNewPost}>
                    <Plus className="h-3.5 w-3.5" /> Aggiungi post
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Best times hint */}
          <Card className="border-slate-100 bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">⏰ Orari migliori per piattaforma</p>
              <div className="space-y-1.5">
                {PLATFORMS.slice(0,4).map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br", p.gradient)}>{p.icon}</span>
                    <div className="flex flex-wrap gap-1">
                      {p.bestTimes.map((t) => (
                        <span key={t} className="rounded-full border border-slate-100 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-600">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CONTENT STUDIO — redesign con Stories + multi-variant + content type cards
// ═══════════════════════════════════════════════════════════════════════════════

function ContentStudioTab({ companyId, connectedAccounts, onPostScheduled }: {
  companyId?: string;
  connectedAccounts: ConnectedAccount[];
  onPostScheduled: (post: ScheduledPost) => void;
}) {
  // ── Content type selection ─────────────────────────────────────────────────
  const [contentTypeId, setContentTypeId] = useState("post");
  const contentType = CONTENT_TYPE_CONFIG.find((c) => c.id === contentTypeId) ?? CONTENT_TYPE_CONFIG[0];

  // Filter platforms by content type
  const availablePlatforms = PLATFORMS.filter((p) => contentType.supportedBy.includes(p.id));

  // ── Platforms ──────────────────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["facebook", "instagram"]);

  // Auto-adjust selected platforms when content type changes
  useEffect(() => {
    setSelectedPlatforms((prev) => prev.filter((id) => contentType.supportedBy.includes(id)));
  }, [contentTypeId]);

  // ── Text / Copy ────────────────────────────────────────────────────────────
  const [postText, setPostText] = useState("");
  const [copyVariants, setCopyVariants] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [showFirstComment, setShowFirstComment] = useState(false);

  // ── Media ──────────────────────────────────────────────────────────────────
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  // ── Brief ─────────────────────────────────────────────────────────────────
  const [brief, setBrief] = useState("");
  const [segment, setSegment] = useState("edilizia");
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  // ── Scheduling ─────────────────────────────────────────────────────────────
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [publishNow, setPublishNow] = useState(false);

  // ── Preview ────────────────────────────────────────────────────────────────
  const [previewPlatform, setPreviewPlatform] = useState<string>("instagram");

  // ── AI ─────────────────────────────────────────────────────────────────────
  const { generateCopy, generateImage, isGeneratingCopy, isGeneratingImage } = useAdsAi(companyId);
  const qc = useQueryClient();
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);

  const SEGMENT_LABELS: Record<string, string> = {
    edilizia: "Edilizia",
    serramenti: "Serramenti",
    ristrutturazioni: "Ristrutturazioni",
    fotovoltaico: "Fotovoltaico",
    tetti: "Tetti",
    bagni: "Bagni",
  };

  const onGeneratePost = async () => {
    if (!brief.trim()) { toast.error("Scrivi prima il brief"); return; }
    const result = await generateCopy({ brief, segment, zone: "", variants: 3 });
    if (result?.copy_variants && result.copy_variants.length > 0) {
      setCopyVariants(result.copy_variants);
      if (!postText) setPostText(result.copy_variants[0]);
      toast.success(`${result.copy_variants.length} varianti generate — scegli quella che preferisci`);
    }
  };

  const onGenerateHashtags = async () => {
    if (!postText.trim() && !brief.trim()) { toast.error("Scrivi prima testo o brief"); return; }
    setIsGeneratingHashtags(true);
    await new Promise((r) => setTimeout(r, 1200));
    const maxH = Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.hashtagsMax ?? 30));
    const pool = ["#edilizia","#ristrutturazione","#cantiere","#impresaedile","#serramenti","#preventivo","#imprenditore","#madeinitaly","#costruzioni","#casaitaliana","#ristrutturazionecasa","#lavori","#artigiani","#impresa"];
    setHashtags(pool.slice(0, Math.min(8, maxH)));
    setIsGeneratingHashtags(false);
    toast.success("Hashtag generati");
  };

  const onGenerateImage = async () => {
    if (!brief.trim()) { toast.error("Inserisci il brief prima"); return; }
    const result = await generateImage({
      prompt: brief,
      aspect_ratio: contentType.aspectRatio as "9:16" | "1:1" | "4:5" | "16:9",
      quality: "standard",
      tags: [segment, contentTypeId],
    });
    if (result) {
      setMediaUrl(result.public_url);
      qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
      toast.success("Immagine generata");
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
    if (!postText.trim()) { toast.error("Scrivi il testo del post"); return; }
    if (selectedPlatforms.length === 0) { toast.error("Seleziona almeno una piattaforma"); return; }
    if (!publishNow && !scheduledDate) { toast.error("Seleziona la data di pubblicazione"); return; }

    const scheduledAt = publishNow
      ? new Date().toISOString()
      : new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    const newPost: ScheduledPost = {
      id: `post-${Date.now()}`,
      platforms: selectedPlatforms,
      contentType: contentTypeId,
      text: postText,
      image_url: mediaUrl ?? undefined,
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      firstComment: firstComment || undefined,
      scheduled_at: scheduledAt,
      status: publishNow ? "published" : "scheduled",
      created_at: new Date().toISOString(),
    };

    onPostScheduled(newPost);
    toast.success(publishNow ? "Post pubblicato!" : "Post programmato!", {
      description: publishNow ? "Visibile sulle tue pagine." : `Pubblicazione: ${new Date(scheduledAt).toLocaleString("it")}`,
    });
    setPostText(""); setHashtags([]); setMediaUrl(null); setScheduledDate(""); setPublishNow(false); setCopyVariants([]); setFirstComment(""); setShowFirstComment(false);
  };

  const currentPlatform = PLATFORMS.find((p) => p.id === previewPlatform) ?? PLATFORMS[0];
  const charCount = postText.length + (hashtags.length > 0 ? hashtags.join(" ").length + 1 : 0);
  const maxChars = selectedPlatforms.length > 0 ? Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.maxChars ?? 9999)) : 9999;
  const isStory = contentTypeId === "story";
  const isVideoType = contentTypeId === "reel" || contentTypeId === "video" || contentType.supportedBy.every((id) => PLATFORMS.find((p) => p.id === id)?.videoOnly);

  // Suggest optimal time based on selected platforms
  const suggestedTime = (() => {
    if (selectedPlatforms.length === 0) return null;
    const best = PLATFORMS.find((p) => p.id === selectedPlatforms[0]);
    return best?.bestTimes[0] ?? null;
  })();

  return (
    <div className="space-y-4">
      {/* ── CONTENT TYPE SELECTOR ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400" />
        <CardContent className="pt-4 pb-3">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Formato contenuto</p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPE_CONFIG.map((ct) => {
              const Icon = ct.icon;
              const isSelected = contentTypeId === ct.id;
              return (
                <TooltipProvider key={ct.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => setContentTypeId(ct.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-4 py-3 text-center transition-all",
                          isSelected
                            ? "border-violet-400 bg-gradient-to-br from-violet-50 to-pink-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30"
                        )}>
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl",
                          isSelected ? "bg-gradient-to-br from-violet-500 to-pink-500 text-white" : "bg-slate-100 text-slate-600"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className={cn("text-xs font-bold", isSelected ? "text-violet-700" : "text-slate-700")}>{ct.label}</span>
                        <span className="text-[9px] text-slate-400">{ct.desc}</span>
                        {/* Supported platforms */}
                        <div className="flex items-center gap-0.5">
                          {ct.supportedBy.map((id) => {
                            const p = PLATFORMS.find((p) => p.id === id);
                            if (!p) return null;
                            return (
                              <span key={id} className={cn("flex h-3.5 w-3.5 items-center justify-center rounded text-[7px] font-bold text-white bg-gradient-to-br", p.gradient)}>
                                {p.icon}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[220px] text-[11px]">
                      <strong>{ct.label}</strong> — {ct.aspectRatio}
                      <br />
                      {ct.tips}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
          {/* Tip for selected type */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-700">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span>{contentType.tips}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── BRIEF AI ────────────────────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden rounded-2xl border shadow-sm transition-all duration-300",
        isBriefOpen ? "border-violet-200 bg-gradient-to-br from-violet-50 via-pink-50/40 to-white" : "border-violet-100 bg-gradient-to-r from-violet-50/70 to-white"
      )}>
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
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{SEGMENT_LABELS[segment] ?? segment}</span>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-600">{brief}</p>
              </>
            ) : (
              <p className="flex-1 text-sm italic text-slate-400">Imposta il brief AI — genera testo e immagine in un click</p>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {brief && (
                <button type="button" onClick={() => void onGeneratePost()} disabled={isGeneratingCopy}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60">
                  {isGeneratingCopy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Genera varianti
                </button>
              )}
              <button type="button" onClick={() => setIsBriefOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-200">
                <Pencil className="h-3 w-3" /> {brief ? "Modifica" : "Imposta brief"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Brief AI</p>
                  <p className="text-[11px] text-slate-500">Genera 3 varianti di testo · hashtag · immagine</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsBriefOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-100 hover:text-violet-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Settore">
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEGMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Formato">
                <div className="flex h-9 items-center rounded-lg border border-input bg-slate-50 px-3 text-sm font-medium text-slate-600">
                  {contentType.label} · {contentType.aspectRatio}
                </div>
              </Field>
            </div>
            <Field label="Argomento del post">
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-16 resize-none"
                placeholder="Es: Fornitura e posa finestre PVC — pronto in 30 giorni, sopralluogo gratuito, garanzia 10 anni..." />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => { void onGeneratePost(); setIsBriefOpen(false); }}
                disabled={!brief.trim() || isGeneratingCopy}
                className="flex-1 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white">
                {isGeneratingCopy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generazione...</> : <><Sparkles className="mr-2 h-4 w-4" />Genera 3 varianti</>}
              </Button>
              {contentType.hashtagsAllowed && (
                <Button onClick={() => { void onGenerateHashtags(); setIsBriefOpen(false); }} disabled={!brief.trim() || isGeneratingHashtags} variant="outline">
                  {isGeneratingHashtags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                </Button>
              )}
              <Button onClick={() => { void onGenerateImage(); setIsBriefOpen(false); }} disabled={!brief.trim() || isGeneratingImage} variant="outline">
                {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN EDITOR + PREVIEW ─────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">

        {/* LEFT */}
        <div className="space-y-4">
          {/* Platform selector */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-slate-200 to-slate-100" />
            <CardContent className="pt-3 pb-3">
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.map((p) => {
                  const isSelected = selectedPlatforms.includes(p.id);
                  const isConnected = connectedAccounts.some((a) => a.platform_id === p.id);
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setSelectedPlatforms((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
                        isSelected ? `border-transparent text-white bg-gradient-to-r ${p.gradient}` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}>
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold", isSelected ? "bg-white/20" : cn(p.color, "text-white"))}>{p.icon}</span>
                      {p.name}
                      {!isConnected && <span className={cn("rounded-full px-1 text-[9px]", isSelected ? "bg-white/20" : "bg-slate-100 text-slate-400")}>demo</span>}
                    </button>
                  );
                })}
              </div>
              {availablePlatforms.length < PLATFORMS.length && (
                <p className="mt-2 text-[10px] text-slate-400">
                  Solo le piattaforme compatibili con <strong>{contentType.label}</strong> sono disponibili.
                </p>
              )}
            </CardContent>
          </Card>

          {/* API hints */}
          <ApiPlatformHints selectedPlatforms={selectedPlatforms} contentType={contentTypeId} publishNow={publishNow} />

          {/* Copy variants */}
          {copyVariants.length > 1 && (
            <Card className="overflow-hidden border-violet-200">
              <div className="h-0.5 bg-gradient-to-r from-violet-400 to-pink-400" />
              <CardContent className="pt-3 pb-3">
                <p className="mb-2 text-xs font-bold text-slate-700">
                  <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-violet-500" />
                  Scegli la variante che preferisci
                </p>
                <div className="space-y-2">
                  {copyVariants.map((v, i) => (
                    <button key={i} type="button" onClick={() => { setPostText(v); setCopyVariants([]); toast.success("Variante selezionata"); }}
                      className={cn(
                        "w-full rounded-xl border-2 p-3 text-left text-sm text-slate-700 transition hover:border-violet-300 hover:bg-violet-50",
                        postText === v ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"
                      )}>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-violet-400">Variante {i + 1}</span>
                      {v.slice(0, 120)}{v.length > 120 ? "…" : ""}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                      {isVideoType ? "Titolo / Descrizione" : isStory ? "Testo overlay (opzionale)" : "Testo post"}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {charCount > 0 ? (
                        <span className={cn(charCount > maxChars ? "font-semibold text-red-600" : "text-slate-400")}>
                          {charCount}/{maxChars.toLocaleString("it")} car.
                        </span>
                      ) : "Scrivi o genera con AI"}
                    </CardDescription>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void onGeneratePost()} disabled={isGeneratingCopy || !brief.trim()}
                  className="h-7 gap-1.5 text-[11px] text-violet-600 hover:bg-violet-50">
                  {isGeneratingCopy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isGeneratingCopy ? (
                <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                  {[...Array(3)].map((_, i) => <div key={i} className={cn("h-4 animate-pulse rounded-lg bg-violet-100/70", i === 2 ? "w-2/3" : "w-full")} />)}
                </div>
              ) : (
                <Textarea value={postText} onChange={(e) => setPostText(e.target.value)}
                  className={cn("min-h-28 resize-none font-[inherit] text-sm", charCount > maxChars ? "border-red-300 focus-visible:ring-red-400" : "")}
                  placeholder={isStory ? "Testo breve da sovrapporre alla Story (opzionale)..." : isVideoType ? "Titolo del video — sii specifico, usa keyword nei primi 40 caratteri..." : "Racconta la tua impresa, mostra un progetto completato, condividi un consiglio..."} />
              )}

              {/* Hashtags (hidden for Stories) */}
              {contentType.hashtagsAllowed && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-600">
                      Hashtag{selectedPlatforms.length > 0 && (
                        <span className="ml-1 font-normal text-slate-400">
                          (max {Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.hashtagsMax ?? 99))})
                        </span>
                      )}
                    </p>
                    <button type="button" onClick={() => void onGenerateHashtags()} disabled={isGeneratingHashtags || (!postText.trim() && !brief.trim())}
                      className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-40">
                      {isGeneratingHashtags ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                        {tag}
                        <button type="button" onClick={() => setHashtags((h) => h.filter((t) => t !== tag))}><X className="h-2.5 w-2.5 text-violet-400 hover:text-violet-700" /></button>
                      </span>
                    ))}
                    <div className="flex items-center">
                      <Input value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addHashtag(); } }}
                        placeholder="+ hashtag" className="h-7 w-24 rounded-full border-dashed text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {/* Instagram first comment */}
              {selectedPlatforms.includes("instagram") && contentType.hashtagsAllowed && (
                <div>
                  <button type="button" onClick={() => setShowFirstComment(!showFirstComment)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border-2 transition", showFirstComment ? "border-violet-400 bg-violet-400" : "border-slate-300")}>
                      {showFirstComment && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    Primo commento Instagram (hashtag estratti dal caption)
                  </button>
                  {showFirstComment && (
                    <Textarea value={firstComment} onChange={(e) => setFirstComment(e.target.value)}
                      className="mt-2 min-h-[60px] resize-none text-sm" placeholder="Aggiungi hashtag extra o CTA nel primo commento per non appesantire il caption..." />
                  )}
                </div>
              )}

              {/* Story-specific note */}
              {isStory && (
                <div className="flex items-start gap-2 rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-[11px] text-pink-700">
                  <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500" />
                  <span>Le Stories scompaiono dopo 24h · Usa testo breve e visual d&apos;impatto · Aggiungi un CTA chiaro (&quot;Scrivi per info&quot;, &quot;Link in bio&quot;)</span>
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
                    {isVideoType ? <Film className="h-4 w-4 text-amber-600" /> : isStory ? <Smartphone className="h-4 w-4 text-amber-600" /> : <ImageIcon className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div>
                    <CardTitle className="text-base">{isVideoType ? "Video" : `Immagine ${contentType.aspectRatio}`}</CardTitle>
                    <CardDescription className="text-[11px]">
                      {isStory ? "9:16 · Full screen · max 15s per clip" : isVideoType ? "MP4 / MOV richiesto" : `Proporzione consigliata: ${contentType.aspectRatio}`}
                    </CardDescription>
                  </div>
                </div>
                {!isVideoType && (
                  <Button size="sm" variant="ghost" onClick={() => void onGenerateImage()} disabled={isGeneratingImage || !brief.trim()}
                    className="h-7 gap-1.5 text-[11px] text-amber-600 hover:bg-amber-50">
                    {isGeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} AI
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {mediaUrl ? (
                <div className="relative overflow-hidden rounded-xl border">
                  <img src={mediaUrl} alt="Media" className="max-h-64 w-full object-cover" />
                  <button type="button" onClick={() => setMediaUrl(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="bg-slate-50 px-3 py-2"><p className="text-[11px] text-slate-500">✅ {contentType.label} · {contentType.aspectRatio}</p></div>
                </div>
              ) : isGeneratingImage ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
                  <Loader2 className="h-5 w-5 animate-spin" /> Generazione in corso...
                </div>
              ) : (
                <AdMediaUploader companyId={companyId} onUploaded={(media) => { if (media.public_url) setMediaUrl(media.public_url); toast.success("Media caricato"); }} />
              )}
              {/* Format hints */}
              {!mediaUrl && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.from(new Set(selectedPlatforms.flatMap((id) => PLATFORMS.find((p) => p.id === id)?.mediaFormats ?? []))).map((fmt) => (
                    <span key={fmt} className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">{fmt}</span>
                  ))}
                  {selectedPlatforms.length > 0 && <span className="text-[10px] text-slate-400">formati accettati</span>}
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
                  <CardDescription className="text-[11px]">Pubblica ora o pianifica per dopo</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <button type="button" onClick={() => setPublishNow(true)}
                  className={cn("flex flex-1 flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center transition",
                    publishNow ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300")}>
                  <Send className={cn("h-4 w-4", publishNow ? "text-emerald-600" : "text-slate-400")} />
                  <p className={cn("text-[11px] font-semibold", publishNow ? "text-emerald-800" : "text-slate-600")}>Pubblica ora</p>
                  <p className={cn("text-[10px]", publishNow ? "text-emerald-500" : "text-slate-400")}>Immediato</p>
                </button>
                <button type="button" onClick={() => setPublishNow(false)}
                  className={cn("flex flex-1 flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center transition",
                    !publishNow ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300")}>
                  <Clock className={cn("h-4 w-4", !publishNow ? "text-emerald-600" : "text-slate-400")} />
                  <p className={cn("text-[11px] font-semibold", !publishNow ? "text-emerald-800" : "text-slate-600")}>Programma</p>
                  <p className={cn("text-[10px]", !publishNow ? "text-emerald-500" : "text-slate-400")}>Scegli data/ora</p>
                </button>
              </div>

              {!publishNow && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Data">
                      <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
                    </Field>
                    <Field label="Ora">
                      <div className="flex gap-1.5">
                        <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="flex-1" />
                        {suggestedTime && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" onClick={() => setScheduledTime(suggestedTime)}
                                  className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                                  <Zap className="h-3 w-3" />{suggestedTime}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Orario ottimale per {PLATFORMS.find((p) => p.id === selectedPlatforms[0])?.name}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </Field>
                  </div>
                  {/* Best times */}
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700">
                    <strong>Orari migliori:</strong>{" "}
                    {selectedPlatforms.map((id) => {
                      const p = PLATFORMS.find((pl) => pl.id === id);
                      return p ? `${p.shortName}: ${p.bestTimes.join(", ")}` : null;
                    }).filter(Boolean).join(" · ")}
                  </div>
                  {/* LinkedIn draft note */}
                  {selectedPlatforms.includes("linkedin") && (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-[11px] text-blue-700">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span>LinkedIn: bozza → pubblicata automaticamente all&apos;orario indicato.</span>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={onSchedulePost} disabled={!postText.trim() || selectedPlatforms.length === 0}
                className={cn("w-full text-white shadow-sm",
                  publishNow ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                             : "bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600")}>
                {publishNow
                  ? <><Send className="mr-2 h-4 w-4" />Pubblica ora su {selectedPlatforms.length} piattaform{selectedPlatforms.length === 1 ? "a" : "e"}</>
                  : <><Calendar className="mr-2 h-4 w-4" />Programma pubblicazione</>}
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
                      <button key={id} type="button" onClick={() => setPreviewPlatform(id)}
                        className={cn("rounded-lg px-2 py-1 text-[10px] font-bold transition",
                          previewPlatform === id ? `text-white bg-gradient-to-r ${p.gradient}` : "text-slate-500 hover:bg-slate-100")}>
                        {p.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preview frame — changes shape based on content type */}
              <div className="flex justify-center">
                <div className={cn("relative overflow-hidden rounded-2xl border shadow-sm", currentPlatform.borderColor)}
                  style={{ width: contentType.previewW * 2, height: contentType.previewH * 2 }}>
                  {/* Story/Reel — fullscreen style */}
                  {(isStory || contentTypeId === "reel") ? (
                    <>
                      {mediaUrl ? (
                        <img src={mediaUrl} alt="Preview" className="h-full w-full object-cover" />
                      ) : (
                        <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", currentPlatform.gradient, "opacity-20")}>
                          <Smartphone className="h-10 w-10 text-slate-400" />
                        </div>
                      )}
                      {/* Story overlay */}
                      <div className="absolute inset-0 flex flex-col justify-between p-3">
                        {/* Top bar */}
                        <div className="flex items-center gap-1.5">
                          <div className={cn("h-1 flex-1 rounded-full opacity-60 bg-gradient-to-r", currentPlatform.gradient)} />
                          <div className="h-1 flex-1 rounded-full bg-white/30" />
                          <div className="h-1 flex-1 rounded-full bg-white/30" />
                        </div>
                        {/* Bottom text overlay */}
                        {postText && (
                          <div className="rounded-xl bg-black/50 p-2">
                            <p className="text-[10px] font-semibold leading-tight text-white">{postText.slice(0, 80)}</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Feed / normal preview */
                    <>
                      {/* Header */}
                      <div className={cn("flex items-center gap-2 p-2", currentPlatform.bgLight)}>
                        <div className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[8px] font-bold text-white", currentPlatform.gradient)}>A</div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-[10px] font-semibold text-slate-900">La Tua Impresa</p>
                          <p className="text-[8px] text-slate-400">
                            {publishNow ? "Ora" : scheduledDate ? new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString("it", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—"}
                          </p>
                        </div>
                      </div>
                      {/* Media */}
                      {mediaUrl ? (
                        <img src={mediaUrl} alt="Post media" className="w-full object-cover" style={{ height: contentType.previewH }} />
                      ) : (
                        <div className={cn("flex items-center justify-center border-y", currentPlatform.bgLight)} style={{ height: contentType.previewH }}>
                          <ImageIcon className={cn("h-6 w-6 opacity-30", currentPlatform.textColor)} />
                        </div>
                      )}
                      {/* Caption */}
                      <div className="p-2">
                        <p className="text-[10px] leading-relaxed text-slate-800">
                          {postText ? postText.slice(0, 100) + (postText.length > 100 ? "…" : "") : <span className="italic text-slate-400">Testo qui…</span>}
                        </p>
                        {hashtags.length > 0 && <p className={cn("mt-1 text-[9px] font-medium", currentPlatform.textColor)}>{hashtags.slice(0,4).join(" ")}</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Char bars */}
              {selectedPlatforms.length > 0 && !isStory && (
                <div className="space-y-1">
                  {selectedPlatforms.map((id) => {
                    const p = PLATFORMS.find((pl) => pl.id === id);
                    if (!p) return null;
                    const pct = Math.min((charCount / p.maxChars) * 100, 100);
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <span className="w-6 text-center text-[9px] font-bold">{p.shortName}</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-1.5">
                          <div className={cn("h-full rounded-full transition-all", pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-400 tabular-nums">{charCount}/{p.maxChars.toLocaleString("it")}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* API limits summary */}
              {selectedPlatforms.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Vincoli API</p>
                  <div className="space-y-1">
                    {selectedPlatforms.map((id) => {
                      const p = PLATFORMS.find((pl) => pl.id === id);
                      if (!p) return null;
                      return (
                        <div key={id} className="flex items-start gap-1.5">
                          <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[7px] font-bold text-white bg-gradient-to-br mt-0.5", p.gradient)}>{p.icon}</span>
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
// TAB: ANALITICHE
// ═══════════════════════════════════════════════════════════════════════════════

function AnaliticsTab({ connectedAccounts }: { connectedAccounts: ConnectedAccount[] }) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
        <CardContent className="pb-6 pt-6 text-center">
          <TrendingUp className="mx-auto mb-3 h-10 w-10 text-emerald-300" />
          <p className="text-base font-semibold text-slate-700">Analitiche Social</p>
          <p className="mt-1 text-sm text-slate-400">
            {connectedAccounts.length === 0
              ? "Collega le piattaforme da Impostazioni → Integrazioni per abilitare le analitiche."
              : "Le metriche saranno disponibili dopo i primi post pubblicati."}
          </p>
          {connectedAccounts.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[{ label: "Reach totale", value: "—", sub: "ultimi 30gg" }, { label: "Engagement", value: "—", sub: "media %" }, { label: "Follower guadagnati", value: "—", sub: "questo mese" }, { label: "Post pubblicati", value: "0", sub: "questo mese" }].map(({ label, value, sub }) => (
                <div key={label} className="rounded-xl border bg-white p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-slate-800">{value}</p>
                  <p className="text-xs font-medium text-slate-600">{label}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
              ))}
            </div>
          )}
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
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ConnectedAccount[]; } catch { return []; }
  });

  const [posts, setPosts] = useState<ScheduledPost[]>(() => {
    try { return JSON.parse(localStorage.getItem(`${STORAGE_KEY}_posts`) ?? "[]") as ScheduledPost[]; } catch { return []; }
  });

  const setTab = (tab: string) => setSearchParams({ tab }, { replace: true });
  const goToIntegrations = useCallback(() => navigate("/azienda/impostazioni/integrazioni"), [navigate]);

  const handlePostScheduled = useCallback((post: ScheduledPost) => {
    setPosts((prev) => {
      const updated = [post, ...prev];
      try { localStorage.setItem(`${STORAGE_KEY}_posts`, JSON.stringify(updated)); } catch { /* noop */ }
      return updated;
    });
  }, [STORAGE_KEY]);

  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;

  const tabs = [
    { id: "crea-post",  label: "Crea Post",  icon: Edit3      },
    { id: "calendario", label: "Calendario", icon: Calendar,   badge: scheduledCount > 0 ? scheduledCount : undefined },
    { id: "analitiche", label: "Analitiche", icon: TrendingUp  },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">

        {/* ─── PAGE HEADER ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-gradient-to-r from-violet-500 to-pink-500 text-white">Beta</Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-500">Demo Azienda</Badge>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Gestione Social</h1>
            <p className="mt-1 text-sm text-slate-500">Crea, programma e pubblica contenuti su tutte le tue pagine social.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={goToIntegrations} className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Connessioni
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white shadow-sm"
              onClick={() => setTab("crea-post")}>
              <Plus className="h-3.5 w-3.5" /> Crea post
            </Button>
          </div>
        </div>

        {/* ─── PLATFORM RIBBON ─────────────────────────────────────────── */}
        <PlatformStatusRibbon connectedAccounts={connectedAccounts} onGoToSettings={goToIntegrations} />

        {/* ─── TABS ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b scrollbar-none">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold transition-colors",
                  activeTab === id ? "border-violet-500 text-violet-700" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
                <Icon className="h-4 w-4" />
                {label}
                {badge != null && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    activeTab === id ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600")}>{badge}</span>
                )}
              </button>
            ))}
          </div>
          <div className="p-4 md:p-6">
            {activeTab === "crea-post" && (
              <ContentStudioTab companyId={companyId} connectedAccounts={connectedAccounts} onPostScheduled={handlePostScheduled} />
            )}
            {activeTab === "calendario" && (
              <CalendarioTab posts={posts} onNewPost={() => setTab("crea-post")} />
            )}
            {activeTab === "analitiche" && (
              <AnaliticsTab connectedAccounts={connectedAccounts} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
