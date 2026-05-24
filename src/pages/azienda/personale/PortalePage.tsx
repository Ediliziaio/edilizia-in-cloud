import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
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
import {
  PORTAL_ALLOWED_MATERIAL_MIME_TYPES,
  PORTAL_MAX_MATERIAL_SIZE_BYTES,
  PORTAL_MATERIAL_ACCEPT,
  createPortalMaterialSignedUrl,
  isPortalLearningUnavailable,
  listPortalCourses,
  savePortalCourse,
  uploadPortalMaterial,
} from "@/lib/portalLearningApi";
import { cn } from "@/lib/utils";

type PortalCourseStatus = "bozza" | "pubblicato" | "revisione";
type PortalArea = "sicurezza" | "procedure" | "commerciale" | "onboarding" | "tecnica";
type PortalAudience = "tutti" | "operai" | "ufficio" | "commerciali" | "capicantiere";
type PortalAssetType = "video" | "pdf" | "procedura" | "quiz" | "link" | "testo" | "immagine" | "documento";
type LearnerCourseFilter = "tutti" | "in_corso" | "da_iniziare" | "completati";

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

const STORAGE_KEY = "eic-personale-portale-courses-v1";

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
      { id: "m1", title: "Accesso e DPI", description: "Regole minime prima di entrare in cantiere.", lessons: 4, duration: "28 min", completedRate: 82 },
      { id: "m2", title: "Rischi operativi", description: "Cadute, movimentazione carichi e procedure di emergenza.", lessons: 5, duration: "42 min", completedRate: 71 },
      { id: "m3", title: "Quiz finale", description: "Verifica interna con esito tracciabile.", lessons: 1, duration: "8 min", completedRate: 64 },
    ],
    assets: [
      {
        id: "a1",
        title: "Manuale DPI aziendale",
        type: "pdf",
        duration: "12 pagine",
        content:
          "Manuale operativo sintetico: controllo casco, scarpe antinfortunistiche, guanti, occhiali, gilet alta visibilita e verifica autorizzazioni prima dell'accesso.",
      },
      {
        id: "a2",
        title: "Video accesso cantiere",
        type: "video",
        duration: "6 min",
        downloadable: false,
        content:
          "Storyboard video demo: ingresso in cantiere, check DPI, firma presenza, identificazione area di lavoro e comunicazione al capocantiere.",
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
      { id: "m1", title: "Richiesta materiale", description: "Dal bisogno di cantiere alla richiesta interna.", lessons: 3, duration: "18 min", completedRate: 74 },
      { id: "m2", title: "Ricezione DDT", description: "Controlli, foto colli, seriali e carico magazzino.", lessons: 4, duration: "36 min", completedRate: 48 },
    ],
    assets: [
      {
        id: "a1",
        title: "Checklist ricezione merce",
        type: "procedura",
        duration: "7 step",
        content:
          "1. Verifica fornitore e ODA.\n2. Conta colli e bancali.\n3. Controlla danni visibili.\n4. Fotografa anomalie.\n5. Abbina DDT all'ordine.\n6. Carica magazzino.\n7. Segnala extra o mancanze.",
      },
      {
        id: "a2",
        title: "Template contestazione fornitore",
        type: "pdf",
        duration: "1 pagina",
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

function loadCourses(): PortalCourse[] {
  if (typeof window === "undefined") return defaultCourses;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
  if (asset.content) return "Contenuto scritto nel corso";
  return "Nessun file/link collegato";
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

export default function PortalePage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [courses, setCourses] = useState<PortalCourse[]>(loadCourses);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? "");
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"locale" | "caricamento" | "sincronizzato">("locale");
  const [activeTab, setActiveTab] = useState("preview");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<PortalArea | "tutte">("tutte");
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
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
  const [moduleDraft, setModuleDraft] = useState({
    title: "",
    description: "",
    duration: "",
    lessons: "1",
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
    return () => {
      mountedRef.current = false;
      if (saveStateRef.current.timer) {
        clearTimeout(saveStateRef.current.timer);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
    } catch {
      // La pagina deve restare utilizzabile anche se il browser blocca lo storage locale.
    }
  }, [courses]);

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
    withPortalTimeout(
      listPortalCourses(companyId),
      9_000,
      "La sincronizzazione del Portale sta impiegando troppo tempo.",
    )
      .then((remoteCourses) => {
        if (!active) return;
        setRemoteEnabled(true);
        setSyncStatus("sincronizzato");
        if (remoteCourses.length > 0) {
          setCourses(remoteCourses.map(normalizePortalCourse));
          setSelectedCourseId((current) =>
            remoteCourses.some((course) => course.id === current) ? current : remoteCourses[0]?.id ?? "",
          );
        }
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

  const persistCourse = (course: PortalCourse) => {
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

  const quality = useMemo(() => getCourseQuality(selectedCourse), [selectedCourse]);

  const createCourse = () => {
    if (!courseDraft.title.trim()) {
      toast.error("Inserisci un titolo corso.");
      return;
    }

    const newCourse: PortalCourse = {
      id: createId("course"),
      title: courseDraft.title.trim(),
      description: courseDraft.description.trim() || "Nuovo percorso formativo pronto per essere strutturato in moduli.",
      area: courseDraft.area,
      audience: courseDraft.audience,
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
    setActiveTab("builder");
    persistCourse(newCourse);
    setCourseDialogOpen(false);
    setCourseDraft({ title: "", description: "", area: "onboarding", audience: "tutti" });
    toast.success("Corso creato nel Portale.");
  };

  const createFromTemplate = (template: PortalTemplate) => {
    const newCourse = cloneTemplateCourse(template);
    setCourses((prev) => [newCourse, ...prev]);
    setSelectedCourseId(newCourse.id);
    setActiveTab("builder");
    persistCourse(newCourse);
    toast.success("Template corso creato come bozza.");
  };

  const addModule = () => {
    if (!selectedCourse) return;
    if (!moduleDraft.title.trim()) {
      toast.error("Inserisci il titolo del modulo.");
      return;
    }

    const lessons = Math.max(0, Number.parseInt(moduleDraft.lessons, 10) || 0);
    const module: PortalModule = {
      id: createId("module"),
      title: moduleDraft.title.trim(),
      description: moduleDraft.description.trim() || "Modulo pronto per lezioni, materiale e verifica.",
      lessons,
      duration: moduleDraft.duration.trim() || "Da definire",
      completedRate: 0,
    };

    const nextCourse = { ...selectedCourse, modules: [...selectedCourse.modules, module], updatedAt: "Aggiornato ora" };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
    setModuleDialogOpen(false);
    setModuleDraft({ title: "", description: "", duration: "", lessons: "1" });
    toast.success("Modulo aggiunto al percorso.");
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
    const nextCourse = { ...selectedCourse, ...patch, updatedAt: "Aggiornato ora" };
    setCourses((prev) => prev.map((course) => (course.id === selectedCourse.id ? nextCourse : course)));
    persistCourse(nextCourse);
  };

  const changeCourseStatus = (status: PortalCourseStatus) => {
    if (!selectedCourse) return false;
    if (status === "pubblicato") {
      const publishQuality = getCourseQuality(selectedCourse);
      if (publishQuality.score < 80) {
        toast.error("Corso non pronto per la pubblicazione.", {
          description: "Completa moduli, materiali e accessi prima di renderlo visibile agli utenti.",
        });
        setActiveTab("builder");
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
    if (asset.content && (contentAssetTypes.has(asset.type) || !target)) {
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-gradient-to-br from-white via-blue-50/50 to-orange-50/70 p-5 lg:grid-cols-[1.4fr_0.8fr] lg:p-6">
          <div className="flex flex-col justify-between gap-5">
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-11 gap-2 bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4" />
                    Nuovo corso
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Crea corso nel Portale</DialogTitle>
                    <DialogDescription>
                      Definisci area, pubblico e obiettivo. Potrai aggiungere moduli e materiali subito dopo.
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
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>
                      Annulla
                    </Button>
                    <Button onClick={createCourse} className="bg-blue-600 hover:bg-blue-700">
                      Crea corso
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-11 gap-2 border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                    <UploadCloud className="h-4 w-4" />
                    Carica materiale
                  </Button>
                </DialogTrigger>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="corsi" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <Library className="h-4 w-4" />
            Corsi
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <LayoutTemplate className="h-4 w-4" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="accessi" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <LockKeyhole className="h-4 w-4" />
            Accessi
          </TabsTrigger>
          <TabsTrigger value="persone" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <Users className="h-4 w-4" />
            Persone
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <UserRoundCheck className="h-4 w-4" />
            Pagina utente
          </TabsTrigger>
        </TabsList>

        {activeTab !== "preview" && (
          <PortalCommandCenter
            course={selectedCourse}
            quality={quality}
            templates={courseTemplates}
            stats={stats}
            onCreateFromTemplate={createFromTemplate}
            onOpenModule={() => setModuleDialogOpen(true)}
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
            />
          </div>
        </TabsContent>

        <TabsContent value="builder">
          <CourseBuilder
            course={selectedCourse}
            onAddAsset={() => setAssetDialogOpen(true)}
            onAddModule={() => setModuleDialogOpen(true)}
            onPublish={togglePublish}
            onMoveModule={moveModule}
            onRemoveModule={removeModule}
            onRemoveAsset={removeAsset}
            onOpenAsset={openAssetAction}
          />
        </TabsContent>

        <TabsContent value="accessi">
          <AccessPanel
            course={selectedCourse}
            onAudienceChange={(audience) => updateSelectedCourse({ audience })}
            onOpenAccess={() => setAccessDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="persone">
          <PeopleProgressPanel course={selectedCourse} courses={courses} />
        </TabsContent>

        <TabsContent value="preview">
          <PortalPreview course={selectedCourse} courses={courses} onOpenAsset={openAssetAction} />
        </TabsContent>
      </Tabs>

      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi modulo</DialogTitle>
            <DialogDescription>
              Crea uno step chiaro del percorso. Mantieni moduli brevi e verificabili.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Corso selezionato: <span className="font-semibold text-slate-900">{selectedCourse?.title}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="module-title">
                Titolo modulo
              </label>
              <Input
                id="module-title"
                value={moduleDraft.title}
                onChange={(event) => setModuleDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Es. Ricezione materiale e controllo DDT"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="module-description">
                Obiettivo
              </label>
              <Textarea
                id="module-description"
                value={moduleDraft.description}
                onChange={(event) => setModuleDraft((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Cosa deve saper fare il team dopo questo modulo."
                rows={3}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="module-lessons">
                  Lezioni
                </label>
                <Input
                  id="module-lessons"
                  inputMode="numeric"
                  value={moduleDraft.lessons}
                  onChange={(event) => setModuleDraft((prev) => ({ ...prev, lessons: event.target.value }))}
                  placeholder="Es. 4"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="module-duration">
                  Durata stimata
                </label>
                <Input
                  id="module-duration"
                  value={moduleDraft.duration}
                  onChange={(event) => setModuleDraft((prev) => ({ ...prev, duration: event.target.value }))}
                  placeholder="Es. 25 min"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={addModule} className="bg-blue-600 hover:bg-blue-700">
              Aggiungi modulo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
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
          <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
            {stats.inReview} in revisione
          </Badge>
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
                <span className={cn(check.done ? "text-slate-700" : "font-medium text-slate-900")}>{check.label}</span>
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
}: {
  course?: PortalCourse;
  onPublish: () => void;
  onDuplicate: () => void;
  onOpenAccess: () => void;
}) {
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
            <Badge variant="outline" className={statusClasses[course.status]}>
              {course.status}
            </Badge>
            <h2 className="mt-3 text-xl font-bold text-slate-950">{course.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{course.description}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <BookMarked className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <InfoTile label="Area" value={areaLabels[course.area]} icon={Building2} />
          <InfoTile label="Accesso" value={audienceLabels[course.audience]} icon={LockKeyhole} />
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
          <Button onClick={onPublish} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <CheckCircle2 className="h-4 w-4" />
            {course.status === "pubblicato" ? "Revisione" : "Pubblica"}
          </Button>
          <Button variant="outline" onClick={onOpenAccess} className="gap-2">
            <Settings2 className="h-4 w-4" />
            Accessi
          </Button>
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
}: {
  course?: PortalCourse;
  onAddAsset: () => void;
  onAddModule: () => void;
  onPublish: () => void;
  onMoveModule: (moduleId: string, direction: "up" | "down") => void;
  onRemoveModule: (moduleId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  if (!course) return null;

  const assetsByType = course.assets.reduce<Record<PortalAssetType, number>>((acc, asset) => {
    acc[asset.type] = (acc[asset.type] ?? 0) + 1;
    return acc;
  }, {} as Record<PortalAssetType, number>);
  const unlinkedAssetCount = course.assets.filter((asset) => !asset.moduleId).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Builder contenuti</h2>
            <p className="text-sm text-slate-500">
              Struttura moduli, materiali e checklist prima della pubblicazione.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onAddModule} className="gap-2">
              <Plus className="h-4 w-4" />
              Modulo
            </Button>
            <Button variant="outline" onClick={onAddAsset} className="gap-2">
              <UploadCloud className="h-4 w-4" />
              Materiale
            </Button>
            <Button onClick={onPublish} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <CheckCircle2 className="h-4 w-4" />
              Pubblica
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <BuilderStep icon={ListChecks} label={`${course.modules.length} moduli`} />
          <BuilderStep icon={FileArchive} label={`${course.assets.length} materiali`} />
          <BuilderStep icon={Video} label={`${assetsByType.video ?? 0} video`} />
          <BuilderStep icon={FileText} label={`${(assetsByType.pdf ?? 0) + (assetsByType.documento ?? 0)} documenti`} />
        </div>

        <div className="grid gap-3">
          {course.modules.map((module, index) => {
            const moduleAssets = course.assets.filter((asset) => asset.moduleId === module.id);
            return (
            <div key={module.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modulo {index + 1}</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{module.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{module.description}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <BuilderStep icon={Video} label={`${module.lessons} lezioni`} />
                    <BuilderStep icon={Clock3} label={module.duration} />
                    <BuilderStep icon={FileArchive} label={`${moduleAssets.length} materiali`} />
                  </div>
                  <div className="mt-4 rounded-xl border border-white bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contenuti modulo</p>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-700" onClick={onAddAsset}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Aggiungi
                      </Button>
                    </div>
                    {moduleAssets.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {moduleAssets.map((asset) => {
                          const Icon = assetIcon[asset.type];
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => onOpenAsset(asset)}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => onMoveModule(module.id, "up")}
                    aria-label="Sposta modulo su"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === course.modules.length - 1}
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
        <div className="space-y-3">
          {unlinkedAssetCount > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              {unlinkedAssetCount} materiale/i generali non collegati a un modulo. Collegarli rende piu chiara la vista utente.
            </div>
          )}
          {course.assets.map((asset) => {
            const Icon = assetIcon[asset.type];
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
                    className="h-7 shrink-0 gap-1 px-2 text-xs text-blue-700"
                    onClick={() => onOpenAsset(asset)}
                  >
                    {asset.type === "link" ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : asset.downloadable === false ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {getAssetActionLabel(asset)}
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

function AccessPanel({
  course,
  onAudienceChange,
  onOpenAccess,
}: {
  course?: PortalCourse;
  onAudienceChange: (audience: PortalAudience) => void;
  onOpenAccess: () => void;
}) {
  if (!course) return null;

  const groups: Array<{ key: PortalAudience; label: string; people: number; note: string }> = [
    { key: "tutti", label: "Tutta azienda", people: 58, note: "Team interno completo" },
    { key: "operai", label: "Operai", people: 38, note: "Accesso mobile cantiere" },
    { key: "ufficio", label: "Ufficio", people: 12, note: "Amministrazione e back office" },
    { key: "commerciali", label: "Commerciali", people: 6, note: "Vendita e sopralluoghi" },
    { key: "capicantiere", label: "Capicantiere", people: 8, note: "Responsabili operativi" },
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
                <p className="mt-1 text-sm text-slate-500">{group.people} persone · {group.note}</p>
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

function PeopleProgressPanel({ course, courses }: { course?: PortalCourse; courses: PortalCourse[] }) {
  if (!course) return null;

  const people = [
    { name: "Marco Bianchi", role: "Capocantiere", group: "Cantieri", progress: Math.min(100, course.completion + 14), status: "In regola", due: "Completato oggi" },
    { name: "Sara Conti", role: "Ufficio acquisti", group: "Ufficio", progress: Math.max(12, course.completion - 18), status: "Da completare", due: "Scade tra 5 giorni" },
    { name: "Luca Ferri", role: "Commerciale", group: "Vendita", progress: Math.max(0, course.completion - 31), status: "In ritardo", due: "Scaduto ieri" },
    { name: "Giulia Rizzi", role: "Amministrazione", group: "Back office", progress: Math.min(100, course.completion + 5), status: "In corso", due: "Scade tra 12 giorni" },
  ];

  const mandatoryCourses = courses.filter((item) => item.area === "sicurezza" || item.area === "procedure");

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
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => toast.success("Reminder programmabile pronto per la prossima fase operativa.")}
          >
            <CalendarClock className="h-4 w-4" />
            Programma reminder
          </Button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[1.1fr_0.8fr_1fr_0.8fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Persona</span>
            <span>Gruppo</span>
            <span>Avanzamento</span>
            <span>Stato</span>
          </div>
          <div className="divide-y divide-slate-100">
            {people.map((person) => (
              <div key={person.name} className="grid gap-3 px-4 py-4 md:grid-cols-[1.1fr_0.8fr_1fr_0.8fr] md:items-center md:gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{person.name}</p>
                  <p className="text-sm text-slate-500">{person.role}</p>
                </div>
                <Badge variant="outline" className="w-fit bg-white">
                  {person.group}
                </Badge>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{person.progress}%</span>
                    <span>{person.due}</span>
                  </div>
                  <Progress value={person.progress} className="h-2" />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit",
                    person.status === "In ritardo"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : person.status === "In regola"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-blue-200 bg-blue-50 text-blue-700",
                  )}
                >
                  {person.status}
                </Badge>
              </div>
            ))}
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
  onOpenAsset,
}: {
  course?: PortalCourse;
  courses: PortalCourse[];
  onOpenAsset: (asset: PortalAsset) => void;
}) {
  const learnerCourses = useMemo(() => {
    const visibleCourses = courses.filter((item) => item.status === "pubblicato");
    return visibleCourses.length > 0 ? visibleCourses : courses;
  }, [courses]);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [learnerFilter, setLearnerFilter] = useState<LearnerCourseFilter>("tutti");
  const [learnerCourseId, setLearnerCourseId] = useState(course?.id ?? learnerCourses[0]?.id ?? "");
  const [completedPreviewModules, setCompletedPreviewModules] = useState<Record<string, boolean>>({});
  const activeLearnerCourse =
    learnerCourses.find((item) => item.id === learnerCourseId) ?? learnerCourses[0] ?? course;
  const [activeModuleId, setActiveModuleId] = useState(activeLearnerCourse?.modules[0]?.id ?? "");
  const activeModule = activeLearnerCourse?.modules.find((module) => module.id === activeModuleId)
    ?? activeLearnerCourse?.modules[0];
  const getPreviewModuleCompletion = (module: PortalModule, courseId = activeLearnerCourse?.id ?? "") =>
    completedPreviewModules[`${courseId}:${module.id}`] ? 100 : module.completedRate;
  const previewCourseCompletion = activeLearnerCourse?.modules.length
    ? Math.round(
        activeLearnerCourse.modules.reduce(
          (sum, module) => sum + getPreviewModuleCompletion(module, activeLearnerCourse.id),
          0,
        ) / activeLearnerCourse.modules.length,
      )
    : activeLearnerCourse?.completion ?? 0;
  const isActiveModuleCompleted = activeModule ? getPreviewModuleCompletion(activeModule) >= 100 : false;
  const isPreviewCourseCompleted = activeLearnerCourse?.modules.length
    ? activeLearnerCourse.modules.every((module) => getPreviewModuleCompletion(module, activeLearnerCourse.id) >= 100)
    : false;
  const courseAssets = activeLearnerCourse?.assets ?? [];
  const moduleAssets = activeModule
    ? courseAssets.filter((asset) => !asset.moduleId || asset.moduleId === activeModule.id)
    : courseAssets;
  const nextModuleIndex = activeLearnerCourse?.modules.findIndex((module) => module.id === activeModule?.id) ?? 0;
  const nextModule = activeLearnerCourse?.modules[nextModuleIndex + 1];
  const filteredLearnerCourses = useMemo(() => {
    const normalized = learnerSearch.trim().toLowerCase();
    return learnerCourses.filter((item) => {
      const completion = item.id === activeLearnerCourse?.id ? previewCourseCompletion : item.completion;
      const matchesFilter = learnerFilter === "tutti" || getLearnerCourseStatus(item, completion) === learnerFilter;
      const matchesSearch =
        !normalized ||
        item.title.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized) ||
        areaLabels[item.area].toLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [activeLearnerCourse?.id, learnerCourses, learnerFilter, learnerSearch, previewCourseCompletion]);
  const unlockedLessons = learnerCourses.reduce((sum, item) => sum + item.modules.reduce((moduleSum, module) => moduleSum + module.lessons, 0), 0);
  const unlockedAssets = learnerCourses.reduce((sum, item) => sum + item.assets.length, 0);
  const completedCourses = learnerCourses.filter((item) => {
    const completion = item.id === activeLearnerCourse?.id ? previewCourseCompletion : item.completion;
    return completion >= 100;
  }).length;

  const scrollToPreviewSection = (elementId: string) => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const completeActiveModule = () => {
    if (!activeLearnerCourse || !activeModule) return;
    const willCompleteCourse = activeLearnerCourse.modules.every((module) =>
      module.id === activeModule.id || getPreviewModuleCompletion(module, activeLearnerCourse.id) >= 100,
    );
    setCompletedPreviewModules((prev) => ({
      ...prev,
      [`${activeLearnerCourse.id}:${activeModule.id}`]: true,
    }));
    toast.success(
      willCompleteCourse
        ? "Corso completato nella preview utente."
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
    if (!activeLearnerCourse) return;
    const hasModule = activeLearnerCourse.modules.some((module) => module.id === activeModuleId);
    if (!hasModule) {
      setActiveModuleId(activeLearnerCourse.modules[0]?.id ?? "");
    }
  }, [activeLearnerCourse, activeModuleId]);

  if (!activeLearnerCourse) return null;

  return (
    <section className="space-y-5">
      <div className="sticky top-2 z-10 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">Demo Azienda Academy</p>
              <p className="truncate text-xs text-slate-500">Area utente · corsi, procedure, materiali e attestati</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={learnerSearch}
                onChange={(event) => setLearnerSearch(event.target.value)}
                className="h-10 rounded-2xl border-slate-200 pl-9 text-base sm:text-sm"
                placeholder="Cerca corsi, manuali o procedure"
              />
            </div>
            <Button
              variant="outline"
              className="h-10 gap-2 rounded-2xl border-blue-200 text-blue-700"
              onClick={() => scrollToPreviewSection("portal-preview-materials")}
            >
              <Download className="h-4 w-4" />
              Materiali
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 p-5 text-white lg:grid-cols-[minmax(0,1.1fr)_360px] lg:p-6">
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Vista utente reale</Badge>
                <Badge className="border-emerald-300/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/15">
                  {learnerCourses.length} corsi sbloccati
                </Badge>
              </div>
              <h2 className="mt-4 max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">
                La persona entra qui e vede solo i corsi a cui ha accesso.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">
                Questa non è la schermata di gestione: è la libreria operativa che vedrà l'utente finale. Da qui può
                aprire un corso, continuare una lezione, scaricare materiali e completare moduli.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <LearnerMetric label="Lezioni" value={String(unlockedLessons)} icon={Video} />
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
              onClick={() => scrollToPreviewSection("portal-preview-player")}
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
              L'utente vede questa griglia a tutta pagina: corsi pubblicati, progresso e prossimo passo.
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
                onClick={() => setLearnerFilter(filter.value)}
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
              completion={item.id === activeLearnerCourse.id ? previewCourseCompletion : item.completion}
              active={item.id === activeLearnerCourse.id}
              onOpen={() => {
                setLearnerCourseId(item.id);
                setActiveModuleId(item.modules[0]?.id ?? "");
                toast.success(`Corso aperto: ${item.title}`);
              }}
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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-white via-blue-50 to-orange-50 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    {areaLabels[activeLearnerCourse.area]}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Sbloccato
                  </Badge>
                  <Badge variant="outline">{audienceLabels[activeLearnerCourse.audience]}</Badge>
                </div>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{activeLearnerCourse.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{activeLearnerCourse.description}</p>
              </div>
              <Button
                className="h-11 shrink-0 gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={() => scrollToPreviewSection("portal-preview-player")}
              >
                <PlayCircle className="h-4 w-4" />
                Avvia lezione
              </Button>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-4">
              <div id="portal-preview-player" className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-sm">
                <div className="flex aspect-video min-h-[260px] flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.35),transparent_35%),linear-gradient(135deg,#0f172a,#1d4ed8)] p-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                    {isActiveModuleCompleted ? <CheckCircle2 className="h-9 w-9" /> : <PlayCircle className="h-9 w-9" />}
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-blue-100">Lezione corrente</p>
                  <h4 className="mt-1 max-w-2xl text-2xl font-bold">{activeModule?.title ?? "Modulo introduttivo"}</h4>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
                    {activeModule?.description ?? "Seleziona un modulo per vedere contenuti, materiali e avanzamento."}
                  </p>
                </div>
                <div className="flex flex-col gap-3 border-t border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2 text-xs text-blue-100">
                    <span className="rounded-full bg-white/10 px-3 py-1">{activeModule?.duration ?? "Da definire"}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{activeModule?.lessons ?? 0} lezioni</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{moduleAssets.length} materiali</span>
                    {isActiveModuleCompleted && (
                      <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-100">Completata</span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="bg-white text-blue-800 hover:bg-blue-50"
                    onClick={completeActiveModule}
                    disabled={isActiveModuleCompleted}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isActiveModuleCompleted ? "Lezione completata" : "Completa lezione"}
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-slate-950">Programma del corso</h4>
                    <p className="text-sm text-slate-500">Ogni modulo è cliccabile e mostra contenuti e materiali.</p>
                  </div>
                  <Badge variant="outline">{activeLearnerCourse.modules.length} moduli</Badge>
                </div>
                <div className="space-y-3">
                  {activeLearnerCourse.modules.map((module, index) => (
                    (() => {
                      const previewRate = getPreviewModuleCompletion(module, activeLearnerCourse.id);
                      return (
                    <button
                      key={module.id}
                      type="button"
                      className={cn(
                        "flex w-full gap-3 rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                        module.id === activeModule?.id ? "border-blue-300 bg-blue-50 ring-1 ring-blue-100" : "border-slate-200 bg-white",
                      )}
                      onClick={() => setActiveModuleId(module.id)}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                          previewRate >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700",
                        )}
                      >
                        {previewRate >= 100 ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-slate-950">{module.title}</p>
                          <span className="text-xs font-medium text-slate-500">{module.duration}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{module.description}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <Progress value={previewRate} className="h-2 flex-1" />
                          <span className="w-10 text-right text-xs font-bold text-slate-600">{previewRate}%</span>
                        </div>
                      </div>
                    </button>
                      );
                    })()
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="font-bold text-slate-950">Il tuo avanzamento</h4>
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-4xl font-bold text-slate-950">{previewCourseCompletion}%</span>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    In corso
                  </Badge>
                </div>
                <Progress value={previewCourseCompletion} className="mt-4 h-2" />
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <InfoTile label="Moduli" value={String(activeLearnerCourse.modules.length)} icon={ListChecks} />
                  <InfoTile label="Materiali" value={String(courseAssets.length)} icon={FileArchive} />
                </div>
              </div>

              <div id="portal-preview-materials" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-950">Materiali del modulo</h4>
                    <p className="text-sm text-slate-500">Download e risorse autorizzate.</p>
                  </div>
                  <Download className="h-5 w-5 text-blue-600" />
                </div>
                <div className="space-y-3">
                  {moduleAssets.map((asset) => (
                    <LearnerAssetRow
                      key={asset.id}
                      asset={asset}
                      course={activeLearnerCourse}
                      onOpen={() => onOpenAsset(asset)}
                    />
                  ))}
                  {moduleAssets.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                      Nessun materiale per questo modulo.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
                <h4 className="font-bold text-orange-950">Prossimo passo</h4>
                <p className="mt-2 text-sm leading-6 text-orange-900">
                  {nextModule ? `Dopo questa lezione continua con: ${nextModule.title}.` : "Completa il quiz finale e scarica l'attestato interno."}
                </p>
                {nextModule && (
                  <Button
                    variant="outline"
                    className="mt-3 h-9 w-full border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
                    onClick={() => {
                      setActiveModuleId(nextModule.id);
                      scrollToPreviewSection("portal-preview-player");
                    }}
                  >
                    Apri prossimo modulo
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <h4 className="font-bold text-emerald-950">Attestato interno</h4>
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  Disponibile automaticamente al completamento del corso. L'azienda conserva storico, data e presa visione.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 h-9 w-full border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100"
                  onClick={() =>
                    isPreviewCourseCompleted
                      ? toast.success("Attestato interno disponibile nella preview.")
                      : toast.info("Completa tutti i moduli per sbloccare l'attestato.")
                  }
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Vedi attestato
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </section>
  );
}

function LearnerMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Video }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-medium text-blue-100">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
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
  onOpen,
}: {
  asset: PortalAsset;
  course: PortalCourse;
  onOpen: () => void;
}) {
  const Icon = assetIcon[asset.type];

  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-950">{asset.title}</p>
          <p className="text-xs text-slate-500">
            {getAssetModuleTitle(course, asset)} · {asset.duration}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{getAssetStorageHint(asset)}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 h-9 w-full gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
        onClick={onOpen}
      >
        {asset.type === "link" ? (
          <ExternalLink className="h-3.5 w-3.5" />
        ) : asset.downloadable === false ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {getAssetActionLabel(asset)}
      </Button>
    </div>
  );
}
