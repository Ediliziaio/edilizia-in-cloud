import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeEuro,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Euro,
  Eye,
  Image as ImageIcon,
  Info,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { cn } from "@/lib/utils";
import type { Integration, MetaAsset } from "@/types/integrations";

type AdsTab = "panoramica" | "gestione" | "creativita" | "pubblici" | "risultati" | "impostazioni";
type CampaignStatus = "active" | "paused" | "draft" | "review" | "error";
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
  copyVariants: string[];
  imagePrompt: string;
}

interface BuilderState {
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
  { value: "panoramica", label: "Panoramica", icon: BarChart3 },
  { value: "gestione", label: "Gestione pubblicitaria", icon: Megaphone },
  { value: "creativita", label: "Creatività", icon: Wand2 },
  { value: "pubblici", label: "Pubblici", icon: Target },
  { value: "risultati", label: "Risultati", icon: TrendingUp },
  { value: "impostazioni", label: "Impostazioni", icon: Settings },
];

const SAMPLE_CAMPAIGNS: CampaignRow[] = [
  {
    id: "meta-local-1",
    name: "Serramenti - Lead Monza Brianza",
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
  },
  {
    id: "meta-local-2",
    name: "Bagni chiavi in mano - richieste preventivo",
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
  },
  {
    id: "meta-local-3",
    name: "Brand awareness - provincia",
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
  },
];

const CREATIVE_LIBRARY = [
  { id: "cr-1", title: "Prima/dopo serramenti", format: "Feed 1:1", type: "image", tone: "Prova sociale", color: "from-blue-600 to-slate-800" },
  { id: "cr-2", title: "Ristrutturazione bagno", format: "Story 9:16", type: "image", tone: "Trasformazione", color: "from-orange-500 to-amber-700" },
  { id: "cr-3", title: "Showroom e consulenza", format: "Reel 9:16", type: "video", tone: "Autorevolezza", color: "from-emerald-500 to-teal-800" },
  { id: "cr-4", title: "Cantiere pulito", format: "Feed 4:5", type: "image", tone: "Fiducia", color: "from-violet-500 to-indigo-800" },
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
  privacyUrl: "https://www.ediliziaincloud.com/privacy-policy",
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

function useLocalCampaignDrafts(companyId: string | undefined) {
  const storageKey = companyId ? `eic_ads_manager_beta_drafts_${companyId}` : null;
  const [drafts, setDrafts] = useState<LocalCampaignDraft[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setDrafts(JSON.parse(raw) as LocalCampaignDraft[]);
    } catch {
      setDrafts([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(drafts));
    } catch {
      // localStorage non disponibile: la bozza resta in memoria per la sessione.
    }
  }, [drafts, storageKey]);

  const saveDraft = (state: BuilderState) => {
    const draft: LocalCampaignDraft = {
      id: `draft-${Date.now()}`,
      name: state.name.trim() || "Campagna Meta senza nome",
      objective: state.objective,
      budgetCents: getCampaignDailyBudget(state) * 100,
      zone: state.zone.trim() || "Zona non definita",
      adSets: state.adSets.length,
      ads: getAdMatrixSize(state),
      targetCplCents: state.targetCpl * 100,
      createdAt: new Date().toISOString(),
      copyVariants: state.copyVariants,
      imagePrompt: state.imagePrompt,
    };
    setDrafts((prev) => [draft, ...prev].slice(0, 20));
    return draft;
  };

  const removeDraft = (id: string) => setDrafts((prev) => prev.filter((draft) => draft.id !== id));

  return { drafts, saveDraft, removeDraft };
}

export default function AdsManagerBeta() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const isDemoCompany = companyId === DEMO_COMPANY_ID;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const isBuilderOpen = searchParams.get("mode") === "create" || requestedTab === "crea";
  const activeTab = TABS.some((tab) => tab.value === requestedTab) ? (requestedTab as AdsTab) : "panoramica";
  const meta = useMetaConnection(companyId, isDemoCompany);
  const { drafts, saveDraft, removeDraft } = useLocalCampaignDrafts(companyId);
  const openBuilder = () => setSearchParams({ mode: "create" });
  const closeBuilder = (tab: AdsTab = "panoramica") => setSearchParams({ tab });

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
      })),
    [drafts],
  );

  const campaigns = useMemo(() => [...draftRows, ...SAMPLE_CAMPAIGNS], [draftRows]);
  const monthlySpend = campaigns.reduce((sum, campaign) => sum + campaign.spentCents, 0);
  const totalLeads = campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
  const totalJobs = campaigns.reduce((sum, campaign) => sum + campaign.jobs, 0);
  const costPerLead = totalLeads ? monthlySpend / totalLeads : 0;
  const costPerJob = totalJobs ? monthlySpend / totalJobs : 0;
  const monthlyCap = 750000;
  const spendPct = Math.min(100, Math.round((monthlySpend / monthlyCap) * 100));

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

  return (
    <div className="min-h-screen bg-slate-50/70">
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Pubblicità
            </h1>
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
            <Button onClick={openBuilder}>
              <Plus className="h-4 w-4" />
              Nuova campagna
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <ConnectionStrip meta={meta} />

        {isBuilderOpen ? (
          <div className="mt-5">
            <CampaignBuilderTab
              onCancel={() => closeBuilder("panoramica")}
              onSaveDraft={(state) => {
                const draft = saveDraft(state);
                toast.success("Bozza campagna salvata", {
                  description: `${draft.name} è pronta per revisione prima della pubblicazione Meta.`,
                });
                closeBuilder("gestione");
              }}
            />
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })} className="mt-5">
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

          <TabsContent value="panoramica" className="mt-4">
            <OverviewTab
              campaigns={campaigns}
              spendPct={spendPct}
              monthlySpend={monthlySpend}
              monthlyCap={monthlyCap}
              totalLeads={totalLeads}
              totalJobs={totalJobs}
              costPerLead={costPerLead}
              costPerJob={costPerJob}
              onCreate={openBuilder}
            />
          </TabsContent>

          <TabsContent value="gestione" className="mt-4">
            <CampaignManagementTab campaigns={campaigns} onRemoveDraft={removeDraft} />
          </TabsContent>

          <TabsContent value="creativita" className="mt-4">
            <CreativeStudioTab />
          </TabsContent>

          <TabsContent value="pubblici" className="mt-4">
            <AudiencesTab />
          </TabsContent>

          <TabsContent value="risultati" className="mt-4">
            <ResultsTab campaigns={campaigns} />
          </TabsContent>

          <TabsContent value="impostazioni" className="mt-4">
            <SettingsTab meta={meta} />
          </TabsContent>
        </Tabs>
        )}
      </main>
    </div>
  );
}

function ConnectionStrip({ meta }: { meta: ReturnType<typeof useMetaConnection> }) {
  const connected = meta.integration?.status === "connected";
  return (
    <Card className={cn("border", connected ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}>
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
            {meta.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : connected ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <p className="font-semibold text-slate-950">
            {connected ? "Meta collegato" : "Meta non ancora pronto per pubblicare"}
            </p>
            <p className="text-sm text-slate-600">
              {connected
                ? `${meta.adAccounts.length} account pubblicitario, ${meta.pages.length} pagine e ${meta.businesses.length} Business Manager rilevati.`
                : "Puoi progettare bozze e creativita. Per pubblicare serviranno Business Manager, account pubblicitario, Pagina e token tecnico sicuro."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/azienda/impostazioni/lead-forms">Apri impostazioni Meta</Link>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toast.info("Pubblicazione Meta disattivata in Beta locale", { description: "Le campagne vengono salvate come bozze finche non attiviamo il proxy sicuro con revisione e rollback." })}
          >
            Stato sicurezza
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({
  campaigns,
  spendPct,
  monthlySpend,
  monthlyCap,
  totalLeads,
  totalJobs,
  costPerLead,
  costPerJob,
  onCreate,
}: {
  campaigns: CampaignRow[];
  spendPct: number;
  monthlySpend: number;
  monthlyCap: number;
  totalLeads: number;
  totalJobs: number;
  costPerLead: number;
  costPerJob: number;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BadgeEuro} label="Spesa mese" value={formatEuro(monthlySpend)} detail={`${spendPct}% del limite protetto`} tone="blue" />
        <MetricCard icon={Users} label="Lead ricevuti" value={String(totalLeads)} detail="da campagne Meta" tone="orange" />
        <MetricCard icon={Target} label="Costo per lead" value={costPerLead ? formatEuro(costPerLead) : "-"} detail="non solo click" tone="green" />
        <MetricCard icon={Check} label="Costo per commessa" value={costPerJob ? formatEuro(costPerJob) : "-"} detail={`${totalJobs} commesse collegate`} tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Limite di spesa protetto</CardTitle>
                <CardDescription>La pubblicazione reale partirà sempre in PAUSED e richiederà revisione prima di ACTIVE.</CardDescription>
              </div>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
                Guard rail attivo
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-600">Spesa stimata mese</span>
              <span className="font-semibold">{formatEuro(monthlySpend)} / {formatEuro(monthlyCap)}</span>
            </div>
            <Progress value={spendPct} className="h-2.5 bg-slate-100" indicatorClassName="bg-orange-500" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["Budget > 30 euro/giorno", "Richiede ok titolare"],
                ["Oggetti Meta", "Creati in PAUSED"],
                ["Errore pipeline", "Rollback previsto"],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-lg border bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">AdsBot operativo</CardTitle>
            <CardDescription>Guida la scelta tra budget, copy, pubblico e creativita.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-800">
                <Sparkles className="h-4 w-4" />
                Raccomandazione
              </div>
              <p className="text-sm text-orange-900/80">
                Scala solo campagne con costo per commessa sotto il margine target. Per le altre, genera prima una creativita nuova e testa un pubblico separato.
              </p>
            </div>
            <Button className="w-full" onClick={onCreate}>
              Apri wizard campagna
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <CampaignManagementTab campaigns={campaigns.slice(0, 5)} compact />
    </div>
  );
}

function MetricCard({
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
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-xl border", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function CampaignManagementTab({
  campaigns,
  compact = false,
  onRemoveDraft,
}: {
  campaigns: CampaignRow[];
  compact?: boolean;
  onRemoveDraft?: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Gestione pubblicitaria</CardTitle>
            <CardDescription>Campagne Meta e bozze locali in un unico punto di controllo.</CardDescription>
          </div>
          {!compact && (
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Cerca campagna, obiettivo, stato..." />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-950">{campaign.name}</p>
                      <p className="text-xs text-slate-500">{objectiveLabel(campaign.objective)} - {campaign.source === "local" ? "bozza locale" : "Meta"}</p>
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
                  <TableCell className="text-right font-medium">{formatEuro(campaign.budgetCents)}</TableCell>
                  <TableCell className="text-right">{formatEuro(campaign.spentCents)}</TableCell>
                  <TableCell className="text-right">{campaign.leads}</TableCell>
                  <TableCell className="text-right">{campaign.targetCplCents ? formatEuro(campaign.targetCplCents) : "-"}</TableCell>
                  <TableCell className="text-right">{campaign.jobs}</TableCell>
                  <TableCell className="text-right">
                    {campaign.source === "local" ? (
                      <Button size="sm" variant="outline" onClick={() => onRemoveDraft?.(campaign.id)}>
                        Elimina bozza
                      </Button>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" aria-label="Pausa campagna" onClick={() => toast.info("Azione Meta non attiva in Beta locale")}>
                          {campaign.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Apri dettagli" onClick={() => toast.info("Dettaglio Meta in preparazione locale")}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 lg:hidden">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{campaign.name}</p>
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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

function CampaignBuilderTab({ onSaveDraft, onCancel }: { onSaveDraft: (state: BuilderState) => void; onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<BuilderState>(DEFAULT_BUILDER);
  const totalDailyBudget = getCampaignDailyBudget(state);
  const dailyBudgetCents = totalDailyBudget * 100;
  const overApprovalLimit = totalDailyBudget > 30;
  const readiness = getReadinessScore(state);
  const isStepValid =
    (step === 1 && state.name.trim().length >= 3 && state.offer.trim().length >= 12 && !!state.objective) ||
    (step === 2 && state.zone.trim().length >= 2 && state.radiusKm >= 1 && state.ageMin <= state.ageMax && state.languages.trim().length >= 2 && state.adSets.length > 0 && state.adSets.every((adSet) => adSet.name.trim().length >= 2 && adSet.dailyBudget >= 5 && adSet.audience.trim().length >= 3)) ||
    (step === 3 && state.requiredFields.trim().length >= 8 && state.privacyUrl.trim().length >= 10 && state.followUp.trim().length >= 10) ||
    (step === 4 && state.copyVariants.every((copy) => copy.trim().length >= 20) && state.imagePrompt.trim().length >= 20 && state.creatives.length > 0 && state.creatives.every((creative) => creative.prompt.trim().length >= 20)) ||
    step === 5;

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

  const regenerateCopy = () => {
    setState((prev) => ({ ...prev, copyVariants: buildCopyVariants(prev) }));
    toast.success("5 copy generati", { description: "Li puoi modificare prima di salvare la bozza." });
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
              const done = current < step;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(current)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-3 text-left transition",
                    active ? "border-orange-300 bg-orange-50" : done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white",
                  )}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", active ? "bg-orange-500 text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500")}>
                    {done ? <Check className="h-4 w-4" /> : current}
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <TemplateSelector selectedId={state.templateId} onSelect={applyTemplate} />
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-700" />
                <AlertTitle>Parti dalla promessa, non dal pulsante Meta</AlertTitle>
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
                <Button type="button" variant="outline" size="sm" onClick={regenerateCopy}>
                  <Sparkles className="h-4 w-4" />
                  Rigenera copy
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
              <Button onClick={() => onSaveDraft(state)}>
                Salva bozza locale
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                E
              </div>
              <div>
                <p className="text-sm font-semibold">Demo Azienda S.r.l.</p>
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
  const missing = readiness.items.filter((item) => !item.ok).slice(0, 2);
  return (
    <div className="mb-5 rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Semaforo pre-lancio</p>
          <p className="text-sm text-slate-600">
            {readiness.score >= 80
              ? "La campagna è pronta per una revisione finale prima del live."
              : "Completa i punti sotto prima di pubblicare o aumentare budget."}
          </p>
        </div>
        <div className="min-w-[220px]">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Prontezza</span>
            <span className="font-bold text-slate-950">{readiness.score}/100</span>
          </div>
          <Progress value={readiness.score} className="h-2 bg-slate-100" indicatorClassName={readiness.score >= 80 ? "bg-emerald-600" : "bg-orange-500"} />
        </div>
      </div>
      {missing.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {missing.map((item) => (
            <div key={item.title} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">{item.title}</p>
              <p className="text-xs leading-relaxed text-amber-800">{item.fix}</p>
            </div>
          ))}
        </div>
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

function LaunchChecklist({ readiness }: { readiness: ReturnType<typeof getReadinessScore> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {readiness.items.map((item) => (
        <div key={item.title} className={cn("rounded-xl border p-3", item.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
          <div className="flex items-start gap-2">
            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", item.ok ? "bg-emerald-600 text-white" : "bg-amber-500 text-white")}>
              {item.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="text-xs leading-relaxed text-slate-600">{item.fix}</p>
            </div>
          </div>
        </div>
      ))}
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

function CreativeStudioTab() {
  const [brief, setBrief] = useState("Serramenti premium con sopralluogo gratuito e posa certificata");
  const prompt = `Crea una creativita Meta Ads per impresa edile italiana. Settore: ${brief}. Output: hook breve, promessa concreta, prova sociale, CTA preventivo, immagine realistica 4:5 e variante story 9:16. Evita claim non verificabili.`;

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Studio creativita AI</CardTitle>
          <CardDescription>Prepara prompt, copy e formati prima di generare asset reali.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Brief creativo">
            <Textarea value={brief} onChange={(event) => setBrief(event.target.value)} className="min-h-28" />
          </Field>
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Bot className="h-4 w-4 text-violet-600" />
              Prompt operativo
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{prompt}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              void navigator.clipboard?.writeText(prompt);
              toast.success("Prompt copiato");
            }}
          >
            <Copy className="h-4 w-4" />
            Copia prompt
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {CREATIVE_LIBRARY.map((creative) => (
          <Card key={creative.id} className="overflow-hidden">
            <div className={cn("flex aspect-[4/3] items-center justify-center bg-gradient-to-br text-white", creative.color)}>
              {creative.type === "video" ? <Play className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{creative.title}</CardTitle>
              <CardDescription>{creative.format} - {creative.tone}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <Eye className="h-4 w-4" />
                Anteprima
              </Button>
              <Button size="sm" className="flex-1" onClick={() => toast.info("Creatività selezionata per la prossima bozza")}>
                Usa
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AudiencesTab() {
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
              <Button variant="outline" className="w-full" onClick={() => toast.info("Pubblico pronto per il prossimo wizard")}>
                Usa nel wizard
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResultsTab({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <CampaignManagementTab campaigns={campaigns} compact />
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">Insight AI</CardTitle>
          <CardDescription>Decisioni operative da prendere sui prossimi test.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["Scala", "Serramenti ha un costo per commessa sostenibile. Aumenta budget del 15% solo dopo 48h stabili."],
            ["Correggi", "Bagni genera lead ma poche commesse. Cambia promessa e aggiungi prezzo indicativo nel copy."],
            ["Misura", "Collega ogni lead a opportunita e commessa per evitare ottimizzazione sul CPL sbagliato."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border bg-white p-4">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ meta }: { meta: ReturnType<typeof useMetaConnection> }) {
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
