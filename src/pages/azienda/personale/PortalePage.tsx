import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookMarked,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  Flag,
  GraduationCap,
  LayoutTemplate,
  Library,
  ListChecks,
  LockKeyhole,
  PanelRight,
  PlayCircle,
  Plus,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  UploadCloud,
  UserRoundCheck,
  Users,
  Video,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PORTAL_ALLOWED_MATERIAL_MIME_TYPES,
  PORTAL_MAX_MATERIAL_SIZE_BYTES,
  PORTAL_MATERIAL_ACCEPT,
  createPortalMaterialSignedUrl,
  getPortalAudienceCounts,
  isPortalLearningUnavailable,
  listAllPortalCourseEnrollments,
  listPortalCourseEnrollments,
  listPortalCourseProgress,
  listPortalCourses,
  logPortalCourseActivity,
  assignPortalCourseToUsers,
  savePortalCourseEnrollment,
  savePortalCourse,
  uploadPortalMaterial,
} from "@/lib/portalLearningApi";
import { cn } from "@/lib/utils";

type PortalCourseStatus = "bozza" | "pubblicato" | "revisione";
type PortalArea = "sicurezza" | "procedure" | "commerciale" | "onboarding" | "tecnica";
type PortalAudience = "tutti" | "operai" | "ufficio" | "commerciali" | "capicantiere";
type PortalAssetType = "video" | "pdf" | "procedura" | "quiz" | "link" | "testo" | "immagine" | "documento";
type LearnerCourseFilter = "tutti" | "in_corso" | "da_iniziare" | "completati";
type PortalKnowledgeFilter = "tutti" | "procedure" | "manuali" | "regolamenti" | "quiz";
type PortalLessonBlockType =
  | "video"
  | "testo"
  | "pdf"
  | "checklist"
  | "quiz"
  | "download"
  | "link"
  | "presa_visione";
type PortalLessonBlockStatus = "pronto" | "manca_risorsa" | "consigliato";
type PortalLearnerView = "library" | "course";
type PortalCourseExperienceView = "overview" | "lesson";

interface PortalAsset {
  id: string;
  title: string;
  type: PortalAssetType;
  duration: string;
  moduleId?: string;
  source?: string;
  downloadUrl?: string;
  downloadable?: boolean;
  content?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

interface PortalLessonBlock {
  id: string;
  title: string;
  description: string;
  type: PortalLessonBlockType;
  status: PortalLessonBlockStatus;
  asset?: PortalAsset;
}

interface PortalAcknowledgementItem {
  id: string;
  title: string;
  description: string;
  courseTitle: string;
  moduleTitle: string;
  required: boolean;
  asset?: PortalAsset;
}

interface PortalModule {
  id: string;
  title: string;
  description: string;
  lessons: number;
  duration: string;
  completedRate: number;
}

interface PortalCourse {
  id: string;
  title: string;
  description: string;
  area: PortalArea;
  audience: PortalAudience;
  status: PortalCourseStatus;
  owner: string;
  updatedAt: string;
  enrolled: number;
  completion: number;
  modules: PortalModule[];
  assets: PortalAsset[];
  /**
   * Origine del corso dal punto di vista dell'azienda corrente.
   *   - "own"      → corso creato dall'azienda stessa (modificabile).
   *   - "platform" → corso del Superadmin concesso via grant (READ-ONLY:
   *     niente edit/delete/add module/upload asset; solo enrollment e
   *     tracking progress dei propri utenti).
   * Quando undefined, trattiamo come "own" per retrocompatibilità.
   */
  sourceType?: "own" | "platform";
  /** company_id del proprietario originale (utile per signed URL storage cross-company). */
  ownerCompanyId?: string;
}

interface PortalTemplate {
  id: string;
  title: string;
  description: string;
  area: PortalArea;
  audience: PortalAudience;
  modules: PortalModule[];
  assets: PortalAsset[];
}

interface PortalKnowledgeItem {
  id: string;
  title: string;
  category: Exclude<PortalKnowledgeFilter, "tutti">;
  asset: PortalAsset;
  course: PortalCourse;
  moduleTitle: string;
  hasResource: boolean;
  requiresAcknowledgement: boolean;
  version: string;
  responsible: string;
  reviewDue: string;
  visibility: string;
  governanceStatus: "ok" | "revisione" | "incompleto";
}

const STORAGE_KEY = "eic-personale-portale-courses-v1";
const LEARNER_STATE_KEY = "eic-personale-portale-learner-state-v1";

function getPortalStorageKey(companyId: string | null | undefined) {
  return companyId ? `${STORAGE_KEY}:${companyId}` : STORAGE_KEY;
}

interface PortalLearnerState {
  completedModules: Record<string, boolean>;
  acknowledgements: Record<string, string>;
}

function getPortalLearnerStateKey(companyId: string | null | undefined, userId: string | null | undefined) {
  return [LEARNER_STATE_KEY, companyId ?? "locale", userId ?? "preview"].join(":");
}

function loadPortalLearnerState(companyId: string | null | undefined, userId: string | null | undefined): PortalLearnerState {
  const emptyState: PortalLearnerState = { completedModules: {}, acknowledgements: {} };
  if (typeof window === "undefined") return emptyState;

  try {
    const raw = window.localStorage.getItem(getPortalLearnerStateKey(companyId, userId));
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<PortalLearnerState>;
    return {
      completedModules: parsed.completedModules && typeof parsed.completedModules === "object" ? parsed.completedModules : {},
      acknowledgements: parsed.acknowledgements && typeof parsed.acknowledgements === "object" ? parsed.acknowledgements : {},
    };
  } catch {
    return emptyState;
  }
}

const areaLabels: Record<PortalArea, string> = {
  sicurezza: "Sicurezza",
  procedure: "Procedure",
  commerciale: "Commerciale",
  onboarding: "Onboarding",
  tecnica: "Tecnica",
};

const audienceLabels: Record<PortalAudience, string> = {
  tutti: "Tutta azienda",
  operai: "Operai",
  ufficio: "Ufficio",
  commerciali: "Commerciali",
  capicantiere: "Capicantiere",
};

const knowledgeCategoryLabels: Record<PortalKnowledgeFilter, string> = {
  tutti: "Tutti",
  procedure: "Procedure",
  manuali: "Manuali",
  regolamenti: "Regolamenti",
  quiz: "Quiz",
};

const statusClasses: Record<PortalCourseStatus, string> = {
  bozza: "border-slate-200 bg-slate-50 text-slate-700",
  pubblicato: "border-emerald-200 bg-emerald-50 text-emerald-700",
  revisione: "border-amber-200 bg-amber-50 text-amber-700",
};

const defaultCourses: PortalCourse[] = [
  {
    id: "sicurezza-base",
    title: "Sicurezza base in cantiere",
    description: "Percorso obbligatorio per DPI, accesso cantiere, segnaletica e comportamento operativo.",
    area: "sicurezza",
    audience: "operai",
    status: "pubblicato",
    owner: "HR",
    updatedAt: "Aggiornato oggi",
    enrolled: 38,
    completion: 76,
    modules: [
      { id: "m1", title: "Accesso e DPI", description: "Regole minime prima di entrare in cantiere.", lessons: 2, duration: "28 min", completedRate: 82 },
      { id: "m2", title: "Rischi operativi", description: "Cadute, movimentazione carichi e procedure di emergenza.", lessons: 2, duration: "42 min", completedRate: 71 },
      { id: "m3", title: "Quiz finale", description: "Verifica interna con esito tracciabile.", lessons: 1, duration: "8 min", completedRate: 64 },
    ],
    assets: [
      {
        id: "a1",
        title: "Manuale DPI aziendale",
        type: "pdf",
        duration: "12 pagine",
        moduleId: "m1",
        content:
          "Manuale operativo sintetico: controllo casco, scarpe antinfortunistiche, guanti, occhiali, gilet alta visibilita e verifica autorizzazioni prima dell'accesso.",
      },
      {
        id: "a2",
        title: "Video accesso cantiere",
        type: "video",
        duration: "6 min",
        moduleId: "m1",
        downloadable: false,
        content:
          "Storyboard video demo: ingresso in cantiere, check DPI, firma presenza, identificazione area di lavoro e comunicazione al capocantiere.",
      },
      {
        id: "a3",
        title: "Video: cadute e movimentazione carichi",
        type: "video",
        duration: "8 min",
        moduleId: "m2",
        downloadable: false,
        content:
          "Storyboard video demo: rischio caduta dall'alto, uso imbracatura, movimentazione manuale e meccanica dei carichi, aree di manovra e segnalazione.",
      },
      {
        id: "a4",
        title: "Procedure di emergenza",
        type: "procedura",
        duration: "6 step",
        moduleId: "m2",
        content:
          "1. Riconosci l'emergenza.\n2. Metti in sicurezza te stesso.\n3. Dai l'allarme.\n4. Segui le vie di fuga.\n5. Raggiungi il punto di raccolta.\n6. Segnala al preposto.",
      },
      {
        id: "a5",
        title: "Quiz presa visione sicurezza",
        type: "quiz",
        duration: "8 domande",
        moduleId: "m3",
        content:
          "Verifica finale a risposta multipla su DPI, accesso cantiere, rischi operativi ed emergenze. Esito tracciabile per l'abilitazione.",
      },
    ],
  },
  {
    id: "procedure-oda-ddt",
    title: "Procedure acquisti, ODA e DDT",
    description: "Come richiedere materiale, confermare ricezioni, allegare DDT e gestire anomalie fornitore.",
    area: "procedure",
    audience: "ufficio",
    status: "pubblicato",
    owner: "Operations",
    updatedAt: "Aggiornato 2 giorni fa",
    enrolled: 12,
    completion: 58,
    modules: [
      { id: "m1", title: "Richiesta materiale", description: "Dal bisogno di cantiere alla richiesta interna.", lessons: 2, duration: "18 min", completedRate: 74 },
      { id: "m2", title: "Ricezione DDT", description: "Controlli, foto colli, seriali e carico magazzino.", lessons: 2, duration: "36 min", completedRate: 48 },
    ],
    assets: [
      {
        id: "a3",
        title: "Video: dalla richiesta all'ODA",
        type: "video",
        duration: "5 min",
        moduleId: "m1",
        downloadable: false,
        content:
          "Storyboard video demo: come nasce il bisogno in cantiere, compilazione richiesta interna, approvazione e trasformazione in ordine di acquisto (ODA).",
      },
      {
        id: "a4",
        title: "Modulo richiesta materiale",
        type: "pdf",
        duration: "1 pagina",
        moduleId: "m1",
        content:
          "Campi minimi della richiesta: cantiere, referente, materiale, quantita, data richiesta, urgenza e note per l'ufficio acquisti.",
      },
      {
        id: "a1",
        title: "Checklist ricezione merce",
        type: "procedura",
        duration: "7 step",
        moduleId: "m2",
        content:
          "1. Verifica fornitore e ODA.\n2. Conta colli e bancali.\n3. Controlla danni visibili.\n4. Fotografa anomalie.\n5. Abbina DDT all'ordine.\n6. Carica magazzino.\n7. Segnala extra o mancanze.",
      },
      {
        id: "a2",
        title: "Template contestazione fornitore",
        type: "pdf",
        duration: "1 pagina",
        moduleId: "m2",
        content:
          "Oggetto: contestazione consegna ODA [numero]. Indicare DDT, materiale mancante/danneggiato, foto allegate, richiesta di reintegro e nuova data confermata.",
      },
    ],
  },
  {
    id: "vendita-serramenti",
    title: "Formazione commerciale serramenti",
    description: "Script, obiezioni, sopralluogo consultivo e presentazione preventivo ad alto valore.",
    area: "commerciale",
    audience: "commerciali",
    status: "revisione",
    owner: "Sales",
    updatedAt: "Aggiornato ieri",
    enrolled: 6,
    completion: 31,
    modules: [
      { id: "m1", title: "Diagnosi del cliente", description: "Domande guida per capire urgenza, budget e motivazione.", lessons: 4, duration: "25 min", completedRate: 38 },
      { id: "m2", title: "Presentazione offerta", description: "Come raccontare investimento, garanzie e differenziatori.", lessons: 3, duration: "22 min", completedRate: 24 },
    ],
    assets: [
      {
        id: "a1",
        title: "Script chiamata lead caldo",
        type: "pdf",
        duration: "3 pagine",
        content:
          "Apertura: conferma richiesta e contesto. Diagnosi: urgenza, budget, decision maker, motivazione. Chiusura: prossimo passo chiaro con sopralluogo o raccolta misure.",
      },
      {
        id: "a2",
        title: "Roleplay obiezioni prezzo",
        type: "video",
        duration: "14 min",
        downloadable: false,
        content:
          "Scenario demo: cliente orientato al prezzo. Obiettivo: riportare la conversazione su sicurezza, isolamento, garanzie, posa certificata e costo nel tempo.",
      },
    ],
  },
];

const courseTemplates: PortalTemplate[] = [
  {
    id: "tpl-onboarding",
    title: "Onboarding nuovo assunto",
    description: "Accoglienza, strumenti EiC, regole interne e primo percorso operativo.",
    area: "onboarding",
    audience: "tutti",
    modules: [
      { id: "tpl-onboarding-m1", title: "Benvenuto e strumenti", description: "Account, app, comunicazioni e prime attività.", lessons: 3, duration: "22 min", completedRate: 0 },
      { id: "tpl-onboarding-m2", title: "Procedure aziendali", description: "Come leggere procedure, manuali e responsabilità.", lessons: 4, duration: "35 min", completedRate: 0 },
    ],
    assets: [
      {
        id: "tpl-onboarding-a1",
        title: "Checklist primo giorno",
        type: "procedura",
        duration: "9 step",
        content:
          "Account, accessi app, firma documenti, tour strumenti, responsabile assegnato, primo task, canali comunicazione, materiali obbligatori, feedback fine giornata.",
      },
      {
        id: "tpl-onboarding-a2",
        title: "Manuale strumenti interni",
        type: "pdf",
        duration: "8 pagine",
        content:
          "Guida sintetica agli strumenti aziendali: login, calendario, chat, documenti, ticket, procedure, magazzino e canali di supporto.",
      },
    ],
  },
  {
    id: "tpl-sicurezza",
    title: "Sicurezza obbligatoria",
    description: "Percorso pronto per DPI, accessi, rischi e conferma presa visione.",
    area: "sicurezza",
    audience: "operai",
    modules: [
      { id: "tpl-sicurezza-m1", title: "Regole prima dell'accesso", description: "Documenti, DPI e autorizzazioni minime.", lessons: 4, duration: "30 min", completedRate: 0 },
      { id: "tpl-sicurezza-m2", title: "Emergenze e segnalazioni", description: "Cosa fare in caso di rischio, incidente o anomalia.", lessons: 3, duration: "24 min", completedRate: 0 },
      { id: "tpl-sicurezza-m3", title: "Quiz presa visione", description: "Verifica tracciabile prima dell'abilitazione.", lessons: 1, duration: "7 min", completedRate: 0 },
    ],
    assets: [
      {
        id: "tpl-sicurezza-a1",
        title: "Registro presa visione",
        type: "quiz",
        duration: "5 domande",
        content:
          "Quiz: DPI obbligatori, accesso area lavoro, segnalazione anomalia, procedura emergenza, conferma presa visione del regolamento.",
      },
      {
        id: "tpl-sicurezza-a2",
        title: "Manuale sicurezza sintetico",
        type: "pdf",
        duration: "10 pagine",
        content:
          "Manuale base per rischi comuni, DPI, movimentazione carichi, lavori in quota, emergenze, segnalazioni e comportamento in cantiere.",
      },
    ],
  },
  {
    id: "tpl-vendita",
    title: "Training commerciale",
    description: "Script, obiezioni, sopralluogo e follow-up per aumentare conversione.",
    area: "commerciale",
    audience: "commerciali",
    modules: [
      { id: "tpl-vendita-m1", title: "Qualifica lead", description: "Domande su urgenza, budget, contesto e decision maker.", lessons: 4, duration: "28 min", completedRate: 0 },
      { id: "tpl-vendita-m2", title: "Preventivo ad alto valore", description: "Come presentare investimento, garanzie e differenziatori.", lessons: 5, duration: "40 min", completedRate: 0 },
    ],
    assets: [
      {
        id: "tpl-vendita-a1",
        title: "Script telefonata lead caldo",
        type: "pdf",
        duration: "3 pagine",
        content:
          "Script: qualifica bisogno, urgenza, budget, area intervento, decision maker e proposta del prossimo step con appuntamento o sopralluogo.",
      },
      {
        id: "tpl-vendita-a2",
        title: "Roleplay obiezioni prezzo",
        type: "video",
        duration: "12 min",
        downloadable: false,
        content:
          "Roleplay demo: gestione obiezione prezzo con confronto valore, garanzia, risultato atteso e rischio di scegliere solo il preventivo piu basso.",
      },
    ],
  },
  {
    id: "tpl-procedure-operative",
    title: "Manuale procedure operative",
    description: "SOP aziendali con versioni, responsabili, checklist e presa visione.",
    area: "procedure",
    audience: "tutti",
    modules: [
      {
        id: "tpl-procedure-m1",
        title: "Come leggere una procedura",
        description: "Responsabile, campo di applicazione, step operativi e conferma lettura.",
        lessons: 2,
        duration: "15 min",
        completedRate: 0,
      },
      {
        id: "tpl-procedure-m2",
        title: "Procedure di reparto",
        description: "Acquisti, logistica, cantiere, amministrazione e commerciale.",
        lessons: 5,
        duration: "45 min",
        completedRate: 0,
      },
    ],
    assets: [
      {
        id: "tpl-procedure-a1",
        title: "SOP ricezione DDT e carico magazzino",
        type: "procedura",
        duration: "12 step",
        moduleId: "tpl-procedure-m2",
        content:
          "Scopo: evitare errori tra DDT, ODA e magazzino.\nResponsabile: ufficio acquisti.\nStep: verifica fornitore, abbina ODA, controlla colli, fotografa anomalie, registra quantità, segnala differenze, archivia DDT.",
      },
      {
        id: "tpl-procedure-a2",
        title: "Indice manuale operativo aziendale",
        type: "documento",
        duration: "6 sezioni",
        moduleId: "tpl-procedure-m1",
        content:
          "Struttura consigliata: ruoli, sicurezza, vendite, produzione, logistica, amministrazione, sistemi digitali, revisioni e conferme lettura.",
      },
    ],
  },
  {
    id: "tpl-regolamento-interno",
    title: "Regolamento interno",
    description: "Regole aziendali, policy operative e conferma obbligatoria per il team.",
    area: "procedure",
    audience: "tutti",
    modules: [
      {
        id: "tpl-regolamento-m1",
        title: "Regole generali",
        description: "Comportamento, strumenti, comunicazioni interne e responsabilità.",
        lessons: 3,
        duration: "24 min",
        completedRate: 0,
      },
      {
        id: "tpl-regolamento-m2",
        title: "Presa visione",
        description: "Quiz e conferma lettura tracciabile per ogni collaboratore.",
        lessons: 1,
        duration: "8 min",
        completedRate: 0,
      },
    ],
    assets: [
      {
        id: "tpl-regolamento-a1",
        title: "Regolamento uso strumenti aziendali",
        type: "testo",
        duration: "Policy",
        moduleId: "tpl-regolamento-m1",
        content:
          "Linee guida: account personali, uso dispositivi, documenti condivisi, privacy clienti, gestione password, canali ufficiali e responsabilità di aggiornamento dati.",
      },
      {
        id: "tpl-regolamento-a2",
        title: "Quiz presa visione regolamento",
        type: "quiz",
        duration: "6 domande",
        moduleId: "tpl-regolamento-m2",
        content:
          "Domande suggerite: quali canali usare, come segnalare problemi, dove archiviare documenti, chi approva deroghe e cosa conferma la presa visione.",
      },
    ],
  },
];

const demoAssetDefaults: Record<string, Pick<PortalAsset, "content" | "downloadable">> = Object.fromEntries(
  defaultCourses.flatMap((course) =>
    course.assets
      .filter((asset) => asset.content || asset.downloadable === false)
      .map((asset) => [`${course.id}:${asset.id}`, { content: asset.content, downloadable: asset.downloadable }]),
  ),
);

const assetIcon: Record<PortalAssetType, typeof Video> = {
  video: Video,
  pdf: FileText,
  procedura: ClipboardCheck,
  quiz: CheckCircle2,
  link: Library,
  testo: FileText,
  immagine: Eye,
  documento: FileArchive,
};

const assetTypeLabels: Record<PortalAssetType, string> = {
  video: "Video",
  pdf: "PDF",
  procedura: "Procedura",
  quiz: "Quiz",
  link: "Link",
  testo: "Testo",
  immagine: "Immagine",
  documento: "Documento",
};

const contentAssetTypes = new Set<PortalAssetType>(["testo", "procedura", "quiz"]);
const learnerCourseFilters: LearnerCourseFilter[] = ["tutti", "in_corso", "da_iniziare", "completati"];

function isLearnerCourseFilter(value: string | null): value is LearnerCourseFilter {
  return Boolean(value && learnerCourseFilters.includes(value as LearnerCourseFilter));
}

function isPortalCourseExperienceView(value: string | null): value is PortalCourseExperienceView {
  return value === "overview" || value === "lesson";
}

const lessonBlockLabels: Record<PortalLessonBlockType, string> = {
  video: "Video",
  testo: "Testo",
  pdf: "PDF",
  checklist: "Checklist",
  quiz: "Quiz",
  download: "Download",
  link: "Link",
  presa_visione: "Presa visione",
};

const lessonBlockIcon: Record<PortalLessonBlockType, typeof Video> = {
  video: Video,
  testo: FileText,
  pdf: FileText,
  checklist: ClipboardCheck,
  quiz: CheckCircle2,
  download: Download,
  link: ExternalLink,
  presa_visione: ShieldCheck,
};

function loadCourses(companyId?: string | null): PortalCourse[] {
  if (typeof window === "undefined") return defaultCourses;
  try {
    const raw = window.localStorage.getItem(getPortalStorageKey(companyId));
    if (!raw) return defaultCourses;
    const parsed = JSON.parse(raw) as PortalCourse[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(normalizePortalCourse) : defaultCourses;
  } catch {
    return defaultCourses;
  }
}

function normalizePortalCourse(course: PortalCourse): PortalCourse {
  return {
    ...course,
    modules: Array.isArray(course.modules) ? course.modules : [],
    assets: Array.isArray(course.assets)
      ? course.assets.map((asset) => {
          const demoDefaults = demoAssetDefaults[`${course.id}:${asset.id}`];
          if (!demoDefaults) return asset;
          return {
            ...asset,
            content: asset.content ?? demoDefaults.content,
            downloadable: asset.downloadable ?? demoDefaults.downloadable,
          };
        })
      : [],
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isHttpUrl(value?: string) {
  return /^https?:\/\//i.test(value?.trim() ?? "");
}

function withPortalTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function getAssetModuleTitle(course: PortalCourse, asset: PortalAsset) {
  if (!asset.moduleId) return "Generale";
  return course.modules.find((module) => module.id === asset.moduleId)?.title ?? "Modulo collegato";
}

function getAssetActionLabel(asset: PortalAsset) {
  if (asset.content && !asset.downloadUrl && !asset.source) return "Apri";
  if (asset.type === "video") return "Guarda";
  if (asset.type === "link") return "Apri";
  if (asset.type === "testo" || asset.type === "procedura" || asset.type === "quiz") return "Apri";
  if (asset.type === "immagine") return "Visualizza";
  return asset.downloadable === false ? "Visualizza" : "Scarica";
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function hasAssetResource(asset: PortalAsset) {
  return Boolean(asset.downloadUrl || asset.source || asset.content);
}

function isExplicitAcknowledgementAsset(asset: PortalAsset) {
  const searchableText = `${asset.title} ${asset.content ?? ""}`.toLowerCase();
  return /presa visione|conferma lettura|dichiara di aver letto|obbligatorio|regolamento|policy|privacy|attestato|firma presa visione|firma obbligatoria/.test(searchableText);
}

function isComplianceCourse(course?: PortalCourse) {
  return course?.area === "sicurezza" || course?.area === "procedure";
}

function isAcknowledgementCapableAsset(asset: PortalAsset) {
  return asset.type === "quiz" || asset.type === "procedura" || asset.type === "pdf" || asset.type === "documento" || asset.type === "testo";
}

function requiresAssetAcknowledgement(asset: PortalAsset, course?: PortalCourse) {
  const searchableText = `${asset.title} ${asset.content ?? ""} ${course?.title ?? ""} ${course?.description ?? ""}`.toLowerCase();
  return (
    asset.type === "quiz" ||
    isExplicitAcknowledgementAsset(asset) ||
    (isComplianceCourse(course) &&
      isAcknowledgementCapableAsset(asset) &&
      /manuale|procedura|regolamento|policy|privacy|sicurezza|dpi|verifica|attestato|obbligatorio/.test(searchableText))
  );
}

function getLessonBlockType(asset: PortalAsset): PortalLessonBlockType {
  if (isExplicitAcknowledgementAsset(asset) && asset.type !== "video" && asset.type !== "pdf") return "presa_visione";
  if (asset.type === "video") return "video";
  if (asset.type === "quiz") return "quiz";
  if (asset.type === "procedura") return "checklist";
  if (asset.type === "pdf") return "pdf";
  if (asset.type === "testo") return "testo";
  if (asset.type === "link") return "link";
  return asset.downloadable === false ? "testo" : "download";
}

function getLessonBlockDescription(asset: PortalAsset, course?: PortalCourse) {
  if (!hasAssetResource(asset)) return "Risorsa da collegare prima della pubblicazione.";
  if (requiresAssetAcknowledgement(asset, course)) return "Richiede conferma di lettura o completamento.";
  if (asset.type === "video") return "Contenuto principale da guardare.";
  if (asset.type === "quiz") return "Verifica finale o controllo apprendimento.";
  if (asset.type === "procedura") return "Checklist operativa da seguire.";
  if (asset.type === "pdf" || asset.type === "documento") return "Materiale scaricabile o consultabile.";
  if (asset.type === "link") return "Risorsa esterna collegata.";
  return "Contenuto testuale del modulo.";
}

function getRecommendedLessonBlocks(course: PortalCourse, module?: PortalModule, assets: PortalAsset[] = []): PortalLessonBlock[] {
  const hasVideo = assets.some((asset) => asset.type === "video");
  const hasReadableContent = assets.some((asset) => asset.type === "testo" || asset.type === "procedura");
  const hasDownload = assets.some((asset) => asset.type === "pdf" || asset.type === "documento" || asset.downloadable);
  const hasQuiz = assets.some((asset) => asset.type === "quiz");
  const hasAcknowledgement = assets.some((asset) => requiresAssetAcknowledgement(asset, course));
  const recommendations: PortalLessonBlock[] = [];
  const moduleId = module?.id ?? "generale";

  if (!hasVideo) {
    recommendations.push({
      id: `${course.id}:${moduleId}:recommended-video`,
      type: "video",
      title: "Intro video",
      description: "Consigliato per dare ritmo alla lezione.",
      status: "consigliato",
    });
  }
  if (!hasReadableContent) {
    recommendations.push({
      id: `${course.id}:${moduleId}:recommended-text`,
      type: "testo",
      title: "Testo operativo",
      description: "Sintesi chiara con passi e regole da seguire.",
      status: "consigliato",
    });
  }
  if (!hasDownload) {
    recommendations.push({
      id: `${course.id}:${moduleId}:recommended-download`,
      type: "download",
      title: "Materiale scaricabile",
      description: "PDF, manuale, procedura o allegato utile.",
      status: "consigliato",
    });
  }
  if (!hasQuiz) {
    recommendations.push({
      id: `${course.id}:${moduleId}:recommended-quiz`,
      type: "quiz",
      title: "Verifica finale",
      description: "Domande rapide per controllare la comprensione.",
      status: "consigliato",
    });
  }
  if (!hasAcknowledgement && (course.area === "sicurezza" || course.area === "procedure")) {
    recommendations.push({
      id: `${course.id}:${moduleId}:recommended-ack`,
      type: "presa_visione",
      title: "Presa visione",
      description: "Firma o conferma necessaria per procedure critiche.",
      status: "consigliato",
    });
  }

  return recommendations;
}

function getLessonBlocksForModule(course: PortalCourse, module?: PortalModule, includeGeneral = true): PortalLessonBlock[] {
  const moduleAssets = module ? course.assets.filter((asset) => asset.moduleId === module.id) : [];
  const generalAssets = includeGeneral ? course.assets.filter((asset) => !asset.moduleId) : [];
  const assets = module ? [...moduleAssets, ...generalAssets] : course.assets;
  const assetBlocks = assets.map((asset) => ({
    id: `${course.id}:${module?.id ?? asset.moduleId ?? "generale"}:${asset.id}`,
    title: asset.title,
    description: getLessonBlockDescription(asset, course),
    type: getLessonBlockType(asset),
    status: hasAssetResource(asset) ? "pronto" : "manca_risorsa",
    asset,
  }) satisfies PortalLessonBlock);

  return [...assetBlocks, ...getRecommendedLessonBlocks(course, module, assets)];
}

function getAcknowledgementItems(course: PortalCourse, module?: PortalModule): PortalAcknowledgementItem[] {
  const moduleAssets = module ? course.assets.filter((asset) => asset.moduleId === module.id) : [];
  const generalAssets = course.assets.filter((asset) => !asset.moduleId);
  const scopedAssets = module ? [...moduleAssets, ...generalAssets] : course.assets;
  const assetItems = scopedAssets
    .filter((asset) => requiresAssetAcknowledgement(asset, course))
    .map((asset) => ({
      id: `${course.id}:${asset.id}`,
      title: asset.title,
      description:
        asset.type === "quiz"
          ? "Verifica o quiz collegato al percorso."
          : "Documento o contenuto che richiede conferma di lettura.",
      courseTitle: course.title,
      moduleTitle: getAssetModuleTitle(course, asset),
      required: true,
      asset,
    }));

  if (assetItems.length > 0) return assetItems;
  if (course.area !== "sicurezza" && course.area !== "procedure") return [];

  return [
    {
      id: `${course.id}:${module?.id ?? "course"}:acknowledgement`,
      title: module ? `Presa visione ${module.title}` : `Presa visione ${course.title}`,
      description: "Conferma richiesta per tracciare procedure, sicurezza o regole operative.",
      courseTitle: course.title,
      moduleTitle: module?.title ?? "Corso completo",
      required: true,
    },
  ];
}

function inferAssetType(file: File): PortalAssetType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "immagine";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("text/")) return "testo";
  return "documento";
}

function getAssetStorageHint(asset: PortalAsset) {
  const fileSize = formatFileSize(asset.fileSize);
  if (asset.fileName && fileSize) return `${asset.fileName} · ${fileSize}`;
  if (asset.fileName) return asset.fileName;
  if (asset.source) return asset.source;
  if (asset.content) return "Anteprima disponibile nel portale";
  return "Da collegare in gestione";
}

function getKnowledgeCategory(asset: PortalAsset, course: PortalCourse): Exclude<PortalKnowledgeFilter, "tutti"> {
  const searchableText = `${asset.title} ${course.title} ${course.description}`.toLowerCase();

  if (asset.type === "quiz" || /quiz|verifica|test/.test(searchableText)) return "quiz";
  if (/regolamento|policy|presa visione|privacy|sicurezza aziendale/.test(searchableText)) return "regolamenti";
  if (asset.type === "procedura" || course.area === "procedure" || /sop|procedura|processo|checklist/.test(searchableText)) {
    return "procedure";
  }
  return "manuali";
}

function getKnowledgeItems(courses: PortalCourse[]): PortalKnowledgeItem[] {
  return courses.flatMap((course) =>
    course.assets.map((asset, assetIndex) => {
      const category = getKnowledgeCategory(asset, course);
      const hasResource = hasAssetResource(asset);
      const requiresAcknowledgement =
        category === "regolamenti" ||
        category === "quiz" ||
        course.area === "sicurezza" ||
        /presa visione|obbligatorio|regolamento/i.test(asset.title);
      const governanceStatus: PortalKnowledgeItem["governanceStatus"] = !hasResource
        ? "incompleto"
        : course.status === "revisione"
          ? "revisione"
          : "ok";

      return {
        id: `${course.id}:${asset.id}`,
        title: asset.title,
        category,
        asset,
        course,
        moduleTitle: getAssetModuleTitle(course, asset),
        hasResource,
        requiresAcknowledgement,
        version: `v1.${assetIndex + 1}`,
        responsible: course.owner,
        reviewDue: category === "regolamenti" || category === "procedure" ? "Revisione 90 giorni" : "Revisione annuale",
        visibility: audienceLabels[course.audience],
        governanceStatus,
      };
    }),
  );
}

function validateMaterialFile(file: File) {
  if (file.size > PORTAL_MAX_MATERIAL_SIZE_BYTES) {
    return `File troppo grande: massimo ${formatFileSize(PORTAL_MAX_MATERIAL_SIZE_BYTES)}.`;
  }
  if (file.type && !PORTAL_ALLOWED_MATERIAL_MIME_TYPES.includes(file.type)) {
    return "Formato non supportato. Usa PDF, video, immagini, testo, DOCX o PPTX.";
  }
  return null;
}

function getCourseQuality(course?: PortalCourse) {
  if (!course) {
    return {
      score: 0,
      checks: [
        { label: "Corso selezionato", done: false },
        { label: "Moduli presenti", done: false },
        { label: "Materiali caricati", done: false },
        { label: "Accessi definiti", done: false },
      ],
    };
  }

  const moduleIds = new Set(course.modules.map((module) => module.id));
  const assetsHaveContent = course.assets.every((asset) =>
    Boolean(
      asset.content ||
        isHttpUrl(asset.downloadUrl) ||
        isHttpUrl(asset.source) ||
        (asset.source && !asset.source.startsWith("locale/")),
    ),
  );
  const noOrphanAssets = course.assets.every((asset) => !asset.moduleId || moduleIds.has(asset.moduleId));
  const checks = [
    { label: "Titolo e descrizione completi", done: Boolean(course.title.trim() && course.description.trim()) },
    { label: "Almeno 2 moduli", done: course.modules.length >= 2 },
    { label: "Materiali apribili", done: course.assets.length > 0 && assetsHaveContent },
    { label: "Materiali senza orfani", done: noOrphanAssets },
    { label: "Pubblico definito", done: Boolean(course.audience) },
  ];
  const score = Math.round((checks.filter((check) => check.done).length / checks.length) * 100);
  return { score, checks };
}

function getLearnerCourseStatus(course: PortalCourse, completion = course.completion): LearnerCourseFilter {
  if (completion >= 100) return "completati";
  if (completion <= 0) return "da_iniziare";
  return "in_corso";
}

function cloneTemplateCourse(template: PortalTemplate): PortalCourse {
  const moduleIdMap = new Map(template.modules.map((module) => [module.id, createId("module")]));
  return {
    id: createId("course"),
    title: template.title,
    description: template.description,
    area: template.area,
    audience: template.audience,
    status: "bozza",
    owner: "Team",
    updatedAt: "Creato ora",
    enrolled: 0,
    completion: 0,
    modules: template.modules.map((module) => ({ ...module, id: moduleIdMap.get(module.id) ?? createId("module") })),
    assets: template.assets.map((asset) => ({
      ...asset,
      id: createId("asset"),
      moduleId: asset.moduleId ? moduleIdMap.get(asset.moduleId) : undefined,
    })),
  };
}

/**
 * Contesto applicativo del portale:
 *   - "azienda" (default): use case originale aziende edili. Default seed
 *     "cantiere", audience operai/capicantiere, templates sicurezza, tab Persone
 *     con stats edili.
 *   - "admin": riuso scoped sulla PLATFORM_ADMIN_COMPANY_ID per il team
 *     Superadmin. Niente seed cantiere, niente audience operai, niente tab
 *     "Accessi" / "Persone" / "Procedure" (gestiti da AdminPortaleDistributionBar
 *     a monte). Hero ridondante nascosto.
 */
export interface PortalePageProps {
  portalContext?: "azienda" | "admin";
  /** Modalità della shell di gestione (azienda):
   *  - "builder"  → voce "Crea corsi": authoring (Corsi + Builder + Anteprima)
   *  - "library"  → voce "Portale": libreria/gestione (Corsi + Procedure/Accessi/
   *    Persone/Riepilogo + Anteprima), SENZA Builder né azioni di creazione
   *  - "full"     → tutto insieme (superadmin /admin/portale-formazione) */
  mode?: "full" | "builder" | "library";
}

export default function PortalePage({ portalContext = "azienda", mode = "full" }: PortalePageProps = {}) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const userId = user?.id ?? null;
  const isAdminContext = portalContext === "admin";
  // Corsi + Builder: in "builder" (Crea corsi) e "full" (admin); nascosti in
  // "library" (il Portale È la Pagina utente, senza gestione/catalogo).
  const showBuilder = mode !== "library";
  // Authoring + distribuzione — SOLO azienda in "Crea corsi": procedure/manuali,
  // Accessi (chi può accedere), Persone (assegnazioni) e Riepilogo (panoramica).
  const showAuthoringMgmt = !isAdminContext && mode === "builder";
  // Anteprima "Pagina utente": nel Portale (library, è l'UNICA vista) e in admin
  // (full); NON nell'authoring puro di "Crea corsi".
  const showPreview = mode !== "builder";
  const [courses, setCourses] = useState<PortalCourse[]>(() =>
    isAdminContext ? [] : loadCourses(companyId),
  );
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? "");
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"locale" | "caricamento" | "sincronizzato">("locale");
  const [activeTab, setActiveTab] = useState(
    mode === "builder" ? "builder" : "preview",
  );
  // Tab visibili nella modalità corrente + clamp di sicurezza: se activeTab non
  // è tra questi (es. un setActiveTab verso un tab nascosto in questa modalità),
  // mostra un tab valido invece di un'area contenuto vuota.
  const visibleTabs = [
    ...(showBuilder ? ["corsi", "builder"] : []),
    ...(showAuthoringMgmt ? ["procedure", "accessi", "persone", "riepilogo"] : []),
    ...(showPreview ? ["preview"] : []),
  ];
  const effectiveTab = visibleTabs.includes(activeTab)
    ? activeTab
    : (visibleTabs[0] ?? "preview");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<PortalArea | "tutte">("tutte");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState<PortalKnowledgeFilter>("tutti");
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetPreview, setAssetPreview] = useState<PortalAsset | null>(null);
  const [courseDraft, setCourseDraft] = useState({
    title: "",
    description: "",
    area: "onboarding" as PortalArea,
    audience: "tutti" as PortalAudience,
  });
  const [assetDraft, setAssetDraft] = useState({
    title: "",
    type: "pdf" as PortalAssetType,
    duration: "",
    moduleId: "generale",
    source: "",
    content: "",
    file: null as File | null,
    downloadable: true,
  });
  const mountedRef = useRef(true);
  const saveStateRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    saving: boolean;
    pending: PortalCourse | null;
    sequence: number;
  }>({
    timer: null,
    saving: false,
    pending: null,
    sequence: 0,
  });

  const flushPortalSave = () => {
    if (!remoteEnabled || !companyId || saveStateRef.current.saving || !saveStateRef.current.pending) return;

    const courseToSave = saveStateRef.current.pending;
    saveStateRef.current.pending = null;
    saveStateRef.current.saving = true;
    const sequence = ++saveStateRef.current.sequence;
    setSyncStatus("caricamento");

    withPortalTimeout(savePortalCourse(companyId, courseToSave), 10_000, "Salvataggio remoto del Portale troppo lento.")
      .then(() => {
        if (mountedRef.current && sequence === saveStateRef.current.sequence && !saveStateRef.current.pending) {
          setSyncStatus("sincronizzato");
        }
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setSyncStatus("locale");
        if (!isPortalLearningUnavailable(error)) {
          toast.error("Salvataggio remoto non riuscito", {
            description: "La modifica resta salvata localmente. Riprova quando la sincronizzazione è disponibile.",
          });
        }
      })
      .finally(() => {
        saveStateRef.current.saving = false;
        if (mountedRef.current && saveStateRef.current.pending) {
          flushPortalSave();
        }
      });
  };

  useEffect(() => {
    const saveState = saveStateRef.current;
    return () => {
      mountedRef.current = false;
      if (saveState.timer) {
        clearTimeout(saveState.timer);
      }
    };
  }, []);

  useEffect(() => {
    // In admin context NON ripopoliamo da localStorage al mount (sarebbero
    // i corsi cantiere defaultCourses) — partiamo vuoti e attendiamo il remote.
    setCourses(isAdminContext ? [] : loadCourses(companyId));
  }, [companyId, isAdminContext]);

  useEffect(() => {
    if (!companyId) return;
    // In admin context il single source of truth è il DB Supabase (RLS
    // scoped sulla PLATFORM_ADMIN_COMPANY_ID). Il backup localStorage è
    // utile per aziende offline-first ma per il superadmin sarebbe solo
    // un punto di drift con la realtà.
    if (isAdminContext) return;
    try {
      window.localStorage.setItem(getPortalStorageKey(companyId), JSON.stringify(courses));
    } catch {
      // La pagina deve restare utilizzabile anche se il browser blocca lo storage locale.
    }
  }, [companyId, courses, isAdminContext]);

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setRemoteEnabled(false);
      setSyncStatus("locale");
      return () => {
        active = false;
      };
    }

    setSyncStatus("caricamento");
    // Sync resiliente: la prima query può scadere se il mount scatena molte
    // richieste supabase in parallelo (badge sidebar, dashboard, audience,
    // enrollments…) e il pooler è momentaneamente sotto carico. Invece di
    // cadere subito in "modalità locale", riproviamo fino a 3 volte con
    // backoff crescente e timeout più generosi sui tentativi successivi.
    const fetchRemoteCoursesWithRetry = async (): Promise<
      Awaited<ReturnType<typeof listPortalCourses>>
    > => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await withPortalTimeout(
            listPortalCourses(companyId),
            attempt === 1 ? 9_000 : 15_000,
            "La sincronizzazione del Portale sta impiegando troppo tempo.",
          );
        } catch (error) {
          lastError = error;
          if (attempt < 3 && active) {
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          }
        }
      }
      throw lastError;
    };
    fetchRemoteCoursesWithRetry()
      .then((remoteCourses) => {
        if (!active) return;
        setRemoteEnabled(true);
        setSyncStatus("sincronizzato");
        if (remoteCourses.length > 0) {
          setCourses(remoteCourses.map(normalizePortalCourse));
          setSelectedCourseId((current) =>
            remoteCourses.some((course) => course.id === current) ? current : remoteCourses[0]?.id ?? "",
          );
          return;
        }

        // ⛔ In admin context NON seediamo i corsi cantiere. Il team Superadmin
        // crea i propri corsi da zero (onboarding team interno, corsi marketing
        // per aziende clienti, ecc.). Mostrare "Sicurezza in cantiere" sarebbe
        // un bug semantico.
        if (isAdminContext) return;

        const seedCourses = loadCourses(companyId).map(normalizePortalCourse);
        if (seedCourses.length === 0) return;

        setCourses(seedCourses);
        setSelectedCourseId((current) =>
          seedCourses.some((course) => course.id === current) ? current : seedCourses[0]?.id ?? "",
        );
        setSyncStatus("caricamento");

        Promise.all(
          seedCourses.map((seedCourse) =>
            withPortalTimeout(savePortalCourse(companyId, seedCourse), 10_000, "Seed iniziale Portale troppo lento."),
          ),
        )
          .then(() => {
            if (!active) return;
            setSyncStatus("sincronizzato");
          })
          .catch((error) => {
            if (!active) return;
            setSyncStatus("locale");
            if (!isPortalLearningUnavailable(error)) {
              toast.warning("Corsi pronti in locale", {
                description: "Il seed iniziale remoto non e riuscito. Puoi continuare e riproveremo al prossimo salvataggio.",
              });
            }
          });
      })
      .catch((error) => {
        if (!active) return;
        setRemoteEnabled(false);
        setSyncStatus("locale");
        if (!isPortalLearningUnavailable(error)) {
          toast.error("Portale in modalità locale", {
            description: "Non riesco a sincronizzare i corsi ora, ma puoi continuare a lavorare.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (!courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0]?.id ?? "");
    }
  }, [courses, selectedCourseId]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? courses[0];

  // ── Read-only enforcement per corsi platform concessi via grant ──────
  // Un corso con sourceType="platform" è di proprietà del Superadmin: l'azienda
  // riceve accesso read-only via portal_course_grants. Le RLS DB già bloccano
  // gli UPDATE/INSERT cross-company, ma vogliamo intercettare a livello UI
  // per UX pulita (niente bottoni che falliscono al click).
  const isCourseReadOnly = selectedCourse?.sourceType === "platform";

  const persistCourse = (course: PortalCourse) => {
    // Niente sync remoto per i corsi platform (read-only).
    // Il PortalePage usa lo stato locale anche per i corsi platform — i grants
    // gestiscono la SELECT, ma una UPDATE accidentale verrebbe respinta dalla
    // RLS WITH CHECK. Guardia client per evitare il network roundtrip.
    if (course.sourceType === "platform") return;
    if (!remoteEnabled || !companyId) return;
    saveStateRef.current.pending = course;
    setSyncStatus("caricamento");
    if (saveStateRef.current.timer) {
      clearTimeout(saveStateRef.current.timer);
    }
    saveStateRef.current.timer = setTimeout(flushPortalSave, 350);
  };

  const filteredCourses = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesArea = areaFilter === "tutte" || course.area === areaFilter;
      const matchesSearch =
        !normalized ||
        course.title.toLowerCase().includes(normalized) ||
        course.description.toLowerCase().includes(normalized) ||
        areaLabels[course.area].toLowerCase().includes(normalized);
      return matchesArea && matchesSearch;
    });
  }, [areaFilter, courses, search]);

  const stats = useMemo(() => {
    const published = courses.filter((course) => course.status === "pubblicato").length;
    const totalEnrolled = courses.reduce((sum, course) => sum + course.enrolled, 0);
    const avgCompletion = courses.length
      ? Math.round(courses.reduce((sum, course) => sum + course.completion, 0) / courses.length)
      : 0;
    const assets = courses.reduce((sum, course) => sum + course.assets.length, 0);
    const inReview = courses.filter((course) => course.status === "revisione").length;
    return { published, totalEnrolled, avgCompletion, assets, inReview };
  }, [courses]);

  const knowledgeItems = useMemo(() => getKnowledgeItems(courses), [courses]);

  const filteredKnowledgeItems = useMemo(() => {
    const normalized = knowledgeSearch.trim().toLowerCase();
    return knowledgeItems.filter((item) => {
      const matchesFilter = knowledgeFilter === "tutti" || item.category === knowledgeFilter;
      const matchesSearch =
        !normalized ||
        item.title.toLowerCase().includes(normalized) ||
        item.course.title.toLowerCase().includes(normalized) ||
        item.moduleTitle.toLowerCase().includes(normalized) ||
        areaLabels[item.course.area].toLowerCase().includes(normalized) ||
        assetTypeLabels[item.asset.type].toLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [knowledgeFilter, knowledgeItems, knowledgeSearch]);

  const knowledgeStats = useMemo(() => {
    const procedures = knowledgeItems.filter((item) => item.category === "procedure").length;
    const manuals = knowledgeItems.filter((item) => item.category === "manuali").length;
    const acknowledgements = knowledgeItems.filter((item) => item.requiresAcknowledgement).length;
    const missingResources = knowledgeItems.filter((item) => !item.hasResource).length;
    const inReview = knowledgeItems.filter((item) => item.governanceStatus === "revisione").length;
    const compliant = knowledgeItems.length
      ? Math.round(
          (knowledgeItems.filter((item) => item.governanceStatus === "ok").length / knowledgeItems.length) * 100,
        )
      : 0;
    return {
      total: knowledgeItems.length,
      procedures,
      manuals,
      acknowledgements,
      missingResources,
      inReview,
      compliant,
    };
  }, [knowledgeItems]);

  const quality = useMemo(() => getCourseQuality(selectedCourse), [selectedCourse]);

  // Creazione a 1 clic: niente dialog a monte. Crea una bozza con default
  // sensati e apre subito il Builder — titolo e impostazioni si modificano
  // in-place lì (vedi editable title + "Impostazioni" nel CourseBuilder).
  const createCourseQuick = () => {
    const newCourse: PortalCourse = {
      id: createId("course"),
      title: "Nuovo corso senza titolo",
      description: "Nuovo percorso formativo pronto per essere strutturato in moduli.",
      area: "onboarding",
      audience: "tutti",
      status: "bozza",
      owner: "Team",
      updatedAt: "Creato ora",
      enrolled: 0,
      completion: 0,
      modules: [
        {
          id: createId("module"),
          title: "Modulo introduttivo",
          description: "Aggiungi lezioni, video, PDF o procedure operative.",
          lessons: 0,
          duration: "Da completare",
          completedRate: 0,
        },
      ],
      assets: [],
    };

    setCourses((prev) => [newCourse, ...prev]);
    setSelectedCourseId(newCourse.id);
    if (showBuilder) setActiveTab("builder");
    persistCourse(newCourse);
    toast.success("Bozza creata — dai un titolo e aggiungi i contenuti.");
  };

  // Patch dei metadati del corso selezionato. persistCourse è già debounced
  // (350ms) e ignora i corsi platform → sicuro anche a ogni battuta del titolo.
  const updateCourseMeta = (patch: Partial<PortalCourse>) => {
    if (!selectedCourse || selectedCourse.sourceType === "platform") return;
    const updated: PortalCourse = { ...selectedCourse, ...patch, updatedAt: "Modificato ora" };
    setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    persistCourse(updated);
  };

  // Apre il dialog "Impostazioni corso" precompilato dal corso selezionato.
  const openCourseSettings = () => {
    if (!selectedCourse) return;
    setCourseDraft({
      title: selectedCourse.title,
      description: selectedCourse.description,
      area: selectedCourse.area,
      audience: selectedCourse.audience,
    });
    setCourseDialogOpen(true);
  };

  const saveCourseSettings = () => {
    if (!selectedCourse) return;
    if (!courseDraft.title.trim()) {
      toast.error("Il titolo non può essere vuoto.");
      return;
    }
    updateCourseMeta({
      title: courseDraft.title.trim(),
      description: courseDraft.description.trim() || selectedCourse.description,
      area: courseDraft.area,
      audience: courseDraft.audience,
    });
    setCourseDialogOpen(false);
    toast.success("Impostazioni corso salvate.");
  };

  const createFromTemplate = (template: PortalTemplate) => {
    const newCourse = cloneTemplateCourse(template);
    setCourses((prev) => [newCourse, ...prev]);
    setSelectedCourseId(newCourse.id);
    if (showBuilder) setActiveTab("builder");
    persistCourse(newCourse);
    toast.success("Template corso creato come bozza.");
  };

  // Aggiunta modulo a 1 clic: crea un modulo con titolo default e lo accoda —
  // titolo e descrizione si modificano poi in-place nella card (updateModule).
  const addModule = () => {
    if (!selectedCourse || selectedCourse.sourceType === "platform") return;
    const module: PortalModule = {
      id: createId("module"),
      title: "Nuovo modulo",
      description: "Aggiungi lezioni, materiali e verifica.",
      lessons: 0,
      duration: "Da definire",
      completedRate: 0,
    };

    const nextCourse = { ...selectedCourse, modules: [...selectedCourse.modules, module], updatedAt: "Aggiornato ora" };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
    toast.success("Modulo aggiunto — dagli titolo e contenuti qui sotto.");
  };

  // Patch inline di un modulo (titolo/descrizione). persistCourse è debounced.
  const updateModule = (moduleId: string, patch: Partial<PortalModule>) => {
    if (!selectedCourse || selectedCourse.sourceType === "platform") return;
    const nextCourse: PortalCourse = {
      ...selectedCourse,
      modules: selectedCourse.modules.map((m) => (m.id === moduleId ? { ...m, ...patch } : m)),
      updatedAt: "Modificato ora",
    };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
  };

  const addAsset = async () => {
    if (!selectedCourse || assetUploading) return;
    if (!assetDraft.title.trim()) {
      toast.error("Inserisci il nome del contenuto.");
      return;
    }
    if (!assetDraft.file && !assetDraft.source.trim() && !assetDraft.content.trim()) {
      toast.error("Aggiungi un file, un link o un testo.");
      return;
    }
    if (assetDraft.file) {
      const validationError = validateMaterialFile(assetDraft.file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    setAssetUploading(true);
    try {
      let uploaded: Awaited<ReturnType<typeof uploadPortalMaterial>> | null = null;
      if (assetDraft.file && companyId) {
        try {
          uploaded = await withPortalTimeout(
            uploadPortalMaterial(companyId, selectedCourse.id, assetDraft.file),
            60_000,
            "Upload materiale oltre 60 secondi.",
          );
        } catch (error) {
          toast.warning("Upload remoto non disponibile", {
            description: String(
              (error as { message?: string })?.message ??
                "Il materiale viene salvato come riferimento locale e potrai ricaricarlo quando lo storage e attivo.",
            ),
          });
        }
      }
      if (assetDraft.file && !companyId) {
        toast.info("File agganciato come bozza locale.", {
          description: "Quando la sincronizzazione aziendale e disponibile verra caricato nello storage.",
        });
      }

      const manualSource = assetDraft.source.trim();
      const internalReference = manualSource && !isHttpUrl(manualSource) && !assetDraft.file ? manualSource : "";
      const source = uploaded?.path ?? (isHttpUrl(manualSource) ? manualSource : assetDraft.file ? `locale/${assetDraft.file.name}` : undefined);
      const linkedModuleId =
        assetDraft.moduleId !== "generale" && selectedCourse.modules.some((module) => module.id === assetDraft.moduleId)
          ? assetDraft.moduleId
          : undefined;
      const content = [assetDraft.content.trim(), internalReference ? `Riferimento interno: ${internalReference}` : ""]
        .filter(Boolean)
        .join("\n\n");
      const asset: PortalAsset = {
        id: createId("asset"),
        title: assetDraft.title.trim(),
        type: assetDraft.type,
        duration: assetDraft.duration.trim() || "Da definire",
        moduleId: linkedModuleId,
        source,
        downloadUrl: source,
        downloadable: assetDraft.downloadable,
        content: content || undefined,
        fileName: uploaded?.fileName ?? assetDraft.file?.name,
        fileSize: uploaded?.fileSize ?? assetDraft.file?.size,
        mimeType: uploaded?.mimeType ?? assetDraft.file?.type,
      };

      const nextCourse = { ...selectedCourse, assets: [asset, ...selectedCourse.assets], updatedAt: "Aggiornato ora" };
      setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
      persistCourse(nextCourse);
      setAssetDialogOpen(false);
      setAssetDraft({
        title: "",
        type: "pdf",
        duration: "",
        moduleId: "generale",
        source: "",
        content: "",
        file: null,
        downloadable: true,
      });
      toast.success("Materiale aggiunto al corso.");
    } finally {
      setAssetUploading(false);
    }
  };

  const updateSelectedCourse = (patch: Partial<PortalCourse>) => {
    if (!selectedCourse) return;
    // Corso della piattaforma (concesso via grant): sola lettura. Senza questo
    // guard la UI mostrava il nuovo stato/pubblico ma persistCourse lo scartava
    // in silenzio → modifica "fantasma" che spariva al reload.
    if (selectedCourse.sourceType === "platform") {
      toast.info("Corso fornito dalla piattaforma: è in sola lettura.");
      return;
    }
    const nextCourse = { ...selectedCourse, ...patch, updatedAt: "Aggiornato ora" };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
  };

  const changeCourseStatus = (status: PortalCourseStatus) => {
    if (!selectedCourse) return false;
    if (selectedCourse.sourceType === "platform") {
      toast.info("Corso fornito dalla piattaforma: è in sola lettura.");
      return false;
    }
    if (status === "pubblicato") {
      const publishQuality = getCourseQuality(selectedCourse);
      if (publishQuality.score < 80) {
        toast.error("Corso non pronto per la pubblicazione.", {
          description: "Completa moduli, materiali e accessi prima di renderlo visibile agli utenti.",
        });
        if (showBuilder) setActiveTab("builder");
        return false;
      }
    }
    updateSelectedCourse({ status });
    return true;
  };

  const duplicateCourse = () => {
    if (!selectedCourse) return;
    const moduleIdMap = new Map(selectedCourse.modules.map((module) => [module.id, createId("module")]));
    const copy: PortalCourse = {
      ...selectedCourse,
      id: createId("course"),
      title: `${selectedCourse.title} - copia`,
      status: "bozza",
      enrolled: 0,
      completion: 0,
      updatedAt: "Creato ora",
      // La copia è SEMPRE dell'azienda corrente: senza questo reset, duplicare
      // un corso concesso dalla piattaforma manteneva sourceType="platform" →
      // persistCourse la scartava e la copia spariva al reload.
      sourceType: "own",
      ownerCompanyId: companyId ?? selectedCourse.ownerCompanyId,
      modules: selectedCourse.modules.map((module) => ({
        ...module,
        id: moduleIdMap.get(module.id) ?? createId("module"),
      })),
      assets: selectedCourse.assets.map((asset) => ({
        ...asset,
        id: createId("asset"),
        moduleId: asset.moduleId ? moduleIdMap.get(asset.moduleId) : undefined,
      })),
    };
    setCourses((prev) => [copy, ...prev]);
    setSelectedCourseId(copy.id);
    persistCourse(copy);
    toast.success("Corso duplicato come bozza.");
  };

  const removeAsset = (assetId: string) => {
    if (!selectedCourse) return;
    const asset = selectedCourse.assets.find((item) => item.id === assetId);
    if (asset && !window.confirm(`Rimuovere il materiale "${asset.title}" dal corso?`)) return;
    const nextCourse = {
      ...selectedCourse,
      assets: selectedCourse.assets.filter((asset) => asset.id !== assetId),
      updatedAt: "Aggiornato ora",
    };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
    toast.success("Materiale rimosso dal corso.");
  };

  const removeModule = (moduleId: string) => {
    if (!selectedCourse) return;
    if (selectedCourse.modules.length <= 1) {
      toast.error("Mantieni almeno un modulo nel corso.");
      return;
    }
    const module = selectedCourse.modules.find((item) => item.id === moduleId);
    if (module && !window.confirm(`Rimuovere il modulo "${module.title}"? I materiali collegati resteranno nel corso.`)) {
      return;
    }
    const nextCourse = {
      ...selectedCourse,
      modules: selectedCourse.modules.filter((module) => module.id !== moduleId),
      assets: selectedCourse.assets.map((asset) =>
        asset.moduleId === moduleId ? { ...asset, moduleId: undefined } : asset,
      ),
      updatedAt: "Aggiornato ora",
    };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
    toast.success("Modulo rimosso.", {
      description: "Gli eventuali materiali collegati sono stati spostati tra i contenuti generali.",
    });
  };

  const moveModule = (moduleId: string, direction: "up" | "down") => {
    if (!selectedCourse) return;
    const index = selectedCourse.modules.findIndex((module) => module.id === moduleId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= selectedCourse.modules.length) return;
    const modules = [...selectedCourse.modules];
    const [module] = modules.splice(index, 1);
    modules.splice(targetIndex, 0, module);
    const nextCourse = { ...selectedCourse, modules, updatedAt: "Aggiornato ora" };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
    toast.success("Ordine moduli aggiornato.");
  };

  const openAssetAction = async (asset: PortalAsset) => {
    const target = asset.downloadUrl ?? asset.source;
    const isLocalDraftFile = target?.startsWith("locale/");

    if (asset.content && (contentAssetTypes.has(asset.type) || !target || isLocalDraftFile)) {
      setAssetPreview(asset);
      return;
    }
    if (!target) {
      toast.error("Questo materiale non ha ancora un file o link collegato.");
      return;
    }
    if (target.startsWith("http")) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    if (target.startsWith("locale/")) {
      toast.info("Materiale in bozza locale", {
        description: "Il file sara apribile dopo upload nello storage del Portale.",
      });
      return;
    }
    try {
      const signedUrl = await withPortalTimeout(
        createPortalMaterialSignedUrl(target),
        10_000,
        "Apertura materiale troppo lenta.",
      );
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error("Impossibile aprire il materiale", {
        description: String((error as { message?: string })?.message ?? "Riprova piu tardi."),
      });
    }
  };

  const togglePublish = () => {
    if (!selectedCourse) return;
    const nextStatus: PortalCourseStatus = selectedCourse.status === "pubblicato" ? "revisione" : "pubblicato";
    if (changeCourseStatus(nextStatus)) {
      toast.success(nextStatus === "pubblicato" ? "Corso pubblicato nel Portale." : "Corso riportato in revisione.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero header + stat cards + azioni authoring — SOLO gestione (Crea corsi
          / admin). Nel Portale (library) NON si mostra: il Portale È la Pagina
          utente e le metriche di gestione (corsi pubblicati, iscrizioni team…)
          non c'entrano con l'esperienza di fruizione. */}
      {mode !== "library" && (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-gradient-to-br from-white via-blue-50/50 to-orange-50/70 p-5 lg:grid-cols-[1.4fr_0.8fr] lg:p-6">
          <div className="flex flex-col justify-between gap-5">
            {!isAdminContext && (
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-200">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Portale</h1>
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Beta operativa</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        syncStatus === "sincronizzato"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : syncStatus === "caricamento"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                      )}
                    >
                      {syncStatus === "sincronizzato" ? "Sync Supabase" : syncStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Area formazione e know-how aziendale: corsi interni, procedure, manuali, onboarding, formazione
                    commerciale e materiali riservati per team e cantieri.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {/* Creazione a 1 clic: crea subito la bozza e apre il Builder.
                  Solo dove il Builder è disponibile ("Crea corsi"): nel "Portale"
                  (library) la creazione non c'è. */}
              {showBuilder && (
                <Button className="h-11 gap-2 bg-blue-600 hover:bg-blue-700" onClick={createCourseQuick}>
                  <Plus className="h-4 w-4" />
                  Nuovo corso
                </Button>
              )}

              {/* Dialog "Impostazioni corso": modifica i metadati del corso
                  selezionato. Aperto dal Builder (openCourseSettings), non più
                  alla creazione. */}
              <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Impostazioni corso</DialogTitle>
                    <DialogDescription>
                      Modifica titolo, descrizione, area e pubblico del corso selezionato.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="course-title">
                        Titolo corso
                      </label>
                      <Input
                        id="course-title"
                        value={courseDraft.title}
                        onChange={(event) => setCourseDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Es. Procedura posa serramenti"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="course-description">
                        Descrizione
                      </label>
                      <Textarea
                        id="course-description"
                        value={courseDraft.description}
                        onChange={(event) => setCourseDraft((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Cosa deve imparare il team e quando usare questo percorso."
                        rows={4}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Area</label>
                        <Select
                          value={courseDraft.area}
                          onValueChange={(value) => setCourseDraft((prev) => ({ ...prev, area: value as PortalArea }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(areaLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Select Audience nascosta in admin context (operai/
                          capicantiere non hanno senso per team Superadmin).
                          courseDraft.audience resta "tutti" come default →
                          conforme allo schema DB. */}
                      {!isAdminContext && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Accesso</label>
                          <Select
                            value={courseDraft.audience}
                            onValueChange={(value) =>
                              setCourseDraft((prev) => ({ ...prev, audience: value as PortalAudience }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(audienceLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>
                      Annulla
                    </Button>
                    <Button onClick={saveCourseSettings} className="bg-blue-600 hover:bg-blue-700">
                      Salva
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
                {showBuilder && (
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 gap-2 border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                    disabled={isCourseReadOnly}
                    title={isCourseReadOnly ? "Corso piattaforma · sola lettura" : undefined}
                  >
                    <UploadCloud className="h-4 w-4" />
                    Carica materiale
                  </Button>
                </DialogTrigger>
                )}
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Aggiungi materiale</DialogTitle>
                    <DialogDescription>
                      Inserisci video, PDF, link, quiz o procedura nel corso selezionato.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      Corso selezionato: <span className="font-semibold text-slate-900">{selectedCourse?.title}</span>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="asset-title">
                        Nome contenuto
                      </label>
                      <Input
                        id="asset-title"
                        value={assetDraft.title}
                        onChange={(event) => setAssetDraft((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Es. Video sopralluogo consultivo"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Tipo</label>
                        <Select
                          value={assetDraft.type}
                          onValueChange={(value) =>
                            setAssetDraft((prev) => ({
                              ...prev,
                              type: value as PortalAssetType,
                              downloadable: value === "video" || value === "testo" ? false : prev.downloadable,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(assetTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="asset-duration">
                          Durata / dettaglio
                        </label>
                        <Input
                          id="asset-duration"
                          value={assetDraft.duration}
                          onChange={(event) => setAssetDraft((prev) => ({ ...prev, duration: event.target.value }))}
                          placeholder="Es. 12 min"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Modulo collegato</label>
                      <Select
                        value={assetDraft.moduleId}
                        onValueChange={(value) => setAssetDraft((prev) => ({ ...prev, moduleId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="generale">Materiale generale del corso</SelectItem>
                          {selectedCourse?.modules.map((module) => (
                            <SelectItem key={module.id} value={module.id}>
                              {module.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="asset-file">
                        Carica file
                      </label>
                      <Input
                        id="asset-file"
                        type="file"
                        accept={PORTAL_MATERIAL_ACCEPT}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (file) {
                            const validationError = validateMaterialFile(file);
                            if (validationError) {
                              toast.error(validationError);
                              event.currentTarget.value = "";
                              setAssetDraft((prev) => ({ ...prev, file: null }));
                              return;
                            }
                          }
                          setAssetDraft((prev) => ({
                            ...prev,
                            file,
                            type: file ? inferAssetType(file) : prev.type,
                            title: prev.title || file?.name.replace(/\.[^.]+$/, "") || "",
                            duration: prev.duration || (file ? formatFileSize(file.size) : ""),
                            downloadable: file?.type.startsWith("video/") ? false : prev.downloadable,
                          }));
                        }}
                        className="h-11 cursor-pointer rounded-xl border-slate-200 text-base file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-blue-700 sm:text-sm"
                      />
                      {assetDraft.file && (
                        <p className="text-xs text-slate-500">
                          {assetDraft.file.name} · {formatFileSize(assetDraft.file.size)} · {assetDraft.file.type || "file"}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="asset-source">
                        Link o riferimento alternativo
                      </label>
                      <Input
                        id="asset-source"
                        value={assetDraft.source}
                        onChange={(event) => setAssetDraft((prev) => ({ ...prev, source: event.target.value }))}
                        placeholder="Es. https://video-corso.it oppure cartella/nota interna"
                      />
                      <p className="text-xs text-slate-500">
                        Se carichi un file viene salvato nel bucket privato; se inserisci un URL viene aperto come link.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="asset-content">
                        Testo, istruzioni o procedura
                      </label>
                      <Textarea
                        id="asset-content"
                        value={assetDraft.content}
                        onChange={(event) => setAssetDraft((prev) => ({ ...prev, content: event.target.value }))}
                        placeholder="Scrivi qui una lezione testuale, una checklist, una procedura o le domande del quiz."
                        rows={4}
                      />
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <Checkbox
                        checked={assetDraft.downloadable}
                        onCheckedChange={(checked) =>
                          setAssetDraft((prev) => ({ ...prev, downloadable: checked === true }))
                        }
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">Scaricabile dall'utente</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          Disattiva per video o contenuti che devono restare solo in consultazione.
                        </span>
                      </span>
                    </label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAssetDialogOpen(false)} disabled={assetUploading}>
                      Annulla
                    </Button>
                    <Button onClick={addAsset} className="bg-blue-600 hover:bg-blue-700" disabled={assetUploading}>
                      {assetUploading ? "Caricamento..." : "Aggiungi"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {mode === "full" && (
                <Button
                  variant="ghost"
                  className="h-11 gap-2 text-slate-700 hover:bg-white"
                  onClick={() => {
                    setActiveTab("preview");
                    toast.success("Anteprima utente aperta.");
                  }}
                >
                  <PanelRight className="h-4 w-4" />
                  Apri pagina utente
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Corsi pubblicati" value={String(stats.published)} icon={BookMarked} tone="blue" />
            <StatCard label="Iscrizioni team" value={String(stats.totalEnrolled)} icon={Users} tone="orange" />
            <StatCard label="Completamento" value={`${stats.avgCompletion}%`} icon={CheckCircle2} tone="green" />
            <StatCard label="Materiali" value={String(stats.assets)} icon={FileArchive} tone="slate" />
          </div>
        </div>
      </section>
      )}

      <Tabs value={effectiveTab} onValueChange={setActiveTab} className="space-y-5">
        {mode !== "library" && (
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="corsi" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <Library className="h-4 w-4" />
            Corsi
          </TabsTrigger>
          {showBuilder && (
            <TabsTrigger value="builder" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <LayoutTemplate className="h-4 w-4" />
              Builder
            </TabsTrigger>
          )}
          {/* "Crea corsi" (authoring + distribuzione): procedure/manuali, Accessi
              (chi può accedere), Persone (assegnazioni). Solo azienda in builder;
              in admin la distribuzione cross-company è nella DistributionBar. */}
          {showAuthoringMgmt && (
            <>
              <TabsTrigger value="procedure" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <ClipboardCheck className="h-4 w-4" />
                Procedure
              </TabsTrigger>
              <TabsTrigger value="accessi" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <LockKeyhole className="h-4 w-4" />
                Accessi
              </TabsTrigger>
              <TabsTrigger value="persone" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <Users className="h-4 w-4" />
                Persone
              </TabsTrigger>
              <TabsTrigger value="riepilogo" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                <BarChart3 className="h-4 w-4" />
                Riepilogo
              </TabsTrigger>
            </>
          )}
          {showPreview && (
            <TabsTrigger value="preview" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <UserRoundCheck className="h-4 w-4" />
              Pagina utente
            </TabsTrigger>
          )}
        </TabsList>
        )}

        {showBuilder && effectiveTab !== "preview" && effectiveTab !== "riepilogo" && (
          <PortalCommandCenter
            course={selectedCourse}
            quality={quality}
            templates={courseTemplates}
            stats={stats}
            onCreateFromTemplate={createFromTemplate}
            onOpenModule={() => { addModule(); if (showBuilder) setActiveTab("builder"); }}
            onOpenAsset={() => setAssetDialogOpen(true)}
          />
        )}

        <TabsContent value="corsi" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
            <section className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-11 rounded-xl border-slate-200 pl-9 text-base sm:text-sm"
                    placeholder="Cerca corso, manuale o procedura"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <Select value={areaFilter} onValueChange={(value) => setAreaFilter(value as PortalArea | "tutte")}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 lg:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tutte">Tutte le aree</SelectItem>
                      {Object.entries(areaLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    active={course.id === selectedCourse?.id}
                    onSelect={() => setSelectedCourseId(course.id)}
                  />
                ))}
              </div>

              {filteredCourses.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <Search className="mx-auto h-8 w-8 text-slate-400" />
                  <h3 className="mt-3 text-base font-semibold text-slate-900">Nessun corso trovato</h3>
                  <p className="mt-1 text-sm text-slate-500">Modifica ricerca o filtro per vedere altri contenuti.</p>
                </div>
              )}
            </section>

            <CourseDetailPanel
              course={selectedCourse}
              onPublish={togglePublish}
              onDuplicate={duplicateCourse}
              onOpenAccess={() => setAccessDialogOpen(true)}
              hideAudienceUi={isAdminContext}
            />
          </div>
        </TabsContent>

        {showBuilder && (
        <TabsContent value="builder">
          <CourseBuilder
            course={selectedCourse}
            onAddAsset={() => setAssetDialogOpen(true)}
            onAddModule={addModule}
            onPublish={togglePublish}
            onMoveModule={moveModule}
            onRemoveModule={removeModule}
            onRemoveAsset={removeAsset}
            onOpenAsset={openAssetAction}
            onUpdateTitle={(title) => updateCourseMeta({ title })}
            onOpenSettings={openCourseSettings}
            onCreateCourse={createCourseQuick}
            onUpdateModule={updateModule}
          />
        </TabsContent>
        )}

        {showAuthoringMgmt && (<>
        <TabsContent value="procedure">
          <KnowledgeBasePanel
            items={filteredKnowledgeItems}
            allItems={knowledgeItems}
            stats={knowledgeStats}
            templates={courseTemplates.filter((template) => template.area === "procedure")}
            search={knowledgeSearch}
            filter={knowledgeFilter}
            onSearchChange={setKnowledgeSearch}
            onFilterChange={setKnowledgeFilter}
            onOpenAsset={openAssetAction}
            onAddAsset={() => setAssetDialogOpen(true)}
            onCreateFromTemplate={createFromTemplate}
          />
        </TabsContent>

        <TabsContent value="accessi">
          <AccessPanel
            course={selectedCourse}
            companyId={companyId}
            onAudienceChange={(audience) => updateSelectedCourse({ audience })}
            onOpenAccess={() => setAccessDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="persone">
          <PeopleProgressPanel course={selectedCourse} courses={courses} companyId={companyId} userId={userId} />
        </TabsContent>

        <TabsContent value="riepilogo">
          <PortalRiepilogoPanel courses={courses} companyId={companyId} />
        </TabsContent>
        </>)}

        <TabsContent value="preview">
          <PortalPreview
            course={selectedCourse}
            courses={courses}
            companyId={companyId}
            userId={userId}
            onOpenAsset={openAssetAction}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestisci accessi corso</DialogTitle>
            <DialogDescription>
              Decidi chi vede il percorso nel portale e in quale stato pubblicarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{selectedCourse?.title}</p>
              <p className="text-xs text-slate-500">{selectedCourse?.description}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Pubblico</label>
              <Select
                value={selectedCourse?.audience ?? "tutti"}
                onValueChange={(value) => updateSelectedCourse({ audience: value as PortalAudience })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(audienceLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["bozza", "revisione", "pubblicato"] as PortalCourseStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    if (changeCourseStatus(status)) {
                      toast.success(status === "pubblicato" ? "Corso pubblicato nel Portale." : "Stato corso aggiornato.");
                    }
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm transition hover:border-blue-300 hover:bg-blue-50",
                    selectedCourse?.status === status ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  <span className="font-semibold capitalize">{status}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {status === "pubblicato" ? "Visibile" : status === "revisione" ? "Controllo" : "Privato"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setAccessDialogOpen(false)} className="bg-blue-600 hover:bg-blue-700">
              Salva accessi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assetPreview)} onOpenChange={(open) => !open && setAssetPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{assetPreview?.title ?? "Materiale corso"}</DialogTitle>
            <DialogDescription>
              {assetPreview ? `${assetTypeLabels[assetPreview.type]} · ${assetPreview.duration}` : "Contenuto del corso"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-700">
              {assetPreview?.content ?? "Nessun testo disponibile per questo materiale."}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setAssetPreview(null)} className="bg-blue-600 hover:bg-blue-700">
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  tone: "blue" | "orange" | "green" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  }[tone];

  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl border", toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function PortalCommandCenter({
  course,
  quality,
  templates,
  stats,
  onCreateFromTemplate,
  onOpenModule,
  onOpenAsset,
}: {
  course?: PortalCourse;
  quality: ReturnType<typeof getCourseQuality>;
  templates: PortalTemplate[];
  stats: { published: number; totalEnrolled: number; avgCompletion: number; assets: number; inReview: number };
  onCreateFromTemplate: (template: PortalTemplate) => void;
  onOpenModule: () => void;
  onOpenAsset: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const nextActions = [
    {
      title: course && course.modules.length < 2 ? "Aggiungi almeno un secondo modulo" : "Controlla ordine moduli",
      description: "Percorsi brevi, ordinati e progressivi vengono completati di più.",
      action: onOpenModule,
      icon: ListChecks,
    },
    {
      title: course && course.assets.length === 0 ? "Collega un materiale pratico" : "Aggiorna libreria contenuti",
      description: "PDF, video, procedure e quiz rendono il portale realmente operativo.",
      action: onOpenAsset,
      icon: UploadCloud,
    },
  ];

  return (
    <section className="space-y-2">
      {!isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          aria-expanded={isExpanded}
          aria-controls="portal-command-center-panel"
          className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Rocket className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-slate-950">Centro operativo Portale</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                Qualità {quality.score}% · {stats.inReview} in revisione · {templates.length} template pronti
              </span>
            </span>
          </span>
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-blue-50 px-3 text-sm font-semibold text-blue-700">
            Mostra
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      )}

      {isExpanded && (
        <div
          id="portal-command-center-panel"
          className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-950">Centro operativo Portale</h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Parti da template, completa la qualità del corso e pubblica solo quando il percorso è chiaro.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
                  {stats.inReview} in revisione
                </Badge>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls="portal-command-center-panel"
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Nascondi
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onCreateFromTemplate(template)}
                  className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                    <WandSparkles className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-950">{template.title}</h3>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{template.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    Usa template
                    <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,1fr)] xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qualità corso</p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-950">{quality.score}%</h3>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Target className="h-5 w-5" />
                </div>
              </div>
              <Progress value={quality.score} className="mt-4 h-2" />
              <div className="mt-4 space-y-2">
                {quality.checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-sm">
                    {check.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                    )}
                    <span className={cn(check.done ? "text-slate-700" : "font-medium text-slate-900")}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Flag className="h-5 w-5 text-orange-500" />
                <h3 className="font-bold text-slate-950">Prossime azioni</h3>
              </div>
              <div className="space-y-3">
                {nextActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={item.action}
                      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-950">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CourseCard({ course, active, onSelect }: { course: PortalCourse; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        active ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
              {areaLabels[course.area]}
            </Badge>
            <Badge variant="outline" className={statusClasses[course.status]}>
              {course.status}
            </Badge>
            {course.sourceType === "platform" && (
              <Badge
                variant="outline"
                className="border-orange-200 bg-orange-50 text-orange-700"
                title="Corso reso disponibile dalla piattaforma EdiliziaInCloud — sola lettura"
              >
                ⚡ Piattaforma
              </Badge>
            )}
          </div>
          <h3 className="line-clamp-2 text-base font-bold text-slate-950">{course.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{course.description}</p>
        </div>
        <ChevronRight className={cn("mt-1 h-5 w-5 shrink-0", active ? "text-blue-600" : "text-slate-300")} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div>
          <p className="font-semibold text-slate-900">{course.modules.length}</p>
          <p>moduli</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">{course.enrolled}</p>
          <p>iscritti</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">{course.completion}%</p>
          <p>completato</p>
        </div>
      </div>
      <Progress value={course.completion} className="mt-4 h-2" />
    </button>
  );
}

function CourseDetailPanel({
  course,
  onPublish,
  onDuplicate,
  onOpenAccess,
  hideAudienceUi = false,
}: {
  course?: PortalCourse;
  onPublish: () => void;
  onDuplicate: () => void;
  onOpenAccess: () => void;
  /**
   * Quando true (admin context), nasconde "Accesso" tile + bottone "Accessi"
   * (che apriva il dialog azienda con audience operai/capicantiere — non senso
   * per superadmin). La gestione access cross-azienda è in
   * AdminPortaleDistributionBar.
   */
  hideAudienceUi?: boolean;
}) {
  const isPlatform = course?.sourceType === "platform";
  if (!course) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">Seleziona un corso per vedere dettagli e moduli.</p>
      </div>
    );
  }

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusClasses[course.status]}>
                {course.status}
              </Badge>
              {isPlatform && (
                <Badge
                  variant="outline"
                  className="border-orange-200 bg-orange-50 text-orange-700"
                  title="Corso fornito dalla piattaforma EdiliziaInCloud — sola lettura"
                >
                  ⚡ Piattaforma · sola lettura
                </Badge>
              )}
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-950">{course.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{course.description}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <BookMarked className="h-5 w-5" />
          </div>
        </div>

        <div className={cn("mt-5 grid gap-3", hideAudienceUi ? "grid-cols-3" : "grid-cols-2")}>
          <InfoTile label="Area" value={areaLabels[course.area]} icon={Building2} />
          {/* Tile "Accesso" mostra audience azienda-edile (operai/capicantiere)
              → nascosto in admin context dove non ha senso. */}
          {!hideAudienceUi && (
            <InfoTile label="Accesso" value={audienceLabels[course.audience]} icon={LockKeyhole} />
          )}
          <InfoTile label="Owner" value={course.owner} icon={BriefcaseBusiness} />
          <InfoTile label="Update" value={course.updatedAt} icon={Clock3} />
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Completamento medio</span>
            <span className="font-bold text-slate-950">{course.completion}%</span>
          </div>
          <Progress value={course.completion} className="h-2" />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button
            onClick={onPublish}
            disabled={isPlatform}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            title={isPlatform ? "Modifiche bloccate: il corso appartiene alla piattaforma" : undefined}
          >
            <CheckCircle2 className="h-4 w-4" />
            {course.status === "pubblicato" ? "Revisione" : "Pubblica"}
          </Button>
          {!hideAudienceUi && (
            <Button variant="outline" onClick={onOpenAccess} disabled={isPlatform} className="gap-2">
              <Settings2 className="h-4 w-4" />
              Accessi
            </Button>
          )}
          <Button variant="outline" onClick={onDuplicate} className="gap-2">
            <Copy className="h-4 w-4" />
            Duplica
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-950">Moduli corso</h3>
            <p className="text-sm text-slate-500">Ordine consigliato per il team.</p>
          </div>
          <Badge variant="outline">{course.modules.length} moduli</Badge>
        </div>
        <div className="space-y-3">
          {course.modules.map((module, index) => (
            <ModuleRow key={module.id} module={module} index={index} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function InfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ModuleRow({ module, index }: { module: PortalModule; index: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-slate-950">{module.title}</h4>
            <span className="text-xs text-slate-500">{module.duration}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{module.description}</p>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={module.completedRate} className="h-2 flex-1" />
            <span className="w-10 text-right text-xs font-semibold text-slate-700">{module.completedRate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseBuilder({
  course,
  onAddAsset,
  onAddModule,
  onPublish,
  onMoveModule,
  onRemoveModule,
  onRemoveAsset,
  onOpenAsset,
  onUpdateTitle,
  onOpenSettings,
  onCreateCourse,
  onUpdateModule,
}: {
  course?: PortalCourse;
  onAddAsset: () => void;
  onAddModule: () => void;
  onPublish: () => void;
  onMoveModule: (moduleId: string, direction: "up" | "down") => void;
  onRemoveModule: (moduleId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onOpenAsset: (asset: PortalAsset) => void;
  onUpdateTitle?: (title: string) => void;
  onOpenSettings?: () => void;
  onCreateCourse?: () => void;
  onUpdateModule?: (moduleId: string, patch: Partial<PortalModule>) => void;
}) {
  // Empty-state chiaro: prima mostrava il vuoto (return null) se nessun corso
  // era selezionato — l'utente non capiva cosa fare.
  if (!course) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
          <GraduationCap className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-950">Nessun corso selezionato</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Crea un nuovo corso e inizia subito a strutturarlo, oppure scegline uno dalla scheda «Corsi».
        </p>
        {onCreateCourse && (
          <Button onClick={onCreateCourse} className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Crea corso
          </Button>
        )}
      </section>
    );
  }
  const isPlatform = course.sourceType === "platform";

  const assetsByType = course.assets.reduce<Record<PortalAssetType, number>>((acc, asset) => {
    acc[asset.type] = (acc[asset.type] ?? 0) + 1;
    return acc;
  }, {} as Record<PortalAssetType, number>);
  const unlinkedAssetCount = course.assets.filter((asset) => !asset.moduleId).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {isPlatform ? (
              <h2 className="text-xl font-bold text-slate-950">{course.title}</h2>
            ) : (
              <input
                value={course.title}
                onChange={(event) => onUpdateTitle?.(event.target.value)}
                placeholder="Titolo del corso"
                aria-label="Titolo corso"
                className="-ml-1 w-full max-w-md rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xl font-bold text-slate-950 outline-none transition hover:border-slate-200 focus:border-blue-300 focus:bg-white"
              />
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-500">Struttura moduli, materiali e checklist, poi pubblica.</p>
              {!isPlatform && onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Impostazioni
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onAddModule}
              disabled={isPlatform}
              title={isPlatform ? "Corso piattaforma · sola lettura" : undefined}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Modulo
            </Button>
            <Button
              variant="outline"
              onClick={onAddAsset}
              disabled={isPlatform}
              title={isPlatform ? "Corso piattaforma · sola lettura" : undefined}
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              Materiale
            </Button>
            <Button
              onClick={onPublish}
              disabled={isPlatform}
              title={isPlatform ? "Corso piattaforma · sola lettura" : undefined}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Pubblica
            </Button>
          </div>
        </div>
        {isPlatform && (
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-sm text-orange-900">
            <span className="font-semibold">⚡ Corso fornito dalla piattaforma EdiliziaInCloud.</span>{" "}
            Il contenuto è gestito centralmente, non è modificabile dalla tua azienda.
            Puoi però iscrivere il tuo team e tracciarne il completamento.
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-4">
          <BuilderStep icon={ListChecks} label={`${course.modules.length} moduli`} />
          <BuilderStep icon={FileArchive} label={`${course.assets.length} materiali`} />
          <BuilderStep icon={Video} label={`${assetsByType.video ?? 0} video`} />
          <BuilderStep icon={FileText} label={`${(assetsByType.pdf ?? 0) + (assetsByType.documento ?? 0)} documenti`} />
        </div>

        <div className="grid gap-3">
          {course.modules.map((module, index) => {
            const moduleAssets = course.assets.filter((asset) => asset.moduleId === module.id);
            const moduleLessonBlocks = getLessonBlocksForModule(course, module, false);
            return (
            <div key={module.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modulo {index + 1}</p>
                  {isPlatform ? (
                    <>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">{module.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{module.description}</p>
                    </>
                  ) : (
                    <>
                      <input
                        value={module.title}
                        onChange={(event) => onUpdateModule?.(module.id, { title: event.target.value })}
                        placeholder="Titolo del modulo"
                        aria-label={`Titolo modulo ${index + 1}`}
                        className="mt-1 -ml-1 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-bold text-slate-950 outline-none transition hover:border-slate-200 focus:border-blue-300 focus:bg-white"
                      />
                      <input
                        value={module.description}
                        onChange={(event) => onUpdateModule?.(module.id, { description: event.target.value })}
                        placeholder="Descrizione breve del modulo"
                        aria-label={`Descrizione modulo ${index + 1}`}
                        className="mt-1 -ml-1 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-600 outline-none transition hover:border-slate-200 focus:border-blue-300 focus:bg-white"
                      />
                    </>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <BuilderStep icon={Video} label={`${module.lessons} lezioni`} />
                    <BuilderStep icon={Clock3} label={module.duration} />
                    <BuilderStep icon={FileArchive} label={`${moduleAssets.length} materiali`} />
                  </div>
                  <div className="mt-4 rounded-xl border border-white bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contenuti modulo</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-blue-700"
                        onClick={onAddAsset}
                        disabled={isPlatform}
                        title={isPlatform ? "Corso piattaforma · sola lettura" : undefined}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Aggiungi
                      </Button>
                    </div>
                    {moduleAssets.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {moduleAssets.map((asset) => {
                          const Icon = assetIcon[asset.type];
                          const isOpenable = hasAssetResource(asset);
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => onOpenAsset(asset)}
                              disabled={!isOpenable}
                              className={cn(
                                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                                isOpenable
                                  ? "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                  : "cursor-not-allowed border-orange-200 bg-orange-50 text-orange-700",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{asset.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Nessun contenuto collegato: aggiungi video, PDF, testo o quiz.</p>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Sequenza lezione</p>
                        <p className="text-xs text-slate-500">Blocchi consigliati per una lezione chiara e tracciabile.</p>
                      </div>
                      <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
                        {moduleLessonBlocks.filter((block) => block.status === "pronto").length}/{moduleLessonBlocks.length} pronti
                      </Badge>
                    </div>
                    <LessonBlockStrip
                      blocks={moduleLessonBlocks}
                      compact
                      onOpenBlock={(block) => {
                        if (block.asset) {
                          onOpenAsset(block.asset);
                          return;
                        }

                        toast.info("Blocco consigliato", {
                          description: "Aggiungi il contenuto dal builder per renderlo disponibile nella pagina utente.",
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0 || isPlatform}
                    onClick={() => onMoveModule(module.id, "up")}
                    aria-label="Sposta modulo su"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === course.modules.length - 1 || isPlatform}
                    onClick={() => onMoveModule(module.id, "down")}
                    aria-label="Sposta modulo giu"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:text-red-600"
                    onClick={() => onRemoveModule(module.id)}
                    disabled={isPlatform}
                    aria-label="Rimuovi modulo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-bold text-slate-950">Libreria materiale</h3>
          <p className="text-sm text-slate-500">Contenuti collegati al corso selezionato.</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-center gap-2">
            <WandSparkles className="h-5 w-5 text-blue-700" />
            <h4 className="font-bold text-slate-950">Blueprint lezione ideale</h4>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ogni modulo dovrebbe alternare video, testo operativo, allegato, verifica e presa visione quando serve.
          </p>
          <div className="mt-3 grid gap-2">
            {(["video", "testo", "download", "quiz", "presa_visione"] as PortalLessonBlockType[]).map((blockType) => {
              const Icon = lessonBlockIcon[blockType];
              return (
                <div key={blockType} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                  <Icon className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{lessonBlockLabels[blockType]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          {unlinkedAssetCount > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              {unlinkedAssetCount} materiale/i generali non collegati a un modulo. Collegarli rende piu chiara la vista utente.
            </div>
          )}
          {course.assets.map((asset) => {
            const Icon = assetIcon[asset.type];
            const isOpenable = hasAssetResource(asset);
            return (
              <div key={asset.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{asset.title}</p>
                    <p className="text-xs text-slate-500">{assetTypeLabels[asset.type]} · {asset.duration}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-slate-50 text-xs">
                        {getAssetModuleTitle(course, asset)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          asset.downloadable === false
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {asset.downloadable === false ? "Solo visione" : "Scaricabile"}
                      </Badge>
                      {asset.mimeType && (
                        <Badge variant="outline" className="bg-white text-xs text-slate-600">
                          {asset.mimeType}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                    onClick={() => onRemoveAsset(asset.id)}
                    disabled={isPlatform}
                    aria-label="Rimuovi materiale"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <span className="truncate">{getAssetStorageHint(asset)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs text-blue-700 disabled:text-slate-400"
                    onClick={() => onOpenAsset(asset)}
                    disabled={!isOpenable}
                  >
                    {asset.type === "link" ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : asset.downloadable === false || asset.content ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isOpenable ? getAssetActionLabel(asset) : "Da collegare"}
                  </Button>
                </div>
              </div>
            );
          })}
          {course.assets.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Nessun materiale ancora caricato.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BuilderStep({ icon: Icon, label }: { icon: typeof Video; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
      <Icon className="h-4 w-4 text-blue-600" />
      {label}
    </div>
  );
}

function LessonBlockStrip({
  blocks,
  compact = false,
  activeBlockId,
  onOpenBlock,
}: {
  blocks: PortalLessonBlock[];
  compact?: boolean;
  activeBlockId?: string;
  onOpenBlock?: (block: PortalLessonBlock) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Nessun blocco lezione disponibile.
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-5")}>
      {blocks.map((block, index) => {
        const Icon = lessonBlockIcon[block.type];
        const isInteractive = Boolean(onOpenBlock) && (Boolean(block.asset) || block.status === "consigliato" || block.type === "presa_visione");
        const isActive = activeBlockId === block.id || (block.asset && activeBlockId === block.asset.id);
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => {
              if (isInteractive) onOpenBlock?.(block);
            }}
            disabled={!isInteractive}
            className={cn(
              "group flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              block.status === "pronto" && "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50",
              block.status === "manca_risorsa" && "border-orange-200 bg-orange-50 text-orange-900",
              block.status === "consigliato" && "border-dashed border-slate-300 bg-slate-50 text-slate-600",
              isActive && "border-blue-300 bg-blue-50 ring-1 ring-blue-100",
              isInteractive ? "cursor-pointer" : "cursor-not-allowed opacity-80",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                block.status === "pronto" && "bg-blue-50 text-blue-700",
                block.status === "manca_risorsa" && "bg-white text-orange-700",
                block.status === "consigliato" && "bg-white text-slate-500",
                isActive && "bg-blue-600 text-white",
              )}
            >
              {block.status === "pronto" ? <Icon className="h-4 w-4" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-bold text-slate-950">{block.title}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 text-[11px]",
                    block.status === "pronto" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    block.status === "manca_risorsa" && "border-orange-200 bg-orange-100 text-orange-700",
                    block.status === "consigliato" && "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  {block.status === "pronto"
                    ? lessonBlockLabels[block.type]
                    : block.status === "manca_risorsa"
                      ? "Da collegare"
                      : "Suggerito"}
                </Badge>
              </span>
              <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{block.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function KnowledgeBasePanel({
  items,
  allItems,
  stats,
  templates,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onOpenAsset,
  onAddAsset,
  onCreateFromTemplate,
}: {
  items: PortalKnowledgeItem[];
  allItems: PortalKnowledgeItem[];
  stats: {
    total: number;
    procedures: number;
    manuals: number;
    acknowledgements: number;
    missingResources: number;
    inReview: number;
    compliant: number;
  };
  templates: PortalTemplate[];
  search: string;
  filter: PortalKnowledgeFilter;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: PortalKnowledgeFilter) => void;
  onOpenAsset: (asset: PortalAsset) => void;
  onAddAsset: () => void;
  onCreateFromTemplate: (template: PortalTemplate) => void;
}) {
  const categoryCounts = allItems.reduce<Record<PortalKnowledgeFilter, number>>(
    (acc, item) => {
      acc.tutti += 1;
      acc[item.category] += 1;
      return acc;
    },
    { tutti: 0, procedure: 0, manuali: 0, regolamenti: 0, quiz: 0 },
  );
  const acknowledgementItems = allItems.filter((item) => item.requiresAcknowledgement);
  const urgentItems = allItems.filter((item) => item.governanceStatus !== "ok").slice(0, 4);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 bg-gradient-to-br from-white via-blue-50 to-orange-50 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                Manuali aziendali
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {stats.acknowledgements} prese visione
              </Badge>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              Procedure, manuali e regolamenti
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Organizza il know-how aziendale come una libreria operativa: SOP, manuali, policy, quiz e documenti con
              responsabile, corso collegato e stato risorsa.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-4">
              <KnowledgeMetric label="Documenti" value={stats.total} icon={FileArchive} tone="blue" />
              <KnowledgeMetric label="Procedure" value={stats.procedures} icon={ClipboardCheck} tone="emerald" />
              <KnowledgeMetric label="Manuali" value={stats.manuals} icon={BookOpenCheck} tone="slate" />
              <KnowledgeMetric label="Da collegare" value={stats.missingResources} icon={AlertCircle} tone="orange" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-950">Governance consigliata</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p className="rounded-2xl bg-slate-50 p-3">
                Ogni procedura dovrebbe avere versione, responsabile, data revisione e presa visione per i ruoli
                interessati.
              </p>
              <p className="rounded-2xl bg-orange-50 p-3 text-orange-900">
                I documenti senza file, link o testo restano visibili nel builder ma non sono ancora fruibili dall'utente.
              </p>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-emerald-950">Copertura qualità</span>
                  <span className="text-lg font-bold text-emerald-700">{stats.compliant}%</span>
                </div>
                <Progress value={stats.compliant} className="mt-2 h-2" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                className="h-11 rounded-2xl border-slate-200 pl-9 text-base sm:text-sm"
                placeholder="Cerca SOP, manuale, regolamento, quiz o corso collegato"
              />
            </div>
            <Button className="h-11 gap-2 bg-blue-600 hover:bg-blue-700" onClick={onAddAsset}>
              <UploadCloud className="h-4 w-4" />
              Carica documento
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(knowledgeCategoryLabels) as PortalKnowledgeFilter[]).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onFilterChange(category)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
                  filter === category
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {knowledgeCategoryLabels[category]}
                <span className="ml-1 text-slate-400">{categoryCounts[category]}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[1.05fr_0.7fr_0.58fr_0.62fr_0.5fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid">
              <span>Documento</span>
              <span>Corso / modulo</span>
              <span>Categoria</span>
              <span>Governance</span>
              <span>Stato</span>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const Icon = assetIcon[item.asset.type];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.hasResource) {
                        onOpenAsset(item.asset);
                        return;
                      }
                      onAddAsset();
                      toast.info("Collega un file, un link o un testo per rendere apribile questo documento.");
                    }}
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 xl:grid-cols-[1.05fr_0.7fr_0.58fr_0.62fr_0.5fr] xl:items-center xl:gap-4"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-950">{item.title}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {assetTypeLabels[item.asset.type]} · {item.asset.duration}
                        </span>
                      </span>
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{item.course.title}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{item.moduleTitle}</span>
                    </span>

                    <span className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="w-fit bg-white capitalize">
                        {knowledgeCategoryLabels[item.category]}
                      </Badge>
                      {item.requiresAcknowledgement && (
                        <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700">
                          Presa visione
                        </Badge>
                      )}
                    </span>

                    <span className="min-w-0 text-sm text-slate-600">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="w-fit bg-white text-xs">
                          {item.version}
                        </Badge>
                        <span className="truncate">{item.responsible}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{item.reviewDue}</span>
                    </span>

                    <span className="flex items-center justify-between gap-2 lg:justify-start">
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit",
                          item.hasResource
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-orange-200 bg-orange-50 text-orange-700",
                        )}
                      >
                        {item.hasResource ? "Apribile" : "Da collegare"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {items.length === 0 && (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <ClipboardCheck className="mx-auto h-9 w-9 text-slate-400" />
              <h3 className="mt-3 font-bold text-slate-950">Nessun documento trovato</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
                Modifica filtri o carica una procedura, un manuale, un regolamento o un quiz nel corso selezionato.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-orange-600" />
                <h3 className="font-bold text-slate-950">Coda operativa</h3>
              </div>
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                {stats.inReview + stats.missingResources} aperti
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {urgentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (item.hasResource ? onOpenAsset(item.asset) : onAddAsset())}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="block truncate text-sm font-semibold text-slate-950">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.governanceStatus === "incompleto" ? "Da collegare" : "In revisione"} · {item.course.title}
                  </span>
                </button>
              ))}
              {urgentItems.length === 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Nessuna criticità documentale evidente.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <WandSparkles className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-950">Template rapidi</h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Parti da strutture pensate per processi aziendali, manuali interni e regolamenti.
            </p>
            <div className="mt-4 space-y-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onCreateFromTemplate(template)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <span className="block font-semibold text-slate-950">{template.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              <h3 className="font-bold text-slate-950">Qualità documentale</h3>
            </div>
            <div className="mt-4 space-y-3">
              <QualityLine done={stats.total > 0} label="Libreria non vuota" />
              <QualityLine done={stats.procedures > 0} label="Procedure operative presenti" />
              <QualityLine done={stats.acknowledgements > 0} label="Presa visione tracciabile" />
              <QualityLine done={stats.missingResources === 0} label="Tutti i documenti apribili" />
            </div>
          </section>

          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <UserRoundCheck className="h-5 w-5 text-blue-700" />
              <h3 className="font-bold text-blue-950">Prese visione</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              {acknowledgementItems.length} documenti richiedono conferma lettura. Nella fase successiva possono
              generare reminder, storico e attestato interno.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function KnowledgeMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Video;
  tone: "blue" | "emerald" | "orange" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    slate: "bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-sm">
      <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function QualityLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-orange-500" />}
      <span className={cn(done ? "text-slate-700" : "font-medium text-slate-950")}>{label}</span>
    </div>
  );
}

function AccessPanel({
  course,
  companyId,
  onAudienceChange,
  onOpenAccess,
}: {
  course?: PortalCourse;
  companyId: string | null;
  onAudienceChange: (audience: PortalAudience) => void;
  onOpenAccess: () => void;
}) {
  // Conteggi reali dal personale (hr_profili). Hook prima di ogni early-return.
  const { data: counts } = useQuery({
    queryKey: ["portal-audience-counts", companyId],
    queryFn: () => getPortalAudienceCounts(companyId as string),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  if (!course) return null;

  const groups: Array<{ key: PortalAudience; label: string; people: number | null; note: string }> = [
    { key: "tutti", label: "Tutta azienda", people: counts?.total ?? null, note: "Dipendenti attivi in anagrafica" },
    { key: "operai", label: "Operai", people: counts?.operai ?? null, note: "Accesso mobile cantiere" },
    { key: "ufficio", label: "Ufficio", people: counts?.ufficio ?? null, note: "Amministrazione e back office" },
    { key: "commerciali", label: "Commerciali", people: counts?.commerciali ?? null, note: "Vendita e sopralluoghi" },
    { key: "capicantiere", label: "Capicantiere", people: counts?.capicantiere ?? null, note: "Responsabili operativi" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Accessi Portale</h2>
            <p className="text-sm text-slate-500">Controlla visibilità, ruoli e pubblico del corso.</p>
          </div>
          <Button onClick={onOpenAccess} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <LockKeyhole className="h-4 w-4" />
            Modifica regole
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const active = course.audience === group.key;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onAudienceChange(group.key)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50",
                  active ? "border-blue-300 bg-blue-50 ring-1 ring-blue-100" : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                    <Users className="h-4 w-4" />
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                </div>
                <h3 className="mt-3 font-bold text-slate-950">{group.label}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {group.people == null ? "—" : group.people} {group.people === 1 ? "persona" : "persone"} · {group.note}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-950">Regole consigliate</h3>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <p className="rounded-xl bg-slate-50 p-3">Onboarding: automatico a ogni nuovo utente.</p>
          <p className="rounded-xl bg-slate-50 p-3">Sicurezza: obbligatorio prima dell'accesso al cantiere.</p>
          <p className="rounded-xl bg-slate-50 p-3">Commerciale: visibile solo a venditori e titolari.</p>
        </div>
      </section>
    </div>
  );
}

function PortalRiepilogoPanel({ courses, companyId }: { courses: PortalCourse[]; companyId: string | null }) {
  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["portal-all-enrollments", companyId],
    queryFn: () => listAllPortalCourseEnrollments(companyId as string),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const published = courses.filter((c) => c.status === "pubblicato");

  const byCourse = new Map<string, { iscritti: number; completati: number; somma: number }>();
  for (const e of enrollments) {
    const agg = byCourse.get(e.courseId) ?? { iscritti: 0, completati: 0, somma: 0 };
    agg.iscritti += 1;
    if (e.progressPercent >= 100 || e.status === "completato") agg.completati += 1;
    agg.somma += e.progressPercent || 0;
    byCourse.set(e.courseId, agg);
  }

  const rows = published
    .map((c) => {
      const agg = byCourse.get(c.id) ?? { iscritti: 0, completati: 0, somma: 0 };
      const medio = agg.iscritti ? Math.round(agg.somma / agg.iscritti) : 0;
      const mandatory = c.area === "sicurezza" || c.area === "procedure";
      return { course: c, iscritti: agg.iscritti, completati: agg.completati, medio, mandatory };
    })
    .sort((a, b) => {
      if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
      return a.medio - b.medio;
    });

  const totals = {
    corsi: published.length,
    iscrizioni: rows.reduce((acc, r) => acc + r.iscritti, 0),
    completamenti: rows.reduce((acc, r) => acc + r.completati, 0),
    medio: rows.length ? Math.round(rows.reduce((acc, r) => acc + r.medio, 0) / rows.length) : 0,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold leading-none text-slate-950">{totals.corsi}</p>
          <p className="mt-1 text-xs text-slate-500">Corsi pubblicati</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold leading-none text-slate-950">{totals.iscrizioni}</p>
          <p className="mt-1 text-xs text-slate-500">Iscrizioni totali</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-2xl font-bold leading-none text-emerald-700">{totals.completamenti}</p>
          <p className="mt-1 text-xs text-emerald-700/80">Completamenti</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-2xl font-bold leading-none text-blue-700">{totals.medio}%</p>
          <p className="mt-1 text-xs text-blue-700/80">Avanzamento medio</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Riepilogo per corso</h2>
        <p className="text-sm text-slate-500">
          Completamento reale di tutti i corsi pubblicati (obbligatori in cima, meno avanzati prima).
        </p>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[1.4fr_0.7fr_0.7fr_1fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Corso</span>
            <span>Iscritti</span>
            <span>Completati</span>
            <span>Avanzamento</span>
          </div>
          <div className="divide-y divide-slate-100">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Caricamento dati…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Nessun corso pubblicato.</div>
            ) : (
              rows.map(({ course, iscritti, completati, medio, mandatory }) => (
                <div
                  key={course.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_1fr] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{course.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="bg-white">
                        {areaLabels[course.area]}
                      </Badge>
                      {mandatory && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                          Obbligatorio
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-slate-700">
                    <span className="mr-1 font-medium md:hidden">Iscritti:</span>
                    {iscritti}
                  </span>
                  <span className="text-sm text-slate-700">
                    <span className="mr-1 font-medium md:hidden">Completati:</span>
                    {completati}
                  </span>
                  <div>
                    <div className="mb-1 text-xs text-slate-500">{medio}%</div>
                    <Progress value={medio} className="h-2" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Deriva etichetta stato + colore + testo scadenza da un'iscrizione reale. */
function describeEnrollment(p: { status: string; dueAt: string | null; completedAt: string | null }): {
  statusLabel: string;
  tone: "red" | "emerald" | "blue";
  due: string;
} {
  // due_at è salvato come data (mezzanotte UTC): la scadenza è il GIORNO di
  // calendario, non l'istante. Confrontiamo per data locale — altrimenti in
  // Italia la persona risultava "in ritardo" già dalle 02:00 del giorno stesso.
  let dueDays: number | null = null;
  if (p.dueAt) {
    const [y, m, d] = p.dueAt.slice(0, 10).split("-").map(Number);
    if (y && m && d) {
      const dueStart = new Date(y, m - 1, d).getTime();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      dueDays = Math.round((dueStart - todayStart.getTime()) / 86_400_000);
    }
  }
  const hasDue = dueDays != null;
  const overdue = hasDue && (dueDays as number) < 0 && p.status !== "completato";

  let due = "Nessuna scadenza";
  if (p.completedAt) {
    due = "Completato";
  } else if (hasDue) {
    const days = dueDays as number;
    if (days > 1) due = `Scade tra ${days} giorni`;
    else if (days === 1) due = "Scade domani";
    else if (days === 0) due = "Scade oggi";
    else if (days === -1) due = "Scaduto ieri";
    else due = `Scaduto da ${Math.abs(days)} giorni`;
  }

  if (p.status === "completato") return { statusLabel: "Completato", tone: "emerald", due };
  if (overdue || p.status === "in_ritardo") return { statusLabel: "In ritardo", tone: "red", due };
  if (p.status === "in_corso") return { statusLabel: "In corso", tone: "blue", due };
  return { statusLabel: "Da iniziare", tone: "blue", due };
}

function PeopleProgressPanel({
  course,
  courses,
  companyId,
  userId,
}: {
  course?: PortalCourse;
  courses: PortalCourse[];
  companyId: string | null;
  userId: string | null;
}) {
  // Avanzamento reale dalle iscrizioni. Hook prima di ogni early-return.
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["portal-course-progress", companyId, course?.id ?? null],
    queryFn: () => listPortalCourseProgress(companyId as string, course!.id),
    enabled: !!companyId && !!course?.id,
    staleTime: 30_000,
  });
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSel, setAssignSel] = useState<Set<string>>(new Set());
  const [assignDue, setAssignDue] = useState("");
  const [assigning, setAssigning] = useState(false);
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["portal-company-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId as string);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
    enabled: !!companyId && assignOpen,
    staleTime: 60_000,
  });

  if (!course) return null;

  // Crea un promemoria REALE (Silvio) assegnato all'admin per ricontrollare il corso.
  const scheduleReminder = async () => {
    if (!companyId || !userId) {
      toast.error("Sessione non valida: impossibile creare il promemoria.");
      return;
    }
    const behind = people.filter((p) => p.status !== "completato").length;
    // toLocaleDateString("en-CA") = YYYY-MM-DD in fuso locale: con toISOString()
    // tra mezzanotte e le 02:00 in Italia la data slittava al giorno prima.
    const remindOn = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    const { error } = await supabase.rpc("silvio_tool_crea_promemoria" as never, {
      p_company_id: companyId,
      p_user_id: userId,
      p_title: `Controlla avanzamento corso «${course.title}»`,
      p_note:
        people.length === 0
          ? "Nessuna iscrizione ancora: verifica l'assegnazione del corso dalla scheda Accessi."
          : behind > 0
            ? `${behind} su ${people.length} non hanno ancora completato il corso.`
            : "Tutte le persone iscritte hanno completato il corso.",
      p_remind_on: remindOn,
    } as never);
    if (error) {
      toast.error("Impossibile creare il promemoria.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["silvio-reminders-count"] });
    toast.success(`Promemoria creato per il ${new Date(remindOn).toLocaleDateString("it-IT")}.`);
  };

  const enrolledIds = new Set(people.map((p) => p.userId));
  const handleAssignCourse = async () => {
    if (!companyId || assignSel.size === 0) return;
    setAssigning(true);
    try {
      const res = await assignPortalCourseToUsers(companyId, course.id, [...assignSel], userId ?? null, assignDue || null);
      await qc.invalidateQueries({ queryKey: ["portal-course-progress", companyId, course.id] });
      const tot = res.assigned + res.updated;
      toast.success(`Corso assegnato a ${tot} ${tot === 1 ? "persona" : "persone"}.`);
      setAssignOpen(false);
      setAssignSel(new Set());
      setAssignDue("");
    } catch {
      toast.error("Assegnazione non riuscita.");
    } finally {
      setAssigning(false);
    }
  };

  const mandatoryCourses = courses.filter((item) => item.area === "sicurezza" || item.area === "procedure");
  const audienceLabel: Record<PortalAudience, string> = {
    tutti: "Tutta azienda",
    operai: "Operai",
    ufficio: "Ufficio",
    commerciali: "Commerciali",
    capicantiere: "Capicantiere",
  };

  // KPI compliance reali (dalle iscrizioni del corso selezionato).
  const kpi = {
    iscritti: people.length,
    completati: people.filter((p) => p.progressPercent >= 100 || p.status === "completato").length,
    inRitardo: people.filter((p) => describeEnrollment(p).tone === "red").length,
    medio: people.length
      ? Math.round(people.reduce((acc, p) => acc + (p.progressPercent || 0), 0) / people.length)
      : 0,
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Avanzamento persone</h2>
            <p className="text-sm text-slate-500">
              Chi ha completato, chi è in ritardo e chi deve ancora finire il corso selezionato.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" onClick={() => setAssignOpen(true)}>
              <Users className="h-4 w-4" />
              Assegna corso
            </Button>
            <Button variant="outline" className="gap-2" onClick={scheduleReminder}>
              <CalendarClock className="h-4 w-4" />
              Programma reminder
            </Button>
          </div>
        </div>

        <Dialog
          open={assignOpen}
          onOpenChange={(o) => {
            setAssignOpen(o);
            if (!o) setAssignSel(new Set());
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Assegna «{course.title}»</DialogTitle>
              <DialogDescription>
                Le persone selezionate troveranno il corso in «Assegnati a te» nella loro Formazione.
                Chi ha già un avanzamento NON viene azzerato.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Scadenza (opzionale)</p>
                <Input
                  type="date"
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                  className="w-fit"
                />
              </div>
              <div className="max-h-[44vh] space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {companyUsers.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-slate-500">Nessun utente azienda trovato.</p>
                ) : (
                  companyUsers.map((u) => {
                    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Utente";
                    const already = enrolledIds.has(u.id);
                    const checked = assignSel.has(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setAssignSel((prev) => {
                              const n = new Set(prev);
                              if (c) n.add(u.id);
                              else n.delete(u.id);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
                          {u.email && <span className="block truncate text-xs text-slate-500">{u.email}</span>}
                        </span>
                        {already && (
                          <Badge variant="outline" className="shrink-0 border-slate-200 text-slate-500">
                            già iscritto
                          </Badge>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assigning}>
                Annulla
              </Button>
              <Button onClick={handleAssignCourse} disabled={assigning || assignSel.size === 0}>
                {assigning ? "Assegnazione…" : `Assegna (${assignSel.size})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {people.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-2xl font-bold leading-none text-slate-950">{kpi.iscritti}</p>
              <p className="mt-1 text-xs text-slate-500">Iscritti</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-2xl font-bold leading-none text-emerald-700">{kpi.completati}</p>
              <p className="mt-1 text-xs text-emerald-700/80">Completati</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-2xl font-bold leading-none text-red-700">{kpi.inRitardo}</p>
              <p className="mt-1 text-xs text-red-700/80">In ritardo</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-2xl font-bold leading-none text-blue-700">{kpi.medio}%</p>
              <p className="mt-1 text-xs text-blue-700/80">Avanzamento medio</p>
            </div>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[1.1fr_0.8fr_1fr_0.8fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Persona</span>
            <span>Gruppo</span>
            <span>Avanzamento</span>
            <span>Stato</span>
          </div>
          <div className="divide-y divide-slate-100">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Caricamento iscrizioni…</div>
            ) : people.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">Nessuna iscrizione a questo corso</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  L'avanzamento delle persone compare qui quando il corso viene assegnato o quando i
                  dipendenti lo aprono dal portale. Definisci il pubblico dalla scheda{" "}
                  <span className="font-medium">Accessi</span>.
                </p>
              </div>
            ) : (
              people.map((person) => {
                const info = describeEnrollment(person);
                return (
                  <div
                    key={person.userId}
                    className="grid gap-3 px-4 py-4 md:grid-cols-[1.1fr_0.8fr_1fr_0.8fr] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{person.name}</p>
                      {person.email && <p className="truncate text-sm text-slate-500">{person.email}</p>}
                    </div>
                    <Badge variant="outline" className="w-fit bg-white">
                      {audienceLabel[course.audience]}
                    </Badge>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>{person.progressPercent}%</span>
                        <span>{info.due}</span>
                      </div>
                      <Progress value={person.progressPercent} className="h-2" />
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit",
                        info.tone === "red"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : info.tone === "emerald"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-blue-200 bg-blue-50 text-blue-700",
                      )}
                    >
                      {info.statusLabel}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-950">Percorsi obbligatori</h3>
          <p className="mt-1 text-sm text-slate-500">Corsi da tenere sotto controllo per sicurezza e procedure.</p>
          <div className="mt-4 space-y-3">
            {mandatoryCourses.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                  <Badge variant="outline">{item.completion}%</Badge>
                </div>
                <Progress value={item.completion} className="mt-3 h-2" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <h3 className="font-bold text-orange-950">Automazioni consigliate</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-orange-900">
            Collega scadenze, attestati, notifiche automatiche e tracciamento per singolo dipendente quando il portale
            passa da beta a rollout aziendale.
          </p>
        </div>
      </aside>
    </div>
  );
}

function PortalPreview({
  course,
  courses,
  companyId,
  userId,
  onOpenAsset,
}: {
  course?: PortalCourse;
  courses: PortalCourse[];
  companyId?: string | null;
  userId?: string | null;
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const learnerCourses = useMemo(() => {
    const visibleCourses = courses.filter((item) => item.status === "pubblicato");
    const baseCourses = visibleCourses.length > 0 ? visibleCourses : courses;

    if (!course || baseCourses.some((item) => item.id === course.id)) {
      return baseCourses;
    }

    return [course, ...baseCourses];
  }, [course, courses]);
  const requestedCourseId = searchParams.get("portalCourse");
  const requestedCourse = requestedCourseId
    ? learnerCourses.find((item) => item.id === requestedCourseId)
    : undefined;
  const requestedModuleId = searchParams.get("portalModule") ?? "";
  const requestedLearnerFilter = isLearnerCourseFilter(searchParams.get("portalFilter"))
    ? (searchParams.get("portalFilter") as LearnerCourseFilter)
    : "tutti";
  const requestedLearnerView: PortalLearnerView =
    searchParams.get("portalView") === "course" && requestedCourse ? "course" : "library";
  const requestedCourseExperienceView: PortalCourseExperienceView =
    requestedLearnerView === "course" && isPortalCourseExperienceView(searchParams.get("portalMode"))
      ? (searchParams.get("portalMode") as PortalCourseExperienceView)
      : "overview";
  const [learnerSearch, setLearnerSearch] = useState("");
  const [learnerFilter, setLearnerFilter] = useState<LearnerCourseFilter>(requestedLearnerFilter);
  const [learnerView, setLearnerView] = useState<PortalLearnerView>(requestedLearnerView);
  const [courseExperienceView, setCourseExperienceView] =
    useState<PortalCourseExperienceView>(requestedCourseExperienceView);
  const [learnerCourseId, setLearnerCourseId] = useState(
    requestedCourse?.id ?? course?.id ?? learnerCourses[0]?.id ?? "",
  );
  const [completedPreviewModules, setCompletedPreviewModules] = useState<Record<string, boolean>>(
    () => loadPortalLearnerState(companyId, userId).completedModules,
  );
  const [acknowledgedPreviewItems, setAcknowledgedPreviewItems] = useState<Record<string, string>>(
    () => loadPortalLearnerState(companyId, userId).acknowledgements,
  );
  const [activePreviewAssetId, setActivePreviewAssetId] = useState("");
  const lastSyncedSelectedCourseId = useRef<string | undefined>(course?.id);
  const selectedCourseFirstModuleId = course?.modules[0]?.id ?? "";
  const activeLearnerCourse =
    learnerCourses.find((item) => item.id === learnerCourseId) ?? learnerCourses[0] ?? course;
  const [activeModuleId, setActiveModuleId] = useState(
    requestedModuleId || (activeLearnerCourse?.modules[0]?.id ?? ""),
  );
  const hasLearnerModules = (activeLearnerCourse?.modules.length ?? 0) > 0;
  const activeModule = activeLearnerCourse?.modules.find((module) => module.id === activeModuleId)
    ?? activeLearnerCourse?.modules[0];
  const getPreviewModuleCompletion = useCallback(
    (
      module: PortalModule,
      courseId = activeLearnerCourse?.id ?? "",
      completedState = completedPreviewModules,
    ) => (completedState[`${courseId}:${module.id}`] ? 100 : module.completedRate),
    [activeLearnerCourse?.id, completedPreviewModules],
  );
  const getCourseCompletion = useCallback(
    (targetCourse?: PortalCourse, completedState = completedPreviewModules) =>
      targetCourse?.modules.length
        ? Math.round(
            targetCourse.modules.reduce(
              (sum, module) => sum + getPreviewModuleCompletion(module, targetCourse.id, completedState),
              0,
            ) / targetCourse.modules.length,
          )
        : targetCourse?.completion ?? 0,
    [completedPreviewModules, getPreviewModuleCompletion],
  );
  const previewCourseCompletion = getCourseCompletion(activeLearnerCourse);
  const isActiveModuleCompleted = activeModule ? getPreviewModuleCompletion(activeModule) >= 100 : false;
  const isPreviewCourseCompleted = activeLearnerCourse?.modules.length
    ? activeLearnerCourse.modules.every((module) => getPreviewModuleCompletion(module, activeLearnerCourse.id) >= 100)
    : false;
  const courseAssets = activeLearnerCourse?.assets ?? [];
  const activeModuleAssets = activeModule ? courseAssets.filter((asset) => asset.moduleId === activeModule.id) : [];
  const generalCourseAssets = courseAssets.filter((asset) => !asset.moduleId);
  const moduleAssets = activeModule ? [...activeModuleAssets, ...generalCourseAssets] : courseAssets;
  const activePreviewAsset =
    moduleAssets.find((asset) => asset.id === activePreviewAssetId) ??
    moduleAssets.find((asset) => asset.type === "video") ??
    moduleAssets[0];
  const activeLessonBlocks = activeLearnerCourse ? getLessonBlocksForModule(activeLearnerCourse, activeModule, true) : [];
  const activeAcknowledgementItems = activeLearnerCourse ? getAcknowledgementItems(activeLearnerCourse, activeModule) : [];
  const signedAcknowledgementCount = activeAcknowledgementItems.filter((item) => acknowledgedPreviewItems[item.id]).length;
  const hasGeneralCourseAssets = generalCourseAssets.length > 0;
  const nextModuleIndex = activeLearnerCourse?.modules.findIndex((module) => module.id === activeModule?.id) ?? 0;
  const nextModule = activeLearnerCourse?.modules[nextModuleIndex + 1];
  const filteredLearnerCourses = useMemo(() => {
    const normalized = learnerSearch.trim().toLowerCase();
    return learnerCourses.filter((item) => {
      const completion = getCourseCompletion(item);
      const matchesFilter = learnerFilter === "tutti" || getLearnerCourseStatus(item, completion) === learnerFilter;
      const matchesSearch =
        !normalized ||
        item.title.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized) ||
        areaLabels[item.area].toLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [getCourseCompletion, learnerCourses, learnerFilter, learnerSearch]);
  const unlockedModules = learnerCourses.reduce((sum, item) => sum + item.modules.length, 0);
  const unlockedAssets = learnerCourses.reduce((sum, item) => sum + item.assets.length, 0);
  const completedCourses = learnerCourses.filter((item) => {
    return getCourseCompletion(item) >= 100;
  }).length;
  const learnerKnowledgeItems = useMemo(() => getKnowledgeItems(learnerCourses), [learnerCourses]);
  const currentModuleNumber = activeLearnerCourse?.modules.findIndex((module) => module.id === activeModule?.id) ?? 0;
  const readableModuleNumber = currentModuleNumber >= 0 ? currentModuleNumber + 1 : 1;
  const remainingModules = activeLearnerCourse?.modules.filter(
    (module) => getPreviewModuleCompletion(module, activeLearnerCourse.id) < 100,
  ).length ?? 0;
  const completedModulesCount = activeLearnerCourse?.modules.length
    ? activeLearnerCourse.modules.length - remainingModules
    : 0;
  const quizAssets = courseAssets.filter((asset) => asset.type === "quiz");
  const materialAssets = courseAssets.filter((asset) => asset.type !== "quiz");
  const courseHasQuizStep =
    quizAssets.length > 0 || activeLearnerCourse?.modules.some((module) => /quiz|verifica/i.test(module.title));

  const scrollToPreviewSection = (elementId: string) => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollCourseToTop = () => {
    document.getElementById("portal-course-detail")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scheduleCourseScrollToTop = () => {
    window.setTimeout(scrollCourseToTop, 0);
  };

  const updateLearnerUrl = useCallback(({
    view,
    courseId,
    moduleId,
    mode,
    filter,
  }: {
    view?: PortalLearnerView;
    courseId?: string | null;
    moduleId?: string | null;
    mode?: PortalCourseExperienceView | null;
    filter?: LearnerCourseFilter | null;
  }) => {
    const nextParams = new URLSearchParams(searchParams);

    if (view) nextParams.set("portalView", view);
    if (filter) nextParams.set("portalFilter", filter);

    if (view === "library") {
      nextParams.delete("portalCourse");
      nextParams.delete("portalModule");
      nextParams.delete("portalMode");
    } else {
      if (courseId) nextParams.set("portalCourse", courseId);
      if (moduleId) nextParams.set("portalModule", moduleId);
      if (mode) nextParams.set("portalMode", mode);
    }

    if (courseId === null) nextParams.delete("portalCourse");
    if (moduleId === null) nextParams.delete("portalModule");
    if (mode === null) nextParams.delete("portalMode");
    if (filter === null) nextParams.delete("portalFilter");

    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const persistLearnerProgress = (targetCourse: PortalCourse, progressPercent: number) => {
    if (!companyId || !userId) return;

    withPortalTimeout(
      savePortalCourseEnrollment(companyId, userId, targetCourse.id, progressPercent),
      8_000,
      "Aggiornamento avanzamento Portale troppo lento.",
    ).catch(() => {
      // L'avanzamento resta comunque salvato nello storage locale e viene riproposto alla prossima apertura.
    });
  };

  const recordLearnerActivity = (
    targetCourse: PortalCourse,
    eventType: string,
    metadata: Record<string, unknown>,
  ) => {
    if (!companyId) return;

    withPortalTimeout(
      logPortalCourseActivity(companyId, targetCourse.id, eventType, metadata),
      8_000,
      "Registro attivita Portale troppo lento.",
    ).catch(() => {
      // Il log remoto e di supporto: non deve bloccare l'esperienza dell'utente.
    });
  };

  const openLearnerCourse = (selectedCourse: PortalCourse, moduleId = selectedCourse.modules[0]?.id ?? "") => {
    setLearnerCourseId(selectedCourse.id);
    setActiveModuleId(moduleId);
    setActivePreviewAssetId("");
    setCourseExperienceView("overview");
    setLearnerView("course");
    updateLearnerUrl({
      view: "course",
      courseId: selectedCourse.id,
      moduleId: moduleId || null,
      mode: "overview",
    });
    toast.success(`Corso aperto: ${selectedCourse.title}`);
    scheduleCourseScrollToTop();
  };

  const backToLearnerLibrary = useCallback(() => {
    setCourseExperienceView("overview");
    setLearnerView("library");
    updateLearnerUrl({ view: "library" });
    window.requestAnimationFrame(() => scrollToPreviewSection("portal-preview-root"));
  }, [updateLearnerUrl]);

  const openLearnerLesson = (
    moduleId = activeModule?.id ?? activeLearnerCourse?.modules[0]?.id ?? "",
    focusAssetId?: string,
  ) => {
    const targetModuleId = moduleId || activeModule?.id || activeLearnerCourse?.modules[0]?.id || "";

    if (!targetModuleId) {
      toast.info("Aggiungi almeno un modulo per aprire la pagina lezione.");
      setCourseExperienceView("overview");
      updateLearnerUrl({
        view: "course",
        courseId: activeLearnerCourse?.id ?? null,
        moduleId: null,
        mode: "overview",
      });
      scheduleCourseScrollToTop();
      return;
    }

    setActiveModuleId(targetModuleId);
    setActivePreviewAssetId(focusAssetId ?? "");
    setCourseExperienceView("lesson");
    updateLearnerUrl({
      view: "course",
      courseId: activeLearnerCourse?.id ?? null,
      moduleId: targetModuleId,
      mode: "lesson",
    });
    window.setTimeout(() => scrollToPreviewSection("portal-preview-player"), 0);
  };

  const openLearnerMaterials = () => {
    setCourseExperienceView("lesson");
    updateLearnerUrl({
      view: "course",
      courseId: activeLearnerCourse?.id ?? null,
      moduleId: activeModule?.id ?? null,
      mode: "lesson",
    });
    window.setTimeout(() => scrollToPreviewSection("portal-preview-materials"), 0);
  };

  const openLearnerBlock = (block: PortalLessonBlock) => {
    if (block.type === "presa_visione") {
      if (block.asset) setActivePreviewAssetId(block.asset.id);
      setCourseExperienceView("lesson");
      updateLearnerUrl({
        view: "course",
        courseId: activeLearnerCourse?.id ?? null,
        moduleId: activeModule?.id ?? null,
        mode: "lesson",
      });
      window.setTimeout(() => scrollToPreviewSection("portal-preview-acknowledgement"), 0);
      return;
    }

    if (block.asset) {
      setActivePreviewAssetId(block.asset.id);
      setCourseExperienceView("lesson");
      updateLearnerUrl({
        view: "course",
        courseId: activeLearnerCourse?.id ?? null,
        moduleId: activeModule?.id ?? null,
        mode: "lesson",
      });
      window.setTimeout(() => scrollToPreviewSection("portal-preview-player"), 0);
      return;
    }

    toast.info("Blocco consigliato: aggiungilo dal builder per renderlo disponibile agli utenti.");
  };

  const signAcknowledgement = (item: PortalAcknowledgementItem) => {
    if (!activeLearnerCourse) return;
    const signedAt = new Date().toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    setAcknowledgedPreviewItems((prev) => ({
      ...prev,
      [item.id]: signedAt,
    }));
    if (item.asset) setActivePreviewAssetId(item.asset.id);
    recordLearnerActivity(activeLearnerCourse, "acknowledgement_signed", {
      acknowledgementId: item.id,
      title: item.title,
      moduleTitle: item.moduleTitle,
      signedAt,
    });
    toast.success(`Presa visione registrata: ${item.title}`);
  };

  useEffect(() => {
    const storedState = loadPortalLearnerState(companyId, userId);
    setCompletedPreviewModules(storedState.completedModules);
    setAcknowledgedPreviewItems(storedState.acknowledgements);
  }, [companyId, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        getPortalLearnerStateKey(companyId, userId),
        JSON.stringify({
          completedModules: completedPreviewModules,
          acknowledgements: acknowledgedPreviewItems,
        } satisfies PortalLearnerState),
      );
    } catch {
      // Se lo storage locale non e disponibile, la preview resta comunque utilizzabile.
    }
  }, [acknowledgedPreviewItems, companyId, completedPreviewModules, userId]);

  useEffect(() => {
    if (!companyId || !userId || learnerCourses.length === 0) return;
    let active = true;

    withPortalTimeout(
      listPortalCourseEnrollments(companyId, userId),
      8_000,
      "Caricamento avanzamento Portale troppo lento.",
    )
      .then((enrollments) => {
        if (!active || enrollments.length === 0) return;

        const byCourseId = new Map(learnerCourses.map((item) => [item.id, item]));
        const restoredModules: Record<string, boolean> = {};

        enrollments.forEach((enrollment) => {
          const enrolledCourse = byCourseId.get(enrollment.courseId);
          if (!enrolledCourse || enrolledCourse.modules.length === 0) return;

          const completedCount =
            enrollment.progressPercent >= 100
              ? enrolledCourse.modules.length
              : Math.floor((enrollment.progressPercent / 100) * enrolledCourse.modules.length);

          enrolledCourse.modules.slice(0, completedCount).forEach((module) => {
            restoredModules[`${enrolledCourse.id}:${module.id}`] = true;
          });
        });

        if (Object.keys(restoredModules).length === 0) return;
        setCompletedPreviewModules((prev) => ({ ...restoredModules, ...prev }));
      })
      .catch(() => {
        // Fallback locale: non mostriamo errori all'utente per un dato di avanzamento accessorio.
      });

    return () => {
      active = false;
    };
  }, [companyId, learnerCourses, userId]);

  useEffect(() => {
    const urlFilter = isLearnerCourseFilter(searchParams.get("portalFilter"))
      ? (searchParams.get("portalFilter") as LearnerCourseFilter)
      : "tutti";

    if (urlFilter !== learnerFilter) {
      setLearnerFilter(urlFilter);
    }

    const urlCourseId = searchParams.get("portalCourse");
    const urlCourse = urlCourseId ? learnerCourses.find((item) => item.id === urlCourseId) : undefined;

    if (searchParams.get("portalView") !== "course" || !urlCourse) {
      if (searchParams.get("portalView") === "library" && learnerView !== "library") {
        setCourseExperienceView("overview");
        setLearnerView("library");
      }
      return;
    }

    const urlModuleId = searchParams.get("portalModule");
    const nextModuleId =
      urlModuleId && urlCourse.modules.some((module) => module.id === urlModuleId)
        ? urlModuleId
        : urlCourse.modules[0]?.id ?? "";
    const nextMode = isPortalCourseExperienceView(searchParams.get("portalMode"))
      ? (searchParams.get("portalMode") as PortalCourseExperienceView)
      : "overview";

    if (learnerView !== "course") setLearnerView("course");
    if (learnerCourseId !== urlCourse.id) setLearnerCourseId(urlCourse.id);
    if (activeModuleId !== nextModuleId) setActiveModuleId(nextModuleId);
    if (courseExperienceView !== nextMode) setCourseExperienceView(nextMode);
  }, [
    activeModuleId,
    courseExperienceView,
    learnerCourseId,
    learnerCourses,
    learnerFilter,
    learnerView,
    searchParams,
  ]);

  useEffect(() => {
    if (learnerView !== "course") return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        backToLearnerLibrary();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [backToLearnerLibrary, learnerView]);

  const completeActiveModule = () => {
    if (!activeLearnerCourse || !activeModule) return;
    const nextCompletedModules = {
      ...completedPreviewModules,
      [`${activeLearnerCourse.id}:${activeModule.id}`]: true,
    };
    const nextProgress = activeLearnerCourse.modules.length
      ? Math.round(
          activeLearnerCourse.modules.reduce(
            (sum, module) => sum + getPreviewModuleCompletion(module, activeLearnerCourse.id, nextCompletedModules),
            0,
          ) / activeLearnerCourse.modules.length,
        )
      : 0;
    const willCompleteCourse = activeLearnerCourse.modules.every((module) =>
      getPreviewModuleCompletion(module, activeLearnerCourse.id, nextCompletedModules) >= 100,
    );
    setCompletedPreviewModules(nextCompletedModules);
    persistLearnerProgress(activeLearnerCourse, nextProgress);
    recordLearnerActivity(activeLearnerCourse, "module_completed", {
      moduleId: activeModule.id,
      moduleTitle: activeModule.title,
      progressPercent: nextProgress,
      courseCompleted: willCompleteCourse,
    });
    toast.success(
      willCompleteCourse
        ? "Corso completato."
        : nextModule
          ? "Lezione completata. Puoi passare al modulo successivo."
          : "Lezione completata. Restano moduli precedenti da chiudere.",
    );
  };

  useEffect(() => {
    if (!activeLearnerCourse) return;
    if (!learnerCourses.some((item) => item.id === learnerCourseId)) {
      setLearnerCourseId(activeLearnerCourse.id);
    }
  }, [activeLearnerCourse, learnerCourseId, learnerCourses]);

  useEffect(() => {
    if (!course?.id || lastSyncedSelectedCourseId.current === course.id) return;
    if (searchParams.get("portalCourse")) return;
    if (!learnerCourses.some((item) => item.id === course.id)) return;

    lastSyncedSelectedCourseId.current = course.id;
    setLearnerCourseId(course.id);
    setActiveModuleId(selectedCourseFirstModuleId);
    setActivePreviewAssetId("");
    setCourseExperienceView("overview");
    setLearnerView("library");
  }, [course?.id, learnerCourses, searchParams, selectedCourseFirstModuleId]);

  useEffect(() => {
    if (!activeLearnerCourse) return;
    const hasModule = activeLearnerCourse.modules.some((module) => module.id === activeModuleId);
    if (!hasModule) {
      setActiveModuleId(activeLearnerCourse.modules[0]?.id ?? "");
    }
  }, [activeLearnerCourse, activeModuleId]);

  if (!activeLearnerCourse) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-bold text-slate-950">Nessun corso disponibile nella pagina utente</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Crea un corso o pubblicane almeno uno per vedere la libreria che useranno dipendenti, collaboratori e team di
          cantiere.
        </p>
      </section>
    );
  }

  return (
    <section id="portal-preview-root" className="space-y-5">
      {learnerView === "library" && (
        <div className="z-10 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:sticky sm:top-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-950">Demo Azienda Academy</p>
                  <Badge variant="outline" className="hidden border-blue-200 bg-blue-50 text-[11px] text-blue-700 sm:inline-flex">
                    Anteprima admin
                  </Badge>
                </div>
                <p className="truncate text-xs text-slate-500">Area utente finale · corsi, materiali, quiz e attestati</p>
              </div>
            </div>
            <div className="relative min-w-0 flex-1 lg:max-w-2xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={learnerSearch}
                onChange={(event) => setLearnerSearch(event.target.value)}
                className="h-10 rounded-2xl border-slate-200 pl-9 text-base sm:text-sm"
                placeholder="Cerca corsi, manuali o procedure"
              />
            </div>
          </div>
        </div>
      )}

      {learnerView === "library" ? (
        <>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 p-5 text-white lg:grid-cols-[minmax(0,1.1fr)_360px] lg:p-6">
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-emerald-300/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/15">
                  {learnerCourses.length} corsi sbloccati
                </Badge>
              </div>
              <h2 className="mt-4 max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">
                La tua formazione
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">
                Riprendi le lezioni, consulta procedure e materiali, completa i moduli e tieni sotto controllo gli attestati.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
              <LearnerMetric label="Moduli" value={String(unlockedModules)} icon={ListChecks} />
              <LearnerMetric label="Materiali" value={String(unlockedAssets)} icon={FileArchive} />
              <LearnerMetric label="Completati" value={String(completedCourses)} icon={CheckCircle2} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Continua da dove eri rimasto</p>
            <h3 className="mt-2 line-clamp-2 text-xl font-bold">{activeLearnerCourse.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-blue-100">{activeLearnerCourse.description}</p>
            <div className="mt-4 rounded-full bg-white/20 p-1">
              <div
                className="h-2 rounded-full bg-orange-400"
                style={{ width: `${Math.max(previewCourseCompletion, 8)}%` }}
              />
            </div>
            <Button
              className="mt-4 h-11 w-full bg-white text-blue-800 hover:bg-blue-50"
              onClick={() =>
                openLearnerCourse(activeLearnerCourse, activeModule?.id ?? activeLearnerCourse.modules[0]?.id ?? "")
              }
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Riprendi corso
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Libreria personale</p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">I tuoi corsi sbloccati</h3>
            <p className="mt-1 text-sm text-slate-500">
              Corsi pubblicati, stato di avanzamento e prossimo passo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "tutti" as const, label: "Tutti" },
              { value: "in_corso" as const, label: "In corso" },
              { value: "da_iniziare" as const, label: "Da iniziare" },
              { value: "completati" as const, label: "Completati" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setLearnerFilter(filter.value);
                  updateLearnerUrl({ filter: filter.value });
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
                  learnerFilter === filter.value
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredLearnerCourses.map((item) => (
            <LearnerCourseCard
              key={item.id}
              course={item}
              completion={getCourseCompletion(item)}
              active={item.id === activeLearnerCourse.id}
              onOpen={() => openLearnerCourse(item)}
            />
          ))}
        </div>

        {filteredLearnerCourses.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-400" />
            <h4 className="mt-3 font-bold text-slate-950">Nessun corso trovato</h4>
            <p className="mt-1 text-sm text-slate-500">Cambia ricerca o filtro per vedere altri corsi sbloccati.</p>
          </div>
        )}
      </section>
        </>
      ) : typeof document === "undefined" ? null : createPortal(
        <section
          id="portal-course-detail"
          role="dialog"
          aria-modal="true"
          aria-label={`Pagina corso ${activeLearnerCourse.title}`}
          className="fixed inset-0 z-[9999] isolate min-h-dvh overflow-y-auto overscroll-contain bg-slate-50"
        >
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-[1640px] flex-col gap-3 px-4 py-3 lg:px-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="outline"
                  className="h-11 shrink-0 gap-2 rounded-2xl border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => {
                    // Back gerarchico: dalla lezione si torna alla panoramica del
                    // corso; dalla panoramica si esce alla libreria.
                    if (courseExperienceView === "lesson") {
                      setCourseExperienceView("overview");
                      updateLearnerUrl({
                        view: "course",
                        courseId: activeLearnerCourse.id,
                        moduleId: activeModule?.id ?? null,
                        mode: "overview",
                      });
                      scheduleCourseScrollToTop();
                    } else {
                      backToLearnerLibrary();
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden truncate sm:inline">
                    {courseExperienceView === "lesson" ? "Torna al corso" : "Torna alla piattaforma"}
                  </span>
                </Button>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-slate-950 lg:text-xl">{activeLearnerCourse.title}</h3>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 justify-center gap-1.5 rounded-2xl px-1.5 text-xs sm:gap-2 sm:px-4 sm:text-sm",
                      courseExperienceView === "overview"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
                    )}
                    onClick={() => {
                      setCourseExperienceView("overview");
                      updateLearnerUrl({
                        view: "course",
                        courseId: activeLearnerCourse.id,
                        moduleId: activeModule?.id ?? null,
                        mode: "overview",
                      });
                      scheduleCourseScrollToTop();
                    }}
                  >
                    <BookOpenCheck className="h-4 w-4" />
                    Panoramica
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 justify-center gap-1.5 rounded-2xl px-1.5 text-xs sm:gap-2 sm:px-4 sm:text-sm",
                      courseExperienceView === "lesson"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
                    )}
                    onClick={() => openLearnerLesson()}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Lezione
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 justify-center gap-1.5 rounded-2xl px-1.5 text-xs sm:gap-2 sm:px-4 sm:text-sm border-blue-200 text-blue-700"
                    onClick={openLearnerMaterials}
                  >
                    <Download className="h-4 w-4" />
                    Materiali
                  </Button>
                </div>

                <div className="hidden gap-2 2xl:grid 2xl:grid-cols-3 2xl:w-[520px]">
                  <LearnerDetailPill
                    icon={BookOpenCheck}
                    label="Modulo"
                    value={`${hasLearnerModules ? readableModuleNumber : 0}/${activeLearnerCourse.modules.length}`}
                  />
                  <LearnerDetailPill icon={Video} label="Lezione" value={activeModule?.duration ?? "Da definire"} />
                  <LearnerDetailPill icon={FileArchive} label="Materiali" value={String(moduleAssets.length)} />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[1640px] px-4 py-5 lg:px-6 lg:py-6">
            {/* Hero corso (titolo + progress + Avvia lezione): SOLO in panoramica.
                In modalità lezione è ridondante (si è già dentro) e spinge giù il
                contenuto — lì basta l'header sticky + il player. */}
            {courseExperienceView === "overview" && (
            <div className="mb-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-5 bg-gradient-to-r from-white via-blue-50 to-orange-50 p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      {areaLabels[activeLearnerCourse.area]}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Sbloccato
                    </Badge>
                    <Badge variant="outline">{audienceLabels[activeLearnerCourse.audience]}</Badge>
                  </div>
                  <div>
                    <h2 className="max-w-4xl text-2xl font-bold tracking-tight text-slate-950 lg:text-4xl">
                      {activeLearnerCourse.title}
                    </h2>
                    <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">
                      {activeLearnerCourse.description}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avanzamento</p>
                      <div className="mt-1 flex items-end gap-2">
                        <span className="text-4xl font-bold text-slate-950">{previewCourseCompletion}%</span>
                        <span className="pb-1 text-xs font-semibold text-slate-500">
                          {remainingModules === 0
                            ? "Corso completato"
                            : remainingModules === 1
                              ? "1 modulo da completare"
                              : `${remainingModules} moduli da completare`}
                        </span>
                      </div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                  </div>
                  <Progress value={previewCourseCompletion} className="mt-4 h-2" />
                  <Button
                    className="mt-4 h-11 w-full gap-2 bg-blue-600 hover:bg-blue-700"
                    onClick={() => openLearnerLesson(activeModule?.id ?? activeLearnerCourse.modules[0]?.id ?? "")}
                    disabled={!hasLearnerModules}
                  >
                    <PlayCircle className="h-4 w-4" />
                    {hasLearnerModules ? "Avvia lezione" : "Aggiungi moduli"}
                  </Button>
                </div>
              </div>
            </div>
            )}

            {courseExperienceView === "overview" ? (
              <LearnerCourseOverview
                course={activeLearnerCourse}
                activeModuleId={activeModule?.id ?? ""}
                completion={previewCourseCompletion}
                remainingModules={remainingModules}
                completedModules={completedModulesCount}
                courseAssets={courseAssets}
                materialAssets={materialAssets}
                quizAssets={quizAssets}
                hasQuizStep={courseHasQuizStep}
                onOpenLesson={(moduleId) => openLearnerLesson(moduleId)}
                onOpenLessonAsset={(moduleId, asset) => openLearnerLesson(moduleId, asset.id)}
                onOpenMaterials={openLearnerMaterials}
                getModuleCompletion={(module) => getPreviewModuleCompletion(module, activeLearnerCourse.id)}
                onOpenAsset={onOpenAsset}
              />
            ) : (
            <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
              <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-bold text-slate-950">Programma corso</h4>
                      <p className="text-sm text-slate-500">Scegli un modulo e guarda i contenuti sotto.</p>
                    </div>
                    <Badge variant="outline">{activeLearnerCourse.modules.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {activeLearnerCourse.modules.map((module, index) => {
                      const previewRate = getPreviewModuleCompletion(module, activeLearnerCourse.id);
                      const isActiveMod = module.id === activeModule?.id;
                      const moduleLessons = activeLearnerCourse.assets.filter((a) => a.moduleId === module.id);
                      return (
                        <div
                          key={module.id}
                          className={cn(
                            "rounded-2xl border transition",
                            isActiveMod ? "border-blue-300 bg-blue-50 ring-1 ring-blue-100" : "border-slate-200 bg-white",
                          )}
                        >
                          <button
                            type="button"
                            className="flex w-full gap-3 rounded-2xl p-3 text-left transition hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            onClick={() => openLearnerLesson(module.id)}
                          >
                            <div
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                                previewRate >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700",
                              )}
                            >
                              {previewRate >= 100 ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-2 text-sm font-bold text-slate-950">{module.title}</p>
                                <span className="shrink-0 text-xs font-medium text-slate-500">{module.duration}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{module.description}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={previewRate} className="h-1.5 flex-1" />
                                <span className="w-8 text-right text-[11px] font-bold text-slate-500">{previewRate}%</span>
                                <span className="shrink-0 text-[11px] font-medium text-slate-400">
                                  {moduleLessons.length} {moduleLessons.length === 1 ? "lezione" : "lezioni"}
                                </span>
                              </div>
                            </div>
                          </button>
                          {isActiveMod && moduleLessons.length > 0 && (
                            <ul className="space-y-1 border-t border-blue-100 px-2 pb-2 pt-2">
                              {moduleLessons.map((lesson, lessonIndex) => {
                                const LessonIcon = assetIcon[lesson.type];
                                const isCurrent = lesson.id === activePreviewAssetId;
                                return (
                                  <li key={lesson.id}>
                                    <button
                                      type="button"
                                      onClick={() => openLearnerLesson(module.id, lesson.id)}
                                      className={cn(
                                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500",
                                        isCurrent ? "bg-white shadow-sm ring-1 ring-blue-200" : "hover:bg-white/70",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                          isCurrent ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700",
                                        )}
                                      >
                                        <LessonIcon className="h-3.5 w-3.5" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-semibold text-slate-900">
                                          {lessonIndex + 1}. {lesson.title}
                                        </span>
                                        <span className="block truncate text-[11px] text-slate-500">
                                          {assetTypeLabels[lesson.type]} · {lesson.duration}
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {activeLearnerCourse.modules.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                        Nessun modulo pubblicato. La vista lezione resta bloccata finche non viene aggiunto contenuto.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-950">Il tuo percorso</h4>
                      <p className="text-sm text-slate-500">Avanzamento e risorse totali</p>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      In corso
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-4xl font-bold text-slate-950">{previewCourseCompletion}%</span>
                    <span className="pb-1 text-sm text-slate-500">completato</span>
                  </div>
                  <Progress value={previewCourseCompletion} className="mt-4 h-2" />
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <InfoTile label="Moduli" value={String(activeLearnerCourse.modules.length)} icon={ListChecks} />
                    <InfoTile label="Materiali" value={String(courseAssets.length)} icon={FileArchive} />
                  </div>
                </div>
              </aside>

              <div className="min-w-0 space-y-4">
                <LearnerLessonPlayer
                  module={activeModule}
                  asset={activePreviewAsset}
                  isCompleted={isActiveModuleCompleted}
                  nextModule={nextModule}
                  onComplete={completeActiveModule}
                  onNextModule={() => {
                    if (!nextModule) return;
                    openLearnerLesson(nextModule.id);
                  }}
                  onOpenAsset={onOpenAsset}
                />

                <div id="portal-preview-materials" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-slate-950">Materiali, quiz e allegati</h4>
                      <p className="text-sm text-slate-500">
                        {hasGeneralCourseAssets
                          ? "Risorse del modulo piu materiali generali del corso."
                          : "Risorse, PDF, video, procedure e quiz collegati al modulo."}
                      </p>
                    </div>
                    <Download className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {moduleAssets.map((asset) => (
                      <LearnerAssetRow
                        key={asset.id}
                        asset={asset}
                        course={activeLearnerCourse}
                        active={asset.id === activePreviewAsset?.id}
                        onSelect={() => {
                          setActivePreviewAssetId(asset.id);
                          scrollToPreviewSection("portal-preview-player");
                        }}
                        onOpen={() => onOpenAsset(asset)}
                      />
                    ))}
                    {moduleAssets.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 lg:col-span-2">
                        Nessun materiale per questo modulo.
                      </div>
                    )}
                  </div>
                </div>

                <LearnerAcknowledgementPanel
                  items={activeAcknowledgementItems}
                  signatures={acknowledgedPreviewItems}
                  signedCount={signedAcknowledgementCount}
                  onSign={signAcknowledgement}
                  onOpenAsset={(asset) => {
                    setActivePreviewAssetId(asset.id);
                    scrollToPreviewSection("portal-preview-player");
                  }}
                />

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="font-bold text-slate-950">Azioni studente</h4>
                    <p className="mt-1 text-sm text-slate-500">Note, domande e presa visione restano nel percorso.</p>
                    <div className="mt-4 space-y-2">
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start gap-2 border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => toast.info("Nota salvata.")}
                      >
                        <FileText className="h-4 w-4" />
                        Aggiungi nota
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start gap-2 border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => toast.info("Richiesta di chiarimento inviata al responsabile.")}
                      >
                        <UserRoundCheck className="h-4 w-4" />
                        Chiedi chiarimento
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start gap-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        onClick={() => scrollToPreviewSection("portal-preview-acknowledgement")}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Registro presa visione
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
                    <h4 className="font-bold text-orange-950">Prossimo passo</h4>
                    <p className="mt-2 text-sm leading-6 text-orange-900">
                      {nextModule ? `Continua con: ${nextModule.title}.` : "Completa il quiz finale e scarica l'attestato interno."}
                    </p>
                    {nextModule && (
                      <Button
                        variant="outline"
                        className="mt-4 h-10 w-full border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
                        onClick={() => {
                          openLearnerLesson(nextModule.id);
                        }}
                      >
                        Apri modulo
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-700" />
                      <h4 className="font-bold text-emerald-950">Attestato</h4>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      Si sblocca al completamento del corso con storico e presa visione.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 h-10 w-full border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100"
                      onClick={() =>
                        isPreviewCourseCompleted
                          ? toast.success("Attestato interno disponibile.")
                          : toast.info("Completa tutti i moduli per sbloccare l'attestato.")
                      }
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Vedi attestato
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </section>,
        document.body,
      )}
    </section>
  );
}

function LearnerMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Video }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-2.5 backdrop-blur sm:p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-100 sm:text-xs">
        <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block sm:h-4 sm:w-4" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold text-white sm:mt-2 sm:text-2xl">{value}</p>
    </div>
  );
}

function LearnerDetailPill({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Video }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4 text-blue-600" />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function LearnerCourseOverview({
  course,
  activeModuleId,
  completion,
  remainingModules,
  completedModules,
  courseAssets,
  materialAssets,
  quizAssets,
  hasQuizStep,
  onOpenLesson,
  onOpenLessonAsset,
  onOpenMaterials,
  getModuleCompletion,
  onOpenAsset,
}: {
  course: PortalCourse;
  activeModuleId: string;
  completion: number;
  remainingModules: number;
  completedModules: number;
  courseAssets: PortalAsset[];
  materialAssets: PortalAsset[];
  quizAssets: PortalAsset[];
  hasQuizStep: boolean;
  onOpenLesson: (moduleId: string) => void;
  onOpenLessonAsset: (moduleId: string, asset: PortalAsset) => void;
  onOpenMaterials: () => void;
  getModuleCompletion: (module: PortalModule) => number;
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  const hasModules = course.modules.length > 0;
  // Durata totale reale (somma dei minuti dei moduli). Sostituisce il conteggio
  // "lezioni" che era un numero seed slegato dal contenuto effettivo.
  const totalDurationMin = course.modules.reduce((sum, module) => sum + (parseInt(module.duration, 10) || 0), 0);
  const totalDurationLabel =
    totalDurationMin >= 60 ? `${Math.floor(totalDurationMin / 60)}h ${totalDurationMin % 60}m` : `${totalDurationMin} min`;
  const firstOpenModule = course.modules.find((module) => getModuleCompletion(module) < 100) ?? course.modules[0];
  const featuredAssets = courseAssets.slice(0, 4);
  // Accordion moduli: ogni modulo si espande per mostrare le sue lezioni (gli
  // asset con quel moduleId). Default: espanso il primo modulo da completare.
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-bold text-slate-950">Il corso in sintesi</h3>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Moduli" value={String(course.modules.length)} icon={ListChecks} />
            <InfoTile label="Durata" value={totalDurationLabel} icon={CalendarClock} />
            <InfoTile label="Completati" value={String(completedModules)} icon={CheckCircle2} />
            <InfoTile label="Materiali" value={String(materialAssets.length)} icon={FileArchive} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Programma</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">Moduli del corso</h3>
            </div>
            <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
              {remainingModules} da completare
            </Badge>
          </div>

          <div className="space-y-3">
            {course.modules.map((module, index) => {
              const moduleCompletion = getModuleCompletion(module);
              const isActive = module.id === activeModuleId;
              const moduleLessons = course.assets.filter((asset) => asset.moduleId === module.id);
              const isExpanded = expandedModules[module.id] ?? module.id === firstOpenModule?.id;
              const toggleExpanded = () => setExpandedModules((prev) => ({ ...prev, [module.id]: !isExpanded }));
              return (
                <div
                  key={module.id}
                  className={cn(
                    "rounded-3xl border bg-white transition",
                    isActive ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggleExpanded}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded();
                      }
                    }}
                    className="grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-3xl p-3 text-left transition hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:p-4"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold sm:h-14 sm:w-14 sm:text-lg",
                        moduleCompletion >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {moduleCompletion >= 100 ? <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" /> : index + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h4 className="text-base font-bold text-slate-950 sm:text-lg">{module.title}</h4>
                        <Badge
                          variant="outline"
                          className={cn(
                            moduleCompletion >= 100
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : moduleCompletion > 0
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-slate-50 text-slate-600",
                          )}
                        >
                          {moduleCompletion >= 100 ? "Completato" : moduleCompletion > 0 ? "In corso" : "Da iniziare"}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                          {module.duration}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                          {moduleLessons.length} {moduleLessons.length === 1 ? "lezione" : "lezioni"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 hidden line-clamp-2 text-sm leading-6 text-slate-600 sm:block">{module.description}</p>
                      <div className="mt-2 flex items-center gap-2 sm:mt-3">
                        <Progress value={moduleCompletion} className="h-1.5 flex-1 sm:h-2" />
                        <span className="w-9 text-right text-xs font-bold text-slate-500">{moduleCompletion}%</span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenLesson(module.id);
                          }}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 sm:h-10"
                        >
                          Apri
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          {isExpanded ? "Nascondi" : "Lezioni"}
                          <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                      {moduleLessons.length > 0 ? (
                        <ul className="space-y-1.5">
                          {moduleLessons.map((lesson, lessonIndex) => {
                            const LessonIcon = assetIcon[lesson.type];
                            return (
                              <li key={lesson.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenLessonAsset(module.id, lesson)}
                                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                                    <LessonIcon className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-900">
                                      {lessonIndex + 1}. {lesson.title}
                                    </span>
                                    <span className="block text-xs text-slate-500">
                                      {assetTypeLabels[lesson.type]} · {lesson.duration}
                                    </span>
                                  </span>
                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-500">
                          Contenuti in preparazione per questo modulo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {course.modules.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                <BookOpenCheck className="mx-auto h-8 w-8 text-slate-400" />
                <h4 className="mt-3 font-bold text-slate-950">Nessun modulo nel corso</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Aggiungi almeno un modulo dal builder per rendere questa pagina realmente fruibile dall'utente.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risorse</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">Materiali e quiz disponibili</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="w-fit">{materialAssets.length} materiali</Badge>
              <Badge variant="outline" className="w-fit">{quizAssets.length} quiz</Badge>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {featuredAssets.map((asset) => {
              const targetModuleId = asset.moduleId ?? firstOpenModule?.id ?? course.modules[0]?.id ?? "";

              return (
                <LearnerAssetRow
                  key={asset.id}
                  asset={asset}
                  course={course}
                  onSelect={targetModuleId ? () => onOpenLesson(targetModuleId) : undefined}
                  onOpen={() => onOpenAsset(asset)}
                />
              );
            })}
            {featuredAssets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 lg:col-span-2">
                Nessun materiale collegato al corso.
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-orange-600" />
            <h3 className="font-bold text-orange-950">Prossimo passo</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-orange-900">
            {firstOpenModule
              ? `Apri "${firstOpenModule.title}" e completa i contenuti del modulo.`
              : "Aggiungi moduli per rendere il corso operativo."}
          </p>
          <Button
            variant="outline"
            className="mt-4 h-10 w-full border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
            onClick={() => onOpenLesson(firstOpenModule?.id ?? course.modules[0]?.id ?? "")}
            disabled={!hasModules}
          >
            {hasModules ? "Vai alla lezione" : "Aggiungi modulo"}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </section>

      </aside>
    </div>
  );
}

function LearnerLessonPlayer({
  module,
  asset,
  isCompleted,
  nextModule,
  onComplete,
  onNextModule,
  onOpenAsset,
}: {
  module?: PortalModule;
  asset?: PortalAsset;
  isCompleted: boolean;
  nextModule?: PortalModule;
  onComplete: () => void;
  onNextModule: () => void;
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  const SelectedIcon = asset ? assetIcon[asset.type] : PlayCircle;
  const isVideo = asset?.type === "video";
  const isDocument = asset && ["pdf", "documento", "procedura", "testo", "quiz"].includes(asset.type);
  const previewTitle = asset?.title ?? module?.title ?? "Lezione";
  const previewDescription =
    asset?.content ??
    module?.description ??
    "Seleziona un modulo o un materiale per vedere video, risorse e contenuti collegati alla lezione.";
  const durationLabel = asset?.duration ?? module?.duration ?? "Da definire";
  const resourceLabel = asset ? getAssetStorageHint(asset) : "Nessun materiale selezionato";

  return (
    <div
      id="portal-preview-player"
      className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="bg-slate-950 p-3 text-white sm:p-4">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
          <div
            className={cn(
              "absolute inset-0",
              isVideo
                ? "bg-[radial-gradient(circle_at_76%_20%,rgba(251,146,60,0.38),transparent_28%),linear-gradient(135deg,#0f172a,#1d4ed8_58%,#ea580c)]"
                : "bg-[radial-gradient(circle_at_72%_22%,rgba(59,130,246,0.35),transparent_30%),linear-gradient(135deg,#111827,#334155)]",
            )}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.74),rgba(15,23,42,0.18),rgba(15,23,42,0.72))]" />

          {isDocument && (
            <div className="absolute right-5 top-5 hidden w-48 rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-900 shadow-xl md:block">
              <div className="h-2 w-24 rounded-full bg-slate-200" />
              <div className="mt-3 space-y-2">
                <div className="h-1.5 rounded-full bg-slate-200" />
                <div className="h-1.5 rounded-full bg-slate-200" />
                <div className="h-1.5 w-28 rounded-full bg-slate-200" />
              </div>
              <div className="mt-4 h-16 rounded-xl bg-blue-50" />
            </div>
          )}

          <div className="relative flex h-full flex-col justify-between p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="border-white/20 bg-white/15 text-white hover:bg-white/15">
                {asset ? assetTypeLabels[asset.type] : "Lezione"}
              </Badge>
              <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold text-white/85">
                {durationLabel}
              </span>
            </div>

            <div className="flex flex-1 items-center justify-center py-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/25 bg-white/15 shadow-xl backdrop-blur sm:h-28 sm:w-28">
                {isCompleted ? <CheckCircle2 className="h-12 w-12" /> : <PlayCircle className="h-12 w-12" />}
              </div>
            </div>

            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                {isVideo ? "Anteprima video" : "Anteprima contenuto"}
              </p>
              <h4 className="mt-1 line-clamp-2 text-2xl font-bold sm:text-3xl">{previewTitle}</h4>
              <div className="mt-4 flex items-center gap-3 text-xs text-white/80">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-[42%] rounded-full bg-orange-400" />
                </div>
                <span>0:00 / {durationLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-4 lg:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Lezione corrente</p>
            <h4 className="mt-1 text-xl font-bold text-slate-950">{module?.title ?? "Modulo introduttivo"}</h4>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {module?.description ?? "Apri un modulo per vedere contenuti, materiali e avanzamento."}
            </p>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <SelectedIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-950">{previewTitle}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{previewDescription}</p>
                  <p className="mt-2 text-xs font-medium text-emerald-700">{resourceLabel}</p>
                </div>
              </div>
              {asset && (
                <Button
                  variant="outline"
                  className="mt-3 h-9 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => onOpenAsset(asset)}
                >
                  {asset.type === "link" ? <ExternalLink className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  Apri contenuto completo
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Button
              className="h-11 bg-blue-600 hover:bg-blue-700"
              onClick={onComplete}
              disabled={isCompleted}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isCompleted ? "Lezione completata" : "Completa lezione"}
            </Button>
            {nextModule && (
              <Button variant="outline" className="h-11" onClick={onNextModule}>
                Prossimo modulo
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LearnerAcknowledgementPanel({
  items,
  signatures,
  signedCount,
  onSign,
  onOpenAsset,
}: {
  items: PortalAcknowledgementItem[];
  signatures: Record<string, string>;
  signedCount: number;
  onSign: (item: PortalAcknowledgementItem) => void;
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  if (items.length === 0) {
    return (
      <section
        id="portal-preview-acknowledgement"
        className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-950">Presa visione non richiesta</h4>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Per questo modulo non ci sono documenti obbligatori o quiz da firmare.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="portal-preview-acknowledgement"
      className="scroll-mt-24 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm lg:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Registro presa visione</p>
            <h4 className="mt-1 text-lg font-bold text-slate-950">Conferme richieste per questo modulo</h4>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              L'utente vede cosa deve confermare, quale documento riguarda e lo stato della firma.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
          {signedCount}/{items.length} firmate
        </Badge>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => {
          const signedAt = signatures[item.id];
          return (
            <div key={item.id} className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="font-bold text-slate-950">{item.title}</h5>
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit",
                        signedAt
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-orange-200 bg-orange-50 text-orange-700",
                      )}
                    >
                      {signedAt ? "Firmata" : "Da firmare"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.courseTitle} · {item.moduleTitle}
                    {signedAt ? ` · registrata ${signedAt}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.asset && (
                    <Button
                      variant="outline"
                      className="h-10 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => onOpenAsset(item.asset as PortalAsset)}
                    >
                      <Eye className="h-4 w-4" />
                      Apri
                    </Button>
                  )}
                  <Button
                    className={cn(
                      "h-10 gap-2",
                      signedAt
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700",
                    )}
                    onClick={() => onSign(item)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {signedAt ? "Aggiorna firma" : "Firma presa visione"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LearnerCourseCard({
  course,
  completion,
  active,
  onOpen,
}: {
  course: PortalCourse;
  completion: number;
  active: boolean;
  onOpen: () => void;
}) {
  const firstModule = course.modules[0];
  const learnerStatus = getLearnerCourseStatus(course, completion);
  const statusCopy = {
    in_corso: { label: "Riprendi", className: "bg-blue-50 text-blue-700" },
    da_iniziare: { label: "Inizia", className: "bg-orange-50 text-orange-700" },
    completati: { label: "Completato", className: "bg-emerald-50 text-emerald-700" },
    tutti: { label: "Apri", className: "bg-slate-50 text-slate-700" },
  }[learnerStatus];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={active}
      className={cn(
        "group overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        active ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200",
      )}
    >
      <div className="relative aspect-[16/8] bg-gradient-to-br from-blue-700 via-blue-600 to-orange-400 p-4 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.28),transparent_28%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <Badge className="bg-white/15 text-white hover:bg-white/15">{areaLabels[course.area]}</Badge>
            <span className="rounded-full bg-white/15 px-2 py-1 text-xs font-semibold">Sbloccato</span>
          </div>
          <div>
            <h4 className="line-clamp-2 text-lg font-bold">{course.title}</h4>
            <p className="mt-1 line-clamp-1 text-xs text-blue-50">{firstModule?.title ?? "Modulo introduttivo"}</p>
          </div>
        </div>
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-sm leading-6 text-slate-600">{course.description}</p>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={completion} className="h-2 flex-1" />
          <span className="text-xs font-bold text-slate-700">{completion}%</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{course.modules.length} moduli</span>
            <span>·</span>
            <span>{course.assets.length} materiali</span>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", statusCopy.className)}>
            {statusCopy.label}
            <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

function LearnerAssetRow({
  asset,
  course,
  active,
  onSelect,
  onOpen,
}: {
  asset: PortalAsset;
  course: PortalCourse;
  active?: boolean;
  onSelect?: () => void;
  onOpen: () => void;
}) {
  const Icon = assetIcon[asset.type];
  const isOpenable = hasAssetResource(asset);
  const isSelectable = Boolean(onSelect);

  return (
    <div
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? onSelect : undefined}
      onKeyDown={(event) => {
        if (onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-2xl border bg-white p-3 transition hover:border-blue-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        active ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-100" : "border-slate-200",
        isSelectable && "cursor-pointer",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-blue-700",
            active ? "bg-blue-100" : "bg-blue-50",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-950">{asset.title}</p>
            <Badge variant="outline" className="h-6 border-slate-200 bg-slate-50 text-[11px] text-slate-600">
              {assetTypeLabels[asset.type]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {getAssetModuleTitle(course, asset)} · {asset.duration}
          </p>
          <p className={cn("mt-0.5 truncate text-xs", isOpenable ? "text-emerald-700" : "text-orange-600")}>
            {getAssetStorageHint(asset)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1 border-blue-200 px-3 text-blue-700 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-400"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          disabled={!isOpenable}
        >
          {asset.type === "link" ? (
            <ExternalLink className="h-3.5 w-3.5" />
          ) : asset.downloadable === false || asset.content ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {isOpenable ? getAssetActionLabel(asset) : "Da collegare"}
        </Button>
      </div>
    </div>
  );
}
