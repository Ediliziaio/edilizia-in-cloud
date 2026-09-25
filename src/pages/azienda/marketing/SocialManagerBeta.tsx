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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { usePostFacebookEsterni, usePostInstagramReali, usePuoApprovareSocial } from "@/hooks/useCalendarioSocial";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { readInvokeError } from "@/lib/readInvokeError";
import {
  azioniPost,
  chiaveGiorno,
  contaPerGruppo,
  dataPerNuovoPost,
  destinazioniPronte,
  elencoNomi,
  fasceOrarie,
  gruppoDi,
  haData,
  inizioSettimana,
  nomePiattaforma,
  piattaformeFallite,
  postEsterniNuovi,
  statoCalendario,
  type AzionePost,
  type GruppoStato,
  type InfoStato,
  type PostEsterno,
  type StatoCalendario,
} from "@/lib/social/calendario";
import {
  costruisciGriglia,
  numeroIntero,
  scambiabile,
  type CellaGriglia,
  type PostInstagramReale,
} from "@/lib/social/griglia";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CALENDARIO — stati veri, azioni sul post, telefono (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Prima era una vetrina: nessuna azione sui post (tranne approva/rimanda, per
// chiunque), la settimana nascondeva i post prima delle 8 e dopo le 21, un post
// mai uscito restava «Programmato», uno uscito a metà era «Pubblicato», le
// bozze stavano su domani, e sul telefono la pagina scorreva di lato.

const STILE_STATO: Record<StatoCalendario, { pallino: string; voce: string; badge: string }> = {
  bozza:            { pallino: "bg-slate-400",   voce: "border-slate-200 bg-slate-50 text-slate-700",        badge: "border-slate-200 bg-slate-50 text-slate-600" },
  da_approvare:     { pallino: "bg-amber-400",   voce: "border-amber-200 bg-amber-50 text-amber-900",        badge: "border-amber-200 bg-amber-50 text-amber-700" },
  programmato:      { pallino: "bg-blue-500",    voce: "border-blue-100 bg-blue-50 text-blue-900",           badge: "border-blue-200 bg-blue-50 text-blue-700" },
  in_ritardo:       { pallino: "bg-orange-500",  voce: "border-orange-200 bg-orange-50 text-orange-900",     badge: "border-orange-200 bg-orange-50 text-orange-700" },
  in_pubblicazione: { pallino: "bg-violet-500",  voce: "border-violet-100 bg-violet-50 text-violet-900",     badge: "border-violet-200 bg-violet-50 text-violet-700" },
  pubblicato:       { pallino: "bg-emerald-500", voce: "border-emerald-100 bg-emerald-50 text-emerald-900",  badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  uscito_in_parte:  { pallino: "bg-orange-500",  voce: "border-orange-200 bg-orange-50 text-orange-900",     badge: "border-orange-200 bg-orange-50 text-orange-700" },
  fallito:          { pallino: "bg-red-500",     voce: "border-red-200 bg-red-50 text-red-900",              badge: "border-red-200 bg-red-50 text-red-700" },
};
/** Post letti da Facebook, fatti fuori dall'app: bordo tratteggiato, non sono «nostri». */
const STILE_ESTERNO = "border-dashed border-slate-300 bg-white text-slate-600";

const GRUPPI: Array<{ id: GruppoStato; etichetta: string; pallino: string }> = [
  { id: "programmati", etichetta: "Programmati", pallino: "bg-blue-500" },
  { id: "da_approvare", etichetta: "Da approvare", pallino: "bg-amber-400" },
  { id: "pubblicati", etichetta: "Pubblicati", pallino: "bg-emerald-500" },
  { id: "da_sistemare", etichetta: "Da sistemare", pallino: "bg-red-500" },
];

const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES_SHORT = ["L","M","M","G","V","S","D"];
const DAY_NAMES_FULL  = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

/** Una voce del calendario: un post dell'app, o un post letto da una pagina Facebook. */
type VoceCalendario =
  | { tipo: "post"; id: string; quando: Date; post: ScheduledPost; info: InfoStato }
  | { tipo: "esterno"; id: string; quando: Date; esterno: PostEsterno };

interface DatiAzione {
  quando?: string;
  nota?: string;
}

/** Un post salvato nel database (id uuid), non rimasto nel browser. */
const isUuidPost = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);

const oraBreve = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const suInstagram = (voce: VoceCalendario) => voce.tipo === "esterno" && voce.esterno.piattaforma === "instagram";

const testoVoce = (voce: VoceCalendario) =>
  voce.tipo === "post"
    ? (voce.post.text.trim() || "Post senza testo")
    : (voce.esterno.testo.trim() || (suInstagram(voce) ? "Post su Instagram" : "Post su Facebook"));

const stileVoce = (voce: VoceCalendario) => (voce.tipo === "post" ? STILE_STATO[voce.info.stato].voce : STILE_ESTERNO);

const etichettaVoce = (voce: VoceCalendario) =>
  voce.tipo === "post" ? voce.info.etichetta : suInstagram(voce) ? "Su Instagram" : "Su Facebook, fuori dall'app";

function IconePiattaforme({ ids, max = 3, size = "sm" }: { ids: string[]; max?: number; size?: "xs" | "sm" }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {ids.slice(0, max).map((id) => {
        const p = PLATFORMS.find((pl) => pl.id === id);
        return (
          <span key={id} title={p?.name ?? id}
            className={cn(
              "flex items-center justify-center rounded bg-gradient-to-br font-bold text-white",
              size === "xs" ? "h-3.5 w-3.5 text-[7px]" : "h-4 w-4 text-[8px]",
              p?.gradient ?? "from-slate-300 to-slate-400",
            )}>
            {p?.icon ?? "·"}
          </span>
        );
      })}
    </span>
  );
}

/** Colore del numerino del giorno: il problema prima di tutto. */
function coloreConteggio(voci: VoceCalendario[]): string {
  const stati = voci.flatMap((v) => (v.tipo === "post" ? [v.info] : []));
  if (stati.some((s) => s.problema)) return "bg-red-500";
  if (stati.some((s) => s.stato === "da_approvare")) return "bg-amber-400";
  if (stati.some((s) => s.stato === "programmato" || s.stato === "in_pubblicazione")) return "bg-blue-500";
  if (stati.some((s) => s.stato === "pubblicato")) return "bg-emerald-500";
  return "bg-slate-400";
}

/** La voce piccola della cella del mese e della settimana. */
function VoceCompatta({ voce, onApri }: { voce: VoceCalendario; onApri: (voce: VoceCalendario) => void }) {
  const piattaforme = voce.tipo === "post" ? voce.post.platforms : [voce.esterno.piattaforma ?? "facebook"];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onApri(voce); }}
      title={`${oraBreve(voce.quando)} · ${etichettaVoce(voce)} · ${testoVoce(voce)}`}
      className={cn("flex w-full min-w-0 flex-col gap-0.5 rounded-md border px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:brightness-95", stileVoce(voce))}
    >
      {/* Due righe: piattaforme e ora sopra, il testo sotto, largo quanto la cella. */}
      <span className="flex min-w-0 items-center gap-1">
        <IconePiattaforme ids={piattaforme} max={3} size="xs" />
        <span className="shrink-0 tabular-nums">{oraBreve(voce.quando)}</span>
      </span>
      <span className="block min-w-0 truncate">{testoVoce(voce)}</span>
    </button>
  );
}

/** La voce leggibile: elenchi a destra, giorno scelto, elenco per giorni del telefono. */
function VoceEstesa({ voce, onApri, conData = false }: { voce: VoceCalendario; onApri: (voce: VoceCalendario) => void; conData?: boolean }) {
  const piattaforme = voce.tipo === "post" ? voce.post.platforms : [voce.esterno.piattaforma ?? "facebook"];
  const badge = voce.tipo === "post" ? STILE_STATO[voce.info.stato].badge : STILE_ESTERNO;
  return (
    <button type="button" onClick={() => onApri(voce)}
      className="flex w-full min-w-0 flex-col gap-1 rounded-xl border border-slate-100 bg-white p-2.5 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40">
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <IconePiattaforme ids={piattaforme} />
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
          {voce.tipo === "post" && !haData(voce.post)
            ? "Senza data"
            : conData
              ? voce.quando.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : oraBreve(voce.quando)}
        </span>
        <span className={cn("ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", badge)}>
          {voce.tipo === "post" ? voce.info.etichetta : suInstagram(voce) ? "Su Instagram" : "Su Facebook"}
        </span>
      </span>
      <span className="line-clamp-2 text-[12px] text-slate-700">{testoVoce(voce)}</span>
    </button>
  );
}

function CalendarioTab({
  companyId,
  posts,
  stato,
  puoApprovare,
  nomeUtente,
  onApriVoce,
  onNuovoPost,
  onAzione,
}: {
  companyId: string;
  posts: ScheduledPost[];
  stato: StatoPubblicazioneSocial | null;
  puoApprovare: boolean;
  nomeUtente: (id?: string) => string | null;
  onApriVoce: (voce: VoceCalendario) => void;
  onNuovoPost: (quando: { data: string; ora: string } | null) => void;
  onAzione: (post: ScheduledPost, azione: AzionePost, dati?: DatiAzione) => Promise<boolean>;
}) {
  // L'ora che passa: «in ritardo» si aggiorna da solo, senza ricaricare.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAdesso(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const oggi = new Date(adesso);

  const [vista, setVista] = useState<"month" | "week">("month");
  const [mese, setMese] = useState(() => new Date().getMonth());
  const [anno, setAnno] = useState(() => new Date().getFullYear());
  const [inizioSett, setInizioSett] = useState<Date>(() => inizioSettimana(new Date()));
  const [giornoScelto, setGiornoScelto] = useState<string | null>(null);
  const [filtroGruppo, setFiltroGruppo] = useState<GruppoStato | "tutti">("tutti");
  const [filtroPiattaforma, setFiltroPiattaforma] = useState<string | null>(null);
  const [mostraEsterni, setMostraEsterni] = useState(true);
  const [rimandaId, setRimandaId] = useState<string | null>(null);
  const [notaRimanda, setNotaRimanda] = useState("");
  const [tutteLeBozze, setTutteLeBozze] = useState(false);

  // Il periodo mostrato: il mese, o i sette giorni da lunedì.
  const inizio = vista === "month" ? new Date(anno, mese, 1) : inizioSett;
  const fine = vista === "month"
    ? new Date(anno, mese + 1, 1)
    : new Date(inizioSett.getFullYear(), inizioSett.getMonth(), inizioSett.getDate() + 7);
  const inPeriodo = (d: Date) => d >= inizio && d < fine;

  // I post pubblicati su Facebook nel periodo, anche fuori dall'app.
  const esterniQuery = usePostFacebookEsterni(companyId, stato, inizio, fine);
  const esterniNuovi = useMemo(
    () => postEsterniNuovi(esterniQuery.data?.posts ?? [], posts),
    [esterniQuery.data, posts],
  );

  const vociApp = useMemo<VoceCalendario[]>(() => posts
    .filter((p) => p.status !== "draft" && haData(p))
    .map((p) => ({ tipo: "post" as const, id: p.id, quando: new Date(p.scheduled_at), post: p, info: statoCalendario(p, adesso) })),
  [posts, adesso]);
  const vociEsterne = useMemo<VoceCalendario[]>(() => esterniNuovi
    .map((e) => ({ tipo: "esterno" as const, id: `fb-${e.id}`, quando: new Date(e.quando), esterno: e }))
    .filter((v) => Number.isFinite(v.quando.getTime())),
  [esterniNuovi]);

  const passaFiltri = (voce: VoceCalendario) => {
    if (voce.tipo === "esterno") {
      return mostraEsterni && (filtroGruppo === "tutti" || filtroGruppo === "pubblicati")
        && (!filtroPiattaforma || filtroPiattaforma === "facebook");
    }
    if (filtroPiattaforma && !voce.post.platforms.includes(filtroPiattaforma)) return false;
    return filtroGruppo === "tutti" || gruppoDi(voce.info.stato) === filtroGruppo;
  };
  const vociVisibili = [...vociApp, ...vociEsterne].filter(passaFiltri);
  const perGiorno = new Map<string, VoceCalendario[]>();
  for (const voce of vociVisibili) {
    const chiave = chiaveGiorno(voce.quando);
    perGiorno.set(chiave, [...(perGiorno.get(chiave) ?? []), voce]);
  }
  for (const voci of perGiorno.values()) voci.sort((a, b) => a.quando.getTime() - b.quando.getTime());

  // Contatori del periodo (i post dell'app; il filtro piattaforma vale anche qui).
  const postDelPeriodo = posts.filter((p) => p.status !== "draft" && haData(p) && inPeriodo(new Date(p.scheduled_at))
    && (!filtroPiattaforma || p.platforms.includes(filtroPiattaforma)));
  const conti = contaPerGruppo(postDelPeriodo, adesso);
  const esterniNelPeriodo = vociEsterne.filter((v) => inPeriodo(v.quando)).length;
  const piattaformeUsate = Array.from(new Set([
    ...posts.flatMap((p) => p.platforms),
    ...(vociEsterne.length > 0 ? ["facebook"] : []),
  ])).filter((id) => PLATFORMS.some((p) => p.id === id));

  const daApprovare = posts
    .filter((p) => p.status === "review")
    .sort((a, b) => (Date.parse(a.scheduled_at) || 0) - (Date.parse(b.scheduled_at) || 0));
  const vociDaSistemare = vociApp
    .filter((v) => v.tipo === "post" && v.info.problema)
    .sort((a, b) => b.quando.getTime() - a.quando.getTime());
  const vociProssime = vociApp
    .filter((v) => v.tipo === "post" && (v.info.stato === "programmato" || v.info.stato === "in_pubblicazione")
      && v.quando.getTime() >= adesso - 60 * 60_000 && v.quando.getTime() < adesso + 14 * 86_400_000)
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())
    .slice(0, 8);
  const bozze = posts
    .filter((p) => p.status === "draft")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const vociBozze: VoceCalendario[] = bozze.map((p) => ({
    tipo: "post" as const, id: p.id, quando: new Date(haData(p) ? p.scheduled_at : p.created_at), post: p, info: statoCalendario(p, adesso),
  }));

  const vaiA = (direzione: -1 | 1) => {
    setGiornoScelto(null);
    if (vista === "month") {
      const d = new Date(anno, mese + direzione, 1);
      setMese(d.getMonth());
      setAnno(d.getFullYear());
    } else {
      setInizioSett((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * direzione));
    }
  };
  const vaiAOggi = () => {
    const d = new Date(adesso);
    setMese(d.getMonth());
    setAnno(d.getFullYear());
    setInizioSett(inizioSettimana(d));
    setGiornoScelto(null);
  };

  // ── Mese ──
  const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
  const primoGiorno = new Date(anno, mese, 1).getDay();
  const spostamento = primoGiorno === 0 ? 6 : primoGiorno - 1;

  // ── Settimana: ore allargate a quelle dei post ──
  const giorniSettimana = Array.from({ length: 7 }, (_, i) =>
    new Date(inizioSett.getFullYear(), inizioSett.getMonth(), inizioSett.getDate() + i));
  const oreSettimana = fasceOrarie(
    giorniSettimana.flatMap((g) => (perGiorno.get(chiaveGiorno(g)) ?? []).map((v) => v.quando.getHours())),
  );

  // ── Telefono: i giorni del periodo che hanno qualcosa ──
  const giorniDelPeriodo: Date[] = [];
  for (let d = new Date(inizio); d < fine; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) giorniDelPeriodo.push(d);
  const agenda = giorniDelPeriodo
    .map((giorno) => ({ giorno, voci: perGiorno.get(chiaveGiorno(giorno)) ?? [] }))
    .filter((g) => g.voci.length > 0);

  const vociGiornoScelto = giornoScelto ? perGiorno.get(giornoScelto) ?? [] : [];
  const dataGiornoScelto = giornoScelto ? new Date(`${giornoScelto}T12:00:00`) : null;
  const nuovoNelGiornoScelto = dataGiornoScelto ? dataPerNuovoPost(dataGiornoScelto, null, oggi) : null;

  const titoloPeriodo = vista === "month"
    ? `${MONTH_NAMES[mese]} ${anno}`
    : `${giorniSettimana[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${giorniSettimana[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
  const nessunPost = posts.length === 0 && vociEsterne.length === 0;

  return (
    <div className="space-y-4">

      {/* ── DA APPROVARE ─────────────────────────────────────────────── */}
      {daApprovare.length > 0 && (puoApprovare ? (
        <div className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50">
          <p className="border-b border-amber-200 px-4 py-2.5 text-sm font-bold text-amber-900">
            {daApprovare.length === 1 ? "1 post da approvare" : `${daApprovare.length} post da approvare`}
          </p>
          <div className="divide-y divide-amber-200">
            {daApprovare.map((post) => {
              const autore = nomeUtente(post.createdBy);
              const passato = !haData(post) || Date.parse(post.scheduled_at) < adesso + 60_000;
              const inRimanda = rimandaId === post.id;
              return (
                <div key={post.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <button type="button" className="w-full min-w-0 space-y-1 text-left sm:w-auto sm:flex-1"
                    onClick={() => onApriVoce({ tipo: "post", id: post.id, quando: new Date(post.scheduled_at || post.created_at), post, info: statoCalendario(post, adesso) })}>
                    <span className="flex flex-wrap items-center gap-2 text-[11px] text-amber-800">
                      <IconePiattaforme ids={post.platforms} />
                      <span className="font-semibold">
                        {haData(post)
                          ? new Date(post.scheduled_at).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "Senza data"}
                      </span>
                      {autore && <span>· di {autore}</span>}
                      {passato && <span className="font-semibold text-orange-700">· l'orario è passato</span>}
                    </span>
                    <span className="line-clamp-2 block text-sm text-slate-800">{post.text || "Post senza testo"}</span>
                  </button>
                  {inRimanda ? (
                    <div className="flex w-full flex-col gap-2 sm:w-72">
                      <Textarea rows={2} value={notaRimanda} onChange={(e) => setNotaRimanda(e.target.value)}
                        placeholder="Cosa va cambiato? Es.: metti la foto del cantiere"
                        className="resize-none border-amber-200 bg-white text-xs" />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
                          onClick={() => void onAzione(post, "rimanda", { nota: notaRimanda }).then((ok) => { if (ok) { setRimandaId(null); setNotaRimanda(""); } })}>
                          Rimanda in bozza
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setRimandaId(null); setNotaRimanda(""); }}>Annulla</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void onAzione(post, "approva")}>
                        <Check className="h-3.5 w-3.5" /> {passato ? "Approva e pubblica adesso" : "Approva"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                        onClick={() => { setRimandaId(post.id); setNotaRimanda(""); }}>
                        <X className="h-3.5 w-3.5" /> Rimanda
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {daApprovare.length === 1 ? "1 post aspetta" : `${daApprovare.length} post aspettano`} l'approvazione del titolare o di un amministratore.
        </p>
      ))}

      {/* ── NAVIGAZIONE E FILTRI ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Periodo precedente" onClick={() => vaiA(-1)} className="rounded-xl p-2 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[9.5rem] text-center text-sm font-bold text-slate-800">{titoloPeriodo}</span>
          <button type="button" aria-label="Periodo successivo" onClick={() => vaiA(1)} className="rounded-xl p-2 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={vaiAOggi}
            className="ml-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
            Oggi
          </button>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
          {(["month", "week"] as const).map((v) => (
            <button key={v} type="button" onClick={() => { setVista(v); setGiornoScelto(null); }} aria-pressed={vista === v}
              className={cn("px-3.5 py-1.5 font-semibold transition", vista === v ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50")}>
              {v === "month" ? "Mese" : "Settimana"}
            </button>
          ))}
        </div>
      </div>

      {!nessunPost && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setFiltroGruppo("tutti")} aria-pressed={filtroGruppo === "tutti"}
            className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
              filtroGruppo === "tutti" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
            Tutti
          </button>
          {GRUPPI.map((g) => (
            <button key={g.id} type="button" onClick={() => setFiltroGruppo(filtroGruppo === g.id ? "tutti" : g.id)} aria-pressed={filtroGruppo === g.id}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                filtroGruppo === g.id ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              <span className={cn("h-2 w-2 rounded-full", g.pallino)} />
              {g.etichetta}
              <span className="tabular-nums text-slate-400">{conti[g.id]}</span>
            </button>
          ))}
          {vociEsterne.length > 0 && (
            <button type="button" onClick={() => setMostraEsterni((v) => !v)} aria-pressed={mostraEsterni}
              className={cn("flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-[11px] font-semibold transition",
                mostraEsterni ? "border-slate-400 bg-white text-slate-700" : "border-slate-200 bg-white text-slate-400")}>
              <ExternalLink className="h-3 w-3" />
              Fatti su Facebook
              <span className="tabular-nums text-slate-400">{esterniNelPeriodo}</span>
            </button>
          )}
          {piattaformeUsate.length > 1 && (
            <span className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              {piattaformeUsate.map((id) => (
                <button key={id} type="button" onClick={() => setFiltroPiattaforma(filtroPiattaforma === id ? null : id)} aria-pressed={filtroPiattaforma === id}
                  className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                    filtroPiattaforma === id ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                  <IconePiattaforme ids={[id]} size="xs" />
                  {nomePiattaforma(id)}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {esterniQuery.data?.errori && esterniQuery.data.errori.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Non riesco a leggere i post di {elencoNomi(esterniQuery.data.errori)} da Facebook: nel calendario ci sono solo quelli fatti da qui.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {/* ── MESE (computer e tablet) ── */}
          {vista === "month" && (
            <Card className="hidden overflow-hidden sm:block">
              <CardContent className="p-3">
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {DAY_NAMES_SHORT.map((d, i) => (
                    <div key={i} className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
                  {Array.from({ length: spostamento }).map((_, i) => (
                    <div key={`vuoto-${i}`} className="min-h-[104px] bg-slate-50/60" />
                  ))}
                  {Array.from({ length: giorniNelMese }, (_, i) => i + 1).map((numero) => {
                    const giorno = new Date(anno, mese, numero);
                    const chiave = chiaveGiorno(giorno);
                    const voci = perGiorno.get(chiave) ?? [];
                    const eOggi = chiave === chiaveGiorno(oggi);
                    const passato = !eOggi && giorno.getTime() < oggi.getTime();
                    const scelto = chiave === giornoScelto;
                    const nuovo = dataPerNuovoPost(giorno, null, oggi);
                    return (
                      <div key={chiave} role="button" tabIndex={0}
                        aria-label={`${numero} ${MONTH_NAMES[mese]}: ${voci.length === 1 ? "1 post" : `${voci.length} post`}`}
                        onClick={() => setGiornoScelto(scelto ? null : chiave)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGiornoScelto(scelto ? null : chiave); } }}
                        className={cn(
                          "group relative flex min-h-[104px] min-w-0 cursor-pointer flex-col gap-1 p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
                          scelto ? "bg-orange-50 ring-2 ring-inset ring-orange-400" : passato ? "bg-slate-50/70 hover:bg-orange-50/40" : "bg-white hover:bg-orange-50/40",
                        )}>
                        <div className="flex items-center justify-between">
                          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                            eOggi ? "bg-orange-500 text-white" : passato ? "text-slate-400" : "text-slate-700")}>
                            {numero}
                          </span>
                          <span className="flex items-center gap-1">
                            {voci.length > 0 && (
                              <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white", coloreConteggio(voci))}>
                                {voci.length}
                              </span>
                            )}
                            {nuovo && (
                              <button type="button" aria-label={`Nuovo post il ${numero} ${MONTH_NAMES[mese]}`}
                                onClick={(e) => { e.stopPropagation(); onNuovoPost(nuovo); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover:opacity-100">
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        </div>
                        {voci.slice(0, 3).map((voce) => <VoceCompatta key={voce.id} voce={voce} onApri={onApriVoce} />)}
                        {voci.length > 3 && (
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-center text-[10px] font-semibold text-slate-500">
                            altri {voci.length - 3}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── SETTIMANA (computer e tablet) ── */}
          {vista === "week" && (
            <Card className="hidden overflow-hidden sm:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid border-b" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
                      <div className="border-r" />
                      {giorniSettimana.map((g, i) => {
                        const voci = perGiorno.get(chiaveGiorno(g)) ?? [];
                        const eOggi = chiaveGiorno(g) === chiaveGiorno(oggi);
                        return (
                          <div key={i} className={cn("flex flex-col items-center border-r py-2 last:border-r-0", eOggi && "bg-orange-50/60")}>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{DAY_NAMES_FULL[i].slice(0, 3)}</span>
                            <span className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold", eOggi ? "bg-orange-500 text-white" : "text-slate-700")}>
                              {g.getDate()}
                            </span>
                            {voci.length > 0 && (
                              <span className={cn("mt-0.5 rounded-full px-1.5 text-[9px] font-bold text-white", coloreConteggio(voci))}>{voci.length}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {oreSettimana.map((ora) => (
                      <div key={ora} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
                        <div className="flex items-start justify-center border-r pt-1.5">
                          <span className="text-[10px] font-medium tabular-nums text-slate-400">{String(ora).padStart(2, "0")}:00</span>
                        </div>
                        {giorniSettimana.map((g, di) => {
                          const voci = (perGiorno.get(chiaveGiorno(g)) ?? []).filter((v) => v.quando.getHours() === ora);
                          const nuovo = voci.length === 0 ? dataPerNuovoPost(g, ora, oggi) : null;
                          const eOggi = chiaveGiorno(g) === chiaveGiorno(oggi);
                          return (
                            <div key={di}
                              {...(nuovo ? {
                                role: "button",
                                tabIndex: 0,
                                "aria-label": `Nuovo post ${DAY_NAMES_FULL[di]} ${g.getDate()} alle ${String(ora).padStart(2, "0")}:00`,
                                onClick: () => onNuovoPost(nuovo),
                                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNuovoPost(nuovo); } },
                              } : {})}
                              className={cn("group min-h-[52px] space-y-0.5 border-r p-0.5 last:border-r-0", eOggi && "bg-orange-50/30",
                                nuovo && "cursor-pointer hover:bg-orange-50/60")}>
                              {voci.map((voce) => <VoceCompatta key={voce.id} voce={voce} onApri={onApriVoce} />)}
                              {nuovo && (
                                <span className="hidden h-full items-center justify-center text-[10px] font-semibold text-orange-600 group-hover:flex">
                                  <Plus className="mr-0.5 h-3 w-3" /> Post
                                </span>
                              )}
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

          {/* ── TELEFONO: elenco per giorni ── */}
          <div className="space-y-3 sm:hidden">
            {agenda.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center">
                <p className="text-sm font-medium text-slate-600">
                  {vista === "month" ? "Nessun post in questo mese" : "Nessun post in questa settimana"}
                </p>
                <Button size="sm" className="mt-3 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white" onClick={() => onNuovoPost(null)}>
                  <Plus className="h-3.5 w-3.5" /> Crea post
                </Button>
              </div>
            ) : agenda.map(({ giorno, voci }) => {
              const nuovo = dataPerNuovoPost(giorno, null, oggi);
              return (
                <div key={chiaveGiorno(giorno)} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className={cn("text-xs font-bold capitalize", chiaveGiorno(giorno) === chiaveGiorno(oggi) ? "text-orange-600" : "text-slate-700")}>
                      {giorno.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    {nuovo && (
                      <button type="button" onClick={() => onNuovoPost(nuovo)} className="flex items-center gap-0.5 text-[11px] font-semibold text-orange-600">
                        <Plus className="h-3 w-3" /> Post
                      </button>
                    )}
                  </div>
                  {voci.map((voce) => <VoceEstesa key={voce.id} voce={voce} onApri={onApriVoce} />)}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── A DESTRA ─────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          {giornoScelto && dataGiornoScelto ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold capitalize text-slate-800">
                  {dataGiornoScelto.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <button type="button" aria-label="Chiudi il giorno" onClick={() => setGiornoScelto(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {vociGiornoScelto.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Nessun post in questo giorno.</p>
              )}
              {vociGiornoScelto.map((voce) => <VoceEstesa key={voce.id} voce={voce} onApri={onApriVoce} />)}
              {nuovoNelGiornoScelto && (
                <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => onNuovoPost(nuovoNelGiornoScelto)}>
                  <Plus className="h-3.5 w-3.5" /> Nuovo post in questo giorno
                </Button>
              )}
            </div>
          ) : nessunPost ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
              <Calendar className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nessun post ancora</p>
              <p className="mt-1 text-xs text-slate-400">Clicca un giorno del calendario o crea il primo post.</p>
              <Button size="sm" className="mt-3 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white" onClick={() => onNuovoPost(null)}>
                <Plus className="h-3.5 w-3.5" /> Crea post
              </Button>
            </div>
          ) : (
            <>
              {vociDaSistemare.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-red-700">Da sistemare</p>
                  {vociDaSistemare.slice(0, 5).map((voce) => <VoceEstesa key={voce.id} voce={voce} onApri={onApriVoce} conData />)}
                  {vociDaSistemare.length > 5 && <p className="text-[11px] text-slate-500">e altri {vociDaSistemare.length - 5}: filtra «Da sistemare».</p>}
                </div>
              )}
              <div className="hidden space-y-2 sm:block">
                <p className="text-sm font-bold text-slate-800">Prossimi 14 giorni</p>
                {vociProssime.length === 0
                  ? <p className="text-xs text-slate-500">Niente in programma.</p>
                  : vociProssime.map((voce) => <VoceEstesa key={voce.id} voce={voce} onApri={onApriVoce} conData />)}
              </div>
            </>
          )}

          {bozze.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-800">
                Bozze <span className="font-normal text-slate-400">{bozze.length}</span>
              </p>
              {(tutteLeBozze ? vociBozze : vociBozze.slice(0, 5)).map((voce) => (
                <div key={voce.id} className="space-y-1">
                  <VoceEstesa voce={voce} onApri={onApriVoce} conData={voce.tipo === "post" && haData(voce.post)} />
                  {voce.tipo === "post" && voce.post.reviewNote && (
                    <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">Rimandato: {voce.post.reviewNote}</p>
                  )}
                </div>
              ))}
              {bozze.length > 5 && (
                <button type="button" onClick={() => setTutteLeBozze((v) => !v)} className="text-[11px] font-semibold text-orange-600">
                  {tutteLeBozze ? "Mostra meno" : `Mostra tutte (${bozze.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Il post aperto: dettagli e azioni ─────────────────────────────────────────

const ETICHETTE_AZIONI: Record<AzionePost, string> = {
  approva: "Approva",
  rimanda: "Rimanda",
  pubblica_ora: "Pubblica adesso",
  riprova: "Riprova",
  programma: "Programma",
  sposta: "Sposta",
  annulla_programmazione: "Togli dalla programmazione",
  modifica: "Modifica",
  duplica: "Duplica",
  elimina: "Elimina",
};

function PostSocialDialog({
  voce,
  onClose,
  puoApprovare,
  nomeUtente,
  onAzione,
}: {
  voce: VoceCalendario | null;
  onClose: () => void;
  puoApprovare: boolean;
  nomeUtente: (id?: string) => string | null;
  onAzione: (post: ScheduledPost, azione: AzionePost, dati?: DatiAzione) => Promise<boolean>;
}) {
  const [aperta, setAperta] = useState<"sposta" | "programma" | "rimanda" | "elimina" | null>(null);
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [nota, setNota] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [adesso] = useState(() => Date.now());

  const post = voce?.tipo === "post" ? voce.post : null;
  const esterno = voce?.tipo === "esterno" ? voce.esterno : null;
  const info = post ? statoCalendario(post, adesso) : null;
  const azioni = post ? azioniPost(post, { puoApprovare, adesso }) : [];
  const fallite = post ? piattaformeFallite(post) : [];
  const passato = post ? !haData(post) || Date.parse(post.scheduled_at) < adesso + 60_000 : false;
  const idFacebook = post?.publishResult?.facebook?.ok ? post.publishResult.facebook.id : undefined;

  const apriModulo = (modulo: "sposta" | "programma" | "rimanda" | "elimina") => {
    setAperta(modulo);
    if (modulo === "sposta" || modulo === "programma") {
      // Si parte dalla data del post se è nel futuro, altrimenti da domani alle 9.
      const futuro = post !== null && haData(post) && Date.parse(post.scheduled_at) > adesso;
      const base = futuro && post ? new Date(post.scheduled_at) : new Date(adesso + 86_400_000);
      setData(chiaveGiorno(base));
      setOra(futuro ? oraBreve(base) : "09:00");
    }
    if (modulo === "rimanda") setNota("");
  };

  const esegui = async (azione: AzionePost, dati?: DatiAzione) => {
    if (!post) return;
    setInCorso(true);
    try {
      const ok = await onAzione(post, azione, dati);
      if (ok) {
        setAperta(null);
        onClose();
      }
    } finally {
      setInCorso(false);
    }
  };

  const confermaData = (azione: "sposta" | "programma") => {
    const quando = new Date(`${data}T${ora}`);
    if (!data || Number.isNaN(quando.getTime())) {
      toast.error("Scegli giorno e ora");
      return;
    }
    if (quando.getTime() < Date.now() + 60_000) {
      toast.error("Scegli un momento almeno un minuto nel futuro");
      return;
    }
    void esegui(azione, { quando: quando.toISOString() });
  };

  const etichettaAzione = (azione: AzionePost) => {
    if (azione === "approva" && passato) return "Approva e pubblica adesso";
    if (azione === "riprova" && info?.stato === "uscito_in_parte" && fallite.length > 0) {
      return `Riprova su ${elencoNomi(fallite.map(nomePiattaforma))}`;
    }
    return ETICHETTE_AZIONI[azione];
  };

  const principale = azioni.find((a) => a !== "modifica" && a !== "duplica" && a !== "elimina" && a !== "annulla_programmazione");

  return (
    <Dialog open={voce !== null} onOpenChange={(open) => { if (!open) { setAperta(null); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {esterno && (
          <>
            <DialogHeader>
              <DialogTitle>{esterno.piattaforma === "instagram" ? "Post su Instagram" : "Post su Facebook"}</DialogTitle>
              <DialogDescription>
                {[esterno.pagina, new Date(esterno.quando).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })]
                  .filter(Boolean).join(" · ")}
              </DialogDescription>
            </DialogHeader>
            {esterno.immagine && (
              <img loading="lazy" src={esterno.immagine} alt="" className="max-h-64 w-full rounded-xl object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <p className="max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-700">{esterno.testo || "Post senza testo"}</p>
            {esterno.numeri && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { etichetta: "mi piace", valore: esterno.numeri.reazioni },
                  { etichetta: "commenti", valore: esterno.numeri.commenti },
                  { etichetta: "persone raggiunte", valore: esterno.numeri.copertura },
                  { etichetta: "salvataggi", valore: esterno.numeri.salvataggi },
                ].map((n) => (
                  <div key={n.etichetta} className="rounded-xl bg-slate-50 px-2.5 py-2 text-center">
                    <p className="text-base font-bold tabular-nums text-slate-800">{numeroIntero(n.valore)}</p>
                    <p className="text-[10px] text-slate-500">{n.etichetta}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">
              {esterno.piattaforma === "instagram"
                ? "È già su Instagram: si modifica solo da Instagram. I numeri si aggiornano ogni 4 ore."
                : "Pubblicato direttamente su Facebook, non da qui: si modifica solo da Facebook."}
            </p>
            {esterno.link && (
              <Button asChild variant="outline" className="w-full gap-1.5">
                <a href={esterno.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> {esterno.piattaforma === "instagram" ? "Apri su Instagram" : "Apri su Facebook"}
                </a>
              </Button>
            )}
          </>
        )}

        {post && info && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <IconePiattaforme ids={post.platforms} max={5} />
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", STILE_STATO[info.stato].badge)}>{info.etichetta}</span>
              </DialogTitle>
              <DialogDescription>
                {haData(post)
                  ? new Date(post.scheduled_at).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
                  : "Senza data"}
                {" · "}{elencoNomi(post.platforms.map(nomePiattaforma))}
              </DialogDescription>
            </DialogHeader>

            {(post.media?.[0]?.url ?? post.image_url) && (post.media?.[0]?.type ?? "image") === "image" && (
              <img loading="lazy" src={post.media?.[0]?.url ?? post.image_url} alt="" className="max-h-56 w-full rounded-xl object-cover" />
            )}
            <p className="max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-700">{post.text || "Post senza testo"}</p>
            {post.hashtags.length > 0 && <p className="text-xs text-orange-600">{post.hashtags.join(" ")}</p>}

            {describePublishResult(post.publishResult).map((riga) => (
              <p key={riga.text} className={cn("rounded-lg px-2.5 py-1.5 text-xs",
                riga.tone === "error" ? "bg-red-50 text-red-700" : riga.tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-700")}>
                {riga.text}
              </p>
            ))}
            {info.stato === "in_ritardo" && (
              <p className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800">
                Doveva uscire e non è uscito. Pubblicalo adesso, spostalo o toglilo dalla programmazione.
              </p>
            )}
            {post.reviewNote && post.status === "draft" && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">Rimandato: {post.reviewNote}</p>
            )}
            <p className="text-[11px] text-slate-400">
              {[
                nomeUtente(post.createdBy) ? `Scritto da ${nomeUtente(post.createdBy)}` : null,
                post.approvatoDa ? `approvato da ${nomeUtente(post.approvatoDa) ?? "un amministratore"}${post.approvatoIl ? ` il ${new Date(post.approvatoIl).toLocaleDateString("it-IT")}` : ""}` : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {idFacebook && (
              <a href={`https://www.facebook.com/${idFacebook}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                <ExternalLink className="h-3 w-3" /> Vedi su Facebook
              </a>
            )}
            {post.status === "review" && !puoApprovare && (
              <p className="text-xs text-slate-500">Lo approva il titolare o un amministratore: intanto puoi modificarlo o spostarlo.</p>
            )}

            {/* Moduli dell'azione scelta */}
            {(aperta === "sposta" || aperta === "programma") && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Giorno"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
                  <Field label="Ora"><Input type="time" value={ora} onChange={(e) => setOra(e.target.value)} /></Field>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-orange-500 text-white hover:bg-orange-600" disabled={inCorso} onClick={() => confermaData(aperta)}>
                    {aperta === "sposta" ? "Sposta qui" : "Programma"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAperta(null)}>Annulla</Button>
                </div>
              </div>
            )}
            {aperta === "rimanda" && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} className="resize-none bg-white text-sm"
                  placeholder="Cosa va cambiato? Es.: metti la foto del cantiere" />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-amber-600 text-white hover:bg-amber-700" disabled={inCorso}
                    onClick={() => void esegui("rimanda", { nota })}>
                    Rimanda in bozza
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAperta(null)}>Annulla</Button>
                </div>
              </div>
            )}
            {aperta === "elimina" && (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
                <p className="text-sm text-red-800">
                  Eliminare il post?
                  {(post.status === "published") && " Resta su Facebook e Instagram: da qui si toglie solo dal calendario."}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-red-600 text-white hover:bg-red-700" disabled={inCorso} onClick={() => void esegui("elimina")}>
                    Sì, elimina
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAperta(null)}>Annulla</Button>
                </div>
              </div>
            )}

            {aperta === null && azioni.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {azioni.map((azione) => {
                  const modulo = azione === "sposta" || azione === "programma" || azione === "rimanda" || azione === "elimina";
                  return (
                    <Button key={azione} size="sm" disabled={inCorso}
                      variant={azione === principale ? "default" : "outline"}
                      onClick={() => (modulo ? apriModulo(azione) : void esegui(azione))}
                      className={cn(
                        azione === principale && (azione === "approva" || azione === "pubblica_ora"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-orange-500 text-white hover:bg-orange-600"),
                        azione === "elimina" && "border-red-200 text-red-600 hover:bg-red-50",
                      )}>
                      {inCorso && azione === principale ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      {etichettaAzione(azione)}
                    </Button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
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

/**
 * Da dove parte il composer quando lo apre il calendario: un giorno e un'ora
 * scelti («nuovo»), un post da modificare, o un post da copiare in uno nuovo.
 */
interface InizialeComposer {
  modo: "nuovo" | "modifica" | "duplica";
  data?: string;
  ora?: string;
  post?: ScheduledPost;
  /** Per un post nuovo: dove (es. la griglia Instagram di un account). */
  piattaforme?: string[];
  destinazioni?: Record<string, string>;
}

/**
 * I valori con cui nasce il composer. Il composer si rimonta a ogni apertura
 * dal calendario (key), così parte già pieno, senza effetti che lo riempiono.
 */
function valoriIniziali(iniziale: InizialeComposer | null | undefined) {
  const post = iniziale?.post;
  const modifica = iniziale?.modo === "modifica" && post ? post : null;
  const conData = modifica && haData(modifica) ? new Date(modifica.scheduled_at) : null;
  const tipo = post?.contentType && CONTENT_TYPE_CONFIG.some((c) => c.id === post.contentType) ? post.contentType : "post";
  const media: SocialPostMedia[] = post
    ? (post.media && post.media.length > 0 ? post.media : post.image_url ? [{ url: post.image_url, type: "image" }] : [])
    : [];
  // Una foto sola, pubblica, in un post normale: torna foto principale. Il resto
  // (carosello, video, file del bucket privato) resta tra i file del post.
  const fotoPrincipale = media.length > 0 && tipo !== "carosello" && tipo !== "reel" && tipo !== "video" && !media[0].path;
  const perPiattaforma = post?.platformTexts && Object.keys(post.platformTexts).length > 0 ? post.platformTexts : null;
  return {
    inModifica: modifica,
    contentTypeId: tipo,
    piattaforme: post ? post.platforms : iniziale?.piattaforme ?? null,
    argomento: post?.argomento ?? null,
    testo: post ? post.text : null,
    perPiattaforma,
    hashtags: post?.hashtags ?? [],
    primoCommento: post?.firstComment ?? "",
    mediaUrl: fotoPrincipale ? media[0].url ?? null : null,
    extraMedia: fotoPrincipale ? [] : media,
    targetPageIds: post?.targetPageIds ?? iniziale?.destinazioni ?? {},
    publishNow: !(iniziale?.data || conData),
    data: iniziale?.data ?? (conData ? chiaveGiorno(conData) : ""),
    ora: iniziale?.ora ?? (conData ? oraBreve(conData) : "09:00"),
    opzioniAperte: Boolean(post && (tipo !== "post" || perPiattaforma || post.firstComment || post.argomento)),
  };
}

function ContentStudioTab({
  companyId,
  nomeAzienda,
  settoreAzienda,
  stato,
  verificaNonRiuscita = false,
  puoApprovare = false,
  iniziale,
  selectedMedia,
  onSelectedMediaConsumed,
  onPostScheduled,
  onFineModifica,
  onMediaStored,
  onGoToSettings,
}: {
  companyId?: string;
  nomeAzienda?: string;
  settoreAzienda?: string;
  stato: StatoPubblicazioneSocial | null;
  verificaNonRiuscita?: boolean;
  puoApprovare?: boolean;
  iniziale?: InizialeComposer | null;
  selectedMedia?: MediaItem | null;
  onSelectedMediaConsumed?: () => void;
  /** true se il post è stato salvato: solo allora il composer si svuota. Con modificaId aggiorna quel post. */
  onPostScheduled: (post: ScheduledPost, modificaId?: string) => Promise<boolean>;
  /** Fine del lavoro partito dal calendario: salvato, o annullato. */
  onFineModifica?: (salvato: boolean) => void;
  onMediaStored?: (media: MediaItem) => MediaItem | void | Promise<MediaItem | void | unknown>;
  onGoToSettings: () => void;
}) {
  const [avvio] = useState(() => valoriIniziali(iniziale));
  const [inModifica, setInModifica] = useState<ScheduledPost | null>(avvio.inModifica);

  // ── Opzioni avanzate: formato e argomento ──────────────────────────────────
  const [opzioniAperte, setOpzioniAperte] = useState(avvio.opzioniAperte);
  const [activePillarId, setActivePillarId] = useState<string | null>(avvio.argomento);
  const [contentTypeId, setContentTypeId] = useState(avvio.contentTypeId);
  const contentType = CONTENT_TYPE_CONFIG.find((c) => c.id === contentTypeId) ?? CONTENT_TYPE_CONFIG[0];
  const availablePlatforms = PLATFORMS.filter((p) => contentType.supportedBy.includes(p.id));

  // ── 1 · Dove: si parte dalle piattaforme che possono pubblicare davvero ────
  const pronte = useMemo(() => paginePronte(stato), [stato]);
  const piattaformeOk = useMemo(() => piattaformePronte(stato), [stato]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(avvio.piattaforme ?? []);
  const selezioneToccata = useRef(avvio.piattaforme !== null);

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
    if (avvio.testo !== null) return avvio.testo;
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
  const [hashtags, setHashtags] = useState<string[]>(avvio.hashtags);
  const [hashtagInput, setHashtagInput] = useState("");
  const [firstComment, setFirstComment] = useState(avvio.primoCommento);

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
  const [crossPlatformMode, setCrossPlatformMode] = useState(avvio.perPiattaforma !== null);
  const [platformTexts, setPlatformTexts] = useState<Record<string, string>>(avvio.perPiattaforma ?? {});

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
  const [mediaUrl, setMediaUrl] = useState<string | null>(avvio.mediaUrl);
  const [selectedLibraryMedia, setSelectedLibraryMedia] = useState<MediaItem | null>(null);
  // File caricati nel bucket social-media: il video del Reel, le slide del carosello.
  const [extraMedia, setExtraMedia] = useState<SocialPostMedia[]>(avvio.extraMedia);
  // Pagina/account di destinazione per piattaforma, quando ce n'è più d'uno.
  const [targetPageIds, setTargetPageIds] = useState<Record<string, string>>(avvio.targetPageIds);

  // ── AI: un solo ingresso, testo e foto ───────────────────────────────────
  const [aiAperta, setAiAperta] = useState(false);
  const [brief, setBrief] = useState("");
  const [segment, setSegment] = useState(() => settoreSocial(settoreAzienda));

  // ── 3 · Quando ───────────────────────────────────────────────────────────
  const [scheduledDate, setScheduledDate] = useState(avvio.data);
  const [scheduledTime, setScheduledTime] = useState(avvio.ora);
  const [publishNow, setPublishNow] = useState(avvio.publishNow);
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
    setInModifica(null);
    clearAutosave(); // evita che la bozza autosalvata risorga al mount successivo
  };

  // Aperto dal calendario (giorno, modifica, copia): finito il lavoro si torna lì.
  const chiudiLavoro = (salvato: boolean) => {
    resetComposer();
    onFineModifica?.(salvato);
  };

  const salvaBozza = async (status: "draft" | "review") => {
    if (isSubmitting) return; // anti doppio-submit
    if (!draftValidation.canSaveDraft) {
      toast.error(selectedPlatforms.length === 0 ? "Scegli almeno una piattaforma." : "Scrivi il testo del post.");
      return;
    }
    // Chi approva deve sapere quando uscirebbe: in approvazione si manda con giorno e ora.
    if (status === "review" && !scheduledDate) {
      toast.error("Scegli giorno e ora: servono a chi deve approvare");
      return;
    }
    setIsSubmitting(true);

    // Una bozza senza data resta senza data: prima finiva su «domani».
    const scheduledAt = scheduledDate ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : "";
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
      argomento: activePillarId ?? undefined,
    };

    try {
      if (!(await onPostScheduled(bozza, inModifica?.id))) return;
      toast.success(status === "review" ? (inModifica ? "Modifiche salvate" : "Post mandato in approvazione") : "Bozza salvata", {
        description: status === "review"
          ? "Aspetta l'approvazione del titolare o di un amministratore, che ricevono un avviso."
          : "La trovi tra le bozze del calendario. Non viene pubblicata.",
      });
      chiudiLavoro(true);
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
      argomento: activePillarId ?? undefined,
    };

    try {
      // «Pubblica ora»: l'esito vero (uscito, in elaborazione, errore) lo dice chi pubblica.
      if (!(await onPostScheduled(newPost, inModifica?.id))) return;
      if (!publishNow) {
        const dove = elencoNomi(newPost.platforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id));
        toast.success(inModifica ? "Post aggiornato" : "Post programmato", {
          description: `Esce ${new Date(scheduledAt).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} su ${dove}.`,
        });
      }
      chiudiLavoro(true);
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
  // Chi non approva, modificando un post da approvare, lo lascia da approvare:
  // cambiarne lo stato lo bloccherebbe il database.
  const soloRevisione = inModifica?.status === "review" && !puoApprovare;
  // Sul pulsante, dove uscirà davvero il post.
  const doveEsce = elencoNomi(
    draftValidation.connectedSelectedPlatforms.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">

        {inModifica && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
            <span>
              <strong className="font-semibold">Stai modificando un post</strong>
              {haData(inModifica)
                ? ` del ${new Date(inModifica.scheduled_at).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
                : ""}
              : salvando si aggiorna quello, non se ne crea uno nuovo.
            </span>
            <Button size="sm" variant="outline" className="h-7 border-blue-200 bg-white text-xs text-blue-800 hover:bg-blue-100"
              onClick={() => chiudiLavoro(false)}>
              Annulla modifica
            </Button>
          </div>
        )}

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

          {soloRevisione ? (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-800">
                Il post è da approvare: salvando le modifiche resta in attesa del titolare o di un amministratore.
              </p>
              <Button onClick={() => void salvaBozza("review")} disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                Salva le modifiche
              </Button>
            </div>
          ) : (<>
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
          </>)}
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
// GRIGLIA INSTAGRAM — il profilo vero, nell'ordine del cliente (25/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Prima: profilo finto uguale per tutti (nome e follower inventati), i
// programmati SOTTO i pubblicati, i pubblicati come quadrati grigi, le storie
// nella griglia, gli account mischiati, l'argomento indovinato dal testo,
// riquadri quadrati (Instagram dal 2025 li mostra verticali), 18 caselle finte.
// La logica è in src/lib/social/griglia.ts.

type AccountSocial = { platform_id: string; page_id: string; page_name: string; followers?: number };

/** La voce del calendario per una cella: la finestra del post è la stessa. */
function voceDaCella(cella: CellaGriglia, pagina = ""): VoceCalendario {
  if (cella.tipo === "app") {
    return {
      tipo: "post",
      id: cella.post.id,
      quando: cella.quando ?? new Date(cella.post.created_at),
      post: cella.post,
      info: cella.info,
    };
  }
  const r = cella.reale;
  return {
    tipo: "esterno",
    id: cella.id,
    quando: cella.quando,
    esterno: {
      id: r.postId,
      pageId: r.pageId,
      pagina,
      testo: r.testo,
      quando: r.quando,
      link: r.link,
      immagine: r.immagine,
      piattaforma: "instagram",
      numeri: r.numeri,
    },
  };
}

const dataBreve = (d: Date) => `${d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })} · ${oraBreve(d)}`;

function CellaInstagram({
  cella,
  attenuata,
  scelta,
  bersaglio,
  trascinabile,
  onApri,
  onTrascinaInizio,
  onTrascinaSopra,
  onTrascinaVia,
  onRilascia,
  onTrascinaFine,
}: {
  cella: CellaGriglia;
  attenuata: boolean;
  scelta: boolean;
  bersaglio: boolean;
  trascinabile: boolean;
  onApri: () => void;
  onTrascinaInizio: () => void;
  onTrascinaSopra: () => boolean;
  onTrascinaVia: () => void;
  onRilascia: () => void;
  onTrascinaFine: () => void;
}) {
  // Le foto di Instagram scadono dopo qualche giorno: se non si caricano, al loro posto un riquadro pulito.
  const [rotta, setRotta] = useState(false);
  const app = cella.tipo === "app" ? cella : null;
  const argomento = app?.post.argomento ? CONTENT_PILLARS.find((p) => p.id === app.post.argomento) : null;
  const gradiente = cella.tipo === "instagram" ? cella.reale.gradiente : undefined;
  const testo = app ? app.post.text : cella.tipo === "instagram" ? cella.reale.testo : "";
  const etichetta = app
    ? `${app.info.etichetta}${app.quando ? ` · ${dataBreve(app.quando)}` : ""} · ${testo || "Post senza testo"}`
    : `Pubblicato il ${cella.quando?.toLocaleDateString("it-IT")} · ${testo || "Post senza testo"}`;

  return (
    <div
      role="button"
      tabIndex={0}
      title={etichetta}
      aria-label={etichetta}
      draggable={trascinabile}
      onClick={onApri}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onApri(); } }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", cella.id);
        onTrascinaInizio();
      }}
      onDragOver={(e) => { if (onTrascinaSopra()) e.preventDefault(); }}
      onDragLeave={onTrascinaVia}
      onDrop={(e) => { e.preventDefault(); onRilascia(); }}
      onDragEnd={onTrascinaFine}
      className={cn(
        "group relative aspect-[3/4] cursor-pointer overflow-hidden bg-slate-200 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400",
        attenuata && "opacity-30",
        scelta && "ring-4 ring-inset ring-orange-500",
        bersaglio && "ring-4 ring-inset ring-orange-300",
        trascinabile && "cursor-grab active:cursor-grabbing",
      )}
    >
      {gradiente ? (
        <div className={cn("absolute inset-0 bg-gradient-to-br", gradiente)} />
      ) : cella.immagine && !rotta ? (
        <img loading="lazy" src={cella.immagine} alt="" draggable={false} onError={() => setRotta(true)}
          className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-slate-400">
          {cella.formato === "reel" || cella.formato === "video" ? <Play className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
        </div>
      )}

      {/* Come su Instagram: l'icona del carosello e del Reel in alto a destra */}
      {cella.formato !== "foto" && (
        <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {cella.formato === "carosello" ? <Layers className="h-4 w-4" /> : <Film className="h-4 w-4" />}
        </span>
      )}

      {/* Non ancora su Instagram: cornice tratteggiata, giorno e ora, lo stato se non è «Programmato» */}
      {app?.futura && (
        <>
          <div className="pointer-events-none absolute inset-1 rounded border-2 border-dashed border-white/90" />
          <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-2.5rem)] truncate rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold text-slate-800 shadow-sm">
            {app.quando ? dataBreve(app.quando) : "Senza data"}
          </span>
          {app.info.stato !== "programmato" && (
            <span className={cn("absolute bottom-1.5 left-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold shadow-sm", STILE_STATO[app.info.stato].badge)}>
              {app.info.etichetta}
            </span>
          )}
        </>
      )}

      {argomento && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white/95 px-1 text-xs shadow-sm" title={argomento.label}>
          {argomento.emoji}
        </span>
      )}

      {/* Già su Instagram: i numeri al passaggio del mouse, come sul profilo */}
      {cella.tipo === "instagram" && !gradiente && (
        <div className="absolute inset-0 hidden items-center justify-center gap-3 bg-black/45 text-xs font-bold text-white group-hover:flex">
          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 fill-white" />{numeroIntero(cella.reale.numeri.reazioni)}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5 fill-white" />{numeroIntero(cella.reale.numeri.commenti)}</span>
        </div>
      )}
    </div>
  );
}

function GridPlannerTab({
  companyId,
  posts,
  stato,
  accountSocial,
  logoAzienda,
  demoMode = false,
  onApriVoce,
  onNuovoPost,
  onScambia,
  onGoToSettings,
}: {
  companyId: string;
  posts: ScheduledPost[];
  stato: StatoPubblicazioneSocial | null;
  accountSocial: AccountSocial[];
  logoAzienda?: string | null;
  demoMode?: boolean;
  onApriVoce: (voce: VoceCalendario) => void;
  onNuovoPost: (iniziale: InizialeComposer) => void;
  onScambia: (primo: ScheduledPost, secondo: ScheduledPost) => Promise<boolean>;
  onGoToSettings: () => void;
}) {
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAdesso(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const realiQuery = usePostInstagramReali(companyId);

  // Gli account Instagram collegati, con i follower veri (social_accounts).
  const accountVeri = Array.from(
    new Map(
      accountSocial
        .filter((a) => a.platform_id === "instagram" && a.page_id)
        .map((a) => [a.page_id, { pageId: a.page_id, nome: a.page_name, followers: a.followers ?? null }] as const),
    ).values(),
  );
  // La Demo Azienda, senza Instagram, vede un profilo di prova (e lo dice).
  const demo = demoMode && accountVeri.length === 0;
  const accounts = demo ? [{ pageId: "demo", nome: "demo.impresaedile", followers: null as number | null }] : accountVeri;

  const [pageScelta, setPageScelta] = useState<string | null>(null);
  const account = accounts.find((a) => a.pageId === pageScelta) ?? accounts[0] ?? null;
  const [mostraBozze, setMostraBozze] = useState(false);
  const [evidenzia, setEvidenzia] = useState<string | null>(null);
  const [modoScambio, setModoScambio] = useState(false);
  const [primoScambio, setPrimoScambio] = useState<string | null>(null);
  const [trascinato, setTrascinato] = useState<string | null>(null);
  const [bersaglio, setBersaglio] = useState<string | null>(null);

  const reali = useMemo<PostInstagramReale[]>(() => (demo
    ? DEMO_MEDIA_ITEMS.slice(0, 9).map((m, i): PostInstagramReale => ({
      postId: `demo-${m.id}`,
      pageId: "demo",
      quando: new Date(Date.UTC(2026, 8, 20 - i * 3, 9)).toISOString(),
      formato: m.type === "video" ? "reel" : "foto",
      testo: m.title,
      link: null,
      immagine: null,
      numeri: { reazioni: null, commenti: null, copertura: null, salvataggi: null, visualizzazioni: null },
      sincronizzatoIl: null,
      gradiente: m.gradient,
    }))
    : realiQuery.data ?? []), [demo, realiQuery.data]);

  const { celle, senzaAccount } = useMemo(() => (account
    ? costruisciGriglia({
      posts,
      reali,
      pageId: account.pageId,
      accountIds: demo ? ["demo"] : accountVeri.map((a) => a.pageId),
      mostraBozze,
      adesso,
    })
    : { celle: [] as CellaGriglia[], senzaAccount: 0 }),
  // accountVeri si ricava da accountSocial
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [account?.pageId, accountSocial, adesso, demo, mostraBozze, posts, reali]);

  const perId = new Map(celle.map((c) => [c.id, c] as const));
  const futuri = celle.filter((c) => c.tipo === "app" && c.futura);
  const giaSu = celle.filter((c) => !(c.tipo === "app" && c.futura));
  const ultimiReali = giaSu.filter((c) => c.tipo === "instagram").slice(0, 4);
  const argomentiPresenti = CONTENT_PILLARS.filter((p) => celle.some((c) => c.tipo === "app" && c.post.argomento === p.id));
  const qualcunoScambiabile = celle.filter((c) => scambiabile(c, adesso)).length >= 2;
  // Se questo account non può pubblicare da qui, lo si dice (i post già usciti restano visibili).
  const statoAccount = stato?.pagine.find((p) => p.piattaforma === "instagram" && p.pageId === account?.pageId);
  const motivo = !demo && statoAccount && !statoAccount.puoPubblicare ? statoAccount.motivo : null;
  const ultimaLettura = reali.map((r) => r.sincronizzatoIl).filter(Boolean).sort().pop() ?? null;

  const scambia = async (primoId: string, secondoId: string) => {
    const primo = perId.get(primoId);
    const secondo = perId.get(secondoId);
    setPrimoScambio(null);
    setTrascinato(null);
    setBersaglio(null);
    if (!primo || !secondo || primo.tipo !== "app" || secondo.tipo !== "app" || primoId === secondoId) return;
    // Il database ricontrolla con l'ora vera: qui basta quella del minuto.
    if (!scambiabile(primo, adesso) || !scambiabile(secondo, adesso)) {
      toast.info("Si scambiano solo post non ancora usciti, con giorno e ora nel futuro.");
      return;
    }
    if (await onScambia(primo.post, secondo.post)) setModoScambio(false);
  };

  const clicCella = (cella: CellaGriglia) => {
    if (!modoScambio) {
      onApriVoce(voceDaCella(cella, account?.nome ? `@${account.nome}` : ""));
      return;
    }
    if (!scambiabile(cella, adesso)) {
      toast.info("Si scambiano solo post non ancora usciti, con giorno e ora nel futuro.");
      return;
    }
    if (!primoScambio) setPrimoScambio(cella.id);
    else if (primoScambio === cella.id) setPrimoScambio(null);
    else void scambia(primoScambio, cella.id);
  };

  if (!account) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-slate-800">Instagram non è collegato</p>
        <p className="mt-1 text-xs text-slate-500">
          Per vedere e preparare qui il profilo Instagram, collega un account Instagram professionale alla pagina Facebook e ricollega Meta.
        </p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onGoToSettings}>
          <Settings className="h-3.5 w-3.5" /> Collega Instagram
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {demo && (
        <Alert className="border-amber-200 bg-amber-50 py-2">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800">
            Griglia dimostrativa: il profilo e i post pubblicati sono di esempio (Demo Azienda); quelli programmati sono i tuoi.
          </AlertDescription>
        </Alert>
      )}

      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Account:</span>
          {accounts.map((a) => (
            <button key={a.pageId} type="button" onClick={() => { setPageScelta(a.pageId); setPrimoScambio(null); }} aria-pressed={a.pageId === account.pageId}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                a.pageId === account.pageId ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              @{a.nome}
            </button>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ── Il profilo, largo come un telefono ── */}
        <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            {logoAzienda ? (
              <img src={logoAzienda} alt="" className="h-12 w-12 shrink-0 rounded-full border border-slate-100 bg-white object-contain p-1" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-lg font-bold uppercase text-white">
                {account.nome.charAt(0) || "?"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{account.nome}</p>
              <p className="text-[11px] text-slate-500">
                {account.followers != null ? `${numeroIntero(account.followers)} follower` : demo ? "Profilo di esempio" : "Follower non ancora letti"}
              </p>
            </div>
            {!demo && (
              <a href={`https://www.instagram.com/${encodeURIComponent(account.nome)}/`} target="_blank" rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                <ExternalLink className="h-3 w-3" /> Apri
              </a>
            )}
          </div>
          {motivo && (
            <p className="border-b border-slate-100 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
              {spiegaMotivo(motivo).lungo}
            </p>
          )}
          {celle.length > 0 ? (
            <div className="grid grid-cols-3 gap-0.5 bg-white">
              {celle.map((cella) => (
                <CellaInstagram
                  key={cella.id}
                  cella={cella}
                  attenuata={evidenzia !== null && !(cella.tipo === "app" && cella.post.argomento === evidenzia)}
                  scelta={primoScambio === cella.id}
                  bersaglio={bersaglio === cella.id}
                  trascinabile={scambiabile(cella, adesso)}
                  onApri={() => clicCella(cella)}
                  onTrascinaInizio={() => setTrascinato(cella.id)}
                  onTrascinaSopra={() => {
                    const ok = trascinato !== null && trascinato !== cella.id && scambiabile(cella, adesso);
                    if (ok && bersaglio !== cella.id) setBersaglio(cella.id);
                    return ok;
                  }}
                  onTrascinaVia={() => setBersaglio((b) => (b === cella.id ? null : b))}
                  onRilascia={() => { if (trascinato) void scambia(trascinato, cella.id); }}
                  onTrascinaFine={() => { setTrascinato(null); setBersaglio(null); }}
                />
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-slate-500">
              {realiQuery.isLoading ? "Carico i post di Instagram…" : "Ancora nessun post: né programmato qui, né letto da Instagram."}
            </p>
          )}
        </div>

        {/* ── Accanto: comandi, in programma, come sono andati ── */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
              onClick={() => onNuovoPost({ modo: "nuovo", piattaforme: ["instagram"], ...(demo ? {} : { destinazioni: { instagram: account.pageId } }) })}>
              <Plus className="h-3.5 w-3.5" /> Nuovo post Instagram
            </Button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
              <input type="checkbox" className="h-3.5 w-3.5 accent-orange-500" checked={mostraBozze} onChange={(e) => setMostraBozze(e.target.checked)} />
              Mostra le bozze
            </label>
            {qualcunoScambiabile && (
              <Button size="sm" variant="outline" aria-pressed={modoScambio}
                className={cn("gap-1.5", modoScambio && "border-orange-400 bg-orange-50 text-orange-700")}
                onClick={() => { setModoScambio((v) => !v); setPrimoScambio(null); }}>
                {modoScambio ? "Fine scambio" : "Scambia l'ordine"}
              </Button>
            )}
          </div>
          {modoScambio ? (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
              {primoScambio ? "Ora tocca il post con cui scambiarlo." : "Tocca un post non ancora uscito, poi quello con cui scambiare giorno e ora."}
            </p>
          ) : qualcunoScambiabile ? (
            <p className="text-[11px] text-slate-500">Per scambiare giorno e ora di due post non ancora usciti, trascinane uno sull'altro.</p>
          ) : null}
          {senzaAccount > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {senzaAccount === 1 ? "1 post Instagram non ha" : `${senzaAccount} post Instagram non hanno`} l'account scelto: aprili dal calendario con «Modifica» e scegli su quale account escono.
            </p>
          )}
          {argomentiPresenti.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Evidenzia argomento:</span>
              {argomentiPresenti.map((p) => (
                <button key={p.id} type="button" onClick={() => setEvidenzia(evidenzia === p.id ? null : p.id)} aria-pressed={evidenzia === p.id}
                  className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
                    evidenzia === p.id ? `${p.colorBg} ${p.colorBorder} ${p.colorText}` : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-800">In programma su Instagram</p>
            {futuri.length === 0
              ? <p className="text-xs text-slate-500">Niente in programma per @{account.nome}.</p>
              : futuri.map((cella) => (
                <VoceEstesa key={cella.id} voce={voceDaCella(cella, `@${account.nome}`)} onApri={() => clicCella(cella)} conData />
              ))}
          </div>

          {!demo && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-800">Gli ultimi pubblicati</p>
              {ultimiReali.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {realiQuery.isError ? "Non riesco a leggere i post di Instagram." : "Nessun post letto da Instagram per questo account."}
                </p>
              ) : ultimiReali.map((cella) => cella.tipo === "instagram" && (
                <button key={cella.id} type="button" onClick={() => onApriVoce(voceDaCella(cella, `@${account.nome}`))}
                  className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-white p-2 text-left shadow-sm transition hover:border-orange-200">
                  {cella.immagine
                    ? <img loading="lazy" src={cella.immagine} alt="" className="h-12 w-9 shrink-0 rounded object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    : <span className="h-12 w-9 shrink-0 rounded bg-slate-200" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-slate-500">
                      {cella.quando.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span className="block truncate text-xs text-slate-700">{cella.reale.testo || "Post senza testo"}</span>
                    <span className="block text-[11px] text-slate-500">
                      {numeroIntero(cella.reale.numeri.reazioni)} mi piace · {numeroIntero(cella.reale.numeri.commenti)} commenti · {numeroIntero(cella.reale.numeri.copertura)} persone raggiunte
                    </span>
                  </span>
                </button>
              ))}
              <p className="text-[11px] text-slate-400">
                I post pubblicati arrivano da Instagram ogni 4 ore
                {ultimaLettura ? `; ultima lettura ${new Date(ultimaLettura).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
              </p>
            </div>
          )}
        </div>
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
      logoAzienda={effectiveCompany?.logo_url}
    />
  );
}

function GestioneSocial({
  companyId,
  nomeAzienda,
  settoreAzienda,
  logoAzienda,
}: {
  companyId: string;
  nomeAzienda?: string;
  settoreAzienda?: string;
  logoAzienda?: string | null;
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
    deletePost,
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

  const puoApprovare = usePuoApprovareSocial(companyId).data === true;
  const { data: persone } = useCompanyStaffUsers(companyId);
  const nomeUtente = useCallback((id?: string): string | null => {
    if (!id) return null;
    const persona = persone?.find((p) => p.id === id);
    const nome = [persona?.first_name, persona?.last_name].filter(Boolean).join(" ").trim();
    return nome || null;
  }, [persone]);

  // Il composer si rimonta a ogni apertura dal calendario (giorno, modifica, copia).
  const [iniziale, setIniziale] = useState<InizialeComposer | null>(null);
  const [versioneComposer, setVersioneComposer] = useState(0);
  const apriComposer = useCallback((nuovoIniziale: InizialeComposer | null) => {
    setIniziale(nuovoIniziale);
    setVersioneComposer((v) => v + 1);
    setTab("crea-post");
  }, [setTab]);
  const fineLavoroComposer = useCallback((salvato: boolean) => {
    const dalCalendario = iniziale !== null;
    setIniziale(null);
    setVersioneComposer((v) => v + 1);
    if (dalCalendario && salvato) setTab("calendario");
  }, [iniziale, setTab]);

  const [voceAperta, setVoceAperta] = useState<VoceCalendario | null>(null);

  /** Pubblica adesso (social-publish) e dice com'è andata, piattaforma per piattaforma. */
  const pubblicaSubito = useCallback(async (id: string, riprova = false) => {
    const { data, error } = await supabase.functions.invoke("social-publish", {
      body: { post_id: id, company_id: companyId, ...(riprova ? { riprova: true } : {}) },
    });
    if (error) {
      toast.error("Pubblicazione non riuscita", { description: await readInvokeError(error) });
    } else {
      const payload = data as { pending?: boolean; result?: Record<string, SocialPublishResultEntry> } | null;
      const res = payload?.result ?? {};
      const okCh = Object.entries(res).filter(([k, v]) => k !== "_error" && v?.ok).map(([k]) => nomePiattaforma(k));
      const pendingCh = Object.entries(res).filter(([, v]) => v?.pending).map(([k]) => nomePiattaforma(k));
      const errCh = Object.entries(res).filter(([k, v]) => k !== "_error" && v && v.ok === false && !v.pending);
      const warnings = Object.values(res).flatMap((v) => v?.warnings ?? []);
      if (okCh.length) toast.success(`Pubblicato su ${elencoNomi(okCh)}`);
      if (pendingCh.length) {
        toast.info(`${elencoNomi(pendingCh)}: Meta sta ancora elaborando il file`, {
          description: "Il post esce da solo appena è pronto: l'esito compare nel calendario.",
        });
      } else if (payload?.pending && !okCh.length && !errCh.length) {
        toast.info("Pubblicazione già in corso", { description: "L'esito compare nel calendario tra poco." });
      }
      if (errCh.length) toast.error(`Non pubblicato su ${elencoNomi(errCh.map(([k]) => nomePiattaforma(k)))}`, { description: errCh[0]?.[1]?.error });
      if (warnings.length) toast.warning("Pubblicato con un avviso", { description: warnings[0] });
    }
    queryClient.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
  }, [companyId, queryClient]);

  /** true se il post è salvato: il composer si svuota solo allora. Con modificaId aggiorna quel post. */
  const handlePostScheduled = useCallback(async (post: ScheduledPost, modificaId?: string): Promise<boolean> => {
    let saved: ScheduledPost | null | undefined;
    try {
      if (modificaId) {
        saved = await updatePost(modificaId, {
          platforms: post.platforms,
          contentType: post.contentType,
          text: post.text,
          platformTexts: post.platformTexts,
          image_url: post.image_url,
          media: post.media ?? [],
          targetPageIds: post.targetPageIds ?? {},
          hashtags: post.hashtags,
          firstComment: post.firstComment,
          scheduled_at: post.scheduled_at,
          status: post.status,
          // Una bozza rimandata e poi sistemata perde la nota del rimando.
          reviewNote: post.reviewNote,
          mediaItemId: post.mediaItemId,
          argomento: post.argomento,
        });
        saved = saved ?? { ...post, id: modificaId };
      } else {
        saved = await addPost(post);
      }
    } catch {
      // errore di salvataggio già notificato dall'onError della mutation
      return false;
    }
    // Pubblicazione reale "adesso": i post con scheduled_at <= ora vengono
    // inviati subito via edge `social-publish` (FB/IG). I post programmati nel
    // futuro restano 'scheduled' e li pubblica il cron `social-publish-scheduler`.
    const id = saved?.id;
    const dueNow = saved?.scheduled_at ? new Date(saved.scheduled_at).getTime() <= Date.now() + 60_000 : false;
    if (SOCIAL_LIVE_PUBLISHING_ENABLED && dueNow && isUuidPost(id) && saved?.status === "scheduled") {
      await pubblicaSubito(id);
    }
    return true;
  }, [addPost, pubblicaSubito, updatePost]);

  /** Due post non ancora usciti si scambiano giorno e ora (griglia Instagram), con «Annulla». */
  const scambiaOrari = useCallback(async (primo: ScheduledPost, secondo: ScheduledPost): Promise<boolean> => {
    const esegui = () => supabase.rpc(
      "scambia_orari_post_social" as never,
      { p_primo: primo.id, p_secondo: secondo.id } as never,
    );
    const { error } = await esegui();
    if (error) {
      toast.error("Scambio non riuscito", { description: error.message });
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
    const breve = (p: ScheduledPost) => `«${(p.text || "Post senza testo").slice(0, 28)}${p.text.length > 28 ? "…" : ""}»`;
    const quando = (iso: string) => new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    toast.success("Scambiati", {
      description: `${breve(primo)} esce ${quando(secondo.scheduled_at)}, ${breve(secondo)} ${quando(primo.scheduled_at)}.`,
      action: {
        label: "Annulla",
        onClick: () => {
          void esegui().then(({ error: erroreAnnulla }) => {
            if (erroreAnnulla) toast.error("Non riesco ad annullare lo scambio", { description: erroreAnnulla.message });
            queryClient.invalidateQueries({ queryKey: ["social-manager", "posts", companyId] });
          });
        },
      },
    });
    return true;
  }, [companyId, queryClient]);

  /** Le azioni sul post dal calendario, con i controlli che il post esca davvero. */
  const eseguiAzione = useCallback(async (post: ScheduledPost, azione: AzionePost, dati?: DatiAzione): Promise<boolean> => {
    const stato = statoPubblicazione.stato;
    const quandoDi = (iso: string) => new Date(iso).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const soloPronte = (soloPiattaforme?: string[]) => {
      const dest = destinazioniPronte(post, stato, soloPiattaforme);
      if ("errore" in dest) toast.error("Non può uscire adesso", { description: dest.errore });
      return "errore" in dest ? null : dest;
    };
    const tolteDette = (tolte: string[]) =>
      tolte.length > 0 ? ` ${elencoNomi(tolte.map(nomePiattaforma))}: tolto, non può pubblicare adesso.` : "";
    try {
      switch (azione) {
        case "approva": {
          const dest = soloPronte();
          if (!dest) return false;
          const passato = !haData(post) || Date.parse(post.scheduled_at) < Date.now() + 60_000;
          await updatePost(post.id, {
            status: "scheduled",
            platforms: dest.platforms,
            targetPageIds: dest.targetPageIds,
            reviewNote: undefined,
            ...(passato ? { scheduled_at: new Date().toISOString() } : {}),
          });
          if (passato) {
            await pubblicaSubito(post.id);
          } else {
            toast.success("Approvato", {
              description: `Esce ${quandoDi(post.scheduled_at)} su ${elencoNomi(dest.platforms.map(nomePiattaforma))}.${tolteDette(dest.tolte)}`,
            });
          }
          return true;
        }
        case "rimanda": {
          await updatePost(post.id, { status: "draft", reviewNote: dati?.nota?.trim() || "Rimandato in bozza." });
          const autore = nomeUtente(post.createdBy);
          toast.info("Rimandato in bozza", { description: autore ? `${autore} riceve la nota.` : undefined });
          return true;
        }
        case "pubblica_ora": {
          const dest = soloPronte();
          if (!dest) return false;
          await updatePost(post.id, {
            platforms: dest.platforms,
            targetPageIds: dest.targetPageIds,
            scheduled_at: new Date().toISOString(),
            // Da approvare: chi lo pubblica adesso lo approva (il database controlla chi è).
            ...(post.status === "review" ? { status: "scheduled" as const } : {}),
          });
          await pubblicaSubito(post.id);
          return true;
        }
        case "riprova": {
          if (post.status === "published") {
            const fallite = piattaformeFallite(post);
            if (!soloPronte(fallite)) return false;
            await pubblicaSubito(post.id, true);
            return true;
          }
          const dest = soloPronte();
          if (!dest) return false;
          await updatePost(post.id, { platforms: dest.platforms, targetPageIds: dest.targetPageIds });
          await pubblicaSubito(post.id);
          return true;
        }
        case "programma": {
          if (!dati?.quando) return false;
          const dest = soloPronte();
          if (!dest) return false;
          await updatePost(post.id, { status: "scheduled", scheduled_at: dati.quando, platforms: dest.platforms, targetPageIds: dest.targetPageIds });
          toast.success("Programmato", { description: `Esce ${quandoDi(dati.quando)} su ${elencoNomi(dest.platforms.map(nomePiattaforma))}.${tolteDette(dest.tolte)}` });
          return true;
        }
        case "sposta": {
          if (!dati?.quando) return false;
          const daRiprogrammare = post.status === "failed" || statoCalendario(post).stato === "in_ritardo";
          await updatePost(post.id, { scheduled_at: dati.quando, ...(daRiprogrammare ? { status: "scheduled" as const } : {}) });
          toast.success("Spostato", { description: `Ora esce ${quandoDi(dati.quando)}.` });
          return true;
        }
        case "annulla_programmazione": {
          await updatePost(post.id, { status: "draft" });
          toast.success("Tolto dalla programmazione", { description: "Lo trovi tra le bozze: non esce finché non lo riprogrammi." });
          return true;
        }
        case "modifica":
          apriComposer({ modo: "modifica", post });
          return true;
        case "duplica":
          apriComposer({ modo: "duplica", post });
          toast.info("Copia pronta", { description: "Cambia quello che serve e scegli quando pubblicarla." });
          return true;
        case "elimina":
          await deletePost(post.id);
          toast.success("Post eliminato", {
            description: post.status === "published" ? "Resta su Facebook e Instagram: da qui si toglie solo dal calendario." : undefined,
          });
          return true;
        default:
          return false;
      }
    } catch {
      // L'errore l'ha già detto la mutation (per esempio «Solo il titolare o un amministratore…»).
      return false;
    }
  }, [apriComposer, deletePost, nomeUtente, pubblicaSubito, statoPubblicazione.stato, updatePost]);

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

        {/* ─── IL POST APERTO DAL CALENDARIO ─────────────────────────── */}
        <PostSocialDialog
          key={voceAperta?.id ?? "nessuno"}
          voce={voceAperta && voceAperta.tipo === "post"
            ? { ...voceAperta, post: posts.find((p) => p.id === voceAperta.id) ?? voceAperta.post }
            : voceAperta}
          onClose={() => setVoceAperta(null)}
          puoApprovare={puoApprovare}
          nomeUtente={nomeUtente}
          onAzione={eseguiAzione}
        />

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
                key={versioneComposer}
                companyId={companyId}
                nomeAzienda={nomeAzienda}
                settoreAzienda={settoreAzienda}
                stato={statoPubblicazione.stato}
                verificaNonRiuscita={statoPubblicazione.verificaNonRiuscita}
                puoApprovare={puoApprovare}
                iniziale={iniziale}
                selectedMedia={selectedMediaForComposer}
                onSelectedMediaConsumed={() => setSelectedMediaForComposer(null)}
                onPostScheduled={handlePostScheduled}
                onFineModifica={fineLavoroComposer}
                onMediaStored={addMedia}
                onGoToSettings={goToIntegrations}
              />
            )}
            {activeTab === "calendario" && (
              <CalendarioTab
                companyId={companyId}
                posts={posts}
                stato={statoPubblicazione.stato}
                puoApprovare={puoApprovare}
                nomeUtente={nomeUtente}
                onApriVoce={setVoceAperta}
                onNuovoPost={(quando) => apriComposer(quando ? { modo: "nuovo", data: quando.data, ora: quando.ora } : null)}
                onAzione={eseguiAzione}
              />
            )}
            {activeTab === "grid" && (
              <GridPlannerTab
                companyId={companyId}
                posts={posts}
                stato={statoPubblicazione.stato}
                accountSocial={connectedAccounts}
                logoAzienda={logoAzienda}
                demoMode={isDemoCompany}
                onApriVoce={setVoceAperta}
                onNuovoPost={apriComposer}
                onScambia={scambiaOrari}
                onGoToSettings={goToIntegrations}
              />
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
