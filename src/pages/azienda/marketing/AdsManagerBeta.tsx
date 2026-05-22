import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  Check,
  ChevronRight,
  Copy,
  Euro,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { cn } from "@/lib/utils";
import { useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import { useAdsAi } from "@/hooks/useAdsAi";
import { useAdSpendGuard, type AdSpendGuardConfig } from "@/hooks/useAdSpendGuard";
import { useMetaPixelConfig } from "@/hooks/useMetaPixelConfig";
import { AdsBotChatPanel } from "@/components/ads/AdsBotChatPanel";
import { PerformanceCharts } from "@/components/ads/PerformanceCharts";
import { useMetaInsights } from "@/hooks/useMetaInsights";
import { PendingApprovalsBanner } from "@/components/ads/PendingApprovalsBanner";
import { useCampaignLeads } from "@/hooks/useCampaignLeads";
import { ABTestDialog } from "@/components/ads/ABTestDialog";
import { AutomationRulesEditor } from "@/components/ads/AutomationRulesEditor";
import { useAdsNotifications } from "@/hooks/useAdsNotifications";
import { AdsOnboardingTour } from "@/components/ads/AdsOnboardingTour";
import type { Integration, MetaAsset } from "@/types/integrations";
import type { MetaCampaignRow } from "@/types/metaAds";

type AdsTab = "campagne" | "creativita" | "pubblici" | "impostazioni";
type CampaignStatus = "active" | "paused" | "draft" | "review" | "error";
type ViewMode = "list" | "wizard" | "detail";
type CreativeFormat = "image" | "video" | "carousel" | "story";
type AudienceStrategy = "advantage_plus" | "manual" | "retargeting" | "lookalike";
type GenderTarget = "all" | "men" | "women";

interface CampaignAdSet {
  id: string;
  name: string;
  angle: string;
  audienceStrategy: AudienceStrategy;
  zone: string;
  radiusKm: number;
  dailyBudget: number;
  minDailyBudget: number;
  maxDailyBudget: number;
  audience: string;
  excludedAudiences: string;
  ageRange: string;
  gender: GenderTarget;
  languages: string;
  optimizationEvent: "lead" | "qualified_lead" | "message" | "landing_page_view";
  placementStrategy: string;
}

interface CampaignCreative {
  id: string;
  format: CreativeFormat;
  title: string;
  hook: string;
  goal: string;
  prompt: string;
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  budgetCents: number;
  spentCents: number;
  leads: number;
  opportunities: number;
  jobs: number;
  adSets?: number;
  ads?: number;
  targetCplCents?: number;
  source: "meta" | "local";
  /** True per campagne demo seed (non vanno nei KPI reali). */
  isDemo?: boolean;
  /** Riferimento al draft locale completo (se source==='local'). */
  draftRef?: LocalCampaignDraft;
}

interface LocalCampaignDraft {
  id: string;
  name: string;
  objective: string;
  budgetCents: number;
  zone: string;
  adSets: number;
  ads: number;
  targetCplCents: number;
  createdAt: string;
  updatedAt?: string;
  copyVariants: string[];
  imagePrompt: string;
  /** Stato completo del builder per riapertura/edit (v2). */
  builderState?: BuilderState;
}

interface BuilderState {
  /** Piattaforma pubblicitaria: 'meta' (Facebook/Instagram) o 'google' (Search/Display/PMax). */
  platform: "meta" | "google";
  /** Solo per Google: canale (SEARCH/DISPLAY/VIDEO/PERFORMANCE_MAX) */
  googleChannel?: "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX";
  templateId: string;
  name: string;
  objective: string;
  conversionPlace: "instant_form" | "landing_page" | "dual";
  offer: string;
  budgetMode: "campaign" | "adset";
  dailyBudget: number;
  zone: string;
  radiusKm: number;
  ageMin: number;
  ageMax: number;
  gender: GenderTarget;
  languages: string;
  excludedLocations: string;
  interests: string;
  advantageAudience: boolean;
  customAudienceSource: string;
  lookalikeSource: string;
  lookalikePercent: number;
  formIntent: "volume" | "higher_intent";
  requiredFields: string;
  qualityQuestion: string;
  privacyUrl: string;
  followUp: string;
  landingUrl: string;
  cta: string;
  imagePrompt: string;
  copyBrief: string;
  copyVariants: string[];
  adSets: CampaignAdSet[];
  creatives: CampaignCreative[];
  targetCpl: number;
  targetOpportunityRate: number;
  testDurationDays: number;
  pauseRule: string;
  scaleRule: string;
}

interface CampaignTemplate {
  id: string;
  title: string;
  segment: string;
  bestFor: string;
  budgetHint: string;
  patch: Partial<BuilderState>;
}

const TABS: Array<{ value: AdsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "campagne", label: "Campagne", icon: Megaphone },
  { value: "creativita", label: "Creatività", icon: Wand2 },
  { value: "pubblici", label: "Pubblici", icon: Target },
  { value: "impostazioni", label: "Impostazioni", icon: Settings },
];

/**
 * Sample campagne — marcate come `isDemo: true` per:
 *  • non inquinare i KPI reali (spese/lead/commesse)
 *  • mostrare esempio visivo nella lista finché non esistono campagne reali
 * Vengono mostrate solo se l'utente attiva il toggle "Mostra esempi".
 */
const SAMPLE_CAMPAIGNS: CampaignRow[] = [
  {
    id: "demo-1",
    name: "[ESEMPIO] Serramenti - Lead Monza Brianza",
    objective: "OUTCOME_LEADS",
    status: "active",
    budgetCents: 3000,
    spentCents: 184000,
    leads: 23,
    opportunities: 9,
    jobs: 5,
    adSets: 3,
    ads: 9,
    targetCplCents: 2200,
    source: "meta",
    isDemo: true,
  },
  {
    id: "demo-2",
    name: "[ESEMPIO] Bagni chiavi in mano",
    objective: "OUTCOME_LEADS",
    status: "paused",
    budgetCents: 2500,
    spentCents: 210000,
    leads: 14,
    opportunities: 5,
    jobs: 2,
    adSets: 2,
    ads: 6,
    targetCplCents: 2800,
    source: "meta",
    isDemo: true,
  },
  {
    id: "demo-3",
    name: "[ESEMPIO] Brand awareness - provincia",
    objective: "OUTCOME_AWARENESS",
    status: "review",
    budgetCents: 1500,
    spentCents: 34000,
    leads: 4,
    opportunities: 1,
    jobs: 0,
    adSets: 1,
    ads: 3,
    targetCplCents: 1800,
    source: "meta",
    isDemo: true,
  },
];

const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "serramenti",
    title: "Serramenti",
    segment: "Infissi, posa, detrazioni",
    bestFor: "Richieste preventivo con sopralluogo e misure.",
    budgetHint: "20-35 euro/giorno su provincia o raggio 25 km.",
    patch: {
      name: "Serramenti - Preventivi qualificati",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Sopralluogo gratuito e preventivo chiaro per sostituire gli infissi senza sorprese.",
      dailyBudget: 25,
      targetCpl: 25,
      targetOpportunityRate: 35,
      interests: "ristrutturazione casa, infissi, risparmio energetico, detrazioni fiscali, arredamento",
      requiredFields: "Nome, telefono, comune, tipo infisso, urgenza",
      qualityQuestion: "Quando vorresti sostituire gli infissi?",
      copyBrief: "Serramenti su misura con sopralluogo, consulenza tecnica e preventivo trasparente per famiglie nella zona.",
      imagePrompt: "Prima/dopo realistico di infissi moderni in una casa italiana luminosa, posa pulita, atmosfera affidabile, formato Meta Ads 4:5.",
    },
  },
  {
    id: "bagni",
    title: "Bagni",
    segment: "Ristrutturazione bagno",
    bestFor: "Lead che vogliono capire tempi, costo e soluzione.",
    budgetHint: "25-45 euro/giorno, meglio con foto prima/dopo.",
    patch: {
      name: "Bagni - Ristrutturazione chiavi in mano",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Consulenza gratuita per trasformare il bagno con tempi chiari, materiali adatti e preventivo senza sorprese.",
      dailyBudget: 30,
      targetCpl: 30,
      targetOpportunityRate: 32,
      interests: "ristrutturazione bagno, arredo bagno, casa, interior design, piastrelle",
      requiredFields: "Nome, telefono, comune, stato del bagno, budget indicativo",
      qualityQuestion: "Hai già una data o un periodo in cui vuoi iniziare i lavori?",
      copyBrief: "Ristrutturazione bagno chiavi in mano con consulenza, materiali e preventivo trasparente.",
      imagePrompt: "Bagno moderno italiano prima/dopo, doccia walk-in, materiali eleganti, luce naturale, risultato realistico e premium.",
    },
  },
  {
    id: "ristrutturazioni",
    title: "Ristrutturazioni",
    segment: "Casa, appartamenti, interni",
    bestFor: "Interventi medio-grandi da qualificare prima del sopralluogo.",
    budgetHint: "30-60 euro/giorno con domanda su budget e urgenza.",
    patch: {
      name: "Ristrutturazioni - Sopralluoghi qualificati",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Analisi gratuita del progetto con stima iniziale, priorità dei lavori e prossimo passo operativo.",
      dailyBudget: 35,
      targetCpl: 38,
      targetOpportunityRate: 30,
      interests: "ristrutturazione casa, edilizia, interior design, nuova casa, mutuo, architettura",
      requiredFields: "Nome, telefono, comune, tipo intervento, budget indicativo, urgenza",
      qualityQuestion: "Che tipo di immobile devi ristrutturare?",
      copyBrief: "Ristrutturazioni casa con sopralluogo qualificato, stima iniziale e gestione chiara dei lavori.",
      imagePrompt: "Cantiere interno pulito in appartamento italiano, professionisti al lavoro, render leggero del risultato finale, tono affidabile.",
    },
  },
  {
    id: "fotovoltaico",
    title: "Fotovoltaico",
    segment: "Impianti e risparmio energetico",
    bestFor: "Lead interessati a risparmio, bollette e sopralluogo.",
    budgetHint: "20-40 euro/giorno con domanda su consumi o tetto.",
    patch: {
      name: "Fotovoltaico - Consulenze locali",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Valutazione gratuita per capire se il fotovoltaico conviene davvero in base a tetto, consumi e obiettivi.",
      dailyBudget: 28,
      targetCpl: 28,
      targetOpportunityRate: 34,
      interests: "fotovoltaico, energia solare, risparmio energetico, bollette, casa indipendente",
      requiredFields: "Nome, telefono, comune, tipo immobile, consumo indicativo",
      qualityQuestion: "Hai un tetto di proprietà disponibile?",
      copyBrief: "Consulenza fotovoltaico locale con valutazione realistica di convenienza e prossimo passo tecnico.",
      imagePrompt: "Tetto italiano con pannelli fotovoltaici moderni, tecnico in sicurezza, luce naturale, famiglia soddisfatta, stile realistico.",
    },
  },
  {
    id: "tetti",
    title: "Tetti e facciate",
    segment: "Impermeabilizzazioni, coperture",
    bestFor: "Richieste urgenti o lavori stagionali ad alto valore.",
    budgetHint: "25-50 euro/giorno con messaggio su sicurezza e tempi.",
    patch: {
      name: "Tetti e facciate - Sopralluoghi",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Sopralluogo tecnico per capire stato del tetto o facciata, urgenze e preventivo con priorità chiare.",
      dailyBudget: 32,
      targetCpl: 35,
      targetOpportunityRate: 30,
      interests: "ristrutturazione tetto, facciate, impermeabilizzazione, manutenzione casa, edilizia",
      requiredFields: "Nome, telefono, comune, tipo problema, urgenza",
      qualityQuestion: "Il problema è urgente o programmabile?",
      copyBrief: "Interventi su tetti e facciate con sopralluogo tecnico, priorità dei lavori e preventivo chiaro.",
      imagePrompt: "Operai edili su tetto italiano in sicurezza, facciata curata, dettaglio materiali, stile professionale e realistico.",
    },
  },
  {
    id: "manutenzione",
    title: "Manutenzione",
    segment: "Piccoli lavori e pronto intervento",
    bestFor: "Volume controllato di richieste locali rapide.",
    budgetHint: "10-25 euro/giorno, utile per riempire agenda.",
    patch: {
      name: "Manutenzione - Richieste locali",
      objective: "OUTCOME_LEADS",
      conversionPlace: "instant_form",
      offer: "Contatto rapido per valutare il lavoro, dare una prima indicazione e fissare l'intervento se necessario.",
      dailyBudget: 18,
      targetCpl: 18,
      targetOpportunityRate: 25,
      interests: "manutenzione casa, riparazioni, edilizia, ristrutturazione, casa",
      requiredFields: "Nome, telefono, comune, tipo intervento, foto se disponibile",
      qualityQuestion: "Che intervento ti serve?",
      copyBrief: "Manutenzioni edili locali con risposta rapida, valutazione del problema e intervento organizzato.",
      imagePrompt: "Tecnico edile professionale in casa italiana, strumenti ordinati, intervento di manutenzione, atmosfera affidabile.",
    },
  },
];

function buildDefaultAdSets(input: Pick<BuilderState, "zone" | "radiusKm" | "interests" | "dailyBudget" | "gender" | "languages">): CampaignAdSet[] {
  const primaryBudget = Math.max(8, Math.round(input.dailyBudget * 0.6));
  const secondaryBudget = Math.max(6, input.dailyBudget - primaryBudget);
  return [
    {
      id: "adset-local-intent",
      name: "Pubblico locale caldo",
      angle: "Persone in zona con interesse diretto al lavoro",
      audienceStrategy: "advantage_plus",
      zone: input.zone,
      radiusKm: input.radiusKm,
      dailyBudget: primaryBudget,
      minDailyBudget: Math.max(6, Math.round(primaryBudget * 0.75)),
      maxDailyBudget: Math.max(10, Math.round(primaryBudget * 1.35)),
      audience: input.interests,
      excludedAudiences: "Clienti già chiusi negli ultimi 180 giorni, lead duplicati, dipendenti e fornitori",
      ageRange: "28-65",
      gender: input.gender,
      languages: input.languages,
      optimizationEvent: "qualified_lead",
      placementStrategy: "Advantage+ placements, esclusi posizionamenti a bassa qualità dopo test",
    },
    {
      id: "adset-retargeting",
      name: "Retargeting e prove sociali",
      angle: "Chi ha già visto sito, pagina, video o contatti CRM non chiusi",
      audienceStrategy: "retargeting",
      zone: input.zone,
      radiusKm: Math.max(10, Math.min(40, input.radiusKm)),
      dailyBudget: secondaryBudget,
      minDailyBudget: Math.max(5, Math.round(secondaryBudget * 0.7)),
      maxDailyBudget: Math.max(8, Math.round(secondaryBudget * 1.4)),
      audience: "Visitatori sito, engagement pagina, lead aperti, clienti simili",
      excludedAudiences: "Clienti già chiusi, opportunità perse per prezzo non sostenibile",
      ageRange: "25-65",
      gender: input.gender,
      languages: input.languages,
      optimizationEvent: "lead",
      placementStrategy: "Feed, Story e Reels con creatività verticali dedicate",
    },
  ];
}

function buildDefaultCreatives(input: Pick<BuilderState, "copyBrief" | "imagePrompt">): CampaignCreative[] {
  const brief = input.copyBrief || "campagna edilizia locale";
  return [
    {
      id: "creative-image",
      format: "image",
      title: "Immagine prima/dopo",
      hook: "Mostra trasformazione e risultato finale",
      goal: "Fermare lo scroll e far capire subito il tipo di intervento.",
      prompt: input.imagePrompt,
    },
    {
      id: "creative-video",
      format: "video",
      title: "Video tecnico breve",
      hook: "Problema → sopralluogo → soluzione",
      goal: "Aumentare fiducia e qualificare utenti che vogliono un lavoro fatto bene.",
      prompt: `Video verticale 15 secondi per ${brief}: apertura sul problema, tecnico che spiega, dettaglio cantiere pulito, risultato finale e CTA preventivo.`,
    },
    {
      id: "creative-carousel",
      format: "carousel",
      title: "Carosello educativo",
      hook: "3 errori da evitare prima del preventivo",
      goal: "Educare il cliente e filtrare contatti più consapevoli.",
      prompt: `Carosello Meta Ads per ${brief}: slide 1 hook forte, slide 2 problema, slide 3 soluzione, slide 4 prova, slide 5 CTA richiesta preventivo.`,
    },
  ];
}

const DEFAULT_BUILDER: BuilderState = {
  platform: "meta",
  googleChannel: undefined,
  templateId: "serramenti",
  name: "Serramenti - Lead zona locale",
  objective: "OUTCOME_LEADS",
  conversionPlace: "instant_form",
  offer: "Sopralluogo gratuito e preventivo chiaro per sostituire gli infissi senza sorprese.",
  budgetMode: "adset",
  dailyBudget: 25,
  zone: "Monza e Brianza",
  radiusKm: 25,
  ageMin: 28,
  ageMax: 65,
  gender: "all",
  languages: "Italiano",
  excludedLocations: "Zone fuori raggio operativo, comuni dove non fate sopralluoghi, clienti già acquisiti",
  interests: "ristrutturazione casa, infissi, arredamento, detrazioni fiscali",
  advantageAudience: true,
  customAudienceSource: "Visitatori sito, engagement pagina Facebook/Instagram, lead CRM non chiusi, liste clienti lavorabili",
  lookalikeSource: "Clienti chiusi negli ultimi 12 mesi con valore commessa sopra la media",
  lookalikePercent: 2,
  formIntent: "higher_intent",
  requiredFields: "Nome, telefono, comune, tipo intervento, urgenza",
  qualityQuestion: "Quando vorresti fare il lavoro?",
  privacyUrl: "",
  followUp: "Crea lead CRM, assegna al commerciale e invia WhatsApp entro 5 minuti.",
  landingUrl: "https://www.ediliziaincloud.com/demo",
  cta: "GET_QUOTE",
  imagePrompt: "Foto realistica di infissi moderni installati in una casa italiana luminosa, prima/dopo elegante, logo aziendale discreto, tono premium.",
  copyBrief: "Sostituzione infissi con consulenza, sopralluogo e preventivo chiaro per famiglie nella zona.",
  copyVariants: [
    "Vuoi cambiare infissi senza sorprese? Ti aiutiamo a scegliere materiali, detrazioni e posa con un preventivo chiaro prima di iniziare.",
    "Infissi nuovi, casa più silenziosa e consumi più bassi. Prenota una consulenza locale e scopri la soluzione adatta alla tua abitazione.",
    "Hai finestre vecchie o spifferi? In 30 minuti capiamo misure, esigenze e budget. Ricevi una proposta semplice e confrontabile.",
    "Dal sopralluogo alla posa: gestiamo tutto noi, con tempi chiari e materiali certificati. Richiedi il tuo preventivo serramenti.",
    "Non scegliere gli infissi solo dal prezzo. Ti mostriamo pro e contro di PVC, alluminio e legno-alluminio per evitare errori costosi.",
  ],
  adSets: [],
  creatives: [],
  targetCpl: 25,
  targetOpportunityRate: 35,
  testDurationDays: 5,
  pauseRule: "Pausa un annuncio se dopo 2.5x CPL target non genera lead qualificati o se i lead non rispondono al primo contatto.",
  scaleRule: "Aumenta budget del 15-20% ogni 48 ore solo se CPL, tasso opportunità e tempi di risposta restano stabili.",
};

DEFAULT_BUILDER.adSets = buildDefaultAdSets(DEFAULT_BUILDER);
DEFAULT_BUILDER.creatives = buildDefaultCreatives(DEFAULT_BUILDER);

function formatEuro(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function statusLabel(status: CampaignStatus) {
  const labels: Record<CampaignStatus, string> = {
    active: "Attiva",
    paused: "In pausa",
    draft: "Bozza",
    review: "In revisione",
    error: "Errore",
  };
  return labels[status];
}

function statusClass(status: CampaignStatus) {
  const classes: Record<CampaignStatus, string> = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    paused: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-slate-200 bg-slate-50 text-slate-600",
    review: "border-blue-200 bg-blue-50 text-blue-700",
    error: "border-red-200 bg-red-50 text-red-700",
  };
  return classes[status];
}

function objectiveLabel(objective: string) {
  const labels: Record<string, string> = {
    OUTCOME_LEADS: "Richieste preventivo",
    OUTCOME_TRAFFIC: "Visite al sito",
    OUTCOME_AWARENESS: "Farti conoscere",
    OUTCOME_ENGAGEMENT: "Interazioni",
  };
  return labels[objective] ?? "Campagna";
}

function budgetModeLabel(mode: BuilderState["budgetMode"]) {
  return mode === "adset" ? "budget per pubblico" : "budget unico campagna";
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function audienceStrategyLabel(strategy: AudienceStrategy) {
  const labels: Record<AudienceStrategy, string> = {
    advantage_plus: "Advantage+ suggerito",
    manual: "Manuale controllato",
    retargeting: "Retargeting",
    lookalike: "Lookalike",
  };
  return labels[strategy];
}

function genderLabel(gender: GenderTarget) {
  const labels: Record<GenderTarget, string> = {
    all: "Tutti",
    men: "Uomini",
    women: "Donne",
  };
  return labels[gender];
}

function optimizationEventLabel(event: CampaignAdSet["optimizationEvent"]) {
  const labels: Record<CampaignAdSet["optimizationEvent"], string> = {
    lead: "Lead",
    qualified_lead: "Lead qualificato",
    message: "Messaggio",
    landing_page_view: "Visita landing",
  };
  return labels[event];
}

function getCampaignDailyBudget(state: BuilderState) {
  if (state.budgetMode === "adset" && state.adSets.length > 0) {
    return state.adSets.reduce((sum, adSet) => sum + Math.max(0, adSet.dailyBudget), 0);
  }
  return state.dailyBudget;
}

function getAdMatrixSize(state: BuilderState) {
  return state.adSets.length * Math.max(1, state.creatives.length);
}

function getBudgetPerAd(state: BuilderState) {
  const ads = getAdMatrixSize(state);
  if (!ads) return 0;
  return getCampaignDailyBudget(state) / ads;
}

function getReadinessItems(state: BuilderState) {
  const fieldsCount = splitList(state.requiredFields).length;
  const budgetPerAd = getBudgetPerAd(state);
  return [
    {
      title: "Promessa chiara",
      ok: state.offer.trim().length >= 40,
      fix: "Scrivi cosa ottiene il cliente e perché dovrebbe lasciare il contatto.",
    },
    {
      title: "Zona realistica",
      ok: state.zone.trim().length >= 2 && state.radiusKm >= 5 && state.radiusKm <= 60 && state.ageMin <= state.ageMax,
      fix: "Scegli città/provincia e un raggio sostenibile per sopralluoghi reali.",
    },
    {
      title: "Controlli Meta impostati",
      ok: state.languages.trim().length >= 2 && state.gender && state.excludedLocations.trim().length >= 8,
      fix: "Definisci lingua, genere se serve ed esclusioni geografiche/CRM per evitare spreco budget.",
    },
    {
      title: "Budget test sensato",
      ok: getCampaignDailyBudget(state) >= 10,
      fix: "Sotto 10 euro/giorno Meta impara troppo lentamente.",
    },
    {
      title: "Gruppi pubblico strutturati",
      ok: state.adSets.length >= 2 && state.adSets.every((adSet) => adSet.name.trim() && adSet.dailyBudget >= 5 && adSet.audience.trim()),
      fix: "Prepara almeno due gruppi: pubblico locale freddo e retargeting/prove sociali.",
    },
    {
      title: "Modulo snello",
      ok: fieldsCount > 0 && fieldsCount <= 6,
      fix: "Tieni pochi campi e sposta la qualificazione in una domanda mirata.",
    },
    {
      title: "Privacy pronta",
      ok: state.privacyUrl.startsWith("https://"),
      fix: "Usa un link privacy HTTPS verificabile prima del lancio.",
    },
    {
      title: "Qualificazione lead",
      ok: state.qualityQuestion.trim().length >= 8,
      fix: "Aggiungi una domanda che filtra urgenza, zona o tipo intervento.",
    },
    {
      title: "Follow-up immediato",
      ok: state.followUp.trim().length >= 20,
      fix: "Prevedi CRM, task o WhatsApp entro pochi minuti dal lead.",
    },
    {
      title: "Copy pronti",
      ok: state.copyVariants.length >= 3 && state.copyVariants.every((copy) => copy.trim().length >= 35),
      fix: "Prepara almeno 3 messaggi diversi per testare angoli di vendita.",
    },
    {
      title: "Creatività chiara",
      ok: state.imagePrompt.trim().length >= 40,
      fix: "Descrivi immagine/video con contesto, formato e prova visiva del lavoro.",
    },
    {
      title: "Mix creatività",
      ok: state.creatives.length >= 3 && ["image", "video", "carousel"].every((format) => state.creatives.some((creative) => creative.format === format)),
      fix: "Servono almeno immagine, video e carosello per capire cosa genera lead migliori.",
    },
    {
      title: "Matrice annunci sostenibile",
      ok: getAdMatrixSize(state) <= 18 && budgetPerAd >= 1.5,
      fix: "Non creare troppi annunci rispetto al budget: meglio pochi test leggibili e decisioni rapide.",
    },
    {
      title: "Regole performance",
      ok: state.targetCpl > 0 && state.targetOpportunityRate >= 15 && state.testDurationDays >= 3 && state.pauseRule.trim().length >= 20 && state.scaleRule.trim().length >= 20,
      fix: "Imposta CPL target, tasso opportunità e regole per pausare/scalare senza andare a sensazione.",
    },
  ];
}

function getReadinessScore(state: BuilderState) {
  const items = getReadinessItems(state);
  const passed = items.filter((item) => item.ok).length;
  return {
    items,
    passed,
    total: items.length,
    score: Math.round((passed / items.length) * 100),
  };
}

function buildCopyVariants(state: BuilderState): string[] {
  const focus = state.copyBrief.trim() || "campagna edilizia locale";
  const zone = state.zone.trim() || "la tua zona";
  const offer = state.offer.trim() || "un preventivo chiaro";
  return [
    `${focus}: ${offer}. Campagna locale su ${zone}, pensata per richieste qualificate e sopralluoghi veri.`,
    `Hai bisogno di capire costi, tempi e materiali prima di iniziare? Richiedi ${offer.toLowerCase()} e parla con un tecnico della tua zona.`,
    `Non lasciare che il prezzo sia l'unico criterio. Ti aiutiamo a valutare soluzione, posa e detrazioni con una proposta semplice da confrontare.`,
    `Dal primo contatto al sopralluogo: percorso guidato, tempi chiari e preventivo senza sorprese. Ideale per chi vuole decidere con serenità.`,
    `La differenza non è il like: è la commessa chiusa. Messaggio diretto, prova di fiducia e modulo pensato per capire urgenza e zona.`,
  ];
}

function useMetaConnection(companyId: string | undefined, enabled: boolean) {
  const { data: integration, isLoading: integrationLoading } = useQuery({
    queryKey: ["ads-manager-beta", "meta-integration", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .maybeSingle();
      if (error) throw error;
      return data as Integration | null;
    },
    enabled: enabled && !!companyId,
    staleTime: 60_000,
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["ads-manager-beta", "meta-assets", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data, error } = await supabase
        .from("meta_assets")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("asset_name");
      if (error) throw error;
      return (data ?? []) as MetaAsset[];
    },
    enabled: enabled && !!companyId && !!integration?.id,
    staleTime: 60_000,
  });

  return {
    integration,
    assets,
    isLoading: integrationLoading || assetsLoading,
    pages: assets.filter((asset) => asset.asset_type === "page"),
    adAccounts: assets.filter((asset) => asset.asset_type === "ad_account"),
    businesses: assets.filter((asset) => asset.asset_type === "business"),
  };
}

/**
 * Adapter MetaCampaignRow (DB) → LocalCampaignDraft (UI legacy).
 *
 * Permette al frontend esistente di consumare i record DB senza refactor
 * massivo. Estrae il builder_state JSONB e ricostruisce la shape che i
 * componenti CampaignDetailEditor/wizard si aspettano.
 */
function metaCampaignToLegacyDraft(c: MetaCampaignRow): LocalCampaignDraft {
  const bs = (c.builder_state ?? {}) as Partial<BuilderState>;
  const adSetsLen = Array.isArray(bs.adSets) ? bs.adSets.length : 0;
  const creativesLen = Array.isArray(bs.creatives) ? bs.creatives.length : 0;
  return {
    id: c.id,
    name: c.name,
    objective: c.objective,
    budgetCents: c.daily_budget_cents ?? 0,
    zone: bs.zone ?? "—",
    adSets: adSetsLen || 1,
    ads: Math.max(1, adSetsLen * Math.max(1, creativesLen)),
    targetCplCents: (bs.targetCpl ?? 25) * 100,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    copyVariants: Array.isArray(bs.copyVariants) ? bs.copyVariants : [],
    imagePrompt: bs.imagePrompt ?? "",
    builderState: bs as BuilderState,
  };
}

export default function AdsManagerBeta() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const companyName = effectiveCompany?.name ?? "La tua azienda";
  const isDemoCompany = companyId === DEMO_COMPANY_ID;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const mode = searchParams.get("mode");
  const editId = searchParams.get("edit");
  const detailId = searchParams.get("detail");

  const meta = useMetaConnection(companyId, isDemoCompany);

  // Realtime: ascolta autopause + status changes campaign → toast
  useAdsNotifications(companyId);

  // Data layer: prova DB (meta_campaigns), fallback automatico localStorage
  const {
    campaigns: dbCampaigns,
    saveDraft: saveDraftDb,
    updateDraft: updateDraftDb,
    deleteDraft: deleteDraftDb,
    findCampaign: findDbCampaign,
    isLoading: campaignsLoading,
  } = useMetaCampaigns(companyId);

  // Wrapper di compatibilità con la vecchia API (drafts/saveDraft/etc.)
  // Adatta MetaCampaignRow → LocalCampaignDraft per riusare i componenti esistenti
  const drafts: LocalCampaignDraft[] = useMemo(
    () =>
      dbCampaigns.map((c) => metaCampaignToLegacyDraft(c)),
    [dbCampaigns],
  );

  const saveDraft = useCallback(
    async (state: BuilderState): Promise<LocalCampaignDraft> => {
      const result = await saveDraftDb({
        builder_state: state as unknown as Record<string, unknown>,
        name: state.name.trim() || "Campagna Meta senza nome",
        objective: state.objective,
        daily_budget_cents: getCampaignDailyBudget(state) * 100,
      });
      // Result può essere MetaCampaignRow o LegacyDraft (dal fallback)
      if ("builder_state" in result) {
        return metaCampaignToLegacyDraft(result as MetaCampaignRow);
      }
      return result as LocalCampaignDraft;
    },
    [saveDraftDb],
  );

  const updateDraft = useCallback(
    async (id: string, state: BuilderState): Promise<void> => {
      await updateDraftDb({
        id,
        builder_state: state as unknown as Record<string, unknown>,
        name: state.name.trim() || "Campagna Meta senza nome",
        objective: state.objective,
        daily_budget_cents: getCampaignDailyBudget(state) * 100,
      });
    },
    [updateDraftDb],
  );

  const removeDraft = useCallback(
    async (id: string): Promise<void> => {
      await deleteDraftDb(id);
    },
    [deleteDraftDb],
  );

  const findDraft = useCallback(
    (id: string): LocalCampaignDraft | null => {
      const c = findDbCampaign(id);
      return c ? metaCampaignToLegacyDraft(c) : null;
    },
    [findDbCampaign],
  );

  const view: ViewMode =
    mode === "create" || (mode === "edit" && editId)
      ? "wizard"
      : detailId
      ? "detail"
      : "list";

  const activeTab: AdsTab = TABS.some((tab) => tab.value === requestedTab)
    ? (requestedTab as AdsTab)
    : "campagne";

  // Toggle "mostra esempi" persistito in localStorage
  const sampleKey = companyId ? `eic_ads_manager_show_samples_${companyId}` : null;
  const [showSamples, setShowSamples] = useState<boolean>(() => {
    if (!sampleKey) return drafts.length === 0;
    try {
      const raw = window.localStorage.getItem(sampleKey);
      if (raw === null) return drafts.length === 0; // default: solo se non hai ancora bozze
      return raw === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!sampleKey) return;
    try {
      window.localStorage.setItem(sampleKey, showSamples ? "1" : "0");
    } catch {
      // ignore
    }
  }, [showSamples, sampleKey]);

  const openWizardNew = () => setSearchParams({ mode: "create" });
  const openWizardEdit = (id: string) => setSearchParams({ mode: "edit", edit: id });
  const openDetail = (id: string) => setSearchParams({ detail: id });
  const backToList = (tab: AdsTab = "campagne") => setSearchParams({ tab });

  const draftRows: CampaignRow[] = useMemo(
    () =>
      drafts.map((draft) => ({
        id: draft.id,
        name: draft.name,
        objective: draft.objective,
        status: "draft" as const,
        budgetCents: draft.budgetCents,
        spentCents: 0,
        leads: 0,
        opportunities: 0,
        jobs: 0,
        adSets: draft.adSets ?? 1,
        ads: draft.ads ?? Math.max(1, draft.copyVariants.length),
        targetCplCents: draft.targetCplCents ?? 0,
        source: "local" as const,
        draftRef: draft,
      })),
    [drafts],
  );

  // Solo i draft locali contano per i KPI reali. SAMPLE_CAMPAIGNS sono demo.
  const realCampaigns = draftRows;
  const allCampaigns = useMemo(
    () => (showSamples ? [...draftRows, ...SAMPLE_CAMPAIGNS] : draftRows),
    [draftRows, showSamples],
  );

  // Spend Guard: il cap mensile arriva dal DB (ad_spend_guard) con fallback default
  const { config: spendGuardConfig } = useAdSpendGuard(companyId);

  const monthlySpend = realCampaigns.reduce((sum, c) => sum + c.spentCents, 0);
  const totalLeads = realCampaigns.reduce((sum, c) => sum + c.leads, 0);
  const totalJobs = realCampaigns.reduce((sum, c) => sum + c.jobs, 0);
  const costPerLead = totalLeads ? monthlySpend / totalLeads : 0;
  const costPerJob = totalJobs ? monthlySpend / totalJobs : 0;
  const monthlyCap = spendGuardConfig.monthly_cap_cents;
  const spendPct = monthlyCap > 0 ? Math.min(100, Math.round((monthlySpend / monthlyCap) * 100)) : 0;

  if (!isDemoCompany) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50/60">
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl">Modulo Pubblicità in Beta privata</CardTitle>
            <CardDescription>
              Questa sezione e sbloccata solo per Demo Azienda S.r.l. durante la fase locale di validazione.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link to="/azienda/marketing">Torna al marketing</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/azienda/cruscotto">Vai al cruscotto</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- WIZARD (create / edit) ----
  if (view === "wizard") {
    const editingDraft = editId ? findDraft(editId) : null;
    const initialState = editingDraft?.builderState ?? null;

    return (
      <div className="min-h-screen bg-slate-50/70">
        <WizardHeader
          editing={!!editingDraft}
          draftName={editingDraft?.name}
          onCancel={() => backToList()}
        />
        <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
          <ConnectionPill meta={meta} />
          <div className="mt-5">
            <CampaignBuilderTab
              companyName={companyName}
              companyId={companyId}
              initialState={initialState}
              isEditing={!!editingDraft}
              onCancel={() => backToList()}
              onSaveDraft={async (state) => {
                try {
                  if (editingDraft) {
                    await updateDraft(editingDraft.id, state);
                    toast.success("Bozza aggiornata", {
                      description: `${state.name || "Campagna"} salvata.`,
                    });
                    openDetail(editingDraft.id);
                  } else {
                    const draft = await saveDraft(state);
                    toast.success("Bozza campagna salvata", {
                      description: `${draft.name} è pronta per revisione prima della pubblicazione Meta.`,
                    });
                    openDetail(draft.id);
                  }
                } catch (err) {
                  console.error("[AdsManagerBeta] save failed", err);
                  toast.error("Errore salvataggio", {
                    description: String((err as Error).message ?? err),
                  });
                }
              }}
            />
          </div>
        </main>
        {/* AdsBot context-aware: passa wizard step + platform */}
        <AdsBotChatPanel
          companyId={companyId}
          context={{
            platform: editingDraft?.builderState?.platform ?? "meta",
            selected_campaign_id: editingDraft?.id,
          }}
        />
      </div>
    );
  }

  // ---- DETAIL (view + edit campaign + adsets + ads) ----
  if (view === "detail" && detailId) {
    const draft = findDraft(detailId);
    if (!draft) {
      // Draft eliminato o non trovato → torna alla lista
      return (
        <div className="min-h-screen bg-slate-50/70 p-6">
          <Card className="mx-auto max-w-xl">
            <CardHeader>
              <CardTitle>Bozza non trovata</CardTitle>
              <CardDescription>
                La campagna che stai cercando è stata eliminata o non esiste.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => backToList()}>Torna alle campagne</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50/70">
        <DetailHeader
          draft={draft}
          onBack={() => backToList()}
          onEdit={() => openWizardEdit(draft.id)}
          onDelete={async () => {
            try {
              await removeDraft(draft.id);
              toast.success("Bozza eliminata");
              backToList();
            } catch (err) {
              toast.error("Errore eliminazione", {
                description: String((err as Error).message ?? err),
              });
            }
          }}
        />
        <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
          <CampaignDetailEditor
            draft={draft}
            companyName={companyName}
            companyId={companyId}
            onUpdate={async (state) => {
              try {
                await updateDraft(draft.id, state);
              } catch (err) {
                toast.error("Errore aggiornamento", {
                  description: String((err as Error).message ?? err),
                });
              }
            }}
            onEditFull={() => openWizardEdit(draft.id)}
            onCreateVariant={async (variantState) => {
              try {
                const newDraft = await saveDraft(variantState);
                openDetail(newDraft.id);
              } catch (err) {
                toast.error("Errore creazione variante", {
                  description: String((err as Error).message ?? err),
                });
              }
            }}
          />
        </main>
        <AdsBotChatPanel
          companyId={companyId}
          context={{
            selected_campaign_id: draft.id,
            platform: draft.builderState?.platform ?? "meta",
          }}
        />
      </div>
    );
  }

  // ---- LIST (default) ----
  return (
    <div className="min-h-screen bg-slate-50/70">
      <ListHeader onCreate={openWizardNew} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <ConnectionPill meta={meta} />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setSearchParams({ tab: value })}
          className="mt-5"
        >
          <div className="overflow-x-auto pb-2">
            <TabsList className="h-auto min-w-max justify-start gap-1 rounded-xl bg-white p-1 shadow-sm">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-2 rounded-lg px-3 py-2">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Banner approvazioni titolare (visibile solo se ci sono campagne in review) */}
          <div className="mt-4">
            <PendingApprovalsBanner companyId={companyId} onOpenCampaign={openDetail} />
          </div>

          <TabsContent value="campagne" className="mt-4">
            <CampaignsHomeView
              campaigns={allCampaigns}
              draftsCount={draftRows.length}
              spendPct={spendPct}
              monthlySpend={monthlySpend}
              monthlyCap={monthlyCap}
              totalLeads={totalLeads}
              totalJobs={totalJobs}
              costPerLead={costPerLead}
              costPerJob={costPerJob}
              showSamples={showSamples}
              onToggleSamples={setShowSamples}
              isLoading={campaignsLoading}
              onCreate={openWizardNew}
              onOpenCampaign={(c) => {
                if (c.source === "local") openDetail(c.id);
                else toast.info("Anteprima campagna Meta — disponibile dopo il collegamento live");
              }}
              onRemoveDraft={async (id) => {
                try {
                  await removeDraft(id);
                } catch (err) {
                  toast.error("Errore eliminazione", {
                    description: String((err as Error).message ?? err),
                  });
                }
              }}
            />
          </TabsContent>

          <TabsContent value="creativita" className="mt-4">
            <CreativeStudioTab companyId={companyId} />
          </TabsContent>

          <TabsContent value="pubblici" className="mt-4">
            <AudiencesTab onUseInWizard={openWizardNew} />
          </TabsContent>

          <TabsContent value="impostazioni" className="mt-4">
            <SettingsTab meta={meta} companyId={companyId} />
          </TabsContent>
        </Tabs>
      </main>
      <AdsBotChatPanel companyId={companyId} />
      <AdsOnboardingTour companyId={companyId} />
    </div>
  );
}

function ListHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-orange-200 bg-orange-50 text-orange-700" variant="outline">
              Beta Demo Azienda
            </Badge>
            <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
              Campagne Meta
            </Badge>
            <Badge className="border-slate-200 bg-white text-slate-600" variant="outline">
              Pubblicazione live disattivata
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Pubblicità</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Crea richieste preventivo qualificate da Meta senza entrare nella complessità di Business Manager. La beta lavora in locale con bozze sicure, checklist e controllo prima del lancio.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild>
            <Link to="/azienda/impostazioni/lead-forms">
              <Settings className="h-4 w-4" />
              Collega Meta
            </Link>
          </Button>
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Nuova campagna
          </Button>
        </div>
      </div>
    </div>
  );
}

function WizardHeader({
  editing,
  draftName,
  onCancel,
}: {
  editing: boolean;
  draftName?: string;
  onCancel: () => void;
}) {
  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
          Torna alle campagne
        </Button>
        <div className="ml-2 min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {editing ? "Modifica campagna" : "Nuova campagna guidata"}
          </p>
          <p className="truncate text-base font-semibold text-slate-950">
            {editing ? draftName ?? "Bozza" : "Crea una campagna Meta passo passo"}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  draft,
  onBack,
  onEdit,
  onDelete,
}: {
  draft: LocalCampaignDraft;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Indietro
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                Bozza locale
              </Badge>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {objectiveLabel(draft.objective)}
              </Badge>
            </div>
            <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              {draft.name}
            </h1>
            <p className="text-xs text-slate-500">
              {draft.zone} · {formatEuro(draft.budgetCents)}/giorno ·{" "}
              {draft.adSets} gruppi · {draft.ads} ads
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Modifica completa
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Elimina
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              La bozza &laquo;{draft.name}&raquo; verrà rimossa definitivamente. Non potrai recuperarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setConfirmOpen(false);
              }}
            >
              Elimina bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * ConnectionPill — versione SUPER COMPATTA del vecchio ConnectionStrip.
 *
 * Una sola riga inline che mostra lo stato connessione Meta + 1 azione.
 * Tutta la versione "verbose" è stata spostata nel SettingsTab > setupBlocks
 * per evitare ridondanza con i badge nell'header.
 */
function ConnectionPill({ meta }: { meta: ReturnType<typeof useMetaConnection> }) {
  const connected = meta.integration?.status === "connected";
  const tone = connected
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5", tone)}>
      <div className="flex items-center gap-2 text-sm">
        {meta.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : connected ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <span className="font-semibold">
          {connected ? "Meta collegato" : "Meta non collegato"}
        </span>
        {connected && (
          <span className="text-xs opacity-80">
            · {meta.adAccounts.length} ad account · {meta.pages.length} pagine
          </span>
        )}
      </div>
      {!connected && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs underline" asChild>
          <Link to="/azienda/impostazioni/lead-forms">Configura ora</Link>
        </Button>
      )}
    </div>
  );
}

function CampaignsHomeView({
  campaigns,
  draftsCount,
  spendPct,
  monthlySpend,
  monthlyCap,
  totalLeads,
  totalJobs,
  costPerLead,
  costPerJob,
  showSamples,
  onToggleSamples,
  isLoading = false,
  onCreate,
  onOpenCampaign,
  onRemoveDraft,
}: {
  campaigns: CampaignRow[];
  draftsCount: number;
  spendPct: number;
  monthlySpend: number;
  monthlyCap: number;
  totalLeads: number;
  totalJobs: number;
  costPerLead: number;
  costPerJob: number;
  showSamples: boolean;
  onToggleSamples: (next: boolean) => void;
  isLoading?: boolean;
  onCreate: () => void;
  onOpenCampaign: (campaign: CampaignRow) => void;
  onRemoveDraft: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* KPI bar compatta (solo dati reali, no campagne demo) */}
      <KpiBar
        monthlySpend={monthlySpend}
        monthlyCap={monthlyCap}
        spendPct={spendPct}
        totalLeads={totalLeads}
        totalJobs={totalJobs}
        costPerLead={costPerLead}
        costPerJob={costPerJob}
        draftsCount={draftsCount}
      />

      {/* AdsBot dinamico basato sullo stato reale */}
      <AdsBotPanel draftsCount={draftsCount} totalLeads={totalLeads} onCreate={onCreate} />

      {/* Lista campagne — vista primaria */}
      <CampaignsList
        campaigns={campaigns}
        draftsCount={draftsCount}
        showSamples={showSamples}
        onToggleSamples={onToggleSamples}
        isLoading={isLoading}
        onCreate={onCreate}
        onOpenCampaign={onOpenCampaign}
        onRemoveDraft={onRemoveDraft}
      />
    </div>
  );
}

function KpiBar({
  monthlySpend,
  monthlyCap,
  spendPct,
  totalLeads,
  totalJobs,
  costPerLead,
  costPerJob,
  draftsCount,
}: {
  monthlySpend: number;
  monthlyCap: number;
  spendPct: number;
  totalLeads: number;
  totalJobs: number;
  costPerLead: number;
  costPerJob: number;
  draftsCount: number;
}) {
  const isEmpty = monthlySpend === 0 && totalLeads === 0 && draftsCount === 0;
  // In BETA "Costo per commessa" è sempre 0 perché manca attribuzione live.
  // La mostriamo SOLO se totalJobs > 0 (cioè quando dati reali ci sono).
  const showCostPerJob = totalJobs > 0;
  return (
    <Card className={cn(isEmpty && "border-dashed bg-white/60")}>
      <CardContent className="p-4">
        <div
          className={cn(
            "grid gap-4 sm:grid-cols-2",
            showCostPerJob ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          <KpiItem
            icon={BadgeEuro}
            tone="blue"
            label="Spesa mese"
            value={formatEuro(monthlySpend)}
            detail={`${spendPct}% del limite (${formatEuro(monthlyCap)})`}
          />
          <KpiItem
            icon={Users}
            tone="orange"
            label="Lead ricevuti"
            value={String(totalLeads)}
            detail={draftsCount > 0 ? "da bozze in revisione" : "nessuna campagna live"}
          />
          <KpiItem
            icon={Target}
            tone="green"
            label="Costo per lead"
            value={costPerLead ? formatEuro(costPerLead) : "—"}
            detail={totalLeads > 0 ? "media periodo" : "in attesa di lead"}
          />
          {showCostPerJob && (
            <KpiItem
              icon={Check}
              tone="violet"
              label="Costo per commessa"
              value={formatEuro(costPerJob)}
              detail={`${totalJobs} commesse collegate`}
            />
          )}
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">Cap mensile protetto</span>
            <span className="font-semibold text-slate-700">
              {formatEuro(monthlySpend)} / {formatEuro(monthlyCap)}
            </span>
          </div>
          <Progress value={spendPct} className="h-2 bg-slate-100" indicatorClassName="bg-orange-500" />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiItem({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "orange" | "green" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="flex items-start gap-3">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate text-lg font-bold tracking-tight text-slate-950">{value}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

/** AdsBot — raccomandazioni dinamiche basate sullo stato reale del workspace. */
function AdsBotPanel({
  draftsCount,
  totalLeads,
  onCreate,
}: {
  draftsCount: number;
  totalLeads: number;
  onCreate: () => void;
}) {
  let title = "Inizia da una campagna lead locale";
  let body =
    "Non hai ancora bozze. Parti da un modello edile (serramenti, bagni, ristrutturazioni): il wizard imposta offerta, pubblico, modulo e prompt creativi.";
  let actionLabel = "Crea la prima campagna";

  if (draftsCount === 1) {
    title = "Hai una bozza — preparala al lancio";
    body =
      "Apri la bozza e completa la checklist pre-lancio. Quando arrivi a 80/100 di prontezza puoi attivare il proxy live in sicurezza.";
    actionLabel = "Crea un'altra bozza";
  } else if (draftsCount >= 2 && totalLeads === 0) {
    title = "Più bozze, nessun lead ancora";
    body =
      "Le bozze restano locali finché non attivi la pubblicazione. Confronta le bozze e scegli quella con readiness più alta come prima da portare live.";
    actionLabel = "Crea una variante";
  } else if (totalLeads > 0) {
    title = "Lead in arrivo: misura prima di scalare";
    body =
      "Aspetta almeno 3-5 giorni di test prima di alzare il budget. Verifica CPL, qualità lead e tempo di risposta commerciale.";
    actionLabel = "Crea variante / pubblico nuovo";
  }

  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">AdsBot</p>
            <p className="text-base font-semibold text-slate-950">{title}</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-700">{body}</p>
          </div>
        </div>
        <Button onClick={onCreate} className="shrink-0">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function CampaignsList({
  campaigns,
  draftsCount,
  showSamples,
  onToggleSamples,
  isLoading = false,
  onCreate,
  onOpenCampaign,
  onRemoveDraft,
}: {
  campaigns: CampaignRow[];
  draftsCount: number;
  showSamples: boolean;
  onToggleSamples: (next: boolean) => void;
  isLoading?: boolean;
  onCreate: () => void;
  onOpenCampaign: (campaign: CampaignRow) => void;
  onRemoveDraft: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteCampaign = useMemo(
    () => campaigns.find((c) => c.id === confirmDeleteId),
    [campaigns, confirmDeleteId],
  );

  // Calcola gli stati effettivamente presenti nelle campagne + conteggi.
  // Evitiamo di mostrare "Attiva (0)" quando nessuna campagna è in quello stato.
  const statusCounts = useMemo(() => {
    const counts: Record<CampaignStatus, number> = {
      draft: 0,
      review: 0,
      active: 0,
      paused: 0,
      error: 0,
    };
    for (const c of campaigns) {
      if (counts[c.status] !== undefined) counts[c.status] += 1;
    }
    return counts;
  }, [campaigns]);

  const availableStatuses = useMemo(
    () =>
      (Object.entries(statusCounts) as [CampaignStatus, number][])
        .filter(([, n]) => n > 0)
        .map(([s]) => s),
    [statusCounts],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = `${c.name} ${objectiveLabel(c.objective)} ${statusLabel(c.status)} ${
        c.source === "local" ? "bozza" : "meta"
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [campaigns, search, statusFilter]);

  const isEmpty = campaigns.length === 0;
  const isFilteredEmpty = !isEmpty && filtered.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Le tue campagne</CardTitle>
            <CardDescription>
              {draftsCount > 0
                ? `${draftsCount} bozza/e locale/i. Clicca una bozza per modificarla.`
                : "Nessuna campagna ancora. Inizia con il wizard guidato."}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Cerca campagna, obiettivo, stato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Filtro stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Tutti gli stati ({campaigns.length})
                </SelectItem>
                {/* Mostra solo gli stati realmente presenti nelle campagne */}
                {availableStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)} ({statusCounts[status]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">
            {filtered.length} risultat{filtered.length === 1 ? "o" : "i"} di {campaigns.length}
          </span>
          <span className="text-slate-300">·</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onToggleSamples(!showSamples)}
          >
            {showSamples ? "Nascondi esempi" : "Mostra esempi"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento campagne...
          </div>
        ) : isEmpty ? (
          <EmptyCampaigns onCreate={onCreate} />
        ) : isFilteredEmpty ? (
          <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Nessun risultato</p>
            <p className="mt-1 text-xs text-slate-500">Prova a cambiare ricerca o filtro stato.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border bg-white lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campagna</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Struttura</TableHead>
                    <TableHead className="text-right">Budget/giorno</TableHead>
                    <TableHead className="text-right">Spesa</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">CPL target</TableHead>
                    <TableHead className="text-right">Commesse</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((campaign) => (
                    <TableRow
                      key={campaign.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50/70"
                      onClick={() => onOpenCampaign(campaign)}
                    >
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-950">{campaign.name}</p>
                            {campaign.isDemo && (
                              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-bold uppercase tracking-wide text-purple-700">
                                Esempio
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {objectiveLabel(campaign.objective)} ·{" "}
                            {campaign.source === "local" ? "bozza locale" : "Meta"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(campaign.status)}>
                          {statusLabel(campaign.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium text-slate-900">{campaign.adSets ?? 1} ad set</p>
                          <p className="text-xs text-slate-500">{campaign.ads ?? 1} ads</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEuro(campaign.budgetCents)}
                      </TableCell>
                      <TableCell className="text-right">{formatEuro(campaign.spentCents)}</TableCell>
                      <TableCell className="text-right">{campaign.leads}</TableCell>
                      <TableCell className="text-right">
                        {campaign.targetCplCents ? formatEuro(campaign.targetCplCents) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{campaign.jobs}</TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {campaign.source === "local" ? (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Modifica"
                                      onClick={() => onOpenCampaign(campaign)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Modifica</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label="Elimina"
                                      onClick={() => setConfirmDeleteId(campaign.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Elimina bozza</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          ) : (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={campaign.status === "active" ? "Metti in pausa" : "Riattiva"}
                                      onClick={() =>
                                        toast.info("Azione Meta non attiva in Beta locale")
                                      }
                                    >
                                      {campaign.status === "active" ? (
                                        <Pause className="h-4 w-4" />
                                      ) : (
                                        <Play className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {campaign.status === "active" ? "Pausa" : "Riattiva"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Apri dettagli"
                                onClick={() => onOpenCampaign(campaign)}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {filtered.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => onOpenCampaign(campaign)}
                  className="rounded-xl border bg-white p-4 text-left transition-colors hover:bg-slate-50/70"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-950">{campaign.name}</p>
                        {campaign.isDemo && (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                            Esempio
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{objectiveLabel(campaign.objective)}</p>
                    </div>
                    <Badge variant="outline" className={statusClass(campaign.status)}>
                      {statusLabel(campaign.status)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <MiniStat label="Budget" value={formatEuro(campaign.budgetCents)} />
                    <MiniStat label="Ads" value={String(campaign.ads ?? 1)} />
                    <MiniStat label="Lead" value={String(campaign.leads)} />
                    <MiniStat label="Commesse" value={String(campaign.jobs)} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              La bozza &laquo;{confirmDeleteCampaign?.name}&raquo; verrà rimossa definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) onRemoveDraft(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Elimina bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EmptyCampaigns({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed bg-gradient-to-br from-white via-slate-50 to-orange-50/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md">
        <Rocket className="h-7 w-7" />
      </div>
      <p className="text-lg font-bold text-slate-950">Crea la tua prima campagna Meta</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Il wizard ti guida in 5 passi: offerta, pubblico, modulo lead, creatività e revisione. Tutto resta in bozza finché non confermi il lancio.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Nuova campagna guidata
        </Button>
        <Button variant="outline" asChild>
          <Link to="/azienda/impostazioni/lead-forms">
            <Settings className="h-4 w-4" />
            Collega Meta
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CampaignBuilderTab({
  onSaveDraft,
  onCancel,
  companyName,
  companyId,
  initialState,
  isEditing = false,
}: {
  onSaveDraft: (state: BuilderState) => void;
  onCancel: () => void;
  companyName?: string;
  companyId?: string;
  initialState?: BuilderState | null;
  isEditing?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<BuilderState>(initialState ?? DEFAULT_BUILDER);
  const { generateCopy, isGeneratingCopy } = useAdsAi(companyId);
  const totalDailyBudget = getCampaignDailyBudget(state);
  const dailyBudgetCents = totalDailyBudget * 100;
  const overApprovalLimit = totalDailyBudget > 30;
  const readiness = getReadinessScore(state);

  // Validazione per step (atomica) — utile sia per gating della navigation che per next button.
  const stepValidity = useMemo(() => {
    const v1 = state.name.trim().length >= 3 && state.offer.trim().length >= 12 && !!state.objective;
    const v2 =
      state.zone.trim().length >= 2 &&
      state.radiusKm >= 1 &&
      state.ageMin <= state.ageMax &&
      state.languages.trim().length >= 2 &&
      state.adSets.length > 0 &&
      state.adSets.every(
        (adSet) =>
          adSet.name.trim().length >= 2 && adSet.dailyBudget >= 5 && adSet.audience.trim().length >= 3,
      );
    const v3 =
      state.requiredFields.trim().length >= 8 &&
      state.privacyUrl.trim().startsWith("https://") &&
      state.followUp.trim().length >= 10;
    const v4 =
      state.copyVariants.every((copy) => copy.trim().length >= 20) &&
      state.imagePrompt.trim().length >= 20 &&
      state.creatives.length > 0 &&
      state.creatives.every((creative) => creative.prompt.trim().length >= 20);
    const v5 = readiness.score >= 60; // soglia minima per consentire salvataggio guidato
    return { 1: v1, 2: v2, 3: v3, 4: v4, 5: v5 } as Record<number, boolean>;
  }, [state, readiness.score]);

  /** Quale step è raggiungibile via click sull'indicator: tutti i precedenti devono essere ok. */
  const canJumpTo = (target: number) => {
    if (target <= step) return true;
    for (let s = 1; s < target; s += 1) {
      if (!stepValidity[s]) return false;
    }
    return true;
  };

  const isStepValid = stepValidity[step] === true || step === 5;

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const applyTemplate = (template: CampaignTemplate) => {
    setState((prev) => {
      const next = {
        ...prev,
        ...template.patch,
        templateId: template.id,
      };
      return {
        ...next,
        copyVariants: buildCopyVariants(next),
        adSets: buildDefaultAdSets(next),
        creatives: buildDefaultCreatives(next),
      };
    });
    toast.success(`${template.title} impostato`, { description: "Ho preparato offerta, pubblico, modulo e prompt creativi di partenza." });
  };

  const updateAdSet = <K extends keyof CampaignAdSet>(id: string, key: K, value: CampaignAdSet[K]) => {
    setState((prev) => ({
      ...prev,
      adSets: prev.adSets.map((adSet) => (adSet.id === id ? { ...adSet, [key]: value } : adSet)),
    }));
  };

  const addAdSet = () => {
    setState((prev) => ({
      ...prev,
      adSets: [
        ...prev.adSets,
        {
          id: `adset-${Date.now()}`,
          name: `Pubblico test ${prev.adSets.length + 1}`,
          angle: "Nuovo angolo da validare",
          audienceStrategy: prev.adSets.length >= 2 ? "lookalike" : "manual",
          zone: prev.zone,
          radiusKm: prev.radiusKm,
          dailyBudget: 8,
          minDailyBudget: 6,
          maxDailyBudget: 14,
          audience: prev.interests,
          excludedAudiences: "Clienti già chiusi, lead duplicati, pubblico non lavorabile",
          ageRange: `${prev.ageMin}-${prev.ageMax}`,
          gender: prev.gender,
          languages: prev.languages,
          optimizationEvent: "qualified_lead",
          placementStrategy: "Feed, Story e Reels con creatività coerenti",
        },
      ],
    }));
  };

  const removeAdSet = (id: string) => {
    setState((prev) => ({ ...prev, adSets: prev.adSets.filter((adSet) => adSet.id !== id) }));
  };

  const updateCreative = <K extends keyof CampaignCreative>(id: string, key: K, value: CampaignCreative[K]) => {
    setState((prev) => ({
      ...prev,
      creatives: prev.creatives.map((creative) => (creative.id === id ? { ...creative, [key]: value } : creative)),
    }));
  };

  const addCreative = (format: CreativeFormat) => {
    const labels: Record<CreativeFormat, string> = {
      image: "Nuova immagine",
      video: "Nuovo video",
      carousel: "Nuovo carosello",
      story: "Nuova story/reel",
    };
    setState((prev) => ({
      ...prev,
      creatives: [
        ...prev.creatives,
        {
          id: `creative-${format}-${Date.now()}`,
          format,
          title: labels[format],
          hook: "Hook da testare",
          goal: "Capire se questo formato porta lead più qualificati.",
          prompt: format === "carousel"
            ? `Carosello per ${prev.copyBrief}: problema, errore comune, soluzione, prova, CTA.`
            : `${labels[format]} per ${prev.copyBrief}: mostra problema, risultato e invito a richiedere preventivo.`,
        },
      ],
    }));
  };

  const removeCreative = (id: string) => {
    setState((prev) => ({ ...prev, creatives: prev.creatives.filter((creative) => creative.id !== id) }));
  };

  /**
   * Rigenera copy via AI (ai-ads-copy-generate edge fn).
   * Fallback: se l'AI fallisce o non è disponibile, usa il generatore template locale.
   */
  const regenerateCopy = async () => {
    const aiResult = await generateCopy({
      brief: state.copyBrief || state.offer || "campagna edilizia locale",
      segment: state.templateId,
      zone: state.zone,
      offer: state.offer,
      tone: "professionale",
      variants: 5,
    });
    if (aiResult?.copy_variants && aiResult.copy_variants.length > 0) {
      setState((prev) => ({
        ...prev,
        copyVariants: aiResult.copy_variants,
        // Se l'AI ha suggerito nuovi image prompts, usa il primo come fallback nel campo principale
        imagePrompt: aiResult.image_prompts?.[0] && !prev.imagePrompt
          ? aiResult.image_prompts[0]
          : prev.imagePrompt,
      }));
      const cost = aiResult.cost_eur_cents
        ? ` (costo ${(aiResult.cost_eur_cents / 100).toFixed(3)}€)`
        : "";
      toast.success(`${aiResult.copy_variants.length} copy AI generati${cost}`, {
        description: aiResult.warnings && aiResult.warnings.length > 0
          ? `Attenzione: ${aiResult.warnings[0]}`
          : "Modificali prima di salvare la bozza.",
      });
    } else {
      // Fallback template locale (AI non disponibile o errore già notificato da hook)
      setState((prev) => ({ ...prev, copyVariants: buildCopyVariants(prev) }));
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Rocket className="h-5 w-5 text-orange-600" />
                Nuova campagna guidata
              </CardTitle>
              <CardDescription>
                Semplice per l'imprenditore, solida per Meta: offerta, pubblico, modulo lead, creatività e controllo prima del lancio.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Chiudi
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ReadinessBanner readiness={readiness} />

          <div className="mb-6 grid gap-2 sm:grid-cols-5">
            {["Offerta", "Pubblico", "Modulo", "Creatività", "Revisione"].map((label, index) => {
              const current = index + 1;
              const active = current === step;
              const done = current < step && stepValidity[current];
              const reachable = canJumpTo(current);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && setStep(current)}
                  title={!reachable ? "Completa prima gli step precedenti" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-orange-300 bg-orange-50"
                      : done
                      ? "border-emerald-200 bg-emerald-50"
                      : reachable
                      ? "border-slate-200 bg-white hover:border-slate-300"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      active
                        ? "bg-orange-500 text-white"
                        : done
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : current}
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              {/* PLATFORM SELECTOR — prima scelta del wizard */}
              <PlatformSelector
                value={state.platform}
                googleChannel={state.googleChannel}
                onChange={(p, channel) => {
                  setState((prev) => ({
                    ...prev,
                    platform: p,
                    googleChannel: channel,
                  }));
                }}
              />
              <TemplateSelector selectedId={state.templateId} onSelect={applyTemplate} />
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-700" />
                <AlertTitle>Parti dalla promessa, non dal pulsante della piattaforma</AlertTitle>
                <AlertDescription>
                  Una campagna lead funziona quando budget, pubblico e modulo sono coerenti con un'offerta chiara: preventivo, sopralluogo, guida o consulenza.
                </AlertDescription>
              </Alert>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome campagna">
                  <Input value={state.name} onChange={(event) => update("name", event.target.value)} placeholder="Es. Serramenti - Lead Milano" />
                </Field>
                <Field label="Cosa vuoi ottenere?">
                  <Select value={state.objective} onValueChange={(value) => update("objective", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OUTCOME_LEADS">Richieste preventivo</SelectItem>
                      <SelectItem value="OUTCOME_TRAFFIC">Visite al sito</SelectItem>
                      <SelectItem value="OUTCOME_AWARENESS">Farti conoscere</SelectItem>
                      <SelectItem value="OUTCOME_ENGAGEMENT">Messaggi e interazioni</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Offerta / motivo per lasciare il contatto">
                <Textarea
                  value={state.offer}
                  onChange={(event) => update("offer", event.target.value)}
                  className="min-h-20"
                  placeholder="Es. sopralluogo gratuito, preventivo entro 48h, guida detrazioni, consulenza tecnica..."
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Come vuoi ricevere i contatti?">
                  <Select value={state.conversionPlace} onValueChange={(value: BuilderState["conversionPlace"]) => update("conversionPlace", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant_form">Modulo Meta nativo - più fluido da mobile</SelectItem>
                      <SelectItem value="landing_page">Landing page - più contesto e qualità</SelectItem>
                      <SelectItem value="dual">Doppio luogo - lascia decidere a Meta</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Pagina / destinazione">
                  <Input value={state.landingUrl} onChange={(event) => update("landingUrl", event.target.value)} placeholder="https://..." />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Come gestire il budget">
                  <Select value={state.budgetMode} onValueChange={(value: BuilderState["budgetMode"]) => update("budgetMode", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adset">Budget per pubblico (consigliato)</SelectItem>
                      <SelectItem value="campaign">Budget unico campagna</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Budget giornaliero">
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={5}
                      max={500}
                      value={state.dailyBudget}
                      onChange={(event) => {
                        const dailyBudget = Number(event.target.value || 0);
                        setState((prev) => {
                          const next = { ...prev, dailyBudget };
                          return { ...next, adSets: buildDefaultAdSets(next) };
                        });
                      }}
                    />
                    <span className="whitespace-nowrap text-sm text-slate-500">euro/giorno</span>
                  </div>
                </Field>
              </div>
              {overApprovalLimit && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <AlertTitle>Serve approvazione titolare</AlertTitle>
                  <AlertDescription>
                    Sopra 30 euro/giorno la campagna rimane in bozza/PAUSED finché il titolare non conferma il lancio.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <GuidanceCard title="Locale prima" body="Per edilizia e serramenti parti da città/provincia e raggio realistico, poi allarghi solo se i lead diventano opportunità." />
                <GuidanceCard title="Non stringere troppo" body="Interessi utili sì, ma troppi vincoli riducono il bacino e impediscono all'algoritmo di imparare." />
                <GuidanceCard title="Usa dati reali" body="Clienti già chiusi, lead buoni e visitatori sito alimentano retargeting e lookalike." />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Zona principale">
                  <Input
                    value={state.zone}
                    onChange={(event) => {
                      const zone = event.target.value;
                      setState((prev) => ({
                        ...prev,
                        zone,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, zone })),
                      }));
                    }}
                  />
                </Field>
                <Field label="Raggio km">
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    value={state.radiusKm}
                    onChange={(event) => {
                      const radiusKm = Number(event.target.value || 0);
                      setState((prev) => ({
                        ...prev,
                        radiusKm,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, radiusKm })),
                      }));
                    }}
                  />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Eta minima">
                  <Input
                    type="number"
                    min={18}
                    max={65}
                    value={state.ageMin}
                    onChange={(event) => {
                      const ageMin = Number(event.target.value || 0);
                      setState((prev) => ({
                        ...prev,
                        ageMin,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, ageRange: `${ageMin}-${prev.ageMax}` })),
                      }));
                    }}
                  />
                </Field>
                <Field label="Eta massima">
                  <Input
                    type="number"
                    min={18}
                    max={65}
                    value={state.ageMax}
                    onChange={(event) => {
                      const ageMax = Number(event.target.value || 0);
                      setState((prev) => ({
                        ...prev,
                        ageMax,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, ageRange: `${prev.ageMin}-${ageMax}` })),
                      }));
                    }}
                  />
                </Field>
                <Field label="Genere">
                  <Select
                    value={state.gender}
                    onValueChange={(value: GenderTarget) => {
                      setState((prev) => ({
                        ...prev,
                        gender: value,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, gender: value })),
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      <SelectItem value="men">Uomini</SelectItem>
                      <SelectItem value="women">Donne</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Lingua">
                  <Input
                    value={state.languages}
                    onChange={(event) => {
                      const languages = event.target.value;
                      setState((prev) => ({
                        ...prev,
                        languages,
                        adSets: prev.adSets.map((adSet) => ({ ...adSet, languages })),
                      }));
                    }}
                    placeholder="Italiano"
                  />
                </Field>
              </div>
              <AudienceControlsPanel state={state} setState={setState} />
              <Field label="Interessi e segnali">
                <Textarea
                  value={state.interests}
                  onChange={(event) => {
                    const interests = event.target.value;
                    setState((prev) => ({
                      ...prev,
                      interests,
                      adSets: prev.adSets.map((adSet, index) => (index === 0 ? { ...adSet, audience: interests } : adSet)),
                    }));
                  }}
                  className="min-h-24"
                />
              </Field>
              <AdSetPlanner
                adSets={state.adSets}
                totalBudget={totalDailyBudget}
                onAdd={addAdSet}
                onRemove={removeAdSet}
                onUpdate={updateAdSet}
              />
              <button
                type="button"
                onClick={() => update("advantageAudience", !state.advantageAudience)}
                className={cn("flex w-full items-center justify-between rounded-xl border p-4 text-left", state.advantageAudience ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white")}
              >
                <div>
                  <p className="font-semibold text-slate-950">Advantage+ audience</p>
                  <p className="text-sm text-slate-600">Consenti a Meta di espandere il pubblico quando trova utenti simili.</p>
                </div>
                <Badge variant="outline" className={state.advantageAudience ? "border-blue-200 bg-white text-blue-700" : "border-slate-200 text-slate-500"}>
                  {state.advantageAudience ? "Attivo" : "Disattivo"}
                </Badge>
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <Alert className="border-emerald-200 bg-emerald-50">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <AlertTitle>Qui si decide la qualità del lead</AlertTitle>
                <AlertDescription>
                  Pochi campi riducono l'attrito, ma una domanda di qualificazione evita di riempire il CRM di contatti non lavorabili.
                </AlertDescription>
              </Alert>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tipo modulo">
                  <Select value={state.formIntent} onValueChange={(value: BuilderState["formIntent"]) => update("formIntent", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="higher_intent">Maggiore intenzione - revisione prima dell'invio</SelectItem>
                      <SelectItem value="volume">Più volume - meno passaggi</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Privacy URL">
                  <Input value={state.privacyUrl} onChange={(event) => update("privacyUrl", event.target.value)} placeholder="https://..." />
                </Field>
              </div>
              <Field label="Campi del modulo">
                <Textarea value={state.requiredFields} onChange={(event) => update("requiredFields", event.target.value)} className="min-h-20" />
              </Field>
              <Field label="Domanda di qualificazione">
                <Input value={state.qualityQuestion} onChange={(event) => update("qualityQuestion", event.target.value)} />
              </Field>
              <Field label="Follow-up automatico dopo il lead">
                <Textarea value={state.followUp} onChange={(event) => update("followUp", event.target.value)} className="min-h-20" />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <Field label="Brief per AI copy">
                <Textarea value={state.copyBrief} onChange={(event) => update("copyBrief", event.target.value)} className="min-h-24" />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">5 varianti copy</p>
                  <p className="text-xs text-slate-500">Ogni variante diventerà un annuncio separato nello stesso pubblico.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={regenerateCopy}
                  disabled={isGeneratingCopy}
                >
                  {isGeneratingCopy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isGeneratingCopy ? "Generazione..." : "Rigenera con AI"}
                </Button>
              </div>
              <div className="grid gap-3">
                {state.copyVariants.map((copy, index) => (
                  <Field key={index} label={`Copy ${index + 1}`}>
                    <Textarea
                      value={copy}
                      onChange={(event) => {
                        const next = [...state.copyVariants];
                        next[index] = event.target.value;
                        update("copyVariants", next);
                      }}
                      className="min-h-20"
                    />
                  </Field>
                ))}
              </div>
              <CreativeMixPlanner
                creatives={state.creatives}
                onAdd={addCreative}
                onRemove={removeCreative}
                onUpdate={updateCreative}
              />
              <Field label="Prompt immagine/video">
                <Textarea value={state.imagePrompt} onChange={(event) => update("imagePrompt", event.target.value)} className="min-h-24" />
              </Field>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-700" />
                <AlertTitle>Controllo prima del lancio</AlertTitle>
                <AlertDescription>
                  Salviamo una bozza locale pronta per review. In produzione gli oggetti Meta nasceranno in PAUSED e andranno attivati solo dopo i test.
                </AlertDescription>
              </Alert>
              <PerformanceRulesPanel state={state} setState={setState} />
              <div className="rounded-xl border bg-white p-4">
                <CampaignTree state={state} />
              </div>
              <LaunchChecklist readiness={readiness} />
              <div className="grid gap-3 md:grid-cols-3">
                <MiniStat label="Budget/giorno" value={formatEuro(dailyBudgetCents)} />
                <MiniStat label="Gruppi pubblico" value={String(state.adSets.length)} />
                <MiniStat label="Creatività" value={`${state.creatives.length} formati`} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((prev) => Math.max(1, prev - 1))}>
              Indietro
            </Button>
            <div className="flex-1" />
            {step < 5 ? (
              <Button disabled={!isStepValid} onClick={() => setStep((prev) => Math.min(5, prev + 1))}>
                Continua
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => onSaveDraft(state)} disabled={readiness.score < 40}>
                {isEditing ? "Salva modifiche" : "Salva bozza locale"}
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-5">
        <CardHeader>
          <CardTitle className="text-lg">Anteprima esperienza cliente</CardTitle>
          <CardDescription>Annuncio e modulo lead visti con gli occhi di chi deve chiedere un preventivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Prontezza lancio</p>
              <Badge variant="outline" className={readiness.score >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                {readiness.score}/100
              </Badge>
            </div>
            <Progress value={readiness.score} className="h-2 bg-white" indicatorClassName={readiness.score >= 80 ? "bg-emerald-600" : "bg-orange-500"} />
            <p className="mt-2 text-xs text-slate-500">
              {readiness.passed}/{readiness.total} controlli superati prima della pubblicazione.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {(companyName ?? "Azienda").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{companyName ?? "La tua azienda"}</p>
                <p className="text-xs text-slate-500">Sponsorizzato</p>
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm leading-relaxed text-slate-900">{state.copyVariants[0]}</p>
            </div>
            <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-slate-800 to-orange-500 text-white">
              <div className="text-center">
                <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm font-semibold">Creatività AI</p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs text-white/75">{state.imagePrompt}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t p-3">
              <div>
                <p className="text-sm font-semibold">{state.name}</p>
                <p className="text-xs text-slate-500">{objectiveLabel(state.objective)}</p>
              </div>
              <Button size="sm" variant="secondary">Richiedi preventivo</Button>
            </div>
          </div>
          <CampaignStructurePreview state={state} />
          <LeadFormPreview state={state} />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessBanner({ readiness }: { readiness: ReturnType<typeof getReadinessScore> }) {
  const missing = readiness.items.filter((item) => !item.ok);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? missing : missing.slice(0, 2);

  return (
    <div className="mb-5 rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Semaforo pre-lancio</p>
          <p className="text-sm text-slate-600">
            {readiness.score >= 80
              ? "La campagna è pronta per una revisione finale prima del live."
              : `${missing.length} controll${missing.length === 1 ? "o" : "i"} ancora da sistemare prima di pubblicare o aumentare il budget.`}
          </p>
        </div>
        <div className="min-w-[220px]">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Prontezza</span>
            <span className="font-bold text-slate-950">{readiness.score}/100</span>
          </div>
          <Progress
            value={readiness.score}
            className="h-2 bg-slate-100"
            indicatorClassName={readiness.score >= 80 ? "bg-emerald-600" : "bg-orange-500"}
          />
        </div>
      </div>
      {missing.length > 0 && (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {visible.map((item) => (
              <div key={item.title} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">{item.title}</p>
                <p className="text-xs leading-relaxed text-amber-800">{item.fix}</p>
              </div>
            ))}
          </div>
          {missing.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostra meno" : `Mostra altri ${missing.length - 2} controlli da sistemare`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function TemplateSelector({ selectedId, onSelect }: { selectedId: string; onSelect: (template: CampaignTemplate) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-950">Parti da un modello edile</p>
        <p className="text-xs text-slate-500">Scegli il settore: il sistema prepara offerta, modulo, pubblico e prompt creativi.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CAMPAIGN_TEMPLATES.map((template) => {
          const selected = selectedId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={cn(
                "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
                selected ? "border-orange-300 bg-orange-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{template.title}</p>
                  <p className="text-xs text-slate-500">{template.segment}</p>
                </div>
                {selected && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{template.bestFor}</p>
              <p className="mt-3 rounded-lg bg-white/70 p-2 text-xs font-medium text-slate-700">{template.budgetHint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PlatformSelector — sceglie tra Meta (Facebook/Instagram) e Google Ads.
 *
 * Meta è l'opzione predefinita (più semplice per imprese edili locali).
 * Google ha sotto-selector di canale (SEARCH/DISPLAY/VIDEO/PMAX).
 */
function PlatformSelector({
  value,
  googleChannel,
  onChange,
}: {
  value: "meta" | "google";
  googleChannel?: "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX";
  onChange: (
    platform: "meta" | "google",
    googleChannel?: "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX",
  ) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-950">Su quale piattaforma vuoi pubblicare?</p>
        <p className="text-xs text-slate-500">
          Inizia da Meta per lead locali. Google Ads quando hai brand riconoscibile o servizi cercati esplicitamente.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("meta")}
          className={cn(
            "rounded-2xl border p-4 text-left transition",
            value === "meta"
              ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200"
              : "border-slate-200 bg-white hover:border-slate-300",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Meta Ads</p>
                <p className="text-[11px] text-slate-500">Facebook + Instagram</p>
              </div>
            </div>
            {value === "meta" && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Lead form nativo, targeting per zona/interesse. Ideale per nuovi clienti che ancora non ti conoscono.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" className="border-blue-200 bg-white text-[10px] text-blue-700">
              Pronto
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-white text-[10px] text-emerald-700">
              AI completo
            </Badge>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange("google", googleChannel ?? "SEARCH")}
          className={cn(
            "rounded-2xl border p-4 text-left transition",
            value === "google"
              ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200"
              : "border-slate-200 bg-white hover:border-slate-300",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Google Ads</p>
                <p className="text-[11px] text-slate-500">Search · Display · YouTube · PMax</p>
              </div>
            </div>
            {value === "google" && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Cattura chi cerca attivamente "ristrutturazione bagno Milano". Intent alto, costi più variabili.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" className="border-amber-200 bg-white text-[10px] text-amber-700">
              Beta limitata
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-500">
              OAuth da configurare
            </Badge>
          </div>
        </button>
      </div>

      {/* Sotto-selector canale per Google */}
      {value === "google" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-amber-800">Canale Google Ads</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { v: "SEARCH" as const, label: "Search", desc: "Annunci testuali in alto su Google" },
                { v: "DISPLAY" as const, label: "Display", desc: "Banner su siti partner GDN" },
                { v: "VIDEO" as const, label: "Video", desc: "YouTube preroll e in-feed" },
                { v: "PERFORMANCE_MAX" as const, label: "PMax", desc: "AI-driven multi-canale" },
              ]
            ).map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => onChange("google", c.v)}
                className={cn(
                  "rounded-lg border p-2 text-left",
                  googleChannel === c.v
                    ? "border-amber-400 bg-white shadow-sm"
                    : "border-slate-200 bg-white/60 hover:bg-white",
                )}
              >
                <p className="text-sm font-semibold text-slate-950">{c.label}</p>
                <p className="text-[10px] leading-tight text-slate-500">{c.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
            <strong>Nota beta:</strong> Google Ads richiede OAuth + Developer Token Google (approval 1-3gg). Per ora le bozze restano locali — la pubblicazione live arriverà in iterazione successiva.
          </p>
        </div>
      )}
    </div>
  );
}

function LeadFormPreview({ state }: { state: BuilderState }) {
  const fields = splitList(state.requiredFields);
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Modulo lead</p>
          <p className="text-xs text-slate-500">
            {state.formIntent === "higher_intent" ? "Con revisione prima dell'invio" : "Veloce, meno passaggi"}
          </p>
        </div>
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
          {conversionPlaceLabel(state.conversionPlace)}
        </Badge>
      </div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{state.offer}</p>
      <div className="mt-3 grid gap-2">
        {fields.slice(0, 6).map((field) => (
          <div key={field} className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            {field}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs font-semibold uppercase text-emerald-700">Domanda qualità</p>
        <p className="mt-1 text-sm text-emerald-900">{state.qualityQuestion}</p>
      </div>
      <div className="mt-3 rounded-xl border bg-white p-3">
        <p className="text-xs font-semibold uppercase text-slate-500">Follow-up</p>
        <p className="mt-1 text-sm text-slate-700">{state.followUp}</p>
      </div>
    </div>
  );
}

function CampaignStructurePreview({ state }: { state: BuilderState }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">Struttura test</p>
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
          {state.adSets.length} gruppi · {state.creatives.length} creatività
        </Badge>
      </div>
      <div className="space-y-2">
        {state.adSets.slice(0, 3).map((adSet) => (
          <div key={adSet.id} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-950">{adSet.name}</p>
                <p className="text-xs text-slate-500">{adSet.angle}</p>
              </div>
              <span className="whitespace-nowrap text-xs font-semibold text-slate-700">{formatEuro(adSet.dailyBudget * 100)}/g</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {state.creatives.map((creative) => (
          <Badge key={creative.id} variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
            {creativeFormatLabel(creative.format)}
          </Badge>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase text-slate-500">Matrice controllata</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">
          {getAdMatrixSize(state)} ads potenziali · {formatEuro(Math.round(getBudgetPerAd(state) * 100))}/giorno per ad
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Se il budget per ad è troppo basso, riduci creatività o pubblici prima di scalare.
        </p>
      </div>
    </div>
  );
}

function PerformanceRulesPanel({
  state,
  setState,
}: {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Performance max: regole prima del budget</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Il sistema deve decidere con numeri semplici: costo lead, qualità opportunità e tempo di risposta commerciale.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
          Anti-spreco attivo
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="CPL target">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={state.targetCpl}
              onChange={(event) => updateBuilderState(setState, "targetCpl", Number(event.target.value || 0))}
            />
            <span className="text-sm text-slate-500">euro</span>
          </div>
        </Field>
        <Field label="Tasso opportunità target">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={state.targetOpportunityRate}
              onChange={(event) => updateBuilderState(setState, "targetOpportunityRate", Number(event.target.value || 0))}
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </Field>
        <Field label="Durata test minimo">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={3}
              max={14}
              value={state.testDurationDays}
              onChange={(event) => updateBuilderState(setState, "testDurationDays", Number(event.target.value || 0))}
            />
            <span className="text-sm text-slate-500">giorni</span>
          </div>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Regola pausa">
          <Textarea value={state.pauseRule} onChange={(event) => updateBuilderState(setState, "pauseRule", event.target.value)} className="min-h-20" />
        </Field>
        <Field label="Regola scaling">
          <Textarea value={state.scaleRule} onChange={(event) => updateBuilderState(setState, "scaleRule", event.target.value)} className="min-h-20" />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function GuidanceCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

function AudienceControlsPanel({
  state,
  setState,
}: {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
}) {
  const addInterest = (signal: string) => {
    setState((prev) => {
      const current = splitList(prev.interests);
      if (current.map((item) => item.toLowerCase()).includes(signal.toLowerCase())) return prev;
      const interests = [...current, signal].join(", ");
      return {
        ...prev,
        interests,
        adSets: prev.adSets.map((adSet, index) => (index === 0 ? { ...adSet, audience: interests } : adSet)),
      };
    });
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Controlli pubblico Meta</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Località, età e lingua restano controlli rigidi. Gli interessi sono segnali: se Advantage+ è attivo, Meta può espandere oltre i suggerimenti quando trova lead migliori.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
          {state.advantageAudience ? "Advantage+ attivo" : "Pubblico stretto"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Escludi zone non lavorabili">
          <Textarea
            value={state.excludedLocations}
            onChange={(event) => updateBuilderState(setState, "excludedLocations", event.target.value)}
            className="min-h-20"
            placeholder="Comuni lontani, zone dove non fai sopralluoghi, aree a basso margine..."
          />
        </Field>
        <Field label="Sorgenti retargeting">
          <Textarea
            value={state.customAudienceSource}
            onChange={(event) => updateBuilderState(setState, "customAudienceSource", event.target.value)}
            className="min-h-20"
            placeholder="Visitatori sito, video viewers, engagement Instagram, lead CRM..."
          />
        </Field>
        <Field label="Base lookalike">
          <Textarea
            value={state.lookalikeSource}
            onChange={(event) => updateBuilderState(setState, "lookalikeSource", event.target.value)}
            className="min-h-20"
            placeholder="Clienti migliori, commesse chiuse, preventivi accettati..."
          />
        </Field>
        <Field label="Ampiezza lookalike">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={10}
              value={state.lookalikePercent}
              onChange={(event) => updateBuilderState(setState, "lookalikePercent", Number(event.target.value || 1))}
            />
            <span className="whitespace-nowrap text-sm text-slate-500">% simili</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            1-2% è più simile ai clienti migliori; 5-10% scala di più ma perde precisione.
          </p>
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Segnali rapidi per edilizia</p>
        <div className="flex flex-wrap gap-2">
          {[
            "ristrutturazione casa",
            "prima casa",
            "risparmio energetico",
            "detrazioni fiscali",
            "arredo bagno",
            "infissi",
            "fotovoltaico",
            "mutuo casa",
            "interior design",
          ].map((signal) => (
            <Button key={signal} type="button" size="sm" variant="outline" onClick={() => addInterest(signal)}>
              <Plus className="h-3.5 w-3.5" />
              {signal}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function updateBuilderState<K extends keyof BuilderState>(
  setState: React.Dispatch<React.SetStateAction<BuilderState>>,
  key: K,
  value: BuilderState[K],
) {
  setState((prev) => ({ ...prev, [key]: value }));
}

function AdSetPlanner({
  adSets,
  totalBudget,
  onAdd,
  onRemove,
  onUpdate,
}: {
  adSets: CampaignAdSet[];
  totalBudget: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: <K extends keyof CampaignAdSet>(id: string, key: K, value: CampaignAdSet[K]) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Gruppi pubblico / Ad Set</p>
          <p className="text-xs text-slate-500">
            Una campagna può testare più pubblici: freddo locale, retargeting, lookalike, urgenza o zona diversa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
            Totale {formatEuro(totalBudget * 100)}/giorno
          </Badge>
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Aggiungi pubblico
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        {adSets.map((adSet, index) => (
          <div key={adSet.id} className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-700">
                Gruppo {index + 1}
              </Badge>
              <Button type="button" size="sm" variant="ghost" disabled={adSets.length <= 1} onClick={() => onRemove(adSet.id)}>
                Rimuovi
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome gruppo">
                <Input value={adSet.name} onChange={(event) => onUpdate(adSet.id, "name", event.target.value)} />
              </Field>
              <Field label="Angolo di test">
                <Input value={adSet.angle} onChange={(event) => onUpdate(adSet.id, "angle", event.target.value)} />
              </Field>
              <Field label="Strategia pubblico">
                <Select value={adSet.audienceStrategy} onValueChange={(value: AudienceStrategy) => onUpdate(adSet.id, "audienceStrategy", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advantage_plus">Advantage+ suggerito</SelectItem>
                    <SelectItem value="manual">Manuale controllato</SelectItem>
                    <SelectItem value="retargeting">Retargeting</SelectItem>
                    <SelectItem value="lookalike">Lookalike</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Zona">
                <Input value={adSet.zone} onChange={(event) => onUpdate(adSet.id, "zone", event.target.value)} />
              </Field>
              <Field label="Budget gruppo">
                <div className="flex items-center gap-3">
                  <Input type="number" min={5} max={500} value={adSet.dailyBudget} onChange={(event) => onUpdate(adSet.id, "dailyBudget", Number(event.target.value || 0))} />
                  <span className="whitespace-nowrap text-sm text-slate-500">euro/giorno</span>
                </div>
              </Field>
              <Field label="Limite automatico min/max">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min={1} value={adSet.minDailyBudget} onChange={(event) => onUpdate(adSet.id, "minDailyBudget", Number(event.target.value || 0))} />
                  <Input type="number" min={1} value={adSet.maxDailyBudget} onChange={(event) => onUpdate(adSet.id, "maxDailyBudget", Number(event.target.value || 0))} />
                </div>
              </Field>
              <Field label="Raggio km">
                <Input type="number" min={1} max={100} value={adSet.radiusKm} onChange={(event) => onUpdate(adSet.id, "radiusKm", Number(event.target.value || 0))} />
              </Field>
              <Field label="Età">
                <Input value={adSet.ageRange} onChange={(event) => onUpdate(adSet.id, "ageRange", event.target.value)} placeholder="Es. 28-65" />
              </Field>
              <Field label="Genere">
                <Select value={adSet.gender} onValueChange={(value: GenderTarget) => onUpdate(adSet.id, "gender", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="men">Uomini</SelectItem>
                    <SelectItem value="women">Donne</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Evento ottimizzazione">
                <Select value={adSet.optimizationEvent} onValueChange={(value: CampaignAdSet["optimizationEvent"]) => onUpdate(adSet.id, "optimizationEvent", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified_lead">Lead qualificato</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="message">Messaggio</SelectItem>
                    <SelectItem value="landing_page_view">Visita landing</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lingue">
                <Input value={adSet.languages} onChange={(event) => onUpdate(adSet.id, "languages", event.target.value)} placeholder="Italiano" />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Segnali pubblico">
                <Textarea value={adSet.audience} onChange={(event) => onUpdate(adSet.id, "audience", event.target.value)} className="min-h-20" />
              </Field>
              <Field label="Esclusioni pubblico">
                <Textarea value={adSet.excludedAudiences} onChange={(event) => onUpdate(adSet.id, "excludedAudiences", event.target.value)} className="min-h-20" />
              </Field>
              <Field label="Posizionamenti">
                <Textarea value={adSet.placementStrategy} onChange={(event) => onUpdate(adSet.id, "placementStrategy", event.target.value)} className="min-h-20" />
              </Field>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase text-blue-700">Sintesi Meta</p>
                <p className="mt-1 text-sm text-blue-950">
                  {audienceStrategyLabel(adSet.audienceStrategy)} · {genderLabel(adSet.gender)} · {optimizationEventLabel(adSet.optimizationEvent)}
                </p>
                <p className="mt-1 text-xs text-blue-800">
                  Mantieni almeno 3-5 giorni di test prima di giudicare, salvo errori evidenti su qualità lead.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function creativeFormatLabel(format: CreativeFormat) {
  const labels: Record<CreativeFormat, string> = {
    image: "Immagine",
    video: "Video",
    carousel: "Carosello",
    story: "Story/Reel",
  };
  return labels[format];
}

function CreativeMixPlanner({
  creatives,
  onAdd,
  onRemove,
  onUpdate,
}: {
  creatives: CampaignCreative[];
  onAdd: (format: CreativeFormat) => void;
  onRemove: (id: string) => void;
  onUpdate: <K extends keyof CampaignCreative>(id: string, key: K, value: CampaignCreative[K]) => void;
}) {
  const formats: CreativeFormat[] = ["image", "video", "carousel", "story"];
  return (
    <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Mix creatività</p>
          <p className="text-xs text-slate-500">
            Non testare solo una foto: prepara formati diversi per capire cosa genera lead qualificati.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {formats.map((format) => (
            <Button key={format} type="button" size="sm" variant="outline" onClick={() => onAdd(format)}>
              <Plus className="h-4 w-4" />
              {creativeFormatLabel(format)}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        {creatives.map((creative) => (
          <div key={creative.id} className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
                {creativeFormatLabel(creative.format)}
              </Badge>
              <Button type="button" size="sm" variant="ghost" disabled={creatives.length <= 1} onClick={() => onRemove(creative.id)}>
                Rimuovi
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome creatività">
                <Input value={creative.title} onChange={(event) => onUpdate(creative.id, "title", event.target.value)} />
              </Field>
              <Field label="Hook">
                <Input value={creative.hook} onChange={(event) => onUpdate(creative.id, "hook", event.target.value)} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Obiettivo del test">
                <Textarea value={creative.goal} onChange={(event) => onUpdate(creative.id, "goal", event.target.value)} className="min-h-20" />
              </Field>
              <Field label="Prompt operativo">
                <Textarea value={creative.prompt} onChange={(event) => onUpdate(creative.id, "prompt", event.target.value)} className="min-h-20" />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function conversionPlaceLabel(place: BuilderState["conversionPlace"]) {
  const labels: Record<BuilderState["conversionPlace"], string> = {
    instant_form: "Modulo Meta nativo",
    landing_page: "Landing page",
    dual: "Doppio luogo di conversione",
  };
  return labels[place];
}

/**
 * LaunchChecklist — mostra i controlli pre-lancio in modo gerarchico:
 *   • In testa: i problemi da risolvere (espansi, visibili)
 *   • Sotto: i controlli OK (compatti, collassabili)
 *
 * Evita il "muro di 14 card" che rendeva difficile vedere cosa va sistemato.
 */
function LaunchChecklist({ readiness }: { readiness: ReturnType<typeof getReadinessScore> }) {
  const missing = readiness.items.filter((i) => !i.ok);
  const passed = readiness.items.filter((i) => i.ok);
  const [showPassed, setShowPassed] = useState(false);

  return (
    <div className="space-y-4">
      {/* PROBLEMI DA SISTEMARE — sempre espansi se ce ne sono */}
      {missing.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-900">
              {missing.length} controll{missing.length === 1 ? "o" : "i"} da sistemare
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {missing.map((item) => (
              <div key={item.title} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="text-xs leading-relaxed text-slate-600">{item.fix}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-900">
              Tutti i {readiness.total} controlli superati — pronto per il lancio
            </p>
          </div>
        </div>
      )}

      {/* CONTROLLI OK — collassati di default */}
      {passed.length > 0 && (
        <div className="rounded-xl border bg-slate-50/50">
          <button
            type="button"
            onClick={() => setShowPassed(!showPassed)}
            className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-100/60"
          >
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-700">
                {passed.length} controll{passed.length === 1 ? "o" : "i"} già OK
              </p>
            </div>
            <ChevronRight
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform",
                showPassed && "rotate-90",
              )}
            />
          </button>
          {showPassed && (
            <div className="grid gap-2 border-t bg-white p-3 md:grid-cols-2">
              {passed.map((item) => (
                <div key={item.title} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <p className="truncate text-xs text-slate-700">{item.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignTree({ state }: { state: BuilderState }) {
  return (
    <div className="space-y-3 text-sm">
      <TreeRow icon={Megaphone} label="Campagna" value={`${state.name} - ${objectiveLabel(state.objective)}`} />
      <TreeRow icon={Target} label="Gruppi pubblico" value={`${state.adSets.length} gruppi: ${state.adSets.map((adSet) => `${adSet.name} (${audienceStrategyLabel(adSet.audienceStrategy)}, ${formatEuro(adSet.dailyBudget * 100)}/giorno)`).join(" · ")}`} indent />
      <TreeRow icon={Users} label="Controlli rigidi" value={`${state.zone} + ${state.radiusKm} km, età ${state.ageMin}-${state.ageMax}, ${genderLabel(state.gender)}, lingua ${state.languages}`} indent />
      <TreeRow icon={MousePointerClick} label="Conversione" value={`${conversionPlaceLabel(state.conversionPlace)} - ${state.formIntent === "higher_intent" ? "maggiore intenzione" : "più volume"}`} indent />
      <TreeRow icon={ShieldCheck} label="Modulo lead" value={`${state.requiredFields}. Domanda: ${state.qualityQuestion}`} indent />
      <TreeRow icon={Euro} label="Budget" value={`${formatEuro(getCampaignDailyBudget(state) * 100)}/giorno con ${budgetModeLabel(state.budgetMode)}`} indent />
      <TreeRow icon={ImageIcon} label="Annunci e creatività" value={`${state.copyVariants.length} copy + ${state.creatives.map((creative) => creativeFormatLabel(creative.format)).join(", ")}`} indent />
      <TreeRow icon={TrendingUp} label="Regole performance" value={`CPL target ${formatEuro(state.targetCpl * 100)}, opportunità target ${state.targetOpportunityRate}%, test minimo ${state.testDurationDays} giorni`} indent />
    </div>
  );
}

function TreeRow({
  icon: Icon,
  label,
  value,
  indent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  indent?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-slate-50 p-3", indent && "ml-4")}>
      <Icon className="mt-0.5 h-4 w-4 text-orange-600" />
      <div>
        <p className="font-semibold text-slate-950">{label}</p>
        <p className="text-slate-600">{value}</p>
      </div>
    </div>
  );
}

/**
 * CreativeStudioTab — genera copy + immagini AI per Meta Ads.
 *
 * Sezioni:
 *   1. Brief + generatore copy AI (5 varianti + hook + CTA)
 *   2. Generatore immagini AI (DALL-E gpt-image-1, 4 aspect ratio)
 *   3. Libreria asset azienda (ad_media table) — riusabili nei wizard
 *
 * Tutto chiama le edge function ai-ads-copy-generate / ai-ads-image-generate.
 */
function CreativeStudioTab({ companyId }: { companyId?: string }) {
  const [brief, setBrief] = useState("Serramenti premium con sopralluogo gratuito e posa certificata");
  const [segment, setSegment] = useState("serramenti");
  const [zone, setZone] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16" | "16:9">("4:5");
  const [imageQuality, setImageQuality] = useState<"standard" | "hd">("standard");
  const [generatedCopy, setGeneratedCopy] = useState<CopyGenResult | null>(null);

  const { generateCopy, generateImage, isGeneratingCopy, isGeneratingImage } = useAdsAi(companyId);

  // Libreria asset reali da ad_media
  const { data: mediaLib = [] } = useQuery({
    queryKey: ["ad-media-library", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      try {
        const { data, error } = await (supabase as unknown as {
          from: (n: string) => {
            select: (s: string) => {
              eq: (col: string, val: string) => {
                order: (col: string, opts: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: AdMediaItem[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        })
          .from("ad_media")
          .select("id, name, public_url, thumbnail_url, kind, aspect_ratio, source, ai_prompt, tags, created_at, width_px, height_px")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(24);
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const onGenerateCopy = async () => {
    const result = await generateCopy({ brief, segment, zone, variants: 5 });
    if (result) setGeneratedCopy(result);
  };

  const onGenerateImage = async (prompt: string) => {
    const result = await generateImage({
      prompt,
      aspect_ratio: aspectRatio,
      quality: imageQuality,
      tags: [segment, aspectRatio],
    });
    if (result) {
      toast.success("Immagine generata e salvata in libreria", {
        description: `${result.width_px}×${result.height_px}px${
          result.cost_eur_cents ? ` · ${(result.cost_eur_cents / 100).toFixed(3)}€` : ""
        }`,
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* COPY GENERATOR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Genera copy AI
            </CardTitle>
            <CardDescription>
              5 varianti copy + hook + suggerimenti CTA per Meta Ads, basate sul brief.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Settore">
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="serramenti">Serramenti / Infissi</SelectItem>
                    <SelectItem value="bagni">Ristrutturazione bagni</SelectItem>
                    <SelectItem value="ristrutturazioni">Ristrutturazioni casa</SelectItem>
                    <SelectItem value="fotovoltaico">Fotovoltaico</SelectItem>
                    <SelectItem value="tetti">Tetti e facciate</SelectItem>
                    <SelectItem value="manutenzione">Manutenzioni</SelectItem>
                    <SelectItem value="generico">Generico edilizia</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Zona (opzionale)">
                <Input
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Es. Monza e Brianza"
                />
              </Field>
            </div>
            <Field label="Brief creativo">
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="min-h-24"
                placeholder="Descrivi l'offerta, il pubblico target, l'angolo di vendita..."
              />
            </Field>
            <Button onClick={onGenerateCopy} disabled={isGeneratingCopy} className="w-full">
              {isGeneratingCopy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGeneratingCopy ? "Generazione in corso..." : "Genera 5 copy con AI"}
            </Button>

            {generatedCopy && (
              <div className="space-y-3 rounded-xl border bg-slate-50/50 p-3">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Output AI {generatedCopy.model_used ? `(${generatedCopy.model_used})` : ""}
                </div>
                {generatedCopy.copy_variants.map((c, i) => (
                  <div key={i} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Copy {i + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          void navigator.clipboard?.writeText(c);
                          toast.success("Copy copiato");
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="leading-relaxed text-slate-800">{c}</p>
                  </div>
                ))}
                {generatedCopy.hooks.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Hook</p>
                    <div className="flex flex-wrap gap-1">
                      {generatedCopy.hooks.map((h, i) => (
                        <Badge key={i} variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                          {h}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {generatedCopy.image_prompts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                      Prompt immagine suggeriti
                    </p>
                    <div className="space-y-1">
                      {generatedCopy.image_prompts.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onGenerateImage(p)}
                          disabled={isGeneratingImage}
                          className="w-full rounded-lg border bg-white p-2 text-left text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          <span className="mr-1 font-semibold text-orange-600">Genera →</span>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {generatedCopy.warnings.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <AlertTitle>Attenzione compliance</AlertTitle>
                    <AlertDescription className="text-xs">
                      {generatedCopy.warnings.join(" · ")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* IMAGE GENERATOR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImageIcon className="h-5 w-5 text-orange-600" />
              Genera immagine AI
            </CardTitle>
            <CardDescription>
              DALL-E (gpt-image-1) — l'immagine viene salvata in libreria e riutilizzabile nelle bozze.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Formato">
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1 (feed quadrato)</SelectItem>
                    <SelectItem value="4:5">4:5 (feed verticale — consigliato)</SelectItem>
                    <SelectItem value="9:16">9:16 (story/reel)</SelectItem>
                    <SelectItem value="16:9">16:9 (orizzontale)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Qualità">
                <Select value={imageQuality} onValueChange={(v) => setImageQuality(v as typeof imageQuality)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (~0.04€)</SelectItem>
                    <SelectItem value="hd">HD (~0.07€)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Prompt immagine">
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="min-h-24"
                placeholder="Descrivi cosa vuoi vedere: contesto, soggetto, atmosfera, palette..."
              />
            </Field>
            <Button
              onClick={() => onGenerateImage(brief)}
              disabled={isGeneratingImage}
              className="w-full"
            >
              {isGeneratingImage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {isGeneratingImage ? "Generazione immagine..." : "Genera immagine"}
            </Button>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Le immagini vengono salvate automaticamente in <strong>Libreria asset</strong> e riutilizzabili nei wizard delle campagne.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* LIBRERIA ASSET REALI (ad_media) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Libreria asset</CardTitle>
              <CardDescription>
                Immagini generate AI o caricate. {mediaLib.length} totali.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {mediaLib.filter((m) => m.source === "ai_generated").length} AI · {mediaLib.filter((m) => m.source === "upload").length} upload
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {mediaLib.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center">
              <ImageIcon className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Libreria vuota</p>
              <p className="mt-1 text-xs text-slate-500">
                Genera un'immagine AI sopra o aspetta che la migration sia applicata.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {mediaLib.map((m) => (
                <div key={m.id} className="overflow-hidden rounded-xl border bg-white">
                  <div className="aspect-square bg-slate-100">
                    {m.public_url ? (
                      <img
                        src={m.public_url}
                        alt={m.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-semibold text-slate-900">{m.name}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px]",
                          m.source === "ai_generated"
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        {m.source === "ai_generated" ? "AI" : "Upload"}
                      </Badge>
                      {m.aspect_ratio && (
                        <Badge variant="outline" className="text-[9px] text-slate-500">
                          {m.aspect_ratio}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface AdMediaItem {
  id: string;
  name: string;
  public_url: string | null;
  thumbnail_url: string | null;
  kind: string;
  aspect_ratio: string | null;
  source: string;
  ai_prompt: string | null;
  tags: string[];
  created_at: string;
  width_px: number | null;
  height_px: number | null;
}

type CopyGenResult = {
  copy_variants: string[];
  hooks: string[];
  cta_suggestions: string[];
  image_prompts: string[];
  warnings: string[];
  model_used?: string;
  cost_eur_cents?: number;
};

function AudiencesTab({ onUseInWizard }: { onUseInWizard?: () => void }) {
  const audiences = [
    {
      name: "Freddo locale Advantage+",
      strategy: "advantage_plus" as const,
      zone: "Provincia + 20/30 km",
      age: "28-65",
      signals: "Ristrutturazione casa, infissi, bagno, detrazioni, risparmio energetico",
      excludes: "clienti chiusi, lead duplicati, aree fuori raggio",
      use: "Primo test per far imparare l'algoritmo senza stringere troppo.",
    },
    {
      name: "Manuale alta intenzione",
      strategy: "manual" as const,
      zone: "Raggio sopralluoghi",
      age: "35-65",
      signals: "Mutuo, nuova casa, interior design, arredo bagno, fotovoltaico",
      excludes: "studenti, affittuari se non target, comuni non serviti",
      use: "Quando vuoi più controllo su interessi e fascia cliente.",
    },
    {
      name: "Retargeting caldo",
      strategy: "retargeting" as const,
      zone: "Stessa zona operativa",
      age: "18-65",
      signals: "Visitatori sito, video viewers, engagement pagina, lead aperti CRM",
      excludes: "commesse vinte, preventivi già accettati, spam",
      use: "Per recuperare chi ti conosce già e spingere prova sociale.",
    },
    {
      name: "Lookalike clienti migliori",
      strategy: "lookalike" as const,
      zone: "Provincia/regione",
      age: "25-65",
      signals: "Clienti chiusi con margine buono, commesse sopra media, preventivi accettati",
      excludes: "clienti esistenti e lead recenti",
      use: "Per scalare quando hai dati storici puliti e margini misurati.",
    },
  ];
  return (
    <div className="space-y-5">
      <Card className="border-blue-100 bg-blue-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Libreria pubblici edili</CardTitle>
          <CardDescription>
            Pubblici già pensati per imprese locali: uno freddo per imparare, uno controllato, uno retargeting e uno lookalike quando hai dati buoni.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {audiences.map((audience) => (
          <Card key={audience.name}>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Target className="h-5 w-5" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{audience.name}</CardTitle>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  {audienceStrategyLabel(audience.strategy)}
                </Badge>
              </div>
              <CardDescription>{audience.use}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Località" value={audience.zone} />
                <MiniStat label="Età" value={audience.age} />
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">Segnali / interessi</p>
                <p className="font-medium text-slate-950">{audience.signals}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-[11px] text-amber-700">Esclusioni consigliate</p>
                <p className="font-medium text-amber-950">{audience.excludes}</p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (onUseInWizard) {
                    onUseInWizard();
                    toast.success("Wizard aperto", {
                      description: "Apri il pannello pubblici nello step 2 per personalizzare il pubblico scelto.",
                    });
                  } else {
                    toast.info("Pubblico pronto per il prossimo wizard");
                  }
                }}
              >
                Usa nel wizard
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * CampaignDetailEditor — vista di dettaglio per una bozza locale.
 *
 * Permette di vedere e modificare velocemente:
 *  • Configurazione campagna (nome, obiettivo, offerta, budget, zona, modulo)
 *  • Ad Set (lista editable con tutti i campi)
 *  • Ads / copy + creatività
 *  • Performance (placeholder finché la pubblicazione live non è attiva)
 *
 * Per modifiche profonde (ricostruzione completa template, regenera copy AI)
 * c'è il pulsante "Modifica completa" che riapre il wizard pre-fillato.
 */
function CampaignDetailEditor({
  draft,
  companyName,
  companyId,
  onUpdate,
  onEditFull,
  onCreateVariant,
}: {
  draft: LocalCampaignDraft;
  companyName: string;
  companyId?: string;
  onUpdate: (state: BuilderState) => void;
  onEditFull: () => void;
  onCreateVariant?: (variantState: BuilderState) => Promise<void>;
}) {
  const [abTestOpen, setAbTestOpen] = useState(false);
  const baseState = draft.builderState ?? DEFAULT_BUILDER;
  const [state, setState] = useState<BuilderState>(baseState);
  const [activeTab, setActiveTab] = useState<"panoramica" | "adsets" | "ads" | "leads" | "performance">("panoramica");
  const readiness = getReadinessScore(state);
  const { generateCopy, isGeneratingCopy } = useAdsAi(companyId);
  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(baseState), [state, baseState]);

  const save = () => {
    onUpdate(state);
    toast.success("Modifiche salvate", { description: `${state.name} aggiornata.` });
  };

  const resetChanges = () => setState(baseState);

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdSet = <K extends keyof CampaignAdSet>(id: string, key: K, value: CampaignAdSet[K]) => {
    setState((prev) => ({
      ...prev,
      adSets: prev.adSets.map((adSet) => (adSet.id === id ? { ...adSet, [key]: value } : adSet)),
    }));
  };

  const addAdSet = () => {
    setState((prev) => ({
      ...prev,
      adSets: [
        ...prev.adSets,
        {
          id: `adset-${Date.now()}`,
          name: `Pubblico test ${prev.adSets.length + 1}`,
          angle: "Nuovo angolo da validare",
          audienceStrategy: prev.adSets.length >= 2 ? "lookalike" : "manual",
          zone: prev.zone,
          radiusKm: prev.radiusKm,
          dailyBudget: 8,
          minDailyBudget: 6,
          maxDailyBudget: 14,
          audience: prev.interests,
          excludedAudiences: "Clienti già chiusi, lead duplicati, pubblico non lavorabile",
          ageRange: `${prev.ageMin}-${prev.ageMax}`,
          gender: prev.gender,
          languages: prev.languages,
          optimizationEvent: "qualified_lead",
          placementStrategy: "Feed, Story e Reels con creatività coerenti",
        },
      ],
    }));
  };

  const removeAdSet = (id: string) => {
    setState((prev) => ({ ...prev, adSets: prev.adSets.filter((a) => a.id !== id) }));
  };

  const updateCreative = <K extends keyof CampaignCreative>(id: string, key: K, value: CampaignCreative[K]) => {
    setState((prev) => ({
      ...prev,
      creatives: prev.creatives.map((creative) =>
        creative.id === id ? { ...creative, [key]: value } : creative,
      ),
    }));
  };

  const addCreative = (format: CreativeFormat) => {
    const labels: Record<CreativeFormat, string> = {
      image: "Nuova immagine",
      video: "Nuovo video",
      carousel: "Nuovo carosello",
      story: "Nuova story/reel",
    };
    setState((prev) => ({
      ...prev,
      creatives: [
        ...prev.creatives,
        {
          id: `creative-${format}-${Date.now()}`,
          format,
          title: labels[format],
          hook: "Hook da testare",
          goal: "Capire se questo formato porta lead più qualificati.",
          prompt:
            format === "carousel"
              ? `Carosello per ${prev.copyBrief}: problema, errore comune, soluzione, prova, CTA.`
              : `${labels[format]} per ${prev.copyBrief}: mostra problema, risultato e invito a richiedere preventivo.`,
        },
      ],
    }));
  };

  const removeCreative = (id: string) => {
    setState((prev) => ({ ...prev, creatives: prev.creatives.filter((c) => c.id !== id) }));
  };

  return (
    <div className="space-y-5">
      {/* Sticky action bar visibile solo se ci sono modifiche non salvate */}
      {dirty && (
        <div className="sticky top-4 z-20 flex flex-col gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="font-semibold text-orange-900">Modifiche non salvate</span>
            <span className="text-orange-700">— ricordati di salvare prima di uscire.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={resetChanges}>
              <X className="h-4 w-4" />
              Annulla
            </Button>
            <Button size="sm" onClick={save}>
              <Check className="h-4 w-4" />
              Salva modifiche
            </Button>
          </div>
        </div>
      )}

      {/* KPI panoramica bozza */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiItem
            icon={BadgeEuro}
            tone="blue"
            label="Budget/giorno"
            value={formatEuro(getCampaignDailyBudget(state) * 100)}
            detail={budgetModeLabel(state.budgetMode)}
          />
          <KpiItem
            icon={Target}
            tone="orange"
            label="CPL target"
            value={state.targetCpl ? formatEuro(state.targetCpl * 100) : "—"}
            detail={`Opp target ${state.targetOpportunityRate}%`}
          />
          <KpiItem
            icon={Users}
            tone="violet"
            label="Ad Set"
            value={String(state.adSets.length)}
            detail={`${state.creatives.length} creatività · ${getAdMatrixSize(state)} ads matrice`}
          />
          {/* Prontezza con tono verde (score positivo) — coerente con readiness banner */}
          <KpiItem
            icon={ShieldCheck}
            tone="green"
            label="Prontezza"
            value={`${readiness.score}/100`}
            detail={`${readiness.passed}/${readiness.total} controlli OK`}
          />
        </CardContent>
      </Card>

      {/* Action bar: A/B test + save */}
      <div className="flex flex-wrap justify-between gap-2">
        {onCreateVariant && (
          <Button
            variant="outline"
            onClick={() => setAbTestOpen(true)}
            className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
          >
            <Sparkles className="h-4 w-4" />
            Crea variante A/B
          </Button>
        )}
        {dirty && (
          <Button onClick={save}>
            <Check className="h-4 w-4" />
            Salva modifiche
          </Button>
        )}
      </div>

      {/* Dialog A/B test */}
      {onCreateVariant && (
        <ABTestDialog
          open={abTestOpen}
          onOpenChange={setAbTestOpen}
          originalName={state.name}
          originalDailyBudget={state.dailyBudget}
          onConfirm={async ({ variable, variant_name, description, new_value }) => {
            // Costruisci il variantState con la modifica
            const variantState: BuilderState = { ...state, name: variant_name };
            if (variable === "budget" && typeof new_value === "number") {
              variantState.dailyBudget = new_value;
            } else if (variable === "optimization_event" && typeof new_value === "string") {
              variantState.adSets = variantState.adSets.map((a) => ({
                ...a,
                optimizationEvent: new_value as CampaignAdSet["optimizationEvent"],
              }));
            }
            // Aggiungi note al copyBrief per documentare l'intent del test
            variantState.copyBrief = `[A/B TEST — variabile: ${variable}] ${description}\n\n${variantState.copyBrief}`;
            await onCreateVariant(variantState);
            setAbTestOpen(false);
            toast.success("Variante A/B creata", {
              description: `${variant_name} è ora in bozza. Personalizza la variabile testata.`,
            });
          }}
        />
      )}

      {/* Sub-tabs per le 5 aree di gestione — su mobile scrollable orizzontale */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <div className="-mx-4 overflow-x-auto pb-2 sm:mx-0">
          <TabsList className="inline-flex w-auto min-w-full px-4 sm:grid sm:px-0 sm:max-w-2xl sm:grid-cols-5">
            <TabsTrigger value="panoramica" className="gap-2 whitespace-nowrap">
              <FileText className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">Campagna</span>
              <span className="xs:hidden sm:hidden">Camp.</span>
            </TabsTrigger>
            <TabsTrigger value="adsets" className="gap-2 whitespace-nowrap">
              <Target className="h-4 w-4" />
              Ad Set ({state.adSets.length})
            </TabsTrigger>
            <TabsTrigger value="ads" className="gap-2 whitespace-nowrap">
              <ImageIcon className="h-4 w-4" />
              Ads ({state.creatives.length})
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2 whitespace-nowrap">
              <Users className="h-4 w-4" />
              Lead
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2 whitespace-nowrap">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden xs:inline">Performance</span>
              <span className="xs:hidden">Perf.</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* CAMPAGNA */}
        <TabsContent value="panoramica" className="mt-4">
          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configurazione campagna</CardTitle>
                <CardDescription>
                  Nome, obiettivo, offerta, budget. Per cambiare il template di partenza usa il wizard completo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Nome campagna">
                    <Input value={state.name} onChange={(e) => update("name", e.target.value)} />
                  </Field>
                  <Field label="Obiettivo">
                    <Select value={state.objective} onValueChange={(v) => update("objective", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OUTCOME_LEADS">Richieste preventivo</SelectItem>
                        <SelectItem value="OUTCOME_TRAFFIC">Visite al sito</SelectItem>
                        <SelectItem value="OUTCOME_AWARENESS">Farti conoscere</SelectItem>
                        <SelectItem value="OUTCOME_ENGAGEMENT">Messaggi e interazioni</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Offerta / motivo per lasciare il contatto">
                  <Textarea
                    value={state.offer}
                    onChange={(e) => update("offer", e.target.value)}
                    className="min-h-20"
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Zona">
                    <Input value={state.zone} onChange={(e) => update("zone", e.target.value)} />
                  </Field>
                  <Field label="Raggio km">
                    <Input
                      type="number"
                      min={1}
                      max={80}
                      value={state.radiusKm}
                      onChange={(e) => update("radiusKm", Number(e.target.value || 0))}
                    />
                  </Field>
                  <Field label="Budget campagna (€/giorno)">
                    <Input
                      type="number"
                      min={5}
                      max={500}
                      value={state.dailyBudget}
                      onChange={(e) => update("dailyBudget", Number(e.target.value || 0))}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Privacy URL">
                    <Input
                      value={state.privacyUrl}
                      onChange={(e) => update("privacyUrl", e.target.value)}
                      placeholder="https://..."
                    />
                  </Field>
                  <Field label="Landing URL">
                    <Input
                      value={state.landingUrl}
                      onChange={(e) => update("landingUrl", e.target.value)}
                      placeholder="https://..."
                    />
                  </Field>
                </div>
                <Field label="Campi modulo lead">
                  <Textarea
                    value={state.requiredFields}
                    onChange={(e) => update("requiredFields", e.target.value)}
                    className="min-h-20"
                  />
                </Field>
                <Field label="Domanda di qualificazione">
                  <Input
                    value={state.qualityQuestion}
                    onChange={(e) => update("qualityQuestion", e.target.value)}
                  />
                </Field>
                <Field label="Follow-up dopo il lead">
                  <Textarea
                    value={state.followUp}
                    onChange={(e) => update("followUp", e.target.value)}
                    className="min-h-20"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card className="h-fit xl:sticky xl:top-20">
              <CardHeader>
                <CardTitle className="text-base">Anteprima esperienza cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                      {companyName.trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{companyName}</p>
                      <p className="text-xs text-slate-500">Sponsorizzato</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm leading-relaxed text-slate-900">
                      {state.copyVariants[0] || state.offer}
                    </p>
                  </div>
                  <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-slate-800 to-orange-500 text-white">
                    <div className="text-center">
                      <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                      <p className="text-sm font-semibold">Creatività AI</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t p-3">
                    <div>
                      <p className="text-sm font-semibold">{state.name}</p>
                      <p className="text-xs text-slate-500">{objectiveLabel(state.objective)}</p>
                    </div>
                    <Button size="sm" variant="secondary">
                      Richiedi preventivo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AD SET */}
        <TabsContent value="adsets" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Ad Set / Gruppi pubblico</CardTitle>
                  <CardDescription>
                    Ogni ad set è un pubblico testato separatamente. Mantieni 2-4 ad set per leggibilità dei risultati.
                  </CardDescription>
                </div>
                <Button onClick={addAdSet}>
                  <Plus className="h-4 w-4" />
                  Nuovo ad set
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <AdSetPlanner
                adSets={state.adSets}
                totalBudget={getCampaignDailyBudget(state)}
                onAdd={addAdSet}
                onRemove={removeAdSet}
                onUpdate={updateAdSet}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADS / CREATIVITÀ */}
        <TabsContent value="ads" className="mt-4">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Copy varianti</CardTitle>
                <CardDescription>
                  Ogni variante diventa un annuncio separato. Mantieni almeno 3 varianti per testare angoli diversi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.copyVariants.map((copy, index) => (
                  <Field key={`copy-${index}`} label={`Copy ${index + 1}`}>
                    <Textarea
                      value={copy}
                      onChange={(e) => {
                        const next = [...state.copyVariants];
                        next[index] = e.target.value;
                        update("copyVariants", next);
                      }}
                      className="min-h-20"
                    />
                  </Field>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = [...state.copyVariants, "Nuova variante copy da personalizzare."];
                      update("copyVariants", next);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Aggiungi variante
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isGeneratingCopy}
                    onClick={async () => {
                      const aiResult = await generateCopy({
                        brief: state.copyBrief || state.offer || "campagna edilizia",
                        segment: state.templateId,
                        zone: state.zone,
                        offer: state.offer,
                        variants: 5,
                      });
                      if (aiResult?.copy_variants && aiResult.copy_variants.length > 0) {
                        update("copyVariants", aiResult.copy_variants);
                        const cost = aiResult.cost_eur_cents
                          ? ` (${(aiResult.cost_eur_cents / 100).toFixed(3)}€)`
                          : "";
                        toast.success(`Copy rigenerati con AI${cost}`);
                      } else {
                        // Fallback locale
                        update("copyVariants", buildCopyVariants(state));
                      }
                    }}
                  >
                    {isGeneratingCopy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isGeneratingCopy ? "AI in elaborazione..." : "Rigenera con AI"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Creatività</CardTitle>
                <CardDescription>
                  Mix di formati per capire cosa fa il lead più qualificato.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreativeMixPlanner
                  creatives={state.creatives}
                  onAdd={addCreative}
                  onRemove={removeCreative}
                  onUpdate={updateCreative}
                />
                <div className="mt-4">
                  <Field label="Prompt immagine principale">
                    <Textarea
                      value={state.imagePrompt}
                      onChange={(e) => update("imagePrompt", e.target.value)}
                      className="min-h-24"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PERFORMANCE — placeholder until live publishing is enabled */}
        <TabsContent value="leads" className="mt-4">
          <LeadsListPanel
            companyId={companyId}
            metaCampaignId={undefined /* TODO: passare draft.meta_campaign_id quando live */}
          />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <PerformancePanel
            companyId={companyId}
            campaignId={draft.id}
            targetCplCents={state.targetCpl * 100}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsTab({
  meta,
  companyId,
}: {
  meta: ReturnType<typeof useMetaConnection>;
  companyId?: string;
}) {
  const setupBlocks = [
    {
      title: "Account e permessi",
      body: "Business Manager, account pubblicitario, Pagina Facebook, Instagram e utente tecnico con permessi minimi.",
      items: [
        ["Integrazione Meta", meta.integration?.status === "connected", meta.integration?.status ?? "non collegata"],
        ["Business Manager", meta.businesses.length > 0, `${meta.businesses.length} rilevati`],
        ["Account pubblicitario", meta.adAccounts.length > 0, `${meta.adAccounts.length} rilevati`],
        ["Pagina Facebook", meta.pages.length > 0, `${meta.pages.length} pagine disponibili`],
      ],
    },
    {
      title: "Tracking e qualità dati",
      body: "Pixel, Conversion API, dominio verificato e mapping lead verso CRM per non ottimizzare solo sul CPL.",
      items: [
        ["Pixel / CAPI", false, "da collegare"],
        ["Dominio verificato", false, "da verificare"],
        ["Mapping CRM lead", true, "pipeline pronta"],
        ["Tag qualità lead", true, "bozza locale"],
      ],
    },
    {
      title: "Modulo lead e GDPR",
      body: "Campi minimi, privacy URL, consensi separati e domanda di qualificazione prima del lancio.",
      items: [
        ["Privacy URL", true, "richiesta nel wizard"],
        ["Consensi separati", false, "da completare"],
        ["Domande condizionali", false, "roadmap"],
        ["Test invio modulo", false, "prima del live"],
      ],
    },
    {
      title: "Follow-up e automazioni",
      body: "Il lead deve arrivare subito al CRM e attivare WhatsApp/email/task, altrimenti la campagna spreca budget.",
      items: [
        ["Creazione opportunità", true, "prevista"],
        ["WhatsApp entro 5 minuti", false, "da collegare"],
        ["Task commerciale", true, "previsto"],
        ["Nurturing email", false, "da collegare"],
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {/* PIXEL + CAPI configuration */}
      <PixelConfigCard companyId={companyId} />

      {/* SPEND GUARD — sicurezza budget */}
      <SpendGuardCard companyId={companyId} />

      {/* AUTOMATION RULES — autopilota campagne */}
      <AutomationRulesEditor companyId={companyId} />

      <Card className="border-blue-100 bg-blue-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Impostazioni pubblicitarie</CardTitle>
          <CardDescription>
            Struttura pensata per non far perdere l'imprenditore dentro Meta: prima collegamenti, poi tracking, modulo lead, follow-up e solo alla fine pubblicazione.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/azienda/impostazioni/lead-forms">
              Apri configurazione Meta
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => toast.info("Test pre-lancio disponibile nella revisione della bozza")}>
            Esegui checklist pre-lancio
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {setupBlocks.map((block) => (
          <Card key={block.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{block.title}</CardTitle>
              <CardDescription>{block.body}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {block.items.map(([label, ok, detail]) => (
                <SettingsCheck key={label as string} label={label as string} ok={Boolean(ok)} detail={detail as string} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline tecnica sicura</CardTitle>
          <CardDescription>Quando abiliteremo il live write, ogni oggetto nascerà in PAUSED e con rollback.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          {[
            ["1", "Media", "immagini/video validati"],
            ["2", "Campaign", "obiettivo e tetto spesa"],
            ["3", "Pubblico", "zona, pubblico, budget"],
            ["4", "Lead Form + Ads", "copy e modulo"],
            ["5", "Review", "test e attivazione"],
          ].map(([n, title, desc]) => (
            <div key={n} className="rounded-xl border bg-white p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
              <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * LeadsListPanel — lista dei lead Meta arrivati per la campagna.
 *
 * Mostra:
 *   • Conteggio + countdown 90gg retention Meta
 *   • Lista lead con dati base (nome, telefono, email, città)
 *   • Click su lead → apre dettaglio nel CRM
 *   • Empty state se nessun lead
 */
function LeadsListPanel({
  companyId,
  metaCampaignId,
}: {
  companyId?: string;
  metaCampaignId?: string | null;
}) {
  const { leads, isLoading, count } = useCampaignLeads({
    companyId,
    metaCampaignId,
    daysBack: 90,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento lead...
        </CardContent>
      </Card>
    );
  }

  if (count === 0) {
    return (
      <Card className="border-dashed bg-white/60">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-slate-950">Nessun lead arrivato</p>
          <p className="max-w-md text-sm text-slate-600">
            Quando i lead Meta entreranno dal modulo lead form li vedrai qui. Tieni d'occhio anche il CRM principale, dove sono raggruppati per source.
          </p>
          <Button variant="outline" asChild size="sm">
            <Link to="/azienda/clienti">
              <ArrowRight className="h-3 w-3" />
              Vai al CRM clienti
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{count} lead arrivati (ultimi 90 giorni)</CardTitle>
            <CardDescription>
              Meta conserva i lead per 90 giorni. Sincronizziamo automaticamente nel CRM.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/azienda/clienti">
              Apri CRM completo
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Città</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Data arrivo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.slice(0, 50).map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.full_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{lead.phone ?? "—"}</TableCell>
                  <TableCell className="text-xs">{lead.email ?? "—"}</TableCell>
                  <TableCell>{lead.city ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                      {lead.status ?? "nuovo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {new Date(lead.created_at).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/azienda/clienti/${lead.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {leads.length > 50 && (
          <p className="mt-3 text-xs text-slate-500">
            Mostrati i primi 50 lead. Apri il CRM per vederli tutti.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * PerformancePanel — wrapper hook + PerformanceCharts.
 *
 * Tab "Performance" del CampaignDetailEditor: legge da meta_insights_cache
 * tramite useMetaInsights, mostra KPI + 4 grafici (spend/lead/CPL/funnel).
 */
function PerformancePanel({
  companyId,
  campaignId,
  targetCplCents,
}: {
  companyId?: string;
  campaignId: string;
  targetCplCents?: number;
}) {
  const { insights, summary, isLoading, syncNow, isSyncing } = useMetaInsights({
    companyId,
    campaignId,
    daysBack: 30,
  });

  return (
    <PerformanceCharts
      insights={insights}
      summary={summary}
      isLoading={isLoading}
      isSyncing={isSyncing}
      onSync={syncNow}
      targetCplCents={targetCplCents}
    />
  );
}

function SettingsCheck({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <Badge variant="outline" className={ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
        {ok ? "OK" : "Da configurare"}
      </Badge>
    </div>
  );
}

/**
 * SpendGuardCard — UI editor per ad_spend_guard.
 *
 * Permette al titolare di impostare:
 *   • Cap mensile (€) — limite di spesa totale del mese
 *   • Cap giornaliero (€) — limite di spesa singolo giorno
 *   • Soglia approvazione per campagna (€/g) — sopra questo va approvazione titolare
 *   • % soglia alert — quando inviare email
 *   • Autopause flags
 *
 * Salvataggio: hook useAdSpendGuard con fallback localStorage se schema non applicato.
 */
function SpendGuardCard({ companyId }: { companyId?: string }) {
  const { config, isLoading, update, isUpdating } = useAdSpendGuard(companyId);
  const [draft, setDraft] = useState<AdSpendGuardConfig>(config);
  const [dirty, setDirty] = useState(false);

  // Sincronizza draft quando config cambia (es. primo load DB)
  useEffect(() => {
    if (!dirty) setDraft(config);
  }, [config, dirty]);

  const set = <K extends keyof AdSpendGuardConfig>(key: K, value: AdSpendGuardConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const reset = () => {
    setDraft(config);
    setDirty(false);
  };

  const save = async () => {
    await update({
      monthly_cap_cents: draft.monthly_cap_cents,
      daily_cap_cents: draft.daily_cap_cents,
      campaign_approval_threshold_cents: draft.campaign_approval_threshold_cents,
      alert_threshold_pct: draft.alert_threshold_pct,
      autopause_on_daily_cap: draft.autopause_on_daily_cap,
      autopause_on_monthly_cap: draft.autopause_on_monthly_cap,
      alert_email: draft.alert_email,
      is_active: draft.is_active,
    });
    setDirty(false);
  };

  return (
    <Card className="border-emerald-100 bg-emerald-50/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Spend Guard
            </CardTitle>
            <CardDescription>
              Cap di spesa anti-spreco. Il sistema mette in pausa le campagne se superano i limiti.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              draft.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            }
          >
            {draft.is_active ? "Attivo" : "Disattivato"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Caricamento configurazione...
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cap mensile (€)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={50}
                value={draft.monthly_cap_cents / 100}
                onChange={(e) => set("monthly_cap_cents", Math.max(0, Number(e.target.value || 0)) * 100)}
              />
              <span className="whitespace-nowrap text-sm text-slate-500">€/mese</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Quando le campagne sommano questo importo, vengono messe in pausa.
            </p>
          </Field>
          <Field label="Cap giornaliero (€)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={10}
                value={draft.daily_cap_cents / 100}
                onChange={(e) => set("daily_cap_cents", Math.max(0, Number(e.target.value || 0)) * 100)}
              />
              <span className="whitespace-nowrap text-sm text-slate-500">€/giorno</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Limite di spesa totale per giornata (somma di tutte le campagne).
            </p>
          </Field>
          <Field label="Soglia approvazione per campagna (€/giorno)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={5}
                value={draft.campaign_approval_threshold_cents / 100}
                onChange={(e) =>
                  set("campaign_approval_threshold_cents", Math.max(0, Number(e.target.value || 0)) * 100)
                }
              />
              <span className="whitespace-nowrap text-sm text-slate-500">€/g</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Sopra questa soglia la campagna richiede approvazione esplicita del titolare prima del lancio.
            </p>
          </Field>
          <Field label="Soglia alert (%)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.alert_threshold_pct}
                onChange={(e) => set("alert_threshold_pct", Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              />
              <span className="whitespace-nowrap text-sm text-slate-500">% del cap</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Email automatica quando la spesa raggiunge questa % del cap mensile.
            </p>
          </Field>
        </div>

        <div className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-2">
          <ToggleRow
            label="Auto-pausa se supera cap giornaliero"
            description="Mette in pausa tutte le campagne attive."
            checked={draft.autopause_on_daily_cap}
            onChange={(v) => set("autopause_on_daily_cap", v)}
          />
          <ToggleRow
            label="Auto-pausa se supera cap mensile"
            description="Le campagne ripartono al primo del mese se riattivate."
            checked={draft.autopause_on_monthly_cap}
            onChange={(v) => set("autopause_on_monthly_cap", v)}
          />
        </div>

        <Field label="Email per alert (opzionale)">
          <Input
            type="email"
            value={draft.alert_email ?? ""}
            onChange={(e) => set("alert_email", e.target.value || null)}
            placeholder="Default: email del titolare azienda"
          />
        </Field>

        {config.last_autopause_at && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-sm">Ultima auto-pausa</AlertTitle>
            <AlertDescription className="text-xs">
              {new Date(config.last_autopause_at).toLocaleString("it-IT")} —{" "}
              {config.last_autopause_reason ?? "motivo non specificato"}
            </AlertDescription>
          </Alert>
        )}

        {dirty && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={reset} disabled={isUpdating}>
              Annulla
            </Button>
            <Button size="sm" onClick={save} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-3 w-3 animate-spin" />}
              Salva modifiche
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition",
        checked ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-emerald-500" : "bg-slate-200",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </button>
  );
}

/**
 * PixelConfigCard — configurazione Meta Pixel + CAPI token.
 *
 * Permette al titolare di:
 *   • Inserire l'ID del Pixel Meta (15 cifre)
 *   • Inserire il CAPI access token (cifrato server-side)
 *   • Vedere stato salute (last_event_at, event_match_quality_score)
 */
function PixelConfigCard({ companyId }: { companyId?: string }) {
  const { config, isLoading, save, isSaving } = useMetaPixelConfig(companyId);
  const [pixelId, setPixelId] = useState("");
  const [pixelName, setPixelName] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  // Inizializza i campi quando arriva la config dal DB
  useEffect(() => {
    if (config) {
      setPixelId(config.pixel_id ?? "");
      setPixelName(config.pixel_name ?? "");
      // Non popolare il token (è ***)
    }
  }, [config]);

  const handleSave = async () => {
    if (!pixelId.trim() || !/^\d{10,20}$/.test(pixelId.trim())) {
      toast.error("Pixel ID non valido", {
        description: "Inserisci l'ID numerico del Pixel (10-20 cifre).",
      });
      return;
    }
    await save({
      pixel_id: pixelId.trim(),
      pixel_name: pixelName.trim() || undefined,
      capi_token: capiToken.trim() || undefined,
    });
    setCapiToken(""); // Pulisci il campo dopo save (sicurezza)
  };

  const hasConfig = !!config?.pixel_id;
  const eventQuality = config?.event_match_quality_score ?? null;

  return (
    <Card className="border-violet-100 bg-violet-50/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              Pixel Meta + Conversions API
            </CardTitle>
            <CardDescription>
              Attribuzione server-side: i lead/commesse vengono inviati a Meta tramite CAPI per ottimizzazione campagne.
            </CardDescription>
          </div>
          {hasConfig && (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              <Check className="mr-1 h-3 w-3" />
              Configurato
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Caricamento...
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Pixel ID Meta">
            <Input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Es. 123456789012345"
              inputMode="numeric"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Trovi l'ID in Meta Business Settings → Origini dati → Pixel.
            </p>
          </Field>
          <Field label="Nome Pixel (opzionale)">
            <Input
              value={pixelName}
              onChange={(e) => setPixelName(e.target.value)}
              placeholder="Es. Pixel sito EdiliziaInCloud"
            />
          </Field>
        </div>

        <Field label="Conversions API access token">
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              value={capiToken}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder={
                hasConfig
                  ? "Token già configurato. Inserisci nuovo valore per aggiornare."
                  : "EAAxxxxx... (Meta CAPI access token)"
              }
              className="pr-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? "Nascondi" : "Mostra"}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Genera il token in Meta Events Manager → Pixel → Impostazioni → Conversions API → Genera token di accesso.
            Verrà cifrato e mai esposto al frontend.
          </p>
        </Field>

        {hasConfig && (
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Salute eventi</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-slate-500">Ultimo evento</p>
                <p className="text-sm font-semibold text-slate-900">
                  {config?.last_event_at
                    ? new Date(config.last_event_at).toLocaleString("it-IT")
                    : "Nessun evento"}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Eventi 7gg</p>
                <p className="text-sm font-semibold text-slate-900">{config?.events_last_7d ?? 0}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Match Quality</p>
                <div className="flex items-center gap-1">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      eventQuality === null
                        ? "text-slate-400"
                        : eventQuality >= 7
                        ? "text-emerald-600"
                        : eventQuality >= 5
                        ? "text-amber-600"
                        : "text-red-600",
                    )}
                  >
                    {eventQuality !== null ? eventQuality.toFixed(1) : "—"}
                  </p>
                  <span className="text-[10px] text-slate-400">/10</span>
                </div>
              </div>
            </div>
            {eventQuality !== null && eventQuality < 6 && (
              <Alert className="mt-3 border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-xs">
                  Match Quality basso ({eventQuality.toFixed(1)}/10). Assicurati di inviare email + telefono hashati in tutti gli eventi.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button onClick={handleSave} disabled={isSaving || !pixelId.trim()}>
            {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
            {hasConfig ? "Aggiorna configurazione" : "Salva configurazione"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
