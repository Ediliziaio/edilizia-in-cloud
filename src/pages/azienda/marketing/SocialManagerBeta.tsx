/**
 * SocialManagerBeta — Gestione Social Media integrata
 *
 * Route: /azienda/marketing/social
 * Le connessioni OAuth sono gestite in Impostazioni → Integrazioni → Piattaforme Social.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Film,
  Hash,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Layers,
  Library,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Send,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
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
import { useAuthCompany } from "@/contexts/AuthContext";
import { AdMediaUploader } from "@/components/ads/AdMediaUploader";
import { useSocialManagerData } from "@/hooks/useSocialManagerData";
import {
  parseSocialBulkCsv,
  SOCIAL_LIVE_PUBLISHING_ENABLED,
  validateSocialDraft,
  type SocialBulkPost,
} from "@/lib/social/publishing";
import { getSocialMediaPreviewUrl } from "@/lib/social/storage";
import type { SocialConnectedAccount, SocialMediaItem, SocialScheduledPost } from "@/lib/social/types";

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
  minScheduleDelayMinutes?: number;
  maxScheduleDays?: number;
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
    minScheduleDelayMinutes: 10,
    maxScheduleDays: 75,
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

// ─── Content Pillars ───────────────────────────────────────────────────────────

interface ContentPillar {
  id: string;
  label: string;
  emoji: string;
  color: string;          // tailwind bg (active)
  colorText: string;      // tailwind text
  colorBorder: string;    // tailwind border
  colorBg: string;        // light bg
  description: string;
  hashtags: string[];
  promptHint: string;
  suggestedContentType: string;
  weeklyFreq: number;
}

const CONTENT_PILLARS: ContentPillar[] = [
  {
    id: "cantiere",
    label: "Cantiere",
    emoji: "🏗️",
    color: "bg-sky-500",
    colorText: "text-sky-700",
    colorBorder: "border-sky-300",
    colorBg: "bg-sky-50",
    description: "Lavori in corso, progress, before/after",
    hashtags: ["#cantiere", "#lavoriincorso", "#costruzioni", "#impresaedile", "#realizzazioni"],
    promptHint: "Mostra i lavori in corso nel cantiere, racconta il progresso, prima e dopo i lavori.",
    suggestedContentType: "post",
    weeklyFreq: 3,
  },
  {
    id: "team",
    label: "Team",
    emoji: "👷",
    color: "bg-amber-500",
    colorText: "text-amber-700",
    colorBorder: "border-amber-300",
    colorBg: "bg-amber-50",
    description: "Il tuo team, storia, dietro le quinte",
    hashtags: ["#teamwork", "#artigiani", "#impresaedile", "#squadra", "#lavorecedilepassione"],
    promptHint: "Presenta il team di lavoro, racconta la storia e la passione dei tuoi collaboratori.",
    suggestedContentType: "reel",
    weeklyFreq: 1,
  },
  {
    id: "testimonianza",
    label: "Testimonianza",
    emoji: "⭐",
    color: "bg-emerald-500",
    colorText: "text-emerald-700",
    colorBorder: "border-emerald-300",
    colorBg: "bg-emerald-50",
    description: "Clienti soddisfatti, recensioni, referenze",
    hashtags: ["#clientisoddisfatti", "#recensioni", "#lavorifiniti", "#qualita", "#fiducia"],
    promptHint: "Condividi la testimonianza di un cliente soddisfatto, i risultati ottenuti e perché ti ha scelto.",
    suggestedContentType: "post",
    weeklyFreq: 1,
  },
  {
    id: "educational",
    label: "Educational",
    emoji: "📚",
    color: "bg-orange-500",
    colorText: "text-orange-700",
    colorBorder: "border-orange-300",
    colorBg: "bg-orange-50",
    description: "Consigli pratici, normative, FAQ",
    hashtags: ["#consigliutili", "#edilizia", "#sapevi", "#normative", "#guidapratica"],
    promptHint: "Condividi un consiglio pratico, spiega una normativa edilizia o rispondi a una domanda frequente dei clienti.",
    suggestedContentType: "carousel",
    weeklyFreq: 2,
  },
  {
    id: "promo",
    label: "Promo",
    emoji: "🎯",
    color: "bg-red-500",
    colorText: "text-red-700",
    colorBorder: "border-red-300",
    colorBg: "bg-red-50",
    description: "Offerte, promozioni stagionali, preventivi",
    hashtags: ["#offerta", "#preventivogratuito", "#promozione", "#sconto", "#chiediilpreventivo"],
    promptHint: "Promuovi un'offerta speciale o una promozione stagionale, invita a richiedere un preventivo gratuito.",
    suggestedContentType: "story",
    weeklyFreq: 1,
  },
  {
    id: "portfolio",
    label: "Portfolio",
    emoji: "✨",
    color: "bg-violet-500",
    colorText: "text-violet-700",
    colorBorder: "border-violet-300",
    colorBg: "bg-violet-50",
    description: "Progetti completati, before & after",
    hashtags: ["#portfolio", "#progettorealizzato", "#ristrutturazione", "#risultati", "#primadopo"],
    promptHint: "Mostra un progetto completato con le foto del risultato finale, descrivi il lavoro svolto e il valore creato.",
    suggestedContentType: "carousel",
    weeklyFreq: 2,
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type ConnectedAccount = SocialConnectedAccount;
type ScheduledPost = SocialScheduledPost;
type MediaItem = SocialMediaItem;

// ─── Demo analytics data ───────────────────────────────────────────────────────

const DEMO_ANALYTICS = {
  period: "Maggio 2026",
  overview: {
    reach:       { value: 12_430, change: 18.2 },
    impressions: { value: 48_920, change: 22.1 },
    engagement:  { value: 4.8,   change: 0.6  },
    followers:   { value: 127,   change: 12.4 },
  },
  byPlatform: [
    { id: "instagram", reach: 7_240, impressions: 28_410, engagement: 6.2, followerGain: 84,  posts: 12, topFormat: "Reel"      },
    { id: "facebook",  reach: 3_180, impressions: 13_200, engagement: 3.1, followerGain: 29,  posts: 8,  topFormat: "Post"      },
    { id: "linkedin",  reach: 2_010, impressions: 7_310,  engagement: 5.4, followerGain: 14,  posts: 6,  topFormat: "Carosello" },
  ],
  weekly: [
    { label: "L",  posts: 2, reach: 1_840 },
    { label: "M",  posts: 1, reach:   920 },
    { label: "M",  posts: 3, reach: 2_100 },
    { label: "G",  posts: 1, reach: 1_200 },
    { label: "V",  posts: 4, reach: 3_400 },
    { label: "S",  posts: 2, reach: 1_970 },
    { label: "D",  posts: 1, reach: 1_000 },
  ],
  topPosts: [
    { id: "t1", platform: "instagram", contentType: "Reel",      text: "5 errori che fanno perdere soldi in cantiere — e come evitarli",           reach: 3_420, likes: 211, comments: 18, shares: 34, engagementRate: 7.7, date: "15 Mag" },
    { id: "t2", platform: "facebook",  contentType: "Post",      text: "Il cantiere di Via Roma è completato! 3 mesi di lavoro intenso",            reach: 2_180, likes: 134, comments: 41, shares: 22, engagementRate: 9.0, date: "18 Mag" },
    { id: "t3", platform: "linkedin",  contentType: "Carosello", text: "Come gestiamo 12 cantieri contemporaneamente senza perdere la testa",       reach: 1_890, likes:  98, comments: 23, shares: 54, engagementRate: 9.2, date: "20 Mag" },
    { id: "t4", platform: "instagram", contentType: "Post",      text: "I nuovi serramenti in alluminio — un lavoro di precisione assoluta",        reach: 1_640, likes: 156, comments: 12, shares:  8, engagementRate: 10.7,date: "22 Mag" },
  ],
  byContentType: [
    { type: "Reel",      reach: 5_200, engagementRate: 7.1, posts: 5,  color: "from-pink-500 to-rose-500"     },
    { type: "Post",      reach: 3_800, engagementRate: 4.2, posts: 12, color: "from-blue-500 to-indigo-500"   },
    { type: "Carosello", reach: 2_100, engagementRate: 8.9, posts: 4,  color: "from-orange-500 to-purple-500" },
    { type: "Story",     reach: 1_330, engagementRate: 2.1, posts: 9,  color: "from-amber-400 to-orange-500"  },
  ],
  insights: [
    { icon: "🎬", text: "I Reel generano 2.4x il reach dei post normali — pubblica almeno 2 a settimana",               priority: "high"   },
    { icon: "📅", text: "Venerdì è il giorno con più engagement (+38% vs media) — pianifica i post importanti il venerdì", priority: "high"   },
    { icon: "🏗️", text: "Il tema 'cantieri completati' genera 9% di engagement — condividi più portfolio lavori",          priority: "medium" },
    { icon: "💼", text: "LinkedIn ha un engagement del 5.4% — sopra la media edilizia (3.2%)",                            priority: "medium" },
  ],
};

// ─── Demo hashtag performance ─────────────────────────────────────────────────

interface HashtagStat {
  tag: string;
  uses: number;
  avgReach: number;
  totalReach: number;
  engagementRate: number;
  trend: number;         // % vs periodo precedente
  bestPillar?: string;
}

const DEMO_HASHTAG_STATS: HashtagStat[] = [
  { tag: "#cantiere",            uses: 18, avgReach: 1_240, totalReach: 22_320, engagementRate: 7.2, trend: 24,  bestPillar: "cantiere"      },
  { tag: "#impresaedile",        uses: 14, avgReach: 1_080, totalReach: 15_120, engagementRate: 6.4, trend: 18,  bestPillar: "team"          },
  { tag: "#ristrutturazione",    uses: 12, avgReach: 1_410, totalReach: 16_920, engagementRate: 8.1, trend: 31,  bestPillar: "portfolio"     },
  { tag: "#costruzioni",         uses: 11, avgReach:   890, totalReach:  9_790, engagementRate: 5.9, trend: 8,   bestPillar: "cantiere"      },
  { tag: "#lavoriincorso",       uses: 10, avgReach:   760, totalReach:  7_600, engagementRate: 5.2, trend: -5,  bestPillar: "cantiere"      },
  { tag: "#primadopo",           uses:  8, avgReach: 1_680, totalReach: 13_440, engagementRate: 9.3, trend: 42,  bestPillar: "portfolio"     },
  { tag: "#consigliutili",       uses:  7, avgReach: 1_120, totalReach:  7_840, engagementRate: 6.8, trend: 15,  bestPillar: "educational"   },
  { tag: "#teamwork",            uses:  6, avgReach:   640, totalReach:  3_840, engagementRate: 4.7, trend: 3,   bestPillar: "team"          },
  { tag: "#edilizia",            uses: 16, avgReach:   580, totalReach:  9_280, engagementRate: 3.2, trend: -12, bestPillar: "cantiere"      },
  { tag: "#preventivogratuito",  uses:  5, avgReach: 1_950, totalReach:  9_750, engagementRate: 11.4,trend: 58,  bestPillar: "promo"         },
  { tag: "#clientisoddisfatti",  uses:  4, avgReach: 1_340, totalReach:  5_360, engagementRate: 8.6, trend: 22,  bestPillar: "testimonianza" },
  { tag: "#artigiani",           uses:  4, avgReach:   720, totalReach:  2_880, engagementRate: 5.1, trend: -3,  bestPillar: "team"          },
];

// ─── Demo media items ──────────────────────────────────────────────────────────

const DEMO_MEDIA_ITEMS: MediaItem[] = [
  { id: "m1",  type: "image", format: "4:5",  title: "Cantiere Milano — sopraelevazione",       tags: ["cantiere","edilizia","milano"],   usedInPosts: 3, usedInAds: 1, created_at: "2026-05-10", gradient: "from-slate-600 to-slate-900",    category: "portfolio", aiGenerated: false, fileSize: "2.4 MB" },
  { id: "m2",  type: "image", format: "1:1",  title: "Serramenti PVC bianchi — dettaglio",       tags: ["serramenti","pvc"],              usedInPosts: 2, usedInAds: 0, created_at: "2026-05-12", gradient: "from-sky-400 to-blue-600",       category: "prodotto",  aiGenerated: false, fileSize: "1.8 MB" },
  { id: "m3",  type: "image", format: "9:16", title: "Squadra AI — visual cantiere",              tags: ["team","ai-generated"],           usedInPosts: 1, usedInAds: 2, created_at: "2026-05-14", gradient: "from-orange-500 to-pink-600",    category: "team",      aiGenerated: true,  fileSize: "1.2 MB" },
  { id: "m4",  type: "video", format: "16:9", title: "Time-lapse cantiere Via Roma",              tags: ["timelapse","video","cantiere"],  usedInPosts: 2, usedInAds: 0, created_at: "2026-05-08", gradient: "from-emerald-500 to-teal-700",   category: "portfolio", aiGenerated: false, fileSize: "45 MB"  },
  { id: "m5",  type: "image", format: "4:5",  title: "Promo estate 2026 — ristrutturazione",     tags: ["promo","estate","offerta"],      usedInPosts: 4, usedInAds: 3, created_at: "2026-05-05", gradient: "from-orange-400 to-red-500",     category: "promo",     aiGenerated: true,  fileSize: "1.6 MB" },
  { id: "m6",  type: "story", format: "9:16", title: "Story — Prima/Dopo finestre",               tags: ["prima-dopo","serramenti"],       usedInPosts: 1, usedInAds: 1, created_at: "2026-05-15", gradient: "from-amber-400 to-yellow-600",   category: "prodotto",  aiGenerated: false, fileSize: "0.9 MB" },
  { id: "m7",  type: "image", format: "1:1",  title: "Logo impresa su sfondo cantiere",           tags: ["brand","logo"],                  usedInPosts: 0, usedInAds: 4, created_at: "2026-05-01", gradient: "from-blue-600 to-indigo-800",    category: "promo",     aiGenerated: false, fileSize: "0.4 MB" },
  { id: "m8",  type: "video", format: "9:16", title: "Reel — 3 consigli per scegliere le finestre",tags: ["reel","educational"],          usedInPosts: 1, usedInAds: 0, created_at: "2026-05-17", gradient: "from-rose-500 to-pink-700",      category: "prodotto",  aiGenerated: false, fileSize: "22 MB"  },
  { id: "m9",  type: "image", format: "16:9", title: "Squadra al lavoro — installazione",         tags: ["team","installazione"],          usedInPosts: 0, usedInAds: 0, created_at: "2026-05-19", gradient: "from-slate-400 to-slate-700",    category: "team",      aiGenerated: false, fileSize: "3.1 MB" },
  { id: "m10", type: "image", format: "4:5",  title: "Facciata completata — villa privata",       tags: ["portfolio","facciata"],          usedInPosts: 2, usedInAds: 1, created_at: "2026-05-20", gradient: "from-green-500 to-emerald-700",  category: "portfolio", aiGenerated: false, fileSize: "2.7 MB" },
  { id: "m11", type: "story", format: "9:16", title: "Story AI — promo tetto in coppi",           tags: ["tetto","promo","ai-generated"],  usedInPosts: 0, usedInAds: 2, created_at: "2026-05-21", gradient: "from-teal-400 to-cyan-600",      category: "promo",     aiGenerated: true,  fileSize: "1.1 MB" },
  { id: "m12", type: "image", format: "1:1",  title: "Pavimento in gres — dettaglio finitura",   tags: ["pavimentazione","dettaglio"],    usedInPosts: 1, usedInAds: 0, created_at: "2026-05-03", gradient: "from-stone-400 to-stone-700",    category: "prodotto",  aiGenerated: false, fileSize: "1.9 MB" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMediaFormat(format: string | undefined): MediaItem["format"] {
  return format === "9:16" || format === "4:5" || format === "1:1" || format === "16:9" ? format : "4:5";
}

function pillarToMediaCategory(pillarId: string | null): MediaItem["category"] {
  if (pillarId === "promo" || pillarId === "portfolio" || pillarId === "team" || pillarId === "cantiere") return pillarId;
  return "portfolio";
}

function mediaTypeFromContent(contentTypeId: string): MediaItem["type"] {
  if (contentTypeId === "story") return "story";
  if (contentTypeId === "video" || contentTypeId === "reel") return "video";
  return "image";
}

function createStoredMediaItem(input: {
  id?: string;
  title: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  format?: string;
  type?: MediaItem["type"];
  tags?: string[];
  aiGenerated?: boolean;
  fileSize?: string;
  category?: MediaItem["category"];
}): MediaItem {
  const id = input.id ?? `social-media-${Date.now()}`;
  const gradientIndex = Math.abs([...id].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % DEMO_MEDIA_ITEMS.length;
  return {
    id,
    type: input.type ?? "image",
    format: normalizeMediaFormat(input.format),
    title: input.title,
    tags: input.tags ?? [],
    usedInPosts: 0,
    usedInAds: 0,
    created_at: new Date().toISOString(),
    gradient: DEMO_MEDIA_ITEMS[gradientIndex]?.gradient ?? "from-slate-400 to-slate-700",
    category: input.category ?? "portfolio",
    aiGenerated: input.aiGenerated ?? false,
    fileSize: input.fileSize ?? "media",
    public_url: input.publicUrl,
    thumbnail_url: input.thumbnailUrl,
  };
}

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
  draft:     { label: "Bozza",        dot: "bg-slate-400",   pill: "border-slate-200 bg-slate-50 text-slate-600",     calBg: "bg-slate-100 text-slate-600" },
  review:    { label: "In revisione", dot: "bg-amber-400",   pill: "border-amber-200 bg-amber-50 text-amber-700",     calBg: "bg-amber-50 text-amber-700 border border-amber-200" },
  scheduled: { label: "Programmato",  dot: "bg-blue-400",    pill: "border-blue-200 bg-blue-50 text-blue-700",        calBg: "bg-blue-50 text-blue-700 border border-blue-100" },
  published: { label: "Pubblicato",   dot: "bg-emerald-400", pill: "border-emerald-200 bg-emerald-50 text-emerald-700", calBg: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  failed:    { label: "Fallito",      dot: "bg-red-400",     pill: "border-red-200 bg-red-50 text-red-700",            calBg: "bg-red-50 text-red-700 border border-red-100" },
} satisfies Record<ScheduledPost["status"], { label: string; dot: string; pill: string; calBg: string }>;

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CALENDARIO — redesign completo
// ═══════════════════════════════════════════════════════════════════════════════

const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES_SHORT = ["L","M","M","G","V","S","D"];
const DAY_NAMES_FULL  = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

function CalendarioTab({
  posts,
  onNewPost,
  onUpdatePost,
}: {
  posts: ScheduledPost[];
  onNewPost?: () => void;
  onUpdatePost?: (id: string, changes: Partial<ScheduledPost>) => void;
}) {
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
  const [reviewExpanded, setReviewExpanded] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

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
  const reviewCount = posts.filter((p) => p.status === "review").length;
  const statsData = [
    { label: "Programmati",        value: posts.filter((p) => p.status === "scheduled").length,  color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "In revisione",       value: reviewCount,                                            color: "text-amber-600",   bg: "bg-amber-50"   },
    { label: "Pubblicati",         value: posts.filter((p) => p.status === "published").length,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Bozze",              value: posts.filter((p) => p.status === "draft").length,       color: "text-slate-600",   bg: "bg-slate-50"   },
    { label: "Piattaforme",        value: new Set(posts.flatMap((p) => p.platforms)).size,       color: "text-orange-600",  bg: "bg-orange-50"  },
  ];

  // ── Review posts (uses reviewCount already computed above in statsData) ───
  const reviewPosts = posts.filter((p) => p.status === "review");

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

      {/* ── REVIEW QUEUE BANNER ────────────────────────────────────────── */}
      {reviewPosts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50 shadow-sm">
          {/* Header */}
          <button
            type="button"
            onClick={() => setReviewExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-amber-100/60"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⏳</span>
              <span className="font-bold text-amber-800">
                {reviewPosts.length} post in attesa di revisione
              </span>
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">
                {reviewPosts.length}
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-amber-600 transition-transform duration-200", reviewExpanded ? "rotate-180" : "")} />
          </button>

          {/* Expanded list */}
          {reviewExpanded && (
            <div className="divide-y divide-amber-200 border-t border-amber-200">
              {reviewPosts.map((post) => {
                const platformIcons = post.platforms
                  .map((pid) => PLATFORMS.find((p) => p.id === pid)?.icon ?? "")
                  .join(" ");
                const scheduledLabel = new Date(post.scheduled_at).toLocaleString("it-IT", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                });
                const isRejecting = rejectingId === post.id;

                return (
                  <div key={post.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Left: post info */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{platformIcons}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                            {scheduledLabel}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-slate-700">
                          {post.text || "(nessun testo)"}
                        </p>
                        {post.hashtags.length > 0 && (
                          <p className="truncate text-[11px] text-slate-400">
                            {post.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}
                            {post.hashtags.length > 5 && ` +${post.hashtags.length - 5}`}
                          </p>
                        )}
                        {post.reviewNote && (
                          <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 ring-1 ring-red-100">
                            💬 {post.reviewNote}
                          </p>
                        )}
                      </div>

                      {/* Right: actions */}
                      {!isRejecting ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdatePost?.(post.id, { status: "scheduled", reviewNote: undefined });
                              toast.success("✅ Post approvato", { description: "Verrà pubblicato all'orario programmato." });
                            }}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
                          >
                            <Check className="h-3.5 w-3.5" /> Approva
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectingId(post.id); setRejectNote(""); }}
                            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 active:scale-95"
                          >
                            <X className="h-3.5 w-3.5" /> Rimanda
                          </button>
                        </div>
                      ) : (
                        /* Reject flow — add note */
                        <div className="flex w-full flex-col gap-2 sm:w-64">
                          <Textarea
                            rows={2}
                            placeholder="Note per il creatore (es. 'Aggiungi logo', 'Tono troppo formale'...)"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            className="resize-none rounded-xl border-red-200 text-xs focus:ring-red-300"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdatePost?.(post.id, {
                                  status: "draft",
                                  reviewNote: rejectNote.trim() || "Rimandato in bozza.",
                                });
                                setRejectingId(null);
                                setRejectNote("");
                                toast.info("↩️ Post rimandato in bozza", { description: rejectNote.trim() || undefined });
                              }}
                              className="flex-1 rounded-xl bg-red-500 py-1.5 text-xs font-bold text-white transition hover:bg-red-600"
                            >
                              Conferma rimanda
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRejectingId(null); setRejectNote(""); }}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                  view === v ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {v === "month" ? "Mese" : "Settimana"}
              </button>
            ))}
          </div>

          {/* Platform filter */}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setFilterPlatform(null)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                filterPlatform === null ? "border-orange-400 bg-orange-100 text-orange-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
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
      {/* MIGL: timezone badge — chiarisce in che fuso vengono mostrate le date */}
      <div className="mb-2 flex items-center justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          <Clock className="h-3 w-3" />
          Orari in {Intl.DateTimeFormat().resolvedOptions().timeZone ?? "ora locale"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

        {/* MONTH VIEW */}
        {view === "month" && (
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-300" />
            <CardContent className="p-3">
              {/* Day headers */}
              <div className="mb-1 grid grid-cols-7 gap-1">
                {DAY_NAMES_SHORT.map((d, i) => (
                  <div key={i} className="py-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
                {Array.from({ length: dayOffset }).map((_, i) => (
                  <div key={`e-${i}`} className="min-h-[92px] bg-slate-50/60" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayPosts = postsByDate[dateKey] ?? [];
                  const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                  const isSelected = dateKey === selectedDay;
                  const scheduledCount = dayPosts.filter(p => p.status === "scheduled").length;
                  const publishedCount = dayPosts.filter(p => p.status === "published").length;
                  // Heat intensity for days with many posts
                  const heatClass = dayPosts.length >= 4 ? "bg-orange-50" : dayPosts.length >= 2 ? "bg-blue-50/60" : "bg-white";

                  return (
                    <button key={day} type="button"
                      onClick={() => setSelectedDay(dateKey === selectedDay ? null : dateKey)}
                      className={cn(
                        "group relative flex min-h-[92px] flex-col p-1.5 text-left transition-colors",
                        isSelected ? "bg-orange-100 ring-2 ring-inset ring-orange-400" : isToday ? "bg-blue-50" : heatClass,
                        "hover:bg-orange-50/80",
                      )}>
                      {/* Day number */}
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                          isToday ? "bg-blue-500 text-white shadow-sm" : isSelected ? "bg-orange-500 text-white" : "text-slate-600",
                        )}>{day}</span>
                        {/* Post count badge */}
                        {dayPosts.length > 0 && (
                          <span className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                            scheduledCount > 0 ? "bg-blue-500 text-white" : publishedCount > 0 ? "bg-emerald-500 text-white" : "bg-slate-300 text-white",
                          )}>{dayPosts.length}</span>
                        )}
                      </div>

                      {/* Post mini-cards */}
                      <div className="flex flex-col gap-0.5 overflow-hidden w-full">
                        {dayPosts.slice(0, 3).map((p, i) => {
                          const pl = PLATFORMS.find((pl) => pl.id === p.platforms[0]);
                          const sc = STATUS_CONFIG[p.status];
                          return (
                            <div key={i} className={cn("flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight w-full", sc.calBg)}>
                              <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[7px] font-bold text-white bg-gradient-to-br", pl?.gradient ?? "from-slate-300 to-slate-400")}>
                                {pl?.icon ?? "·"}
                              </span>
                              <span className="truncate min-w-0">
                                {new Date(p.scheduled_at).toLocaleTimeString("it", { hour:"2-digit", minute:"2-digit" })}
                                {p.text ? ` ${p.text.slice(0, 10)}` : ""}
                              </span>
                            </div>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <div className="rounded px-1 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 text-center">
                            +{dayPosts.length - 3}
                          </div>
                        )}
                      </div>

                      {/* Add button on hover */}
                      <div className="absolute bottom-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm">
                          <Plus className="h-3 w-3" />
                        </div>
                      </div>
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
            <div className="h-0.5 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-300" />
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
                            <span className="mt-0.5 rounded-full bg-orange-100 px-1.5 text-[9px] font-bold text-orange-700">{dayPosts.length}</span>
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
                          <div key={di} className={cn("min-h-[56px] border-r p-0.5 last:border-r-0", isToday ? "bg-blue-50/40" : "")}>
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
                              <p className="mt-1 text-[10px] text-orange-500">
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
                  <Button size="sm" className="mt-3 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white" onClick={onNewPost}>
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

function ContentStudioTab({
  companyId,
  connectedAccounts,
  selectedMedia,
  onSelectedMediaConsumed,
  onPostScheduled,
  onMediaStored,
}: {
  companyId?: string;
  connectedAccounts: ConnectedAccount[];
  selectedMedia?: MediaItem | null;
  onSelectedMediaConsumed?: () => void;
  onPostScheduled: (post: ScheduledPost) => void | Promise<unknown>;
  onMediaStored?: (media: MediaItem) => MediaItem | void | Promise<MediaItem | void | unknown>;
}) {
  // ── Content Pillar ────────────────────────────────────────────────────────
  const [activePillarId, setActivePillarId] = useState<string | null>(null);

  // ── Content type selection ─────────────────────────────────────────────────
  const [contentTypeId, setContentTypeId] = useState("post");
  const contentType = CONTENT_TYPE_CONFIG.find((c) => c.id === contentTypeId) ?? CONTENT_TYPE_CONFIG[0];

  // Filter platforms by content type
  const availablePlatforms = PLATFORMS.filter((p) => contentType.supportedBy.includes(p.id));
  const connectedPlatformIds = useMemo(
    () => connectedAccounts.map((account) => account.platform_id),
    [connectedAccounts],
  );

  // ── Platforms ──────────────────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["facebook", "instagram"]);

  // Auto-adjust selected platforms when content type changes
  useEffect(() => {
    setSelectedPlatforms((prev) => prev.filter((id) => contentType.supportedBy.includes(id)));
  }, [contentTypeId]);

  // ── Text / Copy ────────────────────────────────────────────────────────────
  // MIGL: autosave su localStorage ogni 30s + restore al mount (offre recovery
  // se l'utente chiude la tab a metà composizione).
  const AUTOSAVE_KEY = "social-composer-autosave-v1";
  const [postText, setPostText] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(AUTOSAVE_KEY) : null;
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { postText?: string; savedAt?: string };
      // Se è recente (<24h), restore. Altrimenti scarta.
      if (parsed.postText && parsed.savedAt && Date.now() - new Date(parsed.savedAt).getTime() < 86_400_000) {
        return parsed.postText;
      }
    } catch {
      /* corrupted localStorage, fall back to empty */
    }
    return "";
  });
  const [copyVariants, setCopyVariants] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [showFirstComment, setShowFirstComment] = useState(false);

  // Autosave debouncato a 30s: scrive solo se c'è del testo, altrimenti pulisce.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        if (postText.trim().length > 0) {
          window.localStorage.setItem(
            AUTOSAVE_KEY,
            JSON.stringify({ postText, hashtags, firstComment, savedAt: new Date().toISOString() }),
          );
        } else {
          window.localStorage.removeItem(AUTOSAVE_KEY);
        }
      } catch {
        /* quota exceeded — silently ignore */
      }
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [postText, hashtags, firstComment]);

  // Su salvataggio esplicito (Pubblica/Bozza), pulisce l'autosave.
  const clearAutosave = useCallback(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(AUTOSAVE_KEY); } catch { /* noop */ }
  }, []);

  // ── Cross-platform caption ──────────────────────────────────────────────────
  const [crossPlatformMode, setCrossPlatformMode] = useState(false);
  const [platformTexts, setPlatformTexts] = useState<Record<string, string>>({});

  // Testo effettivo per una piattaforma (fallback al testo globale)
  const getTextForPlatform = (platformId: string) =>
    crossPlatformMode && platformTexts[platformId] !== undefined
      ? platformTexts[platformId]
      : postText;

  const setPlatformText = (platformId: string, text: string) =>
    setPlatformTexts((prev) => ({ ...prev, [platformId]: text }));

  // Quando si disabilita cross-platform, svuota le override
  const toggleCrossPlatform = (enabled: boolean) => {
    setCrossPlatformMode(enabled);
    if (!enabled) setPlatformTexts({});
  };

  // Pre-popola ogni piattaforma col testo globale quando si attiva
  useEffect(() => {
    if (crossPlatformMode && Object.keys(platformTexts).length === 0 && postText) {
      const initial: Record<string, string> = {};
      selectedPlatforms.forEach(id => { initial[id] = postText; });
      setPlatformTexts(initial);
    }
  }, [crossPlatformMode]);

  // ── Media ──────────────────────────────────────────────────────────────────
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [selectedLibraryMedia, setSelectedLibraryMedia] = useState<MediaItem | null>(null);

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

  const storeMediaInComposer = useCallback((media: MediaItem, publicUrl?: string) => {
    setSelectedLibraryMedia(media);
    if (publicUrl) setMediaUrl(publicUrl);
    if (!onMediaStored) return;
    void Promise.resolve(onMediaStored(media))
      .then((savedMedia) => {
        if (savedMedia && typeof savedMedia === "object" && "id" in savedMedia) {
          setSelectedLibraryMedia(savedMedia as MediaItem);
        }
      })
      .catch(() => {
        // The storage hook already reports the error and keeps the local fallback.
      });
  }, [onMediaStored]);

  useEffect(() => {
    if (!selectedMedia) return;
    setSelectedLibraryMedia(selectedMedia);
    const previewUrl = getSocialMediaPreviewUrl(selectedMedia);
    if (previewUrl) setMediaUrl(previewUrl);
    if (selectedMedia.type === "story") {
      setContentTypeId("story");
    } else if (selectedMedia.type === "video") {
      setContentTypeId("video");
    }
    onSelectedMediaConsumed?.();
  }, [onSelectedMediaConsumed, selectedMedia]);

  // ── Content Pillar handler ─────────────────────────────────────────────────
  // Declared after all state vars to avoid temporal dead zone issues
  const applyPillar = (pillar: ContentPillar) => {
    if (activePillarId === pillar.id) {
      setActivePillarId(null);
      return;
    }
    setActivePillarId(pillar.id);
    setHashtags((prev) => {
      const existing = new Set(prev);
      const merged = [...prev];
      pillar.hashtags.forEach((h) => { if (!existing.has(h)) merged.push(h); });
      return merged.slice(0, 30);
    });
    setBrief((prev) => prev.trim() ? prev : pillar.promptHint);
    const ctExists = CONTENT_TYPE_CONFIG.find((c) => c.id === pillar.suggestedContentType);
    if (ctExists) setContentTypeId(pillar.suggestedContentType);
    toast.success(`Pillar "${pillar.label}" applicato`, { description: "Hashtag e brief aggiornati." });
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
      const storedMedia = createStoredMediaItem({
        id: result.media_id ?? `ai-${Date.now()}`,
        title: brief.trim().slice(0, 80) || `AI ${contentType.label}`,
        publicUrl: result.public_url,
        format: contentType.aspectRatio,
        type: mediaTypeFromContent(contentTypeId),
        tags: [segment, contentTypeId],
        aiGenerated: true,
        fileSize: "AI",
        category: pillarToMediaCategory(activePillarId),
      });
      storeMediaInComposer(storedMedia, result.public_url);
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

  const scheduledAtForValidation = !publishNow && scheduledDate
    ? new Date(`${scheduledDate}T${scheduledTime}`)
    : publishNow
      ? new Date()
      : null;
  const selectedMediaPreviewUrl = getSocialMediaPreviewUrl(selectedLibraryMedia);
  const activeMediaUrl = mediaUrl ?? selectedMediaPreviewUrl;
  const draftValidation = validateSocialDraft(
    {
      selectedPlatforms,
      connectedPlatformIds,
      contentType: contentTypeId,
      fallbackText: postText,
      textByPlatform: crossPlatformMode ? platformTexts : {},
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      mediaUrl: activeMediaUrl,
      publishNow,
      scheduledAt: scheduledAtForValidation,
      livePublishingEnabled: SOCIAL_LIVE_PUBLISHING_ENABLED,
    },
    PLATFORMS,
  );

  const resetComposer = () => {
    setPostText("");
    setHashtags([]);
    setMediaUrl(null);
    setSelectedLibraryMedia(null);
    setScheduledDate("");
    setPublishNow(false);
    setCopyVariants([]);
    setFirstComment("");
    setShowFirstComment(false);
    setPlatformTexts({});
    setCrossPlatformMode(false);
    setActivePillarId(null);
  };

  const saveLocalPost = (status: ScheduledPost["status"]) => {
    if (!draftValidation.canSaveDraft) {
      toast.error(draftValidation.errors[0] ?? "Completa testo e piattaforme prima di salvare.");
      return;
    }

    const scheduledAt = scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
      : new Date(Date.now() + 86400000).toISOString();
    const localPost: ScheduledPost = {
      id: `local-${Date.now()}`,
      platforms: selectedPlatforms,
      contentType: contentTypeId,
      text: crossPlatformMode ? (platformTexts[selectedPlatforms[0]] ?? postText) : postText,
      platformTexts: crossPlatformMode && Object.keys(platformTexts).length > 0 ? platformTexts : undefined,
      image_url: activeMediaUrl ?? undefined,
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      firstComment: firstComment || undefined,
      scheduled_at: scheduledAt,
      status,
      created_at: new Date().toISOString(),
      reviewNote: status === "review" ? "Revisione locale: nessuna notifica inviata finché il publisher social non è collegato." : undefined,
      mediaItemId: selectedLibraryMedia?.id,
    };

    void Promise.resolve(onPostScheduled(localPost));
    toast.success(status === "review" ? "Post salvato in revisione locale" : "Bozza locale salvata", {
      description: "Nessuna pubblicazione live è stata inviata alle piattaforme social.",
    });
    resetComposer();
  };

  const onSchedulePost = () => {
    // In cross-platform mode, valid if at least one platform has text
    const hasText = crossPlatformMode
      ? selectedPlatforms.some(id => (platformTexts[id] ?? postText).trim())
      : postText.trim();
    if (!hasText) { toast.error("Scrivi il testo del post"); return; }
    if (selectedPlatforms.length === 0) { toast.error("Seleziona almeno una piattaforma"); return; }
    if (!publishNow && !scheduledDate) { toast.error("Seleziona la data di pubblicazione"); return; }
    // FIX P1: l'input date ha min=oggi ma l'input time è libero. Se l'utente
    // sceglie oggi + un orario passato (es. 14:00 quando sono le 15:00), il post
    // veniva accettato ma non si sarebbe mai pubblicato (lo scheduler lo ignora).
    if (!publishNow) {
      const scheduledDt = new Date(`${scheduledDate}T${scheduledTime}`);
      if (Number.isNaN(scheduledDt.getTime())) {
        toast.error("Data o ora non valide");
        return;
      }
      if (scheduledDt.getTime() <= Date.now() + 60_000) {
        toast.error("L'orario di pubblicazione deve essere almeno 1 minuto nel futuro", {
          description: "Sposta l'orario più avanti oppure usa 'Pubblica ora'.",
        });
        return;
      }
    }
    if (!draftValidation.canPublishLive) {
      toast.error(draftValidation.errors[0] ?? "Pubblicazione live non ancora attiva.");
      return;
    }

    const scheduledAt = publishNow
      ? new Date().toISOString()
      : new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    const newPost: ScheduledPost = {
      id: `post-${Date.now()}`,
      platforms: draftValidation.connectedSelectedPlatforms,
      contentType: contentTypeId,
      // In cross-platform mode, salva il testo della prima piattaforma come principale
      text: crossPlatformMode
        ? (platformTexts[selectedPlatforms[0]] ?? postText)
        : postText,
      image_url: activeMediaUrl ?? undefined,
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      firstComment: firstComment || undefined,
      scheduled_at: scheduledAt,
      status: publishNow ? "published" : "scheduled",
      created_at: new Date().toISOString(),
      mediaItemId: selectedLibraryMedia?.id,
      platformTexts: crossPlatformMode && Object.keys(platformTexts).length > 0
        ? platformTexts
        : undefined,
    };

    onPostScheduled(newPost);
    toast.success(publishNow ? "Richiesta di pubblicazione inviata" : "Post programmato", {
      description: crossPlatformMode
        ? `Testi diversi per ${selectedPlatforms.length} piattaforme — ottimizzato!`
        : publishNow ? "Il publisher social prenderà in carico l'invio." : `Pubblicazione: ${new Date(scheduledAt).toLocaleString("it")}`,
    });
    resetComposer();
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

      {/* ── CONTENT PILLARS ────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-slate-200">
        <div className="h-0.5 bg-gradient-to-r from-orange-400 via-amber-300 to-orange-400" />
        <CardContent className="pt-3 pb-3">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              🎯 Pillar contenuto
            </p>
            {activePillarId && (
              <button
                type="button"
                onClick={() => setActivePillarId(null)}
                className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition"
              >
                ✕ Deseleziona
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {CONTENT_PILLARS.map((pillar) => {
              const isActive = activePillarId === pillar.id;
              return (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => applyPillar(pillar)}
                  className={cn(
                    "group flex items-center gap-2 rounded-2xl border-2 px-3.5 py-2 text-sm font-semibold transition-all",
                    isActive
                      ? `${pillar.colorBg} ${pillar.colorBorder} ${pillar.colorText} shadow-sm`
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <span className="text-base leading-none">{pillar.emoji}</span>
                  <span className="text-xs">{pillar.label}</span>
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-bold transition",
                    isActive ? `${pillar.colorBg} ${pillar.colorText}` : "bg-slate-100 text-slate-400"
                  )}>
                    {pillar.weeklyFreq}×/sett
                  </span>
                </button>
              );
            })}
          </div>
          {/* Active pillar description + hashtag preview */}
          {activePillarId && (() => {
            const p = CONTENT_PILLARS.find((p) => p.id === activePillarId);
            if (!p) return null;
            return (
              <div className={cn("mt-2.5 flex flex-wrap items-start gap-3 rounded-xl border px-3 py-2.5", p.colorBg, p.colorBorder)}>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[11px] font-semibold", p.colorText)}>{p.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.hashtags.map((h) => (
                      <span key={h} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", p.colorBg, p.colorBorder, p.colorText)}>
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-xl border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", p.colorBg, p.colorBorder, p.colorText)}>
                  {CONTENT_TYPE_CONFIG.find((c) => c.id === p.suggestedContentType)?.label ?? p.suggestedContentType}
                </span>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── CONTENT TYPE SELECTOR ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-400" />
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
                            ? "border-orange-400 bg-gradient-to-br from-orange-50 to-pink-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30"
                        )}>
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-xl",
                          isSelected ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white" : "bg-slate-100 text-slate-600"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className={cn("text-xs font-bold", isSelected ? "text-orange-700" : "text-slate-700")}>{ct.label}</span>
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
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2 text-[11px] text-orange-700">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
            <span>{contentType.tips}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── BRIEF AI ────────────────────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden rounded-2xl border shadow-sm transition-all duration-300",
        isBriefOpen ? "border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50/40 to-white" : "border-orange-100 bg-gradient-to-r from-orange-50/70 to-white"
      )}>
        {!isBriefOpen ? (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100">
              <Sparkles className="h-3.5 w-3.5 text-orange-600" />
            </div>
            {brief ? (
              <>
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                </div>
                <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{SEGMENT_LABELS[segment] ?? segment}</span>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-600">{brief}</p>
              </>
            ) : (
              <p className="flex-1 text-sm italic text-slate-400">Imposta il brief AI — genera testo e immagine in un click</p>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {brief && (
                <button type="button" onClick={() => void onGeneratePost()} disabled={isGeneratingCopy}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60">
                  {isGeneratingCopy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Genera varianti
                </button>
              )}
              <button type="button" onClick={() => setIsBriefOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-200">
                <Pencil className="h-3 w-3" /> {brief ? "Modifica" : "Imposta brief"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Brief AI</p>
                  <p className="text-[11px] text-slate-500">Genera 3 varianti di testo · hashtag · immagine</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsBriefOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-100 hover:text-orange-600">
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
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white">
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
          {!SOCIAL_LIVE_PUBLISHING_ENABLED && (
            <Alert className="border-amber-200 bg-amber-50 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800">
                <strong>Modalità bozza locale.</strong> Puoi preparare contenuti e calendario, ma la pubblicazione live sarà disponibile solo quando il publisher social backend sarà collegato.
              </AlertDescription>
            </Alert>
          )}

          {/* Copy variants */}
          {copyVariants.length > 1 && (
            <Card className="overflow-hidden border-orange-200">
              <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
              <CardContent className="pt-3 pb-3">
                <p className="mb-2 text-xs font-bold text-slate-700">
                  <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-orange-500" />
                  Scegli la variante che preferisci
                </p>
                <div className="space-y-2">
                  {copyVariants.map((v, i) => (
                    <button key={i} type="button" onClick={() => { setPostText(v); setCopyVariants([]); toast.success("Variante selezionata"); }}
                      className={cn(
                        "w-full rounded-xl border-2 p-3 text-left text-sm text-slate-700 transition hover:border-orange-300 hover:bg-orange-50",
                        postText === v ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white"
                      )}>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-orange-400">Variante {i + 1}</span>
                      {v.slice(0, 120)}{v.length > 120 ? "…" : ""}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Text editor */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                    <Edit3 className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {isVideoType ? "Titolo / Descrizione" : isStory ? "Testo overlay (opzionale)" : "Testo post"}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {charCount > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {selectedPlatforms.length === 0 ? (
                            <span className="text-slate-400">{charCount} car.</span>
                          ) : (
                            selectedPlatforms.map((id) => {
                              const platform = PLATFORMS.find((p) => p.id === id);
                              if (!platform) return null;
                              const over = charCount > platform.maxChars;
                              const close = charCount > platform.maxChars * 0.9 && !over;
                              return (
                                <span
                                  key={id}
                                  className={cn(
                                    "tabular-nums",
                                    over ? "font-semibold text-red-600" : close ? "font-semibold text-amber-600" : "text-slate-400",
                                  )}
                                  title={`${platform.name}: ${charCount}/${platform.maxChars}`}
                                >
                                  {platform.name.slice(0, 2)} {charCount}/{platform.maxChars.toLocaleString("it")}
                                </span>
                              );
                            })
                          )}
                        </div>
                      ) : "Scrivi o genera con AI"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Cross-platform toggle — visibile con 2+ piattaforme */}
                  {selectedPlatforms.length > 1 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={() => toggleCrossPlatform(!crossPlatformMode)}
                            className={cn(
                              "flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition",
                              crossPlatformMode
                                ? "border-orange-400 bg-orange-100 text-orange-700"
                                : "border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-orange-600"
                            )}>
                            <Share2 className="h-3 w-3" />
                            {crossPlatformMode ? "✓ Per piattaforma" : "Personalizza"}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px] text-xs">
                          Testo diverso per ogni piattaforma — Instagram breve, LinkedIn lungo, Facebook conversazionale
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void onGeneratePost()} disabled={isGeneratingCopy || !brief.trim()}
                    className="h-7 gap-1.5 text-[11px] text-orange-600 hover:bg-orange-50">
                    {isGeneratingCopy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isGeneratingCopy ? (
                <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                  {[...Array(3)].map((_, i) => <div key={i} className={cn("h-4 animate-pulse rounded-lg bg-orange-100/70", i === 2 ? "w-2/3" : "w-full")} />)}
                </div>
              ) : crossPlatformMode ? (
                /* ── CROSS-PLATFORM MODE: textarea per piattaforma ── */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2 text-[11px] text-orange-700">
                    <Share2 className="h-3.5 w-3.5 shrink-0" />
                    <span><strong>Modalità multi-piattaforma</strong> — ogni canale riceve il suo testo ottimizzato</span>
                  </div>
                  {selectedPlatforms.map((pid) => {
                    const pl = PLATFORMS.find(p => p.id === pid);
                    if (!pl) return null;
                    const txt = platformTexts[pid] ?? postText;
                    const over = txt.length > pl.maxChars;
                    const HINTS: Record<string, string> = {
                      instagram: "Breve + emoji · 3-5 hashtag nel testo · hook nei primi 125 car.",
                      facebook:  "Conversazionale · racconta la storia · domanda finale per commenti",
                      linkedin:  "Professionale · bullet point · inizia con insight · no hashtag in eccesso",
                      youtube:   "Titolo: keyword nei primi 40 car. · Descrizione: 200+ parole",
                      tiktok:    "Hook immediato · breve · trending hashtag",
                    };
                    return (
                      <div key={pid} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-bold text-white bg-gradient-to-br", pl.gradient)}>{pl.icon}</span>
                            <div>
                              <span className="text-xs font-bold text-slate-800">{pl.name}</span>
                              <p className="text-[10px] text-slate-400">{HINTS[pid]}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] tabular-nums", over ? "font-bold text-red-500" : "text-slate-400")}>
                              {txt.length}/{pl.maxChars.toLocaleString("it")}
                            </span>
                            <button type="button"
                              onClick={() => {
                                void (async () => {
                                  const tips: Record<string, string> = {
                                    instagram: "Ottimizza per Instagram: breve, visivo, emoji naturali, 3-5 hashtag nel testo",
                                    facebook:  "Ottimizza per Facebook: conversazionale, termina con domanda aperta",
                                    linkedin:  "Ottimizza per LinkedIn: professionale, usa bullet point, inizia con insight di settore",
                                    youtube:   "Riscrivi come titolo YouTube SEO: keyword edilizia nei primi 40 caratteri",
                                    tiktok:    "Ottimizza per TikTok: hook immediato, max 150 car, trending hashtag edilizia",
                                  };
                                  const base = txt || postText || brief;
                                  if (!base.trim()) { toast.error("Scrivi prima del testo"); return; }
                                  const result = await generateCopy({ brief: `${tips[pid] ?? "Ottimizza questo testo"}: "${base}"`, segment, zone: "", variants: 1 });
                                  if (result?.copy_variants?.[0]) {
                                    setPlatformText(pid, result.copy_variants[0]);
                                    toast.success(`Testo ${pl.name} ottimizzato`);
                                  }
                                })();
                              }}
                              disabled={isGeneratingCopy}
                              className="flex items-center gap-0.5 rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 hover:bg-orange-200 disabled:opacity-50">
                              <Sparkles className="h-2.5 w-2.5" /> AI
                            </button>
                          </div>
                        </div>
                        <Textarea
                          value={txt}
                          onChange={e => setPlatformText(pid, e.target.value)}
                          className={cn("min-h-[80px] resize-none text-sm", over ? "border-red-300" : "")}
                          placeholder={`Testo ottimizzato per ${pl.name}...`}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea value={postText} onChange={(e) => setPostText(e.target.value)}
                    className={cn("min-h-28 resize-none font-[inherit] text-sm", charCount > maxChars ? "border-red-300 focus-visible:ring-red-400" : "")}
                    placeholder={isStory ? "Testo breve da sovrapporre alla Story (opzionale)..." : isVideoType ? "Titolo del video — sii specifico, usa keyword nei primi 40 caratteri..." : "Racconta la tua impresa, mostra un progetto completato, condividi un consiglio..."} />
                  {/* MIGL: CTA "Chiedi a Silvio" — apre la chat con prompt strutturato */}
                  <button
                    type="button"
                    onClick={() => {
                      const platformsLabel = selectedPlatforms.length > 0
                        ? selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name).filter(Boolean).join(", ")
                        : "Instagram + Facebook";
                      const draft =
                        `Scrivi una caption per un post su ${platformsLabel}.\n` +
                        `Tipo: ${contentType.name}.\n` +
                        `Brief: ${brief || postText || "Mostra un progetto edile completato, tono caldo e professionale"}.\n\n` +
                        `Requisiti: hook nei primi 125 caratteri, tono italiano colloquiale per imprenditore edile, ` +
                        `${selectedPlatforms.includes("twitter") ? "max 280 caratteri (Twitter)" : "max 2200 caratteri"}, ` +
                        `${contentType.hashtagsAllowed ? "3-5 hashtag rilevanti edilizia in fondo" : "senza hashtag"}. ` +
                        `Restituisci 3 varianti distinte.`;
                      window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
                  >
                    <Sparkles className="h-3 w-3" />
                    Chiedi a Silvio una caption
                  </button>
                </div>
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
                      className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 hover:text-orange-800 disabled:opacity-40">
                      {isGeneratingHashtags ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                        {tag}
                        <button type="button" onClick={() => setHashtags((h) => h.filter((t) => t !== tag))}><X className="h-2.5 w-2.5 text-orange-400 hover:text-orange-700" /></button>
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
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border-2 transition", showFirstComment ? "border-orange-400 bg-orange-400" : "border-slate-300")}>
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
              {activeMediaUrl || selectedLibraryMedia ? (
                <div className="relative overflow-hidden rounded-xl border">
                  {activeMediaUrl ? (
                    <img src={activeMediaUrl} alt="Media" className="max-h-64 w-full object-cover" />
                  ) : selectedLibraryMedia ? (
                    <div className={cn("flex h-48 flex-col items-center justify-center bg-gradient-to-br px-4 text-center text-white", selectedLibraryMedia.gradient)}>
                      {selectedLibraryMedia.type === "video" ? <Play className="mb-2 h-9 w-9 text-white/80" /> : <ImageIcon className="mb-2 h-9 w-9 text-white/80" />}
                      <p className="text-sm font-bold drop-shadow">{selectedLibraryMedia.title}</p>
                      <p className="mt-1 text-[11px] font-medium text-white/80">{selectedLibraryMedia.format} · dalla galleria</p>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => { setMediaUrl(null); setSelectedLibraryMedia(null); }} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">
                      {selectedLibraryMedia ? `${selectedLibraryMedia.title} · ${selectedLibraryMedia.format}` : `${contentType.label} · ${contentType.aspectRatio}`}
                    </p>
                  </div>
                </div>
              ) : isGeneratingImage ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
                  <Loader2 className="h-5 w-5 animate-spin" /> Generazione in corso...
                </div>
              ) : (
                <AdMediaUploader
                  companyId={companyId}
                  onUploaded={(media) => {
                    if (media.public_url) {
                      const storedMedia = createStoredMediaItem({
                        id: media.id,
                        title: `Media social ${new Date().toLocaleDateString("it-IT")}`,
                        publicUrl: media.public_url,
                        format: contentType.aspectRatio,
                        type: mediaTypeFromContent(contentTypeId),
                        tags: ["upload", segment, contentTypeId],
                        aiGenerated: false,
                        fileSize: "upload",
                        category: pillarToMediaCategory(activePillarId),
                      });
                      storeMediaInComposer(storedMedia, media.public_url);
                    }
                    toast.success("Media caricato");
                  }}
                />
              )}
              {/* Format hints */}
              {!activeMediaUrl && !selectedLibraryMedia && (
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
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="flex-1"
                          {...(scheduledDate === new Date().toISOString().split("T")[0]
                            ? { min: new Date(Date.now() + 60_000).toTimeString().slice(0, 5) }
                            : {})}
                        />
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
                      <span>LinkedIn: nessuno scheduling nativo; salva una bozza e usa il reminder per pubblicare manualmente.</span>
                    </div>
                  )}
                </div>
              )}

              {(draftValidation.errors.length > 0 || draftValidation.warnings.length > 0) && (
                <div className="space-y-1.5">
                  {draftValidation.errors.slice(0, 3).map((error) => (
                    <div key={error} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                  {draftValidation.warnings.slice(0, 2).map((warning) => (
                    <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={onSchedulePost} disabled={!draftValidation.canPublishLive || (!publishNow && !scheduledDate)}
                className={cn("w-full text-white shadow-sm",
                  publishNow ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                             : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600")}>
                {!SOCIAL_LIVE_PUBLISHING_ENABLED
                  ? <><Send className="mr-2 h-4 w-4" />Publisher live non attivo</>
                  : publishNow
                    ? <><Send className="mr-2 h-4 w-4" />Pubblica ora su {draftValidation.connectedSelectedPlatforms.length} piattaform{draftValidation.connectedSelectedPlatforms.length === 1 ? "a" : "e"}</>
                    : <><Calendar className="mr-2 h-4 w-4" />Programma pubblicazione</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => saveLocalPost("draft")}
                disabled={!draftValidation.canSaveDraft}
                className="w-full border-slate-200 text-slate-700"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Salva bozza locale
              </Button>
              {/* Invia in revisione */}
              {!publishNow && (
                <button type="button"
                  onClick={() => saveLocalPost("review")}
                  disabled={!draftValidation.canSaveDraft}
                  className="w-full rounded-xl border-2 border-dashed border-amber-300 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-40">
                  ⏳ Salva in revisione locale
                </button>
              )}
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
                      {activeMediaUrl ? (
                        <img src={activeMediaUrl} alt="Preview" className="h-full w-full object-cover" />
                      ) : selectedLibraryMedia ? (
                        <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", selectedLibraryMedia.gradient)}>
                          <Smartphone className="h-10 w-10 text-white/70" />
                        </div>
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
                      {activeMediaUrl ? (
                        <img src={activeMediaUrl} alt="Post media" className="w-full object-cover" style={{ height: contentType.previewH }} />
                      ) : selectedLibraryMedia ? (
                        <div className={cn("flex items-center justify-center bg-gradient-to-br", selectedLibraryMedia.gradient)} style={{ height: contentType.previewH }}>
                          <ImageIcon className="h-6 w-6 text-white/70" />
                        </div>
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
// TAB: ANALITICHE — dashboard completa
// ═══════════════════════════════════════════════════════════════════════════════

function AnaliticsTab({ connectedAccounts }: { connectedAccounts: ConnectedAccount[] }) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const da = DEMO_ANALYTICS;
  const maxWeeklyReach = Math.max(...da.weekly.map(w => w.reach));
  const maxPlatformReach = Math.max(...da.byPlatform.map(p => p.reach));

  return (
    <div className="space-y-5">

      {/* Demo banner */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>Dati demo — {da.period}.</strong> Connetti le piattaforme da Impostazioni → Integrazioni per vedere le metriche reali.
        </p>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-amber-200 bg-white p-0.5">
          {(["7d","30d","90d"] as const).map(p => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition",
                period === p ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-100")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI HERO ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Reach",          value: da.overview.reach.value,       change: da.overview.reach.change,       suffix: "",  color: "text-orange-600",  bg: "bg-orange-50",  icon: Users,       accent: "from-orange-400 to-amber-400"    },
          { label: "Impressioni",    value: da.overview.impressions.value, change: da.overview.impressions.change, suffix: "",  color: "text-blue-600",    bg: "bg-blue-50",    icon: Eye,         accent: "from-blue-400 to-sky-400"        },
          { label: "Engagement",     value: da.overview.engagement.value,  change: da.overview.engagement.change,  suffix: "%", color: "text-emerald-600", bg: "bg-emerald-50", icon: Heart,       accent: "from-emerald-400 to-teal-400"    },
          { label: "Nuovi follower", value: da.overview.followers.value,   change: da.overview.followers.change,   suffix: "",  color: "text-pink-600",    bg: "bg-pink-50",    icon: ArrowUpRight,accent: "from-pink-400 to-rose-400"       },
        ].map(({ label, value, change, suffix, color, bg, icon: Icon, accent }) => (
          <Card key={label} className="overflow-hidden">
            <div className={cn("h-1 w-full bg-gradient-to-r", accent)} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", bg)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <ArrowUpRight className="h-3 w-3" />+{change}{suffix === "%" ? "pp" : "%"}
                </span>
              </div>
              <p className={cn("text-2xl font-bold tabular-nums", color)}>
                {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}{suffix}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
              <p className="text-[10px] text-slate-400">vs mese scorso</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">

        {/* LEFT */}
        <div className="space-y-5">

          {/* Weekly reach bar chart */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-orange-400 to-blue-400" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-orange-500" /> Reach settimanale
              </CardTitle>
              <CardDescription className="text-xs">Post pubblicati e reach per giorno — ultima settimana</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2" style={{ height: 120 }}>
                {da.weekly.map((d, i) => {
                  const barH = Math.max(8, Math.round((d.reach / maxWeeklyReach) * 96));
                  const isHighest = d.reach === maxWeeklyReach;
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 tabular-nums">{(d.reach / 1000).toFixed(1)}K</span>
                      <div className="flex w-full flex-col justify-end" style={{ height: 80 }}>
                        <div
                          className={cn("w-full rounded-t-lg transition-all", isHighest ? "bg-gradient-to-b from-orange-400 to-orange-600" : "bg-gradient-to-b from-slate-200 to-slate-300")}
                          style={{ height: barH }}
                        />
                      </div>
                      <span className={cn("text-[11px] font-bold", isHighest ? "text-orange-600" : "text-slate-500")}>{d.label}</span>
                      {d.posts > 0 && (
                        <span className={cn("rounded-full px-1.5 text-[8px] font-bold", d.posts >= 3 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500")}>{d.posts}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Platform breakdown */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="h-4 w-4 text-pink-500" /> Performance per piattaforma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {da.byPlatform.map((p) => {
                  const pl = PLATFORMS.find(pl => pl.id === p.id);
                  if (!pl) return null;
                  const reachPct = Math.round((p.reach / maxPlatformReach) * 100);
                  return (
                    <div key={p.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-bold text-white bg-gradient-to-br", pl.gradient)}>{pl.icon}</span>
                          <span className="text-sm font-semibold text-slate-700">{pl.name}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{p.posts} post</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-slate-500">Reach <strong className="text-slate-700">{(p.reach / 1000).toFixed(1)}K</strong></span>
                          <span className={cn("font-bold", p.engagement >= 5 ? "text-emerald-600" : "text-slate-600")}>{p.engagement}% eng.</span>
                          <span className="flex items-center gap-0.5 text-blue-600"><ArrowUpRight className="h-3 w-3" />{p.followerGain}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full bg-gradient-to-r", pl.gradient)} style={{ width: `${reachPct}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400">Top formato: <span className="font-semibold text-slate-600">{p.topFormat}</span></p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top posts */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-emerald-500" /> Top contenuti del mese
              </CardTitle>
              <CardDescription className="text-xs">Ordinati per engagement rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {da.topPosts.map((p, rank) => {
                  const pl = PLATFORMS.find(pl => pl.id === p.platform);
                  return (
                    <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                      {/* Rank */}
                      <div className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        rank === 0 ? "bg-amber-100 text-amber-700" : rank === 1 ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400"
                      )}>#{rank + 1}</div>
                      {/* Platform badge */}
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {pl && <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br", pl.gradient)}>{pl.icon}</span>}
                          <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">{p.contentType}</span>
                          <span className="ml-auto text-[10px] text-slate-400">{p.date}</span>
                        </div>
                        <p className="text-[12px] font-medium text-slate-700 line-clamp-1">{p.text}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{(p.reach / 1000).toFixed(1)}K reach</span>
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-400" />{p.likes}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3 text-blue-400" />{p.comments}</span>
                          <span className="flex items-center gap-1"><Share2 className="h-3 w-3 text-orange-400" />{p.shares}</span>
                          <span className={cn("ml-auto font-bold", p.engagementRate >= 8 ? "text-emerald-600" : p.engagementRate >= 5 ? "text-blue-600" : "text-slate-500")}>
                            {p.engagementRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-5">

          {/* Content type performance */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Film className="h-4 w-4 text-orange-500" /> Per tipo di contenuto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {da.byContentType.map((ct) => (
                  <div key={ct.type} className="flex items-center gap-3">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white text-[10px] font-bold", ct.color)}>
                      {ct.type.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{ct.type}</span>
                        <span className="text-[11px] font-bold text-slate-500">{ct.engagementRate}% eng</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full bg-gradient-to-r", ct.color)}
                          style={{ width: `${Math.round((ct.reach / da.byContentType[0].reach) * 100)}%` }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">{(ct.reach / 1000).toFixed(1)}K reach · {ct.posts} post</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card className="overflow-hidden border-orange-100">
            <div className="h-0.5 bg-gradient-to-r from-orange-500 to-pink-500" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-orange-500" /> AI Insights
              </CardTitle>
              <CardDescription className="text-xs">Suggerimenti basati sulle tue performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {da.insights.map((ins, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                    ins.priority === "high" ? "border-orange-200 bg-orange-50/60" : "border-slate-100 bg-slate-50/60"
                  )}>
                    <span className="text-base leading-none">{ins.icon}</span>
                    <p className="text-[12px] leading-relaxed text-slate-700">{ins.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Best posting times */}
          <Card className="overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-emerald-500" /> Orari migliori per piattaforma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {PLATFORMS.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[8px] font-bold text-white bg-gradient-to-br", p.gradient)}>{p.icon}</span>
                    <div className="flex flex-wrap gap-1">
                      {p.bestTimes.map((t) => (
                        <span key={t} className="rounded-full border border-slate-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── HASHTAG PERFORMANCE ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Hash className="h-4 w-4 text-orange-500" /> Hashtag Performance
            </CardTitle>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">Demo</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Reach medio e utilizzi degli hashtag nei post del periodo</p>
        </CardHeader>
        <CardContent>
          {/* Summary pills */}
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { label: "Hashtag usati", value: DEMO_HASHTAG_STATS.length,                       color: "text-orange-700", bg: "bg-orange-50"  },
              { label: "Reach totale",  value: `${(DEMO_HASHTAG_STATS.reduce((s,h)=>s+h.totalReach,0)/1000).toFixed(1)}K`, color: "text-blue-700", bg: "bg-blue-50" },
              { label: "Migliore",      value: DEMO_HASHTAG_STATS[0]?.tag ?? "—",               color: "text-emerald-700",bg: "bg-emerald-50" },
              { label: "Trend",         value: `${DEMO_HASHTAG_STATS.filter(h=>h.trend>0).length} in crescita`, color: "text-violet-700", bg: "bg-violet-50" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cn("flex flex-col rounded-xl border border-slate-100 px-3 py-2 text-center", bg)}>
                <span className={cn("text-base font-bold", color)}>{value}</span>
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>

          {/* Hashtag table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <th className="py-2 pl-3 pr-2 font-semibold text-slate-600">#</th>
                  <th className="py-2 px-2 font-semibold text-slate-600">Hashtag</th>
                  <th className="py-2 px-2 text-right font-semibold text-slate-600">Utilizzi</th>
                  <th className="py-2 px-2 text-right font-semibold text-slate-600">Reach medio</th>
                  <th className="py-2 px-2 text-right font-semibold text-slate-600">Reach totale</th>
                  <th className="py-2 px-2 text-right font-semibold text-slate-600">Eng. rate</th>
                  <th className="py-2 pr-3 text-right font-semibold text-slate-600">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {DEMO_HASHTAG_STATS.map((h, i) => (
                  <tr key={h.tag} className="group hover:bg-slate-50/60 transition">
                    <td className="py-2 pl-3 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2 px-2">
                      <span className="font-semibold text-slate-800">{h.tag}</span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">{h.uses}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                      {h.avgReach >= 1000 ? `${(h.avgReach / 1000).toFixed(1)}K` : h.avgReach}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                      {h.totalReach >= 1000 ? `${(h.totalReach / 1000).toFixed(1)}K` : h.totalReach}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <span className={cn("font-semibold",
                        h.engagementRate >= 6 ? "text-emerald-600" : h.engagementRate >= 4 ? "text-amber-600" : "text-slate-500")}>
                        {h.engagementRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={cn("flex items-center justify-end gap-0.5 font-bold text-[10px]",
                        h.trend > 0 ? "text-emerald-600" : h.trend < 0 ? "text-red-500" : "text-slate-400")}>
                        {h.trend > 0 ? "▲" : h.trend < 0 ? "▼" : "—"}
                        {h.trend !== 0 && Math.abs(h.trend)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recommendations */}
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">💡 Suggerimenti AI</p>
            {[
              { icon: "🚀", text: `#${DEMO_HASHTAG_STATS[0]?.tag?.replace("#","")} è il tuo hashtag più performante — usalo in ogni post del pillar ${DEMO_HASHTAG_STATS[0]?.bestPillar ?? "cantiere"}.`, priority: "high" },
              { icon: "📉", text: `#edilizia ha un trend in calo (-12%) — sostituiscilo con varianti long tail come #impresaedileitalia o #cantiereitalia.`, priority: "medium" },
              { icon: "✨", text: `Prova ad aggiungere 2-3 hashtag niche con volume inferiore (500-5K) per migliorare il match con l'audience locale.`, priority: "low" },
            ].map((tip, i) => (
              <div key={i} className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                tip.priority === "high" ? "border-orange-200 bg-orange-50/60" : "border-slate-100 bg-slate-50/60")}>
                <span className="text-base leading-none">{tip.icon}</span>
                <p className="text-[11px] leading-relaxed text-slate-700">{tip.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: GALLERIA CONTENUTI
// ═══════════════════════════════════════════════════════════════════════════════

const FORMAT_ICONS: Record<string, string> = { "9:16": "↕", "4:5": "▬", "1:1": "▪", "16:9": "▭" };
const CATEGORY_LABELS: Record<MediaItem["category"], string> = {
  portfolio: "Portfolio", promo: "Promo", team: "Team", cantiere: "Cantiere", prodotto: "Prodotto",
};

function GalleriaTab({
  mediaItems,
  onUseInPost,
  onUseInAds,
  onUploadRequested,
}: {
  mediaItems: MediaItem[];
  onUseInPost: (item: MediaItem) => void;
  onUseInAds:  (item: MediaItem) => void;
  onUploadRequested: () => void;
}) {
  const [typeFilter, setTypeFilter]   = useState<"all" | "image" | "video" | "story">("all");
  const [catFilter,  setCatFilter]    = useState<MediaItem["category"] | "all">("all");
  const [search, setSearch]           = useState("");

  const filtered = mediaItems.filter((m) => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (catFilter  !== "all" && m.category !== catFilter) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase()) && !m.tags.some(t => t.includes(search.toLowerCase()))) return false;
    return true;
  });

  const totalUsed    = mediaItems.reduce((a, m) => a + m.usedInPosts + m.usedInAds, 0);
  const aiGenCount   = mediaItems.filter(m => m.aiGenerated).length;

  return (
    <div className="space-y-5">
      <Alert className="border-amber-200 bg-amber-50 py-2">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800">
          Galleria demo/fallback: usa un media nel composer oppure carica/genera contenuti dalla sezione Crea Post. Se il database social non e' ancora migrato, resta attivo il fallback locale.
        </AlertDescription>
      </Alert>

      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Galleria contenuti</h2>
          <p className="text-xs text-slate-500">
            {mediaItems.length} file · {aiGenCount} AI-generati · {totalUsed} utilizzi totali
          </p>
        </div>
        <Button size="sm" className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm"
          onClick={onUploadRequested}>
          <Upload className="h-3.5 w-3.5" /> Carica media
        </Button>
      </div>

      {/* ── FILTERS ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Type filter */}
        <div className="flex items-center gap-1 rounded-xl border bg-white p-1">
          {([
            { id: "all",   label: "Tutti"    },
            { id: "image", label: "Immagini" },
            { id: "video", label: "Video"    },
            { id: "story", label: "Story"    },
          ] as const).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setTypeFilter(id)}
              className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition",
                typeFilter === id ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1">
          {(["all", "portfolio", "promo", "team", "cantiere", "prodotto"] as const).map((cat) => (
            <button key={cat} type="button" onClick={() => setCatFilter(cat)}
              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
                catFilter === cat ? "border-orange-400 bg-orange-100 text-orange-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
              {cat === "all" ? "Tutte le categorie" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca…"
            className="h-8 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <Sparkles className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
        </div>
      </div>

      {/* ── GRID ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <ImagePlus className="mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">Nessun contenuto trovato</p>
          <p className="text-xs text-slate-400">Prova a cambiare i filtri o carica un nuovo file</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
              {/* Thumbnail */}
              <div className={cn("relative flex items-center justify-center bg-gradient-to-br", item.gradient,
                item.format === "9:16" ? "h-48" : item.format === "16:9" ? "h-28" : item.format === "4:5" ? "h-40" : "h-36"
              )}>
                {/* Type icon overlay */}
                {item.type === "video" && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40">
                    <Play className="h-5 w-5 text-white" />
                  </div>
                )}
                {item.type === "story" && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40">
                    <Smartphone className="h-5 w-5 text-white" />
                  </div>
                )}
                {item.type === "image" && (
                  <ImageIcon className="h-8 w-8 text-white/40" />
                )}

                {/* Badges */}
                <div className="absolute left-2 top-2 flex gap-1.5">
                  <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {FORMAT_ICONS[item.format]} {item.format}
                  </span>
                  {item.aiGenerated && (
                    <span className="rounded-full bg-orange-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      AI
                    </span>
                  )}
                </div>

                {/* Hover overlay actions */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => onUseInPost(item)}
                    className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg hover:bg-orange-50">
                    <Edit3 className="h-3.5 w-3.5 text-orange-600" /> Usa in Post
                  </button>
                  <button type="button" onClick={() => onUseInAds(item)}
                    className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg hover:bg-blue-50">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-600" /> Usa in Ads
                  </button>
                  <button type="button" onClick={() => toast.info("Download — funzione disponibile con account collegato")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-white/80 hover:text-white">
                    <Download className="h-3 w-3" /> Scarica
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-xs font-semibold text-slate-700 line-clamp-1">{item.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map(t => (
                    <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">#{t}</span>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="rounded-full border border-slate-100 px-2 py-0.5 font-medium">{CATEGORY_LABELS[item.category]}</span>
                  <div className="flex items-center gap-2">
                    {item.usedInPosts > 0 && <span className="flex items-center gap-0.5"><Edit3 className="h-2.5 w-2.5" />{item.usedInPosts}</span>}
                    {item.usedInAds  > 0 && <span className="flex items-center gap-0.5 text-blue-500"><TrendingUp className="h-2.5 w-2.5" />{item.usedInAds}</span>}
                    <span>{item.fileSize}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Upload CTA card */}
          <button type="button"
            onClick={onUploadRequested}
            className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 transition hover:border-orange-300 hover:bg-orange-50/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-pink-100">
              <ImagePlus className="h-6 w-6 text-orange-500" />
            </div>
            <p className="text-xs font-semibold text-slate-500">Aggiungi contenuto</p>
            <p className="text-[10px] text-slate-400">Upload o genera con AI</p>
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID PLANNER TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface GridCell {
  id: string;
  type: "published" | "scheduled" | "placeholder";
  gradient?: string;
  text?: string;
  image_url?: string;
  scheduled_at?: string;
  platform?: string;
  pillar?: string;
  pillarEmoji?: string;
}

// Build 18-cell grid: last 6 published (from media items) + future slots
function buildGrid(posts: ScheduledPost[]): GridCell[] {
  // Last 6 "published" from demo media as past cells
  const published: GridCell[] = DEMO_MEDIA_ITEMS.slice(0, 6).map((m, i) => ({
    id: `pub-${m.id}`,
    type: "published",
    gradient: m.gradient,
    text: m.title,
    platform: "instagram",
  }));

  // Scheduled instagram posts — deterministic gradient based on post id (no random)
  const FALLBACK_GRADIENTS = DEMO_MEDIA_ITEMS.map((m) => m.gradient);
  const deterministicGradient = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
    return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length] ?? "from-slate-400 to-slate-600";
  };

  const scheduled: GridCell[] = posts
    .filter((p) => p.platforms.includes("instagram") && (p.status === "scheduled" || p.status === "review"))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 9)
    .map((p) => ({
      id: `sched-${p.id}`,
      type: "scheduled",
      gradient: deterministicGradient(p.id),
      text: p.text,
      image_url: p.image_url,
      scheduled_at: p.scheduled_at,
      platform: "instagram",
    }));

  // Fill to at least 18 cells with placeholders
  const cells = [...published, ...scheduled];
  while (cells.length < 18) {
    cells.push({ id: `placeholder-${cells.length}`, type: "placeholder" });
  }
  return cells.slice(0, 18);
}

// Pillar color mapping for grid overlay
const PILLAR_GRADIENT: Record<string, string> = {
  cantiere: "from-sky-500/80 to-sky-700/80",
  team: "from-amber-500/80 to-amber-700/80",
  testimonianza: "from-emerald-500/80 to-emerald-700/80",
  educational: "from-orange-500/80 to-orange-700/80",
  promo: "from-red-500/80 to-red-700/80",
  portfolio: "from-violet-500/80 to-violet-700/80",
};

// Pillar keyword mapping — defined outside component to avoid recreation on every render
const PILLAR_KEYWORDS: Record<string, string[]> = {
  cantiere: ["cantiere", "lavori", "progress", "costruzione"],
  team: ["team", "squadra", "collaboratori", "operai"],
  testimonianza: ["testimonianza", "cliente", "soddisfatto", "recensione", "grazie"],
  educational: ["consiglio", "normativa", "sapevi", "faq", "guida"],
  promo: ["offerta", "promozione", "preventivo", "sconto", "gratis"],
  portfolio: ["portfolio", "completato", "prima", "dopo", "risultato", "realizzazione"],
};

function getCellPillar(cell: GridCell): string | null {
  if (cell.type !== "scheduled") return null;
  const text = (cell.text ?? "").toLowerCase();
  for (const p of CONTENT_PILLARS) {
    if (p.hashtags.some((h) => text.includes(h.toLowerCase().replace("#", "")))) return p.id;
    if (PILLAR_KEYWORDS[p.id]?.some((kw) => text.includes(kw))) return p.id;
  }
  return null;
}

function GridPlannerTab({ posts }: { posts: ScheduledPost[] }) {
  const [showLabels, setShowLabels] = useState(true);
  const [highlightPillar, setHighlightPillar] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  // Memoize grid so it doesn't rebuild on every state change (toggle labels, etc.)
  const grid = useMemo(() => buildGrid(posts), [posts]);
  // Pre-compute pillar per cell to avoid calling getCellPillar multiple times per cell
  const cellPillars = useMemo(() => {
    const map: Record<string, string | null> = {};
    grid.forEach((c) => { map[c.id] = getCellPillar(c); });
    return map;
  }, [grid]);

  const scheduledCount = grid.filter((c) => c.type === "scheduled").length;
  const publishedCount = grid.filter((c) => c.type === "published").length;

  return (
    <div className="space-y-4">
      <Alert className="border-amber-200 bg-amber-50 py-2">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800">
          Grid planner dimostrativo: i post pubblicati sono esempi, mentre bozze e revisioni locali appaiono come contenuti in programma.
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">📸 Grid Planner Instagram</h2>
          <p className="text-xs text-slate-500">
            Visualizza come apparirà il tuo profilo — {publishedCount} pubblicati · {scheduledCount} in programma
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Show labels toggle */}
          <button type="button" onClick={() => setShowLabels((v) => !v)}
            className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
              showLabels ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50")}>
            {showLabels ? "🏷 Etichette on" : "🏷 Etichette off"}
          </button>
        </div>
      </div>

      {/* Pillar filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-500">Evidenzia pillar:</span>
        <button type="button" onClick={() => setHighlightPillar(null)}
          className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition",
            highlightPillar === null ? "border-orange-400 bg-orange-100 text-orange-700" : "border-slate-200 bg-white text-slate-400 hover:border-slate-300")}>
          Tutti
        </button>
        {CONTENT_PILLARS.map((p) => (
          <button key={p.id} type="button" onClick={() => setHighlightPillar(p.id === highlightPillar ? null : p.id)}
            className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition",
              highlightPillar === p.id
                ? `${p.colorBg} ${p.colorBorder} ${p.colorText}`
                : "border-slate-200 bg-white text-slate-400 hover:border-slate-300")}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Instagram mock profile header */}
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Profile header */}
          <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-lg font-bold text-white shadow">
              🏗
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">tuaimpresaedile</p>
              <p className="text-[11px] text-slate-500">Impresa Edile · Costruzioni e Ristrutturazioni</p>
            </div>
            <div className="flex gap-4 text-center">
              <div><p className="text-sm font-bold text-slate-900">124</p><p className="text-[10px] text-slate-500">post</p></div>
              <div><p className="text-sm font-bold text-slate-900">2.4K</p><p className="text-[10px] text-slate-500">follower</p></div>
              <div><p className="text-sm font-bold text-slate-900">318</p><p className="text-[10px] text-slate-500">seguiti</p></div>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-0.5 bg-slate-200 p-0.5">
            {grid.map((cell) => {
              const pillarId = cellPillars[cell.id] ?? null;
              const pillar = CONTENT_PILLARS.find((p) => p.id === pillarId);
              const isDimmed = highlightPillar !== null && pillarId !== highlightPillar && cell.type !== "published";
              const isHighlighted = highlightPillar !== null && pillarId === highlightPillar;

              return (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => setSelectedCell(cell.id === selectedCell?.id ? null : cell)}
                  className={cn(
                    "group relative aspect-square overflow-hidden transition-all",
                    cell.type === "published" ? "bg-slate-100" : cell.type === "scheduled" ? "bg-slate-200" : "bg-slate-50",
                    isDimmed && "opacity-30",
                    isHighlighted && "ring-2 ring-inset ring-white",
                    selectedCell?.id === cell.id && "ring-2 ring-inset ring-orange-400"
                  )}
                >
                  {/* Background */}
                  {cell.type === "published" && cell.gradient && (
                    <div className={cn("absolute inset-0 bg-gradient-to-br", cell.gradient)} />
                  )}
                  {cell.type === "scheduled" && (
                    cell.image_url
                      ? <img src={cell.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      : <div className={cn("absolute inset-0 bg-gradient-to-br", cell.gradient ?? "from-slate-300 to-slate-400")} />
                  )}
                  {cell.type === "placeholder" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Plus className="h-6 w-6 text-slate-300" />
                    </div>
                  )}

                  {/* Pillar tint overlay */}
                  {pillar && highlightPillar === pillar.id && (
                    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40", PILLAR_GRADIENT[pillar.id] ?? "")} />
                  )}

                  {/* Scheduled badge */}
                  {cell.type === "scheduled" && (
                    <div className="absolute left-1 top-1">
                      <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[8px] font-bold text-slate-700 shadow-sm">
                        {cell.scheduled_at
                          ? new Date(cell.scheduled_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })
                          : "—"}
                      </span>
                    </div>
                  )}

                  {/* Pillar emoji */}
                  {pillar && showLabels && (
                    <div className="absolute right-1 top-1">
                      <span className="text-sm">{pillar.emoji}</span>
                    </div>
                  )}

                  {/* Text overlay on hover */}
                  {showLabels && cell.text && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="line-clamp-2 text-[9px] leading-tight text-white">{cell.text}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected cell detail */}
      {selectedCell && selectedCell.type !== "placeholder" && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              {selectedCell.type === "published" ? "📌 Post pubblicato" : "⏳ Post programmato"}
            </p>
            <button type="button" onClick={() => setSelectedCell(null)} className="rounded-full p-1 text-slate-400 hover:bg-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {selectedCell.scheduled_at && (
            <p className="text-xs text-slate-600">
              📅 {new Date(selectedCell.scheduled_at).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {selectedCell.text && (
            <p className="text-sm text-slate-700">{selectedCell.text}</p>
          )}
          {(() => {
            const pid = cellPillars[selectedCell.id];
            const p = pid ? CONTENT_PILLARS.find((p) => p.id === pid) : null;
            return p ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", p.colorBg, p.colorBorder, p.colorText)}>
                {p.emoji} {p.label}
              </span>
            ) : null;
          })()}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <span className="text-[11px] font-bold text-slate-500">Legenda:</span>
        {[
          { label: "Pubblicato", color: "bg-slate-400" },
          { label: "Programmato", color: "bg-orange-400" },
          { label: "Libero", color: "bg-slate-200 border border-dashed border-slate-300" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm", color)} />
            <span className="text-[10px] text-slate-600">{label}</span>
          </div>
        ))}
        {CONTENT_PILLARS.map((p) => (
          <div key={p.id} className="flex items-center gap-1">
            <span className="text-xs">{p.emoji}</span>
            <span className="text-[10px] text-slate-600">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX TAB
// ═══════════════════════════════════════════════════════════════════════════════

type InboxItemType = "comment" | "dm" | "mention" | "review";
type InboxStatus = "unread" | "read" | "replied" | "archived";

interface InboxItem {
  id: string;
  type: InboxItemType;
  platform: string;
  authorName: string;
  authorAvatar: string;   // initials placeholder
  postPreview?: string;
  message: string;
  sentiment: "positive" | "neutral" | "negative";
  status: InboxStatus;
  timestamp: string;      // ISO
  starred: boolean;
}

const DEMO_INBOX: InboxItem[] = [
  { id: "i1", type: "comment", platform: "instagram", authorName: "Marco Bianchi", authorAvatar: "MB", postPreview: "5 errori che fanno perdere soldi in cantiere", message: "Ottimo consiglio sul punto 3! Ne parlavo proprio con il mio capocantiere ieri 👏", sentiment: "positive", status: "unread", timestamp: new Date(Date.now() - 12 * 60000).toISOString(), starred: false },
  { id: "i2", type: "dm", platform: "instagram", authorName: "Lucia Ferrari", authorAvatar: "LF", message: "Ciao! Vorrei un preventivo per una ristrutturazione bagno 15mq. Potete mandarmi qualche info?", sentiment: "neutral", status: "unread", timestamp: new Date(Date.now() - 35 * 60000).toISOString(), starred: true },
  { id: "i3", type: "comment", platform: "facebook", authorName: "Giuseppe Russo", authorAvatar: "GR", postPreview: "Il cantiere di Via Roma è completato!", message: "Complimenti ragazzi, lavoro impeccabile! Lo consiglio a tutti 🌟🌟🌟🌟🌟", sentiment: "positive", status: "read", timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), starred: false },
  { id: "i4", type: "review", platform: "facebook", authorName: "Anna Martini", authorAvatar: "AM", message: "Professionalità alta ma i tempi sono stati più lunghi del previsto. 3 stelle.", sentiment: "negative", status: "unread", timestamp: new Date(Date.now() - 5 * 3600000).toISOString(), starred: false },
  { id: "i5", type: "mention", platform: "linkedin", authorName: "Costruzioni Riva Srl", authorAvatar: "CR", postPreview: "Le migliori imprese edili della Lombardia", message: "@TuaImpresaEdile citata come eccellenza per qualità dei materiali e rispetto dei tempi.", sentiment: "positive", status: "unread", timestamp: new Date(Date.now() - 6 * 3600000).toISOString(), starred: false },
  { id: "i6", type: "dm", platform: "facebook", authorName: "Roberto Conti", authorAvatar: "RC", message: "Buongiorno, avete disponibilità per un sopralluogo la prossima settimana? Devo ristrutturare un appartamento 80mq.", sentiment: "neutral", status: "replied", timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), starred: false },
  { id: "i7", type: "comment", platform: "instagram", authorName: "Silvia Greco", authorAvatar: "SG", postPreview: "Come gestiamo 12 cantieri contemporaneamente", message: "Sarebbe interessante sapere che software usate per gestire tutto! 🤔", sentiment: "neutral", status: "read", timestamp: new Date(Date.now() - 1.5 * 86400000).toISOString(), starred: false },
  { id: "i8", type: "review", platform: "facebook", authorName: "Famiglia Moro", authorAvatar: "FM", message: "Lavori eseguiti a regola d'arte, massima puntualità e pulizia del cantiere. Consigliamo vivamente! ⭐⭐⭐⭐⭐", sentiment: "positive", status: "read", timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), starred: true },
  { id: "i9", type: "dm", platform: "instagram", authorName: "Ing. Paolo Neri", authorAvatar: "PN", message: "Ho visto il vostro lavoro su Instagram. Sono un ingegnere e sto cercando una squadra affidabile per un progetto importante.", sentiment: "positive", status: "archived", timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), starred: false },
];

const INBOX_TYPE_CONFIG: Record<InboxItemType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  comment:  { label: "Commento", icon: "💬", color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200"   },
  dm:       { label: "DM",       icon: "✉️",  color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200" },
  mention:  { label: "Menzione", icon: "📣",  color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200" },
  review:   { label: "Recensione",icon:"⭐",  color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200"  },
};

const SENTIMENT_CONFIG: Record<InboxItem["sentiment"], { icon: string; color: string }> = {
  positive: { icon: "😊", color: "text-emerald-500" },
  neutral:  { icon: "😐", color: "text-slate-400"   },
  negative: { icon: "😟", color: "text-red-400"     },
};

function InboxTab({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const [items, setItems] = useState<InboxItem[]>(DEMO_INBOX);
  const [filterType, setFilterType] = useState<InboxItemType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<InboxStatus | "all">("all");
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Notify parent when unread count changes so the tab badge stays in sync
  useEffect(() => {
    const unread = items.filter((i) => i.status === "unread").length;
    onUnreadChange?.(unread);
  }, [items, onUnreadChange]);

  const markRead = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.status === "unread" ? { ...i, status: "read" } : i)));

  const toggleStar = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, starred: !i.starred } : i)));

  const archive = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "archived" } : i)));

  const sendReply = (id: string) => {
    if (!replyText.trim()) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "replied" } : i)));
    toast.success("Risposta inviata", { description: "Il messaggio è stato consegnato sulla piattaforma." });
    setReplyText("");
    setSelectedId(null);
  };

  const filteredItems = items.filter((i) => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterPlatform && i.platform !== filterPlatform) return false;
    return true;
  });

  const unreadCount = items.filter((i) => i.status === "unread").length;
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 3600000) return `${Math.round(diff / 60000)}m fa`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h fa`;
    return `${Math.round(diff / 86400000)}g fa`;
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-200 bg-amber-50 py-2">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800">
          Inbox demo locale: le risposte non vengono inviate alle piattaforme finché non è collegata l&apos;integrazione social live.
        </AlertDescription>
      </Alert>

      {/* ── HEADER STATS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Da leggere",  value: items.filter((i) => i.status === "unread").length,   color: "text-orange-600", bg: "bg-orange-50"  },
          { label: "Commenti",    value: items.filter((i) => i.type === "comment").length,     color: "text-blue-600",   bg: "bg-blue-50"    },
          { label: "DM ricevuti", value: items.filter((i) => i.type === "dm").length,          color: "text-violet-600", bg: "bg-violet-50"  },
          { label: "Recensioni",  value: items.filter((i) => i.type === "review").length,      color: "text-amber-600",  bg: "bg-amber-50"   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("flex items-center gap-3 rounded-2xl border border-slate-100 p-3", bg)}>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
            <p className="text-[11px] leading-tight text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ── FILTERS ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type */}
        <div className="flex items-center gap-1 rounded-xl border bg-white p-1">
          {([
            { id: "all",      label: "Tutti"     },
            { id: "comment",  label: "💬 Comm."  },
            { id: "dm",       label: "✉️ DM"     },
            { id: "mention",  label: "📣 Menz."  },
            { id: "review",   label: "⭐ Recens." },
          ] as const).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setFilterType(id)}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                filterType === id ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 rounded-xl border bg-white p-1">
          {([
            { id: "all",      label: "Tutti"      },
            { id: "unread",   label: "Da leggere" },
            { id: "replied",  label: "Risposti"   },
            { id: "archived", label: "Archivio"   },
          ] as const).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setFilterStatus(id)}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                filterStatus === id ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>

        {/* Platform */}
        {PLATFORMS.map((p) => (
          <button key={p.id} type="button" onClick={() => setFilterPlatform(p.id === filterPlatform ? null : p.id)}
            className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
              filterPlatform === p.id
                ? `border-transparent text-white bg-gradient-to-r ${p.gradient}`
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
            <span className="text-[10px]">{p.icon}</span>{p.shortName}
          </button>
        ))}

        <div className="ml-auto text-[11px] text-slate-400">
          {filteredItems.length} messaggi{unreadCount > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount} nuovi</span>}
        </div>
      </div>

      {/* ── LIST + DETAIL PANE ───────────────────────────────────────────── */}
      <div className="flex gap-4">

        {/* List */}
        <div className={cn("flex-1 space-y-2 overflow-y-auto", selectedItem ? "max-h-[600px]" : "")}>
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
              <MessageSquare className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">Nessun messaggio trovato</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const tc = INBOX_TYPE_CONFIG[item.type];
              const sc = SENTIMENT_CONFIG[item.sentiment];
              const platform = PLATFORMS.find((p) => p.id === item.platform);
              const isSelected = selectedId === item.id;
              const isUnread = item.status === "unread";

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(isSelected ? null : item.id);
                    markRead(item.id);
                    setReplyText("");
                  }}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition-all",
                    isSelected
                      ? "border-orange-300 bg-orange-50 shadow-sm"
                      : isUnread
                        ? "border-orange-100 bg-white shadow-sm ring-2 ring-orange-100"
                        : "border-slate-100 bg-white hover:border-slate-200"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", platform ? `bg-gradient-to-br ${platform.gradient}` : "bg-slate-400")}>
                      {item.authorAvatar}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{item.authorName}</span>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold", tc.bg, tc.border, tc.color)}>
                          {tc.icon} {tc.label}
                        </span>
                        {platform && (
                          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold text-white bg-gradient-to-br", platform.gradient)}>
                            {platform.icon}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[10px] text-slate-400">{timeAgo(item.timestamp)}</span>
                      </div>

                      {item.postPreview && (
                        <p className="mb-0.5 truncate text-[10px] text-slate-400 italic">↩ {item.postPreview}</p>
                      )}

                      <p className="line-clamp-2 text-xs text-slate-600">{item.message}</p>

                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={cn("text-sm", sc.color)}>{sc.icon}</span>
                        {item.status === "replied" && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">✓ Risposto</span>}
                        {item.status === "unread" && <span className="h-2 w-2 rounded-full bg-orange-500" />}
                        {item.starred && <span className="text-amber-400 text-xs">★</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail / Reply pane */}
        {selectedItem && (() => {
          const tc = INBOX_TYPE_CONFIG[selectedItem.type];
          const sc = SENTIMENT_CONFIG[selectedItem.sentiment];
          const platform = PLATFORMS.find((p) => p.id === selectedItem.platform);

          return (
            <div className="w-80 shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* Close */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">Dettaglio</p>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white", platform ? `bg-gradient-to-br ${platform.gradient}` : "bg-slate-400")}>
                  {selectedItem.authorAvatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{selectedItem.authorName}</p>
                  <div className="flex items-center gap-1.5">
                    {platform && <span className="text-xs">{platform.icon} {platform.name}</span>}
                    <span className={cn("text-[9px]", tc.color)}>{tc.icon} {tc.label}</span>
                  </div>
                </div>
              </div>

              {/* Message */}
              <div className={cn("rounded-xl border p-3 text-sm text-slate-700", tc.bg, tc.border)}>
                {selectedItem.postPreview && (
                  <p className="mb-1.5 text-[10px] italic text-slate-400">In risposta a: {selectedItem.postPreview}</p>
                )}
                <p>{selectedItem.message}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className={sc.color}>{sc.icon}</span>
                  <span>Sentiment: {selectedItem.sentiment === "positive" ? "positivo" : selectedItem.sentiment === "negative" ? "negativo" : "neutro"}</span>
                  <span>·</span>
                  <span>{new Date(selectedItem.timestamp).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleStar(selectedItem.id)}
                  className={cn("flex-1 rounded-xl border py-1.5 text-xs font-semibold transition",
                    selectedItem.starred ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                  {selectedItem.starred ? "★ Salvato" : "☆ Salva"}
                </button>
                <button type="button" onClick={() => { archive(selectedItem.id); setSelectedId(null); }}
                  className="flex-1 rounded-xl border border-slate-200 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50">
                  📁 Archivia
                </button>
              </div>

              {/* Reply */}
              {(selectedItem.type === "comment" || selectedItem.type === "dm" || selectedItem.type === "review") && selectedItem.status !== "archived" && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder={selectedItem.type === "dm" ? "Scrivi la tua risposta..." : selectedItem.type === "review" ? "Ringrazia o rispondi alla recensione..." : "Rispondi al commento..."}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="resize-none rounded-xl text-xs"
                  />
                  <button type="button" onClick={() => sendReply(selectedItem.id)} disabled={!replyText.trim()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2 text-xs font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" /> Invia risposta
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK SCHEDULE MODAL
// ═══════════════════════════════════════════════════════════════════════════════

type BulkPost = SocialBulkPost;

const CSV_EXAMPLE = `piattaforme,testo,hashtag,data_ora,immagine_url
instagram;facebook,"Cantiere completato in Via Roma! Qualità e precisione come sempre.","#cantiere #lavorifiniti #impresaedile",2026-06-02T09:00,
instagram,"Buongiorno dal team! Oggi inizia un nuovo progetto entusiasmante 🏗️","#teamwork #costruzioni",2026-06-03T10:30,
facebook;linkedin,"Consiglio della settimana: controllate sempre il meteo prima di pianificare i lavori in quota.","#consigliutili #edilizia #sicurezza",2026-06-04T11:00,`;

function BulkScheduleModal({
  onImport,
  onClose,
}: {
  onImport: (post: ScheduledPost) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<BulkPost[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCsv = (raw: string): BulkPost[] => parseSocialBulkCsv(raw, PLATFORMS);

  const handlePreview = () => {
    const rows = parseCsv(csvText);
    setParsed(rows);
    setStep("preview");
  };

  const handleImport = () => {
    const validPosts: ScheduledPost[] = parsed
      .filter((p) => p.status === "ok")
      .map((p, i) => ({
        id: `bulk-${Date.now()}-${i}`,
        platforms: p.platforms,
        contentType: "post",
        text: p.text,
        hashtags: p.hashtags,
        scheduled_at: p.scheduled_at,
        image_url: p.image_url,
        status: "scheduled" as const,
        created_at: new Date().toISOString(),
      }));
    validPosts.forEach((post) => { void onImport(post); });
    setStep("done");
  };

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setCsvText((e.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
  };

  const okCount = parsed.filter((p) => p.status === "ok").length;
  const errCount = parsed.filter((p) => p.status === "error").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">📅 Import bulk post da CSV</h2>
            <p className="text-xs text-slate-500">Carica fino a 30 post programmati in una volta sola</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">

          {step === "input" && (
            <>
              {/* Format guide */}
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
                <p className="text-xs font-bold text-orange-700">📋 Formato CSV richiesto</p>
                <p className="text-[11px] text-slate-600">Colonne (separatore virgola, valori con spazi tra virgolette):</p>
                <div className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2">
                  <code className="whitespace-pre font-mono text-[10px] text-emerald-400">{`piattaforme,testo,hashtag,data_ora,immagine_url

• piattaforme: instagram;facebook;linkedin (sep. ;)
• testo:       tra "virgolette" se contiene virgole
• hashtag:     #hashtag1 #hashtag2 (spazio-separati)
• data_ora:    2026-06-02T09:00  (ISO 8601)
• immagine_url: URL https o vuoto`}</code>
                </div>
              </div>

              {/* Paste / upload area */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Incolla il contenuto CSV o carica file:</label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setCsvText(CSV_EXAMPLE)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50">
                      Carica esempio
                    </button>
                    <button type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50">
                      <Upload className="h-3 w-3" /> .csv
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
                  </div>
                </div>
                <Textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Incolla qui il tuo CSV…"
                  className="resize-none font-mono text-xs"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {csvText.trim() ? Math.max(0, csvText.trim().split(/\r?\n/).filter((l) => l.trim()).length - 1) : 0} righe rilevate (esclusa intestazione)
                </p>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              {parsed.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 py-6 text-center">
                  <span className="text-2xl">⚠️</span>
                  <p className="text-sm font-semibold text-red-700">Nessuna riga trovata nel CSV</p>
                  <p className="text-xs text-slate-500">Controlla che il file abbia l'intestazione corretta e almeno una riga di dati.</p>
                </div>
              ) : (
              <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2",
                errCount === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
                <span className="text-lg">{errCount === 0 ? "✅" : "⚠️"}</span>
                <div className="text-sm">
                  <span className="font-bold text-emerald-700">{okCount} post validi</span>
                  {errCount > 0 && <span className="ml-2 font-bold text-red-600">{errCount} con errori (verranno saltati)</span>}
                </div>
              </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {parsed.map((p) => (
                  <div key={p.row} className={cn("flex items-start gap-3 rounded-xl border p-3 text-xs",
                    p.status === "ok" ? "border-slate-100 bg-white" : "border-red-200 bg-red-50")}>
                    <span className={cn("shrink-0 font-bold", p.status === "ok" ? "text-emerald-500" : "text-red-500")}>
                      {p.status === "ok" ? "✓" : "✗"} R{p.row}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        {p.platforms.map((pid) => {
                          const pl = PLATFORMS.find((x) => x.id === pid);
                          return pl ? (
                            <span key={pid} className={cn("flex h-4 w-4 items-center justify-center rounded text-[7px] text-white bg-gradient-to-br", pl.gradient)}>
                              {pl.icon}
                            </span>
                          ) : null;
                        })}
                        <span className="text-slate-400">
                          {new Date(p.scheduled_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {p.status === "error"
                        ? <p className="text-red-600 font-semibold">⚠ {p.errorMsg}</p>
                        : <p className="line-clamp-1 text-slate-700">{p.text}</p>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
              <div>
                <p className="text-lg font-bold text-slate-800">{okCount} post importati!</p>
                <p className="text-sm text-slate-500">Puoi vederli nel Calendario e modificarli singolarmente.</p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50">
            {step === "done" ? "Chiudi" : "Annulla"}
          </button>

          {step === "input" && (
            <button type="button" onClick={handlePreview} disabled={!csvText.trim()}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40">
              Anteprima →
            </button>
          )}
          {step === "preview" && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("input")}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                ← Modifica
              </button>
              <button type="button" onClick={handleImport} disabled={okCount === 0}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40">
                ✓ Importa {okCount} post
              </button>
            </div>
          )}
        </div>
      </div>
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
  const { effectiveCompany } = useAuthCompany();
  const companyId = effectiveCompany?.id ?? DEMO_COMPANY_ID;
  const socialData = useSocialManagerData(companyId);
  const {
    connectedAccounts,
    posts,
    mediaItems: storedMediaItems,
    addPost,
    updatePost,
    addMedia,
    isDbBacked,
  } = socialData;
  const mediaItems = useMemo(
    () => storedMediaItems.length > 0 ? storedMediaItems : DEMO_MEDIA_ITEMS,
    [storedMediaItems],
  );
  const [selectedMediaForComposer, setSelectedMediaForComposer] = useState<MediaItem | null>(null);

  const setTab = useCallback((tab: string) => setSearchParams({ tab }, { replace: true }), [setSearchParams]);
  const goToIntegrations = useCallback(() => navigate("/azienda/impostazioni/integrazioni"), [navigate]);

  const handlePostScheduled = useCallback((post: ScheduledPost) => {
    void addPost(post);
  }, [addPost]);

  const handleUpdatePost = useCallback((id: string, changes: Partial<ScheduledPost>) => {
    void updatePost(id, changes);
  }, [updatePost]);

  const handleUseInPost = useCallback((item: MediaItem) => {
    setSelectedMediaForComposer(item);
    setTab("crea-post");
    toast.success(`"${item.title}" selezionato`, { description: "Il media e' gia' pronto nel composer." });
  }, [setTab]);

  const handleUseInAds = useCallback((item: MediaItem) => {
    navigate("/azienda/marketing/pubblicita?tab=creativita");
    toast.success(`"${item.title}" → Ads Manager`, { description: "Selezionalo come creativa nella campagna." });
  }, [navigate]);

  const handleUploadRequested = useCallback(() => {
    setTab("crea-post");
    toast.info("Apri la sezione Media del composer per upload o generazione AI.");
  }, [setTab]);

  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const reviewCount    = posts.filter((p) => p.status === "review").length;
  const mediaCount     = mediaItems.length;
  // inboxUnread is kept in sync by InboxTab via onUnreadChange callback
  const [inboxUnread, setInboxUnread] = useState(() => DEMO_INBOX.filter((i) => i.status === "unread").length);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const tabs = [
    { id: "crea-post",  label: "Crea Post",  icon: Edit3          },
    { id: "calendario", label: "Calendario", icon: Calendar,       badge: reviewCount > 0 ? `${reviewCount} ⏳` : (scheduledCount > 0 ? scheduledCount : undefined) },
    { id: "grid",       label: "Grid 📸",    icon: Smartphone      },
    { id: "inbox",      label: "Inbox",      icon: MessageSquare,  badge: inboxUnread > 0 ? inboxUnread : undefined },
    { id: "analitiche", label: "Analitiche", icon: TrendingUp      },
    { id: "galleria",   label: "Galleria",   icon: Library,        badge: mediaCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">

        {/* ─── PAGE HEADER ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white">Beta</Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-500">
                {isDbBacked ? "Dati azienda" : "Demo Azienda"}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Gestione Social</h1>
            <p className="mt-1 text-sm text-slate-500">Crea, programma e pubblica contenuti su tutte le tue pagine social.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={goToIntegrations} className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Connessioni
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-sm"
              onClick={() => setTab("crea-post")}>
              <Plus className="h-3.5 w-3.5" /> Crea post
            </Button>
          </div>
        </div>

        {/* ─── BULK SCHEDULE MODAL ─────────────────────────────────────── */}
        {bulkModalOpen && (
          <BulkScheduleModal
            onImport={handlePostScheduled}
            onClose={() => setBulkModalOpen(false)}
          />
        )}

        {/* ─── PLATFORM RIBBON ─────────────────────────────────────────── */}
        <PlatformStatusRibbon connectedAccounts={connectedAccounts} onGoToSettings={goToIntegrations} />

        {/* ─── TABS ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b scrollbar-none">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold transition-colors",
                  activeTab === id ? "border-orange-500 text-orange-700" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
                <Icon className="h-4 w-4" />
                {label}
                {badge != null && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    activeTab === id ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600")}>{badge}</span>
                )}
              </button>
            ))}
          </div>
          <div className="p-4 md:p-6">
            {activeTab === "crea-post" && (
              <ContentStudioTab
                companyId={companyId}
                connectedAccounts={connectedAccounts}
                selectedMedia={selectedMediaForComposer}
                onSelectedMediaConsumed={() => setSelectedMediaForComposer(null)}
                onPostScheduled={handlePostScheduled}
                onMediaStored={addMedia}
              />
            )}
            {activeTab === "calendario" && (
              <CalendarioTab posts={posts} onNewPost={() => setTab("crea-post")} onUpdatePost={handleUpdatePost} />
            )}
            {activeTab === "grid" && (
              <GridPlannerTab posts={posts} />
            )}
            {activeTab === "inbox" && (
              <InboxTab onUnreadChange={setInboxUnread} />
            )}
            {activeTab === "analitiche" && (
              <AnaliticsTab connectedAccounts={connectedAccounts} />
            )}
            {activeTab === "galleria" && (
              <GalleriaTab mediaItems={mediaItems} onUseInPost={handleUseInPost} onUseInAds={handleUseInAds} onUploadRequested={handleUploadRequested} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
