import { useState, useCallback, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useURLFilters } from "@/hooks/useURLFilters";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Search, Upload, Plus, Download, Filter, ArrowUpDown, Settings2, ChevronDown, MoreHorizontal, Loader2, ChevronLeft, ChevronRight, ContactRound, AlertTriangle, CheckCircle2, ShieldCheck, MailWarning, UserRoundCheck, Sparkles, ExternalLink, Mail, Phone, Building2, CalendarClock, Copy, PanelRightOpen, Radar } from "lucide-react";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { ContactsTable, type MarketingContact, type SortField, type SortDirection, loadVisibleColumns, saveVisibleColumns, getStorageKey } from "@/components/marketing/ContactsTable";
import { getInitials, getAvatarColor, formatContactDate } from "@/lib/contactUtils";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { cleanPhone } from "@/lib/contactUtils";
import { ContactDialog, type ContactFormData } from "@/components/marketing/ContactDialog";
import { ContactListsView } from "@/components/marketing/ContactListsView";
import { AddToListDropdown } from "@/components/marketing/AddToListDropdown";
import { BulkTagsDialog, BulkCreateOpportunitiesDialog } from "@/components/contacts/BulkContactActions";
import { BulkEnrollAutomationDropdown } from "@/components/marketing/BulkEnrollAutomationDropdown";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { syncTagsToOpportunities, removeTagFromOpportunities } from "@/hooks/useTagSync";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import { ContactFieldsSheet } from "@/components/marketing/ContactFieldsSheet";
import { ContactFiltersSheet, type ContactFilters, type FilterRule, type FilterGroup, EMPTY_CONTACT_FILTERS, countActiveContactFilters, type PipelineWithStages } from "@/components/marketing/ContactFiltersSheet";
import { usePermissions } from "@/hooks/usePermissions";
import { queryKeys } from "@/lib/queryKeys";
import {
  buildContactDateRange,
  normalizeContactsUrlState,
  sanitizeContactSearchTerm,
  toggleContactsPageSelection,
  type ContactsTab,
} from "@/lib/marketingContacts";
import { getAddedTags, getRemovedTags, normalizeTagList } from "@/lib/marketingTags";

// Map filter field keys to actual DB columns
const FIELD_TO_COLUMN: Record<string, string> = {
  name: "first_name", // special handling
  email: "email",
  phone: "phone",
  company_name: "company_name",
  source: "source",
  city: "city",
  province: "province",
  region: "region",
  created_at: "created_at",
  last_activity_at: "last_activity_at",
  attr_source: "attr_source",
  attr_campaign: "attr_campaign",
};

function applyRuleToQuery(query: any, rule: FilterRule) {
  const column = FIELD_TO_COLUMN[rule.field];
  if (!column) return query;

  const isName = rule.field === "name";
  const isDate = rule.field === "created_at" || rule.field === "last_activity_at";
  const value = sanitizeContactSearchTerm(rule.value);
  const dateRange = isDate ? buildContactDateRange(value) : null;

  switch (rule.operator) {
    case "is":
      if (isDate) {
        if (!dateRange) return query;
        return query.gte(column, dateRange.start).lt(column, dateRange.endExclusive);
      }
      if (isName) {
        const n = `%${value}%`;
        return query.or(`first_name.ilike.${n},last_name.ilike.${n}`);
      }
      return query.ilike(column, `%${value}%`);
    case "is_not":
      if (isDate) {
        if (!dateRange) return query;
        return query.or(`${column}.lt.${dateRange.start},${column}.gte.${dateRange.endExclusive},${column}.is.null`);
      }
      if (isName) {
        const n = `%${value}%`;
        return query.not("first_name", "ilike", n).not("last_name", "ilike", n);
      }
      return query.not(column, "ilike", `%${value}%`);
    case "is_empty":
      if (isDate) return query.is(column, null);
      return query.or(`${column}.is.null,${column}.eq.`);
    case "is_not_empty":
      if (isDate) return query.not(column, "is", null);
      return query.not(column, "is", null).neq(column, "");
    default:
      return query;
  }
}

const CSV_FIELDS: ImportField[] = [
  { key: "first_name", label: "Nome", required: true },
  { key: "last_name", label: "Cognome", required: false },
  { key: "fullname", label: "Nome Completo", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "email", label: "Email", required: false, type: "email" },
  { key: "company_name", label: "Azienda", required: false },
  { key: "city", label: "Città", required: false },
  { key: "province", label: "Provincia", required: false },
  { key: "tags", label: "Tag", required: false },
  { key: "notes", label: "Note", required: false },
  { key: "source", label: "Fonte", required: false },
];

const QUALITY_FILTERS = [
  { value: "all", label: "Tutti", description: "Vista completa" },
  { value: "issues", label: "Da sistemare", description: "Dati incompleti o rischi marketing" },
  { value: "no_contact", label: "Non contattabili", description: "Né email né telefono" },
  { value: "missing_email", label: "Senza email", description: "Email mancante" },
  { value: "missing_phone", label: "Senza telefono", description: "Telefono mancante" },
  { value: "no_source", label: "Senza fonte", description: "Origine lead non tracciata" },
  { value: "optout", label: "No marketing", description: "Opt-out o unsubscribe" },
  { value: "stale", label: "Da ricontattare", description: "Attività vecchia o assente" },
] as const;

// Valori accettati da ?qualita= ma senza pillola dedicata:
// - missing_contact: vecchi deep-link (email O telefono mancante)
// - has_email / has_phone / contactable: attivati dalle chip "Contattabilità"
const EXTRA_QUALITY_FILTERS = ["missing_contact", "has_email", "has_phone", "contactable"] as const;

type ContactQualityFilter =
  | (typeof QUALITY_FILTERS)[number]["value"]
  | (typeof EXTRA_QUALITY_FILTERS)[number];

type ContactQualityIssue = {
  key: string;
  label: string;
  tone: "amber" | "red" | "blue";
};

function isQualityFilter(value: string): value is ContactQualityFilter {
  return (
    QUALITY_FILTERS.some((filter) => filter.value === value) ||
    (EXTRA_QUALITY_FILTERS as readonly string[]).includes(value)
  );
}

// Applica il filtro qualità/contattabilità alla query PostgREST.
// Unica fonte di verità per lista, export e conteggi globali: la logica
// deve restare identica nei tre punti. NB: due .or() concatenati vengono
// ANDati da PostgREST (parametri or= ripetuti), è il modo per esprimere
// "manca email E manca telefono".
function applyQualityToQuery(query: any, quality: ContactQualityFilter) {
  switch (quality) {
    case "issues":
      return query.or("email.is.null,email.eq.,phone.is.null,phone.eq.,source.is.null,source.eq.,unsubscribed.eq.true,optout_email.eq.true,opt_out.eq.true,last_activity_at.is.null");
    case "missing_contact":
      return query.or("email.is.null,email.eq.,phone.is.null,phone.eq.");
    case "no_contact":
      return query.or("email.is.null,email.eq.").or("phone.is.null,phone.eq.");
    case "missing_email":
      return query.or("email.is.null,email.eq.");
    case "missing_phone":
      return query.or("phone.is.null,phone.eq.");
    case "has_email":
      return query.not("email", "is", null).neq("email", "");
    case "has_phone":
      return query.not("phone", "is", null).neq("phone", "");
    case "contactable":
      return query.or("and(email.not.is.null,email.neq.),and(phone.not.is.null,phone.neq.)");
    case "no_source":
      return query.or("source.is.null,source.eq.");
    case "optout":
      return query.or("unsubscribed.eq.true,optout_email.eq.true,opt_out.eq.true");
    case "stale": {
      const cutoff = new Date(Date.now() - getStaleThresholdMs()).toISOString();
      return query.or(`last_activity_at.is.null,last_activity_at.lte.${cutoff}`);
    }
    default:
      return query;
  }
}

function hasText(value: string | null | undefined) {
  return !!value?.trim();
}

function getContactName(contact: MarketingContact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "Contatto senza nome";
}

function isMarketingOptedOut(contact: MarketingContact) {
  return Boolean(contact.unsubscribed || contact.opt_out || contact.optout_email);
}

/**
 * Soglia "contatto da ricontattare". Letta da localStorage così l'utente
 * può personalizzarla (es. agenzia con cicli vendita lunghi → 168h = 7 giorni;
 * call-center caldo → 24h). Default storico: 48h.
 *
 * 2026-05-27 (perfezione iter 10): prima hardcoded 48h. Ora configurabile
 * via setting `marketing.stale_hours` (numero intero ore, 1-720).
 */
const DEFAULT_STALE_HOURS = 48;
const STALE_HOURS_STORAGE_KEY = "marketing.stale_hours";

function getStaleThresholdMs(): number {
  if (typeof window === "undefined") return DEFAULT_STALE_HOURS * 60 * 60 * 1000;
  const raw = window.localStorage.getItem(STALE_HOURS_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const hours = Number.isFinite(parsed) && parsed >= 1 && parsed <= 720 ? parsed : DEFAULT_STALE_HOURS;
  return hours * 60 * 60 * 1000;
}

function isStaleContact(contact: MarketingContact, thresholdMs = getStaleThresholdMs()) {
  const referenceDate = contact.last_activity_at || contact.created_at;
  if (!referenceDate) return true;
  const timestamp = new Date(referenceDate).getTime();
  if (Number.isNaN(timestamp)) return true;
  return Date.now() - timestamp > thresholdMs;
}

function getContactQualityIssues(contact: MarketingContact, duplicateKeys = new Set<string>()): ContactQualityIssue[] {
  const issues: ContactQualityIssue[] = [];
  const duplicateEmail = contact.email ? duplicateKeys.has(`email:${contact.email.trim().toLowerCase()}`) : false;
  const duplicatePhone = contact.phone ? duplicateKeys.has(`phone:${cleanPhone(contact.phone)}`) : false;

  if (!hasText(contact.email) && !hasText(contact.phone)) {
    issues.push({ key: "missing_contact", label: "Senza recapiti", tone: "red" });
  } else if (!hasText(contact.email)) {
    issues.push({ key: "missing_email", label: "Email mancante", tone: "amber" });
  } else if (!hasText(contact.phone)) {
    issues.push({ key: "missing_phone", label: "Telefono mancante", tone: "amber" });
  }

  if (!hasText(contact.source)) {
    issues.push({ key: "no_source", label: "Fonte assente", tone: "amber" });
  }

  if (isMarketingOptedOut(contact)) {
    issues.push({ key: "optout", label: "No marketing", tone: "red" });
  }

  if (isStaleContact(contact)) {
    issues.push({ key: "stale", label: "Da ricontattare", tone: "blue" });
  }

  if (duplicateEmail || duplicatePhone) {
    issues.push({ key: "duplicate", label: "Possibile duplicato", tone: "amber" });
  }

  return issues;
}

function issueClasses(tone: ContactQualityIssue["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function ContactProfileDrawer({
  contact,
  companyId,
  open,
  onOpenChange,
  onEdit,
  canEdit,
}: {
  contact: MarketingContact | null;
  companyId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: MarketingContact) => void;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const fullName = contact ? getContactName(contact) : "";
  const issues = contact ? getContactQualityIssues(contact) : [];
  const primaryScore = contact?.ai_score ?? contact?.lead_score ?? contact?.score ?? null;
  const hasMarketingBlock = contact ? isMarketingOptedOut(contact) : false;

  const { data: listNames = [], isLoading: listsLoading } = useQuery({
    queryKey: ["marketing-contact-profile-lists", companyId, contact?.id],
    enabled: open && !!companyId && !!contact?.id,
    queryFn: async () => {
      if (!companyId || !contact?.id) return [];
      const { data: members, error } = await supabase
        .from("marketing_contact_list_members")
        .select("list_id")
        .eq("contact_id", contact.id);
      if (error) throw error;
      const listIds = [...new Set((members || []).map((member) => member.list_id).filter(Boolean))];
      if (listIds.length === 0) return [];
      const { data: lists, error: listsError } = await supabase
        .from("marketing_contact_lists")
        .select("id, name")
        .eq("company_id", companyId)
        .in("id", listIds);
      if (listsError) throw listsError;
      return (lists || []).map((list) => list.name);
    },
    staleTime: 2 * 60 * 1000,
  });

  const copyValue = async (value: string | null | undefined, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiato`);
    } catch {
      toast.error("Non riesco a copiare negli appunti");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {contact && (
          <>
            <SheetHeader className="border-b bg-gradient-to-br from-white via-orange-50/40 to-amber-50 px-6 py-5">
              <div className="flex items-start gap-4 pr-8">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white ${getAvatarColor(fullName)}`}>
                  {getInitials(contact.first_name, contact.last_name || "")}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-xl">{fullName}</SheetTitle>
                  <SheetDescription className="mt-1 truncate">
                    {contact.company_name || contact.source || "Contatto marketing"}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {primaryScore !== null && (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Score {primaryScore}</Badge>
                    )}
                    {contact.opp_status === "open" && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Opportunità aperta</Badge>}
                    {hasMarketingBlock && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Marketing bloccato</Badge>}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => copyValue(contact.email, "Email")}
                >
                  <Mail className="h-4 w-4 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Email</p>
                    <p className="truncate text-sm font-medium">{contact.email || "Non presente"}</p>
                  </div>
                  {contact.email && <Copy className="ml-auto h-3.5 w-3.5 text-slate-400" />}
                </button>
                <button
                  type="button"
                  className="flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => copyValue(contact.phone, "Telefono")}
                >
                  <Phone className="h-4 w-4 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Telefono</p>
                    <p className="truncate text-sm font-medium">{contact.phone || "Non presente"}</p>
                  </div>
                  {contact.phone && <Copy className="ml-auto h-3.5 w-3.5 text-slate-400" />}
                </button>
                <div className="flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-3">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Azienda</p>
                    <p className="truncate text-sm font-medium">{contact.company_name || "Non indicata"}</p>
                  </div>
                </div>
                <div className="flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-3">
                  <CalendarClock className="h-4 w-4 text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Ultima attività</p>
                    <p className="truncate text-sm font-medium">{formatContactDate(contact.last_activity_at || contact.created_at)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">Qualità dato</p>
                    <p className="text-sm text-slate-500">Rischi operativi prima di campagne e automazioni.</p>
                  </div>
                  {issues.length === 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pulito
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" /> {issues.length} warning
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {issues.length === 0 ? (
                    <span className="text-sm text-slate-500">Nessuna criticità evidente sul contatto.</span>
                  ) : (
                    issues.map((issue) => (
                      <span key={issue.key} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${issueClasses(issue.tone)}`}>
                        {issue.label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-slate-500" /> Consensi
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Email marketing</span>
                      <Badge variant={contact.optout_email || contact.unsubscribed ? "destructive" : "secondary"}>
                        {contact.optout_email || contact.unsubscribed ? "Bloccata" : "OK"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>WhatsApp</span>
                      <Badge variant={contact.optout_whatsapp ? "destructive" : "secondary"}>
                        {contact.optout_whatsapp ? "Bloccato" : "OK"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Chiamate</span>
                      <Badge variant={contact.optout_call ? "destructive" : "secondary"}>
                        {contact.optout_call ? "Bloccate" : "OK"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <Sparkles className="h-4 w-4 text-slate-500" /> Insight
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p><span className="font-medium text-slate-900">Fonte:</span> {contact.source || "Non tracciata"}</p>
                    <p><span className="font-medium text-slate-900">Canale:</span> {contact.preferred_channel || "Non definito"}</p>
                    <p><span className="font-medium text-slate-900">Prossima azione:</span> {contact.ai_next_action || "Nessun suggerimento"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">Liste e segmenti</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {listsLoading ? (
                    <span className="text-sm text-slate-500">Carico liste...</span>
                  ) : listNames.length === 0 ? (
                    <span className="text-sm text-slate-500">Non appartiene ancora a nessuna lista.</span>
                  ) : (
                    listNames.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)
                  )}
                </div>
              </div>

              {contact.opp_name && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-950">Opportunità collegata</p>
                  <p className="mt-1 text-sm text-emerald-800">{contact.opp_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {contact.opp_pipeline && <Badge className="bg-white text-emerald-700 hover:bg-white">{contact.opp_pipeline}</Badge>}
                    {contact.opp_stage && <Badge className="bg-white text-emerald-700 hover:bg-white">{contact.opp_stage}</Badge>}
                    {contact.opp_value != null && <Badge className="bg-white text-emerald-700 hover:bg-white">€ {Number(contact.opp_value).toLocaleString("it-IT")}</Badge>}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => navigate(`${routePrefix}/contatti/${contact.id}`)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Apri scheda completa
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!canEdit}
                  onClick={() => {
                    onEdit(contact);
                    onOpenChange(false);
                  }}
                >
                  Modifica contatto
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Arricchimento massivo dei contatti selezionati (solo piattaforma).
 *  Sito + VIES + auto-fill + segnale d'acquisto, a lotti di max 100. */
function BulkEnrichButton({ selectedIds, onDone }: { selectedIds: Set<string>; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const run = async () => {
    if (running) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (ids.length > 100) { toast.error("Massimo 100 contatti per volta. Restringi la selezione."); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "enrich_contacts_batch", contactIds: ids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Arricchiti ${data.enriched}/${data.attempted} · ${data.filled} con nuovi dati${data.failed ? ` · ${data.failed} falliti` : ""}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore arricchimento massivo");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" disabled={running} onClick={run}
      title="Sito + VIES + segnale d'acquisto sui contatti selezionati (max 100)">
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />} Arricchisci ({selectedIds.size})
    </Button>
  );
}

export default function MarketingContacts() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canEditContacts = permissions.canEditMarketingContacts || permissions.canEditMarketing;
  const columnsStorageKey = useMemo(() => getStorageKey(user?.id, companyId), [user?.id, companyId]);
  const queryClient = useQueryClient();
  const { data: contactCustomFields = [] } = useContactCustomFields();

  const importFields = useMemo(() => {
    const customImportFields = contactCustomFields.map(f => ({
      key: `custom_${f.id}`,
      label: f.name,
      required: false,
      type: "text" as const,
    }));
    return [...CSV_FIELDS, ...customImportFields];
  }, [contactCustomFields]);

  const { params: urlFilters, setParam: setURLParam, setParams: setURLParams } = useURLFilters({
    activeTab: { key: "tab", defaultValue: "all" },
    searchInput: { key: "q", defaultValue: "" },
    page: { key: "pagina", defaultValue: 1, serialize: String, deserialize: Number },
    pageSize: { key: "per_pagina", defaultValue: 25, serialize: String, deserialize: Number },
    sortField: { key: "ordina", defaultValue: "created_at" },
    sortDirection: { key: "dir", defaultValue: "desc" },
    // Deep-link preset usato da dashboard / executive summary marketing.
    filter: { key: "filter", defaultValue: "" },
    quality: { key: "qualita", defaultValue: "all" },
    // Drill-down dai grafici trend marketing (formato YYYY-MM)
    meseFilter: { key: "mese", defaultValue: "" },
    // Drill-down dalla reportistica CRM-vendite: ?source=<fonte>
    source: { key: "source", defaultValue: "" },
  });

  const normalizedUrl = useMemo(
    () => normalizeContactsUrlState({
      activeTab: urlFilters.activeTab,
      page: urlFilters.page,
      pageSize: urlFilters.pageSize,
      sortField: urlFilters.sortField,
      sortDirection: urlFilters.sortDirection,
    }),
    [urlFilters.activeTab, urlFilters.page, urlFilters.pageSize, urlFilters.sortField, urlFilters.sortDirection],
  );

  const activeTab = normalizedUrl.activeTab;
  const setActiveTab = useCallback((v: ContactsTab) => {
    setURLParams({ activeTab: v, page: 1 });
  }, [setURLParams]);

  useEffect(() => {
    if (urlFilters.activeTab !== activeTab) {
      setURLParam("activeTab", activeTab);
    }
  }, [activeTab, setURLParam, urlFilters.activeTab]);

  const [searchInput, setSearchInput] = useState(urlFilters.searchInput);
  const search = useDebounce(searchInput, 350);
  const page = normalizedUrl.page;
  const setPage = useCallback((v: number) => setURLParam("page", Math.max(1, Math.floor(v))), [setURLParam]);
  const pageSize = normalizedUrl.pageSize;
  const setPageSize = useCallback((v: number) => setURLParam("pageSize", v), [setURLParam]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<MarketingContact | null>(null);
  const sortField = normalizedUrl.sortField as SortField;
  const setSortField = useCallback((v: SortField) => setURLParam("sortField", v), [setURLParam]);
  const sortDirection = normalizedUrl.sortDirection as SortDirection;
  const setSortDirection = useCallback((v: SortDirection) => setURLParam("sortDirection", v), [setURLParam]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadVisibleColumns(columnsStorageKey));
  const [fieldsSheetOpen, setFieldsSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [previewContact, setPreviewContact] = useState<MarketingContact | null>(null);

  const activeFilterCount = countActiveContactFilters(filters);
  const qualityFilter = isQualityFilter(urlFilters.quality) ? urlFilters.quality : "all";
  const setQualityFilter = useCallback((value: ContactQualityFilter) => {
    setURLParams({ quality: value, page: 1 });
  }, [setURLParams]);
  // Preset filter via query param: ?filter=stale|stale_2h
  // Permette ai banner della dashboard / executive summary di "deep-linkare"
  // direttamente sui lead da contattare. Si rimuove con il bottone in banner.
  const stalePreset = urlFilters.filter as "stale" | "stale_2h" | "" | undefined;
  const stalePresetActive = stalePreset === "stale" || stalePreset === "stale_2h";
  const clearStalePreset = useCallback(() => setURLParam("filter", ""), [setURLParam]);

  // Drill-down dai grafici trend: ?mese=YYYY-MM filtra per mese di creazione
  const meseFilter = urlFilters.meseFilter;
  const meseRange = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(meseFilter || "");
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) return null;
    return {
      start: new Date(y, mo, 1).toISOString(),
      end: new Date(y, mo + 1, 1).toISOString(),
      label: new Date(y, mo, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    };
  }, [meseFilter]);
  const clearMeseFilter = useCallback(() => setURLParam("meseFilter", ""), [setURLParam]);

  // Drill-down per fonte (dalla reportistica CRM-vendite): ?source=<fonte>
  const sourceFilter = (urlFilters.source || "").trim();
  const clearSourceFilter = useCallback(() => setURLParam("source", ""), [setURLParam]);

  useEffect(() => {
    setSearchInput(urlFilters.searchInput);
  }, [urlFilters.searchInput]);

  useEffect(() => {
    if (search !== urlFilters.searchInput) {
      setURLParam("searchInput", search);
    }
  }, [search, setURLParam, urlFilters.searchInput]);

  useEffect(() => {
    setVisibleColumns(loadVisibleColumns(columnsStorageKey));
  }, [columnsStorageKey]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [companyId, activeTab, search, pageSize, sortField, sortDirection, filters, stalePreset, qualityFilter]);

  const doExport = useCallback(async (format: "csv" | "xlsx") => {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      // If selected, export only those; otherwise apply active filters
      let finalIds: string[] | null = null;

      if (selectedIds.size > 0) {
        finalIds = [...selectedIds];
      } else {
        // Apply active filters to get IDs (same logic as the main query)
        const activeGroups = filters.groups.filter((g) => g.rules.length > 0);
        if (activeGroups.length > 0) {
          if (activeGroups.length === 1) {
            const ids = await applyGroupRules(activeGroups[0], companyId);
            if (ids !== null) {
              if (ids.length === 0) { setExporting(false); toast.info("Nessun contatto corrisponde ai filtri"); return; }
              finalIds = ids;
            }
          } else {
            const allIds = new Set<string>();
            for (const group of activeGroups) {
              const ids = await applyGroupRules(group, companyId);
              if (ids !== null) ids.forEach((id) => allIds.add(id));
            }
            if (allIds.size === 0) { setExporting(false); toast.info("Nessun contatto corrisponde ai filtri"); return; }
            finalIds = [...allIds];
          }
        }
      }

      // Paginated fetch to handle >1000 rows
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, website, date_of_birth, notes, contact_type, source, tags, assigned_to, company_id, created_at, updated_at, last_activity_at, call_center_id, attr_source, attr_campaign, lead_score, icp_score, score, ai_score, ai_score_tier, ai_score_reasoning, ai_next_action, preferred_channel, opt_out, optout_email, optout_sms, optout_whatsapp, optout_call, unsubscribed, unsubscribed_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (permissions.onlyAssigned && user?.id) {
          query = query.eq("assigned_to", user.id);
        }

        // Apply search filter if active
        const safeSearch = sanitizeContactSearchTerm(search);
        if (safeSearch) {
          const s = `%${safeSearch}%`;
          query = query.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
        }

        query = applyQualityToQuery(query, qualityFilter);

        if (sourceFilter) query = query.eq("source", sourceFilter);

        if (stalePresetActive) {
          const now = Date.now();
          if (stalePreset === "stale_2h") {
            const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
            query = query
              .gte("created_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString())
              .lte("created_at", twoHoursAgo)
              .or("last_activity_at.is.null");
          } else {
            const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();
            query = query.or(`last_activity_at.is.null,last_activity_at.lte.${fortyEightHoursAgo}`);
          }
        }

        if (finalIds) query = query.in("id", finalIds);

        const { data, error } = await query;
        if (error) throw error;

        allRows = allRows.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }

      const all = allRows;

      // Build columns including custom fields
      const baseColumns = [
        { key: "first_name", label: "Nome" },
        { key: "last_name", label: "Cognome" },
        { key: "phone", label: "Telefono" },
        { key: "email", label: "Email" },
        { key: "company_name", label: "Azienda" },
        { key: "city", label: "Città" },
        { key: "province", label: "Provincia" },
        { key: "tags", label: "Tag" },
        { key: "notes", label: "Note" },
        { key: "source", label: "Fonte" },
        { key: "contact_type", label: "Tipo" },
        { key: "created_at", label: "Data Creazione" },
      ];

      // Add custom field columns
      const cfColumns = contactCustomFields.map(f => ({ key: `cf_${f.id}`, label: f.name }));

      // Fetch custom field values for exported contacts if any
      const cfMap: Record<string, Record<string, string>> = {};
      if (cfColumns.length > 0 && all && all.length > 0) {
        const ids = all.map((c: any) => c.id);
        // Chunk .in() queries to avoid Supabase limits
        const CHUNK_SIZE = 2000;
        let allVals: any[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          const { data: vals } = await supabase
            .from("marketing_contact_field_values")
            .select("contact_id, field_id, value")
            .in("contact_id", chunk);
          allVals = allVals.concat(vals || []);
        }
        for (const v of allVals) {
          if (!cfMap[v.contact_id]) cfMap[v.contact_id] = {};
          if (v.value) cfMap[v.contact_id][v.field_id] = v.value;
        }
      }

      const rows = (all || []).map((c: any) => {
        const row: Record<string, string> = {
          first_name: c.first_name || "",
          last_name: c.last_name || "",
          phone: c.phone || "",
          email: c.email || "",
          company_name: c.company_name || "",
          city: c.city || "",
          province: c.province || "",
          tags: (c.tags || []).join(", "),
          notes: c.notes || "",
          source: c.source || "",
          contact_type: c.contact_type || "",
          created_at: c.created_at ? new Date(c.created_at).toLocaleDateString("it-IT") : "",
        };
        // Add custom field values
        for (const cf of contactCustomFields) {
          row[`cf_${cf.id}`] = cfMap[c.id]?.[cf.id] || "";
        }
        return row;
      });

      const allColumns = [...baseColumns, ...cfColumns];
      const today = new Date().toISOString().slice(0, 10);
      const suffix = selectedIds.size > 0 ? `_selezionati_${selectedIds.size}` : "";

      if (format === "xlsx") {
        exportToXLSX(rows, allColumns, `contatti${suffix}_${today}.xlsx`);
      } else {
        exportToCSV(rows, allColumns, `contatti${suffix}_${today}.csv`);
      }
      toast.success(`${rows.length} contatti esportati in ${format.toUpperCase()}`);
    } catch {
      toast.error("Errore durante l'esportazione");
    } finally {
      setExporting(false);
    }
  }, [companyId, exporting, selectedIds, contactCustomFields, filters, search, permissions.onlyAssigned, user?.id, activeTab, qualityFilter, stalePreset, stalePresetActive, sourceFilter]);

  // Consolidated filter data query (pipelines, tags, list count)
  const { data: filterData } = useQuery({
    queryKey: ["marketing-filter-data", companyId],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [pipelinesRes, tagsRes, countRes] = await Promise.all([
        supabase
          .from("marketing_pipelines")
          .select("id, name, marketing_pipeline_stages(id, name, position)")
          .eq("company_id", companyId!)
          .order("position"),
        supabase
          .from("marketing_tags")
          .select("name")
          .eq("company_id", companyId!)
          .order("name"),
        supabase
          .from("marketing_contact_lists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
      ]);
      if (pipelinesRes.error) throw pipelinesRes.error;
      if (tagsRes.error) throw tagsRes.error;
      if (countRes.error) throw countRes.error;
      return {
        pipelines: (pipelinesRes.data || []) as PipelineWithStages[],
        availableTags: normalizeTagList((tagsRes.data || []).map((t) => t.name)),
        listCount: countRes.count || 0,
      };
    },
    enabled: !!companyId,
  });
  const pipelines = filterData?.pipelines ?? [];
  const availableTags = filterData?.availableTags ?? [];
  const listCount = filterData?.listCount ?? 0;

  // Contattabilità sull'INTERO database azienda: count esatti head-only in
  // parallelo (mai fetch-e-conta). Su decine di migliaia di contatti i KPI
  // calcolati sulla pagina corrente erano fuorvianti: qui i numeri dicono
  // davvero quanti contatti hanno un recapito utilizzabile per le campagne.
  const { data: reachStats } = useQuery({
    queryKey: ["marketing-contacts-reachability", companyId, permissions.onlyAssigned ? user?.id : null],
    staleTime: 5 * 60 * 1000,
    enabled: !!companyId,
    queryFn: async () => {
      const base = () => {
        let q = supabase
          .from("marketing_contacts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!);
        if (permissions.onlyAssigned && user?.id) q = q.eq("assigned_to", user.id);
        return q;
      };
      const results = await Promise.all([
        base(),
        applyQualityToQuery(base(), "has_email"),
        applyQualityToQuery(base(), "has_phone"),
        applyQualityToQuery(base(), "contactable"),
        applyQualityToQuery(base(), "no_contact"),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      const [totalRes, emailRes, phoneRes, reachableRes, unreachableRes] = results;
      return {
        total: totalRes.count || 0,
        withEmail: emailRes.count || 0,
        withPhone: phoneRes.count || 0,
        reachable: reachableRes.count || 0,
        unreachable: unreachableRes.count || 0,
      };
    },
  });

  // Helper: apply a single group's rules to get matching contact IDs
  async function applyGroupRules(group: FilterGroup, companyId: string): Promise<string[] | null> {
    const rules = group.rules.filter((r) => {
      if (r.operator === "is_empty" || r.operator === "is_not_empty") return true;
      return r.value.trim().length > 0;
    });
    if (rules.length === 0) return null;

    const standardRules: FilterRule[] = [];
    const tagRules: FilterRule[] = [];
    const oppRules: FilterRule[] = [];
    const cfRules: FilterRule[] = [];

    for (const rule of rules) {
      if (rule.field === "tags") tagRules.push(rule);
      else if (rule.field.startsWith("opp_")) oppRules.push(rule);
      else if (rule.field.startsWith("cf_")) cfRules.push(rule);
      else if (FIELD_TO_COLUMN[rule.field]) standardRules.push(rule);
    }

    // Opp filter → contact_ids
    let oppContactIds: string[] | null = null;
    if (oppRules.length > 0) {
      let oppQuery = supabase.from("marketing_opportunities").select("contact_id").eq("company_id", companyId);
      for (const rule of oppRules) {
        if (rule.field === "opp_status") {
          if (rule.operator === "is") oppQuery = oppQuery.eq("status", sanitizeContactSearchTerm(rule.value));
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("status", sanitizeContactSearchTerm(rule.value));
        } else if (rule.field === "opp_stage") {
          if (rule.operator === "is") oppQuery = oppQuery.eq("stage_id", sanitizeContactSearchTerm(rule.value));
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("stage_id", sanitizeContactSearchTerm(rule.value));
        } else if (rule.field.startsWith("opp_pipeline_")) {
          const pipelineId = rule.field.replace("opp_pipeline_", "");
          if (rule.operator === "is") oppQuery = oppQuery.eq("pipeline_id", pipelineId);
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("pipeline_id", pipelineId);
        }
      }
      const { data: oppData, error: oppError } = await oppQuery;
      if (oppError) throw oppError;
      oppContactIds = [...new Set((oppData || []).map((o) => o.contact_id))];
      if (oppContactIds.length === 0) return [];
    }

    // CF filter → contact_ids (AND within group)
    let cfContactIds: string[] | null = null;
    if (cfRules.length > 0) {
      const sets: Set<string>[] = [];
      for (const rule of cfRules) {
        const fieldId = rule.field.replace("cf_", "");
        let cfQuery = supabase.from("marketing_contact_field_values").select("contact_id").eq("field_id", fieldId);
        switch (rule.operator) {
          case "is": cfQuery = cfQuery.ilike("value", `%${sanitizeContactSearchTerm(rule.value)}%`); break;
          case "is_not": cfQuery = cfQuery.not("value", "ilike", `%${sanitizeContactSearchTerm(rule.value)}%`); break;
          case "is_empty": cfQuery = cfQuery.or("value.is.null,value.eq."); break;
          case "is_not_empty": cfQuery = cfQuery.not("value", "is", null).neq("value", ""); break;
        }
        const { data: cfData, error: cfError } = await cfQuery;
        if (cfError) throw cfError;
        sets.push(new Set((cfData || []).map((r) => r.contact_id)));
      }
      // AND: intersect all sets
      let result = sets[0];
      for (let i = 1; i < sets.length; i++) {
        result = new Set([...result].filter((id) => sets[i].has(id)));
      }
      cfContactIds = [...result];
      if (cfContactIds.length === 0) return [];
    }

    // Intersect opp + cf (AND)
    let filterIds: string[] | null;
    if (oppContactIds && cfContactIds) {
      const cfSet = new Set(cfContactIds);
      filterIds = oppContactIds.filter((id) => cfSet.has(id));
      if (filterIds.length === 0) return [];
    } else {
      filterIds = oppContactIds || cfContactIds;
    }

    // Now query contacts with standard + tag rules
    let query = supabase.from("marketing_contacts").select("id").eq("company_id", companyId);
    if (permissions.onlyAssigned && user?.id) {
      query = query.eq("assigned_to", user.id);
    }
    if (filterIds) query = query.in("id", filterIds);
    for (const rule of standardRules) query = applyRuleToQuery(query, rule);
    for (const rule of tagRules) {
      const tagValue = sanitizeContactSearchTerm(rule.value);
      if (rule.operator === "is") query = query.overlaps("tags", [tagValue]);
      else if (rule.operator === "is_not") query = query.not("tags", "cs", `{${tagValue}}`);
      else if (rule.operator === "is_empty") query = query.or("tags.is.null,tags.eq.{}");
      else if (rule.operator === "is_not_empty") query = query.not("tags", "is", null).not("tags", "eq", "{}");
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((r) => r.id);
  }

  // Fetch contacts with grouped filter rules
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contacts", companyId, search, page, pageSize, sortField, sortDirection, filters, activeTab, stalePreset, qualityFilter, meseFilter, sourceFilter],
    queryFn: async () => {
      if (!companyId) return { contacts: [] as MarketingContact[], count: 0 };

      const activeGroups = filters.groups.filter((g) => g.rules.length > 0);

      // Determine filtered IDs if we have groups
      let finalIds: string[] | null = null;
      if (activeGroups.length > 0) {
        if (activeGroups.length === 1) {
          // Single group: just apply AND rules
          const ids = await applyGroupRules(activeGroups[0], companyId);
          if (ids !== null) {
            if (ids.length === 0) return { contacts: [] as MarketingContact[], count: 0 };
            finalIds = ids;
          }
        } else {
          // Multiple groups: OR (union) the results — valutati in PARALLELO
          // (prima erano in serie: N round-trip sequenziali = waterfall).
          const allIds = new Set<string>();
          const idArrays = await Promise.all(
            activeGroups.map((group) => applyGroupRules(group, companyId)),
          );
          for (const ids of idArrays) {
            if (ids !== null) ids.forEach((id) => allIds.add(id));
          }
          if (allIds.size === 0) return { contacts: [] as MarketingContact[], count: 0 };
          finalIds = [...allIds];
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("marketing_contacts")
        // Select chirurgico (stesso elenco usato per l'export a riga ~597):
        // marketing_contacts è larga (~78 colonne), `select("*")` scaricava
        // colonne inutili a ogni pagina. ATTENZIONE: con le colonne esplicite
        // PostgREST risponde 400 se UNA non esiste → lista vuota in prod
        // (successo il 2026-06-10 con 7 colonne inesistenti: lifecycle_stage
        // e call_center_*). Le select-stringa lunghe NON sono type-checked da
        // tsc: prima di toccare l'elenco, validare contro information_schema.
        // L'elenco copre l'interfaccia MarketingContact (ContactsTable) incl.
        // opt_out/optout_*/unsubscribed usati da badge consensi e KPI qualità.
        .select(
          "id, first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, website, date_of_birth, notes, contact_type, source, tags, assigned_to, company_id, created_at, updated_at, last_activity_at, call_center_id, attr_source, attr_campaign, lead_score, icp_score, score, ai_score, ai_score_tier, ai_score_reasoning, ai_next_action, preferred_channel, opt_out, optout_email, optout_sms, optout_whatsapp, optout_call, unsubscribed, unsubscribed_at",
          { count: "exact" },
        )
        .eq("company_id", companyId)
        .order(sortField, { ascending: sortDirection === "asc" })
        .range(from, to);

      // Permission enforcement: restrict to assigned contacts only
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("assigned_to", user.id);
      }

      if (finalIds) query = query.in("id", finalIds);

      // Drill-down per mese (dai grafici trend)
      if (meseRange) query = query.gte("created_at", meseRange.start).lt("created_at", meseRange.end);

      // Drill-down per fonte (dalla reportistica CRM-vendite)
      if (sourceFilter) query = query.eq("source", sourceFilter);

      query = applyQualityToQuery(query, qualityFilter);

      // Preset "lead da contattare" — applicato server-side se ?filter=stale|stale_2h.
      // - stale_2h: lead nuovi (creati ≤ 2h fa) ma non ancora contattati
      // - stale: lead con last_activity_at oltre 48h fa o nullo
      if (stalePresetActive) {
        const now = Date.now();
        if (stalePreset === "stale_2h") {
          const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
          query = query
            .gte("created_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString())
            .lte("created_at", twoHoursAgo)
            .or("last_activity_at.is.null");
        } else {
          const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();
          query = query.or(`last_activity_at.is.null,last_activity_at.lte.${fortyEightHoursAgo}`);
        }
      }

      const safeSearch = sanitizeContactSearchTerm(search);
      if (safeSearch) {
        const s = `%${safeSearch}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},company_name.ilike.${s}`);
      }

      const { data: contactsRaw, count, error } = await query;
      if (error) throw error;

      const contactIds = (contactsRaw || []).map((c: any) => c.id);

      // Fetch first opportunity per contact
      const oppMap: Record<string, { name: string; value: number; status: string; pipeline_name: string; stage_name: string }> = {};
      if (contactIds.length > 0) {
        const { data: opps } = await supabase
          .from("marketing_opportunities")
          .select("contact_id, name, value, status, marketing_pipelines(name), marketing_pipeline_stages(name)")
          .in("contact_id", contactIds)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        if (opps) {
          for (const opp of opps) {
            if (!oppMap[opp.contact_id]) {
              oppMap[opp.contact_id] = {
                name: opp.name,
                value: opp.value,
                status: opp.status,
                pipeline_name: (opp.marketing_pipelines as any)?.name || "",
                stage_name: (opp.marketing_pipeline_stages as any)?.name || "",
              };
            }
          }
        }
      }

      // Fetch call_center names
      const callCenterIds = [...new Set((contactsRaw || []).map((c: any) => c.call_center_id).filter(Boolean))];
      const callCenterMap: Record<string, string> = {};
      if (callCenterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", callCenterIds);
        if (profiles) {
          for (const p of profiles) {
            callCenterMap[p.id] = `${p.first_name} ${p.last_name || ""}`.trim();
          }
        }
      }

      const contacts: MarketingContact[] = (contactsRaw || []).map((c: any) => {
        const opp = oppMap[c.id];
        return {
          ...c,
          call_center_name: callCenterMap[c.call_center_id] || null,
          opp_name: opp?.name || null,
          opp_value: opp?.value ?? null,
          opp_status: opp?.status || null,
          opp_pipeline: opp?.pipeline_name || null,
          opp_stage: opp?.stage_name || null,
        };
      });

      return { contacts, count: count || 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const contacts = useMemo(() => data?.contacts ?? [], [data?.contacts]);
  const totalCount = data?.count || 0;
  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    contacts.forEach((contact) => {
      const email = contact.email?.trim().toLowerCase();
      const phone = contact.phone ? cleanPhone(contact.phone) : "";
      if (email) counts.set(`email:${email}`, (counts.get(`email:${email}`) || 0) + 1);
      if (phone) counts.set(`phone:${phone}`, (counts.get(`phone:${phone}`) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [contacts]);
  const contactIssuesById = useMemo(() => {
    const map: Record<string, ContactQualityIssue[]> = {};
    contacts.forEach((contact) => {
      map[contact.id] = getContactQualityIssues(contact, duplicateKeys);
    });
    return map;
  }, [contacts, duplicateKeys]);
  const qualityStats = useMemo(() => {
    const values = Object.values(contactIssuesById);
    return {
      totalIssues: values.filter((issues) => issues.length > 0).length,
      missingContact: values.filter((issues) => issues.some((issue) => issue.key === "missing_contact" || issue.key === "missing_email" || issue.key === "missing_phone")).length,
      noSource: values.filter((issues) => issues.some((issue) => issue.key === "no_source")).length,
      optout: values.filter((issues) => issues.some((issue) => issue.key === "optout")).length,
      stale: values.filter((issues) => issues.some((issue) => issue.key === "stale")).length,
      duplicates: values.filter((issues) => issues.some((issue) => issue.key === "duplicate")).length,
    };
  }, [contactIssuesById]);
  const selectedQualitySummary = useMemo(() => {
    const selectedContacts = contacts.filter((contact) => selectedIds.has(contact.id));
    const selectedIssues = selectedContacts.flatMap((contact) => contactIssuesById[contact.id] || []);
    return {
      selected: selectedContacts.length,
      issues: selectedIssues.length,
      optout: selectedIssues.filter((issue) => issue.key === "optout").length,
    };
  }, [contacts, selectedIds, contactIssuesById]);

  // Fetch custom field values for visible contacts
  const { data: customFieldValues = {} } = useQuery({
    queryKey: ["marketing-contact-field-values", companyId, contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {} as Record<string, Record<string, string>>;
      const { data: vals, error } = await supabase
        .from("marketing_contact_field_values")
        .select("contact_id, field_id, value")
        .in("contact_id", contactIds);
      if (error) throw error;
      const map: Record<string, Record<string, string>> = {};
      for (const v of vals || []) {
        if (!map[v.contact_id]) map[v.contact_id] = {};
        if (v.value) map[v.contact_id][v.field_id] = v.value;
      }
      return map;
    },
    enabled: contactIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Mutations
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    queryClient.invalidateQueries({ queryKey: ["marketing_contacts_search"] });
  };

  const assertContactsAreSafeToDelete = async (ids: string[]) => {
    const linkedChecks = await Promise.all([
      supabase
        .from("marketing_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .in("contact_id", ids),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .in("contact_id", ids),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .in("contact_id", ids),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .in("contact_id", ids),
    ]);

    const error = linkedChecks.find((result) => result.error)?.error;
    if (error) throw error;

    const linkedCount = linkedChecks.reduce((sum, result) => sum + (result.count || 0), 0);
    if (linkedCount > 0) {
      throw new Error("Impossibile eliminare contatti collegati a opportunità, appuntamenti, preventivi o task. Rimuovi prima i collegamenti oppure mantieni il contatto nello storico CRM.");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (formData: ContactFormData) => {
      if (!companyId) throw new Error("No company");
      if (!canEditContacts) throw new Error("Non hai i permessi per modificare i contatti");
      const cleanFormData = { ...formData, tags: normalizeTagList(formData.tags) };
      if (editingContact) {
        const { error } = await supabase
          .from("marketing_contacts")
          .update({ ...cleanFormData, updated_at: new Date().toISOString() })
          .eq("id", editingContact.id)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("marketing_contacts")
          .insert({ ...cleanFormData, company_id: companyId });
        if (error) throw error;
      }
    },
    onSuccess: async (_, formData) => {
      toast.success(editingContact ? "Contatto aggiornato" : "Contatto aggiunto");
      if (editingContact) {
        const savedTags = normalizeTagList(formData.tags);
        const originalTags = normalizeTagList(editingContact.tags || []);
        const addedTags = getAddedTags(savedTags, originalTags);
        const removedTags = getRemovedTags(originalTags, savedTags);
        if (addedTags.length > 0) {
          await syncTagsToOpportunities(editingContact.id, addedTags, companyId);
        }
        for (const tag of removedTags) {
          await removeTagFromOpportunities(editingContact.id, tag, companyId);
        }
        if (addedTags.length > 0 || removedTags.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
        }
      }
      invalidate();
      setEditingContact(null);
    },
    onError: (error: any) => toast.error("Errore nel salvataggio", { description: error.message || "Operazione non riuscita. Riprova." }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId) throw new Error("No company");
      if (!canEditContacts) throw new Error("Non hai i permessi per eliminare i contatti");
      await assertContactsAreSafeToDelete(ids);
      const { error } = await supabase.from("marketing_contacts").delete().eq("company_id", companyId).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} contatt${ids.length === 1 ? "o eliminato" : "i eliminati"}`);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (error: any) => toast.error("Errore nell'eliminazione", { description: error.message || "Operazione non riuscita. Riprova." }),
  });

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => toggleContactsPageSelection(prev, contacts.map((c) => c.id)));
  }, [contacts]);

  const handleEdit = (contact: MarketingContact) => {
    if (!canEditContacts) return;
    setEditingContact(contact);
    setDialogOpen(true);
  };

  const handleApplyColumns = (cols: Set<string>) => {
    setVisibleColumns(cols);
    saveVisibleColumns(cols, columnsStorageKey);
  };

  const handleApplyFilters = (f: ContactFilters) => {
    setFilters(f);
    setPage(1);
  };

  const handleImport = async (rows: Record<string, string>[], options: { mode: string }) => {
    if (!companyId) return { success: 0, errors: ["Nessuna azienda selezionata"] };
    if (!canEditContacts) return { success: 0, errors: ["Non hai i permessi per importare o modificare contatti"] };
    const customKeys = contactCustomFields.map(f => `custom_${f.id}`);
    const mode = options?.mode || "create";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Parse all rows
    const parsed = rows.map((r, idx) => {
      let firstName = r.first_name?.trim() || "";
      let lastName = r.last_name?.trim() || "";
      if (!firstName && r.fullname?.trim()) {
        const parts = r.fullname.trim().split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
      const email = r.email?.trim().toLowerCase() || null;
      const phone = r.phone?.trim() || null;

      // Email validation
      if (email && !emailRegex.test(email)) {
        errors.push(`Riga ${idx + 2}: email "${email}" non valida`);
        return null;
      }

      return {
        rowIdx: idx,
        row: r,
        data: {
          company_id: companyId,
          first_name: firstName || "Senza nome",
          last_name: lastName || null,
          phone: phone ? cleanPhone(phone) : null,
          email: email,
          company_name: r.company_name?.trim() || null,
          city: r.city?.trim() || null,
          province: r.province?.trim() || null,
          tags: r.tags ? normalizeTagList(r.tags.split(",")) : [],
          notes: r.notes?.trim() || null,
          source: r.source?.trim() || "importazione",
        },
      };
    }).filter(Boolean) as { rowIdx: number; row: Record<string, string>; data: any }[];

    // Detect internal duplicates by email and normalized phone
    const seenEmails = new Map<string, number>();
    const seenPhones = new Map<string, number>();
    for (const p of parsed) {
      if (p.data.email) {
        const key = p.data.email.toLowerCase();
        if (seenEmails.has(key)) {
          errors.push(`Riga ${p.rowIdx + 2}: email duplicata nel file ("${p.data.email}")`);
        }
        seenEmails.set(key, p.rowIdx);
      }
      if (p.data.phone) {
        const key = p.data.phone;
        if (seenPhones.has(key)) {
          errors.push(`Riga ${p.rowIdx + 2}: telefono duplicato nel file ("${p.data.phone}")`);
        }
        seenPhones.set(key, p.rowIdx);
      }
    }

    // Remove internal duplicates from parsed (keep first occurrence)
    const seenEmailsForDedup = new Set<string>();
    const seenPhonesForDedup = new Set<string>();
    const finalParsed = parsed.filter(p => {
      const emailKey = p.data.email?.toLowerCase();
      const phoneKey = p.data.phone;
      if (emailKey && seenEmailsForDedup.has(emailKey)) return false;
      if (!emailKey && phoneKey && seenPhonesForDedup.has(phoneKey)) return false;
      if (emailKey) seenEmailsForDedup.add(emailKey);
      if (phoneKey) seenPhonesForDedup.add(phoneKey);
      return true;
    });

    if (mode === "create") {
      // Simple insert
      const toInsert = finalParsed.map(p => p.data);
      if (toInsert.length === 0) {
        return { success: 0, errors: errors.length ? errors : ["Nessun contatto valido da importare"] };
      }
      const { error, data } = await supabase.from("marketing_contacts").insert(toInsert).select("id");
      if (error) return { success: 0, errors: [...errors, error.message] };
      created = data?.length || 0;

      // Custom fields
      if (data && customKeys.length > 0) {
        const fieldValues: { contact_id: string; field_id: string; value: string | null }[] = [];
        data.forEach((contact, idx) => {
          const row = finalParsed[idx]?.row;
          if (!row) return;
          customKeys.forEach(key => {
            const val = row[key]?.trim();
            if (val) {
              fieldValues.push({ contact_id: contact.id, field_id: key.replace("custom_", ""), value: val });
            }
          });
        });
        if (fieldValues.length > 0) {
          await supabase.from("marketing_contact_field_values").insert(fieldValues);
        }
      }
    } else {
      // update or create_and_update: match by email or phone
      const existingEmails = new Set<string>();
      const existingPhones = new Set<string>();
      const existingMap = new Map<string, string>(); // matchKey -> contact id

      // Fetch existing contacts by email/phone
      const emails = finalParsed.map(p => p.data.email).filter(Boolean);
      const phones = finalParsed.map(p => p.data.phone).filter(Boolean);

      if (emails.length > 0) {
        // Batch in chunks of 100 for .in()
        for (let i = 0; i < emails.length; i += 100) {
          const batch = emails.slice(i, i + 100);
          const { data: existing } = await supabase
            .from("marketing_contacts")
            .select("id, email")
            .eq("company_id", companyId)
            .in("email", batch);
          for (const e of existing || []) {
            if (e.email) {
              existingEmails.add(e.email.toLowerCase());
              existingMap.set(`email:${e.email.toLowerCase()}`, e.id);
            }
          }
        }
      }

      if (phones.length > 0) {
        for (let i = 0; i < phones.length; i += 100) {
          const batch = phones.slice(i, i + 100);
          const { data: existing } = await supabase
            .from("marketing_contacts")
            .select("id, phone")
            .eq("company_id", companyId)
            .in("phone", batch);
          for (const e of existing || []) {
            if (e.phone) {
              existingPhones.add(e.phone);
              existingMap.set(`phone:${e.phone}`, e.id);
            }
          }
        }
      }

      const toCreate: any[] = [];
      const toCreateRows: Record<string, string>[] = [];

      for (const p of finalParsed) {
        const matchKey = p.data.email
          ? `email:${p.data.email.toLowerCase()}`
          : p.data.phone
          ? `phone:${p.data.phone}`
          : null;

        const existingId = matchKey ? existingMap.get(matchKey) : null;

        if (existingId) {
          // Update existing
          const updateData = { ...p.data };
          delete updateData.company_id;
          updateData.updated_at = new Date().toISOString();
          const { error: updateError } = await supabase
            .from("marketing_contacts")
            .update(updateData)
            .eq("id", existingId)
            .eq("company_id", companyId);
          if (updateError) {
            errors.push(`Riga ${p.rowIdx + 2}: errore aggiornamento - ${updateError.message}`);
          } else {
            updated++;
            // Update custom fields
            if (customKeys.length > 0) {
              for (const key of customKeys) {
                const val = p.row[key]?.trim();
                if (val) {
                  await supabase
                    .from("marketing_contact_field_values")
                    .upsert({ contact_id: existingId, field_id: key.replace("custom_", ""), value: val }, { onConflict: "contact_id,field_id" });
                }
              }
            }
          }
        } else if (mode === "create_and_update") {
          toCreate.push(p.data);
          toCreateRows.push(p.row);
        } else {
          skipped++;
        }
      }

      // Bulk create new ones
      if (toCreate.length > 0) {
        const { error, data } = await supabase.from("marketing_contacts").insert(toCreate).select("id");
        if (error) {
          errors.push(`Errore creazione: ${error.message}`);
        } else {
          created = data?.length || 0;
          if (data && customKeys.length > 0) {
            const fieldValues: { contact_id: string; field_id: string; value: string | null }[] = [];
            data.forEach((contact, idx) => {
              const row = toCreateRows[idx];
              if (!row) return;
              customKeys.forEach(key => {
                const val = row[key]?.trim();
                if (val) {
                  fieldValues.push({ contact_id: contact.id, field_id: key.replace("custom_", ""), value: val });
                }
              });
            });
            if (fieldValues.length > 0) {
              await supabase.from("marketing_contact_field_values").insert(fieldValues);
            }
          }
        }
      }
    }

    invalidate();
    const successCount = created + updated;
    const details: string[] = [];
    if (created > 0) details.push(`${created} creati`);
    if (updated > 0) details.push(`${updated} aggiornati`);
    if (skipped > 0) details.push(`${skipped} saltati (non trovati)`);
    if (details.length > 0) errors.unshift(`Riepilogo: ${details.join(", ")}`);
    return { success: successCount, errors };
  };

  if (importOpen) {
    return (
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultObjectType="contacts"
        contactFields={importFields}
        opportunityFields={[]}
        onImportContacts={async (rows, opts) => handleImport(rows, opts)}
        onImportOpportunities={async () => ({ success: 0, errors: [] })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner preset (?filter=stale|stale_2h) — deep-link da dashboard */}
      {stalePresetActive && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold">!</span>
            <span>
              <strong>Filtro attivo:</strong>{" "}
              {stalePreset === "stale_2h"
                ? "lead nuovi (≤ 7 giorni) non contattati da oltre 2 ore"
                : "lead non contattati da oltre 48 ore"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:self-auto"
            onClick={clearStalePreset}
          >
            Mostra tutti i contatti
          </Button>
        </div>
      )}

      {meseRange && (
        <div className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <span><strong>Filtro mese attivo:</strong> contatti creati a {meseRange.label}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start border-blue-300 bg-white text-blue-900 hover:bg-blue-100 sm:self-auto"
            onClick={clearMeseFilter}
          >
            Mostra tutti i contatti
          </Button>
        </div>
      )}

      {sourceFilter && (
        <div className="flex flex-col gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
          <span><strong>Filtro fonte attivo:</strong> {sourceFilter}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start border-indigo-300 bg-white text-indigo-900 hover:bg-indigo-100 sm:self-auto"
            onClick={clearSourceFilter}
          >
            Mostra tutti i contatti
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
              <ContactRound className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-950">Contatti</h1>
                {!isLoading && activeTab === "all" && (
                  <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">{totalCount}</Badge>
                )}
              </div>
              <p className="text-sm text-slate-600">Gestisci lead, clienti e liste commerciali.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop: Export + Import */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="hidden border-slate-200 bg-white/80 hover:bg-white sm:flex" disabled={exporting || isLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? "Esportando..." : selectedIds.size > 0 ? `Esporta (${selectedIds.size})` : "Esporta"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport("csv")}>
                  <Download className="h-4 w-4 mr-2" /> Esporta CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("xlsx")}>
                  <Download className="h-4 w-4 mr-2" /> Esporta XLSX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="hidden border-slate-200 bg-white/80 hover:bg-white sm:flex" onClick={() => setImportOpen(true)} disabled={!canEditContacts}>
              <Upload className="h-4 w-4 mr-2" /> Importa
            </Button>
            {/* Mobile: ... menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="sm:hidden h-9 w-9 border-slate-200 bg-white/80">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setImportOpen(true)} disabled={!canEditContacts}>
                  <Upload className="mr-2 h-4 w-4" /> Importa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv")} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" /> Esporta CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("xlsx")} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" /> Esporta XLSX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFieldsSheetOpen(true)}>
                  <Settings2 className="mr-2 h-4 w-4" /> Gestisci campi
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Mobile: flex-1 — la CTA riempie la riga (niente vuoto a destra del bottone) */}
            <Button className="flex-1 sm:flex-initial bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600" onClick={() => { setEditingContact(null); setDialogOpen(true); }} disabled={!canEditContacts}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Aggiungi Contatto</span>
              <span className="sm:hidden">Aggiungi contatto</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContactsTab)}>
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="all" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">Tutti</TabsTrigger>
          <TabsTrigger value="lists" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            Liste
            {listCount > 0 && <Badge variant="secondary" className="text-xs h-5 px-1.5">{listCount}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "lists" ? (
        <ContactListsView />
      ) : (
        <>
          {/* Quality cockpit */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* v8.7 — header ripulito su feedback utente: via il badge "pagina corrente"
                (gergo interno) e l'hint sull'anteprima laterale, che su mobile non esiste
                nemmeno → resta solo su desktop, dove è vero. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <p className="font-semibold text-slate-950">Qualità dei contatti</p>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Recapiti, consensi e duplicati sotto controllo prima di liste, export o automazioni.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 lg:flex">
                <PanelRightOpen className="h-3.5 w-3.5 text-slate-500" />
                Clic sulla riga: anteprima laterale. Clic sul nome: scheda completa.
              </div>
            </div>

            {/* Contattabilità globale: count esatti su TUTTO il database (non
                sulla pagina corrente). Le chip sono cliccabili e filtrano la
                lista: clic di nuovo sulla chip attiva → torna a "Tutti". */}
            {reachStats && reachStats.total > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contattabilità · intero database
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{reachStats.total.toLocaleString("it-IT")}</span> contatti totali
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-red-100" title={`${reachStats.reachable.toLocaleString("it-IT")} contattabili su ${reachStats.total.toLocaleString("it-IT")}`}>
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${reachStats.total > 0 ? Math.round((reachStats.reachable / reachStats.total) * 100) : 0}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    { key: "contactable", label: "Contattabili", value: reachStats.reachable, Icon: CheckCircle2, activeCls: "border-emerald-300 bg-emerald-50 text-emerald-700", dotCls: "text-emerald-600" },
                    { key: "has_email", label: "Con email", value: reachStats.withEmail, Icon: Mail, activeCls: "border-sky-300 bg-sky-50 text-sky-700", dotCls: "text-sky-600" },
                    { key: "has_phone", label: "Con telefono", value: reachStats.withPhone, Icon: Phone, activeCls: "border-sky-300 bg-sky-50 text-sky-700", dotCls: "text-sky-600" },
                    { key: "no_contact", label: "Non contattabili", value: reachStats.unreachable, Icon: AlertTriangle, activeCls: "border-red-300 bg-red-50 text-red-700", dotCls: "text-red-600" },
                  ] as const).map(({ key, label, value, Icon, activeCls, dotCls }) => {
                    const pct = reachStats.total > 0 ? Math.round((value / reachStats.total) * 100) : 0;
                    const active = qualityFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={active ? "Rimuovi filtro" : `Mostra solo: ${label.toLowerCase()}`}
                        onClick={() => setQualityFilter(active ? "all" : key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active ? activeCls : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${dotCls}`} />
                        {label}
                        <span className="font-bold tabular-nums">{value.toLocaleString("it-IT")}</span>
                        <span className={active ? "" : "text-slate-400"}>· {pct}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Card qualità (solo numeri, non cliccabili): vetrina → nascoste
                su mobile. I filtri veri sono le chip sotto, che restano. */}
            <div className="mt-4 hidden md:grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-amber-700">Da sistemare</span>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <p className="mt-1 text-2xl font-bold text-amber-950">{qualityStats.totalIssues}</p>
                <p className="text-xs text-amber-700">contatti con warning visibili</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-red-700">No marketing</span>
                  <MailWarning className="h-4 w-4 text-red-600" />
                </div>
                <p className="mt-1 text-2xl font-bold text-red-950">{qualityStats.optout}</p>
                <p className="text-xs text-red-700">opt-out o unsubscribe</p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-blue-700">Da ricontattare</span>
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                </div>
                <p className="mt-1 text-2xl font-bold text-blue-950">{qualityStats.stale}</p>
                <p className="text-xs text-blue-700">attività vecchia o assente</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-emerald-700">Duplicati</span>
                  <UserRoundCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-950">{qualityStats.duplicates}</p>
                <p className="text-xs text-emerald-700">match email/telefono nella pagina</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {QUALITY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    qualityFilter === filter.value
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  title={filter.description}
                  onClick={() => setQualityFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {/* Mobile: full-width search */}
            <div className="relative sm:hidden">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca contatti..."
                className="pl-8 h-9 w-full text-base md:text-sm"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setFiltersSheetOpen(true)}>
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filtri avanzati</span>
                  <span className="sm:hidden">Filtri</span>
                  {activeFilterCount > 0 && (
                    <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[9px] rounded-full">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setSortDirection(sortDirection === "asc" ? "desc" : "asc"); setPage(1); }}>
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Ordina
                </Button>
              </div>
              {/* Desktop: search + gestisci campi */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Cerca contatti..." inputMode="search" enterKeyHint="search" className="pl-8 h-10 md:h-8 w-full md:w-[220px] text-base md:text-xs" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={() => setFieldsSheetOpen(true)}>
                  <Settings2 className="h-3.5 w-3.5" /> Gestisci campi
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="sm:hidden flex flex-col gap-2">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">Nessun contatto trovato</div>
            ) : (
              contacts.map((c) => {
                const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
                const initials = getInitials(c.first_name, c.last_name || "");
                const color = getAvatarColor(fullName);
                const issues = contactIssuesById[c.id] || [];
                return (
                  <div
                    key={c.id}
                    onClick={() => setPreviewContact(c)}
                    className="border rounded-xl p-4 cursor-pointer active:scale-[0.99] transition-all bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-11 w-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${color}`}>
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{fullName}</p>
                        {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        {c.company_name && <p className="text-xs text-muted-foreground truncate">{c.company_name}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {issues.length > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
                            {issues.length} warning
                          </Badge>
                        )}
                        {c.tags?.slice(0, 1).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                        {c.opp_status === "open" && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">Aperta</Badge>}
                        {c.opp_status === "won" && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">Vinta</Badge>}
                      </div>
                    </div>
                    {(c.email || c.opp_name) && (
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                        {c.opp_name
                          ? <span className="truncate">💼 {c.opp_name}{c.opp_value ? ` · € ${Number(c.opp_value).toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : ""}</span>
                          : <span className="truncate">{c.email}</span>
                        }
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {/* Mobile pagination */}
            {totalCount > pageSize && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prec
                </Button>
                <span className="text-xs text-muted-foreground">{page} / {Math.ceil(totalCount / pageSize)}</span>
                <Button variant="outline" size="sm" disabled={page * pageSize >= totalCount} onClick={() => setPage(page + 1)}>
                  Succ <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ContactsTable
              contacts={contacts}
              totalCount={totalCount}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleAll={handleToggleAll}
              onEdit={handleEdit}
              onDelete={(ids) => deleteMutation.mutate(ids)}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={(f, d) => { setSortField(f); setSortDirection(d); setPage(1); }}
              bulkActions={
                <div className="flex flex-wrap items-center gap-2">
                  {selectedQualitySummary.issues > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {selectedQualitySummary.issues} warning selezione
                    </Badge>
                  )}
                  {selectedQualitySummary.optout > 0 && (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                      {selectedQualitySummary.optout} no marketing
                    </Badge>
                  )}
                  {companyId === PLATFORM_ADMIN_COMPANY_ID && (
                    <BulkEnrichButton selectedIds={selectedIds} onDone={() => queryClient.invalidateQueries({ queryKey: ["marketing_contacts"] })} />
                  )}
                  <BulkTagsDialog selectedIds={selectedIds} />
                  <BulkCreateOpportunitiesDialog selectedIds={selectedIds} />
                  <AddToListDropdown selectedIds={selectedIds} />
                  <BulkEnrollAutomationDropdown selectedIds={selectedIds} />
                </div>
              }
              visibleColumns={visibleColumns}
              customFields={contactCustomFields}
              customFieldValues={customFieldValues}
              canEdit={canEditContacts}
              onOpenPreview={setPreviewContact}
            />
          )}
          </div>
        </>
      )}

      {/* Sheets */}
      <ContactFieldsSheet
        open={fieldsSheetOpen}
        onOpenChange={setFieldsSheetOpen}
        visibleColumns={visibleColumns}
        onApply={handleApplyColumns}
        customFields={contactCustomFields}
      />
      <ContactFiltersSheet
        open={filtersSheetOpen}
        onOpenChange={setFiltersSheetOpen}
        filters={filters}
        onApply={handleApplyFilters}
        availableTags={availableTags}
        pipelines={pipelines}
        customFields={contactCustomFields}
      />

      {/* Dialogs */}
      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => saveMutation.mutateAsync(data)}
        initialData={editingContact ? {
          first_name: editingContact.first_name,
          last_name: editingContact.last_name || "",
          phone: editingContact.phone || "",
          email: editingContact.email || "",
          company_name: editingContact.company_name || "",
          city: editingContact.city || "",
          province: editingContact.province || "",
          tags: editingContact.tags,
          notes: editingContact.notes || "",
          source: editingContact.source || "",
        } : undefined}
        isEditing={!!editingContact}
        companyId={companyId}
        editingContactId={editingContact?.id}
      />
      <ContactProfileDrawer
        contact={previewContact}
        companyId={companyId}
        open={!!previewContact}
        onOpenChange={(open) => {
          if (!open) setPreviewContact(null);
        }}
        onEdit={handleEdit}
        canEdit={canEditContacts}
      />
    </div>
  );
}
