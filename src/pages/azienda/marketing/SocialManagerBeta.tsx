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
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  Film,
  Hash,
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
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  TrendingUp,
  Upload,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { cn } from "@/lib/utils";
import { useAdsAi } from "@/hooks/useAdsAi";
import { useAuthCompany, useAuthUser } from "@/contexts/AuthContext";
import { AdMediaUploader } from "@/components/ads/AdMediaUploader";
import { SocialMediaUploader } from "@/components/social/SocialMediaUploader";
import { StatistichePagineSocial } from "@/components/social/StatistichePagineSocial";
import { useSocialManagerData } from "@/hooks/useSocialManagerData";
import { useStatoPubblicazioneSocial } from "@/hooks/useStatoPubblicazioneSocial";
import {
  describePublishResult,
  metaAccountsFor,
  parseSocialBulkCsv,
  SOCIAL_LIVE_PUBLISHING_ENABLED,
  validateMetaPublishTargets,
  validateSocialDraft,
  type SocialBulkPost,
} from "@/lib/social/publishing";
import { ensureRemoteSocialMedia } from "@/lib/social/mediaUpload";
import { getSocialMediaPreviewUrl } from "@/lib/social/storage";
import {
  motivoComune,
  motivoPiattaforma,
  paginePronte,
  piattaformePronte,
  spiegaMotivo,
  type StatoPubblicazioneSocial,
} from "@/lib/social/statoPubblicazione";
import type {
  SocialMediaItem,
  SocialPostMedia,
  SocialPublishResultEntry,
  SocialScheduledPost,
} from "@/lib/social/types";

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
    tips: "Il formato verticale 4:5 occupa più spazio nel feed di Instagram e si nota di più.",
  },
  {
    id: "story",
    label: "Storia",
    icon: Smartphone,
    aspectRatio: "9:16",
    previewH: 160,
    previewW: 90,
    supportedBy: ["facebook", "instagram"],
    desc: "Resta 24 ore",
    hashtagsAllowed: false,
    tips: "Le storie restano 24 ore: testo breve e un invito chiaro, come «Scrivici per un sopralluogo».",
  },
  {
    id: "reel",
    label: "Reel",
    icon: Film,
    aspectRatio: "9:16",
    previewH: 160,
    previewW: 90,
    supportedBy: ["facebook", "instagram"],
    desc: "Video breve, fino a 90 secondi",
    hashtagsAllowed: true,
    maxDuration: "90s",
    tips: "I Reel arrivano a più persone delle foto: mostra il risultato nei primi 3 secondi.",
  },
  {
    id: "carosello",
    label: "Carosello",
    icon: Layers,
    aspectRatio: "1:1",
    previewH: 100,
    previewW: 100,
    supportedBy: ["facebook", "instagram", "linkedin"],
    desc: "Da 2 a 10 foto",
    hashtagsAllowed: true,
    tips: "Da 2 a 10 foto da sfogliare: perfetto per il prima e dopo. La prima deve incuriosire.",
  },
  {
    id: "video",
    label: "Video",
    icon: Play,
    aspectRatio: "16:9",
    previewH: 90,
    previewW: 160,
    supportedBy: ["facebook", "instagram", "linkedin", "youtube", "tiktok"],
    desc: "Video orizzontale",
    hashtagsAllowed: true,
    tips: "Per YouTube metti all'inizio del titolo le parole che la gente cerca. Su LinkedIn un video caricato va meglio di un link.",
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
    description: "Lavori in corso, avanzamento, prima e dopo",
    hashtags: ["#cantiere", "#lavoriincorso", "#costruzioni", "#impresaedile", "#realizzazioni"],
    promptHint: "Mostra i lavori in corso nel cantiere, racconta il progresso, prima e dopo i lavori.",
    suggestedContentType: "post",
    weeklyFreq: 3,
  },
  {
    id: "team",
    label: "Squadra",
    emoji: "👷",
    color: "bg-amber-500",
    colorText: "text-amber-700",
    colorBorder: "border-amber-300",
    colorBg: "bg-amber-50",
    description: "La tua squadra, la vostra storia, il dietro le quinte",
    hashtags: ["#teamwork", "#artigiani", "#impresaedile", "#squadra", "#passioneedile"],
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
    label: "Consigli",
    emoji: "📚",
    color: "bg-orange-500",
    colorText: "text-orange-700",
    colorBorder: "border-orange-300",
    colorBg: "bg-orange-50",
    description: "Consigli pratici, normative, FAQ",
    hashtags: ["#consigliutili", "#edilizia", "#sapevi", "#normative", "#guidapratica"],
    promptHint: "Condividi un consiglio pratico, spiega una normativa edilizia o rispondi a una domanda frequente dei clienti.",
    suggestedContentType: "carosello",
    weeklyFreq: 2,
  },
  {
    id: "promo",
    label: "Offerte",
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
    label: "Lavori finiti",
    emoji: "✨",
    color: "bg-violet-500",
    colorText: "text-violet-700",
    colorBorder: "border-violet-300",
    colorBg: "bg-violet-50",
    description: "Lavori completati, prima e dopo",
    hashtags: ["#portfolio", "#progettorealizzato", "#ristrutturazione", "#risultati", "#primadopo"],
    promptHint: "Mostra un progetto completato con le foto del risultato finale, descrivi il lavoro svolto e il valore creato.",
    suggestedContentType: "carosello",
    weeklyFreq: 2,
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScheduledPost = SocialScheduledPost;
type MediaItem = SocialMediaItem;

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

// ─── Stato delle pagine ────────────────────────────────────────────────────────
// «Collegata» vuol dire «può pubblicare adesso»: lo dice il database
// (stato_pubblicazione_social), pagina per pagina, con il motivo se no.
// Prima bastava una riga in social_accounts: anche con l'accesso scaduto o
// senza il permesso di Meta la pagina risultava «collegata».

function PlatformStatusRibbon({
  stato,
  isLoading,
  error,
  onRiprova,
  staVerificando,
  verificaNonRiuscita,
  onGoToSettings,
}: {
  stato: StatoPubblicazioneSocial | null;
  isLoading: boolean;
  error: Error | null;
  onRiprova: () => void;
  staVerificando: boolean;
  verificaNonRiuscita: boolean;
  onGoToSettings: () => void;
}) {
  if (isLoading) {
    return <div className="h-11 animate-pulse rounded-2xl border border-slate-100 bg-white" aria-label="Carico lo stato delle pagine" />;
  }

  if (error || !stato) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5">
        <span className="flex items-start gap-2 text-xs font-medium text-red-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Non riesco a sapere se le pagine possono pubblicare.{error?.message ? ` ${error.message}` : ""}
        </span>
        <Button size="sm" variant="outline" onClick={onRiprova}
          className="h-7 shrink-0 gap-1.5 border-red-200 bg-white text-red-700 hover:bg-red-100">
          <RefreshCw className="h-3 w-3" /> Riprova
        </Button>
      </div>
    );
  }

  const pagine = stato.pagine;
  if (pagine.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 px-4 py-3 shadow-sm">
        <span className="text-xs font-medium text-amber-800">
          Nessuna pagina collegata: collega Facebook e Instagram per pubblicare da qui.
        </span>
        <Button size="sm" variant="outline" onClick={onGoToSettings}
          className="shrink-0 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-50">
          <Settings className="h-3.5 w-3.5" /> Collega Meta
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const pronte = pagine.filter((p) => p.puoPubblicare).length;
  const tutteOk = pronte === pagine.length;
  const comune = motivoComune(stato);
  // Un motivo comune a tutte le pagine si dice una volta; altrimenti pagina per pagina.
  const spiegazioni = comune
    ? [{ ...spiegaMotivo(comune, { verificaNonRiuscita }), nome: undefined as string | undefined }]
    : pagine
      .filter((p) => !p.puoPubblicare)
      .map((p) => ({ ...spiegaMotivo(p.motivo, { verificaNonRiuscita }), nome: p.nome as string | undefined }));
  const serveRicollegare = spiegazioni.some((s) => s.azione === "ricollega");
  const titolo = pronte === 0
    ? "Nessuna pagina può pubblicare adesso"
    : tutteOk
      ? (pronte === 1 ? "1 pagina pronta a pubblicare" : `${pronte} pagine pronte a pubblicare`)
      : `${pronte} ${pronte === 1 ? "pagina" : "pagine"} su ${pagine.length} ${pronte === 1 ? "pronta" : "pronte"} a pubblicare`;

  return (
    <div className={cn(
      "space-y-2 rounded-2xl border px-4 py-2.5 shadow-sm",
      tutteOk ? "border-emerald-100 bg-gradient-to-r from-emerald-50 to-white" : "border-amber-200 bg-amber-50/70",
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", tutteOk ? "text-emerald-700" : "text-amber-800")}>
          {tutteOk ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {titolo}
        </span>
        {pagine.map((pagina) => {
          const piattaforma = PLATFORMS.find((p) => p.id === pagina.piattaforma);
          const spiegazione = spiegaMotivo(pagina.motivo, { verificaNonRiuscita });
          const inVerifica = staVerificando && pagina.motivo === "permessi_da_verificare";
          return (
            <span
              key={pagina.id || `${pagina.piattaforma}-${pagina.pageId}`}
              title={`${piattaforma?.name ?? pagina.piattaforma} · ${pagina.nome}: ${spiegazione.lungo}`}
              className={cn(
                "flex max-w-full items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium",
                pagina.puoPubblicare ? "border-slate-100 text-slate-700 shadow-sm" : "border-amber-200 text-slate-600",
              )}
            >
              <span className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br text-[8px] font-bold text-white",
                piattaforma?.gradient ?? "from-slate-300 to-slate-400",
              )}>
                {piattaforma?.icon ?? "?"}
              </span>
              <span className="truncate">{pagina.nome}</span>
              {pagina.puoPubblicare
                ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                : inVerifica
                  ? <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-slate-400" />
                  : <span className="shrink-0 text-[10px] text-amber-700">{spiegazione.breve}</span>}
            </span>
          );
        })}
        <button type="button" onClick={onGoToSettings} className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
          <Settings className="h-3 w-3" /> Gestisci
        </button>
      </div>
      {!tutteOk && spiegazioni.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1 space-y-0.5">
            {spiegazioni.map((s) => (
              <p key={`${s.nome ?? ""}-${s.lungo}`} className="text-[11px] text-amber-800">
                {s.nome && <strong className="font-semibold">{s.nome}.</strong>} {s.lungo}
              </p>
            ))}
          </div>
          {serveRicollegare && (
            <Button size="sm" variant="outline" onClick={onGoToSettings}
              className="h-7 shrink-0 gap-1.5 border-amber-300 bg-white text-[11px] text-amber-800 hover:bg-amber-100">
              <Settings className="h-3 w-3" /> Ricollega Meta
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: "Bozza",        dot: "bg-slate-400",   pill: "border-slate-200 bg-slate-50 text-slate-600",     calBg: "bg-slate-100 text-slate-600" },
  review:    { label: "In revisione", dot: "bg-amber-400",   pill: "border-amber-200 bg-amber-50 text-amber-700",     calBg: "bg-amber-50 text-amber-700 border border-amber-200" },
  scheduled: { label: "Programmato",  dot: "bg-blue-400",    pill: "border-blue-200 bg-blue-50 text-blue-700",        calBg: "bg-blue-50 text-blue-700 border border-blue-100" },
  processing: { label: "In pubblicazione", dot: "bg-violet-400", pill: "border-violet-200 bg-violet-50 text-violet-700", calBg: "bg-violet-50 text-violet-700 border border-violet-100" },
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

  // Chiave data LOCALE "YYYY-MM-DD" — coerente con la griglia mese che usa
  // currentYear/currentMonth/day locali. Prima usava toISOString() (UTC), che
  // spostava i post nel giorno sbagliato vicino a mezzanotte (es. UTC+2).
  const toLocalDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Group by date key "YYYY-MM-DD" (locale). Le date non valide/mancanti
  // vengono saltate per non far crashare il reduce.
  const postsByDate = filteredPosts.reduce<Record<string, ScheduledPost[]>>((acc, p) => {
    const t = new Date(p.scheduled_at);
    if (Number.isNaN(t.getTime())) return acc;
    const key = toLocalDateKey(t);
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
    const dateKey = toLocalDateKey(date);
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
    { label: "Falliti",            value: posts.filter((p) => p.status === "failed").length,     color: "text-red-600",     bg: "bg-red-50"     },
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
                            {post.hashtags.slice(0, 5).join(" ")}
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
                      const dateKey = toLocalDateKey(d);
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
                            {describePublishResult(p.publishResult).slice(0, 3).map((issue) => (
                              <p
                                key={issue.text}
                                className={cn(
                                  "mt-1 text-[10px] leading-snug",
                                  issue.tone === "error" ? "text-red-600" : issue.tone === "warning" ? "text-amber-700" : "text-violet-700",
                                )}
                              >
                                {issue.text}
                              </p>
                            ))}
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
// TAB: CREA POST — tre passi: dove, cosa, quando (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Prima era una colonna di otto schede (argomenti, formato, brief AI, testo,
// hashtag, media, programmazione, limiti tecnici), con Facebook e Instagram
// scelti in partenza anche quando non potevano pubblicare. Ora tre passi;
// formato, argomento, testo per piattaforma e primo commento stanno in
// «Opzioni avanzate», chiuse. Si parte dalle sole piattaforme che possono
// pubblicare davvero (stato_pubblicazione_social) e da «Pubblica ora».

/** Hashtag consigliati per settore: una lista fissa, e il pulsante lo dice. */
const HASHTAG_PER_SETTORE: Record<string, string[]> = {
  edilizia: ["#edilizia", "#impresaedile", "#cantiere", "#costruzioni", "#lavoriincorso", "#ristrutturazione"],
  serramenti: ["#serramenti", "#finestre", "#infissi", "#risparmioenergetico", "#casa", "#ristrutturazione"],
  ristrutturazioni: ["#ristrutturazione", "#ristrutturazionecasa", "#primaedopo", "#casa", "#interni", "#impresaedile"],
  fotovoltaico: ["#fotovoltaico", "#energiasolare", "#pannellisolari", "#risparmioenergetico", "#energiarinnovabile", "#sostenibilita"],
  tetti: ["#tetti", "#coperture", "#rifacimentotetto", "#impermeabilizzazione", "#cantiere", "#impresaedile"],
  bagni: ["#bagno", "#arredobagno", "#ristrutturazionebagno", "#designbagno", "#casa", "#interni"],
};

const SEGMENT_LABELS: Record<string, string> = {
  edilizia: "Edilizia",
  serramenti: "Serramenti",
  ristrutturazioni: "Ristrutturazioni",
  fotovoltaico: "Fotovoltaico",
  tetti: "Tetti",
  bagni: "Bagni",
};

/** Il settore dell'azienda come settore per l'AI e gli hashtag; «Edilizia» se non c'è. */
function settoreSocial(settore: string | undefined): string {
  if (settore === "infissi") return "serramenti";
  return settore && settore in SEGMENT_LABELS ? settore : "edilizia";
}

/** «Facebook», «Facebook e Instagram», «LinkedIn, YouTube e TikTok». */
function elencoNomi(nomi: string[]): string {
  if (nomi.length <= 1) return nomi.join("");
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

function PassoComposer({
  numero,
  titolo,
  descrizione,
  azione,
  children,
}: {
  numero: number;
  titolo: string;
  descrizione?: string;
  azione?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
              {numero}
            </span>
            <div>
              <CardTitle className="text-base">{titolo}</CardTitle>
              {descrizione && <CardDescription className="text-[11px]">{descrizione}</CardDescription>}
            </div>
          </div>
          {azione}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ContentStudioTab({
  companyId,
  nomeAzienda,
  settoreAzienda,
  stato,
  verificaNonRiuscita = false,
  selectedMedia,
  onSelectedMediaConsumed,
  onPostScheduled,
  onMediaStored,
  onGoToSettings,
}: {
  companyId?: string;
  nomeAzienda?: string;
  settoreAzienda?: string;
  stato: StatoPubblicazioneSocial | null;
  verificaNonRiuscita?: boolean;
  selectedMedia?: MediaItem | null;
  onSelectedMediaConsumed?: () => void;
  /** true se il post è stato salvato: solo allora il composer si svuota. */
  onPostScheduled: (post: ScheduledPost) => Promise<boolean>;
  onMediaStored?: (media: MediaItem) => MediaItem | void | Promise<MediaItem | void | unknown>;
  onGoToSettings: () => void;
}) {
  // ── Opzioni avanzate: formato e argomento ──────────────────────────────────
  const [opzioniAperte, setOpzioniAperte] = useState(false);
  const [activePillarId, setActivePillarId] = useState<string | null>(null);
  const [contentTypeId, setContentTypeId] = useState("post");
  const contentType = CONTENT_TYPE_CONFIG.find((c) => c.id === contentTypeId) ?? CONTENT_TYPE_CONFIG[0];
  const availablePlatforms = PLATFORMS.filter((p) => contentType.supportedBy.includes(p.id));

  // ── 1 · Dove: si parte dalle piattaforme che possono pubblicare davvero ────
  const pronte = useMemo(() => paginePronte(stato), [stato]);
  const piattaformeOk = useMemo(() => piattaformePronte(stato), [stato]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const selezioneToccata = useRef(false);

  useEffect(() => {
    if (selezioneToccata.current || !stato) return;
    setSelectedPlatforms(piattaformeOk.filter((id) => contentType.supportedBy.includes(id)));
    // contentType segue contentTypeId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato, piattaformeOk, contentTypeId]);

  // Un formato nuovo toglie le piattaforme che non lo supportano.
  useEffect(() => {
    setSelectedPlatforms((prev) => prev.filter((id) => contentType.supportedBy.includes(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTypeId]);

  const togglePlatform = (platformId: string) => {
    selezioneToccata.current = true;
    setSelectedPlatforms((prev) => prev.includes(platformId) ? prev.filter((x) => x !== platformId) : [...prev, platformId]);
  };

  /** Etichetta accanto al nome: niente se può pubblicare, altrimenti il perché in due parole. */
  const etichettaPiattaforma = (platformId: string): string | null => {
    if (!stato || piattaformeOk.includes(platformId)) return null;
    const motivo = motivoPiattaforma(stato, platformId);
    return motivo ? spiegaMotivo(motivo, { verificaNonRiuscita }).breve : "Non collegato";
  };

  // ── 2 · Cosa: testo ──────────────────────────────────────────────────────
  // Autosave su localStorage ogni 30s + restore al mount (recupera il testo se
  // la scheda si chiude a metà).
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

  // ── Testo diverso per piattaforma (opzioni avanzate) ─────────────────────
  const [crossPlatformMode, setCrossPlatformMode] = useState(false);
  const [platformTexts, setPlatformTexts] = useState<Record<string, string>>({});

  const setPlatformText = (platformId: string, text: string) =>
    setPlatformTexts((prev) => ({ ...prev, [platformId]: text }));

  // Spento, le versioni per piattaforma si svuotano; acceso, partono dal testo comune.
  const toggleCrossPlatform = (enabled: boolean) => {
    setCrossPlatformMode(enabled);
    if (!enabled) {
      setPlatformTexts({});
    } else if (postText) {
      setPlatformTexts(Object.fromEntries(selectedPlatforms.map((id) => [id, postText])));
    }
  };

  // ── Foto e video ─────────────────────────────────────────────────────────
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [selectedLibraryMedia, setSelectedLibraryMedia] = useState<MediaItem | null>(null);
  // File caricati nel bucket social-media: il video del Reel, le slide del carosello.
  const [extraMedia, setExtraMedia] = useState<SocialPostMedia[]>([]);
  // Pagina/account di destinazione per piattaforma, quando ce n'è più d'uno.
  const [targetPageIds, setTargetPageIds] = useState<Record<string, string>>({});

  // ── AI: un solo ingresso, testo e foto ───────────────────────────────────
  const [aiAperta, setAiAperta] = useState(false);
  const [brief, setBrief] = useState("");
  const [segment, setSegment] = useState(() => settoreSocial(settoreAzienda));

  // ── 3 · Quando ───────────────────────────────────────────────────────────
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [publishNow, setPublishNow] = useState(true);
  // Gli errori si mostrano dopo il primo tentativo, non mentre si scrive.
  const [tentato, setTentato] = useState(false);

  // ── Anteprima ────────────────────────────────────────────────────────────
  const [previewPlatform, setPreviewPlatform] = useState<string>("facebook");

  const { generateCopy, generateImage, isGeneratingCopy, isGeneratingImage } = useAdsAi(companyId);
  const qc = useQueryClient();

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
        // L'hook dei dati ha già mostrato l'errore di salvataggio.
      });
  }, [onMediaStored]);

  useEffect(() => {
    if (!selectedMedia) return;
    setSelectedLibraryMedia(selectedMedia);
    const previewUrl = getSocialMediaPreviewUrl(selectedMedia);
    if (previewUrl) setMediaUrl(previewUrl);
    // Il formato cambia con il file scelto: si apre la sezione, per vederlo.
    if (selectedMedia.type === "story") {
      setContentTypeId("story");
      setOpzioniAperte(true);
    } else if (selectedMedia.type === "video") {
      setContentTypeId("video");
      setOpzioniAperte(true);
    }
    onSelectedMediaConsumed?.();
  }, [onSelectedMediaConsumed, selectedMedia]);

  // Un argomento aggiunge hashtag e uno spunto per l'AI; il formato lo consiglia, non lo impone.
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
  };

  const onGeneratePost = async () => {
    if (!brief.trim()) { toast.error("Scrivi prima di cosa parla il post"); return; }
    const result = await generateCopy({ brief, segment, zone: "", variants: 3 });
    if (result?.copy_variants && result.copy_variants.length > 0) {
      setCopyVariants(result.copy_variants);
      if (!postText) setPostText(result.copy_variants[0]);
      toast.success(`${result.copy_variants.length} versioni pronte: scegli quella che preferisci`);
    }
  };

  const onGenerateImage = async () => {
    if (!brief.trim()) { toast.error("Scrivi prima di cosa parla il post"); return; }
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
      toast.success("Foto pronta");
    }
  };

  const chiediASilvio = () => {
    const platformsLabel = selectedPlatforms.length > 0
      ? selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name).filter(Boolean).join(", ")
      : "Facebook e Instagram";
    const draft =
      `Scrivi il testo di un post per ${platformsLabel}.\n` +
      `Formato: ${contentType.label}.\n` +
      `Argomento: ${brief || postText || "un lavoro edile appena finito, tono caldo e professionale"}.\n\n` +
      `Requisiti: la frase più importante nelle prime due righe, italiano semplice da imprenditore edile, ` +
      `massimo 2200 caratteri, ` +
      `${contentType.hashtagsAllowed ? "3-5 hashtag del settore in fondo" : "senza hashtag"}. ` +
      `Scrivi 3 versioni diverse.`;
    window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
  };

  const maxHashtag = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.hashtagsMax ?? 30))
    : 30;

  const suggerisciHashtag = () => {
    const pillar = CONTENT_PILLARS.find((p) => p.id === activePillarId);
    const consigliati = [...(pillar?.hashtags ?? []), ...(HASHTAG_PER_SETTORE[segment] ?? HASHTAG_PER_SETTORE.edilizia)];
    const spazio = Math.max(0, Math.min(maxHashtag, 8) - hashtags.length);
    const nuovi = Array.from(new Set(consigliati)).filter((h) => !hashtags.includes(h)).slice(0, spazio);
    if (nuovi.length === 0) {
      toast.info("Hai già abbastanza hashtag");
      return;
    }
    setHashtags((prev) => [...prev, ...nuovi]);
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
  // File del post: quello principale (upload immagine, galleria, AI) più i file
  // caricati nel bucket social-media. Solo il carosello ne tiene più di uno.
  const isCarouselType = contentTypeId === "carosello";
  const postMedia = useMemo<SocialPostMedia[]>(() => {
    const main: SocialPostMedia[] = activeMediaUrl
      ? [{ url: activeMediaUrl, type: contentTypeId === "reel" || contentTypeId === "video" ? "video" : "image" }]
      : [];
    const all = [...main, ...extraMedia];
    return isCarouselType ? all : all.slice(0, 1);
  }, [activeMediaUrl, contentTypeId, extraMedia, isCarouselType]);
  // Le pagine tra cui scegliere sono solo quelle che possono pubblicare.
  const metaAccounts = useMemo(() => ({
    facebook: metaAccountsFor(pronte, "facebook"),
    instagram: metaAccountsFor(pronte, "instagram"),
  }), [pronte]);
  const baseDraftValidation = validateSocialDraft(
    {
      selectedPlatforms,
      connectedPlatformIds: piattaformeOk,
      contentType: contentTypeId,
      fallbackText: postText,
      textByPlatform: crossPlatformMode ? platformTexts : {},
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      mediaUrl: postMedia[0]?.url ?? null,
      publishNow,
      scheduledAt: scheduledAtForValidation,
      livePublishingEnabled: SOCIAL_LIVE_PUBLISHING_ENABLED,
    },
    PLATFORMS,
  );
  // Pagina di destinazione, carosello, Reel: le regole del publisher Meta,
  // controllate qui per non scoprire l'errore all'ora programmata.
  const metaTargetErrors = validateMetaPublishTargets({
    selectedPlatforms: baseDraftValidation.connectedSelectedPlatforms,
    contentType: contentTypeId,
    accounts: pronte,
    targetPageIds,
    media: postMedia,
  });
  const draftValidation = metaTargetErrors.length > 0
    ? {
      ...baseDraftValidation,
      errors: Array.from(new Set([...metaTargetErrors, ...baseDraftValidation.errors])),
      canPublishLive: false,
    }
    : baseDraftValidation;

  // Nessuna delle piattaforme scelte può pubblicare: si dice perché, e resta la bozza.
  const nessunaPronta = stato !== null && selectedPlatforms.length > 0 && draftValidation.connectedSelectedPlatforms.length === 0;
  const motiviScelte = (() => {
    const righe: { nome?: string; testo: string; ricollega: boolean }[] = [];
    const nonCollegate: string[] = [];
    for (const id of selectedPlatforms) {
      if (piattaformeOk.includes(id)) continue;
      const nome = PLATFORMS.find((p) => p.id === id)?.name ?? id;
      const motivo = stato ? motivoPiattaforma(stato, id) : null;
      if (!motivo) {
        if (stato) nonCollegate.push(nome);
        continue;
      }
      const spiegazione = spiegaMotivo(motivo, { verificaNonRiuscita });
      righe.push({ nome, testo: spiegazione.lungo, ricollega: spiegazione.azione === "ricollega" });
    }
    if (nonCollegate.length > 0) {
      righe.push({
        testo: `${elencoNomi(nonCollegate)} ${nonCollegate.length === 1 ? "non è collegato" : "non sono collegati"}: da qui si pubblica su Facebook e Instagram.`,
        ricollega: false,
      });
    }
    return righe;
  })();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetComposer = () => {
    setPostText("");
    setHashtags([]);
    setMediaUrl(null);
    setSelectedLibraryMedia(null);
    setExtraMedia([]);
    setTargetPageIds({});
    setScheduledDate("");
    setScheduledTime("09:00");
    setPublishNow(true);
    setCopyVariants([]);
    setFirstComment("");
    setPlatformTexts({});
    setCrossPlatformMode(false);
    setActivePillarId(null);
    setTentato(false);
    clearAutosave(); // evita che la bozza autosalvata risorga al mount successivo
  };

  const salvaBozza = async (status: "draft" | "review") => {
    if (isSubmitting) return; // anti doppio-submit
    if (!draftValidation.canSaveDraft) {
      toast.error(selectedPlatforms.length === 0 ? "Scegli almeno una piattaforma." : "Scrivi il testo del post.");
      return;
    }
    setIsSubmitting(true);

    const scheduledAt = scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
      : new Date(Date.now() + 86400000).toISOString();
    const bozza: ScheduledPost = {
      id: `local-${crypto.randomUUID()}`,
      platforms: selectedPlatforms,
      contentType: contentTypeId,
      text: crossPlatformMode ? (platformTexts[selectedPlatforms[0]] ?? postText) : postText,
      platformTexts: crossPlatformMode && Object.keys(platformTexts).length > 0 ? platformTexts : undefined,
      image_url: postMedia[0]?.url ?? undefined,
      media: postMedia.length > 0 ? postMedia : undefined,
      targetPageIds: Object.keys(targetPageIds).length > 0 ? targetPageIds : undefined,
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      firstComment: firstComment || undefined,
      scheduled_at: scheduledAt,
      status,
      created_at: new Date().toISOString(),
      mediaItemId: selectedLibraryMedia?.id,
    };

    try {
      if (!(await onPostScheduled(bozza))) return;
      toast.success(status === "review" ? "Post mandato in approvazione" : "Bozza salvata", {
        description: status === "review"
          ? "Lo trovi nel calendario, tra i post da approvare. Non esce finché qualcuno non lo approva."
          : "La trovi nel calendario. Non viene pubblicata.",
      });
      resetComposer();
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSchedulePost = async () => {
    if (isSubmitting) return; // anti doppio-submit
    setTentato(true);
    // FIX P1: l'input date ha min=oggi ma l'input time è libero. Se l'utente
    // sceglie oggi + un orario passato (es. 14:00 quando sono le 15:00), il post
    // veniva accettato ma non si sarebbe mai pubblicato (lo scheduler lo ignora).
    if (!publishNow) {
      if (!scheduledDate) { toast.error("Scegli il giorno di pubblicazione"); return; }
      const scheduledDt = new Date(`${scheduledDate}T${scheduledTime}`);
      if (Number.isNaN(scheduledDt.getTime())) {
        toast.error("Data o ora non valide");
        return;
      }
      if (scheduledDt.getTime() <= Date.now() + 60_000) {
        toast.error("L'orario di pubblicazione deve essere almeno 1 minuto nel futuro", {
          description: "Sposta l'orario più avanti oppure scegli «Pubblica ora».",
        });
        return;
      }
    }
    if (!draftValidation.canPublishLive) {
      toast.error(draftValidation.errors[0] ?? "Il post non si può ancora pubblicare.");
      return;
    }

    setIsSubmitting(true);
    // Meta scarica i file da un indirizzo https: un'immagine rimasta incorporata
    // (data:) si carica nello Storage prima di salvare il post.
    let mediaForPost: SocialPostMedia[];
    try {
      mediaForPost = companyId ? await ensureRemoteSocialMedia(companyId, postMedia) : postMedia;
    } catch (err) {
      toast.error("Caricamento del file non riuscito", {
        description: err instanceof Error ? err.message : String(err),
      });
      setIsSubmitting(false);
      return;
    }
    // Pagina di destinazione sempre esplicita: la scelta, o l'unica pronta.
    // Con due pagine collegate e una sola pronta, il publisher non indovina.
    const chosenTargets: Record<string, string> = {};
    for (const platformId of draftValidation.connectedSelectedPlatforms) {
      const opzioni = metaAccountsFor(pronte, platformId);
      const scelta = targetPageIds[platformId];
      if (scelta && opzioni.some((o) => o.page_id === scelta)) chosenTargets[platformId] = scelta;
      else if (opzioni.length === 1) chosenTargets[platformId] = opzioni[0].page_id;
    }
    const scheduledAt = publishNow
      ? new Date().toISOString()
      : new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    const newPost: ScheduledPost = {
      id: `post-${crypto.randomUUID()}`,
      platforms: draftValidation.connectedSelectedPlatforms,
      contentType: contentTypeId,
      // Con un testo per piattaforma, il principale è quello della prima.
      text: crossPlatformMode
        ? (platformTexts[selectedPlatforms[0]] ?? postText)
        : postText,
      image_url: mediaForPost[0]?.url ?? undefined,
      media: mediaForPost.length > 0 ? mediaForPost : undefined,
      targetPageIds: Object.keys(chosenTargets).length > 0 ? chosenTargets : undefined,
      hashtags: contentType.hashtagsAllowed ? hashtags : [],
      firstComment: firstComment || undefined,
      scheduled_at: scheduledAt,
      // Sempre 'scheduled': la pubblicazione reale (publishNow → subito,
      // futura → cron) promuove a 'published' SOLO a invio riuscito su Meta.
      status: "scheduled",
      created_at: new Date().toISOString(),
      mediaItemId: selectedLibraryMedia?.id,
      platformTexts: crossPlatformMode && Object.keys(platformTexts).length > 0
        ? platformTexts
        : undefined,
    };

    try {
      // «Pubblica ora»: l'esito vero (uscito, in elaborazione, errore) lo dice chi pubblica.
      if (!(await onPostScheduled(newPost))) return;
      if (!publishNow) {
        const dove = elencoNomi(newPost.platforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id));
        toast.success("Post programmato", {
          description: `Esce ${new Date(scheduledAt).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} su ${dove}.`,
        });
      }
      resetComposer();
    } finally {
      setIsSubmitting(false);
    }
  };

  const piattaformaAnteprima = selectedPlatforms.includes(previewPlatform) ? previewPlatform : selectedPlatforms[0] ?? previewPlatform;
  const currentPlatform = PLATFORMS.find((p) => p.id === piattaformaAnteprima) ?? PLATFORMS[0];
  const charCount = postText.length + (hashtags.length > 0 ? hashtags.join(" ").length + 1 : 0);
  const maxChars = selectedPlatforms.length > 0 ? Math.min(...selectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.maxChars ?? 9999)) : 9999;
  const isStory = contentTypeId === "story";
  const isVideoType = contentTypeId === "reel" || contentTypeId === "video" || contentType.supportedBy.every((id) => PLATFORMS.find((p) => p.id === id)?.videoOnly);

  // Il nome in anteprima: la pagina che pubblicherà, non un nome inventato.
  const nomeAnteprima = (() => {
    const opzioni = metaAccountsFor(pronte, currentPlatform.id);
    const scelta = opzioni.find((p) => p.page_id === targetPageIds[currentPlatform.id]) ?? opzioni[0];
    if (scelta?.page_name) return scelta.page_name;
    const collegata = stato?.pagine.find((p) => p.piattaforma === currentPlatform.id);
    return collegata?.nome || nomeAzienda || "La tua azienda";
  })();

  // Formati foto che vanno bene per TUTTE le piattaforme scelte (non l'unione:
  // una GIF va su Facebook ma non su Instagram).
  const formatiFoto = (() => {
    const perPiattaforma = selectedPlatforms
      .map((id) => PLATFORMS.find((p) => p.id === id)?.mediaFormats.filter((f) => ["JPEG", "PNG", "GIF"].includes(f)) ?? [])
      .filter((formati) => formati.length > 0);
    if (perPiattaforma.length === 0) return ["JPEG", "PNG"];
    return perPiattaforma.reduce((comuni, formati) => comuni.filter((f) => formati.includes(f)));
  })();
  // I formati li dice il riquadro di caricamento; qui resta la proporzione.
  const testoFormati = isVideoType ? null : `Proporzione consigliata ${contentType.aspectRatio}.`;
  const serveFile = selectedPlatforms.includes("instagram") || isVideoType || isCarouselType || isStory;

  // Orario consigliato per la prima piattaforma scelta.
  const suggestedTime = (() => {
    if (selectedPlatforms.length === 0) return null;
    const best = PLATFORMS.find((p) => p.id === selectedPlatforms[0]);
    return best?.bestTimes[0] ?? null;
  })();

  // Riepilogo delle opzioni avanzate cambiate, visibile a sezione chiusa.
  const pillarAttivo = CONTENT_PILLARS.find((p) => p.id === activePillarId);
  const riepilogoAvanzate = [
    contentTypeId !== "post" ? contentType.label : null,
    pillarAttivo ? pillarAttivo.label : null,
    crossPlatformMode ? "Testo per piattaforma" : null,
    firstComment.trim() ? "Primo commento" : null,
  ].filter((voce): voce is string => Boolean(voce));

  const mostraErrori = tentato && draftValidation.errors.length > 0;
  // Sul pulsante, dove uscirà davvero il post.
  const doveEsce = elencoNomi(
    draftValidation.connectedSelectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">

        {/* ── 1 · DOVE ─────────────────────────────────────────────────── */}
        <PassoComposer numero={1} titolo="Dove" descrizione="Scegli dove pubblicare">
          <div className="flex flex-wrap gap-2">
            {availablePlatforms.map((p) => {
              const isSelected = selectedPlatforms.includes(p.id);
              const etichetta = etichettaPiattaforma(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
                    isSelected ? `border-transparent text-white bg-gradient-to-r ${p.gradient}` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold", isSelected ? "bg-white/20" : cn(p.color, "text-white"))}>{p.icon}</span>
                  {p.name}
                  {etichetta && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", isSelected ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                      {etichetta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Con più pagine pronte per la stessa piattaforma si sceglie, mai a caso */}
          {(["facebook", "instagram"] as const).map((platformId) => {
            const options = metaAccounts[platformId];
            if (!selectedPlatforms.includes(platformId) || options.length < 2) return null;
            const isIg = platformId === "instagram";
            return (
              <div key={platformId} className="flex flex-wrap items-center gap-2">
                <Label className="text-xs font-semibold text-slate-600">
                  {isIg ? "Account Instagram" : "Pagina Facebook"}
                </Label>
                <Select
                  value={targetPageIds[platformId] ?? ""}
                  onValueChange={(value) => setTargetPageIds((prev) => ({ ...prev, [platformId]: value }))}
                >
                  <SelectTrigger className="h-8 w-full text-xs sm:w-64">
                    <SelectValue placeholder={isIg ? "Scegli l'account" : "Scegli la pagina"} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((account) => (
                      <SelectItem key={account.page_id} value={account.page_id} className="text-xs">
                        {account.page_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          {selectedPlatforms.length === 0 && stato && (
            <p className="text-[11px] text-slate-500">
              {piattaformeOk.length > 0
                ? "Scegli almeno una piattaforma."
                : "Nessuna pagina può pubblicare adesso: scegli dove andrà il post e salvalo come bozza."}
            </p>
          )}

          {motiviScelte.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              {motiviScelte.map((riga) => (
                <p key={`${riga.nome ?? ""}-${riga.testo}`} className="flex items-start gap-2 text-[11px] text-amber-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{riga.nome && <strong className="font-semibold">{riga.nome}.</strong>} {riga.testo}</span>
                </p>
              ))}
              {motiviScelte.some((riga) => riga.ricollega) && (
                <Button size="sm" variant="outline" onClick={onGoToSettings}
                  className="h-7 gap-1.5 border-amber-300 bg-white text-[11px] text-amber-800 hover:bg-amber-100">
                  <Settings className="h-3 w-3" /> Ricollega Meta
                </Button>
              )}
            </div>
          )}
        </PassoComposer>

        {/* ── 2 · COSA ─────────────────────────────────────────────────── */}
        <PassoComposer
          numero={2}
          titolo="Cosa"
          descrizione={isVideoType ? "Titolo, descrizione e video" : isStory ? "Foto o video della storia" : "Testo e foto"}
          azione={
            <Button size="sm" variant="outline" onClick={() => setAiAperta((v) => !v)} aria-expanded={aiAperta}
              className={cn("h-8 gap-1.5 border-orange-200 text-xs text-orange-700 hover:bg-orange-50", aiAperta && "bg-orange-50")}>
              <Sparkles className="h-3.5 w-3.5" /> Scrivi con l'AI
            </Button>
          }
        >
          {aiAperta && (
            <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3">
              <Field label="Di cosa parla il post?">
                <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-16 resize-none bg-white"
                  placeholder="Es.: finestre in PVC posate in 30 giorni, sopralluogo gratuito, garanzia 10 anni" />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-44">
                  <Field label="Settore">
                    <Select value={segment} onValueChange={setSegment}>
                      <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SEGMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Button size="sm" onClick={() => void onGeneratePost()} disabled={!brief.trim() || isGeneratingCopy}
                  className="h-9 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600">
                  {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Scrivi il testo
                </Button>
                {!isVideoType && (
                  <Button size="sm" variant="outline" onClick={() => void onGenerateImage()} disabled={!brief.trim() || isGeneratingImage}
                    className="h-9 gap-1.5 bg-white">
                    {isGeneratingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    Crea la foto
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                Il testo arriva in 3 versioni: scegli quella che preferisci e ritoccala.{" "}
                <button type="button" onClick={chiediASilvio} className="font-semibold text-orange-700 underline-offset-2 hover:underline">
                  Oppure chiedilo a Silvio
                </button>
              </p>
            </div>
          )}

          {copyVariants.length > 1 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">Scegli la versione che preferisci</p>
              {copyVariants.map((v, i) => (
                <button key={i} type="button" onClick={() => { setPostText(v); setCopyVariants([]); }}
                  className={cn(
                    "w-full rounded-xl border-2 p-3 text-left text-sm text-slate-700 transition hover:border-orange-300 hover:bg-orange-50",
                    postText === v ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white",
                  )}>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-orange-400">Versione {i + 1}</span>
                  {v.slice(0, 160)}{v.length > 160 ? "…" : ""}
                </button>
              ))}
            </div>
          )}

          {isGeneratingCopy ? (
            <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
              {[...Array(3)].map((_, i) => <div key={i} className={cn("h-4 animate-pulse rounded-lg bg-orange-100/70", i === 2 ? "w-2/3" : "w-full")} />)}
            </div>
          ) : crossPlatformMode ? (
            <div className="space-y-3">
              {selectedPlatforms.map((pid) => {
                const pl = PLATFORMS.find((p) => p.id === pid);
                if (!pl) return null;
                const txt = platformTexts[pid] ?? postText;
                const over = txt.length > pl.maxChars;
                return (
                  <div key={pid} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br", pl.gradient)}>{pl.icon}</span>
                        {pl.name}
                      </span>
                      <span className={cn("text-[10px] tabular-nums", over ? "font-bold text-red-500" : "text-slate-400")}>
                        {txt.length}/{pl.maxChars.toLocaleString("it-IT")}
                      </span>
                    </div>
                    <Textarea
                      value={txt}
                      onChange={(e) => setPlatformText(pid, e.target.value)}
                      className={cn("min-h-[80px] resize-none text-sm", over ? "border-red-300" : "")}
                      placeholder={`Il testo per ${pl.name}…`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              <Textarea value={postText} onChange={(e) => setPostText(e.target.value)}
                aria-label="Testo del post"
                className={cn("min-h-28 resize-none font-[inherit] text-sm", charCount > maxChars ? "border-red-300 focus-visible:ring-red-400" : "")}
                placeholder={isStory
                  ? "Testo breve da mettere sulla storia (facoltativo)…"
                  : isVideoType
                    ? "Titolo del video: metti all'inizio le parole che la gente cerca…"
                    : "Racconta un lavoro finito, mostra il cantiere, dai un consiglio…"} />
              {charCount > 0 && selectedPlatforms.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
                  {selectedPlatforms.map((id) => {
                    const platform = PLATFORMS.find((p) => p.id === id);
                    if (!platform) return null;
                    const over = charCount > platform.maxChars;
                    const close = charCount > platform.maxChars * 0.9 && !over;
                    return (
                      <span key={id} className={cn("tabular-nums", over ? "font-semibold text-red-600" : close ? "font-semibold text-amber-600" : "text-slate-400")}>
                        {platform.name} {charCount}/{platform.maxChars.toLocaleString("it-IT")}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hashtag (non nelle storie) */}
          {contentType.hashtagsAllowed && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-600">
                  Hashtag
                  {selectedPlatforms.length > 0 && <span className="ml-1 font-normal text-slate-400">(massimo {maxHashtag})</span>}
                </p>
                <button type="button" onClick={suggerisciHashtag}
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-orange-600 hover:text-orange-800">
                  <Hash className="h-3 w-3" /> Aggiungi consigliati
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                    {tag}
                    <button type="button" aria-label={`Togli ${tag}`} onClick={() => setHashtags((h) => h.filter((t) => t !== tag))}>
                      <X className="h-2.5 w-2.5 text-orange-400 hover:text-orange-700" />
                    </button>
                  </span>
                ))}
                <Input value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addHashtag(); } }}
                  onBlur={addHashtag}
                  placeholder="+ hashtag" className="h-7 w-28 rounded-full border-dashed text-xs" />
              </div>
            </div>
          )}

          {/* Foto o video */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-600">
              {isVideoType ? "Video" : isCarouselType ? "Foto del carosello" : "Foto"}
              <span className="ml-1 font-normal text-slate-400">
                {serveFile ? (selectedPlatforms.includes("instagram") && !isVideoType && !isCarouselType ? "(Instagram la richiede)" : "(obbligatorio)") : "(facoltativa)"}
              </span>
            </p>
            {activeMediaUrl || selectedLibraryMedia ? (
              <div className="relative overflow-hidden rounded-xl border">
                {activeMediaUrl ? (
                  <img loading="lazy" src={activeMediaUrl} alt="Foto del post" className="max-h-64 w-full object-cover" />
                ) : selectedLibraryMedia ? (
                  <div className={cn("flex h-48 flex-col items-center justify-center bg-gradient-to-br px-4 text-center text-white", selectedLibraryMedia.gradient)}>
                    {selectedLibraryMedia.type === "video" ? <Play className="mb-2 h-9 w-9 text-white/80" /> : <ImageIcon className="mb-2 h-9 w-9 text-white/80" />}
                    <p className="text-sm font-bold drop-shadow">{selectedLibraryMedia.title}</p>
                    <p className="mt-1 text-[11px] font-medium text-white/80">{selectedLibraryMedia.format} · dalla galleria</p>
                  </div>
                ) : null}
                <button type="button" aria-label="Togli la foto" onClick={() => { setMediaUrl(null); setSelectedLibraryMedia(null); }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                  <X className="h-3.5 w-3.5" />
                </button>
                {selectedLibraryMedia && (
                  <p className="bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    {selectedLibraryMedia.title} · {selectedLibraryMedia.format}
                  </p>
                )}
              </div>
            ) : isGeneratingImage ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
                <Loader2 className="h-5 w-5 animate-spin" /> Sto creando la foto…
              </div>
            ) : isVideoType ? (
              extraMedia.length === 0 ? (
                <SocialMediaUploader
                  companyId={companyId}
                  accept="video"
                  label="Carica il video"
                  hint="MP4 o MOV, fino a 200 MB · Instagram lo pubblica come Reel"
                  onUploaded={(items) => setExtraMedia(items.slice(0, 1))}
                />
              ) : null
            ) : (
              <AdMediaUploader
                companyId={companyId}
                hint={`${elencoNomi(formatiFoto)}, fino a 10 MB`}
                onUploaded={(media) => {
                  if (media.public_url) {
                    const storedMedia = createStoredMediaItem({
                      id: media.id,
                      title: `Foto social ${new Date().toLocaleDateString("it-IT")}`,
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
                  toast.success("Foto caricata");
                }}
              />
            )}
            {/* File caricati nello Storage: video del Reel, slide del carosello */}
            {extraMedia.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {extraMedia.map((item, index) => (
                  <div key={item.path ?? item.url ?? index} className="relative overflow-hidden rounded-lg border bg-slate-50">
                    {item.type === "video"
                      ? <video src={item.url} className="h-24 w-full object-cover" muted playsInline preload="metadata" />
                      : <img loading="lazy" src={item.url} alt="" className="h-24 w-full object-cover" />}
                    <button
                      type="button"
                      aria-label="Togli il file"
                      onClick={() => setExtraMedia((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {isCarouselType && (
              <SocialMediaUploader
                companyId={companyId}
                accept={selectedPlatforms.includes("facebook") ? "image" : "any"}
                multiple
                maxFiles={Math.max(0, 10 - postMedia.length)}
                label="Aggiungi foto al carosello"
                hint={`${postMedia.length} di 10 · ne servono almeno 2${selectedPlatforms.includes("facebook") ? " · su Facebook solo foto" : ""}`}
                onUploaded={(items) => setExtraMedia((prev) => [...prev, ...items])}
              />
            )}
            {testoFormati && <p className="text-[10px] text-slate-400">{testoFormati}</p>}
          </div>

          {/* Opzioni avanzate, chiuse: formato, argomento, testo per piattaforma, primo commento */}
          <div className="rounded-xl border border-slate-200">
            <button type="button" onClick={() => setOpzioniAperte((v) => !v)} aria-expanded={opzioniAperte}
              className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left">
              <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", opzioniAperte ? "rotate-180" : "")} />
              <span className="text-xs font-semibold text-slate-700">Opzioni avanzate</span>
              {!opzioniAperte && (
                <span className="text-[11px] text-slate-400">
                  {riepilogoAvanzate.length > 0 ? riepilogoAvanzate.join(" · ") : "Formato, argomento, testo per piattaforma, primo commento"}
                </span>
              )}
            </button>
            {opzioniAperte && (
              <div className="space-y-4 border-t border-slate-100 px-3 py-3">
                {/* Formato */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">Formato</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTENT_TYPE_CONFIG.map((ct) => {
                      const Icon = ct.icon;
                      const isSelected = contentTypeId === ct.id;
                      return (
                        <button key={ct.id} type="button" onClick={() => setContentTypeId(ct.id)} aria-pressed={isSelected}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                            isSelected ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200",
                          )}>
                          <Icon className="h-3.5 w-3.5" />
                          {ct.label}
                          <span className="hidden font-normal text-slate-400 sm:inline">{ct.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    {contentType.tips}
                  </p>
                </div>

                {/* Argomento */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">Argomento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTENT_PILLARS.map((pillar) => {
                      const isActive = activePillarId === pillar.id;
                      return (
                        <button key={pillar.id} type="button" onClick={() => applyPillar(pillar)} aria-pressed={isActive}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                            isActive ? `${pillar.colorBg} ${pillar.colorBorder} ${pillar.colorText}` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                          )}>
                          <span className="leading-none">{pillar.emoji}</span>
                          {pillar.label}
                        </button>
                      );
                    })}
                  </div>
                  {pillarAttivo && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{pillarAttivo.description} · {pillarAttivo.weeklyFreq} a settimana.</span>
                      {pillarAttivo.suggestedContentType !== contentTypeId && CONTENT_TYPE_CONFIG.some((c) => c.id === pillarAttivo.suggestedContentType) && (
                        <button type="button" onClick={() => setContentTypeId(pillarAttivo.suggestedContentType)}
                          className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-semibold text-orange-700 hover:bg-orange-100">
                          Formato consigliato: {CONTENT_TYPE_CONFIG.find((c) => c.id === pillarAttivo.suggestedContentType)?.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Testo per piattaforma */}
                {selectedPlatforms.length > 1 && (
                  <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-600">
                    <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-orange-500" checked={crossPlatformMode}
                      onChange={(e) => toggleCrossPlatform(e.target.checked)} />
                    <span>
                      <strong className="font-semibold text-slate-700">Testo diverso per ogni piattaforma</strong>
                      <span className="block text-slate-400">Per esempio più breve su Instagram e più discorsivo su Facebook.</span>
                    </span>
                  </label>
                )}

                {/* Primo commento Instagram */}
                {selectedPlatforms.includes("instagram") && contentType.hashtagsAllowed && (
                  <Field label="Primo commento su Instagram" note="Esce subito dopo il post: utile per altri hashtag o un invito a scrivere.">
                    <Textarea value={firstComment} onChange={(e) => setFirstComment(e.target.value)}
                      className="min-h-[60px] resize-none text-sm" placeholder="Es.: Scrivici per un sopralluogo gratuito #serramenti #finestre" />
                  </Field>
                )}
              </div>
            )}
          </div>
        </PassoComposer>

        {/* ── 3 · QUANDO ───────────────────────────────────────────────── */}
        <PassoComposer numero={3} titolo="Quando">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPublishNow(true)} aria-pressed={publishNow}
              className={cn("flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-[13px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
                publishNow ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              <Send className="h-4 w-4" /> Pubblica ora
            </button>
            <button type="button" onClick={() => setPublishNow(false)} aria-pressed={!publishNow}
              className={cn("flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-[13px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
                !publishNow ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              <Clock className="h-4 w-4" /> Programma
            </button>
          </div>

          {!publishNow && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Giorno">
                  <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={new Date().toLocaleDateString("en-CA")} />
                </Field>
                <Field label="Ora">
                  <div className="flex gap-1.5">
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="min-w-0 flex-1"
                      {...(scheduledDate === new Date().toLocaleDateString("en-CA")
                        ? { min: new Date(Date.now() + 60_000).toTimeString().slice(0, 5) }
                        : {})}
                    />
                    {suggestedTime && scheduledTime !== suggestedTime && (
                      <button type="button" onClick={() => setScheduledTime(suggestedTime)}
                        title={`Orario consigliato per ${PLATFORMS.find((p) => p.id === selectedPlatforms[0])?.name}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                        <Zap className="h-3 w-3" />{suggestedTime}
                      </button>
                    )}
                  </div>
                </Field>
              </div>
              {selectedPlatforms.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  Di solito funzionano bene:{" "}
                  {selectedPlatforms.map((id) => {
                    const p = PLATFORMS.find((pl) => pl.id === id);
                    return p ? `${p.name} ${p.bestTimes.join(", ")}` : null;
                  }).filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {(mostraErrori || draftValidation.warnings.length > 0) && (
            <div className="space-y-1.5">
              {mostraErrori && draftValidation.errors.slice(0, 3).map((error) => (
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void onSchedulePost()} disabled={isSubmitting || nessunaPronta || !SOCIAL_LIVE_PUBLISHING_ENABLED}
              className={cn("flex-1 text-white shadow-sm",
                publishNow ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600")}>
              {!SOCIAL_LIVE_PUBLISHING_ENABLED
                ? <><Send className="mr-2 h-4 w-4" />Publisher live non attivo</>
                : isSubmitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{publishNow ? "Pubblicazione in corso…" : "Salvataggio…"}</>
                  : publishNow
                    ? <><Send className="mr-2 h-4 w-4" />{doveEsce ? `Pubblica su ${doveEsce}` : "Pubblica ora"}</>
                    : <><Calendar className="mr-2 h-4 w-4" />{doveEsce ? `Programma su ${doveEsce}` : "Programma"}</>}
            </Button>
            <Button type="button" variant="outline" onClick={() => void salvaBozza("draft")} disabled={isSubmitting}
              className="border-slate-200 text-slate-700 sm:w-auto">
              <Pencil className="mr-2 h-4 w-4" />
              Salva bozza
            </Button>
          </div>
          {nessunaPronta && (
            <p className="text-[11px] text-amber-700">
              Per ora puoi solo salvare la bozza.
            </p>
          )}
          {!publishNow && (
            <button type="button" onClick={() => void salvaBozza("review")} disabled={isSubmitting}
              className="w-full rounded-xl border border-dashed border-amber-300 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-40">
              Manda in approvazione prima di pubblicare
            </button>
          )}
        </PassoComposer>
      </div>

      {/* ── ANTEPRIMA ──────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <Card className="overflow-hidden xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-slate-500" /> Anteprima
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1">
                {selectedPlatforms.map((id) => {
                  const p = PLATFORMS.find((pl) => pl.id === id);
                  if (!p) return null;
                  return (
                    <button key={id} type="button" onClick={() => setPreviewPlatform(id)}
                      className={cn("rounded-lg px-2 py-1 text-[10px] font-bold transition",
                        piattaformaAnteprima === id ? `text-white bg-gradient-to-r ${p.gradient}` : "text-slate-500 hover:bg-slate-100")}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <div className={cn("relative max-w-full overflow-hidden rounded-2xl border shadow-sm", currentPlatform.borderColor)}
                style={{ width: contentType.previewW * 2, height: contentType.previewH * 2 }}>
                {(isStory || contentTypeId === "reel") ? (
                  <>
                    {activeMediaUrl ? (
                      <img loading="lazy" src={activeMediaUrl} alt="Anteprima" className="h-full w-full object-cover" />
                    ) : selectedLibraryMedia ? (
                      <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", selectedLibraryMedia.gradient)}>
                        <Smartphone className="h-10 w-10 text-white/70" />
                      </div>
                    ) : (
                      <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", currentPlatform.gradient, "opacity-20")}>
                        <Smartphone className="h-10 w-10 text-slate-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex flex-col justify-between p-3">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-1 flex-1 rounded-full opacity-60 bg-gradient-to-r", currentPlatform.gradient)} />
                        <div className="h-1 flex-1 rounded-full bg-white/30" />
                        <div className="h-1 flex-1 rounded-full bg-white/30" />
                      </div>
                      <div className="space-y-1">
                        <p className="truncate text-[10px] font-semibold text-white drop-shadow">{nomeAnteprima}</p>
                        {postText && (
                          <div className="rounded-xl bg-black/50 p-2">
                            <p className="text-[10px] font-semibold leading-tight text-white">{postText.slice(0, 80)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn("flex items-center gap-2 p-2", currentPlatform.bgLight)}>
                      <div className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold uppercase text-white", currentPlatform.gradient)}>
                        {nomeAnteprima.trim().charAt(0) || "A"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold text-slate-900">{nomeAnteprima}</p>
                        <p className="text-[8px] text-slate-400">
                          {publishNow ? "Adesso" : scheduledDate ? new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </p>
                      </div>
                    </div>
                    {activeMediaUrl ? (
                      <img loading="lazy" src={activeMediaUrl} alt="Foto del post" className="w-full object-cover" style={{ height: contentType.previewH }} />
                    ) : selectedLibraryMedia ? (
                      <div className={cn("flex items-center justify-center bg-gradient-to-br", selectedLibraryMedia.gradient)} style={{ height: contentType.previewH }}>
                        <ImageIcon className="h-6 w-6 text-white/70" />
                      </div>
                    ) : (
                      <div className={cn("flex items-center justify-center border-y", currentPlatform.bgLight)} style={{ height: contentType.previewH }}>
                        <ImageIcon className={cn("h-6 w-6 opacity-30", currentPlatform.textColor)} />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-[10px] leading-relaxed text-slate-800">
                        {postText ? postText.slice(0, 100) + (postText.length > 100 ? "…" : "") : <span className="italic text-slate-400">Il testo del post…</span>}
                      </p>
                      {hashtags.length > 0 && <p className={cn("mt-1 text-[9px] font-medium", currentPlatform.textColor)}>{hashtags.slice(0, 4).join(" ")}</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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
  demoMode = false,
}: {
  mediaItems: MediaItem[];
  onUseInPost: (item: MediaItem) => void;
  onUseInAds:  (item: MediaItem) => void;
  onUploadRequested: () => void;
  demoMode?: boolean;
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
      {demoMode && (
        <Alert className="border-amber-200 bg-amber-50 py-2">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800">
            Galleria demo: sono contenuti di esempio della Demo Azienda. Usali in un post o carica i tuoi da «Crea post».
          </AlertDescription>
        </Alert>
      )}

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
                {/* Anteprima reale del media caricato (immagine/story); per i
                    video resta il gradiente + icona Play. */}
                {item.type !== "video" && getSocialMediaPreviewUrl(item) && (
                  <img
                    src={getSocialMediaPreviewUrl(item)}
                    alt="Anteprima media"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
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
                {item.type === "image" && !getSocialMediaPreviewUrl(item) && (
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

// Build 18-cell grid: last 6 published + future slots
function buildGrid(posts: ScheduledPost[], demoMode: boolean): GridCell[] {
  // Celle "pubblicato": per la Demo Azienda i 6 media demo; per un'azienda
  // reale gli ULTIMI post davvero pubblicati (niente contenuti finti).
  const published: GridCell[] = demoMode
    ? DEMO_MEDIA_ITEMS.slice(0, 6).map((m) => ({
        id: `pub-${m.id}`,
        type: "published" as const,
        gradient: m.gradient,
        text: m.title,
        platform: "instagram",
      }))
    : posts
        .filter((p) => p.status === "published" && p.platforms.includes("instagram"))
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 6)
        .map((p) => ({
          id: `pub-${p.id}`,
          type: "published" as const,
          gradient: "from-slate-400 to-slate-600",
          text: p.text,
          image_url: p.image_url,
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

function GridPlannerTab({ posts, demoMode = false }: { posts: ScheduledPost[]; demoMode?: boolean }) {
  const [showLabels, setShowLabels] = useState(true);
  const [highlightPillar, setHighlightPillar] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  // Memoize grid so it doesn't rebuild on every state change (toggle labels, etc.)
  const grid = useMemo(() => buildGrid(posts, demoMode), [posts, demoMode]);
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
      {demoMode && (
        <Alert className="border-amber-200 bg-amber-50 py-2">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800">
            Griglia dimostrativa: i post pubblicati sono esempi della Demo Azienda; quelli programmati e da approvare sono i tuoi.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Griglia Instagram</h2>
          <p className="text-xs text-slate-500">
            Come apparirà il profilo: {publishedCount} pubblicati · {scheduledCount} in programma
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
        <span className="text-[11px] font-semibold text-slate-500">Evidenzia argomento:</span>
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
                      ? <img loading="lazy" src={cell.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

function InboxTab({ onUnreadChange, demoMode = false }: { onUnreadChange?: (n: number) => void; demoMode?: boolean }) {
  // I 4 messaggi demo si vedono SOLO nella Demo Azienda: un'azienda reale
  // partirebbe convinta di avere conversazioni clienti mai esistite.
  const [items, setItems] = useState<InboxItem[]>(demoMode ? DEMO_INBOX : []);
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
    toast.success("Risposta salvata", { description: "Solo qui: è la casella di prova, la risposta non arriva a nessuno." });
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

  // Azienda reale senza messaggi: empty state onesto invece di stats a zero
  // su conversazioni demo mai esistite.
  if (!demoMode && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <MessageSquare className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Nessun messaggio</p>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          Commenti, messaggi e recensioni delle tue pagine compariranno qui
          quando la lettura delle conversazioni sarà attiva.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {demoMode && (
        <Alert className="border-amber-200 bg-amber-50 py-2">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800">
            Messaggi di prova della Demo Azienda: le risposte restano qui e non arrivano a nessuno.
          </AlertDescription>
        </Alert>
      )}

      {/* ── HEADER STATS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Da leggere",  value: items.filter((i) => i.status === "unread").length,   color: "text-orange-600", bg: "bg-orange-50"  },
          { label: "Commenti",    value: items.filter((i) => i.type === "comment").length,     color: "text-blue-600",   bg: "bg-blue-50"    },
          { label: "Messaggi",    value: items.filter((i) => i.type === "dm").length,          color: "text-violet-600", bg: "bg-violet-50"  },
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
  const MAX_BULK = 30;
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<BulkPost[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCsv = (raw: string): BulkPost[] => parseSocialBulkCsv(raw, PLATFORMS);

  const handlePreview = () => {
    const rows = parseCsv(csvText);
    setParsed(rows);
    setStep("preview");
  };

  const handleImport = async () => {
    if (importing) return; // anti doppio-submit
    const okRows = parsed.filter((p) => p.status === "ok");
    const droppedForCap = Math.max(0, okRows.length - MAX_BULK);
    const validPosts: ScheduledPost[] = okRows
      .slice(0, MAX_BULK) // cap dichiarato (max 30 post per import)
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
    setImporting(true);
    try {
      await Promise.all(validPosts.map((post) => Promise.resolve(onImport(post))));
      if (droppedForCap > 0) {
        toast.warning(`Importati i primi ${MAX_BULK} post. ${droppedForCap} riga/e in eccesso non importate.`);
      }
      setStep("done");
    } finally {
      setImporting(false);
    }
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
            <h2 className="text-lg font-bold text-slate-900">Importa post da CSV</h2>
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
              <button type="button" onClick={handleImport} disabled={okCount === 0 || importing}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40">
                {importing ? "Importazione…" : `✓ Importa ${Math.min(okCount, 30)} post`}
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
  const { effectiveCompany } = useAuthCompany();
  const { isLoading: authInCaricamento } = useAuthUser();
  const companyId = effectiveCompany?.id;

  // Niente «Demo Azienda» mentre l'azienda si carica: prima la pagina partiva
  // con i dati demo (media, messaggi, griglia finti) e poi li sostituiva.
  if (!companyId) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 p-6 text-sm text-slate-500">
        {authInCaricamento
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Carico i dati dell'azienda…</>
          : "Nessuna azienda selezionata."}
      </div>
    );
  }

  return (
    <GestioneSocial
      key={companyId}
      companyId={companyId}
      nomeAzienda={effectiveCompany?.name}
      settoreAzienda={effectiveCompany?.sector}
    />
  );
}

function GestioneSocial({
  companyId,
  nomeAzienda,
  settoreAzienda,
}: {
  companyId: string;
  nomeAzienda?: string;
  settoreAzienda?: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get("tab") ?? "crea-post";
  // I contenuti demo (media, inbox, celle grid) si mostrano SOLO alla Demo
  // Azienda: un'azienda reale deve vedere esclusivamente i propri dati, non
  // 12 media finti e 4 messaggi mai ricevuti.
  const isDemoCompany = isDemoCompanyId(companyId);
  const queryClient = useQueryClient();
  const socialData = useSocialManagerData(companyId);
  const {
    connectedAccounts,
    posts,
    mediaItems: storedMediaItems,
    addPost,
    updatePost,
    addMedia,
    error: erroreDati,
    riprova: riprovaDati,
  } = socialData;
  const statoPubblicazione = useStatoPubblicazioneSocial(companyId);
  const mediaItems = useMemo(
    () => storedMediaItems.length > 0 ? storedMediaItems : (isDemoCompany ? DEMO_MEDIA_ITEMS : []),
    [storedMediaItems, isDemoCompany],
  );
  const [selectedMediaForComposer, setSelectedMediaForComposer] = useState<MediaItem | null>(null);

  const setTab = useCallback((tab: string) => setSearchParams({ tab }, { replace: true }), [setSearchParams]);
  const goToIntegrations = useCallback(() => navigate("/azienda/impostazioni/integrazioni"), [navigate]);

  /** true se il post è salvato: il composer si svuota solo allora. */
  const handlePostScheduled = useCallback(async (post: ScheduledPost): Promise<boolean> => {
    let saved: ScheduledPost | undefined;
    try {
      saved = await addPost(post);
    } catch {
      // errore di salvataggio già notificato dall'onError della mutation
      return false;
    }
    // Pubblicazione reale "adesso": i post con scheduled_at <= ora vengono
    // inviati subito via edge `social-publish` (FB/IG). I post programmati nel
    // futuro restano 'scheduled' e li pubblica il cron `social-publish-scheduler`.
    const id = saved?.id;
    const dueNow = saved?.scheduled_at ? new Date(saved.scheduled_at).getTime() <= Date.now() + 60_000 : false;
    const isDbPost = typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
    if (SOCIAL_LIVE_PUBLISHING_ENABLED && dueNow && isDbPost && saved?.status === "scheduled") {
      const nomeCanale = (k: string) => PLATFORMS.find((p) => p.id === k)?.name ?? k;
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { post_id: id, company_id: companyId } });
      if (error) {
        toast.error("Pubblicazione non riuscita", { description: error.message });
      } else {
        const payload = data as { pending?: boolean; result?: Record<string, SocialPublishResultEntry> } | null;
        const res = payload?.result ?? {};
        const okCh = Object.entries(res).filter(([, v]) => v?.ok).map(([k]) => nomeCanale(k));
        const pendingCh = Object.entries(res).filter(([, v]) => v?.pending).map(([k]) => nomeCanale(k));
        const errCh = Object.entries(res).filter(([, v]) => v && v.ok === false && !v.pending);
        const warnings = Object.values(res).flatMap((v) => v?.warnings ?? []);
        if (okCh.length) toast.success(`Pubblicato su ${okCh.join(" e ")}`);
        if (pendingCh.length) {
          toast.info(`${pendingCh.join(" e ")}: Meta sta ancora elaborando il file`, {
            description: "Il post esce da solo appena è pronto: l'esito compare nel calendario.",
          });
        } else if (payload?.pending && !okCh.length && !errCh.length) {
          toast.info("Pubblicazione già in corso", { description: "L'esito compare nel calendario tra poco." });
        }
        if (errCh.length) toast.error(`Non pubblicato su ${errCh.map(([k]) => nomeCanale(k)).join(" e ")}`, { description: errCh[0]?.[1]?.error });
        if (warnings.length) toast.warning("Pubblicato con un avviso", { description: warnings[0] });
      }
      queryClient.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
    }
    return true;
  }, [addPost, companyId, queryClient]);

  const handleUpdatePost = useCallback((id: string, changes: Partial<ScheduledPost>) => {
    updatePost(id, changes).catch(() => {});
  }, [updatePost]);

  const handleUseInPost = useCallback((item: MediaItem) => {
    setSelectedMediaForComposer(item);
    setTab("crea-post");
    toast.success(`«${item.title}» è nel post`, { description: "Lo trovi nel passo 2, «Cosa»." });
  }, [setTab]);

  const handleUseInAds = useCallback((item: MediaItem) => {
    navigate("/azienda/marketing/pubblicita?tab=creativita");
    toast.success(`«${item.title}» è pronto per la pubblicità`, { description: "Sceglilo come immagine nella campagna." });
  }, [navigate]);

  const handleUploadRequested = useCallback(() => {
    setTab("crea-post");
    toast.info("Carica la foto dal passo 2 di «Crea post».");
  }, [setTab]);

  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const reviewCount    = posts.filter((p) => p.status === "review").length;
  const mediaCount     = mediaItems.length;
  // inboxUnread is kept in sync by InboxTab via onUnreadChange callback.
  // Il badge parte da 0 per le aziende reali: i "4 da leggere" erano i
  // messaggi DEMO, mostrati come se fossero conversazioni vere.
  const [inboxUnread, setInboxUnread] = useState(() =>
    isDemoCompany ? DEMO_INBOX.filter((i) => i.status === "unread").length : 0,
  );
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const tabs = [
    { id: "crea-post",  label: "Crea post",  icon: Edit3          },
    { id: "calendario", label: "Calendario", icon: Calendar,       badge: reviewCount > 0 ? `${reviewCount} da approvare` : (scheduledCount > 0 ? scheduledCount : undefined) },
    { id: "grid",       label: "Griglia",    icon: Smartphone      },
    { id: "inbox",      label: "Messaggi",   icon: MessageSquare,  badge: inboxUnread > 0 ? inboxUnread : undefined },
    { id: "analitiche", label: "Statistiche", icon: TrendingUp     },
    { id: "galleria",   label: "Galleria",   icon: Library,        badge: mediaCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">

        {/* ─── PAGE HEADER ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Gestione social</h1>
              <Badge className="border-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white">Beta</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">Scrivi, programma e pubblica i post delle tue pagine Facebook e Instagram.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={goToIntegrations} className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Collegamenti
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Importa da CSV
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

        {/* ─── STATO DELLE PAGINE ──────────────────────────────────────── */}
        <PlatformStatusRibbon
          stato={statoPubblicazione.stato}
          isLoading={statoPubblicazione.isLoading}
          error={statoPubblicazione.error}
          onRiprova={() => void statoPubblicazione.riprova()}
          staVerificando={statoPubblicazione.staVerificando}
          verificaNonRiuscita={statoPubblicazione.verificaNonRiuscita}
          onGoToSettings={goToIntegrations}
        />

        {/* Un errore vero si dice: prima la pagina mostrava i dati rimasti nel browser. */}
        {erroreDati && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5">
            <span className="flex items-start gap-2 text-xs font-medium text-red-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Non riesco a caricare post e file social. {erroreDati.message}
            </span>
            <Button size="sm" variant="outline" onClick={riprovaDati}
              className="h-7 shrink-0 gap-1.5 border-red-200 bg-white text-red-700 hover:bg-red-100">
              <RefreshCw className="h-3 w-3" /> Riprova
            </Button>
          </div>
        )}

        {/* ─── TABS ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b scrollbar-none">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition-colors md:px-5 md:py-4",
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
          <div className="p-3 sm:p-4 md:p-6">
            {activeTab === "crea-post" && (
              <ContentStudioTab
                companyId={companyId}
                nomeAzienda={nomeAzienda}
                settoreAzienda={settoreAzienda}
                stato={statoPubblicazione.stato}
                verificaNonRiuscita={statoPubblicazione.verificaNonRiuscita}
                selectedMedia={selectedMediaForComposer}
                onSelectedMediaConsumed={() => setSelectedMediaForComposer(null)}
                onPostScheduled={handlePostScheduled}
                onMediaStored={addMedia}
                onGoToSettings={goToIntegrations}
              />
            )}
            {activeTab === "calendario" && (
              <CalendarioTab posts={posts} onNewPost={() => setTab("crea-post")} onUpdatePost={handleUpdatePost} />
            )}
            {activeTab === "grid" && (
              <GridPlannerTab posts={posts} demoMode={isDemoCompany} />
            )}
            {activeTab === "inbox" && (
              <InboxTab onUnreadChange={setInboxUnread} demoMode={isDemoCompany} />
            )}
            {activeTab === "analitiche" && (
              <StatistichePagineSocial companyId={companyId} connectedAccounts={connectedAccounts} onGoToSettings={goToIntegrations} />
            )}
            {activeTab === "galleria" && (
              <GalleriaTab mediaItems={mediaItems} onUseInPost={handleUseInPost} onUseInAds={handleUseInAds} onUploadRequested={handleUploadRequested} demoMode={isDemoCompany} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
