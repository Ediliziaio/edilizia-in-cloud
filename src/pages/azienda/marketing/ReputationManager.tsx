import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Play,
  RefreshCw,
  Reply,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Integration } from "@/types/integrations";

type ReputationTab = "dashboard" | "richieste" | "recensioni" | "automazioni" | "integrazioni";
type ReviewSource = "Google" | "Facebook" | "Sito" | "Manuale";
type ReviewStatus = "pubblicata" | "da_rispondere" | "risposta" | "critica";
type CampaignStatus = "attiva" | "bozza" | "in_pausa" | "completata";
type Channel = "whatsapp" | "sms" | "email";
type PersistenceMode = "local" | "database";
type ReputationEventKind =
  | "request_created"
  | "request_started"
  | "campaign_paused"
  | "review_replied"
  | "critical_alert"
  | "automation_changed"
  | "link_copied"
  | "plan_generated";

interface ReputationReview {
  id: string;
  author: string;
  source: ReviewSource;
  rating: number;
  status: ReviewStatus;
  date: string;
  project: string;
  text: string;
  aiReply: string;
  sentiment: "positivo" | "neutro" | "critico";
  campaignId?: string | null;
  orderId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
}

interface ReviewCampaign {
  id: string;
  name: string;
  segment: string;
  channel: Channel;
  sent: number;
  opened: number;
  clicked: number;
  reviews: number;
  status: CampaignStatus;
  targetOrderId?: string | null;
  targetCustomerId?: string | null;
  targetLabel?: string | null;
}

interface ReputationLinkedOrder {
  id: string;
  orderCode: string;
  description: string;
  customerId: string | null;
  customerName: string;
}

interface AutomationState {
  enabled: boolean;
  trigger: string;
  delayDays: number;
  followUpAfterDays: number;
  minRatingAlert: number;
  requireApproval: boolean;
}

interface ReputationLocalState {
  campaigns: ReviewCampaign[];
  automation: AutomationState;
  reviews: ReputationReview[];
  events: ReputationEvent[];
}

interface ReputationEvent {
  id: string;
  kind: ReputationEventKind;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  tone: "info" | "success" | "warning";
}

const tabs: Array<{ value: ReputationTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "dashboard", label: "Dashboard", icon: TrendingUp },
  { value: "richieste", label: "Richieste", icon: Send },
  { value: "recensioni", label: "Recensioni", icon: Star },
  { value: "automazioni", label: "Automazioni", icon: Wand2 },
  { value: "integrazioni", label: "Integrazioni", icon: Link2 },
];

const seedReviews: ReputationReview[] = [
  {
    id: "rev-1",
    author: "Marco R.",
    source: "Google",
    rating: 5,
    status: "risposta",
    date: "2026-05-21",
    project: "Sostituzione infissi PVC",
    text: "Lavoro preciso, tecnici puntuali e cantiere lasciato pulito. Preventivo rispettato.",
    aiReply: "Grazie Marco, siamo felici che puntualita e pulizia siano arrivate fino in fondo. Restiamo a disposizione per la manutenzione.",
    sentiment: "positivo",
  },
  {
    id: "rev-2",
    author: "Giulia B.",
    source: "Facebook",
    rating: 4,
    status: "da_rispondere",
    date: "2026-05-18",
    project: "Pergola bioclimatica",
    text: "Risultato molto bello. Piccolo ritardo nella consegna, ma squadra gentile.",
    aiReply: "Grazie Giulia, ci fa piacere leggere che il risultato sia stato all'altezza. Ci scusiamo per il ritardo e abbiamo gia rivisto il controllo consegne.",
    sentiment: "neutro",
  },
  {
    id: "rev-3",
    author: "Studio Neri",
    source: "Google",
    rating: 3,
    status: "critica",
    date: "2026-05-12",
    project: "Ristrutturazione ufficio",
    text: "Buon lavoro finale, ma comunicazione non sempre chiara durante le varianti.",
    aiReply: "Grazie per il feedback. Abbiamo aperto una verifica interna sulle varianti e vi contattiamo per chiarire i punti rimasti aperti.",
    sentiment: "critico",
  },
  {
    id: "rev-4",
    author: "Laura M.",
    source: "Sito",
    rating: 5,
    status: "pubblicata",
    date: "2026-05-09",
    project: "Cappotto termico",
    text: "Ottima organizzazione, aggiornamenti continui e risultato sopra le aspettative.",
    aiReply: "Grazie Laura, il tuo feedback valorizza molto il lavoro della squadra e del referente cantiere.",
    sentiment: "positivo",
  },
];

const seedCampaigns: ReviewCampaign[] = [
  {
    id: "camp-1",
    name: "Cantieri chiusi ultimi 30 giorni",
    segment: "Clienti con commessa completata",
    channel: "whatsapp",
    sent: 42,
    opened: 38,
    clicked: 21,
    reviews: 9,
    status: "attiva",
  },
  {
    id: "camp-2",
    name: "Preventivi vinti Q2",
    segment: "Clienti nuovi",
    channel: "email",
    sent: 31,
    opened: 23,
    clicked: 12,
    reviews: 5,
    status: "completata",
  },
  {
    id: "camp-3",
    name: "Richiesta post SAL finale",
    segment: "SAL finale approvato",
    channel: "sms",
    sent: 18,
    opened: 15,
    clicked: 8,
    reviews: 2,
    status: "bozza",
  },
];

const seedEvents: ReputationEvent[] = [
  {
    id: "evt-1",
    kind: "critical_alert",
    title: "Feedback critico intercettato",
    detail: "Studio Neri ha segnalato poca chiarezza sulle varianti.",
    actor: "Regia reputazione",
    timestamp: "2026-05-12T10:30:00.000Z",
    tone: "warning",
  },
  {
    id: "evt-2",
    kind: "review_replied",
    title: "Risposta pubblica preparata",
    detail: "Marco R. - recensione Google gestita.",
    actor: "Florin Andriciuc",
    timestamp: "2026-05-21T08:45:00.000Z",
    tone: "success",
  },
  {
    id: "evt-3",
    kind: "request_started",
    title: "Campagna recensioni attiva",
    detail: "Cantieri chiusi ultimi 30 giorni - WhatsApp.",
    actor: "Automazione",
    timestamp: "2026-05-22T07:15:00.000Z",
    tone: "info",
  },
];

const defaultAutomation: AutomationState = {
  enabled: true,
  trigger: "commessa_chiusa",
  delayDays: 2,
  followUpAfterDays: 5,
  minRatingAlert: 3,
  requireApproval: true,
};

const channelLabel: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

const channelIcon: Record<Channel, ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
};

function isReputationTab(value: string | null): value is ReputationTab {
  return value === "dashboard" || value === "richieste" || value === "recensioni" || value === "automazioni" || value === "integrazioni";
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function buildPublicReviewSlug(companyName: string, companyId: string) {
  const slug = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "azienda"}-${companyId.slice(0, 8)}`;
}

function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ratingClass(rating: number) {
  if (rating >= 4.5) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (rating >= 4) return "text-sky-700 bg-sky-50 border-sky-200";
  if (rating >= 3) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function statusBadge(status: ReviewStatus | CampaignStatus) {
  const classes: Record<string, string> = {
    pubblicata: "bg-slate-100 text-slate-700 hover:bg-slate-100",
    da_rispondere: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    risposta: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
    critica: "bg-rose-100 text-rose-800 hover:bg-rose-100",
    attiva: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
    bozza: "bg-slate-100 text-slate-700 hover:bg-slate-100",
    in_pausa: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    completata: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  };
  const labels: Record<string, string> = {
    pubblicata: "Pubblicata",
    da_rispondere: "Da rispondere",
    risposta: "Risposta",
    critica: "Critica",
    attiva: "Attiva",
    bozza: "Bozza",
    in_pausa: "In pausa",
    completata: "Completata",
  };
  return <Badge className={cn("border-0", classes[status])}>{labels[status]}</Badge>;
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} stelle`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn("h-3.5 w-3.5", index < value ? "fill-amber-400 text-amber-400" : "text-slate-300")}
        />
      ))}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAutomation(value: unknown): AutomationState {
  if (!isRecord(value)) return defaultAutomation;

  const delayDays = Number(value.delayDays);
  const followUpAfterDays = Number(value.followUpAfterDays);
  const minRatingAlert = Number(value.minRatingAlert);

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultAutomation.enabled,
    trigger: typeof value.trigger === "string" ? value.trigger : defaultAutomation.trigger,
    delayDays: Number.isFinite(delayDays) ? delayDays : defaultAutomation.delayDays,
    followUpAfterDays: Number.isFinite(followUpAfterDays) ? followUpAfterDays : defaultAutomation.followUpAfterDays,
    minRatingAlert: Number.isFinite(minRatingAlert) ? minRatingAlert : defaultAutomation.minRatingAlert,
    requireApproval: typeof value.requireApproval === "boolean" ? value.requireApproval : defaultAutomation.requireApproval,
  };
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function normalizeChannel(value: string): Channel {
  return value === "sms" || value === "email" ? value : "whatsapp";
}

function normalizeCampaignStatus(value: string): CampaignStatus {
  if (value === "attiva" || value === "in_pausa" || value === "completata") return value;
  return "bozza";
}

function normalizeReviewSource(value: string): ReviewSource {
  if (value === "Google" || value === "Facebook" || value === "Manuale") return value;
  return "Sito";
}

function normalizeReviewStatus(value: string): ReviewStatus {
  if (value === "da_rispondere" || value === "risposta" || value === "critica") return value;
  return "pubblicata";
}

function normalizeSentiment(value: string): ReputationReview["sentiment"] {
  if (value === "neutro" || value === "critico") return value;
  return "positivo";
}

function normalizeEventKind(value: string): ReputationEventKind {
  if (
    value === "request_started" ||
    value === "campaign_paused" ||
    value === "review_replied" ||
    value === "critical_alert" ||
    value === "automation_changed" ||
    value === "link_copied" ||
    value === "plan_generated"
  ) {
    return value;
  }
  return "request_created";
}

function normalizeEventTone(value: string): ReputationEvent["tone"] {
  if (value === "success" || value === "warning") return value;
  return "info";
}

function isSchemaFallbackError(error: unknown) {
  const message = String(isRecord(error) && "message" in error ? error.message : error).toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("permission denied")
  );
}

function readString(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string, fallback = 0) {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function readMetadata(record: Record<string, unknown>) {
  return isRecord(record.metadata) ? record.metadata : {};
}

function makeEntityId(prefix: string) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

// Tabelle appena introdotte: finche i tipi Supabase non vengono rigenerati,
// manteniamo lo stesso pattern gia usato nel modulo Ads per fallback DB/localStorage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reputationTable = (name: string) => (supabase as any).from(name);

function mapCampaignRow(row: Record<string, unknown>): ReviewCampaign {
  return {
    id: readString(row, "id", makeEntityId("camp")),
    name: readString(row, "name", "Campagna recensioni"),
    segment: readString(row, "segment", "Clienti selezionati"),
    channel: normalizeChannel(readString(row, "channel", "whatsapp")),
    sent: readNumber(row, "sent_count"),
    opened: readNumber(row, "opened_count"),
    clicked: readNumber(row, "clicked_count"),
    reviews: readNumber(row, "review_count"),
    status: normalizeCampaignStatus(readString(row, "status", "bozza")),
    targetOrderId: readNullableString(row, "target_order_id"),
    targetCustomerId: readNullableString(row, "target_customer_id"),
    targetLabel: readNullableString(row, "target_label"),
  };
}

function mapReviewRow(row: Record<string, unknown>): ReputationReview {
  const metadata = readMetadata(row);
  return {
    id: readString(row, "id", makeEntityId("review")),
    author: readString(row, "author", "Cliente"),
    source: normalizeReviewSource(readString(row, "source", "Sito")),
    rating: Math.max(1, Math.min(5, readNumber(row, "rating", 5))),
    status: normalizeReviewStatus(readString(row, "status", "pubblicata")),
    date: readString(row, "review_date", new Date().toISOString().slice(0, 10)),
    project: readString(row, "project", "Feedback pubblico"),
    text: readString(row, "body", ""),
    aiReply: readString(row, "ai_reply", ""),
    sentiment: normalizeSentiment(readString(row, "sentiment", "positivo")),
    campaignId: readNullableString(row, "campaign_id"),
    orderId: readNullableString(row, "order_id"),
    customerId: readNullableString(row, "customer_id"),
    customerName: readNullableString(metadata, "customer_name"),
  };
}

function mapEventRow(row: Record<string, unknown>): ReputationEvent {
  return {
    id: readString(row, "id", makeEntityId("evt")),
    kind: normalizeEventKind(readString(row, "kind", "request_created")),
    title: readString(row, "title", "Evento reputazione"),
    detail: readString(row, "detail"),
    actor: readString(row, "actor", "Sistema"),
    timestamp: readString(row, "created_at", new Date().toISOString()),
    tone: normalizeEventTone(readString(row, "tone", "info")),
  };
}

function mapAutomationRow(row: Record<string, unknown>): AutomationState {
  return normalizeAutomation({
    enabled: row.enabled,
    trigger: row.trigger_key,
    delayDays: row.delay_days,
    followUpAfterDays: row.follow_up_after_days,
    minRatingAlert: row.min_rating_alert,
    requireApproval: row.require_approval,
  });
}

function loadLocalState(key: string, fallback: ReputationLocalState): ReputationLocalState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;

    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns as ReviewCampaign[] : fallback.campaigns,
      automation: normalizeAutomation(parsed.automation),
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews as ReputationReview[] : fallback.reviews,
      events: Array.isArray(parsed.events) ? parsed.events as ReputationEvent[] : fallback.events,
    };
  } catch {
    return fallback;
  }
}

export default function ReputationManager() {
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = effectiveCompany?.id ?? "local";
  const companyName = effectiveCompany?.name ?? "Demo Azienda";
  const companyNameForCopy = companyName.replace(/[.!?]+$/, "");
  const actorName = profile?.first_name || profile?.last_name
    ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
    : user?.email ?? "Utente";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<ReputationTab>(isReputationTab(requestedTab) ? requestedTab : "dashboard");
  const [reviewFilter, setReviewFilter] = useState<"tutte" | "da_rispondere" | "critiche">("tutte");
  const [reviews, setReviews] = useState<ReputationReview[]>(seedReviews);
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>(seedCampaigns);
  const [automation, setAutomation] = useState<AutomationState>(defaultAutomation);
  const [events, setEvents] = useState<ReputationEvent[]>(seedEvents);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("local");
  const [isHydrating, setIsHydrating] = useState(true);
  const [requestName, setRequestName] = useState("Clienti soddisfatti ultimo mese");
  const [requestSegment, setRequestSegment] = useState("commesse_concluse");
  const [requestChannel, setRequestChannel] = useState<Channel>("whatsapp");
  const [targetOrderId, setTargetOrderId] = useState("__none__");
  const [messageTemplate, setMessageTemplate] = useState(
    `Ciao {{nome}}, grazie per aver scelto ${companyNameForCopy}. Ti va di lasciarci una recensione? Ci aiuta a migliorare e a far conoscere il nostro lavoro.`,
  );

  const storageKey = `eic_reputation_manager_${companyId}`;
  const reviewOrigin = typeof window !== "undefined" ? window.location.origin : "https://app.ediliziaincloud.com";
  const publicReviewSlug = buildPublicReviewSlug(companyNameForCopy, companyId);
  const reviewLink = `${reviewOrigin}/review/${publicReviewSlug}?company_id=${encodeURIComponent(companyId)}`;
  const hasDatabaseCompany = isUuid(companyId);

  const { data: integrations = [] } = useQuery({
    queryKey: ["reputation-integrations", companyId],
    queryFn: async () => {
      if (!companyId || companyId === "local") return [];
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
    enabled: Boolean(companyId && companyId !== "local"),
  });

  const metaConnected = integrations.some((integration) => integration.provider === "meta" && integration.status === "connected");
  // FIX P1: era hardcoded a false → mostrava sempre "Setup richiesto" anche dopo
  // OAuth Google. Ora derivato dalle integrazioni reali (provider "google" o "google_business").
  const googleBusinessProfileReady = integrations.some(
    (integration) =>
      (integration.provider === "google" || integration.provider === "google_business" || integration.provider === "gbp") &&
      integration.status === "connected",
  );

  const { data: linkedOrders = [] } = useQuery({
    queryKey: ["reputation-linked-orders", companyId],
    queryFn: async (): Promise<ReputationLinkedOrder[]> => {
      if (!hasDatabaseCompany) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          description,
          customer_id,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        console.warn("[reputation] Impossibile caricare le commesse collegate", error);
        return [];
      }

      return (data ?? []).map((row) => {
        const order = row as unknown as {
          id: string;
          order_code: string | null;
          description: string | null;
          customer_id: string | null;
          customer?: { first_name: string | null; last_name: string | null } | null;
        };
        const customerName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ").trim();
        return {
          id: order.id,
          orderCode: order.order_code ?? "Commessa",
          description: order.description ?? "",
          customerId: order.customer_id,
          customerName: customerName || "Cliente non assegnato",
        };
      });
    },
    enabled: hasDatabaseCompany,
  });

  const selectedTargetOrder = useMemo(
    () => linkedOrders.find((order) => order.id === targetOrderId) ?? null,
    [linkedOrders, targetOrderId],
  );

  const activeReviewLink = useMemo(() => {
    const params = new URLSearchParams({ company_id: companyId });
    if (selectedTargetOrder) {
      params.set("order_id", selectedTargetOrder.id);
      params.set("project", `${selectedTargetOrder.orderCode} - ${selectedTargetOrder.description || selectedTargetOrder.customerName}`);
      if (selectedTargetOrder.customerId) params.set("customer_id", selectedTargetOrder.customerId);
    }
    return `${reviewOrigin}/review/${publicReviewSlug}?${params.toString()}`;
  }, [companyId, publicReviewSlug, reviewOrigin, selectedTargetOrder]);

  const hydrateReputationState = useCallback(async () => {
    const local = loadLocalState(storageKey, { campaigns: seedCampaigns, automation: defaultAutomation, reviews: seedReviews, events: seedEvents });
    setCampaigns(Array.isArray(local.campaigns) ? local.campaigns : seedCampaigns);
    setAutomation(normalizeAutomation(local.automation));
    setReviews(Array.isArray(local.reviews) ? local.reviews : seedReviews);
    setEvents(Array.isArray(local.events) ? local.events : seedEvents);
    setHydratedStorageKey(storageKey);

    if (!isUuid(companyId)) {
      setPersistenceMode("local");
      return;
    }

    try {
      const [campaignResult, reviewResult, eventResult, automationResult] = await Promise.all([
        reputationTable("reputation_campaigns")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        reputationTable("reputation_reviews")
          .select("*")
          .eq("company_id", companyId)
          .order("review_date", { ascending: false })
          .order("created_at", { ascending: false }),
        reputationTable("reputation_events")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(40),
        reputationTable("reputation_automation_settings")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle(),
      ]);

      // FIX P1: prima logghiamo TUTTI gli errori (diagnostica completa), poi se
      // ALMENO una query non-fallback è fallita lanciamo per attivare il fallback locale.
      const sourceErrors: Array<[string, unknown]> = [
        ["reputation_campaigns", campaignResult.error],
        ["reputation_reviews", reviewResult.error],
        ["reputation_events", eventResult.error],
        ["reputation_automation_settings", automationResult.error],
      ];
      for (const [source, err] of sourceErrors) {
        if (err && !isSchemaFallbackError(err)) {
          console.warn(`[reputation] fonte ${source} errore:`, (err as { message?: string }).message ?? err);
        }
      }
      const firstError = campaignResult.error ?? reviewResult.error ?? eventResult.error ?? automationResult.error;
      if (firstError) throw firstError;

      const dbCampaigns = Array.isArray(campaignResult.data)
        ? campaignResult.data.filter(isRecord).map(mapCampaignRow)
        : [];
      const dbReviews = Array.isArray(reviewResult.data)
        ? reviewResult.data.filter(isRecord).map(mapReviewRow)
        : [];
      const dbEvents = Array.isArray(eventResult.data)
        ? eventResult.data.filter(isRecord).map(mapEventRow)
        : [];

      setCampaigns(dbCampaigns.length ? dbCampaigns : local.campaigns);
      setReviews(dbReviews.length ? dbReviews : local.reviews);
      setEvents(dbEvents.length ? dbEvents : local.events);
      setAutomation(isRecord(automationResult.data) ? mapAutomationRow(automationResult.data) : normalizeAutomation(local.automation));
      setPersistenceMode("database");
    } catch (error) {
      if (!isSchemaFallbackError(error)) {
        console.warn("[reputation] Uso fallback locale per reputazione", error);
      }
      setPersistenceMode("local");
    } finally {
      setIsHydrating(false);
    }
  }, [companyId, storageKey]);

  useEffect(() => {
    void hydrateReputationState();
  }, [hydrateReputationState]);

  useEffect(() => {
    const syncLocalState = (event?: StorageEvent) => {
      if (event && event.key !== storageKey) return;
      void hydrateReputationState();
    };

    const syncOnFocus = () => {
      void hydrateReputationState();
    };
    window.addEventListener("storage", syncLocalState);
    window.addEventListener("focus", syncOnFocus);
    return () => {
      window.removeEventListener("storage", syncLocalState);
      window.removeEventListener("focus", syncOnFocus);
    };
  }, [hydrateReputationState, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ campaigns, automation, reviews, events }));
  }, [automation, campaigns, events, hydratedStorageKey, reviews, storageKey]);

  useEffect(() => {
    if (!hasDatabaseCompany) return;

    const ensurePublicLink = async () => {
      try {
        const { error } = await reputationTable("reputation_public_links").upsert(
          {
            company_id: companyId,
            public_slug: publicReviewSlug,
            active: true,
            settings: { source: "marketing_reputation" },
          },
          { onConflict: "company_id" },
        );
        if (error) throw error;
      } catch (error) {
        if (!isSchemaFallbackError(error)) {
          console.warn("[reputation] Link pubblico non sincronizzato", error);
        }
      }
    };

    void ensurePublicLink();
  }, [companyId, hasDatabaseCompany, publicReviewSlug]);

  useEffect(() => {
    setMessageTemplate((previous) => {
      const demoTemplate =
        "Ciao {{nome}}, grazie per aver scelto Demo Azienda. Ti va di lasciarci una recensione? Ci aiuta a migliorare e a far conoscere il nostro lavoro.";
      const previousCompanyTemplate =
        "Ciao {{nome}}, grazie per aver scelto Demo Azienda S.r.l.. Ti va di lasciarci una recensione? Ci aiuta a migliorare e a far conoscere il nostro lavoro.";
      if (previous !== demoTemplate && previous !== previousCompanyTemplate) return previous;
      return `Ciao {{nome}}, grazie per aver scelto ${companyNameForCopy}. Ti va di lasciarci una recensione? Ci aiuta a migliorare e a far conoscere il nostro lavoro.`;
    });
  }, [companyNameForCopy]);

  useEffect(() => {
    if (isReputationTab(requestedTab)) setActiveTab(requestedTab);
  }, [requestedTab]);

  const handleTabChange = (value: string) => {
    if (!isReputationTab(value)) return;
    setActiveTab(value);
    setSearchParams(value === "dashboard" ? {} : { tab: value });
  };

  const filteredReviews = useMemo(() => {
    if (reviewFilter === "da_rispondere") return reviews.filter((review) => review.status === "da_rispondere");
    if (reviewFilter === "critiche") return reviews.filter((review) => review.status === "critica" || review.rating <= 3);
    return reviews;
  }, [reviewFilter, reviews]);

  const stats = useMemo(() => {
    const totalReviews = reviews.length;
    const avgRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    const totalSent = campaigns.reduce((sum, campaign) => sum + campaign.sent, 0);
    const totalClicked = campaigns.reduce((sum, campaign) => sum + campaign.clicked, 0);
    const unanswered = reviews.filter((review) => review.status === "da_rispondere" || review.status === "critica").length;
    return {
      avgRating,
      totalReviews,
      totalSent,
      conversionRate: pct(campaigns.reduce((sum, campaign) => sum + campaign.reviews, 0), totalSent),
      clickRate: pct(totalClicked, totalSent),
      unanswered,
      positiveShare: pct(reviews.filter((review) => review.sentiment === "positivo").length, reviews.length),
    };
  }, [campaigns, reviews]);

  const canUseDatabase = persistenceMode === "database" && hasDatabaseCompany;

  const persistFallback = useCallback((error: unknown) => {
    if (!isSchemaFallbackError(error)) {
      console.warn("[reputation] Scrittura database non riuscita, continuo in locale", error);
    }
    setPersistenceMode("local");
  }, []);

  const saveEventToDatabase = useCallback(async (entry: ReputationEvent) => {
    if (!canUseDatabase) return;
    try {
      const { error } = await reputationTable("reputation_events").insert({
        id: isUuid(entry.id) ? entry.id : undefined,
        company_id: companyId,
        kind: entry.kind,
        title: entry.title,
        detail: entry.detail,
        actor: entry.actor,
        tone: entry.tone,
        created_at: entry.timestamp,
      });
      if (error) throw error;
    } catch (error) {
      persistFallback(error);
    }
  }, [canUseDatabase, companyId, persistFallback]);

  const saveCampaignToDatabase = useCallback(async (campaign: ReviewCampaign, template: string) => {
    if (!canUseDatabase) return;
    try {
      const { error } = await reputationTable("reputation_campaigns").upsert({
        id: isUuid(campaign.id) ? campaign.id : undefined,
        company_id: companyId,
        name: campaign.name,
        segment: campaign.segment,
        channel: campaign.channel,
        sent_count: campaign.sent,
        opened_count: campaign.opened,
        clicked_count: campaign.clicked,
        review_count: campaign.reviews,
        status: campaign.status,
        target_order_id: isUuid(campaign.targetOrderId ?? "") ? campaign.targetOrderId : null,
        target_customer_id: isUuid(campaign.targetCustomerId ?? "") ? campaign.targetCustomerId : null,
        target_label: campaign.targetLabel ?? null,
        message_template: template,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    } catch (error) {
      persistFallback(error);
    }
  }, [canUseDatabase, companyId, persistFallback, user?.id]);

  const updateCampaignInDatabase = useCallback(async (campaignId: string, patch: Partial<ReviewCampaign>) => {
    if (!canUseDatabase || !isUuid(campaignId)) return;
    const update: Record<string, unknown> = {};
    if (patch.status) update.status = patch.status;
    if (typeof patch.sent === "number") update.sent_count = patch.sent;
    if (typeof patch.opened === "number") update.opened_count = patch.opened;
    if (typeof patch.clicked === "number") update.clicked_count = patch.clicked;
    if (typeof patch.reviews === "number") update.review_count = patch.reviews;

    if (!Object.keys(update).length) return;

    try {
      const { error } = await reputationTable("reputation_campaigns")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", campaignId);
      if (error) throw error;
    } catch (error) {
      persistFallback(error);
    }
  }, [canUseDatabase, companyId, persistFallback]);

  const saveAutomationToDatabase = useCallback(async (next: AutomationState) => {
    if (!canUseDatabase) return;
    try {
      const { error } = await reputationTable("reputation_automation_settings").upsert(
        {
          company_id: companyId,
          enabled: next.enabled,
          trigger_key: next.trigger,
          delay_days: next.delayDays,
          follow_up_after_days: next.followUpAfterDays,
          min_rating_alert: next.minRatingAlert,
          require_approval: next.requireApproval,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
      if (error) throw error;
    } catch (error) {
      persistFallback(error);
    }
  }, [canUseDatabase, companyId, persistFallback]);

  const updateReviewInDatabase = useCallback(async (reviewId: string) => {
    if (!canUseDatabase || !isUuid(reviewId)) return;
    try {
      const { error } = await reputationTable("reputation_reviews")
        .update({
          status: "risposta",
          replied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", reviewId);
      if (error) throw error;
    } catch (error) {
      persistFallback(error);
    }
  }, [canUseDatabase, companyId, persistFallback]);

  const addEvent = (event: Omit<ReputationEvent, "id" | "timestamp" | "actor"> & { actor?: string }) => {
    const entry: ReputationEvent = {
      ...event,
      id: makeEntityId("evt"),
      actor: event.actor ?? actorName,
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [entry, ...prev].slice(0, 40));
    void saveEventToDatabase(entry);
  };

  const updateAutomation = (patch: Partial<AutomationState>, detail: string) => {
    setAutomation((prev) => {
      const next = { ...prev, ...patch };
      void saveAutomationToDatabase(next);
      return next;
    });
    addEvent({
      kind: "automation_changed",
      title: "Automazione aggiornata",
      detail,
      tone: "info",
    });
  };

  const createCampaign = () => {
    const trimmedName = requestName.trim();
    if (!trimmedName) {
      toast.error("Inserisci un nome per la richiesta recensioni.");
      return;
    }
    const trimmedTemplate = messageTemplate.trim();
    if (!trimmedTemplate) {
      toast.error("Inserisci un messaggio per la richiesta recensioni.");
      return;
    }
    // FIX P1: template senza {{nome}} = invio impersonale ("Ciao , grazie...") — UX
    // pessima. Forziamo placeholder o conferma esplicita dell'utente.
    if (!/\{\{\s*nome\s*\}\}/i.test(trimmedTemplate)) {
      toast.warning("Manca il placeholder {{nome}}", {
        description: "Il messaggio NON sarà personalizzato col nome del destinatario. Aggiungi {{nome}} dove vuoi che appaia il nome.",
        duration: 6000,
      });
      return;
    }
    if (trimmedTemplate.length < 20) {
      toast.warning("Messaggio molto corto", {
        description: "Aggiungi un ringraziamento e il motivo per cui chiedi la recensione (almeno 20 caratteri).",
      });
      return;
    }
    const targetLabel = selectedTargetOrder
      ? `${selectedTargetOrder.orderCode} - ${selectedTargetOrder.customerName}`
      : null;
    const newCampaign: ReviewCampaign = {
      id: makeEntityId("camp"),
      name: trimmedName,
      segment: requestSegment === "commesse_concluse"
        ? "Commesse concluse"
        : requestSegment === "preventivi_vinti"
          ? "Preventivi vinti"
          : "Clienti selezionati",
      channel: requestChannel,
      sent: 0,
      opened: 0,
      clicked: 0,
      reviews: 0,
      status: "bozza",
      targetOrderId: selectedTargetOrder?.id ?? null,
      targetCustomerId: selectedTargetOrder?.customerId ?? null,
      targetLabel,
    };
    setCampaigns((prev) => [newCampaign, ...prev]);
    void saveCampaignToDatabase(newCampaign, messageTemplate.trim());
    addEvent({
      kind: "request_created",
      title: "Richiesta recensioni creata",
      detail: `${newCampaign.name} - ${channelLabel[newCampaign.channel]}${targetLabel ? ` - ${targetLabel}` : ""}`,
      tone: "info",
    });
    toast.success("Richiesta recensioni creata", {
      description: "La campagna e pronta per essere avviata dalla tab Richieste.",
    });
  };

  const startCampaign = (campaignId: string) => {
    const currentCampaign = campaigns.find((campaign) => campaign.id === campaignId);
    const campaignName = currentCampaign?.name ?? "Campagna recensioni";
    const patch = {
      status: "attiva" as const,
      sent: Math.max(currentCampaign?.sent ?? 0, 12),
      opened: Math.max(currentCampaign?.opened ?? 0, 7),
      clicked: Math.max(currentCampaign?.clicked ?? 0, 3),
    };
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === campaignId
          ? {
              ...campaign,
              ...patch,
            }
          : campaign,
      ),
    );
    void updateCampaignInDatabase(campaignId, patch);
    addEvent({
      kind: "request_started",
      title: "Campagna recensioni avviata",
      detail: campaignName,
      tone: "success",
      actor: automation.enabled ? "Automazione" : actorName,
    });
    toast.success("Automazione richiesta avviata");
  };

  const pauseCampaign = (campaignId: string) => {
    const campaignName = campaigns.find((campaign) => campaign.id === campaignId)?.name ?? "Campagna recensioni";
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === campaignId
          ? {
              ...campaign,
              status: "in_pausa",
            }
          : campaign,
      ),
    );
    void updateCampaignInDatabase(campaignId, { status: "in_pausa" });
    addEvent({
      kind: "campaign_paused",
      title: "Campagna messa in pausa",
      detail: campaignName,
      tone: "warning",
    });
    toast.info("Campagna messa in pausa");
  };

  const replyToReview = (review: ReputationReview) => {
    setReviews((prev) =>
      prev.map((item) =>
        item.id === review.id
          ? {
              ...item,
              status: "risposta",
            }
          : item,
      ),
    );
    void updateReviewInDatabase(review.id);
    addEvent({
      kind: "review_replied",
      title: "Recensione gestita",
      detail: `${review.author} - ${review.source}`,
      tone: "success",
    });
    toast.success("Risposta pronta", {
      description: `Bozza AI preparata per ${review.author}.`,
    });
  };

  const copyReviewLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewLink);
      addEvent({
        kind: "link_copied",
        title: "Link pubblico copiato",
        detail: publicReviewSlug,
        tone: "info",
      });
      toast.success("Link recensione copiato");
    } catch {
      toast.error("Impossibile copiare il link", {
        description: "Seleziona il campo e copialo manualmente.",
      });
    }
  };

  const openReviewSource = (review: ReputationReview) => {
    if (review.source === "Sito") {
      window.open(reviewLink, "_blank", "noopener,noreferrer");
      addEvent({
        kind: "link_copied",
        title: "Modulo recensione aperto",
        detail: "Apertura link pubblico sito",
        tone: "info",
      });
      return;
    }

    toast.warning(`Collega ${review.source} prima di aprire la recensione sorgente.`, {
      description: "Serve l'integrazione reputazione dedicata con permessi recensioni/rating.",
    });
  };

  const generateWeeklyPlan = () => {
    addEvent({
      kind: "plan_generated",
      title: "Piano reputazione generato",
      detail: `${stats.unanswered} recensioni da gestire, ${stats.clickRate}% click richieste, ${stats.positiveShare}% sentiment positivo.`,
      tone: "success",
      actor: "Regia AI",
    });
    toast.success("Piano reputazione generato", {
      description: "Aggiunto al registro operativo.",
    });
  };

  const simulateAutomationTrigger = () => {
    if (!automation.enabled) {
      toast.error("Attiva prima l'automazione.");
      return;
    }
    const triggerLabel = automation.trigger === "commessa_chiusa"
      ? "Commessa chiusa"
      : automation.trigger === "sal_finale"
        ? "SAL finale approvato"
        : "Fattura saldata";
    const targetLabel = selectedTargetOrder
      ? `${selectedTargetOrder.orderCode} - ${selectedTargetOrder.customerName}`
      : null;
    const newCampaign: ReviewCampaign = {
      id: makeEntityId("camp"),
      name: `${triggerLabel} - richiesta automatica`,
      segment: triggerLabel,
      channel: requestChannel,
      sent: automation.requireApproval ? 0 : 6,
      opened: 0,
      clicked: 0,
      reviews: 0,
      status: automation.requireApproval ? "bozza" : "attiva",
      targetOrderId: selectedTargetOrder?.id ?? null,
      targetCustomerId: selectedTargetOrder?.customerId ?? null,
      targetLabel,
    };
    setCampaigns((prev) => [newCampaign, ...prev]);
    void saveCampaignToDatabase(newCampaign, messageTemplate.trim());
    addEvent({
      kind: "request_created",
      title: automation.requireApproval ? "Richiesta in attesa approvazione" : "Richiesta automatica inviata",
      detail: `${triggerLabel} - dopo ${automation.delayDays} giorni - ${channelLabel[requestChannel]}${targetLabel ? ` - ${targetLabel}` : ""}`,
      tone: automation.requireApproval ? "warning" : "success",
      actor: "Automazione",
    });
    toast.success(automation.requireApproval ? "Bozza automatica creata" : "Richiesta automatica simulata");
  };

  const siteReviews = reviews.filter((review) => review.source === "Sito");
  const siteRating = siteReviews.length
    ? siteReviews.reduce((sum, review) => sum + review.rating, 0) / siteReviews.length
    : 0;

  const reputationSources = [
    {
      name: "Google Business Profile",
      status: googleBusinessProfileReady ? "Collegato" : "Setup richiesto",
      connected: googleBusinessProfileReady,
      reviews: googleBusinessProfileReady ? 96 : 0,
      rating: googleBusinessProfileReady ? 4.6 : 0,
      detail: "Serve un OAuth Google Business Profile dedicato: Google Ads non basta per leggere e rispondere alle recensioni.",
      icon: BadgeCheck,
      color: "text-emerald-700",
    },
    {
      name: "Facebook Reviews",
      status: metaConnected ? "Meta base collegato" : "Setup richiesto",
      connected: false,
      reviews: 0,
      rating: 0,
      detail: metaConnected
        ? "La connessione Meta esiste, ma servono permessi review/rating dedicati prima di leggere le recensioni."
        : "Richiede connessione Meta e permessi pagina per recensioni.",
      icon: ThumbsUp,
      color: "text-sky-700",
    },
    {
      name: "Modulo recensione sito",
      status: "Attivo locale",
      connected: true,
      reviews: siteReviews.length,
      rating: siteRating,
      detail: "Raccolta feedback privati prima di invitare alla recensione pubblica.",
      icon: ShieldCheck,
      color: "text-violet-700",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-950">Reputazione</h1>
                <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  Presidio attivo
                </Badge>
                {isHydrating && (
                  <Badge variant="outline" className="gap-1.5 border-blue-200 bg-blue-50 text-blue-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sincronizzazione…
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Recensioni, richieste automatiche e risposte per {companyNameForCopy}.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
              <Settings className="mr-2 h-4 w-4" />
              Integrazioni
            </Button>
            <Button onClick={() => handleTabChange("richieste")}>
              <Send className="mr-2 h-4 w-4" />
              Chiedi recensioni
            </Button>
          </div>
        </div>
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <ShieldCheck className="h-4 w-4 text-amber-700" />
        <AlertTitle>Reputazione in configurazione</AlertTitle>
        <AlertDescription>
          Google e Facebook restano in setup finche non vengono collegati i permessi recensioni. Il link sito invece e gia testabile e salva feedback locale.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rating medio</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold">{stats.avgRating.toFixed(1)}</p>
                <StarRating value={Math.round(stats.avgRating)} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-700">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recensioni recenti</p>
              <p className="text-2xl font-semibold">{stats.totalReviews}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversione richieste</p>
              <p className="text-2xl font-semibold">{stats.conversionRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Da gestire</p>
              <p className="text-2xl font-semibold">{stats.unanswered}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border bg-white p-1.5 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="shrink-0 gap-1.5 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Stato reputazione</CardTitle>
                <CardDescription>Andamento sintetico da recensioni pubbliche, feedback privati e campagne.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  {reputationSources.map((source) => {
                    const Icon = source.icon;
                    return (
                      <div key={source.name} className="rounded-lg border bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Icon className={cn("h-5 w-5", source.color)} />
                          <Badge variant={source.connected ? "default" : "outline"} className={source.connected ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                            {source.status}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{source.name}</p>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {source.connected ? `${source.reviews} recensioni` : "Non collegato"}
                          </span>
                          {source.connected ? (
                            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", ratingClass(source.rating))}>
                              {source.rating.toFixed(1)}
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              dati non live
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Sentiment positivo</p>
                      <span className="text-sm font-semibold">{stats.positiveShare}%</span>
                    </div>
                    <Progress value={stats.positiveShare} className="h-2" indicatorClassName="bg-emerald-500" />
                    <p className="text-xs text-muted-foreground">Le recensioni critiche generano alert operativo e bozza risposta AI.</p>
                  </div>
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Click sulle richieste</p>
                      <span className="text-sm font-semibold">{stats.clickRate}%</span>
                    </div>
                    <Progress value={stats.clickRate} className="h-2" indicatorClassName="bg-sky-500" />
                    <p className="text-xs text-muted-foreground">Il link recensione migliore viene scelto in base al canale collegato.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-violet-700" />
                  <CardTitle>Regia AI</CardTitle>
                </div>
                <CardDescription>Azioni consigliate per aumentare rating e volume recensioni.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { title: "Rispondi alla recensione di Giulia B.", meta: "Impatto: risposta pubblica entro 24h" },
                  { title: "Invia follow-up a 8 clienti che hanno cliccato", meta: "Canale consigliato: WhatsApp" },
                  { title: "Apri recupero su Studio Neri", meta: "Criticita: comunicazione varianti" },
                ].map((item, index) => (
                  <div key={item.title} className="rounded-lg border p-3">
                    <div className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-semibold text-violet-700">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <Button className="w-full" variant="outline" onClick={generateWeeklyPlan}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Genera piano settimanale
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="richieste" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
          <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Nuova richiesta recensioni</CardTitle>
                  <Badge variant={persistenceMode === "database" ? "default" : "outline"} className={persistenceMode === "database" ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                    {persistenceMode === "database" ? "Database attivo" : "Cache locale"}
                  </Badge>
                </div>
                <CardDescription>Segmento, canale, commessa e messaggio con campi dinamici CRM.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="request-name">Nome</Label>
                  <Input id="request-name" value={requestName} onChange={(event) => setRequestName(event.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Segmento</Label>
                    <Select value={requestSegment} onValueChange={setRequestSegment}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commesse_concluse">Commesse concluse</SelectItem>
                        <SelectItem value="preventivi_vinti">Preventivi vinti</SelectItem>
                        <SelectItem value="manuale">Lista manuale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Canale</Label>
                    <Select value={requestChannel} onValueChange={(value) => setRequestChannel(value as Channel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Commessa o cliente</Label>
                  <Select value={targetOrderId} onValueChange={setTargetOrderId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nessun collegamento specifico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nessun collegamento specifico</SelectItem>
                      {linkedOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.orderCode} - {order.customerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Selezionando una commessa, il feedback rientra gia agganciato al lavoro e al cliente.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message-template">Messaggio</Label>
                  <Textarea id="message-template" rows={5} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Placeholder disponibili:</span>
                    <button
                      type="button"
                      onClick={() => setMessageTemplate((t) => `${t}${t.endsWith(" ") ? "" : " "}{{nome}}`)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono hover:border-orange-300 hover:bg-orange-50"
                    >
                      {`{{nome}}`}
                    </button>
                    {!/{\{\s*nome\s*\}\}/i.test(messageTemplate) && (
                      <span className="text-amber-600">⚠️ Aggiungi {`{{nome}}`} per personalizzare il messaggio</span>
                    )}
                  </div>
                </div>
                {/* MIGL: anteprima live con nome reale di un cliente in lista */}
                {(() => {
                  const sampleName = linkedOrders[0]?.customerName?.split(" ")[0] || "Marco";
                  const preview = messageTemplate.replace(/\{\{\s*nome\s*\}\}/gi, sampleName);
                  return (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Anteprima · destinatario "{sampleName}"</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{preview || <span className="text-slate-400 italic">Scrivi un messaggio per vedere l'anteprima…</span>}</p>
                    </div>
                  );
                })()}
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>AI anti-recensione forzata</AlertTitle>
                  <AlertDescription>
                    Prima chiede feedback privato ai clienti a rischio; invita alla recensione pubblica solo quando il sentiment e positivo.
                  </AlertDescription>
                </Alert>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Link inserito nel messaggio</p>
                  <p className="mt-1 break-all text-sm text-slate-700">{activeReviewLink}</p>
                </div>
                <Button className="w-full" onClick={createCampaign}>
                  <Send className="mr-2 h-4 w-4" />
                  Crea richiesta
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campagne recensioni</CardTitle>
                <CardDescription>Richieste attive, performance e conversione in recensioni pubblicate.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campagna</TableHead>
                      <TableHead>Canale</TableHead>
                      <TableHead>Invii</TableHead>
                      <TableHead>Click</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Azione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => {
                      const Icon = channelIcon[campaign.channel];
                      return (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{campaign.name}</p>
                              <p className="text-xs text-muted-foreground">{campaign.segment}</p>
                              {campaign.targetLabel && (
                                <p className="mt-1 text-xs font-medium text-slate-600">{campaign.targetLabel}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              {channelLabel[campaign.channel]}
                            </div>
                          </TableCell>
                          <TableCell>{campaign.sent}</TableCell>
                          <TableCell>{pct(campaign.clicked, campaign.sent)}%</TableCell>
                          <TableCell>{campaign.reviews}</TableCell>
                          <TableCell>{statusBadge(campaign.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {campaign.status === "attiva" ? (
                                <Button size="sm" variant="outline" onClick={() => pauseCampaign(campaign.id)}>
                                  Pausa
                                </Button>
                              ) : (
                                <Button size="sm" variant={campaign.status === "bozza" ? "default" : "outline"} onClick={() => startCampaign(campaign.id)}>
                                  <Play className="mr-1.5 h-3.5 w-3.5" />
                                  {campaign.status === "bozza" ? "Avvia" : "Rilancia"}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recensioni" className="space-y-4">
          <Card>
            <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Recensioni pubblicate</CardTitle>
                <CardDescription>Vista unica da Google, Facebook e moduli proprietari.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={reviewFilter === "tutte" ? "default" : "outline"} size="sm" onClick={() => setReviewFilter("tutte")}>
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  Tutte
                </Button>
                <Button variant={reviewFilter === "da_rispondere" ? "default" : "outline"} size="sm" onClick={() => setReviewFilter("da_rispondere")}>
                  <Reply className="mr-1.5 h-3.5 w-3.5" />
                  Da rispondere
                </Button>
                <Button variant={reviewFilter === "critiche" ? "default" : "outline"} size="sm" onClick={() => setReviewFilter("critiche")}>
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  Critiche
                </Button>
                <Button variant="outline" size="sm" onClick={() => void hydrateReputationState()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Aggiorna
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredReviews.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
                  <Star className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">Nessuna recensione in questo filtro</p>
                  <p className="mt-1 text-sm text-muted-foreground">Cambia filtro o crea una nuova richiesta recensioni.</p>
                  <Button className="mt-4" variant="outline" onClick={() => setReviewFilter("tutte")}>
                    Mostra tutte
                  </Button>
                </div>
              ) : (
                filteredReviews.map((review) => (
                  <div key={review.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">{review.author}</p>
                          <Badge variant="outline">{review.source}</Badge>
                          {statusBadge(review.status)}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <StarRating value={review.rating} />
                          <span>{new Date(review.date).toLocaleDateString("it-IT")}</span>
                          <span>{review.project}</span>
                          {review.customerName && <span>Cliente: {review.customerName}</span>}
                        </div>
                        <p className="mt-3 text-sm text-slate-700">{review.text}</p>
                        {(review.status === "da_rispondere" || review.status === "critica") && (
                          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                              <Bot className="h-4 w-4" />
                              Bozza risposta AI
                            </div>
                            <p className="mt-2 text-sm text-violet-900/80">{review.aiReply}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openReviewSource(review)}>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Apri
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const draft =
                              `Aiutami a scrivere una risposta a questa recensione su ${review.source}, ` +
                              `tono ${review.rating <= 3 ? "empatico e che riconosce il disagio" : "caldo e di ringraziamento"}, ` +
                              `firma "EdiliziaInCloud". Max 4 righe.\n\n` +
                              `Cliente: ${review.author}${review.customerName ? ` (${review.customerName})` : ""}\n` +
                              `Voto: ${review.rating}/5\n` +
                              `Lavoro: ${review.project || "n/d"}\n` +
                              `Recensione: "${review.text}"`;
                            window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
                          }}
                          className="border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100"
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          Risposta con Silvio
                        </Button>
                        {(review.status === "da_rispondere" || review.status === "critica") ? (
                          <Button size="sm" onClick={() => replyToReview(review)}>
                            <Reply className="mr-1.5 h-3.5 w-3.5" />
                            Rispondi
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Gestita
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automazioni" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Flusso automatico recensioni</CardTitle>
                <CardDescription>Invio richiesta, follow-up e alert su feedback critici.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-semibold">Automazione attiva</p>
                    <p className="text-sm text-muted-foreground">Genera richieste quando il trigger viene soddisfatto.</p>
                  </div>
                  <Switch checked={automation.enabled} onCheckedChange={(enabled) => updateAutomation({ enabled }, enabled ? "Automazione attivata" : "Automazione disattivata")} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Trigger</Label>
                    <Select value={automation.trigger} onValueChange={(trigger) => updateAutomation({ trigger }, `Trigger impostato su ${trigger}`)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commessa_chiusa">Commessa chiusa</SelectItem>
                        <SelectItem value="sal_finale">SAL finale approvato</SelectItem>
                        <SelectItem value="fattura_saldato">Fattura saldata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prima richiesta dopo</Label>
                    <Select value={String(automation.delayDays)} onValueChange={(delayDays) => updateAutomation({ delayDays: Number(delayDays) }, `Prima richiesta dopo ${delayDays} giorni`)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Subito</SelectItem>
                        <SelectItem value="1">1 giorno</SelectItem>
                        <SelectItem value="2">2 giorni</SelectItem>
                        <SelectItem value="7">7 giorni</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Follow-up dopo</Label>
                    <Select value={String(automation.followUpAfterDays)} onValueChange={(followUpAfterDays) => updateAutomation({ followUpAfterDays: Number(followUpAfterDays) }, `Follow-up dopo ${followUpAfterDays} giorni`)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 giorni</SelectItem>
                        <SelectItem value="5">5 giorni</SelectItem>
                        <SelectItem value="7">7 giorni</SelectItem>
                        <SelectItem value="14">14 giorni</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Alert sotto</Label>
                    <Select value={String(automation.minRatingAlert)} onValueChange={(minRatingAlert) => updateAutomation({ minRatingAlert: Number(minRatingAlert) }, `Alert sotto ${minRatingAlert} stelle`)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 stelle</SelectItem>
                        <SelectItem value="3">3 stelle</SelectItem>
                        <SelectItem value="4">4 stelle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-semibold">Approvazione prima dell'invio</p>
                    <p className="text-sm text-muted-foreground">Utile per clienti delicati, lavori con varianti o criticita aperte.</p>
                  </div>
                  <Switch checked={automation.requireApproval} onCheckedChange={(requireApproval) => updateAutomation({ requireApproval }, requireApproval ? "Approvazione richiesta prima dell'invio" : "Invio automatico senza approvazione")} />
                </div>
                <Button className="w-full" variant="outline" onClick={simulateAutomationTrigger}>
                  <Play className="mr-2 h-4 w-4" />
                  Simula trigger
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Registro automazioni</CardTitle>
              <CardDescription>Audit operativo: richieste, risposte, cambi automazione e alert.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {events.map((entry) => {
                  const Icon = entry.tone === "success" ? CheckCircle2 : entry.tone === "warning" ? AlertTriangle : Clock3;
                  return (
                    <div key={entry.id} className="flex gap-3 rounded-lg border p-3">
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4",
                          entry.tone === "success" && "text-emerald-600",
                          entry.tone === "warning" && "text-amber-600",
                          entry.tone === "info" && "text-sky-600",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{entry.title}</p>
                          <span className="text-[11px] text-muted-foreground">{formatEventTime(entry.timestamp)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{entry.detail}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Da: {entry.actor}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrazioni" className="space-y-4">
          <Alert className="border-amber-300 bg-amber-50">
            <Link2 className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900">Le connessioni si configurano in Impostazioni → Integrazioni</AlertTitle>
            <AlertDescription className="text-amber-800">
              Per collegare Google Business Profile e gestire l'OAuth vai alla pagina dedicata.
              Qui in Reputazione vedi solo lo stato — la configurazione effettiva è centralizzata.
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-amber-700 hover:bg-amber-800"
                  onClick={() => navigate("/azienda/impostazioni/integrazioni")}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Apri Integrazioni
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-3">
            {reputationSources.map((source) => {
              const Icon = source.icon;
              return (
                <Card key={source.name} className={cn("border-l-4", source.connected ? "border-l-emerald-500" : "border-l-slate-300")}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                          <Icon className={cn("h-5 w-5", source.color)} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <CardDescription>{source.status}</CardDescription>
                        </div>
                      </div>
                      {source.connected ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Pronto</Badge>
                      ) : (
                        <Badge variant="outline">Setup</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{source.detail}</p>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                      <span className="text-sm text-muted-foreground">Rating</span>
                      <span className="font-semibold">{source.connected ? source.rating.toFixed(1) : "N/D"}</span>
                    </div>
                    <Button
                      variant={source.connected ? "outline" : "default"}
                      className="w-full"
                      onClick={() => navigate("/azienda/impostazioni/integrazioni")}
                    >
                      {source.connected ? <ArrowUpRight className="mr-2 h-4 w-4" /> : <Settings className="mr-2 h-4 w-4" />}
                      {source.connected ? "Gestisci" : "Collega"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Link recensione pubblico</CardTitle>
              <CardDescription>Da usare in firma email, QR code, WhatsApp e post-cantiere. Slug: {publicReviewSlug}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <Input readOnly value={reviewLink} />
              <Button variant="outline" onClick={copyReviewLink}>
                <Link2 className="mr-2 h-4 w-4" />
                Copia link
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
