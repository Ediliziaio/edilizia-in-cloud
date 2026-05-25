import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightCircle,
  BadgeEuro,
  Check,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Copy,
  Euro,
  FileText,
  Film,
  Filter,
  Image as ImageIcon,
  Info,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
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
import {
  buildMetaPublishRequest,
  draftToCampaignRow,
  metaCampaignToDraft,
  type AdsCampaignStatus,
  type AdsLocalCampaignDraft,
} from "@/lib/ads/campaignState";
import { cn } from "@/lib/utils";
import { metaCampaignKeys, useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import { useGoogleAdsCampaigns } from "@/hooks/useGoogleAdsCampaigns";
import { useGoogleAdsStats } from "@/hooks/useGoogleAdsStats";
import { useAdsAi, type VideoScript, type VideoScriptStyle } from "@/hooks/useAdsAi";
import { useAdSpendGuard, type AdSpendGuardConfig } from "@/hooks/useAdSpendGuard";
import { useMetaPixelConfig } from "@/hooks/useMetaPixelConfig";
import { AdsBotChatPanel } from "@/components/ads/AdsBotChatPanel";
import { PerformanceCharts } from "@/components/ads/PerformanceCharts";
import { useMetaInsights } from "@/hooks/useMetaInsights";
import { PendingApprovalsBanner } from "@/components/ads/PendingApprovalsBanner";
import { useCampaignLeads } from "@/hooks/useCampaignLeads";
import { ABTestDialog } from "@/components/ads/ABTestDialog";
import { AutomationRulesEditor } from "@/components/ads/AutomationRulesEditor";
import { AdsCrmAttributionPanel } from "@/components/ads/AdsCrmAttributionPanel";
import { useAdsNotifications } from "@/hooks/useAdsNotifications";
import { AdsOnboardingTour } from "@/components/ads/AdsOnboardingTour";
import { ProviderChoiceDialog } from "@/components/ads/ProviderChoiceDialog";
import { MetaTargetingPanel } from "@/components/ads/MetaTargetingPanel";
import { QuickStartCampaign } from "@/components/ads/QuickStartCampaign";
import { CampaignCopyEditor } from "@/components/ads/CampaignCopyEditor";
import { MetaLeadFormBuilder, META_FORM_DEFAULTS } from "@/components/ads/MetaLeadFormBuilder";
import { AdMediaUploader } from "@/components/ads/AdMediaUploader";
import { AdVideoUploader } from "@/components/ads/AdVideoUploader";
import { OfferBuilderPanel } from "@/components/ads/OfferBuilderPanel";
import { VideoAIStudio } from "@/components/ads/VideoAIStudio";
import type { Integration, MetaAsset } from "@/types/integrations";
import type { MetaConversionPixelRow } from "@/types/metaAds";
import type { GoogleAdsAccountRow, GoogleAdsCampaignRow } from "@/types/googleAds";
import {
  buildAdsAttributionMetrics,
  isAdsAttributedContact,
  type AdsAttributionProvider,
  type AdsAttributionMetrics,
} from "@/lib/ads/crmAttribution";

type AdsTab = "campagne" | "creativita" | "pubblici" | "impostazioni";
type CampaignStatus = AdsCampaignStatus;
type ViewMode = "list" | "wizard" | "quickstart" | "detail";
type CreativeFormat = "image" | "video" | "carousel" | "story";
type CreativeAngle = "problem" | "social_proof" | "before_after" | "urgency" | "incentive" | "authority" | "retargeting";
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
  angle?: CreativeAngle;
  title: string;
  hook: string;
  goal: string;
  prompt: string;
}

interface OfferStrategyState {
  averageTicketEur?: number;
  averageMarginPct?: number;
  maxSustainableCplEur?: number;
  serviceArea?: string;
  commercialCapacity?: string;
  idealCustomer?: string;
  urgency?: string;
  seasonality?: string;
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  platform: "meta" | "google";
  budgetCents: number;
  spentCents: number;
  leads: number;
  opportunities: number;
  jobs: number;
  revenueCents: number;
  roas: number;
  adSets?: number;
  ads?: number;
  googleChannel?: BuilderState["googleChannel"];
  targetCplCents?: number;
  source: "meta" | "google" | "local";
  /** True per campagne demo seed (non vanno nei KPI reali). */
  isDemo?: boolean;
  /** Riferimento al draft locale completo (se source==='local'). */
  draftRef?: LocalCampaignDraft;
  metaCampaignId?: string | null;
  googleCampaignId?: string | null;
  publishError?: string | null;
}

interface LocalCampaignDraft {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
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
  adAccountId?: string | null;
  integrationId?: string | null;
  metaCampaignId?: string | null;
  googleCampaignId?: string | null;
  googleAccountId?: string | null;
  publishError?: string | null;
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
  offerStrategy?: OfferStrategyState;
  /**
   * Meta targeting avanzato — opzionali per backward-compat con bozze
   * pre-2026-05. Quando presenti, hanno la precedenza su `zone`/`interests`.
   */
  metaGeoLocations?: import("@/types/metaAds").MetaGeoLocationPick[];
  metaInterestTags?: import("@/types/metaAds").MetaSearchResult[];
  metaExcludedInterestTags?: import("@/types/metaAds").MetaSearchResult[];
  metaLocaleTags?: import("@/types/metaAds").MetaSearchResult[];
  metaPlacements?: import("@/types/metaAds").MetaPlacementsConfig;
  /**
   * Copy strutturato — 3 blocchi separati (titoli/descrizioni/hook).
   * `copyVariants` legacy resta sincronizzato con `copyDescriptions`.
   */
  copyTitles?: string[];
  copyDescriptions?: string[];
  copyHooks?: string[];
  /** Asset selezionati dalla libreria ad_media (immagini/video) */
  selectedMediaIds?: string[];
  /** Meta Lead Form strutturato — sostituisce i campi flat dello step 3 */
  metaLeadForm?: import("@/components/ads/MetaLeadFormBuilder").MetaLeadFormState;
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

const CREATIVE_ANGLE_PRESETS: Array<{
  angle: CreativeAngle;
  label: string;
  format: CreativeFormat;
  title: string;
  hook: string;
  goal: string;
}> = [
  {
    angle: "problem",
    label: "Problema",
    format: "image",
    title: "Problema evidente",
    hook: "Mostra il problema che il cliente riconosce subito",
    goal: "Capire se il dolore iniziale genera lead piu motivati.",
  },
  {
    angle: "before_after",
    label: "Prima/dopo",
    format: "carousel",
    title: "Prima/dopo",
    hook: "Trasformazione visibile e risultato finale",
    goal: "Fermare lo scroll con prova visiva del cambiamento.",
  },
  {
    angle: "social_proof",
    label: "Prova sociale",
    format: "video",
    title: "Cliente soddisfatto",
    hook: "Risultato reale, fiducia e contesto locale",
    goal: "Misurare se fiducia e referenze aumentano gli appuntamenti.",
  },
  {
    angle: "urgency",
    label: "Urgenza",
    format: "story",
    title: "Urgenza qualificata",
    hook: "Periodo, scadenza o problema da risolvere ora",
    goal: "Separare curiosi da clienti con tempistiche concrete.",
  },
  {
    angle: "incentive",
    label: "Incentivo",
    format: "image",
    title: "Incentivo preventivo",
    hook: "Sopralluogo, check o consulenza inclusa",
    goal: "Capire se l'incentivo riduce CPL senza abbassare qualita lead.",
  },
  {
    angle: "authority",
    label: "Autorità",
    format: "video",
    title: "Tecnico esperto",
    hook: "Spiegazione breve, materiali, metodo e garanzie",
    goal: "Aumentare fiducia quando la scelta e tecnica o ad alto ticket.",
  },
  {
    angle: "retargeting",
    label: "Retargeting",
    format: "carousel",
    title: "Secondo contatto",
    hook: "Risposta a obiezione per chi ti ha gia visto",
    goal: "Recuperare visitatori e lead tiepidi con messaggio piu specifico.",
  },
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
    platform: "meta",
    budgetCents: 3000,
    spentCents: 184000,
    leads: 23,
    opportunities: 9,
    jobs: 5,
    revenueCents: 6800000,
    roas: 36.96,
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
    platform: "meta",
    budgetCents: 2500,
    spentCents: 210000,
    leads: 14,
    opportunities: 5,
    jobs: 2,
    revenueCents: 2550000,
    roas: 12.14,
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
    platform: "meta",
    budgetCents: 1500,
    spentCents: 34000,
    leads: 4,
    opportunities: 1,
    jobs: 0,
    revenueCents: 0,
    roas: 0,
    adSets: 1,
    ads: 3,
    targetCplCents: 1800,
    source: "meta",
    isDemo: true,
  },
  {
    id: "demo-google-1",
    name: "[ESEMPIO] Google Search - Ristrutturazione bagno Milano",
    objective: "OUTCOME_LEADS",
    status: "active",
    platform: "google",
    budgetCents: 4000,
    spentCents: 156000,
    leads: 18,
    opportunities: 11,
    jobs: 4,
    revenueCents: 5900000,
    roas: 37.82,
    adSets: 2,
    ads: 4,
    targetCplCents: 3000,
    googleChannel: "SEARCH",
    source: "google",
    isDemo: true,
    googleCampaignId: "g-demo-search-1",
  },
  {
    id: "demo-google-2",
    name: "[ESEMPIO] Performance Max - Serramenti provincia",
    objective: "OUTCOME_LEADS",
    status: "review",
    platform: "google",
    budgetCents: 3500,
    spentCents: 92000,
    leads: 10,
    opportunities: 6,
    jobs: 1,
    revenueCents: 1450000,
    roas: 15.76,
    adSets: 1,
    ads: 8,
    targetCplCents: 2800,
    googleChannel: "PERFORMANCE_MAX",
    source: "google",
    isDemo: true,
    googleCampaignId: "g-demo-pmax-1",
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
  return ["problem", "before_after", "social_proof"].map((angle) =>
    buildCreativeFromAngle(angle as CreativeAngle, brief, input.imagePrompt),
  );
}

function buildCreativeFromAngle(angle: CreativeAngle, brief: string, imagePrompt: string): CampaignCreative {
  const preset = CREATIVE_ANGLE_PRESETS.find((item) => item.angle === angle) ?? CREATIVE_ANGLE_PRESETS[0];
  const promptByAngle: Record<CreativeAngle, string> = {
    problem: imagePrompt || `Immagine realistica per ${brief}: mostra il problema prima dell'intervento, contesto casa italiana, bisogno chiaro e CTA preventivo.`,
    social_proof: `Video verticale per ${brief}: cliente o tecnico locale, risultato reale, prova di fiducia, dettaglio lavoro e CTA appuntamento.`,
    before_after: `Carosello Meta Ads per ${brief}: slide prima, causa problema, intervento, risultato dopo, CTA richiesta preventivo.`,
    urgency: `Story/Reel per ${brief}: apertura su urgenza concreta, rischio di aspettare, disponibilita limitata e CTA rapida.`,
    incentive: `Immagine per ${brief}: evidenzia sopralluogo/check/consulenza inclusa senza sembrare sconto aggressivo.`,
    authority: `Video tecnico breve per ${brief}: esperto spiega metodo, materiali, garanzie e prossimo passo per preventivo serio.`,
    retargeting: `Carosello retargeting per ${brief}: obiezione frequente, risposta concreta, prova, invito a fissare appuntamento.`,
  };

  return {
    id: `creative-${angle}`,
    format: preset.format,
    angle,
    title: preset.title,
    hook: preset.hook,
    goal: preset.goal,
    prompt: promptByAngle[angle],
  };
}

/**
 * Costruisce un MetaLeadFormState iniziale a partire da BuilderState legacy
 * (privacyUrl, qualityQuestion, requiredFields stringa). Permette migrazione
 * fluida delle bozze pre-2026-05-22 al nuovo lead form builder.
 */
function buildInitialLeadForm(state: BuilderState): import("@/components/ads/MetaLeadFormBuilder").MetaLeadFormState {
  const base = { ...META_FORM_DEFAULTS };
  if (state.privacyUrl) base.privacyPolicyUrl = state.privacyUrl;
  if (state.formIntent === "volume") base.formType = "MORE_VOLUME";
  if (state.formIntent === "higher_intent") base.formType = "HIGHER_INTENT";
  // Se l'utente aveva una qualifying question legacy, aggiungila al default
  if (state.qualityQuestion?.trim() && !base.questions.some((q) => q.kind === "custom" && (q as { label: string }).label === state.qualityQuestion.trim())) {
    base.questions = [
      ...base.questions,
      {
        kind: "custom",
        key: `legacy_${Date.now()}`,
        type: "short_answer",
        label: state.qualityQuestion.trim(),
      },
    ];
  }
  // Use offer come intro body se presente
  if (state.offer) {
    base.introBody = state.offer.slice(0, 600);
  }
  // Customizza thank-you se è una lead-gen edilizia
  if (state.offer?.toLowerCase().includes("sopralluogo") || state.offer?.toLowerCase().includes("preventivo")) {
    base.thankYouHeadline = "Grazie! Ti contattiamo entro 24h";
    base.thankYouBody = "Abbiamo ricevuto la tua richiesta. Un nostro tecnico ti chiamerà per fissare il sopralluogo.";
  }
  return base;
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
  offerStrategy: {
    averageTicketEur: 3500,
    averageMarginPct: 30,
    maxSustainableCplEur: 35,
    serviceArea: "Monza e Brianza, sopralluoghi entro 25 km",
    commercialCapacity: "10-15 lead/settimana, risposta entro 5 minuti",
    idealCustomer: "Proprietario casa, lavoro entro 90 giorni, budget definito",
    urgency: "Da qualificare con domanda su tempistica e stato del lavoro",
    seasonality: "Picchi primavera/autunno; test leggero nei mesi più lenti",
  },
  // Meta targeting avanzato — default vuoti, popolati dall'utente nel wizard.
  metaGeoLocations: [],
  metaInterestTags: [],
  metaExcludedInterestTags: [],
  metaLocaleTags: [],
  metaPlacements: { automatic: true },
  // Copy strutturato 3-blocchi (popolato da CampaignCopyEditor)
  copyTitles: [],
  copyDescriptions: [],
  copyHooks: [],
  selectedMediaIds: [],
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

/**
 * FIX P1: validazione URL https più rigorosa di startsWith("https://").
 * Rifiuta "https://", "https://x", "https://-bad", URL relativi.
 * Accetta solo URL con host valido (almeno un punto, non IP solo).
 */
function isValidHttpsUrl(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return false;
    if (!url.hostname || url.hostname.length < 4) return false;
    if (!url.hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

/** FIX P1: regex email semplificata RFC-like (no edge cases esotici). */
function isValidEmail(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Clamp numeric input nel range Meta consentito. */
function clampMetaBudget(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(5, Math.min(500, Math.round(value * 100) / 100));
}

function clampMetaRadius(value: number): number {
  if (!Number.isFinite(value)) return 10;
  // Meta locale awareness: 1-80km (oltre è treated come "national")
  return Math.max(1, Math.min(80, Math.round(value)));
}

function statusLabel(status: CampaignStatus) {
  const labels: Record<CampaignStatus, string> = {
    active: "Attiva",
    paused: "In pausa",
    draft: "Bozza",
    review: "In revisione",
    published: "Pubblicata",
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
    published: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
  };
  return classes[status];
}

function platformLabel(platform: CampaignRow["platform"]) {
  return platform === "google" ? "Google Ads" : "Meta Ads";
}

function platformBadgeClass(platform: CampaignRow["platform"]) {
  return platform === "google"
    ? "whitespace-nowrap border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-800"
    : "whitespace-nowrap border-blue-200 bg-blue-50 text-[10px] font-semibold text-blue-700";
}

function structurePrimary(campaign: CampaignRow) {
  if (campaign.platform === "google") {
    return `${campaign.adSets ?? 1} grupp${(campaign.adSets ?? 1) === 1 ? "o" : "i"} annunci`;
  }
  return `${campaign.adSets ?? 1} ad set`;
}

function structureSecondary(campaign: CampaignRow) {
  if (campaign.platform === "google") {
    const channel = campaign.googleChannel ?? campaign.draftRef?.builderState?.googleChannel ?? "SEARCH";
    return `${channel} · ${campaign.ads ?? 1} asset/ads`;
  }
  return `${campaign.ads ?? 1} ads`;
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

function normalizeLookup(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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
  // Resolve current state — preferisce v2 (nuovi campi strutturati) con fallback v1 legacy
  const lf = state.metaLeadForm;
  const v2GeoCount = (state.metaGeoLocations?.filter((g) => !g.excluded).length ?? 0);
  const v1GeoOk = state.zone.trim().length >= 2;
  const totalFieldsCount = lf
    ? lf.questions.length
    : splitList(state.requiredFields).length;
  const privacyOk = isValidHttpsUrl(lf?.privacyPolicyUrl) || isValidHttpsUrl(state.privacyUrl);
  const qualifyingQuestionExists = lf
    ? lf.questions.some((q) => q.kind === "custom")
    : state.qualityQuestion.trim().length >= 8;
  const hasV2Copy = (state.copyDescriptions?.length ?? 0) > 0;
  const copyDescriptions = hasV2Copy ? (state.copyDescriptions ?? []) : state.copyVariants;
  const budgetPerAd = getBudgetPerAd(state);

  return [
    {
      title: "Promessa chiara",
      ok: state.offer.trim().length >= 40,
      fix: "Scrivi cosa ottiene il cliente e perché dovrebbe lasciare il contatto.",
    },
    {
      title: "Zona realistica",
      ok: (v2GeoCount > 0 || v1GeoOk) && state.ageMin <= state.ageMax,
      fix: "Aggiungi almeno 1 città/regione nel pannello pubblico, con raggio sostenibile per sopralluoghi.",
    },
    {
      title: "Controlli Meta impostati",
      ok:
        (state.languages.trim().length >= 2 || (state.metaLocaleTags?.length ?? 0) > 0) &&
        !!state.gender,
      fix: "Definisci lingua, eventualmente genere ed esclusioni per non sprecare budget.",
    },
    {
      title: "Budget test sensato",
      ok: getCampaignDailyBudget(state) >= 10,
      fix: "Sotto 10 euro/giorno Meta impara troppo lentamente.",
    },
    {
      title: "Gruppi pubblico strutturati",
      ok: state.adSets.length >= 2 && state.adSets.every((adSet) => adSet.name.trim() && adSet.dailyBudget >= 5 && (state.advantageAudience || adSet.audience.trim())),
      fix: "Prepara almeno due gruppi: controlli business forti su zona/esclusioni e interessi solo se servono davvero.",
    },
    {
      title: "Modulo snello",
      ok: totalFieldsCount > 0 && totalFieldsCount <= 8,
      fix: "Tieni pochi campi (3-7 ideali) e sposta la qualificazione in una domanda mirata.",
    },
    {
      title: "Privacy pronta",
      ok: privacyOk,
      fix: "Usa un link privacy HTTPS verificabile prima del lancio.",
    },
    {
      title: "Qualificazione lead",
      ok: qualifyingQuestionExists,
      fix: "Aggiungi almeno 1 domanda custom (es. tempistica, tipo immobile, budget) per filtrare i lead.",
    },
    {
      title: "Follow-up immediato",
      ok: state.followUp.trim().length >= 20,
      fix: "Prevedi CRM, task o WhatsApp entro pochi minuti dal lead.",
    },
    {
      title: "Copy pronti",
      ok: copyDescriptions.length >= 3 && copyDescriptions.every((c) => c.trim().length >= 35),
      fix: "Prepara almeno 3 descrizioni copy diverse per testare angoli di vendita.",
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

function getPublishQa(
  draft: LocalCampaignDraft,
  meta: ReturnType<typeof useMetaConnection>,
  pixelConfig: MetaConversionPixelRow | null | undefined,
) {
  const state = draft.builderState;
  const blockers: string[] = [];

  if (!state) {
    return { blockers: ["Stato builder mancante: riapri il wizard e salva la bozza."] };
  }

  const readiness = getReadinessScore(state);
  const lf = state.metaLeadForm;
  const privacyOk = isValidHttpsUrl(lf?.privacyPolicyUrl) || isValidHttpsUrl(state.privacyUrl);
  const landingNeedsUtm = state.conversionPlace === "landing_page" || state.conversionPlace === "dual";
  const landingHasUtm =
    !landingNeedsUtm ||
    /[?&]utm_(source|medium|campaign)=/i.test(state.landingUrl) ||
    state.landingUrl.trim() === "";
  const pixelTested = Boolean(
    pixelConfig?.last_event_at ||
      (pixelConfig?.pixel_events_last_24h ?? 0) > 0 ||
      (pixelConfig?.capi_events_last_24h ?? 0) > 0,
  );

  const checks = [
    { ok: meta.integration?.status === "connected", message: "Meta non collegato." },
    { ok: meta.adAccounts.length > 0, message: "Account pubblicitario assente." },
    { ok: meta.pages.length > 0, message: "Pagina Facebook non disponibile." },
    { ok: Boolean(pixelConfig?.pixel_id), message: "Pixel/CAPI non configurato." },
    { ok: pixelTested, message: "Evento Pixel/CAPI non ancora testato." },
    { ok: privacyOk, message: "Privacy URL HTTPS mancante." },
    { ok: landingHasUtm, message: "Landing senza UTM: aggiungi utm_source, utm_medium o utm_campaign." },
    { ok: getCampaignDailyBudget(state) >= 10 && getBudgetPerAd(state) >= 1.5, message: "Budget non coerente con la matrice annunci." },
    { ok: state.creatives.length >= 3 && state.imagePrompt.trim().length >= 40, message: "Creativita non completa o non approvata." },
    { ok: state.followUp.trim().length >= 20, message: "Follow-up CRM non pronto." },
    { ok: readiness.score >= 80, message: "Checklist lancio sotto 80/100." },
  ];

  blockers.push(...checks.filter((check) => !check.ok).map((check) => check.message));
  return { blockers };
}

function getGooglePublishQa(
  draft: LocalCampaignDraft,
  google: ReturnType<typeof useGoogleAdsConnection>,
) {
  const state = draft.builderState;
  const blockers: string[] = [];

  if (!state) {
    return { blockers: ["Stato builder mancante: riapri il wizard e salva la bozza."] };
  }

  const landingNeedsUtm = state.conversionPlace === "landing_page" || state.conversionPlace === "dual";
  const landingHasGoogleUtm =
    !landingNeedsUtm ||
    /[?&]utm_source=(google|google_ads|adwords)/i.test(state.landingUrl) ||
    /[?&]utm_medium=(cpc|ppc|paid_search)/i.test(state.landingUrl);
  const hasSearchIntent =
    state.googleChannel !== "SEARCH" ||
    splitList(state.interests).length > 0 ||
    state.copyBrief.toLowerCase().includes("keyword") ||
    state.copyBrief.toLowerCase().includes("parole chiave");
  const hasEnoughAssets =
    state.googleChannel === "PERFORMANCE_MAX"
      ? state.copyVariants.length >= 5 && state.creatives.length >= 3
      : state.copyVariants.length >= 3;

  const checks = [
    { ok: google.integration?.status === "connected", message: "Google Ads non collegato." },
    { ok: google.accounts.length > 0, message: "Nessun Customer ID Google Ads selezionato." },
    { ok: isValidHttpsUrl(state.privacyUrl), message: "Privacy URL HTTPS non valido (host malformato o mancante)." },
    { ok: landingHasGoogleUtm, message: "Landing senza UTM Google: usa utm_source=google e utm_medium=cpc." },
    { ok: getCampaignDailyBudget(state) >= 10, message: "Budget giornaliero troppo basso per Google Ads." },
    { ok: hasSearchIntent, message: "Mancano keyword/intenti di ricerca per il canale Search." },
    { ok: hasEnoughAssets, message: "Asset Google insufficienti: servono piu titoli, descrizioni e creatività." },
    { ok: false, message: "Pubblicazione Google Ads API non ancora abilitata: serve Developer Token e OAuth Google Ads." },
  ];

  blockers.push(...checks.filter((check) => !check.ok).map((check) => check.message));
  return { blockers };
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

function useGoogleAdsConnection(companyId: string | undefined, enabled: boolean) {
  const { data: integration, isLoading: integrationLoading } = useQuery({
    queryKey: ["ads-manager-beta", "google-ads-integration", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .eq("provider", "google_ads")
        .maybeSingle();
      if (error) throw error;
      return data as Integration | null;
    },
    enabled: enabled && !!companyId,
    staleTime: 60_000,
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["ads-manager-beta", "google-ads-accounts", companyId, integration?.id],
    queryFn: async () => {
      if (!companyId) return [];
      try {
        const { data, error } = await (supabase as any)
          .from("google_ads_accounts")
          .select("*")
          .eq("company_id", companyId)
          .order("selected", { ascending: false })
          .order("customer_name", { ascending: true });
        if (error) {
          const msg = String(error.message ?? error);
          if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("relation")) {
            return [];
          }
          throw error;
        }
        return (data ?? []) as GoogleAdsAccountRow[];
      } catch {
        return [];
      }
    },
    enabled: enabled && !!companyId,
    staleTime: 60_000,
  });

  const selectedAccount = accounts.find((account) => account.selected) ?? accounts[0] ?? null;

  return {
    integration,
    accounts,
    selectedAccount,
    isLoading: integrationLoading || accountsLoading,
  };
}

interface BusinessContactRow {
  id: string;
  source?: string | null;
  source_campaign_id?: string | null;
  attr_source?: string | null;
  attr_medium?: string | null;
  attr_campaign?: string | null;
  attr_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  google_campaign_id?: string | null;
  google_ad_group_id?: string | null;
  google_ad_id?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  created_at?: string | null;
}

interface BusinessOpportunityRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
  value?: number | string | null;
}

interface BusinessAppointmentRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
}

interface BusinessCostRow {
  spend_amount?: number | string | null;
  source?: string | null;
  campaign_name?: string | null;
}

function useAdsCampaignBusinessMetrics(companyId: string | undefined, campaigns: CampaignRow[]) {
  const campaignSignature = useMemo(
    () =>
      campaigns
        .map((campaign) =>
          [
            campaign.id,
            campaign.platform,
            campaign.name,
            campaign.metaCampaignId ?? "",
            campaign.googleCampaignId ?? "",
          ].join(":"),
        )
        .join("|"),
    [campaigns],
  );

  const query = useQuery({
    queryKey: ["ads-campaign-business-metrics", companyId, campaignSignature],
    queryFn: async () => {
      if (!companyId || campaigns.length === 0) {
        return {
          contacts: [] as BusinessContactRow[],
          opportunities: [] as BusinessOpportunityRow[],
          appointments: [] as BusinessAppointmentRow[],
          costs: [] as BusinessCostRow[],
        };
      }
      const contacts = await fetchBusinessContacts(companyId);
      const contactIds = contacts.map((contact) => contact.id).filter(Boolean);
      const [opportunities, appointments, costs] = await Promise.all([
        fetchBusinessOpportunities(companyId, contactIds),
        fetchBusinessAppointments(companyId, contactIds),
        fetchBusinessCosts(companyId),
      ]);
      return { contacts, opportunities, appointments, costs };
    },
    enabled: !!companyId && campaigns.length > 0,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const contacts = query.data?.contacts ?? [];
    const opportunities = query.data?.opportunities ?? [];
    const appointments = query.data?.appointments ?? [];
    const costs = query.data?.costs ?? [];
    const byCampaign = new Map<string, AdsAttributionMetrics>();

    for (const campaign of campaigns) {
      const terms = buildCampaignTermsForRow(campaign);
      const matchedContacts = contacts.filter((contact) => matchesCampaignContact(contact, campaign.platform, terms));
      const contactIds = new Set(matchedContacts.map((contact) => contact.id));
      const matchedOpportunities = opportunities.filter(
        (opportunity) => opportunity.contact_id && contactIds.has(opportunity.contact_id),
      );
      const matchedAppointments = appointments.filter(
        (appointment) => appointment.contact_id && contactIds.has(appointment.contact_id),
      );
      const costSpendCents = costs
        .filter((cost) => matchesCampaignCost(cost, campaign.platform, terms))
        .reduce((sum, cost) => sum + Math.round(Number(cost.spend_amount ?? 0) * 100), 0);
      const won = matchedOpportunities.filter((opportunity) => isWonStatusValue(opportunity.status)).length;
      const revenueCents = matchedOpportunities
        .filter((opportunity) => isWonStatusValue(opportunity.status))
        .reduce((sum, opportunity) => sum + Math.round(Number(opportunity.value ?? 0) * 100), 0);

      byCampaign.set(
        campaign.id,
        buildAdsAttributionMetrics({
          spendCents: campaign.spentCents || costSpendCents,
          leads: matchedContacts.length,
          opportunities: matchedOpportunities.length,
          appointments: matchedAppointments.filter((appointment) => !isCancelledStatusValue(appointment.status)).length,
          won,
          revenueCents,
        }),
      );
    }

    const totals = Array.from(byCampaign.values()).reduce(
      (acc, metrics) =>
        buildAdsAttributionMetrics({
          spendCents: acc.spendCents + metrics.spendCents,
          leads: acc.leads + metrics.leads,
          opportunities: acc.opportunities + metrics.opportunities,
          appointments: acc.appointments + metrics.appointments,
          won: acc.won + metrics.won,
          revenueCents: acc.revenueCents + metrics.revenueCents,
        }),
      buildAdsAttributionMetrics({}),
    );

    return {
      byCampaign,
      totals,
      isLoading: query.isLoading,
    };
  }, [campaigns, query.data, query.isLoading]);
}

function toLocalCampaignDraft(
  draft: Omit<AdsLocalCampaignDraft, "status"> & { status?: CampaignStatus },
): LocalCampaignDraft {
  return {
    ...draft,
    status: draft.status ?? "draft",
    builderState: draft.builderState as BuilderState | undefined,
  };
}

function googleCampaignToDraft(campaign: GoogleAdsCampaignRow): LocalCampaignDraft {
  const rawBuilderState = (campaign.builder_state ?? {}) as Record<string, unknown>;
  const builderState = {
    ...DEFAULT_BUILDER,
    ...rawBuilderState,
    platform: "google",
    googleChannel: normalizeGoogleChannel(campaign.advertising_channel),
  } as BuilderState;
  const adSets = Array.isArray(builderState.adSets) ? builderState.adSets.length : 0;
  const creatives = Array.isArray(builderState.creatives) ? builderState.creatives.length : 0;
  const targetCplCents =
    typeof builderState.targetCpl === "number"
      ? builderState.targetCpl * 100
      : campaign.target_cpa_micros
        ? Math.round(campaign.target_cpa_micros / 10_000)
        : 0;

  return {
    id: campaign.id,
    name: campaign.name,
    objective: typeof rawBuilderState.objective === "string" ? rawBuilderState.objective : "OUTCOME_LEADS",
    status: campaign.status === "archived" ? "draft" : (campaign.status as CampaignStatus),
    budgetCents: campaign.daily_budget_cents ?? 0,
    zone:
      typeof builderState.zone === "string" && builderState.zone.trim()
        ? builderState.zone
        : campaign.geo_targets?.[0]?.name ?? "-",
    adSets: adSets || 1,
    ads: Math.max(1, adSets * Math.max(1, creatives)),
    targetCplCents,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    copyVariants: Array.isArray(builderState.copyVariants) ? builderState.copyVariants : [],
    imagePrompt: typeof builderState.imagePrompt === "string" ? builderState.imagePrompt : "",
    builderState,
    integrationId: campaign.integration_id,
    googleCampaignId: campaign.google_campaign_id,
    googleAccountId: campaign.google_account_id,
    publishError: campaign.publish_error,
  };
}

function normalizeGoogleChannel(channel: string): BuilderState["googleChannel"] {
  if (channel === "DISPLAY" || channel === "VIDEO" || channel === "PERFORMANCE_MAX") return channel;
  return "SEARCH";
}

async function fetchBusinessContacts(companyId: string): Promise<BusinessContactRow[]> {
  const fullSelect =
    "id, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, meta_campaign_id, meta_adset_id, meta_ad_id, google_campaign_id, google_ad_group_id, google_ad_id, gclid, wbraid, gbraid, created_at";
  const fallbackSelect =
    "id, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, created_at";
  try {
    const { data, error } = await (supabase as any)
      .from("marketing_contacts")
      .select(fullSelect)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!error) return (data ?? []) as BusinessContactRow[];
    const msg = String(error.message ?? error);
    if (!msg.includes("schema cache") && !msg.includes("does not exist") && !msg.includes("column")) throw error;

    const fallback = await (supabase as any)
      .from("marketing_contacts")
      .select(fallbackSelect)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []) as BusinessContactRow[];
  } catch {
    return [];
  }
}

async function fetchBusinessOpportunities(companyId: string, contactIds: string[]): Promise<BusinessOpportunityRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("marketing_opportunities")
      .select("id, contact_id, status, value")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as BusinessOpportunityRow[];
  } catch {
    return [];
  }
}

async function fetchBusinessAppointments(companyId: string, contactIds: string[]): Promise<BusinessAppointmentRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("appointments")
      .select("id, contact_id, status")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as BusinessAppointmentRow[];
  } catch {
    return [];
  }
}

async function fetchBusinessCosts(companyId: string): Promise<BusinessCostRow[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("campaign_costs")
      .select("spend_amount, source, campaign_name")
      .eq("company_id", companyId)
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as BusinessCostRow[];
  } catch {
    return [];
  }
}

function buildCampaignTermsForRow(campaign: CampaignRow) {
  return [
    campaign.id,
    campaign.name,
    campaign.metaCampaignId,
    campaign.googleCampaignId,
    campaign.draftRef?.builderState?.name,
  ]
    .map(normalizeLookup)
    .filter((term, index, terms) => term.length >= 3 && terms.indexOf(term) === index);
}

function matchesCampaignContact(
  contact: BusinessContactRow,
  provider: AdsAttributionProvider,
  campaignTerms: string[],
) {
  if (campaignTerms.length === 0 || !isAdsAttributedContact(contact, provider)) return false;
  const values = [
    contact.source_campaign_id,
    contact.attr_campaign,
    contact.attr_content,
    contact.source,
    contact.meta_campaign_id,
    contact.meta_adset_id,
    contact.meta_ad_id,
    contact.google_campaign_id,
    contact.google_ad_group_id,
    contact.google_ad_id,
  ].map(normalizeLookup);
  return campaignTerms.some((term) =>
    values.some((value) => value.length >= 3 && (value.includes(term) || (value.length >= 8 && term.includes(value)))),
  );
}

function matchesCampaignCost(cost: BusinessCostRow, provider: AdsAttributionProvider, campaignTerms: string[]) {
  if (campaignTerms.length === 0) return false;
  const source = normalizeLookup(cost.source);
  if (provider === "meta" && source && !/(meta|facebook|instagram|paid_social)/.test(source)) return false;
  if (provider === "google" && source && !/(google|adwords|paid_search|cpc|ppc)/.test(source)) return false;
  const values = [cost.campaign_name, cost.source].map(normalizeLookup);
  return campaignTerms.some((term) =>
    values.some((value) => value.length >= 3 && (value.includes(term) || (value.length >= 8 && term.includes(value)))),
  );
}

function isWonStatusValue(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return value === "won" || value === "closed_won" || value === "vinto";
}

function isCancelledStatusValue(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return value === "cancelled" || value === "canceled" || value === "annullato";
}

export default function AdsManagerBeta() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const companyName = effectiveCompany?.name ?? "La tua azienda";
  const isDemoCompany = companyId === DEMO_COMPANY_ID;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const mode = searchParams.get("mode");
  const editId = searchParams.get("edit");
  const detailId = searchParams.get("detail");
  // Platform scelta nel ProviderChoiceDialog (Meta vs Google) prima del wizard.
  const initialPlatformFromUrl = (searchParams.get("platform") as "meta" | "google" | null) ?? undefined;
  const initialGoogleChannelFromUrl =
    (searchParams.get("googleChannel") as "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX" | null) ?? undefined;

  const meta = useMetaConnection(companyId, isDemoCompany);
  const google = useGoogleAdsConnection(companyId, isDemoCompany);
  const pixel = useMetaPixelConfig(companyId);
  const googleStats = useGoogleAdsStats();

  // Realtime: ascolta autopause + status changes campaign → toast
  useAdsNotifications(companyId);

  // Data layer: prova DB (meta_campaigns), fallback automatico localStorage
  const {
    campaigns: dbCampaigns,
    saveDraft: saveDraftDb,
    updateDraft: updateDraftDb,
    updateStatus: updateCampaignStatus,
    deleteDraft: deleteDraftDb,
    isLoading: campaignsLoading,
  } = useMetaCampaigns(companyId);

  const {
    campaigns: googleDbCampaigns,
    saveDraft: saveGoogleDraftDb,
    updateDraft: updateGoogleDraftDb,
    updateStatus: updateGoogleCampaignStatus,
    deleteDraft: deleteGoogleDraftDb,
    findCampaign: findGoogleDbCampaign,
    isLoading: googleCampaignsLoading,
  } = useGoogleAdsCampaigns(companyId);

  // Wrapper di compatibilità con la vecchia API (drafts/saveDraft/etc.)
  // Adatta MetaCampaignRow → LocalCampaignDraft per riusare i componenti esistenti
  const metaDrafts: LocalCampaignDraft[] = useMemo(
    () =>
      dbCampaigns.map((c) => toLocalCampaignDraft(metaCampaignToDraft(c))),
    [dbCampaigns],
  );
  const googleDrafts: LocalCampaignDraft[] = useMemo(
    () => googleDbCampaigns.map((campaign) => toLocalCampaignDraft(googleCampaignToDraft(campaign))),
    [googleDbCampaigns],
  );
  const drafts: LocalCampaignDraft[] = useMemo(
    () => [...metaDrafts, ...googleDrafts],
    [metaDrafts, googleDrafts],
  );

  const saveDraft = useCallback(
    async (state: BuilderState): Promise<LocalCampaignDraft> => {
      if (state.platform === "google") {
        const result = await saveGoogleDraftDb({
          builder_state: state as unknown as Record<string, unknown>,
          name: state.name.trim() || "Campagna Google senza nome",
          advertising_channel: state.googleChannel ?? "SEARCH",
          daily_budget_cents: getCampaignDailyBudget(state) * 100,
        });
        return toLocalCampaignDraft(googleCampaignToDraft(result));
      }
      const result = await saveDraftDb({
        builder_state: state as unknown as Record<string, unknown>,
        name: state.name.trim() || "Campagna Meta senza nome",
        objective: state.objective,
        daily_budget_cents: getCampaignDailyBudget(state) * 100,
      });
      // Result può essere MetaCampaignRow o LegacyDraft (dal fallback)
      if ("builder_state" in result) {
        return toLocalCampaignDraft(metaCampaignToDraft(result));
      }
      return toLocalCampaignDraft(result);
    },
    [saveDraftDb, saveGoogleDraftDb],
  );

  const updateDraft = useCallback(
    async (id: string, state: BuilderState): Promise<void> => {
      if (state.platform === "google") {
        await updateGoogleDraftDb({
          id,
          builder_state: state as unknown as Record<string, unknown>,
          name: state.name.trim() || "Campagna Google senza nome",
          advertising_channel: state.googleChannel ?? "SEARCH",
          daily_budget_cents: getCampaignDailyBudget(state) * 100,
        });
        return;
      }
      await updateDraftDb({
        id,
        builder_state: state as unknown as Record<string, unknown>,
        name: state.name.trim() || "Campagna Meta senza nome",
        objective: state.objective,
        daily_budget_cents: getCampaignDailyBudget(state) * 100,
      });
    },
    [updateDraftDb, updateGoogleDraftDb],
  );

  const removeDraft = useCallback(
    async (id: string): Promise<void> => {
      if (findGoogleDbCampaign(id)) {
        await deleteGoogleDraftDb(id);
        return;
      }
      await deleteDraftDb(id);
    },
    [deleteDraftDb, deleteGoogleDraftDb, findGoogleDbCampaign],
  );

  const findDraft = useCallback(
    (id: string): LocalCampaignDraft | null => {
      return drafts.find((draft) => draft.id === id) ?? null;
    },
    [drafts],
  );

  const canPublishToMeta = Boolean(
    companyId && meta.integration?.status === "connected" && meta.adAccounts.length > 0,
  );

  const requestReview = useCallback(
    async (draft: LocalCampaignDraft) => {
      if (draft.builderState?.platform === "google") {
        await updateGoogleCampaignStatus({
          id: draft.id,
          status: "review",
          publish_error: null,
        });
        toast.success("Campagna Google inviata in revisione", {
          description: "Resta separata da Meta e usa il flusso Google Ads.",
        });
        return;
      }
      await updateCampaignStatus({
        id: draft.id,
        status: "review",
        publish_error: null,
      });
      toast.success("Campagna inviata in revisione", {
        description: "Ora compare nel flusso approvazioni del titolare.",
      });
    },
    [updateCampaignStatus, updateGoogleCampaignStatus],
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const publishDraft = useCallback(
    async (draft: LocalCampaignDraft) => {
      if (!companyId) throw new Error("no_company_id");
      if (draft.builderState?.platform === "google") {
        throw new Error("Google Ads live richiede OAuth Google Ads e Developer Token: completa il collegamento in Impostazioni.");
      }
      const publishQa = getPublishQa(draft, meta, pixel.config);
      if (publishQa.blockers.length > 0) {
        throw new Error(`QA pre-pubblicazione: ${publishQa.blockers[0]}`);
      }
      setIsPublishing(true);
      try {
        const request = buildMetaPublishRequest({
          companyId,
          draft,
          adAccountAsset: meta.adAccounts[0],
          dryRun: false,
        });
        const { data, error } = await supabase.functions.invoke<{
          success?: boolean;
          error?: string;
          detail?: string;
          campaign_id?: string;
          meta_campaign_id?: string;
          errors?: string[];
        }>("meta-ads-create-campaign", {
          body: request,
        });
        if (error) throw error;
        if (data?.error || data?.success === false) {
          const detail = data?.detail ?? data?.errors?.join(", ") ?? data?.error ?? "publish_failed";
          throw new Error(detail);
        }
        await queryClient.invalidateQueries({ queryKey: metaCampaignKeys.byCompany(companyId) });
        await queryClient.invalidateQueries({ queryKey: ["meta-pending-approvals", companyId] });
        toast.success("Campagna pubblicata in PAUSED", {
          description: "Meta ha creato campagna, ad set e annunci senza attivarli.",
        });
      } finally {
        setIsPublishing(false);
      }
    },
    [companyId, meta, pixel.config, queryClient],
  );

  const view: ViewMode =
    mode === "quickstart"
      ? "quickstart"
      : mode === "create" || (mode === "edit" && editId)
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

  // Provider choice dialog — si apre quando l'utente clicca "Crea Campagna".
  // Forza scelta esplicita Meta vs Google PRIMA del wizard, perché i due
  // flussi sono completamente diversi (lead form Meta vs keyword Google).
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const openWizardNew = () => setProviderDialogOpen(true);

  // Dopo conferma scelta nel dialog → entra nel wizard (advanced) o nel
  // QuickStart (quick AI brief parser).
  const handleProviderConfirmed = useCallback(
    (
      platform: "meta" | "google",
      googleChannel?: "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX",
      setupMode?: "quick" | "advanced",
    ) => {
      const effectiveMode = setupMode ?? "advanced";
      const params: Record<string, string> = {
        mode: effectiveMode === "quick" ? "quickstart" : "create",
        platform,
      };
      if (platform === "google" && googleChannel) {
        params.googleChannel = googleChannel;
      }
      setSearchParams(params);
    },
    [setSearchParams],
  );

  const openWizardEdit = (id: string) => setSearchParams({ mode: "edit", edit: id });
  const openDetail = (id: string) => setSearchParams({ detail: id });
  const backToList = (tab: AdsTab = "campagne") => setSearchParams({ tab });

  const googleSpendByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const campaign of googleStats.campaigns) {
      const spendCents = Math.round(Number(campaign.spend ?? 0) * 100);
      if (campaign.campaign_id) map.set(normalizeLookup(campaign.campaign_id), spendCents);
      map.set(normalizeLookup(campaign.campaign_name), spendCents);
    }
    return map;
  }, [googleStats.campaigns]);

  const draftRows: CampaignRow[] = useMemo(
    () =>
      drafts.map((draft) => {
        const base = draftToCampaignRow(draft);
        const platform = draft.builderState?.platform ?? "meta";
        const googleSpend =
          platform === "google"
            ? googleSpendByCampaign.get(normalizeLookup(draft.googleCampaignId)) ??
              googleSpendByCampaign.get(normalizeLookup(draft.name)) ??
              0
            : 0;
        const spentCents = googleSpend || base.spentCents;
        return {
          ...base,
          platform,
          spentCents,
          revenueCents: 0,
          roas: 0,
          googleChannel: platform === "google" ? draft.builderState?.googleChannel : undefined,
          draftRef: draft,
          googleCampaignId: draft.googleCampaignId,
        };
      }),
    [drafts, googleSpendByCampaign],
  );

  const businessMetrics = useAdsCampaignBusinessMetrics(companyId, draftRows);
  // Solo i draft reali contano per i KPI reali. SAMPLE_CAMPAIGNS sono demo.
  const realCampaigns = useMemo(
    () =>
      draftRows.map((campaign) => {
        const metrics = businessMetrics.byCampaign.get(campaign.id);
        if (!metrics) return campaign;
        return {
          ...campaign,
          spentCents: metrics.spendCents || campaign.spentCents,
          leads: metrics.leads,
          opportunities: metrics.opportunities,
          jobs: metrics.won,
          revenueCents: metrics.revenueCents,
          roas: metrics.roas,
        };
      }),
    [draftRows, businessMetrics.byCampaign],
  );
  const allCampaigns = useMemo(
    () => (showSamples ? [...realCampaigns, ...SAMPLE_CAMPAIGNS] : realCampaigns),
    [realCampaigns, showSamples],
  );

  // Spend Guard: il cap mensile arriva dal DB (ad_spend_guard) con fallback default
  const { config: spendGuardConfig } = useAdSpendGuard(companyId);

  const monthlySpend = realCampaigns.reduce((sum, c) => sum + c.spentCents, 0);
  const totalLeads = realCampaigns.reduce((sum, c) => sum + c.leads, 0);
  const totalJobs = realCampaigns.reduce((sum, c) => sum + c.jobs, 0);
  const totalRevenue = realCampaigns.reduce((sum, c) => sum + c.revenueCents, 0);
  const costPerLead = totalLeads ? monthlySpend / totalLeads : 0;
  const costPerJob = totalJobs ? monthlySpend / totalJobs : 0;
  const roas = monthlySpend ? totalRevenue / monthlySpend : 0;
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

  // ---- QUICK START (AI brief parser, 60s) ----
  if (view === "quickstart") {
    return (
      <div className="min-h-screen bg-slate-50/70">
        <QuickStartCampaign
          companyId={companyId}
          companyName={companyName}
          companyCity={effectiveCompany?.city ?? null}
          onCancel={() => backToList()}
          onConfirm={async (parsed) => {
            // Costruisci BuilderState a partire dal risultato AI
            const seeded: BuilderState = {
              ...DEFAULT_BUILDER,
              platform: (initialPlatformFromUrl ?? "meta") as "meta" | "google",
              googleChannel:
                initialPlatformFromUrl === "google" ? (initialGoogleChannelFromUrl ?? "SEARCH") : undefined,
              name: parsed.name,
              objective: parsed.objective,
              offer: parsed.offer,
              dailyBudget: parsed.dailyBudget,
              ageMin: parsed.ageMin,
              ageMax: parsed.ageMax,
              gender: parsed.gender,
              cta: parsed.cta,
              zone: parsed.suggestedCities[0] ?? DEFAULT_BUILDER.zone,
              interests: parsed.suggestedInterests.join(", "),
              copyBrief: parsed.offer,
              copyVariants: [parsed.copy, ...parsed.hooks].slice(0, 5).filter(Boolean),
              imagePrompt: `Foto realistica per campagna "${parsed.name}". ${parsed.offer}`,
            };
            seeded.adSets = buildDefaultAdSets(seeded);
            seeded.creatives = buildDefaultCreatives(seeded);
            try {
              const draft = await saveDraft(seeded);
              toast.success("Bozza creata in 60 secondi!", {
                description: `${draft.name} è in PAUSED — revisionala e pubblica quando vuoi.`,
              });
              openDetail(draft.id);
            } catch (err) {
              toast.error("Errore salvataggio", { description: String((err as Error).message ?? err) });
            }
          }}
          onCustomize={(parsed) => {
            // Apri il wizard pieno con i campi precompilati via sessionStorage
            try {
              sessionStorage.setItem("ads_quickstart_seed", JSON.stringify(parsed));
            } catch { /* ignore */ }
            setSearchParams({
              mode: "create",
              platform: initialPlatformFromUrl ?? "meta",
              ...(initialPlatformFromUrl === "google" && initialGoogleChannelFromUrl
                ? { googleChannel: initialGoogleChannelFromUrl }
                : {}),
            });
          }}
        />
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
          <ConnectionPill meta={meta} google={google} />
          <div className="mt-5">
            <CampaignBuilderTab
              companyName={companyName}
              companyId={companyId}
              initialState={initialState}
              initialPlatform={initialPlatformFromUrl}
              initialGoogleChannel={initialGoogleChannelFromUrl}
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
                      description: `${draft.name} è pronta per revisione prima della pubblicazione.`,
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
    const draftPlatform = draft.builderState?.platform ?? "meta";
    const publishQa =
      draftPlatform === "google" ? getGooglePublishQa(draft, google) : getPublishQa(draft, meta, pixel.config);
    return (
      <div className="min-h-screen bg-slate-50/70">
        <DetailHeader
          draft={draft}
          onBack={() => backToList()}
          onEdit={() => openWizardEdit(draft.id)}
          onRequestReview={() => requestReview(draft)}
          onPublish={() => publishDraft(draft)}
          isPublishing={isPublishing}
          canPublish={draftPlatform === "meta" && canPublishToMeta && publishQa.blockers.length === 0}
          publishBlockers={publishQa.blockers}
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
      {/* Provider scelta — Meta vs Google — prima del wizard */}
      <ProviderChoiceDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        onConfirm={handleProviderConfirmed}
      />
      <ListHeader onCreate={openWizardNew} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <ConnectionPill meta={meta} google={google} />

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
              totalRevenue={totalRevenue}
              costPerLead={costPerLead}
              costPerJob={costPerJob}
              roas={roas}
              showSamples={showSamples}
              onToggleSamples={setShowSamples}
              isLoading={
                allCampaigns.length === 0 &&
                (campaignsLoading || googleCampaignsLoading || businessMetrics.isLoading)
              }
              onCreate={openWizardNew}
              onOpenCampaign={(c) => {
                if (c.source === "local") openDetail(c.id);
                else toast.info(`Anteprima campagna ${platformLabel(c.platform)} — disponibile dopo il collegamento live`);
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
            <SettingsTab meta={meta} google={google} companyId={companyId} />
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
              Meta + Google Ads
            </Badge>
            <Badge className="border-slate-200 bg-white text-slate-600" variant="outline">
              Pubblicazione live disattivata
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Pubblicità</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Crea richieste preventivo qualificate da Meta e Google Ads senza confondere i due canali. Le bozze restano separate, mentre KPI CRM, vendite, fatturato e ROAS sono letti insieme.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild>
            <Link to="/azienda/impostazioni/integrazioni">
              <Settings className="h-4 w-4" />
              Collega Ads
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
            {editing ? draftName ?? "Bozza" : "Crea una campagna Ads passo passo"}
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
  onRequestReview,
  onPublish,
  isPublishing = false,
  canPublish = false,
  publishBlockers = [],
  onDelete,
}: {
  draft: LocalCampaignDraft;
  onBack: () => void;
  onEdit: () => void;
  onRequestReview?: () => Promise<void> | void;
  onPublish?: () => Promise<void> | void;
  isPublishing?: boolean;
  canPublish?: boolean;
  publishBlockers?: string[];
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const status = draft.status ?? "draft";
  const canRequestReview = status === "draft" || status === "error";
  const handlePublish = async () => {
    if (!onPublish) return;
    try {
      await onPublish();
    } catch (err) {
      toast.error("Pubblicazione bloccata", {
        description: String((err as Error).message ?? err),
      });
    }
  };
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
              <Badge variant="outline" className={statusClass(status)}>
                {statusLabel(status)}
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
          {canRequestReview && onRequestReview && (
            <Button variant="outline" onClick={() => void onRequestReview()}>
              <ShieldCheck className="h-4 w-4" />
              Invia in review
            </Button>
          )}
          {onPublish && (
            <Button
              onClick={() => void handlePublish()}
              disabled={!canPublish || isPublishing}
              title={!canPublish ? publishBlockers[0] ?? "Completa la QA pre-pubblicazione" : undefined}
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Pubblica PAUSED
            </Button>
          )}
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Modifica completa
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Elimina
          </Button>
        </div>
        {onPublish && publishBlockers.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 lg:max-w-md">
            <p className="font-semibold">QA pre-pubblicazione bloccante</p>
            <p className="mt-1">{publishBlockers.slice(0, 2).join(" · ")}</p>
          </div>
        )}
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
function ConnectionPill({
  meta,
  google,
}: {
  meta: ReturnType<typeof useMetaConnection>;
  google: ReturnType<typeof useGoogleAdsConnection>;
}) {
  const metaConnected = meta.integration?.status === "connected";
  const metaReady = metaConnected && meta.adAccounts.length > 0 && meta.pages.length > 0;
  const googleConnected = google.integration?.status === "connected";
  const googleReady = googleConnected && google.accounts.length > 0;
  const anyMissing = !metaReady || !googleReady;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ConnectionChip
          loading={meta.isLoading}
          connected={metaReady}
          label="Meta Ads"
          detail={
            metaReady
              ? `${meta.adAccounts.length} ad account · ${meta.pages.length} pagine`
              : metaConnected
                ? meta.adAccounts.length === 0
                  ? "ad account da configurare"
                  : "pagina da configurare"
                : "non collegato"
          }
          tone="blue"
        />
        <ConnectionChip
          loading={google.isLoading}
          connected={googleReady}
          label="Google Ads"
          detail={
            googleReady
              ? `${google.accounts.length} customer ID${google.selectedAccount?.customer_name ? ` · ${google.selectedAccount.customer_name}` : ""}`
              : googleConnected
                ? "Customer ID da configurare"
              : "non collegato"
          }
          tone="amber"
        />
      </div>
      {anyMissing && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs underline" asChild>
          <Link to="/azienda/impostazioni/integrazioni">Configura integrazioni</Link>
        </Button>
      )}
    </div>
  );
}

function ConnectionChip({
  loading,
  connected,
  label,
  detail,
  tone,
}: {
  loading: boolean;
  connected: boolean;
  label: string;
  detail: string;
  tone: "blue" | "amber";
}) {
  const toneClass =
    connected
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1", toneClass)}>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : connected ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      <span className="font-semibold">{label}</span>
      <span className="text-xs opacity-80">{detail}</span>
    </span>
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
  totalRevenue,
  costPerLead,
  costPerJob,
  roas,
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
  totalRevenue: number;
  costPerLead: number;
  costPerJob: number;
  roas: number;
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
        totalRevenue={totalRevenue}
        costPerLead={costPerLead}
        costPerJob={costPerJob}
        roas={roas}
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
  totalRevenue,
  costPerLead,
  costPerJob,
  roas,
  draftsCount,
}: {
  monthlySpend: number;
  monthlyCap: number;
  spendPct: number;
  totalLeads: number;
  totalJobs: number;
  totalRevenue: number;
  costPerLead: number;
  costPerJob: number;
  roas: number;
  draftsCount: number;
}) {
  const isEmpty = monthlySpend === 0 && totalLeads === 0 && draftsCount === 0;
  // In BETA "Costo per commessa" è sempre 0 perché manca attribuzione live.
  // La mostriamo SOLO se totalJobs > 0 (cioè quando dati reali ci sono).
  const showCostPerJob = totalJobs > 0;

  // MIGL: alert CPL fuori soglia. Threshold edilizia tipico: lead qualificato
  // €30-50, oltre €70 inizia a essere preoccupante. Mostrato solo se hai speso
  // almeno €100 e ricevuto almeno 1 lead (così CPL è significativo).
  const TARGET_CPL_CENTS_HIGH = 7000; // €70 per lead — soglia di attenzione edilizia
  const cplWarning = monthlySpend >= 10000 && totalLeads > 0 && costPerLead > TARGET_CPL_CENTS_HIGH;
  const lowVolumeWarning = monthlySpend >= 30000 && totalLeads <= 2; // €300+ spesi, max 2 lead

  // MIGL: forecast mensile basato sul ritmo attuale.
  // Esempio: oggi è il 10 del mese, ho speso 300€, allora forecast = 300 * (30/10) = 900€.
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthlySpendForecast = dayOfMonth > 0 ? Math.round((monthlySpend / dayOfMonth) * daysInMonth) : 0;
  const forecastOverCap = monthlyCap > 0 && monthlySpendForecast > monthlyCap;

  // MIGL: alert soft a 75% del cap (prima del 100% che fa auto-pause).
  const spendingWarning = monthlyCap > 0 && spendPct >= 75 && spendPct < 100;
  const spendingCritical = monthlyCap > 0 && spendPct >= 100;
  return (
    <Card className={cn(isEmpty && "border-dashed bg-white/60")}>
      <CardContent className="p-4">
        {/* MIGL: alert proattivi su CPL alto o lead bassi */}
        {(cplWarning || lowVolumeWarning) && (
          <div className={cn(
            "mb-3 flex items-start gap-3 rounded-lg border p-3",
            cplWarning ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60",
          )}>
            <span className="text-base">{cplWarning ? "🚨" : "⚠️"}</span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", cplWarning ? "text-red-900" : "text-amber-900")}>
                {cplWarning ? `CPL alto: ${formatEuro(costPerLead)} per lead` : `Volume basso: ${totalLeads} lead con €${(monthlySpend / 100).toFixed(0)} spesi`}
              </p>
              <p className={cn("text-xs mt-0.5", cplWarning ? "text-red-700" : "text-amber-700")}>
                {cplWarning
                  ? "Per edilizia il CPL atteso è €30-50. Sopra €70 vale la pena rivedere targeting/copy/landing."
                  : "Pochi lead per la spesa attuale. Potrebbe essere: pubblico troppo stretto, creatività debole, o landing non convertente."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft:
                cplWarning
                  ? `Il mio CPL è €${(costPerLead / 100).toFixed(2)} (target edilizia €30-50). Spesa mensile €${(monthlySpend / 100).toFixed(0)}, ${totalLeads} lead. Diagnostica: cosa sta facendo salire il CPL? Dimmi top 3 cause + cosa fare nei prossimi 7 giorni.`
                  : `Sto spendendo €${(monthlySpend / 100).toFixed(0)}/mese ma ho solo ${totalLeads} lead. Cosa controllo? Targeting troppo stretto, copy debole, landing non convertente? Spiegami come capire la causa e quale leva tirare per prima.`
              }}))}
              className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Sparkles className="mr-1 inline h-3 w-3" />
              Chiedi a Silvio
            </button>
          </div>
        )}
        <div
          className={cn(
            "grid gap-4 sm:grid-cols-2",
            showCostPerJob ? "lg:grid-cols-5" : "lg:grid-cols-4",
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
          <KpiItem
            icon={Euro}
            tone="green"
            label="Fatturato generato"
            value={totalRevenue ? formatEuro(totalRevenue) : "—"}
            detail={totalRevenue > 0 ? `ROAS ${roas.toFixed(2)}x` : "vendite vinte da CRM"}
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
          <Progress
            value={spendPct}
            className="h-2 bg-slate-100"
            indicatorClassName={cn(spendingCritical ? "bg-red-500" : spendingWarning ? "bg-amber-500" : "bg-orange-500")}
          />
          {/* MIGL: forecast + alert spending */}
          {monthlyCap > 0 && monthlySpend > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className={cn(
                "rounded-lg border p-2.5 text-xs",
                forecastOverCap ? "border-red-200 bg-red-50/60 text-red-900" : "border-slate-200 bg-slate-50 text-slate-700",
              )}>
                <p className="font-semibold uppercase tracking-wider text-[10px] opacity-70">
                  Forecast fine mese
                </p>
                <p className="mt-0.5 text-sm font-bold">
                  ≈ {formatEuro(monthlySpendForecast)}
                  {forecastOverCap && <span className="ml-1.5 text-[10px] font-normal">(sforerai il cap di {formatEuro(monthlySpendForecast - monthlyCap)})</span>}
                </p>
                <p className="mt-0.5 text-[10px] opacity-70">se mantieni ritmo {formatEuro(Math.round(monthlySpend / dayOfMonth))}/giorno</p>
              </div>
              <div className={cn(
                "rounded-lg border p-2.5 text-xs",
                spendingCritical ? "border-red-200 bg-red-50/60 text-red-900" :
                spendingWarning ? "border-amber-200 bg-amber-50/60 text-amber-900" :
                "border-emerald-200 bg-emerald-50/40 text-emerald-900",
              )}>
                <p className="font-semibold uppercase tracking-wider text-[10px] opacity-70">
                  {spendingCritical ? "⚠️ Cap raggiunto" : spendingWarning ? "🟡 Vicino al cap" : "✓ Sotto controllo"}
                </p>
                <p className="mt-0.5 text-sm font-bold">{spendPct}% usato</p>
                <p className="mt-0.5 text-[10px] opacity-70">
                  {spendingCritical ? "Auto-pause attiva" :
                   spendingWarning ? `Mancano ${formatEuro(monthlyCap - monthlySpend)} prima del cap` :
                   `${formatEuro(monthlyCap - monthlySpend)} ancora disponibili`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* MIGL: 3 CTA Silvio per assistenza imprenditore */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <SilvioAdsButton
            label="Diagnostica campagne"
            description="Perché spendo tanto e ho pochi lead?"
            prompt={
              `Analizza le mie campagne pubblicitarie. ` +
              `Mese in corso: spesa €${(monthlySpend / 100).toFixed(0)}, ${totalLeads} lead, ` +
              `CPL ${costPerLead ? `€${(costPerLead / 100).toFixed(2)}` : "n/d"}, ROAS ${roas.toFixed(2)}x. ` +
              `Forecast fine mese: €${(monthlySpendForecast / 100).toFixed(0)}. ` +
              `Diagnostica: identifica top 3 cause di inefficienza e dimmi cosa fare nei prossimi 7 giorni. ` +
              `Tono diretto, italiano colloquiale per imprenditore edile.`
            }
          />
          <SilvioAdsButton
            label="Budget ottimale"
            description="Quanto investire per il mio target?"
            prompt={
              `Suggerisci un budget pubblicitario ottimale Meta+Google per la mia azienda edile. ` +
              `Spesa attuale: €${(monthlySpend / 100).toFixed(0)}/mese, target lead/mese non specificato. ` +
              `Considera: ${totalLeads} lead/mese ricevuti, costo per lead €${(costPerLead / 100).toFixed(0)}, ` +
              `cap mensile €${(monthlyCap / 100).toFixed(0)}. ` +
              `Dimmi: (1) budget consigliato per €1k-€5k-€10k mensili di obiettivo, ` +
              `(2) come distribuirlo tra Meta vs Google, (3) primo mese vs mesi successivi.`
            }
          />
          <SilvioAdsButton
            label="Scrivi copy"
            description="3 varianti per un nuovo annuncio"
            prompt={
              `Scrivi 3 varianti di copy pubblicitario per la mia azienda edile. ` +
              `Tono: italiano colloquiale, focus sul valore concreto per il cliente. ` +
              `Per ogni variante: (a) headline max 40 caratteri, (b) testo max 125 caratteri, ` +
              `(c) CTA precisa, (d) tipo di immagine consigliata. ` +
              `Variante 1: focus prezzo/preventivo gratis. ` +
              `Variante 2: focus qualità/anni di esperienza. ` +
              `Variante 3: focus velocità/disponibilità immediata.`
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SilvioAdsButton({ label, description, prompt }: { label: string; description: string; prompt: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft: prompt } }))}
      className="group flex flex-col items-start gap-1 rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50/60 to-amber-50/40 p-3 text-left transition hover:border-orange-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-orange-600" />
        <span className="text-sm font-semibold text-slate-900">{label}</span>
      </div>
      <span className="text-[11px] text-slate-600">{description}</span>
      <span className="mt-auto text-[10px] font-bold text-orange-700 opacity-70 group-hover:opacity-100">Chiedi a Silvio →</span>
    </button>
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
  const [platformFilter, setPlatformFilter] = useState<"all" | "meta" | "google">("all");
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
      published: 0,
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
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (!term) return true;
      const haystack = `${c.name} ${objectiveLabel(c.objective)} ${statusLabel(c.status)} ${
        c.source === "local" ? "bozza" : c.platform
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [campaigns, search, statusFilter, platformFilter]);

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
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as typeof platformFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Piattaforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Meta + Google</SelectItem>
                <SelectItem value="meta">Solo Meta Ads</SelectItem>
                <SelectItem value="google">Solo Google Ads</SelectItem>
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
                    <TableHead className="text-right">Vendite</TableHead>
                    <TableHead className="text-right">Fatturato</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
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
                            <Badge variant="outline" className={platformBadgeClass(campaign.platform)}>
                              {platformLabel(campaign.platform)}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {objectiveLabel(campaign.objective)} ·{" "}
                            {campaign.source === "local" ? "bozza locale" : platformLabel(campaign.platform)}
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
                          <p className="font-medium text-slate-900">{structurePrimary(campaign)}</p>
                          <p className="text-xs text-slate-500">{structureSecondary(campaign)}</p>
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
                      <TableCell className="text-right font-semibold text-emerald-700">
                        {campaign.revenueCents ? formatEuro(campaign.revenueCents) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.roas ? `${campaign.roas.toFixed(2)}x` : "—"}
                      </TableCell>
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
                                        toast.info(`Azione ${platformLabel(campaign.platform)} non attiva in Beta locale`)
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
                        <Badge variant="outline" className={platformBadgeClass(campaign.platform)}>
                          {platformLabel(campaign.platform)}
                        </Badge>
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
                    <MiniStat label="Fatturato" value={campaign.revenueCents ? formatEuro(campaign.revenueCents) : "—"} />
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
      <p className="text-lg font-bold text-slate-950">Crea la tua prima campagna Ads</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Il wizard ti fa scegliere Meta o Google e poi adatta offerta, pubblico/intenti, creatività e revisione. Tutto resta in bozza finché non confermi il lancio.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Nuova campagna guidata
        </Button>
        <Button variant="outline" asChild>
          <Link to="/azienda/impostazioni/integrazioni">
            <Settings className="h-4 w-4" />
            Collega Ads
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
  initialPlatform,
  initialGoogleChannel,
  isEditing = false,
}: {
  onSaveDraft: (state: BuilderState) => void;
  onCancel: () => void;
  companyName?: string;
  companyId?: string;
  initialState?: BuilderState | null;
  /** Se aperto da ProviderChoiceDialog, forza la piattaforma scelta. */
  initialPlatform?: "meta" | "google";
  initialGoogleChannel?: "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX";
  isEditing?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<BuilderState>(() => {
    const base = initialState ?? DEFAULT_BUILDER;
    if (initialPlatform && !initialState) {
      return {
        ...base,
        platform: initialPlatform,
        googleChannel: initialPlatform === "google" ? (initialGoogleChannel ?? "SEARCH") : undefined,
        conversionPlace: initialPlatform === "google" ? "landing_page" : base.conversionPlace,
      };
    }
    return base;
  });
  const { generateCopy, isGeneratingCopy } = useAdsAi(companyId);
  const totalDailyBudget = getCampaignDailyBudget(state);
  const dailyBudgetCents = totalDailyBudget * 100;
  const overApprovalLimit = totalDailyBudget > 30;
  const readiness = getReadinessScore(state);

  // Validazione per step (atomica) — utile sia per gating della navigation che per next button.
  const stepValidity = useMemo(() => {
    // STEP 1: offerta + nome + obiettivo
    const v1 = state.name.trim().length >= 3 && state.offer.trim().length >= 12 && !!state.objective;

    // STEP 2: pubblico — supporta ENTRAMBI i percorsi (v1 zone string, v2 metaGeoLocations[])
    const hasV2Geo = (state.metaGeoLocations?.filter((g) => !g.excluded).length ?? 0) > 0;
    const hasV1Geo = state.zone.trim().length >= 2;
    const hasGeo = hasV2Geo || hasV1Geo;
    const v2 =
      hasGeo &&
      state.ageMin <= state.ageMax &&
      // Lingua: o legacy `languages` string, o `metaLocaleTags[]` ha almeno 1
      (state.languages.trim().length >= 2 || (state.metaLocaleTags?.length ?? 0) > 0) &&
      state.adSets.length > 0 &&
      state.adSets.every(
        (adSet) =>
          adSet.name.trim().length >= 2 && adSet.dailyBudget >= 5 && (state.advantageAudience || adSet.audience.trim().length >= 3),
      );

    // STEP 3: modulo — supporta ENTRAMBI (v1 requiredFields string + privacyUrl, v2 metaLeadForm)
    const lf = state.metaLeadForm;
    const v2Form = lf && lf.questions.length >= 2 && isValidHttpsUrl(lf.privacyPolicyUrl);
    const v1Form =
      state.requiredFields.trim().length >= 8 &&
      state.privacyUrl.trim().startsWith("https://");
    const v3 = (v2Form || v1Form) && state.followUp.trim().length >= 10;

    // STEP 4: copy — supporta ENTRAMBI (v1 copyVariants, v2 copyTitles/copyDescriptions/copyHooks)
    const hasV2Copy = (state.copyTitles?.length ?? 0) > 0 || (state.copyDescriptions?.length ?? 0) > 0 || (state.copyHooks?.length ?? 0) > 0;
    const v2CopyOk = hasV2Copy && (
      (state.copyTitles ?? []).every((t) => !t || t.trim().length >= 5) &&
      (state.copyDescriptions ?? []).every((d) => !d || d.trim().length >= 20) &&
      (state.copyHooks ?? []).every((h) => !h || h.trim().length >= 10)
    );
    const v1CopyOk = state.copyVariants.length > 0 && state.copyVariants.every((copy) => copy.trim().length >= 20);
    const v4 =
      (v2CopyOk || v1CopyOk) &&
      state.imagePrompt.trim().length >= 20 &&
      state.creatives.length > 0 &&
      state.creatives.every((creative) => creative.prompt.trim().length >= 20);

    const v5 = readiness.score >= 60;
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

  const addCreative = (format: CreativeFormat, angle?: CreativeAngle) => {
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
        angle
          ? { ...buildCreativeFromAngle(angle, prev.copyBrief || prev.offer, prev.imagePrompt), id: `creative-${angle}-${Date.now()}` }
          : {
              id: `creative-${format}-${Date.now()}`,
              format,
              title: labels[format],
              hook: "Hook da testare",
              goal: "Capire se questo formato porta lead piu qualificati.",
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
              {/* PLATFORM RECAP — la scelta è già stata fatta nel ProviderChoiceDialog */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-2 px-2.5 py-1",
                      state.platform === "meta"
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-amber-300 bg-amber-50 text-amber-800",
                    )}
                  >
                    {state.platform === "meta" ? (
                      <>📘 Meta Ads (Facebook + Instagram)</>
                    ) : (
                      <>
                        🟧 Google Ads
                        {state.googleChannel && state.googleChannel !== "SEARCH" && (
                          <> · {state.googleChannel}</>
                        )}
                      </>
                    )}
                  </Badge>
                  <span className="text-xs text-slate-500">Piattaforma scelta</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel()}
                  className="text-xs text-slate-600"
                >
                  Cambia piattaforma →
                </Button>
              </div>
              {/* OFFERTA AI — sostituisce il vecchio TemplateSelector statico.
                  L'AI legge il profilo aziendale (companies) e propone 3 offerte
                  candidate costruite sui 7 parametri di un'offerta vincente. */}
              <OfferBuilderPanel
                companyId={companyId}
                segmentHint={state.templateId}
                currentOffer={state.offer}
                onChooseOffer={(ad) => {
                  setState((prev) => {
                    const next: BuilderState = {
                      ...prev,
                      // L'annuncio scelto popola lo state
                      offer: ad.primary_text,
                      cta: ad.cta as BuilderState["cta"],
                      copyBrief: ad.primary_text,
                      imagePrompt: ad.image_prompt || prev.imagePrompt,
                    };
                    // Hook → copyHooks[0]
                    if (ad.hook) {
                      next.copyHooks = [ad.hook, ...(prev.copyHooks ?? []).filter((h) => h !== ad.hook)].slice(0, 5);
                    }
                    // Title → copyTitles[0]
                    if (ad.title) {
                      next.copyTitles = [ad.title, ...(prev.copyTitles ?? []).filter((t) => t !== ad.title)].slice(0, 5);
                    }
                    // Primary text → copyDescriptions[0]
                    if (ad.primary_text) {
                      next.copyDescriptions = [ad.primary_text, ...(prev.copyDescriptions ?? []).filter((d) => d !== ad.primary_text)].slice(0, 5);
                    }
                    // Ricostruisci ad sets coerenti
                    next.adSets = buildDefaultAdSets(next);
                    return next;
                  });
                  toast.success(`Annuncio ${ad.framework} applicato`, {
                    description: "Hook, titolo e descrizione sono già in 'Creatività' (step 4). Continua per pubblico.",
                  });
                }}
              />
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
                      {getConversionPlaceOptions(state.platform).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
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

          {step === 2 && state.platform === "meta" && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <GuidanceCard title="Locale prima" body="Per edilizia e serramenti parti da città/provincia e raggio realistico, poi allarghi solo se i lead diventano opportunità." />
                <GuidanceCard title="Non stringere troppo" body="Interessi utili sì, ma troppi vincoli riducono il bacino e impediscono all'algoritmo di imparare." />
                <GuidanceCard title="Usa dati reali" body="Clienti già chiusi, lead buoni e visitatori sito alimentano retargeting e lookalike." />
              </div>
              {/* === META TARGETING PANEL — multi-luogo, interests reali, placements === */}
              <MetaTargetingPanel
                companyId={companyId}
                value={{
                  geoLocations: state.metaGeoLocations ?? [],
                  interestTags: state.metaInterestTags ?? [],
                  excludedInterestTags: state.metaExcludedInterestTags ?? [],
                  localeTags: state.metaLocaleTags ?? [],
                  placements: state.metaPlacements ?? { automatic: true },
                  ageMin: state.ageMin,
                  ageMax: state.ageMax,
                  gender: state.gender,
                  advantageAudience: state.advantageAudience,
                }}
                onChange={(next) => {
                  setState((prev) => {
                    const merged: BuilderState = {
                      ...prev,
                      ...(next.ageMin !== undefined ? { ageMin: next.ageMin } : {}),
                      ...(next.ageMax !== undefined ? { ageMax: next.ageMax } : {}),
                      ...(next.gender !== undefined ? { gender: next.gender } : {}),
                      ...(next.advantageAudience !== undefined ? { advantageAudience: next.advantageAudience } : {}),
                      ...(next.geoLocations !== undefined ? { metaGeoLocations: next.geoLocations } : {}),
                      ...(next.interestTags !== undefined ? { metaInterestTags: next.interestTags } : {}),
                      ...(next.excludedInterestTags !== undefined ? { metaExcludedInterestTags: next.excludedInterestTags } : {}),
                      ...(next.localeTags !== undefined ? { metaLocaleTags: next.localeTags } : {}),
                      ...(next.placements !== undefined ? { metaPlacements: next.placements } : {}),
                    };
                    // Sync legacy fields (zone, interests, languages) per backward-compat
                    // con codice che legge ancora la stringa.
                    if (next.geoLocations !== undefined) {
                      const firstIncluded = next.geoLocations.find((g) => !g.excluded);
                      merged.zone = firstIncluded?.name ?? "";
                      if (firstIncluded?.radius_km) merged.radiusKm = firstIncluded.radius_km;
                    }
                    if (next.interestTags !== undefined) {
                      merged.interests = next.interestTags.map((t) => t.name).join(", ");
                    }
                    if (next.localeTags !== undefined && next.localeTags.length > 0) {
                      merged.languages = next.localeTags.map((l) => l.name).join(", ");
                    }
                    // Ricostruisci ad-set di default coerenti
                    merged.adSets = buildDefaultAdSets(merged);
                    return merged;
                  });
                }}
              />

              <AudienceControlsPanel state={state} setState={setState} />
              <AdSetPlanner
                adSets={state.adSets}
                totalBudget={totalDailyBudget}
                onAdd={addAdSet}
                onRemove={removeAdSet}
                onUpdate={updateAdSet}
              />
            </div>
          )}

          {step === 2 && state.platform === "google" && (
            <div className="space-y-5">
              <Alert className="border-amber-200 bg-amber-50">
                <Info className="h-4 w-4 text-amber-700" />
                <AlertTitle>Targeting Google Ads</AlertTitle>
                <AlertDescription className="text-xs">
                  Google lavora su intenti di ricerca, asset e segnali. Search usa keyword e negative keyword; Performance Max usa asset group, audience signal e conversioni CRM.
                </AlertDescription>
              </Alert>
              <div className="grid gap-3 md:grid-cols-3">
                <GuidanceCard title="Intento prima del volume" body="Parti da ricerche con bisogno esplicito: preventivo, costo, vicino a me, sostituzione, ristrutturazione." />
                <GuidanceCard title="Esclusioni forti" body="Blocca ricerche da fai-da-te, lavoro, gratis, tutorial, materiale usato e zone non servite." />
                <GuidanceCard title="Offline conversion" body="Lead, appuntamento e vendita vanno rimandati a Google Ads per far imparare Smart Bidding sul valore reale." />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Zona principale">
                  <Input value={state.zone} onChange={(e) => setState((p) => ({ ...p, zone: e.target.value }))} placeholder="Es. Milano, Monza, Brianza" />
                </Field>
                <Field label="Lingue">
                  <Input value={state.languages} onChange={(e) => setState((p) => ({ ...p, languages: e.target.value }))} placeholder="Italiano" />
                </Field>
              </div>
              <Field label="Keyword (separate da virgola)">
                <Textarea
                  value={state.interests}
                  onChange={(e) => setState((p) => ({ ...p, interests: e.target.value }))}
                  className="min-h-24"
                  placeholder='Es. "ristrutturazione bagno Milano", "preventivo infissi Brianza", "sostituzione finestre"'
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Keyword negative / ricerche da escludere">
                  <Textarea
                    value={state.customAudienceSource}
                    onChange={(e) => setState((p) => ({ ...p, customAudienceSource: e.target.value }))}
                    className="min-h-20"
                    placeholder="gratis, fai da te, lavoro, tutorial, materiale usato, ikea..."
                  />
                </Field>
                <Field label="Segnali audience / PMax">
                  <Textarea
                    value={state.lookalikeSource}
                    onChange={(e) => setState((p) => ({ ...p, lookalikeSource: e.target.value }))}
                    className="min-h-20"
                    placeholder="Clienti migliori, liste CRM, visitatori sito, categorie interessate, brand competitor..."
                  />
                </Field>
              </div>
            </div>
          )}

          {/* LEGACY UI nascosta — vecchio step 2 lasciato come fallback (non usato per nuove campagne).
              Mantenuto nel source per riferimento storico ma reso effettivamente
              dead code via `LEGACY_LOGIC_ENABLED` (constant false alla compile). */}
          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {(false as boolean) && step === 2 && (
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
                <AlertTitle>Modulo di contatto — come Meta Lead Ads</AlertTitle>
                <AlertDescription>
                  Configura il form esattamente come appare a chi clicca l'annuncio: tipologia,
                  campi pre-compilati Meta, domande qualificanti, privacy e schermata "grazie".
                </AlertDescription>
              </Alert>

              <MetaLeadFormBuilder
                value={state.metaLeadForm ?? buildInitialLeadForm(state)}
                onChange={(next) => {
                  setState((prev) => ({
                    ...prev,
                    metaLeadForm: next,
                    // Sync legacy fields per backward-compat con codice ad/serializer
                    formIntent: next.formType === "MORE_VOLUME" ? "volume" : "higher_intent",
                    privacyUrl: next.privacyPolicyUrl,
                    requiredFields: next.questions
                      .map((q) => q.kind === "prefilled" ? q.key.toLowerCase() : (q as { label: string }).label)
                      .join(", "),
                    qualityQuestion: next.questions.find((q) => q.kind === "custom")?.label
                      ? (next.questions.find((q) => q.kind === "custom") as { label: string }).label
                      : prev.qualityQuestion,
                  }));
                }}
                defaultOffer={state.offer}
                defaultCompanyName={companyName}
              />

              <div className="rounded-2xl border bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Follow-up automatico</h3>
                <p className="mb-2 text-xs text-slate-500">
                  Cosa succede sul tuo CRM appena arriva un lead da questo modulo.
                </p>
                <Textarea
                  value={state.followUp}
                  onChange={(event) => update("followUp", event.target.value)}
                  className="min-h-20"
                  placeholder="Es. Crea lead CRM, assegna al commerciale, invia WhatsApp entro 5 minuti."
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              {/* Brief — usato come input per AI */}
              <Field label="Brief per il copy AI (cosa vuoi comunicare)">
                <Textarea
                  value={state.copyBrief}
                  onChange={(event) => update("copyBrief", event.target.value)}
                  className="min-h-20"
                  placeholder="Es. Sopralluogo gratuito, posa certificata, detrazioni fiscali incluse."
                />
              </Field>

              {/* === 3-BLOCK COPY EDITOR (titoli + descrizioni + hook) === */}
              <CampaignCopyEditor
                companyId={companyId}
                brief={state.copyBrief || state.offer}
                segment={state.templateId}
                zone={state.zone}
                offer={state.offer}
                value={{
                  titles: state.copyTitles ?? [],
                  descriptions: state.copyDescriptions ?? state.copyVariants ?? [],
                  hooks: state.copyHooks ?? [],
                }}
                onChange={(next) => {
                  setState((prev) => ({
                    ...prev,
                    copyTitles: next.titles,
                    copyDescriptions: next.descriptions,
                    copyHooks: next.hooks,
                    // Sync legacy copyVariants per backward-compat con codice ad
                    copyVariants: next.legacyCopyVariants ?? next.descriptions,
                  }));
                }}
              />

              {/* === ASSET MEDIA — collega creatività dalla libreria === */}
              <div className="rounded-2xl border bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">🎨 Asset visivi</h4>
                    <p className="text-[11px] text-slate-500">
                      Carica o genera immagini/video nella scheda <strong>Creatività</strong>. Verranno usati come asset per gli annunci.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Naviga al tab Creatività mantenendo bozza state in sessionStorage
                      try {
                        sessionStorage.setItem("ads_wizard_resume", "1");
                      } catch { /* ignore */ }
                      window.open("/azienda/marketing/pubblicita?tab=creativita", "_blank");
                    }}
                  >
                    Apri Creatività ↗
                  </Button>
                </div>
                <Field label="Prompt immagine/video (per generazione AI nello studio)">
                  <Textarea
                    value={state.imagePrompt}
                    onChange={(event) => update("imagePrompt", event.target.value)}
                    className="min-h-20"
                    placeholder="Es. Foto realistica di infissi moderni in casa luminosa italiana, prima/dopo elegante."
                  />
                </Field>
              </div>

              <CreativeMixPlanner
                creatives={state.creatives}
                onAdd={addCreative}
                onRemove={removeCreative}
                onUpdate={updateCreative}
              />
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

          {step === 1 && (
            <OfferStrategyCheck
              state={state}
              onChange={(offerStrategy) => update("offerStrategy", offerStrategy)}
            />
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
              {/* Preview: prefer copyHooks[0] (stop-scroll) + copyDescriptions[0] (corpo) */}
              {state.copyHooks?.[0] && (
                <p className="mb-1 text-sm font-bold leading-tight text-slate-950">
                  {state.copyHooks[0]}
                </p>
              )}
              <p className="text-sm leading-relaxed text-slate-900">
                {state.copyDescriptions?.[0] ?? state.copyVariants[0] ?? state.offer}
              </p>
            </div>
            <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-slate-800 to-orange-500 text-white">
              <div className="text-center">
                <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm font-semibold">Creatività AI</p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs text-white/75">{state.imagePrompt}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t p-3">
              <div className="min-w-0">
                {/* Headline = primo titolo se presente, altrimenti nome campagna */}
                <p className="truncate text-sm font-semibold">{state.copyTitles?.[0] ?? state.name}</p>
                <p className="text-xs text-slate-500">{objectiveLabel(state.objective)}</p>
              </div>
              <Button size="sm" variant="secondary">
                {state.cta === "GET_QUOTE" ? "Preventivo" : state.cta === "WHATSAPP_MESSAGE" ? "WhatsApp" : "Scopri"}
              </Button>
            </div>
          </div>
          <CampaignStructurePreview state={state} />
          <LeadFormPreview state={state} />
        </CardContent>
      </Card>
    </div>
  );
}

function OfferStrategyCheck({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (offerStrategy: OfferStrategyState) => void;
}) {
  const strategy = state.offerStrategy ?? {};
  const averageTicket = Number(strategy.averageTicketEur ?? 0);
  const averageMargin = Number(strategy.averageMarginPct ?? 0);
  const maxCpl = Number(strategy.maxSustainableCplEur ?? 0);
  const grossMarginEur = averageTicket > 0 && averageMargin > 0 ? (averageTicket * averageMargin) / 100 : 0;
  const breakEvenLeadToSalePct = grossMarginEur > 0 && maxCpl > 0 ? (maxCpl / grossMarginEur) * 100 : 0;
  const checks = [
    averageTicket > 0,
    averageMargin > 0,
    maxCpl > 0,
    (strategy.serviceArea ?? state.zone).trim().length >= 3,
    (strategy.commercialCapacity ?? "").trim().length >= 8,
    (strategy.idealCustomer ?? "").trim().length >= 8,
    (strategy.urgency ?? "").trim().length >= 5,
    (strategy.seasonality ?? "").trim().length >= 5,
  ];
  const readyCount = checks.filter(Boolean).length;
  const score = Math.round((readyCount / checks.length) * 100);

  const setStrategy = <K extends keyof OfferStrategyState>(key: K, value: OfferStrategyState[K]) => {
    onChange({ ...strategy, [key]: value });
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Strategia offerta
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Check economico non vincolante: aiuta a capire se la campagna puo reggere CPL, appuntamenti e vendita.
          </p>
        </div>
        <Badge
          variant="outline"
          className={score >= 75 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
        >
          {readyCount}/{checks.length} segnali
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Ticket medio vendita">
          <Input
            type="number"
            min={0}
            value={strategy.averageTicketEur ?? ""}
            onChange={(event) => setStrategy("averageTicketEur", Math.max(0, Number(event.target.value || 0)))}
            placeholder="3500"
          />
        </Field>
        <Field label="Margine medio %">
          <Input
            type="number"
            min={0}
            max={100}
            value={strategy.averageMarginPct ?? ""}
            onChange={(event) => setStrategy("averageMarginPct", Math.max(0, Number(event.target.value || 0)))}
            placeholder="30"
          />
        </Field>
        <Field label="CPL massimo sostenibile">
          <Input
            type="number"
            min={0}
            value={strategy.maxSustainableCplEur ?? ""}
            onChange={(event) => setStrategy("maxSustainableCplEur", Math.max(0, Number(event.target.value || 0)))}
            placeholder={String(state.targetCpl || 25)}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Zona servibile">
          <Input
            value={strategy.serviceArea ?? state.zone}
            onChange={(event) => setStrategy("serviceArea", event.target.value)}
            placeholder="Comuni/province dove puoi lavorare davvero"
          />
        </Field>
        <Field label="Capacita commerciale">
          <Input
            value={strategy.commercialCapacity ?? ""}
            onChange={(event) => setStrategy("commercialCapacity", event.target.value)}
            placeholder="Lead/settimana e tempo massimo di risposta"
          />
        </Field>
        <Field label="Cliente ideale">
          <Textarea
            value={strategy.idealCustomer ?? ""}
            onChange={(event) => setStrategy("idealCustomer", event.target.value)}
            className="min-h-20"
            placeholder="Tipo immobile, budget, urgenza, decisore, zona"
          />
        </Field>
        <div className="grid gap-4">
          <Field label="Urgenza">
            <Input
              value={strategy.urgency ?? ""}
              onChange={(event) => setStrategy("urgency", event.target.value)}
              placeholder="Subito, 30 giorni, 90 giorni, solo preventivo"
            />
          </Field>
          <Field label="Stagionalita">
            <Input
              value={strategy.seasonality ?? ""}
              onChange={(event) => setStrategy("seasonality", event.target.value)}
              placeholder="Mesi forti/deboli e vincoli operativi"
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniStat label="Margine lordo stimato" value={grossMarginEur > 0 ? formatEuro(grossMarginEur * 100) : "—"} />
        <MiniStat label="Lead → vendita break-even" value={breakEvenLeadToSalePct > 0 ? `${breakEvenLeadToSalePct.toFixed(1)}%` : "—"} />
        <MiniStat label="CPL target wizard" value={formatEuro(state.targetCpl * 100)} />
      </div>
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
  const lf = state.metaLeadForm;
  // Preferisci metaLeadForm.questions; fallback su requiredFields stringa legacy
  const questions = lf
    ? lf.questions.map((q) => {
        if (q.kind === "prefilled") {
          const labels: Record<string, string> = {
            FULL_NAME: "Nome completo", EMAIL: "Email", PHONE: "Telefono",
            FIRST_NAME: "Nome", LAST_NAME: "Cognome", CITY: "Città", ZIP: "CAP",
            STREET_ADDRESS: "Indirizzo", STATE: "Provincia", COUNTRY: "Stato",
            DATE_OF_BIRTH: "Data nascita", GENDER: "Genere",
          };
          return { label: labels[q.key] ?? q.key, kind: "prefilled" as const, options: undefined as string[] | undefined };
        }
        const c = q as { label: string; options?: string[]; type: string };
        return { label: c.label, kind: "custom" as const, options: c.options };
      })
    : splitList(state.requiredFields).map((f) => ({ label: f, kind: "prefilled" as const, options: undefined }));
  const introBody = lf?.introBody ?? state.offer;
  const introHeadline = lf?.introHeadline;
  const qualifying = lf?.questions.find((q) => q.kind === "custom") as { label: string; options?: string[] } | undefined;
  const formTypeLabel = lf
    ? (lf.formType === "MORE_VOLUME" ? "Volume - più rapido" : "Higher Intent - revisione pre-invio")
    : (state.formIntent === "higher_intent" ? "Con revisione prima dell'invio" : "Veloce, meno passaggi");
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {state.platform === "google" ? "Destinazione lead Google" : "Modulo lead Meta"}
          </p>
          <p className="text-xs text-slate-500">{formTypeLabel}</p>
        </div>
        <Badge
          variant="outline"
          className={state.platform === "google"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-blue-200 bg-blue-50 text-blue-700"}
        >
          {conversionPlaceLabel(state.conversionPlace, state.platform)}
        </Badge>
      </div>
      {introHeadline && (
        <p className="mb-1 text-sm font-semibold text-slate-900">{introHeadline}</p>
      )}
      <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{introBody}</p>
      <p className="mt-3 text-[10px] font-semibold uppercase text-slate-500">Campi del modulo ({questions.length})</p>
      <div className="mt-1 grid gap-1.5">
        {questions.slice(0, 8).map((field, i) => (
          <div
            key={`${field.label}-${i}`}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium",
              field.kind === "custom" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-slate-200 bg-slate-50 text-slate-700",
            )}
          >
            <span className="truncate">{field.label}</span>
            <span className="text-[9px] text-slate-500">
              {field.kind === "custom" ? "custom" : "auto"}
              {field.options?.length ? ` · ${field.options.length} opz` : ""}
            </span>
          </div>
        ))}
        {questions.length > 8 && (
          <p className="text-[10px] text-slate-500">+ {questions.length - 8} altri campi</p>
        )}
      </div>
      {qualifying && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase text-emerald-700">Qualificazione</p>
          <p className="mt-1 text-sm text-emerald-900">{qualifying.label}</p>
          {qualifying.options && qualifying.options.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {qualifying.options.slice(0, 4).map((opt) => (
                <Badge key={opt} variant="outline" className="border-emerald-300 bg-white text-[9px] text-emerald-700">
                  {opt}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
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
                  <Input
                    type="number"
                    min={5}
                    max={500}
                    value={adSet.dailyBudget}
                    onChange={(event) => onUpdate(adSet.id, "dailyBudget", clampMetaBudget(Number(event.target.value || 0)))}
                  />
                  <span className="whitespace-nowrap text-sm text-slate-500">euro/giorno</span>
                </div>
              </Field>
              <Field label="Limite automatico min/max">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min={1} value={adSet.minDailyBudget} onChange={(event) => onUpdate(adSet.id, "minDailyBudget", Number(event.target.value || 0))} />
                  <Input type="number" min={1} value={adSet.maxDailyBudget} onChange={(event) => onUpdate(adSet.id, "maxDailyBudget", Number(event.target.value || 0))} />
                </div>
              </Field>
              <Field label="Raggio km (max 80)">
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={adSet.radiusKm}
                  onChange={(event) => onUpdate(adSet.id, "radiusKm", clampMetaRadius(Number(event.target.value || 0)))}
                />
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

function creativeAngleLabel(angle: CreativeAngle) {
  return CREATIVE_ANGLE_PRESETS.find((preset) => preset.angle === angle)?.label ?? angle;
}

function CreativeMixPlanner({
  creatives,
  onAdd,
  onRemove,
  onUpdate,
}: {
  creatives: CampaignCreative[];
  onAdd: (format: CreativeFormat, angle?: CreativeAngle) => void;
  onRemove: (id: string) => void;
  onUpdate: <K extends keyof CampaignCreative>(id: string, key: K, value: CampaignCreative[K]) => void;
}) {
  const formats: CreativeFormat[] = ["image", "video", "carousel", "story"];
  const coveredAngles = new Set(creatives.map((creative) => creative.angle).filter(Boolean));
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
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CREATIVE_ANGLE_PRESETS.map((preset) => {
          const covered = coveredAngles.has(preset.angle);
          return (
            <button
              key={preset.angle}
              type="button"
              onClick={() => onAdd(preset.format, preset.angle)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition",
                covered
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50",
              )}
            >
              <span className="font-semibold">{preset.label}</span>
              <span className="mt-0.5 block opacity-75">{covered ? "coperto" : creativeFormatLabel(preset.format)}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3">
        {creatives.map((creative) => (
          <div key={creative.id} className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
                  {creativeFormatLabel(creative.format)}
                </Badge>
                {creative.angle && (
                  <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
                    {creativeAngleLabel(creative.angle)}
                  </Badge>
                )}
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={creatives.length <= 1} onClick={() => onRemove(creative.id)}>
                Rimuovi
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome creatività">
                <Input value={creative.title} onChange={(event) => onUpdate(creative.id, "title", event.target.value)} />
              </Field>
              <Field label="Angolo">
                <Select value={creative.angle ?? ""} onValueChange={(value) => onUpdate(creative.id, "angle", value as CreativeAngle)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona angolo" />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATIVE_ANGLE_PRESETS.map((preset) => (
                      <SelectItem key={preset.angle} value={preset.angle}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-3">
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

function getConversionPlaceOptions(platform: BuilderState["platform"]) {
  if (platform === "google") {
    return [
      { value: "landing_page" as const, label: "Landing page con GCLID - migliore attribuzione" },
      { value: "instant_form" as const, label: "Lead form Google - più volume" },
      { value: "dual" as const, label: "Landing + form Google" },
    ];
  }

  return [
    { value: "instant_form" as const, label: "Modulo Meta nativo - più fluido da mobile" },
    { value: "landing_page" as const, label: "Landing page" },
    { value: "dual" as const, label: "Modulo Meta + landing" },
  ];
}

function conversionPlaceLabel(place: BuilderState["conversionPlace"], platform: BuilderState["platform"] = "meta") {
  const labels: Record<BuilderState["conversionPlace"], string> = platform === "google"
    ? {
        instant_form: "Lead form Google",
        landing_page: "Landing page con GCLID",
        dual: "Landing + form Google",
      }
    : {
        instant_form: "Modulo Meta nativo",
        landing_page: "Landing page",
        dual: "Modulo Meta + landing",
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
      <TreeRow icon={MousePointerClick} label="Conversione" value={`${conversionPlaceLabel(state.conversionPlace, state.platform)} - ${state.formIntent === "higher_intent" ? "maggiore intenzione" : "più volume"}`} indent />
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
 * CreativeStudioTab — Studio creativo per Meta/Google Ads.
 *
 * Sezioni:
 *   1. Brief unificato + copy AI (5 varianti + hook + CTA)
 *   2. Generatore immagini AI (DALL-E, prompt separato + preview inline)
 *   3. Script video AI (timeline a scene, stili multipli)
 *   4. Upload immagine + video (con preview)
 *   5. Libreria asset (filtri tipo+formato, delete)
 */
function CreativeStudioTab({ companyId }: { companyId?: string }) {
  // ─── Brief unificato ──────────────────────────────────────────────
  const [brief, setBrief] = useState("Serramenti premium con sopralluogo gratuito e posa certificata");
  const [segment, setSegment] = useState("serramenti");
  const [zone, setZone] = useState("");

  // ─── Copy generator ───────────────────────────────────────────────
  const [generatedCopy, setGeneratedCopy] = useState<CopyGenResult | null>(null);

  // ─── Image generator (prompt SEPARATO dal brief) ──────────────────
  const [imagePrompt, setImagePrompt] = useState(brief);
  // Traccia l'ultimo brief sincronizzato: se imagePrompt === prevBriefRef.current
  // allora l'utente non ha modificato manualmente il prompt → si può aggiornare.
  const prevBriefRef = useRef(brief);
  useEffect(() => {
    if (imagePrompt === prevBriefRef.current) {
      setImagePrompt(brief);
    }
    prevBriefRef.current = brief;
  }, [brief]); // eslint-disable-line react-hooks/exhaustive-deps
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:5" | "9:16" | "16:9">("4:5");
  const [imageQuality, setImageQuality] = useState<"standard" | "hd">("standard");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<{ public_url: string; width_px: number; height_px: number; cost_eur_cents?: number } | null>(null);

  // ─── Video script generator ───────────────────────────────────────
  const [videoDuration, setVideoDuration] = useState<"15" | "30" | "60">("30");
  const [videoStyle, setVideoStyle] = useState<VideoScriptStyle>("problema-soluzione");
  const [generatedScript, setGeneratedScript] = useState<VideoScript | null>(null);

  // ─── Video section tab (script | studio) ─────────────────────────
  const [videoTab, setVideoTab] = useState<"script" | "studio">("script");

  // ─── Brief panel open/closed ──────────────────────────────────────
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  // ─── Libreria asset filters ───────────────────────────────────────
  const [mediaKindFilter, setMediaKindFilter] = useState<"all" | "image" | "video">("all");
  const [mediaFormatFilter, setMediaFormatFilter] = useState<string>("all");

  const { generateCopy, generateImage, generateVideoScript, isGeneratingCopy, isGeneratingImage, isGeneratingScript } = useAdsAi(companyId);
  const qc = useQueryClient();

  // Libreria asset reali da ad_media
  const { data: mediaLib = [] } = useQuery({
    queryKey: ["ad-media-library", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("ad_media")
          .select("id, name, public_url, thumbnail_url, kind, aspect_ratio, source, ai_prompt, tags, created_at, width_px, height_px")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(48);
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as AdMediaItem[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const onGenerateCopy = async () => {
    const result = await generateCopy({ brief, segment, zone, variants: 5 });
    if (result) setGeneratedCopy(result);
  };

  const onGenerateImage = async (prompt: string) => {
    setLastGeneratedImage(null);
    const result = await generateImage({
      prompt,
      aspect_ratio: aspectRatio,
      quality: imageQuality,
      tags: [segment, aspectRatio],
    });
    if (result) {
      setLastGeneratedImage(result);
      toast.success("Immagine generata e salvata in libreria", {
        description: `${result.width_px}×${result.height_px}px${result.cost_eur_cents ? ` · ${(result.cost_eur_cents / 100).toFixed(3)}€` : ""}`,
      });
      qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
    }
  };

  const onGenerateScript = async () => {
    setGeneratedScript(null);
    const result = await generateVideoScript({ brief, segment, zone, duration: videoDuration, style: videoStyle });
    if (result) setGeneratedScript(result);
  };

  const onGenerateAll = () => {
    void onGenerateCopy();
    void onGenerateImage(brief);
    void onGenerateScript();
  };

  const deleteMedia = async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("ad_media").delete().eq("id", id);
      qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
      toast.success("Asset eliminato dalla libreria");
    } catch {
      toast.error("Errore durante l'eliminazione");
    }
  };

  // Filtered media library
  const filteredMedia = mediaLib
    .filter(m => mediaKindFilter === "all" || (mediaKindFilter === "image" ? m.kind !== "video" : m.kind === "video"))
    .filter(m => mediaFormatFilter === "all" || m.aspect_ratio === mediaFormatFilter);

  const imageAssetsCount = mediaLib.filter((m) => m.kind !== "video").length + (lastGeneratedImage ? 1 : 0);
  const videoAssetsCount = mediaLib.filter((m) => m.kind === "video").length;
  const hasVerticalAsset =
    mediaLib.some((m) => m.kind !== "video" && (m.aspect_ratio === "4:5" || m.aspect_ratio === "9:16")) ||
    (lastGeneratedImage ? aspectRatio === "4:5" || aspectRatio === "9:16" : false);
  const creativeQaItems = [
    {
      label: "Copy e hook",
      ok: Boolean(generatedCopy && generatedCopy.copy_variants.length >= 5 && generatedCopy.hooks.length >= 3),
      detail: generatedCopy
        ? `${generatedCopy.copy_variants.length} copy e ${generatedCopy.hooks.length} hook generati`
        : "Genera copy AI prima del lancio.",
    },
    {
      label: "Angoli creativi",
      ok: Boolean(generatedCopy && generatedCopy.copy_variants.length >= 5),
      detail: "Servono varianti su problema, prova, autorita, urgenza e incentivo.",
    },
    {
      label: "Asset verticali Meta",
      ok: hasVerticalAsset,
      detail: hasVerticalAsset ? "Hai almeno un asset 4:5 o 9:16." : "Aggiungi almeno un formato 4:5 o 9:16 per feed, Story e Reels.",
    },
    {
      label: "Video o script",
      ok: Boolean(generatedScript || videoAssetsCount > 0),
      detail: generatedScript || videoAssetsCount > 0 ? "Video/script pronto per test Reels." : "Prepara almeno uno script o un video breve.",
    },
    {
      label: "Google PMax",
      ok: imageAssetsCount >= 7 && videoAssetsCount > 0,
      detail:
        imageAssetsCount >= 7 && videoAssetsCount > 0
          ? "Asset sufficienti per un gruppo Performance Max."
          : `${imageAssetsCount}/7 immagini e ${videoAssetsCount}/1 video: PMax rende meglio con piu asset.`,
    },
  ];
  const creativeQaScore = Math.round(
    (creativeQaItems.filter((item) => item.ok).length / creativeQaItems.length) * 100,
  );

  // ─── Scene colors for video script ───────────────────────────────────────────
  const sceneColors = [
    "border-violet-200 bg-violet-50 text-violet-800",
    "border-blue-200 bg-blue-50 text-blue-800",
    "border-orange-200 bg-orange-50 text-orange-800",
    "border-emerald-200 bg-emerald-50 text-emerald-800",
    "border-rose-200 bg-rose-50 text-rose-800",
  ];

  // ─── Design constants ────────────────────────────────────────────────────────
  const SEGMENT_LABELS: Record<string, string> = {
    serramenti: "Serramenti",
    bagni: "Bagni",
    ristrutturazioni: "Ristrutturazioni",
    fotovoltaico: "Fotovoltaico",
    tetti: "Tetti",
    manutenzione: "Manutenzioni",
    generico: "Edilizia",
  };

  const ASPECT_RATIOS: Array<{ value: "1:1"|"4:5"|"9:16"|"16:9"; rw: number; rh: number; label: string; sub: string }> = [
    { value: "1:1",  rw: 20, rh: 20, label: "1:1",  sub: "Feed" },
    { value: "4:5",  rw: 17, rh: 22, label: "4:5",  sub: "Vert." },
    { value: "9:16", rw: 12, rh: 21, label: "9:16", sub: "Story" },
    { value: "16:9", rw: 26, rh: 15, label: "16:9", sub: "Banner" },
  ];

  return (
    <div className="space-y-5">

      {/* ─── BRIEF UNIFICATO ─────────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden rounded-2xl border shadow-sm transition-all duration-300",
        isBriefOpen
          ? "border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50/50 to-white"
          : "border-orange-100 bg-gradient-to-r from-orange-50/80 to-white"
      )}>
        {!isBriefOpen ? (
          /* Collapsed — brief strip con genera tutto */
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100">
              <FileText className="h-3.5 w-3.5 text-orange-600" />
            </div>
            {/* Status dot */}
            <div className="relative flex h-2 w-2 shrink-0">
              {brief ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                </>
              ) : (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-300" />
              )}
            </div>
            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
              {SEGMENT_LABELS[segment] ?? segment}
            </span>
            {zone && (
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                📍 {zone}
              </span>
            )}
            <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
              {brief || <span className="italic text-slate-400">Nessun brief — clicca Modifica per impostarlo</span>}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {brief && (
                <button
                  type="button"
                  onClick={() => { onGenerateAll(); }}
                  disabled={isGeneratingCopy || isGeneratingImage || isGeneratingScript}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-rose-600 disabled:opacity-60">
                  {(isGeneratingCopy || isGeneratingImage || isGeneratingScript)
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Sparkles className="h-3 w-3" />
                  }
                  Genera tutto
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsBriefOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-200">
                <Pencil className="h-3 w-3" /> Modifica brief
              </button>
            </div>
          </div>
        ) : (
          /* Expanded — full brief form */
          <div className="space-y-3.5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                  <FileText className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Brief campagna</p>
                  <p className="text-[11px] text-slate-500">Condiviso con Copy AI · Immagine AI · Video AI</p>
                </div>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                  ✦ Sincronizzato
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsBriefOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-orange-100 hover:text-orange-600">
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Settore">
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Es. Monza e Brianza" />
              </Field>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-700">Descrivi l'offerta e l'angolo di vendita</Label>
                <span className={cn("text-[10px] tabular-nums", brief.length > 200 ? "text-amber-600" : "text-slate-400")}>
                  {brief.length} car.
                </span>
              </div>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="min-h-20 resize-none"
                placeholder="Serramenti premium con sopralluogo gratuito e posa certificata..."
              />
            </div>
            <Button
              onClick={() => { onGenerateAll(); setIsBriefOpen(false); }}
              disabled={!brief.trim() || isGeneratingCopy || isGeneratingImage || isGeneratingScript}
              className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shadow-sm">
              {(isGeneratingCopy || isGeneratingImage || isGeneratingScript)
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generazione in corso...</>
                : <><Sparkles className="mr-2 h-4 w-4" /> Genera tutto con AI — Copy · Immagine · Script</>
              }
            </Button>
          </div>
        )}
      </div>

      {/* ─── Flow connector ──────────────────────────────────────────── */}
      {brief && (
        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-100" />
          <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2.5 py-1 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            <span className="text-[10px] font-medium text-slate-400">Brief attivo → Copy · Immagine · Script</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-100" />
        </div>
      )}

      <CreativeQaPanel
        score={creativeQaScore}
        items={creativeQaItems}
        imageAssetsCount={imageAssetsCount}
        videoAssetsCount={videoAssetsCount}
      />

      {/* ─── ROW 1: COPY + IMAGE ─────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">

        {/* COPY AI */}
        <Card className="overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-violet-500 to-purple-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Copy AI</CardTitle>
                  <CardDescription className="text-[11px]">5 varianti · hook · CTA per Meta Ads</CardDescription>
                </div>
              </div>
              {brief ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                  <Check className="h-2.5 w-2.5" /> {SEGMENT_LABELS[segment] ?? segment}
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Brief mancante
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={onGenerateCopy} disabled={isGeneratingCopy || !brief.trim()} className="w-full bg-violet-600 hover:bg-violet-700">
              {isGeneratingCopy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGeneratingCopy ? "Generazione copy..." : "Genera 5 copy con AI"}
            </Button>

            {isGeneratingCopy && (
              <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-violet-100/70" />
                ))}
              </div>
            )}

            {!generatedCopy && !isGeneratingCopy && (
              <div className="rounded-xl border border-dashed border-violet-100 bg-gradient-to-b from-violet-50/60 to-transparent p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                  <p className="text-[11px] font-semibold text-violet-700">Genererai in un click:</p>
                </div>
                <div className="space-y-2">
                  {[
                    { icon: "✦", label: "5 varianti copy", sub: "Adatti al tuo settore e zona" },
                    { icon: "🪝", label: "3 hook apertura", sub: "Per catturare l'attenzione nei primi 3s" },
                    { icon: "🎯", label: "CTA suggerite", sub: "Frasi d'azione efficaci" },
                    { icon: "🖼️", label: "Prompt immagine",  sub: "Pronti per Immagine AI" },
                  ].map(({ icon, label, sub }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-sm shadow-sm">{icon}</span>
                      <div>
                        <p className="text-[11px] font-semibold leading-none text-violet-800">{label}</p>
                        <p className="mt-0.5 text-[10px] leading-none text-violet-400">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generatedCopy && (
              <div className="space-y-3 rounded-xl border bg-slate-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Output AI {generatedCopy.model_used ? `· ${generatedCopy.model_used}` : ""}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onGenerateCopy} disabled={isGeneratingCopy}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Rigenera
                  </Button>
                </div>

                {/* Copy variants */}
                {generatedCopy.copy_variants.map((c, i) => (
                  <div key={i} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Variante {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-[10px] tabular-nums", c.length > 150 ? "text-amber-600" : "text-slate-400")}>
                          {c.length} car.
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                          onClick={() => { void navigator.clipboard?.writeText(c); toast.success("Copy copiato"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="leading-relaxed text-slate-800">{c}</p>
                  </div>
                ))}

                {/* Hooks */}
                {generatedCopy.hooks.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">🪝 Hook</p>
                    <div className="flex flex-wrap gap-1">
                      {generatedCopy.hooks.map((h, i) => (
                        <button key={i} type="button"
                          onClick={() => { void navigator.clipboard?.writeText(h); toast.success("Hook copiato"); }}
                          className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100">
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA */}
                {generatedCopy.cta_suggestions?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">🎯 CTA suggerite</p>
                    <div className="flex flex-wrap gap-1">
                      {generatedCopy.cta_suggestions.map((c, i) => (
                        <Badge key={i} variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image prompts → genera immagine */}
                {generatedCopy.image_prompts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">🖼️ Prompt immagine suggeriti</p>
                    <div className="space-y-1">
                      {generatedCopy.image_prompts.map((p, i) => (
                        <button key={i} type="button"
                          onClick={() => { setImagePrompt(p); onGenerateImage(p); }}
                          disabled={isGeneratingImage}
                          className="w-full rounded-lg border bg-white p-2 text-left text-xs hover:bg-slate-50 disabled:opacity-50">
                          <span className="mr-1 font-semibold text-orange-600">Genera →</span>{p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compliance warnings */}
                {generatedCopy.warnings.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <AlertTitle>Compliance</AlertTitle>
                    <AlertDescription className="text-xs">{generatedCopy.warnings.join(" · ")}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* IMAGE AI */}
        <Card className="overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <Wand2 className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Immagine AI</CardTitle>
                  <CardDescription className="text-[11px]">DALL-E · preview inline · salvata in libreria</CardDescription>
                </div>
              </div>
              {brief && imagePrompt !== brief ? (
                <button type="button" onClick={() => setImagePrompt(brief)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-100">
                  <RefreshCw className="h-2.5 w-2.5" /> Sincronizza
                </button>
              ) : brief ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  <Check className="h-2.5 w-2.5" /> Sincronizzato
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {/* Aspect ratio visual picker */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Formato</p>
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_RATIOS.map(({ value, rw, rh, label, sub }) => (
                  <button key={value} type="button"
                    onClick={() => setAspectRatio(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 py-2.5 transition",
                      aspectRatio === value
                        ? "border-amber-400 bg-amber-50 shadow-sm"
                        : "border-gray-100 bg-gray-50 hover:border-amber-200"
                    )}>
                    <div className="flex h-7 items-center justify-center">
                      <div
                        className={cn("rounded-[3px] border-2 transition",
                          aspectRatio === value ? "border-amber-500 bg-amber-200" : "border-gray-300 bg-gray-100"
                        )}
                        style={{ width: rw, height: rh }}
                      />
                    </div>
                    <div className="text-center">
                      <p className={cn("text-[11px] font-bold leading-none", aspectRatio === value ? "text-amber-700" : "text-gray-500")}>{label}</p>
                      <p className={cn("mt-0.5 text-[9px] leading-none", aspectRatio === value ? "text-amber-500" : "text-gray-400")}>{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Qualità — visual toggle */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Qualità</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "standard", label: "Standard", price: "~0.04€", desc: "Veloce" },
                  { value: "hd",       label: "HD",       price: "~0.07€", desc: "Più nitida" },
                ] as const).map(({ value, label, price, desc }) => (
                  <button key={value} type="button"
                    onClick={() => setImageQuality(value)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border-2 px-3 py-2 text-left transition",
                      imageQuality === value
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-100 bg-gray-50 hover:border-amber-200"
                    )}>
                    <div className="flex w-full items-center justify-between">
                      <span className={cn("text-sm font-bold", imageQuality === value ? "text-amber-800" : "text-gray-700")}>{label}</span>
                      <span className={cn("text-[11px] font-semibold", imageQuality === value ? "text-amber-600" : "text-gray-400")}>{price}</span>
                    </div>
                    <span className={cn("text-[10px]", imageQuality === value ? "text-amber-500" : "text-gray-400")}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt visivo */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-600">Prompt visivo</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500 hover:text-amber-600"
                  onClick={() => setImagePrompt(brief)}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Da brief
                </Button>
              </div>
              <Textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                className="min-h-20 resize-none"
                placeholder="Operaio che installa finestre, casa ristrutturata, luce naturale, colori caldi..."
              />
            </div>

            <Button onClick={() => onGenerateImage(imagePrompt)} disabled={isGeneratingImage || !imagePrompt.trim()} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
              {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {isGeneratingImage ? "DALL-E sta dipingendo..." : "Genera immagine"}
            </Button>

            {/* Preview inline dopo generazione */}
            {!isGeneratingImage && !lastGeneratedImage && (
              /* Visual placeholder proporzionale al formato scelto */
              <div className="flex justify-center py-1">
                {(() => {
                  const ratioMap: Record<string, { w: number; h: number }> = {
                    "1:1":  { w: 120, h: 120 },
                    "4:5":  { w: 100, h: 125 },
                    "9:16": { w: 72,  h: 128 },
                    "16:9": { w: 160, h: 90 },
                  };
                  const dim = ratioMap[aspectRatio] ?? { w: 100, h: 125 };
                  return (
                    <div
                      className="relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50"
                      style={{ width: dim.w, height: dim.h }}>
                      <div className="text-center">
                        <Wand2 className="mx-auto mb-1.5 h-5 w-5 text-amber-300" />
                        <p className="text-[10px] font-medium text-amber-400">{aspectRatio}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {isGeneratingImage && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                DALL-E sta dipingendo...
              </div>
            )}
            {lastGeneratedImage && !isGeneratingImage && (
              <div className="overflow-hidden rounded-xl border shadow-sm">
                <div className="relative">
                  <img src={lastGeneratedImage.public_url} alt="Immagine generata" className="w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1">
                    <Badge className="bg-black/60 text-white text-[10px] backdrop-blur-sm">
                      {lastGeneratedImage.width_px}×{lastGeneratedImage.height_px}
                      {lastGeneratedImage.cost_eur_cents ? ` · ${(lastGeneratedImage.cost_eur_cents / 100).toFixed(3)}€` : ""}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                  <span className="text-[11px] text-slate-500">✅ Salvata in Libreria asset</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                      onClick={() => window.open(lastGeneratedImage.public_url, "_blank")}>
                      Apri
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setLastGeneratedImage(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      {/* ─── ROW 2: VIDEO AI ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-rose-500 to-pink-500" />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                <Film className="h-4 w-4 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-base">Video AI</CardTitle>
                <CardDescription className="text-[11px]">Pianifica lo script e genera il video con AI.</CardDescription>
              </div>
            </div>
            {/* Tab switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
              <button type="button" onClick={() => setVideoTab("script")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  videoTab === "script" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}>
                <Clapperboard className="h-3.5 w-3.5" /> Script
              </button>
              <button type="button" onClick={() => setVideoTab("studio")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  videoTab === "studio" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}>
                <Sparkles className="h-3.5 w-3.5" /> Genera video
              </button>
            </div>
          </div>
          {videoTab === "script" && (
            <div className="mt-1">
              {brief ? (
                <span className="flex w-fit items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                  <Check className="h-2.5 w-2.5" /> {SEGMENT_LABELS[segment] ?? segment} · Brief attivo
                </span>
              ) : (
                <span className="flex w-fit items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Brief mancante — impostalo in cima
                </span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
        {videoTab === "script" && (<>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Durata">
              <div className="flex gap-2">
                {(["15", "30", "60"] as const).map((d) => (
                  <button key={d} type="button"
                    onClick={() => setVideoDuration(d)}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-semibold transition",
                      videoDuration === d
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}>
                    {d}s
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      {d === "15" ? "Stories" : d === "30" ? "Reels" : "Feed"}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Stile narrativo">
              <Select value={videoStyle} onValueChange={(v) => setVideoStyle(v as VideoScriptStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="problema-soluzione">🔥 Problema → Soluzione</SelectItem>
                  <SelectItem value="prima-dopo">✨ Prima → Dopo</SelectItem>
                  <SelectItem value="testimonial">💬 Testimonial / Cliente</SelectItem>
                  <SelectItem value="offerta-diretta">🎯 Offerta diretta + CTA</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {!brief && (
            <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
              Inserisci il brief in cima alla pagina prima di generare lo script.
            </div>
          )}

          <Button onClick={onGenerateScript} disabled={isGeneratingScript || !brief.trim()} className="w-full bg-rose-600 hover:bg-rose-700">
            {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {isGeneratingScript ? "Generazione script..." : "Genera script video AI"}
          </Button>

          {/* Script output — timeline a scene */}
          {generatedScript && !isGeneratingScript && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-600 text-white">{generatedScript.total_duration}</Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">{generatedScript.platform}</Badge>
                  {generatedScript.model_used && (
                    <span className="text-[10px] text-slate-400">{generatedScript.model_used}</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onGenerateScript} disabled={isGeneratingScript}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Rigenera
                </Button>
              </div>

              {/* Hook headline */}
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="mb-0.5 text-[10px] font-semibold uppercase text-rose-500">🪝 Hook video</p>
                <p className="text-sm font-semibold text-rose-900">{generatedScript.hook}</p>
              </div>

              {/* Scene timeline */}
              <div className="space-y-2">
                {generatedScript.scenes.map((scene, i) => (
                  <div key={i} className={cn("rounded-xl border p-3", sceneColors[i % sceneColors.length])}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold">
                        {scene.scene}
                      </div>
                      <span className="text-xs font-semibold">{scene.label}</span>
                      <Badge variant="outline" className="ml-auto border-current/30 bg-white/50 text-[9px]">
                        ⏱ {scene.duration_seconds}s
                      </Badge>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <div>
                        <p className="mb-0.5 text-[9px] font-bold uppercase opacity-70">📺 Testo overlay</p>
                        <p className="text-xs font-semibold leading-snug">{scene.overlay_text}</p>
                      </div>
                      <div>
                        <p className="mb-0.5 text-[9px] font-bold uppercase opacity-70">🎤 Voiceover</p>
                        <p className="text-xs leading-snug opacity-90">{scene.voiceover}</p>
                      </div>
                    </div>
                    {scene.visual_direction && (
                      <div className="mt-1.5 rounded-md border border-white/40 bg-white/30 px-2 py-1">
                        <p className="text-[9px] font-bold uppercase opacity-60">🎬 Regia</p>
                        <p className="text-[11px] opacity-80">{scene.visual_direction}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* CTA finale */}
              <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                <ArrowRightCircle className="h-4 w-4 shrink-0 text-orange-600" />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-orange-500">CTA finale</p>
                  <p className="text-sm font-semibold text-orange-900">{generatedScript.cta_final}</p>
                </div>
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs"
                  onClick={() => { void navigator.clipboard?.writeText(generatedScript.cta_final); toast.success("CTA copiata"); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              {/* Copy completo per condividere */}
              <Button variant="outline" size="sm" className="w-full text-xs"
                onClick={() => {
                  const fullScript = [
                    `🎬 SCRIPT VIDEO ${generatedScript.total_duration} — ${generatedScript.platform}`,
                    `🪝 Hook: ${generatedScript.hook}`,
                    "",
                    ...generatedScript.scenes.map(s =>
                      `SCENA ${s.scene} (${s.duration_seconds}s) — ${s.label}\n  📺 Overlay: ${s.overlay_text}\n  🎤 Voiceover: ${s.voiceover}${s.visual_direction ? `\n  🎬 Regia: ${s.visual_direction}` : ""}`
                    ),
                    "",
                    `🎯 CTA finale: ${generatedScript.cta_final}`,
                  ].join("\n");
                  void navigator.clipboard?.writeText(fullScript);
                  toast.success("Script completo copiato negli appunti");
                }}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Copia script completo
              </Button>
            </div>
          )}
        </>)}

        {/* ─── TAB: GENERA VIDEO ───────────────────────────────────── */}
        {videoTab === "studio" && (
          <VideoAIStudio
            companyId={companyId}
            libraryImages={mediaLib
              .filter(m => m.kind !== "video" && m.public_url)
              .map(m => ({ id: m.id, name: m.name, public_url: m.public_url! }))}
          />
        )}
        </CardContent>
      </Card>

      {/* ─── ROW 3: LIBRERIA ASSET ───────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-slate-300 to-slate-200" />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                <ImageIcon className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <CardTitle className="text-base">Libreria asset</CardTitle>
                <CardDescription className="text-[11px]">
                  {mediaLib.length === 0
                    ? "Nessun asset ancora · genera o carica"
                    : `${mediaLib.length} asset · ${mediaLib.filter(m => m.source === "ai_generated").length} AI · ${mediaLib.filter(m => m.source === "upload").length} upload`}
                </CardDescription>
              </div>
            </div>
            {/* Filtri */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border bg-white p-1">
                <Filter className="ml-1 h-3.5 w-3.5 text-slate-400" />
                {(["all", "image", "video"] as const).map((k) => (
                  <button key={k} type="button"
                    onClick={() => setMediaKindFilter(k)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      mediaKindFilter === k ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                    )}>
                    {k === "all" ? "Tutti" : k === "image" ? "🖼️ Img" : "🎬 Video"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg border bg-white p-1">
                {["all", "1:1", "4:5", "9:16", "16:9"].map((f) => (
                  <button key={f} type="button"
                    onClick={() => setMediaFormatFilter(f)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      mediaFormatFilter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                    )}>
                    {f === "all" ? "Tutti" : f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload compatto */}
          <div className="grid gap-3 lg:grid-cols-2">
            <AdMediaUploader
              companyId={companyId}
              onUploaded={(media) => {
                toast.success("Immagine salvata in libreria", { description: media.public_url ? "Pronta da usare nelle campagne." : undefined });
                qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
              }}
            />
            <AdVideoUploader
              companyId={companyId}
              onUploaded={(media) => {
                toast.success("Video salvato in libreria", { description: media.public_url ? "Pronto da usare nelle campagne." : undefined });
                qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });
              }}
            />
          </div>
          {/* Media grid */}
          {mediaLib.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-slate-50 p-10 text-center">
              <ImageIcon className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Libreria vuota</p>
              <p className="mt-1 text-xs text-slate-500">
                Genera un'immagine AI o carica un video per iniziare.
              </p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center">
              <Filter className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              <p className="text-sm font-medium text-slate-500">Nessun asset con questi filtri.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredMedia.map((m) => {
                const isVideo = m.kind === "video";
                return (
                  <div key={m.id} className="group overflow-hidden rounded-xl border bg-white transition hover:shadow-md">
                    <div className="relative aspect-square bg-slate-100">
                      {isVideo && m.public_url ? (
                        <>
                          <video
                            src={m.public_url}
                            poster={m.thumbnail_url ?? undefined}
                            className="h-full w-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onMouseEnter={(e) => { void (e.currentTarget as HTMLVideoElement).play(); }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); }}
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="rounded-full bg-white/90 p-2 shadow-md">
                              <Play className="h-4 w-4 fill-slate-900 text-slate-900" />
                            </div>
                          </div>
                        </>
                      ) : m.public_url ? (
                        <img src={m.public_url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-slate-300" />
                        </div>
                      )}
                      {/* Overlay azioni al hover */}
                      <div className="absolute inset-0 flex items-end justify-end gap-1 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button"
                                onClick={() => m.public_url && window.open(m.public_url, "_blank")}
                                className="rounded-md bg-white/90 p-1 shadow-sm hover:bg-white">
                                <ArrowRightCircle className="h-3.5 w-3.5 text-slate-700" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Apri originale</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button"
                                onClick={() => void deleteMedia(m.id)}
                                className="rounded-md bg-white/90 p-1 shadow-sm hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Elimina</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-slate-900">{m.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="outline"
                          className={cn("text-[9px]",
                            m.source === "ai_generated"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-200 bg-slate-50 text-slate-600")}>
                          {m.source === "ai_generated" ? "✨ AI" : "⬆️ Upload"}
                        </Badge>
                        <Badge variant="outline"
                          className={cn("text-[9px]",
                            isVideo
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-blue-200 bg-blue-50 text-blue-700")}>
                          {isVideo ? "🎬" : "🖼️"}
                        </Badge>
                        {m.aspect_ratio && (
                          <Badge variant="outline" className="text-[9px] text-slate-500">{m.aspect_ratio}</Badge>
                        )}
                        {m.width_px && m.height_px && (
                          <span className="text-[9px] text-slate-400">{m.width_px}×{m.height_px}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreativeQaPanel({
  score,
  items,
  imageAssetsCount,
  videoAssetsCount,
}: {
  score: number;
  items: Array<{ label: string; ok: boolean; detail: string }>;
  imageAssetsCount: number;
  videoAssetsCount: number;
}) {
  const missing = items.filter((item) => !item.ok);
  const scoreTone =
    score >= 80
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : score >= 50
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-white text-slate-600";

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              QA creativo advertiser
            </CardTitle>
            <CardDescription className="text-xs">
              Controllo finale per evitare campagne con pochi angoli, asset incompleti o formati deboli.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-semibold", scoreTone)}>
              {score}/100
            </Badge>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {imageAssetsCount} immagini
            </Badge>
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
              {videoAssetsCount} video
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          {items.map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-lg border p-3",
                item.ok ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50",
              )}
            >
              <div className="flex items-center gap-2">
                {item.ok ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <p className="text-xs font-semibold text-slate-900">{item.label}</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-sm">Ultimi gap creativi</AlertTitle>
            <AlertDescription className="text-xs">
              {missing.map((item) => item.label).join(", ")}. Prima del live conviene chiudere questi punti o tenere budget basso in test.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
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
      step: 1,
      name: "Freddo locale Advantage+",
      strategy: "advantage_plus" as const,
      zone: "Provincia + 20/30 km",
      age: "28-65",
      signals: "Ristrutturazione casa, infissi, bagno, detrazioni, risparmio energetico",
      excludes: "clienti chiusi, lead duplicati, aree fuori raggio",
      use: "Lascia che l'algoritmo impari da solo. Pubblico di partenza per ogni nuova campagna.",
      when: "Parti sempre da qui",
      recommended: true,
      // come si usa nel wizard
      wizardAuto: true,
      wizardNote: "Incluso automaticamente in ogni nuova campagna come primo gruppo annunci.",
      wizardPath: "Crea campagna → Gruppi → Strategia: Advantage+",
      ctaLabel: "Crea campagna con questo pubblico",
      color: { card: "border-blue-200", bg: "bg-blue-50/30", icon: "bg-blue-100 text-blue-700", step: "bg-blue-600", cta: "bg-blue-600 hover:bg-blue-700 text-white", wizard: "bg-blue-50 border-blue-100 text-blue-700" },
    },
    {
      step: 2,
      name: "Manuale alta intenzione",
      strategy: "manual" as const,
      zone: "Raggio sopralluoghi",
      age: "35-65",
      signals: "Mutuo, nuova casa, interior design, arredo bagno, fotovoltaico",
      excludes: "studenti, affittuari se non target, comuni non serviti",
      use: "Quando vuoi scegliere tu chi vede l'annuncio. Più controllo, meno volume.",
      when: "Dopo 2-3 settimane di dati",
      recommended: false,
      wizardAuto: false,
      wizardNote: "Si aggiunge manualmente: crea un nuovo AdSet e scegli 'Manuale controllato'.",
      wizardPath: "Crea campagna → Aggiungi gruppo → Strategia: Manuale",
      ctaLabel: "Aggiungi a una campagna",
      color: { card: "border-violet-200", bg: "bg-violet-50/30", icon: "bg-violet-100 text-violet-700", step: "bg-violet-600", cta: "bg-violet-600 hover:bg-violet-700 text-white", wizard: "bg-violet-50 border-violet-100 text-violet-700" },
    },
    {
      step: 3,
      name: "Retargeting caldo",
      strategy: "retargeting" as const,
      zone: "Stessa zona operativa",
      age: "18-65",
      signals: "Visitatori sito, video viewers, engagement pagina, lead aperti CRM",
      excludes: "commesse vinte, preventivi già accettati, spam",
      use: "Mostra l'annuncio a chi ti conosce già. Costo per lead molto più basso.",
      when: "Con 200+ interazioni/mese sulla pagina",
      recommended: false,
      wizardAuto: true,
      wizardNote: "Incluso automaticamente come secondo gruppo nelle nuove campagne.",
      wizardPath: "Crea campagna → Gruppi → Strategia: Retargeting",
      ctaLabel: "Crea campagna con questo pubblico",
      color: { card: "border-orange-200", bg: "bg-orange-50/30", icon: "bg-orange-100 text-orange-700", step: "bg-orange-500", cta: "bg-orange-500 hover:bg-orange-600 text-white", wizard: "bg-orange-50 border-orange-100 text-orange-700" },
    },
    {
      step: 4,
      name: "Lookalike clienti migliori",
      strategy: "lookalike" as const,
      zone: "Provincia/regione",
      age: "25-65",
      signals: "Clienti chiusi con margine buono, commesse sopra media, preventivi accettati",
      excludes: "clienti esistenti e lead recenti",
      use: "Meta trova nuovi clienti simili ai tuoi migliori. Richiede dati storici puliti.",
      when: "Con almeno 50 clienti nel CRM",
      recommended: false,
      wizardAuto: false,
      wizardNote: "Si aggiunge manualmente. Richiede almeno 50 clienti nel CRM per funzionare.",
      wizardPath: "Crea campagna → Aggiungi gruppo → Strategia: Lookalike",
      ctaLabel: "Aggiungi a una campagna",
      color: { card: "border-emerald-200", bg: "bg-emerald-50/30", icon: "bg-emerald-100 text-emerald-700", step: "bg-emerald-600", cta: "bg-emerald-600 hover:bg-emerald-700 text-white", wizard: "bg-emerald-50 border-emerald-100 text-emerald-700" },
    },
  ];

  return (
    <div className="space-y-5">

      {/* ─── Come funziona concretamente ──────────────────────────── */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="pt-5 pb-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Come funziona nel sistema</p>
          <p className="mb-4 text-base font-semibold text-slate-900">
            I pubblici qui sotto sono configurazioni pronte da usare nel wizard campagne.
          </p>
          {/* 3 passi concreti */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: "1", icon: "👆", title: "Scegli il pubblico", body: "Usa la scheda qui sotto che corrisponde alla tua fase." },
              { n: "2", icon: "🧙", title: "Clicca Crea campagna", body: "Il wizard si apre. Freddo + Retargeting sono già pre-impostati." },
              { n: "3", icon: "🎯", title: "Meta gestisce il targeting", body: "Nel passo Gruppi trovi la strategia già selezionata e personalizzabile." },
            ].map((s) => (
              <div key={s.n} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700">{s.n}</div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800">{s.icon} {s.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              <Check className="h-3 w-3" /> Freddo + Retargeting: automatici in ogni nuova campagna
            </span>
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
              + Manuale + Lookalike: si aggiungono manualmente
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meta e Google: pubblici diversi</CardTitle>
          <CardDescription>
            Meta lavora meglio con segnali larghi e creatività; Google deve partire da intenzione, keyword, località e conversioni CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-700" />
              <p className="text-sm font-semibold text-blue-950">Meta: audience signals</p>
            </div>
            <div className="grid gap-2 text-xs text-slate-700">
              <p><strong>Base:</strong> Advantage+ Audience con zona, lingua ed esclusioni business.</p>
              <p><strong>Segmenti:</strong> retargeting, engagement, visitatori sito, lead CRM non chiusi.</p>
              <p><strong>Decisione:</strong> scala solo se CPL, qualita lead e risposta commerciale restano sani.</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-amber-700" />
              <p className="text-sm font-semibold text-amber-950">Google: intento, keyword e segnali</p>
            </div>
            <div className="grid gap-2 text-xs text-slate-700">
              <p><strong>Search:</strong> gruppi keyword per servizio, match type controllati e negative keyword.</p>
              <p><strong>PMax:</strong> audience signals da clienti migliori, lead qualificati e zone servibili.</p>
              <p><strong>Conversioni:</strong> importa appuntamento fissato, vendita vinta e valore commessa dal CRM.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Audience cards ────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {audiences.map((audience) => (
          <Card key={audience.name} className={cn("overflow-hidden", audience.color.card, audience.color.bg)}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold", audience.color.icon)}>
                    {audience.step}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{audience.name}</CardTitle>
                      {audience.recommended && (
                        <Badge className="bg-blue-600 text-white text-[10px]">⭐ Inizia qui</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{audience.use}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Località" value={audience.zone} />
                <MiniStat label="Età" value={audience.age} />
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-[11px] text-slate-500">Segnali / interessi</p>
                <p className="mt-0.5 text-xs font-medium text-slate-900">{audience.signals}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-2.5">
                <p className="text-[11px] text-amber-700">Escludi</p>
                <p className="mt-0.5 text-xs font-medium text-amber-900">{audience.excludes}</p>
              </div>

              {/* ─── NEL WIZARD ─────────────────────────────────── */}
              <div className={cn("rounded-xl border p-3 space-y-1.5", audience.color.wizard)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Nel wizard</p>
                  {audience.wizardAuto
                    ? <span className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold"><Check className="h-2.5 w-2.5" /> Automatico</span>
                    : <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold">+ Manuale</span>
                  }
                </div>
                <p className="text-[11px] font-medium leading-snug">{audience.wizardNote}</p>
                <div className="flex items-center gap-1 opacity-60">
                  <ChevronRight className="h-3 w-3" />
                  <p className="text-[10px] font-mono">{audience.wizardPath}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-current/20 bg-white/50 px-3 py-2 text-[11px] text-slate-500">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Quando: <strong className="text-slate-700">{audience.when}</strong></span>
              </div>

              <Button
                className={cn("w-full", audience.color.cta)}
                onClick={() => {
                  try { sessionStorage.setItem("audiencePreset", audience.strategy); } catch { /* ignore */ }
                  if (onUseInWizard) {
                    onUseInWizard();
                    toast.success(`Pubblico "${audience.name}" pronto`, {
                      description: audience.wizardAuto
                        ? "Il wizard si apre con questo pubblico già configurato nel gruppo annunci."
                        : "Nel wizard: aggiungi un nuovo gruppo e scegli questa strategia.",
                    });
                  }
                }}
              >
                {audience.ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
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

  const addCreative = (format: CreativeFormat, angle?: CreativeAngle) => {
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
        angle
          ? { ...buildCreativeFromAngle(angle, prev.copyBrief || prev.offer, prev.imagePrompt), id: `creative-${angle}-${Date.now()}` }
          : {
              id: `creative-${format}-${Date.now()}`,
              format,
              title: labels[format],
              hook: "Hook da testare",
              goal: "Capire se questo formato porta lead piu qualificati.",
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
            platform={state.platform}
            metaCampaignId={draft.metaCampaignId}
            googleCampaignId={draft.googleCampaignId}
          />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <div className="space-y-4">
            <AdsCrmAttributionPanel
              companyId={companyId}
              campaign={{
                id: draft.id,
                name: state.name || draft.name,
                platform: state.platform,
                metaCampaignId: draft.metaCampaignId,
                googleCampaignId: draft.googleCampaignId,
                spentCents: 0,
                targetCplCents: state.targetCpl * 100,
                createdAt: draft.createdAt,
                builderState: {
                  name: state.name,
                  landingUrl: state.landingUrl,
                  targetCpl: state.targetCpl,
                },
              }}
            />
            {state.platform === "google" ? (
              <GoogleCampaignPerformancePanel
                campaignName={state.name || draft.name}
                googleCampaignId={draft.googleCampaignId}
              />
            ) : (
              <PerformancePanel
                companyId={companyId}
                campaignId={draft.metaCampaignId ?? draft.id}
                targetCplCents={state.targetCpl * 100}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsTab({
  meta,
  google,
  companyId,
}: {
  meta: ReturnType<typeof useMetaConnection>;
  google: ReturnType<typeof useGoogleAdsConnection>;
  companyId?: string;
}) {
  const setupBlocks = [
    {
      title: "Account e permessi",
      icon: "🔗",
      body: "Business Manager, account pubblicitario, Pagina Facebook e Instagram collegati.",
      items: [
        { label: "Integrazione Meta", ok: meta.integration?.status === "connected", detail: meta.integration?.status ?? "non collegata", action: { label: "Connetti", href: "/azienda/impostazioni/lead-forms" } },
        { label: "Business Manager", ok: meta.businesses.length > 0, detail: `${meta.businesses.length} rilevati`, action: meta.businesses.length === 0 ? { label: "Crea su Meta", href: "https://business.facebook.com/", external: true } : null },
        { label: "Account pubblicitario", ok: meta.adAccounts.length > 0, detail: `${meta.adAccounts.length} rilevati`, action: meta.adAccounts.length === 0 ? { label: "Crea account", href: "https://www.facebook.com/adsmanager/", external: true } : null },
        { label: "Pagina Facebook", ok: meta.pages.length > 0, detail: `${meta.pages.length} pagine disponibili`, action: meta.pages.length === 0 ? { label: "Collega pagina", href: "/azienda/impostazioni/lead-forms" } : null },
      ],
    },
    {
      title: "Google Ads",
      icon: "G",
      body: "Customer ID, account Google Ads e separazione completa da Meta.",
      items: [
        { label: "Integrazione Google Ads", ok: google.integration?.status === "connected", detail: google.integration?.status ?? "non collegata", action: { label: "Configura", href: "/azienda/impostazioni/integrazioni" } },
        { label: "Customer ID selezionato", ok: google.accounts.length > 0, detail: google.selectedAccount?.customer_id ?? "nessun account", action: google.accounts.length === 0 ? { label: "Configura", href: "/azienda/impostazioni/integrazioni" } : null },
        { label: "Search / PMax separati", ok: true, detail: "wizard con canale Google", action: null },
        { label: "Developer Token / OAuth", ok: false, detail: "richiesto per publish live", action: { label: "Integrazioni", href: "/azienda/impostazioni/integrazioni" } },
      ],
    },
    {
      title: "Tracking e qualità dati",
      icon: "📡",
      body: "Pixel/CAPI Meta, GCLID Google, UTM e conversioni offline dal CRM.",
      items: [
        { label: "Pixel / CAPI", ok: false, detail: "da collegare", action: { label: "Configura Pixel", href: "#pixel-config" } },
        { label: "GCLID / Enhanced conversions", ok: false, detail: "da collegare per Google", action: { label: "Configura Google", href: "/azienda/impostazioni/integrazioni" } },
        { label: "Mapping CRM lead", ok: true, detail: "pipeline pronta", action: null },
        { label: "Vendite e fatturato CRM", ok: true, detail: "ROAS da opportunità vinte", action: null },
      ],
    },
    {
      title: "Modulo lead e GDPR",
      icon: "📋",
      body: "Privacy URL, consensi separati e domanda di qualificazione prima del lancio.",
      items: [
        { label: "Privacy URL", ok: true, detail: "richiesta nel wizard", action: null },
        { label: "Consensi separati", ok: false, detail: "da completare nel wizard", action: { label: "Apri wizard", href: "#wizard" } },
        { label: "Domande condizionali", ok: false, detail: "roadmap", action: null },
        { label: "Test invio modulo", ok: false, detail: "fai un test prima del live", action: { label: "Guida test", href: "https://www.facebook.com/business/help/", external: true } },
      ],
    },
    {
      title: "Follow-up e automazioni",
      icon: "⚡",
      body: "Il lead arriva subito nel CRM e attiva WhatsApp/email/task per non sprecare budget.",
      items: [
        { label: "Creazione opportunità", ok: true, detail: "automatica nel CRM", action: null },
        { label: "WhatsApp entro 5 minuti", ok: false, detail: "da collegare", action: { label: "Configura", href: "/azienda/automazioni" } },
        { label: "Task commerciale", ok: true, detail: "automatico", action: null },
        { label: "Nurturing email", ok: false, detail: "da collegare", action: { label: "Configura", href: "/azienda/automazioni" } },
      ],
    },
  ];

  // Calcola progress totale
  const allChecks = setupBlocks.flatMap(b => b.items);
  const doneCount = allChecks.filter(item => Boolean(item.ok)).length;
  const totalCount = allChecks.length;
  const progressPct = Math.round((doneCount / totalCount) * 100);

  // Colori per blocco
  const blockColors = [
    { border: "border-blue-200",   bg: "bg-blue-50/50",   title: "text-blue-900"   },
    { border: "border-amber-200",  bg: "bg-amber-50/50",  title: "text-amber-900"  },
    { border: "border-violet-200", bg: "bg-violet-50/50", title: "text-violet-900" },
    { border: "border-orange-200", bg: "bg-orange-50/50", title: "text-orange-900" },
    { border: "border-emerald-200",bg: "bg-emerald-50/50",title: "text-emerald-900"},
  ];

  return (
    <div className="space-y-5">

      {/* ─── 1. SETUP STATUS — hero checklist ────────────────────── */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-slate-600" />
                Stato setup campagne
              </CardTitle>
              <CardDescription>
                Completa questi passaggi prima di pubblicare la prima campagna live.
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">{doneCount}<span className="text-sm font-normal text-slate-400">/{totalCount}</span></p>
              <p className="text-[11px] text-slate-500">passaggi completati</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn("h-full rounded-full transition-all", progressPct === 100 ? "bg-emerald-500" : progressPct > 50 ? "bg-blue-500" : "bg-amber-500")}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/azienda/impostazioni/lead-forms">
                Configura Meta <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/azienda/impostazioni/integrazioni">
                Configura Google Ads <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info("Checklist pre-lancio disponibile nella revisione della bozza")}>
              Checklist pre-lancio
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {setupBlocks.map((block, bi) => {
              const col = blockColors[bi];
              const blockDone = block.items.filter((item) => Boolean(item.ok)).length;
              return (
                <div key={block.title} className={cn("rounded-xl border p-4", col.border, col.bg)}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{block.icon}</span>
                      <p className={cn("text-sm font-semibold", col.title)}>{block.title}</p>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">{blockDone}/{block.items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {block.items.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900">{item.label}</p>
                          <p className="text-[10px] text-slate-500">{item.detail}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!item.ok && item.action && (
                            item.action.external ? (
                              <a href={item.action.href} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-semibold text-blue-600 underline hover:text-blue-800">
                                {item.action.label} ↗
                              </a>
                            ) : (
                              <Link to={item.action.href}
                                className="text-[10px] font-semibold text-blue-600 underline hover:text-blue-800">
                                {item.action.label} →
                              </Link>
                            )
                          )}
                          <Badge variant="outline" className={cn("text-[10px]", item.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                            {item.ok ? "✓ OK" : "Da fare"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── 2. PIXEL + CAPI ─────────────────────────────────────── */}
      <PixelConfigCard companyId={companyId} />

      {/* ─── 3. SPEND GUARD ──────────────────────────────────────── */}
      <SpendGuardCard companyId={companyId} />

      {/* ─── 4. AUTOMAZIONI ──────────────────────────────────────── */}
      <AutomationRulesEditor companyId={companyId} />

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
  platform,
  metaCampaignId,
  googleCampaignId,
}: {
  companyId?: string;
  platform?: AdsAttributionProvider;
  metaCampaignId?: string | null;
  googleCampaignId?: string | null;
}) {
  const { leads, isLoading, count } = useCampaignLeads({
    companyId,
    platform,
    metaCampaignId,
    googleCampaignId,
    daysBack: 90,
  });
  const providerName = platform === "google" ? "Google Ads" : "Meta";

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
            Quando i lead {providerName} entreranno nel CRM li vedrai qui. Tieni d'occhio anche il CRM principale, dove sono raggruppati per source.
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
              Lead attribuiti a {providerName} e letti dal CRM aziendale.
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

function GoogleCampaignPerformancePanel({
  campaignName,
  googleCampaignId,
}: {
  campaignName: string;
  googleCampaignId?: string | null;
}) {
  const { campaigns, isLoading, refetch } = useGoogleAdsStats();
  const row = useMemo(() => {
    const terms = [googleCampaignId, campaignName].map(normalizeLookup).filter((term) => term.length >= 3);
    return campaigns.find((campaign) => {
      const id = normalizeLookup(campaign.campaign_id);
      const name = normalizeLookup(campaign.campaign_name);
      return terms.some((term) => id.includes(term) || name.includes(term));
    });
  }, [campaigns, campaignName, googleCampaignId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Performance Google Ads</CardTitle>
            <CardDescription>
              Dati importati da google_ads_stats. Il fatturato resta calcolato dal CRM nel pannello sopra.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento Google Ads stats...
          </div>
        ) : !row ? (
          <div className="rounded-xl border border-dashed bg-slate-50 p-6 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Nessuna statistica Google collegata</p>
            <p className="mt-1 text-xs text-slate-500">
              Sincronizza Google Ads o importa la campagna con stesso nome/ID per leggere impressioni, click e spesa.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniMetric label="Spesa" value={formatEuro(Math.round(row.spend * 100))} />
            <MiniMetric label="Impressioni" value={row.impressions.toLocaleString("it-IT")} />
            <MiniMetric label="Click" value={row.clicks.toLocaleString("it-IT")} />
            <MiniMetric label="CTR" value={`${row.ctr.toFixed(2)}%`} />
            <MiniMetric label="Conversioni" value={row.conversions.toLocaleString("it-IT")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
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
/** Pixel Wizard — 4 step guidati per configurare Meta Pixel + CAPI. */
function PixelConfigCard({ companyId }: { companyId?: string }) {
  const { config, isLoading, save, isSaving } = useMetaPixelConfig(companyId);
  const [wizardStep, setWizardStep] = useState(0); // 0=dashboard/intro, 1-4=wizard steps
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [pixelName, setPixelName] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [pixelIdError, setPixelIdError] = useState("");

  useEffect(() => {
    if (config) {
      setPixelId(config.pixel_id ?? "");
      setPixelName(config.pixel_name ?? "");
    }
  }, [config]);

  const hasConfig = !!config?.pixel_id;
  const eventQuality = config?.event_match_quality_score ?? null;

  const validatePixelId = (v: string) => {
    if (!v.trim()) return "Inserisci il Pixel ID";
    if (!/^\d{10,20}$/.test(v.trim())) return "Il Pixel ID deve contenere solo cifre (10-20 caratteri)";
    return "";
  };

  const handleSave = async () => {
    const err = validatePixelId(pixelId);
    if (err) { setPixelIdError(err); return; }
    try {
      await save({
        pixel_id: pixelId.trim(),
        pixel_name: pixelName.trim() || undefined,
        capi_token: capiToken.trim() || undefined,
      });
      setCapiToken("");
      setWizardOpen(false);
      setWizardStep(0);
    } catch (e) {
      toast.error("Errore salvataggio Pixel", {
        description: (e instanceof Error ? e.message : null) ?? "Riprova o controlla la connessione.",
      });
    }
  };

  const WIZARD_STEPS = [
    {
      title: "Dove si trova il Pixel ID",
      description: "Apri Meta Business Manager e segui questi passaggi:",
      guide: [
        { step: "1", text: "Vai su business.facebook.com" },
        { step: "2", text: "Menu → Origini dati → Pixel" },
        { step: "3", text: "Seleziona il tuo Pixel e copia l'ID numerico" },
        { step: "4", text: "L'ID è composto da 15-16 cifre (es. 1234567890123456)" },
      ],
      visual: "📊 Meta Business Manager\n└── Origini dati\n    └── Pixel\n        └── 🔢 ID: 1234567890123456",
      action: null,
    },
    {
      title: "Inserisci il Pixel ID",
      description: "Incolla l'ID numerico del tuo Pixel Meta:",
      guide: [],
      visual: null,
      action: "pixel_id",
    },
    {
      title: "Genera il CAPI token",
      description: "Il token CAPI permette l'attribuzione server-side dei lead:",
      guide: [
        { step: "1", text: "Vai su business.facebook.com/events_manager" },
        { step: "2", text: "Seleziona il tuo Pixel" },
        { step: "3", text: "Tab Impostazioni → sezione Conversions API" },
        { step: "4", text: "Clicca 'Genera token di accesso'" },
        { step: "5", text: "Copia il token generato (inizia con EAA...)" },
      ],
      visual: "📡 Events Manager\n└── Il tuo Pixel\n    └── Impostazioni\n        └── Conversions API\n            └── 🔑 Genera token",
      action: null,
    },
    {
      title: "Inserisci il CAPI token",
      description: "Incolla il token — verrà cifrato e mai esposto:",
      guide: [],
      visual: null,
      action: "capi_token",
    },
  ];

  const currentWizardStep = WIZARD_STEPS[wizardStep] ?? WIZARD_STEPS[0];

  return (
    <Card className="overflow-hidden border-orange-100">
      <div className="h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-orange-600" />
              Pixel Meta + Conversions API
            </CardTitle>
            <CardDescription>
              Attribuzione server-side: i lead/commesse vengono inviati a Meta tramite CAPI per ottimizzazione campagne.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasConfig && (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <Check className="mr-1 h-3 w-3" /> Configurato
              </Badge>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"
              onClick={() => { setWizardOpen((v) => !v); setWizardStep(0); }}>
              {hasConfig ? "✏️ Modifica" : "🧙 Configura guidato"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Caricamento...
          </div>
        )}

        {/* ── DASHBOARD quando già configurato ─────────────────────────── */}
        {hasConfig && !wizardOpen && (
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Salute eventi</p>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                eventQuality === null ? "bg-slate-100 text-slate-500"
                  : eventQuality >= 7 ? "bg-emerald-100 text-emerald-700"
                  : eventQuality >= 5 ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700")}>
                {eventQuality !== null ? `⚡ ${eventQuality.toFixed(1)}/10 Match Quality` : "Nessun dato"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] text-slate-400">Pixel ID</p>
                <p className="font-mono text-sm font-semibold text-slate-800">{config?.pixel_id}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] text-slate-400">Ultimo evento</p>
                <p className="text-sm font-semibold text-slate-800">
                  {config?.last_event_at ? new Date(config.last_event_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] text-slate-400">Eventi 7gg</p>
                <p className="text-sm font-semibold text-slate-800">{config?.events_last_7d ?? 0}</p>
              </div>
            </div>
            {eventQuality !== null && eventQuality < 6 && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-xs">
                  Match Quality basso ({eventQuality.toFixed(1)}/10). Assicurati di inviare email + telefono hashati negli eventi.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── WIZARD ────────────────────────────────────────────────────── */}
        {(!hasConfig || wizardOpen) && (
          <div className="overflow-hidden rounded-2xl border border-orange-200 bg-white">
            {/* Progress steps */}
            <div className="flex border-b border-orange-100 bg-orange-50/50 px-4 py-3">
              {WIZARD_STEPS.map((s, idx) => (
                <div key={idx} className="flex flex-1 items-center">
                  <button type="button" onClick={() => idx < wizardStep && setWizardStep(idx)}
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition",
                      idx === wizardStep
                        ? "bg-orange-500 text-white shadow-sm"
                        : idx < wizardStep
                          ? "bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600"
                          : "bg-slate-200 text-slate-500 cursor-default")}>
                    {idx < wizardStep ? "✓" : idx + 1}
                  </button>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className={cn("mx-1 h-0.5 flex-1 rounded-full transition", idx < wizardStep ? "bg-emerald-400" : "bg-slate-200")} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Passo {wizardStep + 1} di {WIZARD_STEPS.length}</p>
                <h3 className="text-base font-bold text-slate-800">{currentWizardStep.title}</h3>
                <p className="text-sm text-slate-500">{currentWizardStep.description}</p>
              </div>

              {/* Guide steps */}
              {currentWizardStep.guide.length > 0 && (
                <div className="space-y-2">
                  {currentWizardStep.guide.map(({ step, text }) => (
                    <div key={step} className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{step}</span>
                      <p className="pt-0.5 text-sm text-slate-700">{text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Visual guide */}
              {currentWizardStep.visual && (
                <div className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-3">
                  <p className="font-mono text-xs leading-relaxed text-emerald-400 whitespace-pre">{currentWizardStep.visual}</p>
                </div>
              )}

              {/* Action: Pixel ID input */}
              {currentWizardStep.action === "pixel_id" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Pixel ID *</label>
                    <Input
                      value={pixelId}
                      onChange={(e) => { setPixelId(e.target.value.replace(/[^0-9]/g, "")); setPixelIdError(""); }}
                      placeholder="Es. 1234567890123456"
                      inputMode="numeric"
                      className={pixelIdError ? "border-red-400 focus:ring-red-300" : ""}
                    />
                    {pixelIdError && <p className="mt-1 text-[11px] text-red-500">{pixelIdError}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Nome Pixel (opzionale)</label>
                    <Input value={pixelName} onChange={(e) => setPixelName(e.target.value)} placeholder="Es. Pixel sito principale" />
                  </div>
                </div>
              )}

              {/* Action: CAPI token input */}
              {currentWizardStep.action === "capi_token" && (
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">CAPI Access Token</label>
                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={capiToken}
                      onChange={(e) => setCapiToken(e.target.value)}
                      placeholder={hasConfig ? "Token già salvato. Inserisci nuovo per aggiornare." : "EAAxxxxx..."}
                      className="pr-20"
                    />
                    <Button type="button" variant="ghost" size="sm"
                      className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
                      onClick={() => setShowToken((v) => !v)}>
                      {showToken ? "Nascondi" : "Mostra"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">Il token verrà cifrato server-side e mai esposto al frontend. Puoi saltare questo passo e configurarlo in seguito.</p>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center justify-between border-t pt-3">
                <Button variant="ghost" size="sm" disabled={wizardStep === 0}
                  onClick={() => setWizardStep((s) => s - 1)}>
                  ← Indietro
                </Button>

                {wizardStep < WIZARD_STEPS.length - 1 ? (
                  <Button size="sm"
                    className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                    onClick={() => {
                      if (currentWizardStep.action === "pixel_id") {
                        const err = validatePixelId(pixelId);
                        if (err) { setPixelIdError(err); return; }
                      }
                      setWizardStep((s) => s + 1);
                    }}>
                    Avanti →
                  </Button>
                ) : (
                  <Button size="sm" disabled={isSaving || !pixelId.trim()}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                    onClick={handleSave}>
                    {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    ✓ Salva configurazione
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
