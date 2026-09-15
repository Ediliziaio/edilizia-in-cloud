import { useState, useMemo, useEffect, useRef, forwardRef } from "react";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import { useParams, useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Phone, Mail, Star, ChevronDown, ChevronLeft, ChevronRight, Plus, Send, Search,
  Bell, User, X, Filter,
  Loader2, AlertCircle, MessageSquare, Smartphone, Merge, UserCheck,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotaModificabile } from "@/components/marketing/NotaModificabile";
import { puoModificareNota } from "@/lib/marketing/modificaNota";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListinoClienteCard } from "@/components/crm/ListinoClienteCard";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { NewPreventivoMenu } from "@/components/marketing/preventivi/NewPreventivoMenu";
import { MessageTemplatePicker } from "@/components/templates/MessageTemplatePicker";
import { buildTemplateVars } from "@/lib/messageTemplateVars";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagSelector } from "@/components/marketing/TagSelector";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { syncTagsToOpportunities, removeTagFromOpportunities } from "@/hooks/useTagSync";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { LinkedRendersList } from "@/components/render/LinkedRendersList";
import { ContactTrackingPanel } from "@/components/marketing/contacts/ContactTrackingPanel";
import { MarketingDocumentsPanel } from "@/components/marketing/MarketingDocumentsPanel";
import { ContactAIConversations } from "@/modules/ai-agents/components/ContactAIConversations";
import { ContactDndTab } from "@/components/marketing/ContactDndTab";
import { ContactActionsTab } from "@/components/marketing/ContactActionsTab";
import { ContactMergeDialog } from "@/components/marketing/ContactMergeDialog";
import { ContactSmsLog } from "@/components/marketing/ContactSmsLog";
import { ContactAttributionTab } from "@/components/contacts/ContactAttributionTab";
import { ContactInvoicesPanel } from "@/components/marketing/ContactInvoicesPanel";
import { UnifiedContactTimeline } from "@/components/marketing/UnifiedContactTimeline";
import { LogCallButton } from "@/components/marketing/LogCallButton";
import { normalizeTagList, normalizeTagName } from "@/lib/marketingTags";
import { RefreshCw, CalendarDays, Sparkles, Radar, Building2, Globe, AtSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

// ── Extracted sub-components ──
import { InlineField } from "@/components/marketing/contacts/InlineField";
import { ContactAppointmentsPanel } from "@/components/marketing/contacts/ContactAppointmentsPanel";
import { OpportunitiesPanel } from "@/components/marketing/contacts/OpportunitiesPanel";
import { ContactQuotesPanel } from "@/components/marketing/contacts/ContactQuotesPanel";
import { getDateLabel, RIGHT_TABS, type RightTab } from "@/components/marketing/contacts/activityHelpers";
import { getAvatarColor } from "@/lib/contactUtils";

// 2026-05-27 (richiesta utente CC/CCN): parser email CSV/space-separated,
// lowercase, dedup, validazione basica. Restituisce undefined se input vuoto
// per evitare di mandare `cc: []` inutile alla edge function.
function parseEmailList(raw: string): string[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  const seen = new Set<string>();
  const list = raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => {
      if (!e || !e.includes("@") || !e.includes(".")) return false;
      if (seen.has(e)) return false;
      seen.add(e);
      return true;
    });
  return list.length > 0 ? list : undefined;
}

const MarketingContactDetail = forwardRef<HTMLDivElement>(function MarketingContactDetail(_props, _ref) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const canEditContacts = permissions.canEditMarketingContacts || permissions.canEditMarketing;

  const [rightTab, setRightTab] = useState<RightTab | null>("notes");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "whatsapp_locale" | "email" | "sms">("whatsapp");
  // Contesto piattaforma (superadmin): niente Preventivo (l'opzione non esiste lì)
  // e in più il canale WhatsApp Locale (pool numeri non-ufficiali, solo piattaforma).
  const isPlatformContext = effectiveCompany?.id === PLATFORM_ADMIN_COMPANY_ID;
  const [waLocaleSending, setWaLocaleSending] = useState(false);
  // Auto-grow della textarea composer: cresce col contenuto fino a max-height,
  // poi scrolla. shadcn Textarea è statica, quindi lo facciamo a mano.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };
  // Reset altezza quando il testo si svuota (dopo l'invio) o cambia canale.
  useEffect(() => {
    if (composerRef.current && !messageText) composerRef.current.style.height = "auto";
  }, [messageText, messageChannel]);
  // Arricchimento dati via motore lead-scraper (solo piattaforma):
  // pre-flight (conferma/ricerca sito) → scraping sito + VIES (visura light)
  // + firmografici/PEC openapi.it → verifica di coerenza P.IVA sito↔contatto.
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<Record<string, unknown> | null>(null);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichSetupOpen, setEnrichSetupOpen] = useState(false);
  const [enrichWebsite, setEnrichWebsite] = useState("");
  const [enrichPiva, setEnrichPiva] = useState("");
  const [enrichName, setEnrichName] = useState("");
  const [findingSite, setFindingSite] = useState(false);
  const [siteCandidates, setSiteCandidates] = useState<Array<{ url: string; domain: string; title: string }> | null>(null);
  // Visura camerale on-demand (openapi.it IT-advanced): anagrafica completa,
  // bilancio, soci, amministratori, PEC, ATECO. Consuma crediti openapi.
  const [visuraLoading, setVisuraLoading] = useState(false);
  const [visuraResult, setVisuraResult] = useState<{ ok: boolean; fields?: Record<string, unknown>; error?: string; contact_updated?: string[] } | null>(null);
  const [visuraOpen, setVisuraOpen] = useState(false);
  // Trova/verifica email (solo piattaforma)
  const [findingEmail, setFindingEmail] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  // Seed per il composer WhatsApp (precompila il testo dai template, stesso
  // meccanismo seedText/seedAt usato in QuickContactSendDialog).
  const [waSeedText, setWaSeedText] = useState("");
  const [waSeedAt, setWaSeedAt] = useState(0);
  // 2026-05-27 (richiesta utente): CC + BCC (CCN) per channel=email.
  // Toggle stile Gmail. Stringa CSV/space parsata in submit.
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailCcVisible, setEmailCcVisible] = useState(false);
  const [emailBccVisible, setEmailBccVisible] = useState(false);

  // ── Fetch calendars for appointment dialog ──
  const { data: calendarsList = [] } = useQuery({
    queryKey: ["marketing-calendars-for-contact", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_calendars")
        .select("id, name, base_lat, base_lng, base_formatted_address, duration_minutes")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  // FIX: scope "sales" — mostra solo ruoli commerciali (admin, salesperson,
  // call_center). Esclude clienti, referrer, operai generici.
  // Prima le 4 query prendevano tutti gli staff_permissions, incluso i
  // clienti con riga orfana.
  const { data: allStaff = [] } = useCompanyStaffUsers(companyId, "sales");
  const staffUsers = allStaff;

  // ── Fetch contact ──
  const { data: contact, isLoading, isError, refetch } = useQuery({
    queryKey: ["marketing_contact", id],
    queryFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("*")
        .eq("id", id!)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch all contact IDs for navigation ──
  const { data: contactIds = [] } = useQuery({
    queryKey: ["marketing_contact_ids", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((c: any) => c.id);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const currentIdx = contactIds.indexOf(id || "");
  const totalContacts = contactIds.length;
  const prevId = currentIdx > 0 ? contactIds[currentIdx - 1] : null;
  const nextId = currentIdx < contactIds.length - 1 ? contactIds[currentIdx + 1] : null;

  // FIX: allStaff centralizzato — alias sulle 3 liste che erano duplicate
  const staff = allStaff;
  const salespeople = allStaff;
  const callCenterUsers = allStaff;

  // ── Fetch custom fields (solo tipo "contact") ──
  const { data: customFields = [] } = useContactCustomFields();

  // ── Fetch custom field values ──
  const { data: fieldValues = [] } = useQuery({
    queryKey: ["marketing_contact_field_values", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("marketing_contact_field_values")
        .select("*")
        .eq("contact_id", id);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // Campi del contatto risolti per le variabili dei template WhatsApp
  // (chiavi allineate al catalogo templateVariableFields + cf:<id> personalizzati).
  const waContactFields = useMemo<Record<string, string>>(() => {
    const c = contact as Record<string, unknown> | undefined;
    if (!c) return {};
    const get = (k: string) => { const v = c[k]; return v == null ? "" : String(v); };
    const fields: Record<string, string> = {
      nome: get("first_name"),
      cognome: get("last_name"),
      nome_completo: `${get("first_name")} ${get("last_name")}`.trim(),
      telefono: get("phone"),
      email: get("email"),
      azienda: get("company_name"),
      citta: get("city"),
      provincia: get("province"),
      indirizzo: get("address"),
      cap: get("postal_code"),
    };
    for (const fv of fieldValues as Array<{ field_id?: string; value?: string | null }>) {
      if (fv?.field_id) fields[`cf:${fv.field_id}`] = fv.value ?? "";
    }
    return fields;
  }, [contact, fieldValues]);

  // ── Fetch activities ──
  const { data: activities = [] } = useQuery({
    queryKey: ["marketing_contact_activities", id],
    queryFn: async () => {
      if (!id || !companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_activities")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch notes ──
  const { data: notes = [] } = useQuery({
    queryKey: ["marketing_contact_notes", id],
    queryFn: async () => {
      if (!id || !companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch contact messages ──
  useQuery({
    queryKey: ["contact_messages", id],
    queryFn: async () => {
      if (!id || !companyId) return [];
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .eq("contact_id", id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch KPI consolidati per Hero header (opportunità + valore) ──
  const { data: kpis } = useQuery({
    queryKey: ["marketing_contact_kpis", id],
    queryFn: async () => {
      if (!id || !companyId) return null;
      const [oppsRes, apptRes] = await Promise.all([
        supabase
          .from("marketing_opportunities")
          .select("id, status, value")
          .eq("contact_id", id)
          .eq("company_id", companyId)
          // Le opportunità eliminate (con note o documenti restano in archivio) non contano.
          .is("deleted_at", null),
        supabase
          // "marketing_appointments" non esiste: la tabella e' "appointments".
          .from("appointments")
          .select("id, status", { count: "exact", head: true })
          .eq("contact_id", id)
          .eq("company_id", companyId),
      ]);
      const opps = (oppsRes.data ?? []) as Array<{ status: string; value: number | null }>;
      const openOpps = opps.filter((o) => o.status === "open");
      const wonOpps = opps.filter((o) => o.status === "won");
      const openValue = openOpps.reduce((s, o) => s + (Number(o.value) || 0), 0);
      const wonValue = wonOpps.reduce((s, o) => s + (Number(o.value) || 0), 0);
      return {
        totalOpps: opps.length,
        openOppsCount: openOpps.length,
        wonOppsCount: wonOpps.length,
        openValue,
        wonValue,
        apptsCount: apptRes.count ?? 0,
      };
    },
    enabled: !!id && !!companyId,
    staleTime: 60_000,
  });

  // ── Send message mutation ──
  // 2026-05-27: supporto CC/BCC per channel=email.
  // Edge function `send-contact-message` riceve cc[] e bcc[] opzionali.
  const sendMessage = useMutation({
    mutationFn: async (params: { channel: string; content: string; subject?: string; cc?: string[]; bcc?: string[]; wa_number_id?: string | null; template?: { name: string; language: string; variables: string[] } | null }) => {
      const { data, error } = await supabase.functions.invoke("send-contact-message", {
        body: { contact_id: id, ...params },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error || "Invio fallito");
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["contact_messages", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
      setMessageText("");
      setEmailSubject("");
      setEmailCc("");
      setEmailBcc("");
      setEmailCcVisible(false);
      setEmailBccVisible(false);
      const channelLabel = vars.channel === "whatsapp" ? "WhatsApp" : vars.channel === "email" ? "Email" : "SMS";
      toast.success(`Messaggio ${channelLabel} inviato`);
    },
    onError: (e: any) => toast.error(e.message || "Errore invio messaggio"),
  });

  // Invio WhatsApp Locale (OpenWA, solo contesto piattaforma): passa dal
  // gateway con rotazione numero per tag/capacità, bypass quiet-hours (manuale).
  const sendWaLocale = async () => {
    const text = messageText.trim();
    const to = (contact?.phone ?? "").replace(/\D/g, "");
    if (!text || to.length < 6 || waLocaleSending) return;
    setWaLocaleSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: { action: "send_text", contact_id: id ?? null, to, text },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setMessageText("");
      toast.success("Messaggio WhatsApp Locale inviato");
      queryClient.invalidateQueries({ queryKey: ["contact_messages", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
      // Il messaggio vive in openwa_messages: senza questa invalidazione la
      // bolla appena inviata non comparirebbe in timeline fino al refetch.
      queryClient.invalidateQueries({ queryKey: ["unified_wa_locale", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore invio WhatsApp Locale");
    } finally {
      setWaLocaleSending(false);
    }
  };

  // Pre-flight arricchimento: apre il dialog con i dati del contatto, così
  // l'operatore VERIFICA (o trova) il sito giusto prima di lanciare lo scraping.
  const openEnrichSetup = () => {
    if (!contact) return;
    setEnrichWebsite(contact.website?.trim() || "");
    setEnrichPiva((contact as { vat_number?: string | null }).vat_number?.trim() || "");
    setEnrichName(
      contact.company_name?.trim()
        || [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim()
        || "",
    );
    setSiteCandidates(null);
    setEnrichSetupOpen(true);
  };

  // Ricerca del sito ufficiale dal nome (DuckDuckGo filtrato dagli aggregatori):
  // restituisce candidati, la scelta resta all'operatore.
  const findWebsite = async () => {
    if (findingSite || !enrichName.trim()) return;
    setFindingSite(true);
    setSiteCandidates(null);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "find_website", business_name: enrichName.trim(), city: contact?.city || null, province: (contact as { province?: string | null })?.province || null },
      });
      if (error) throw error;
      setSiteCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ricerca sito fallita");
      setSiteCandidates([]);
    } finally {
      setFindingSite(false);
    }
  };

  // Esecuzione: usa i valori CONFERMATI nel pre-flight (non i campi grezzi del
  // contatto); il motore compila da solo i campi CRM vuoti.
  const runEnrich = async () => {
    if (enriching) return;
    const website = enrichWebsite.trim() || null;
    const piva = enrichPiva.replace(/\s/g, "") || null;
    const businessName = enrichName.trim() || null;
    if (!website && !piva && !businessName) {
      toast.error("Servono almeno sito web, P.IVA o ragione sociale");
      return;
    }
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "enrich_company", website, partita_iva: piva, business_name: businessName, vies: true, contactId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setEnrichResult(data as Record<string, unknown>);
      setEnrichSetupOpen(false);
      setEnrichOpen(true);
      // Traccia in timeline + ricarica il contatto (il motore può aver riempito campi)
      const updated = Array.isArray(data?.contact_updated) ? data.contact_updated as string[] : [];
      await supabase.from("marketing_contact_activities").insert({
        contact_id: id!,
        company_id: companyId!,
        activity_type: "updated",
        description: updated.length
          ? `Arricchimento scraper: compilati ${updated.join(", ")}`
          : "Arricchimento scraper eseguito",
        created_by: user?.id,
        metadata: { source: "lead-scraper", fields: updated, website },
      });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
      toast.success(updated.length ? `Contatto arricchito: ${updated.length} campi compilati` : "Arricchimento completato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore arricchimento");
    } finally {
      setEnriching(false);
    }
  };

  // Visura camerale on-demand: usa la P.IVA (dal campo o dal contatto) e
  // chiama enrich_visura (openapi.it IT-advanced). Consuma crediti openapi.
  const runVisura = async () => {
    if (visuraLoading) return;
    const piva = (enrichPiva.replace(/\D/g, "") || (contact as { vat_number?: string | null })?.vat_number?.replace(/\D/g, "")) || "";
    if (piva.length !== 11) {
      toast.error("Serve una P.IVA valida (11 cifre) per la visura");
      return;
    }
    setVisuraLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "enrich_visura", partita_iva: piva, contactId: id },
      });
      if (error) throw error;
      setVisuraResult(data as { ok: boolean; fields?: Record<string, unknown>; error?: string; contact_updated?: string[] });
      setEnrichSetupOpen(false);
      setVisuraOpen(true);
      if (data?.ok) {
        const updated = Array.isArray(data?.contact_updated) ? data.contact_updated as string[] : [];
        await supabase.from("marketing_contact_activities").insert({
          contact_id: id!,
          company_id: companyId!,
          activity_type: "updated",
          description: updated.length ? `Visura openapi: compilati ${updated.join(", ")}` : "Visura camerale openapi scaricata",
          created_by: user?.id,
          metadata: { source: "openapi-visura", fields: updated, piva },
        });
        queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
        queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
        toast.success(updated.length ? `Visura ok: ${updated.length} campi compilati` : "Visura scaricata");
      } else {
        toast.error(data?.error || "Visura non disponibile");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore visura");
    } finally {
      setVisuraLoading(false);
    }
  };

  // Trova email: scraping sito + guess pattern + MX (gratis)
  const runFindEmail = async () => {
    if (findingEmail) return;
    setFindingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "find_contact_email", contactId: id },
      });
      if (error) throw error;
      if (data?.email) {
        toast.success(data.status === "guessed" ? `Email probabile trovata: ${data.email} (ipotesi su dominio valido)` : `Email trovata: ${data.email}`);
        queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
      } else {
        toast.error("Nessuna email trovata: aggiungi il sito web e riprova.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore ricerca email");
    } finally {
      setFindingEmail(false);
    }
  };

  // Verifica email: sintassi + MX (+ provider se configurato)
  const runVerifyEmail = async () => {
    if (verifyingEmail || !contact?.email) return;
    setVerifyingEmail(true);
    setEmailStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: { action: "verify_contact_email", email: contact.email },
      });
      if (error) throw error;
      const s = String(data?.status || "");
      setEmailStatus(s);
      const msg: Record<string, string> = {
        valid: "Email valida e consegnabile ✓",
        mx_ok: "Dominio riceve email (MX ok) — probabilmente valida",
        invalid: "Email non valida ✗",
        no_mx: "Il dominio NON riceve email — probabilmente non valida",
        invalid_syntax: "Formato email non valido",
      };
      if (s === "invalid" || s === "no_mx" || s === "invalid_syntax") toast.error(msg[s] || s);
      else toast.success(msg[s] || s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore verifica email");
    } finally {
      setVerifyingEmail(false);
    }
  };

  const updateField = useMutation({
    mutationFn: async ({ field, value, extra }: { field: string; value: any; extra?: Record<string, any> }) => {
      if (!canEditContacts) throw new Error("Non hai i permessi per modificare i contatti");
      const { error } = await supabase
        .from("marketing_contacts")
        .update({ [field]: value, ...(extra ?? {}), updated_at: new Date().toISOString() })
        .eq("id", id!)
        .eq("company_id", companyId!);
      if (error) throw error;
      // Activity logging for field updates (except assigned_to which has a DB trigger)
      if (companyId && field !== "assigned_to") {
        await supabase.from("marketing_contact_activities").insert({
          contact_id: id!,
          company_id: companyId,
          activity_type: "updated",
          description: `Campo "${field}" aggiornato`,
          created_by: user?.id,
          metadata: { field, value },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Update custom field value ──
  const updateCustomField = useMutation({
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      if (!canEditContacts) throw new Error("Non hai i permessi per modificare i campi del contatto");
      const { error } = await supabase
        .from("marketing_contact_field_values")
        .upsert({ contact_id: id!, field_id: fieldId, value }, { onConflict: "contact_id,field_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_field_values", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Add note ──
  const addNote = useMutation({
    mutationFn: async (content: string) => {
      if (!companyId || !user?.id) return;
      const { error } = await supabase.from("marketing_contact_notes").insert({
        contact_id: id!,
        company_id: companyId,
        content,
        created_by: user.id,
      });
      if (error) throw error;
      // Note activity is now logged automatically via DB trigger
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_notes", id] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_activities", id] });
      setNewNote("");
      toast.success("Nota aggiunta");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Delete contact ──
  const deleteContact = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditContacts) throw new Error("Non hai i permessi per eliminare i contatti");
      const { error } = await supabase.from("marketing_contacts").delete().eq("id", id!).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto eliminato");
      navigate(`${routePrefix}/contatti`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 px-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription>Impossibile caricare il contatto. Verifica la connessione e riprova.</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Riprova
        </Button>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Contatto non trovato</p>
        <Button variant="outline" className="hidden md:inline-flex" onClick={() => navigate(`${routePrefix}/contatti`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Torna ai contatti
        </Button>
      </div>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name || ""}`.trim();
  const initials = `${contact.first_name?.[0] || ""}${contact.last_name?.[0] || ""}`.toUpperCase();

  const getFieldValue = (fieldId: string) => {
    return fieldValues.find((fv: any) => fv.field_id === fieldId)?.value || "";
  };

  // Group activities by date for date separators
  const groupedActivities: { label: string; items: any[] }[] = [];
  activities.forEach((act: any) => {
    const label = getDateLabel(act.created_at);
    const lastGroup = groupedActivities[groupedActivities.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push(act);
    } else {
      groupedActivities.push({ label, items: [act] });
    }
  });

  const rightPanelOpen = rightTab !== null;

  // Ultima attività (per Hero stat)
  const lastActivity = activities[0]?.created_at ?? contact.updated_at ?? contact.created_at;
  const lastActivityLabel = lastActivity
    ? format(new Date(lastActivity), "d MMM yyyy", { locale: it })
    : "—";
  const fmtMoney = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

  const aiScore = contact.ai_score as number | null | undefined;
  const aiTier = contact.ai_score_tier as string | null | undefined;
  const leadScore = (contact.lead_score ?? 0) as number;
  const icpTier = (contact.icp_tier as string | null) || "D";
  const tierColor =
    icpTier === "A" ? "bg-emerald-500 text-white" :
    icpTier === "B" ? "bg-blue-500 text-white" :
    icpTier === "C" ? "bg-amber-500 text-white" :
    "bg-slate-400 text-white";

  return (
    // Altezza definita per il layout a colonne con scroll interno. In area admin
    // (contesto piattaforma) la top-bar + padding del <main> sono più alti, quindi
    // sottraiamo di più: senza, il composer in fondo veniva tagliato.
    <div className={cn(
      "flex flex-col min-h-[calc(100dvh-8rem)] md:overflow-hidden bg-background",
      isPlatformContext ? "md:h-[calc(100dvh-8rem)]" : "md:h-[calc(100dvh-3.5rem)]",
    )}>
      <div className="px-3 pt-2">
        <ApiHealthBanner filter={["whatsapp", "email_marketing"]} />
      </div>

      {/* ══════════ HERO HEADER — full width ══════════
          MOBILE: ultra-compact (1 riga identity + 3 quick action max, KPI scroll horizontal)
          DESKTOP: full layout (avatar XL, badges, KPI grid 4 col) */}
      <div className="border-b bg-gradient-to-b from-card to-background shrink-0">
        {/* Breadcrumb + nav — solo desktop */}
        <div className="hidden md:flex items-center justify-between px-3 sm:px-5 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(`${routePrefix}/contatti`)} title="Torna ai contatti">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground truncate">
              Contatti / <span className="text-foreground">{fullName || "—"}</span>
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {totalContacts > 0 && (
              <span className="text-[11px] text-muted-foreground mr-1">
                {currentIdx >= 0 ? currentIdx + 1 : "?"}/{totalContacts}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!prevId} onClick={() => prevId && navigate(`${routePrefix}/contatti/${prevId}`)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!nextId} onClick={() => nextId && navigate(`${routePrefix}/contatti/${nextId}`)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ─── MOBILE — design pulito stile WhatsApp/Linear ─── */}
        <div className="md:hidden">
          {/* Riga 1: back + breadcrumb + nav contatti compact */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => navigate(`${routePrefix}/contatti`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-0.5">
              {totalContacts > 0 && (
                <span className="text-[11px] text-muted-foreground mr-1">{currentIdx >= 0 ? currentIdx + 1 : "?"}/{totalContacts}</span>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!prevId} onClick={() => prevId && navigate(`${routePrefix}/contatti/${prevId}`)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!nextId} onClick={() => nextId && navigate(`${routePrefix}/contatti/${nextId}`)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                    <span className="text-lg leading-none">⋯</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditContacts && <DropdownMenuItem onClick={() => setMergeOpen(true)}><Merge className="h-3.5 w-3.5 mr-2" /> Unisci contatti</DropdownMenuItem>}
                  {canEditContacts && <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina contatto</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Identity card — avatar + nome BIG + badges + email/phone clickable */}
          <div className="px-4 pb-3 flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14 ring-2 ring-background shadow-sm">
                <AvatarFallback className={cn("text-base font-bold text-white", getAvatarColor(fullName))}>{initials || "?"}</AvatarFallback>
              </Avatar>
              <span className={cn("absolute -bottom-1 -right-1 inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ring-2 ring-background", tierColor)}>
                {icpTier}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold leading-tight truncate">{fullName || "Senza nome"}</h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {contact.contact_type && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 capitalize">{contact.contact_type}</Badge>
                )}
                {aiScore != null && (
                  <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-0 text-[9px] h-4 px-1.5 gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> {aiScore}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{lastActivityLabel}</span>
              </div>
            </div>
          </div>

          {/* Quick action bar — 4 bottoni FULL equal-width senza disabled */}
          <div className="px-3 pb-2 grid grid-cols-4 gap-2">
            <a
              href={contact.phone ? `tel:${contact.phone}` : undefined}
              className={cn(
                "h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-active",
                contact.phone ? "bg-emerald-500 text-white active:bg-emerald-600" : "bg-muted text-muted-foreground/40 pointer-events-none",
              )}
            >
              <Phone className="h-4 w-4" />
              <span className="text-[9px] font-medium">Chiama</span>
            </a>
            <a
              href={contact.email ? `mailto:${contact.email}` : undefined}
              className={cn(
                "h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-active",
                contact.email ? "bg-violet-500 text-white active:bg-violet-600" : "bg-muted text-muted-foreground/40 pointer-events-none",
              )}
            >
              <Mail className="h-4 w-4" />
              <span className="text-[9px] font-medium">Email</span>
            </a>
            <button
              type="button"
              onClick={() => contact.phone && setMessageChannel("whatsapp")}
              disabled={!contact.phone}
              className={cn(
                "h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-active",
                contact.phone ? "bg-emerald-600 text-white active:bg-emerald-700" : "bg-muted text-muted-foreground/40",
              )}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="text-[9px] font-medium">WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab("appointments")}
              className="h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 bg-amber-100 text-amber-900 active:bg-amber-200"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="text-[9px] font-medium">Appunt.</span>
            </button>
          </div>

          {/* KPI strip compatto — 4 inline equal width (no scroll = layout stabile) */}
          <div className="px-3 pb-2 grid grid-cols-4 gap-1.5">
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-1.5 text-center">
              <p className="text-[8px] text-amber-700 uppercase font-semibold leading-none">Score</p>
              <p className="text-sm font-bold tabular-nums leading-tight text-amber-900 mt-0.5">{leadScore}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-center">
              <p className="text-[8px] text-emerald-700 uppercase font-semibold leading-none">Opp.</p>
              <p className="text-sm font-bold tabular-nums leading-tight text-emerald-900 mt-0.5">{kpis?.openOppsCount ?? 0}<span className="text-[9px] font-normal opacity-70">/{kpis?.totalOpps ?? 0}</span></p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5 text-center">
              <p className="text-[8px] text-blue-700 uppercase font-semibold leading-none">Appunt.</p>
              <p className="text-sm font-bold tabular-nums leading-tight text-blue-900 mt-0.5">{kpis?.apptsCount ?? 0}</p>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-1.5 text-center">
              <p className="text-[8px] text-rose-700 uppercase font-semibold leading-none">Attività</p>
              <p className="text-sm font-bold tabular-nums leading-tight text-rose-900 mt-0.5">{activities.length}</p>
            </div>
          </div>
        </div>

        {/* ─── DESKTOP HERO (md+) ─── */}
        <div className="hidden md:block px-3 sm:px-5 pb-3">
          <div className="flex items-center gap-5">
            {/* Identity */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-background shadow-md">
                  <AvatarFallback className={cn("text-lg sm:text-xl font-bold text-white", getAvatarColor(fullName))}>
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-1 -right-1 inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold ring-2 ring-background", tierColor)} title={`ICP Tier ${icpTier}`}>
                  {icpTier}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{fullName || "Senza nome"}</h1>
                  {contact.contact_type && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 capitalize">{contact.contact_type}</Badge>
                  )}
                  {aiScore != null && (
                    <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-0 text-[10px] h-5 px-1.5 gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> AI {aiScore}/100{aiTier ? ` · ${aiTier}` : ""}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors truncate">
                      <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                      <Phone className="h-3 w-3 shrink-0" /> {contact.phone}
                    </a>
                  )}
                  {contact.city && <span className="text-[11px]">📍 {contact.city}</span>}
                </div>
              </div>
            </div>

            {/* Quick actions desktop */}
            <div className="flex items-center gap-1.5 shrink-0">
              {contact.phone && (
                <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                  <a href={`tel:${contact.phone}`}><Phone className="h-3.5 w-3.5" /> Chiama</a>
                </Button>
              )}
              {contact.email && (
                <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
                  <a href={`mailto:${contact.email}`}><Mail className="h-3.5 w-3.5" /> Email</a>
                </Button>
              )}
              {contact.phone && (
                <Button variant="outline" size="sm" className="gap-1.5 h-9 border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200" onClick={() => setMessageChannel("whatsapp")}>
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => setRightTab("appointments")}><CalendarDays className="h-3.5 w-3.5" /> Appuntam.</Button>
              {/* Crea preventivo dal contatto — SOLO area azienda: nel CRM di
                  piattaforma (superadmin) i preventivi non esistono. */}
              {!isPlatformContext && <NewPreventivoMenu contactId={id ?? null} size="sm" label="Preventivo" />}
              {/* Arricchimento scraper — SOLO piattaforma: sito+VIES+firmografici */}
              {isPlatformContext && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                  disabled={enriching}
                  onClick={openEnrichSetup}
                  title="Scraping sito + VIES (visura light) + firmografici e PEC. Prima verifichi il sito, poi il motore compila i campi vuoti del contatto."
                >
                  {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />} Arricchisci
                </Button>
              )}
              {isPlatformContext && !contact.email && (
                <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled={findingEmail} onClick={runFindEmail} title="Cerca l'email dal sito o la deduce dal dominio (verifica MX)">
                  {findingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AtSign className="h-3.5 w-3.5" />} Trova email
                </Button>
              )}
              {isPlatformContext && contact.email && (
                <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled={verifyingEmail} onClick={runVerifyEmail} title="Verifica che l'email sia valida e consegnabile (sintassi + MX)">
                  {verifyingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AtSign className="h-3.5 w-3.5" />} Verifica email
                  {emailStatus === "valid" && <span className="text-emerald-600">✓</span>}
                  {emailStatus === "mx_ok" && <span className="text-emerald-600">✓</span>}
                  {(emailStatus === "invalid" || emailStatus === "no_mx") && <span className="text-red-600">✗</span>}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9"><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditContacts && (<DropdownMenuItem onClick={() => setMergeOpen(true)}><Merge className="h-3.5 w-3.5 mr-2" /> Unisci contatti</DropdownMenuItem>)}
                  {canEditContacts && (<DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina contatto</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* KPI strip 4 col desktop */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Lead Score</span><Star className="h-3 w-3 text-amber-500" /></div>
              <div className="flex items-baseline gap-1.5 mt-1"><span className="text-xl font-bold tabular-nums">{leadScore}</span><span className="text-[10px] text-muted-foreground">/ 100</span></div>
              <Progress value={leadScore} className="h-1 mt-1" />
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Opp. aperte</span><span className="text-[10px] text-emerald-600 font-bold">●</span></div>
              <div className="flex items-baseline gap-1.5 mt-1"><span className="text-xl font-bold tabular-nums">{kpis?.openOppsCount ?? 0}</span>{kpis && kpis.totalOpps > 0 && <span className="text-[10px] text-muted-foreground">/ {kpis.totalOpps} tot</span>}</div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{fmtMoney(kpis?.openValue ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Appuntam.</span><CalendarDays className="h-3 w-3 text-blue-500" /></div>
              <div className="flex items-baseline gap-1.5 mt-1"><span className="text-xl font-bold tabular-nums">{kpis?.apptsCount ?? 0}</span><span className="text-[10px] text-muted-foreground">totali</span></div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ultima att.</span><Bell className="h-3 w-3 text-rose-500" /></div>
              <div className="flex items-baseline gap-1.5 mt-1"><span className="text-sm font-bold leading-tight">{lastActivityLabel}</span></div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{activities.length} attività totali</p>
            </div>
          </div>

          {/* Convertito banner */}
          {contact.customer_profile_id && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-emerald-700 font-medium flex-1">Questo contatto è già stato convertito in cliente</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-emerald-700 underline" onClick={() => navigate(`/azienda/clienti/${contact.customer_profile_id}`)}>
                Apri scheda cliente →
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse lg:flex-row flex-1 lg:overflow-hidden">
      {/* ══════════ LEFT COLUMN / Anagrafica
          Desktop (lg+): colonna fissa 340px sinistra, scroll interno.
          Mobile/Tablet: stacked SOTTO la timeline, full width, no scroll interno. */}
      <div className="flex lg:w-[340px] lg:min-w-[340px] border-t lg:border-t-0 lg:border-r flex-col">
        {/* Header mobile della sezione anagrafica */}
        <div className="lg:hidden px-4 py-2 border-b bg-muted/30 sticky top-0 z-10">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Anagrafica completa
          </h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            {/* Titolare, Follower & Call Center */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <Label className="text-xs text-muted-foreground">Titolare</Label>
                </div>
                <Select
                  value={contact.assigned_to || ""}
                  onValueChange={(v) => updateField.mutate({ field: "assigned_to", value: v || null })}
                  disabled={!canEditContacts}
                >
                  <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                  <SelectContent>
                    {salespeople.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <Label className="text-xs text-muted-foreground">Follower</Label>
                </div>
                <Select
                  value={contact.follower_id || ""}
                  onValueChange={(v) => updateField.mutate({ field: "follower_id", value: v || null })}
                  disabled={!canEditContacts}
                >
                  <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <Label className="text-xs text-muted-foreground">Call Center</Label>
                </div>
                <Select
                  value={(contact as any).call_center_id || ""}
                  onValueChange={(v) => updateField.mutate({ field: "call_center_id", value: v || null })}
                  disabled={!canEditContacts}
                >
                  <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    {callCenterUsers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags / Etichette */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">
                  Etichette ({(contact.tags || []).length})
                </Label>
                {canEditContacts && (
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="end">
                    <div className="p-2">
                    <TagSelector
                      selectedTags={contact.tags || []}
                      onTagsChange={async (tags) => {
                        updateField.mutate({ field: "tags", value: tags });
                        // Sync new tags to linked opportunities
                        if (tags.length > 0 && id) {
                          await syncTagsToOpportunities(id, tags, companyId);
                          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
                        }
                      }}
                    />
                    </div>
                  </PopoverContent>
                </Popover>
                )}
              </div>
              {(contact.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-[11px] px-1.5 py-0 gap-1 h-5">
                      {tag}
                      {canEditContacts && (
                      <X className="h-2.5 w-2.5 cursor-pointer max-sm:box-content max-sm:p-2 max-sm:-mr-1 max-sm:-my-1" onClick={async () => {
                        updateField.mutate({
                          field: "tags",
                          value: normalizeTagList(contact.tags).filter((currentTag) => currentTag !== normalizeTagName(tag)),
                        });
                        // Remove tag from linked opportunities too
                        if (id) {
                          await removeTagFromOpportunities(id, tag, companyId);
                          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
                        }
                      }} />
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Left column tabs */}
            <Tabs defaultValue="all_fields" className="w-full">
              <TabsList className="w-full h-8 p-0.5">
                <TabsTrigger value="all_fields" className="flex-1 text-xs h-7">Tutti i campi</TabsTrigger>
                <TabsTrigger value="dnd" className="flex-1 text-xs h-7">DND</TabsTrigger>
                <TabsTrigger value="actions" className="flex-1 text-xs h-7">Azioni</TabsTrigger>
                <TabsTrigger value="listino" className="flex-1 text-xs h-7">Listino</TabsTrigger>
              </TabsList>

              <TabsContent value="listino" className="mt-2">
                {id && <ListinoClienteCard contactId={id} />}
              </TabsContent>

              <TabsContent value="all_fields" className="mt-2 space-y-2">
                {/* Search fields */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Cerca campi e cartelle"
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    className="h-7 text-[11px] pl-7 pr-7"
                  />
                  <Filter className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                </div>

                {/* Collapsible: Contatto */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                    Contatto
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-1 space-y-0">
                    <InlineField label="Nome" value={contact.first_name} onSave={(v) => updateField.mutate({ field: "first_name", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Cognome" value={contact.last_name || ""} onSave={(v) => updateField.mutate({ field: "last_name", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Email" value={contact.email || ""} onSave={(v) => updateField.mutate({ field: "email", value: v })} type="email" disabled={!canEditContacts} />
                    <InlineField label="Telefono" value={contact.phone || ""} onSave={(v) => updateField.mutate({ field: "phone", value: v })} type="tel" disabled={!canEditContacts} />
                    <InlineField label="Data di nascita" value={contact.date_of_birth || ""} onSave={(v) => updateField.mutate({ field: "date_of_birth", value: v || null })} type="date" disabled={!canEditContacts} />
                    <InlineField label="Fonte" value={contact.source || ""} onSave={(v) => updateField.mutate({ field: "source", value: v })} disabled={!canEditContacts} />
                    <InlineField
                      label="Tipo contatto"
                      value={contact.contact_type || "lead"}
                      onSave={(v) => updateField.mutate({ field: "contact_type", value: v })}
                      type="select"
                      options={["lead", "cliente", "partner", "fornitore", "altro"]}
                      disabled={!canEditContacts}
                    />
                  </CollapsibleContent>
                </Collapsible>

                {/* Collapsible: General Info */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                    Informazioni generali
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-1 space-y-0">
                    <InlineField label="Azienda" value={contact.company_name || ""} onSave={(v) => updateField.mutate({ field: "company_name", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Indirizzo" value={contact.address || ""} onSave={(v) => updateField.mutate({ field: "address", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Città" value={contact.city || ""} onSave={(v) => updateField.mutate({ field: "city", value: v })} disabled={!canEditContacts}
                      comuneMode="comune"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "city", value: c.comune });
                        updateField.mutate({ field: "province", value: c.provinciaSigla });
                        updateField.mutate({ field: "region", value: c.regione });
                        if (!contact.postal_code) updateField.mutate({ field: "postal_code", value: c.cap });
                      }}
                    />
                    <InlineField label="Provincia" value={contact.province || ""} onSave={(v) => updateField.mutate({ field: "province", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Regione" value={(contact as any).region || ""} onSave={(v) => updateField.mutate({ field: "region", value: v })} disabled={!canEditContacts} />
                    <InlineField label="CAP" value={contact.postal_code || ""} onSave={(v) => updateField.mutate({ field: "postal_code", value: v })} disabled={!canEditContacts}
                      comuneMode="cap"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "postal_code", value: c.cap });
                        updateField.mutate({ field: "city", value: c.comune });
                        updateField.mutate({ field: "province", value: c.provinciaSigla });
                        updateField.mutate({ field: "region", value: c.regione });
                      }}
                    />
                    <InlineField label="Paese" value={contact.country || ""} onSave={(v) => updateField.mutate({ field: "country", value: v })} disabled={!canEditContacts} />
                    <InlineField label="Sito web" value={contact.website || ""} onSave={(v) => updateField.mutate({ field: "website", value: v })} disabled={!canEditContacts} />
                  </CollapsibleContent>
                </Collapsible>

                {/* Collapsible: Custom Fields */}
                {customFields.length > 0 && (
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                      <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                      Campi personalizzati
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-1 space-y-0">
                      {customFields
                        .filter((cf: any) => !fieldSearch || cf.name.toLowerCase().includes(fieldSearch.toLowerCase()))
                        .map((cf: any) => (
                          <InlineField
                            key={cf.id}
                            label={cf.name}
                            value={getFieldValue(cf.id)}
                            onSave={(v) => updateCustomField.mutate({ fieldId: cf.id, value: v })}
                            type={cf.field_type === "select" ? "select" : cf.field_type === "date" ? "date" : cf.field_type === "number" ? "number" : "text"}
                            options={cf.field_type === "select" ? cf.options : undefined}
                            disabled={!canEditContacts}
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Collapsible: Lead Score */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                    Lead Score
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-1 space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Punteggio totale</span>
                      <span className="text-sm font-bold">{contact.lead_score ?? 0}/100</span>
                    </div>
                    <Progress value={contact.lead_score ?? 0} className="h-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">ICP Score</span>
                      <span className="text-xs font-medium">{contact.icp_score ?? 0}/50</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">ICP Tier</span>
                      <Badge variant={
                        contact.icp_tier === "A" ? "default" :
                        contact.icp_tier === "B" ? "secondary" : "outline"
                      } className="text-[10px] h-4 px-1.5">
                        {contact.icp_tier || "D"}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1 mt-1"
                      onClick={async () => {
                        if (!id || !companyId) return;
                        try {
                          // Fetch data for scoring
                          const [{ count: activitiesCount }, { count: oppsCount }, { data: openOpps }] = await Promise.all([
                            supabase.from("marketing_contact_activities").select("*", { count: "exact", head: true }).eq("contact_id", id),
                            supabase.from("marketing_opportunities").select("*", { count: "exact", head: true }).eq("contact_id", id).is("deleted_at", null),
                            supabase.from("marketing_opportunities").select("id").eq("contact_id", id).eq("status", "open").is("deleted_at", null),
                          ]);
                          const { data: recentActs } = await supabase.from("marketing_contact_activities")
                            .select("id").eq("contact_id", id)
                            .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
                            .limit(1);

                          const { calculateLeadScore, getIcpTier } = await import("@/utils/leadScoring");
                          const result = calculateLeadScore({
                            hasCompanyName: !!contact.company_name,
                            hasPhone: !!contact.phone,
                            hasAddress: !!contact.address,
                            source: contact.source,
                            city: contact.city,
                            icpOverride: null,
                            activitiesCount: activitiesCount || 0,
                            hasOpenOpportunity: (openOpps?.length || 0) > 0,
                            hasRecentActivity: (recentActs?.length || 0) > 0,
                            opportunitiesCount: oppsCount || 0,
                          });
                          const tier = getIcpTier(result.icpScore);
                          await supabase.from("marketing_contacts").update({
                            lead_score: result.leadScore,
                            icp_score: result.icpScore,
                            icp_tier: tier,
                            last_score_update: new Date().toISOString(),
                          }).eq("id", id).eq("company_id", companyId);
                          queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
                          toast.success(`Lead Score aggiornato: ${result.leadScore}/100 (Tier ${tier})`);
                        } catch (err: any) {
                          toast.error(err.message || "Errore ricalcolo");
                        }
                      }}
                    >
                      <RefreshCw className="h-3 w-3" /> Ricalcola
                    </Button>

                    {/* AI Score Silvio (FASE D) */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1 mt-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                      onClick={async () => {
                        if (!id || !companyId) return;
                        try {
                          toast.info("AI sta analizzando il contatto...");
                          const { data, error } = await supabase.functions.invoke("ai-lead-score", {
                            body: { contact_id: id, company_id: companyId },
                          });
                          if (error) throw error;
                          if (!data?.success) throw new Error(data?.error ?? "Scoring fallito");
                          const sc = data.scored?.[0];
                          if (sc?.error) throw new Error(sc.error);
                          queryClient.invalidateQueries({ queryKey: ["marketing_contact", id] });
                          toast.success(
                            `AI Score: ${sc?.score}/100 (${sc?.tier}) · ${sc?.next_action ?? ""}`,
                          );
                        } catch (err) {
                          toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`);
                        }
                      }}
                    >
                      <Sparkles className="h-3 w-3 text-violet-600" /> AI Score Silvio
                    </Button>

                    {/* AI Score result display */}
                    {contact.ai_score !== null && contact.ai_score !== undefined && (
                      <div className="mt-2 rounded border border-violet-200 bg-violet-50/50 p-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-violet-700 font-medium flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> AI Score
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-white">
                            {contact.ai_score}/100 · {contact.ai_score_tier ?? "—"}
                          </Badge>
                        </div>
                        {contact.ai_score_reasoning && (
                          <p className="text-[11px] text-violet-900 italic">
                            "{contact.ai_score_reasoning}"
                          </p>
                        )}
                        {contact.ai_next_action && (
                          <p className="text-[11px] text-violet-900">
                            <strong>Azione:</strong> {contact.ai_next_action}
                          </p>
                        )}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Collapsible: Attribuzione UTM */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                    Attribuzione
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {companyId && id && (
                      <ContactAttributionTab contactId={id} companyId={companyId} />
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Created info */}
                <div className="pt-2 text-[10px] text-muted-foreground px-1">
                  <p>Creato il: {format(new Date(contact.created_at), "dd MMM yyyy, HH:mm", { locale: it })}</p>
                  {contact.source && <p>Fonte: {contact.source}</p>}
                </div>
              </TabsContent>

              <TabsContent value="dnd" className="mt-2">
                <ContactDndTab
                  contact={contact}
                  onUpdate={(field, value, extra) => updateField.mutate({ field, value, extra })}
                />
              </TabsContent>

              <TabsContent value="actions" className="mt-2">
                <ContactActionsTab contact={contact} companyId={companyId!} />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>

      {/* ══════════ CENTER COLUMN — Timeline (Hero gestisce header/banner)
          Mobile: altezza limitata 60vh per non spingere troppo in basso l'anagrafica.
          Desktop: prende tutto lo spazio rimanente. */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-[60vh] lg:h-auto">
        {/* Azioni rapide sul contatto (registra chiamata manuale, senza centralino) */}
        <div className="shrink-0 flex items-center justify-end gap-2 border-b bg-white px-3 py-1.5">
          <LogCallButton companyId={companyId} contactId={id} userId={user?.id} />
        </div>
        {/* Unified Timeline — min-h-0 così il timeline si restringe e scrolla
            invece di spingere il composer fuori dal contenitore (bug flexbox). */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <UnifiedContactTimeline contactId={id!} companyId={companyId!} contactPhone={contact.phone} contactEmail={contact.email} />
        </div>

        {/* Message input bar */}
        <div className="border-t shrink-0 bg-muted/20">
          {/* Selettore canale a pillole. Il canale attivo ha pillola piena +
              anello colorato; gli altri sono muti. Solo i canali disponibili
              per i recapiti del contatto (email/telefono). */}
          <div className="flex items-center gap-1.5 px-3 pt-2.5 flex-wrap">
            {([
              contact.email && { key: "email" as const, icon: Mail, label: "Email", active: "bg-violet-100 text-violet-700 ring-1 ring-violet-300" },
              contact.phone && { key: "whatsapp" as const, icon: MessageSquare, label: "WhatsApp", active: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300" },
              contact.phone && isPlatformContext && { key: "whatsapp_locale" as const, icon: MessageSquare, label: "WA Locale", active: "bg-teal-100 text-teal-700 ring-1 ring-teal-300", title: "Canale non-ufficiale dal pool numeri della piattaforma (rotazione per tag e capacità giornaliera)" },
              contact.phone && { key: "sms" as const, icon: Smartphone, label: "SMS", active: "bg-sky-100 text-sky-700 ring-1 ring-sky-300" },
            ].filter(Boolean) as Array<{ key: typeof messageChannel; icon: typeof Mail; label: string; active: string; title?: string }>).map((ch) => {
              const Icon = ch.icon;
              const isActive = messageChannel === ch.key;
              return (
                <button
                  key={ch.key}
                  type="button"
                  onClick={() => setMessageChannel(ch.key)}
                  title={ch.title}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    isActive ? ch.active : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {ch.label}
                </button>
              );
            })}
          </div>
          {/* Riga contestuale: spiega il canale attivo (e per SMS/WA il limite). */}
          {messageChannel === "whatsapp_locale" && (
            <p className="px-3.5 pt-1.5 text-[11px] text-teal-700 flex items-center gap-1">
              <MessageSquare className="h-3 w-3 shrink-0" /> Canale non ufficiale · pool numeri piattaforma · nessuna finestra 24h
            </p>
          )}
          {messageChannel === "sms" && (
            <p className="px-3.5 pt-1.5 text-[11px] text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Messaggio breve</span>
              <span className={cn("tabular-nums", messageText.length > 160 && "text-amber-600 font-medium")}>
                {messageText.length} caratteri · {Math.max(1, Math.ceil(messageText.length / 160))} SMS
              </span>
            </p>
          )}
          {messageChannel === "email" && (
            <div className="px-3 pt-2 space-y-1.5">
              {/* Riga oggetto + toggle Cc/Ccn (stile Gmail) */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Oggetto email..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
                  className="border-0 bg-muted/50 shadow-none h-7 text-xs flex-1"
                />
                <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                  {!emailCcVisible && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline font-medium"
                      onClick={() => setEmailCcVisible(true)}
                    >
                      + Cc
                    </button>
                  )}
                  {!emailBccVisible && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline font-medium"
                      onClick={() => setEmailBccVisible(true)}
                    >
                      + Ccn
                    </button>
                  )}
                </div>
              </div>
              {/* Cc input (visible only on toggle) */}
              {emailCcVisible && (
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground w-8 shrink-0">Cc</Label>
                  <Input
                    placeholder="email1@esempio.it, email2@esempio.it"
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                    className="border-0 bg-muted/50 shadow-none h-7 text-xs flex-1"
                  />
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => { setEmailCcVisible(false); setEmailCc(""); }}
                  >
                    Rimuovi
                  </button>
                </div>
              )}
              {/* Ccn (Bcc) input (visible only on toggle) */}
              {emailBccVisible && (
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground w-8 shrink-0">Ccn</Label>
                  <Input
                    placeholder="nascosti@esempio.it (gli altri non vedono questi)"
                    value={emailBcc}
                    onChange={(e) => setEmailBcc(e.target.value)}
                    className="border-0 bg-muted/50 shadow-none h-7 text-xs flex-1"
                  />
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => { setEmailBccVisible(false); setEmailBcc(""); }}
                  >
                    Rimuovi
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-start px-3 pb-2.5 pt-1.5 gap-2">
            {/* Template picker — applica già le variabili; per email imposta
                oggetto+testo, per sms imposta il testo, per whatsapp fa il
                seed del composer. */}
            <MessageTemplatePicker
              channel={messageChannel === "whatsapp_locale" ? "whatsapp" : messageChannel}
              vars={buildTemplateVars({
                firstName: contact.first_name,
                lastName: contact.last_name,
                email: contact.email,
                phone: contact.phone,
                city: contact.city,
                address: contact.address,
                companyName: effectiveCompany?.name,
                custom: waContactFields,
              })}
              onInsert={({ subject, body }) => {
                if (messageChannel === "whatsapp") {
                  setWaSeedText(body);
                  setWaSeedAt((n) => n + 1);
                } else {
                  if (messageChannel === "email" && subject != null) setEmailSubject(subject.slice(0, 200));
                  setMessageText(body.slice(0, 5000)); // vale anche per whatsapp_locale
                }
              }}
              align="start"
              triggerClassName="h-9 md:h-7 gap-1.5 text-xs shrink-0"
            />
            {messageChannel === "whatsapp" ? (
              <WhatsAppComposer
                phone={contact.phone}
                isSending={sendMessage.isPending}
                className="flex-1"
                contactFields={waContactFields}
                seedText={waSeedText}
                seedAt={waSeedAt}
                onSend={async ({ waNumberId, content, template }) => {
                  await sendMessage.mutateAsync({
                    channel: "whatsapp",
                    content,
                    wa_number_id: waNumberId,
                    template,
                  });
                }}
              />
            ) : messageChannel === "whatsapp_locale" ? (
              <>
                <Textarea
                  ref={composerRef}
                  placeholder="Scrivi il messaggio WhatsApp…"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value.slice(0, 4096))}
                  onInput={(e) => autoGrow(e.currentTarget)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWaLocale(); } }}
                  rows={1}
                  className="border-0 bg-muted/50 shadow-none text-xs min-h-[36px] max-h-32 resize-none py-2 flex-1"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 self-end bg-teal-600 hover:bg-teal-700"
                  disabled={!messageText.trim() || waLocaleSending}
                  onClick={sendWaLocale}
                >
                  {waLocaleSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </>
            ) : (
              <>
                <Textarea
                  ref={composerRef}
                  placeholder={messageChannel === "email" ? "Scrivi l'email…" : "Scrivi l'SMS…"}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value.slice(0, 5000))}
                  onInput={(e) => autoGrow(e.currentTarget)}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && messageText.trim() && !sendMessage.isPending) {
                      e.preventDefault();
                      const cc = messageChannel === "email" ? parseEmailList(emailCc) : undefined;
                      const bcc = messageChannel === "email" ? parseEmailList(emailBcc) : undefined;
                      sendMessage.mutate({
                        channel: messageChannel,
                        content: messageText.trim(),
                        subject: messageChannel === "email" ? emailSubject.trim() || undefined : undefined,
                        cc, bcc,
                      });
                    }
                  }}
                  className="border-0 bg-muted/50 shadow-none text-xs min-h-[36px] max-h-32 resize-none py-2 flex-1"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 self-end"
                  disabled={!messageText.trim() || sendMessage.isPending}
                  onClick={() => {
                    const cc = messageChannel === "email" ? parseEmailList(emailCc) : undefined;
                    const bcc = messageChannel === "email" ? parseEmailList(emailBcc) : undefined;
                    sendMessage.mutate({
                      channel: messageChannel,
                      content: messageText.trim(),
                      subject: messageChannel === "email" ? emailSubject.trim() || undefined : undefined,
                      cc, bcc,
                    });
                  }}
                >
                  {sendMessage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ══════════ RIGHT SIDEBAR ══════════ */}
      {/* Content panel: sidebar su desktop, BOTTOM PANEL su mobile.
          Prima era hidden md:flex → su mobile la quick action "Appunt." non
          produceva nulla e i 10 pannelli (Documenti, Note, Opportunità…) erano
          irraggiungibili da telefono. */}
      {rightPanelOpen && (
        <>
          {/* Backdrop solo mobile: tap fuori = chiudi */}
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setRightTab(null)} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-50 flex h-[72dvh] flex-col rounded-t-2xl border-t bg-background shadow-2xl md:static md:z-auto md:h-auto md:w-64 md:rounded-none md:border-l md:border-t-0 md:shadow-none">
          {/* Panel header */}
          <div className="h-11 border-b flex items-center justify-between px-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {RIGHT_TABS.find(t => t.key === rightTab)?.label}
              </span>
              {rightTab === "documents" && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary">
                  <Plus className="h-3 w-3 mr-0.5" /> Aggiungi
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRightTab(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Su mobile: strip orizzontale per passare tra i pannelli (su desktop c'è la colonna icone a destra) */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none border-b px-2 py-1.5 md:hidden">
            {RIGHT_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRightTab(tab.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  rightTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2.5">
              {/* Tracking panel — resoconto storico attribuzione + richieste */}
              {rightTab === "tracking" && id && (
                <ContactTrackingPanel contactId={id} />
              )}

              {/* Documents panel */}
              {rightTab === "documents" && id && companyId && (
                <MarketingDocumentsPanel
                  contactId={id}
                  companyId={companyId}
                  compact
                />
              )}

              {/* AI Conversations panel */}
              {rightTab === "ai_conversations" && id && (
                <ContactAIConversations contactId={id} />
              )}

              {/* SMS Log panel */}
              {rightTab === "sms_log" && id && companyId && (
                <ContactSmsLog contactId={id} companyId={companyId} />
              )}

              {/* Activities panel - LinkedTasks (compatto: il pannello ha già
                  la sua intestazione, niente Card+titolo doppio) */}
              {rightTab === "activities" && id && companyId && (
                <div className="space-y-3">
                  <LinkedTasks
                    contactId={id}
                    category="contatti"
                    companyId={companyId}
                    embedded
                  />
                  <LinkedRendersList contactId={id} />
                </div>
              )}

              {/* Notes panel */}
              {rightTab === "notes" && (
                <div className="space-y-2.5">
                  <Textarea
                    placeholder="Scrivi una nota..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    className="text-[11px] min-h-[60px]"
                  />
                  <Button
                    size="sm"
                    className="w-full h-7 text-[11px]"
                    disabled={!newNote.trim() || addNote.isPending}
                    onClick={() => addNote.mutate(newNote.trim())}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Aggiungi nota
                  </Button>
                  <div className="space-y-2 pt-1">
                    {notes.map((note: any) => (
                      <NotaModificabile
                        key={note.id}
                        nota={note}
                        compatta
                        className="rounded bg-muted/50 p-2 space-y-0.5"
                        puoModificare={puoModificareNota(note, {
                          userId: user?.id,
                          isAdmin: permissions.isAdmin,
                          puoModificareContatti: permissions.canEditMarketingContacts,
                          soloAssegnati: permissions.onlyAssigned,
                        })}
                        intestazione={
                          note.opportunity_id ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 mb-0.5">Opportunità</Badge>
                          ) : null
                        }
                      />
                    ))}
                    {notes.length === 0 && (
                      <p className="text-[11px] text-muted-foreground text-center py-4">Nessuna nota</p>
                    )}
                  </div>
                </div>
              )}

              {/* Appointments panel */}
              {rightTab === "appointments" && id && companyId && (
                <ContactAppointmentsPanel
                  contactId={id}
                  companyId={companyId}
                  contactName={fullName}
                  calendars={calendarsList}
                  users={staffUsers}
                />
              )}

              {rightTab === "opportunities" && (
                <OpportunitiesPanel contactId={id!} companyId={companyId!} />
              )}

              {/* Quotes panel */}
              {rightTab === "quotes" && id && companyId && (
                <ContactQuotesPanel contactId={id} companyId={companyId} />
              )}

              {/* Invoices panel */}
              {rightTab === "invoices" && id && companyId && (
                <ContactInvoicesPanel contactId={id} companyId={companyId} />
              )}

              {/* Settings panel */}
              {rightTab === "settings" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-[11px] font-medium">Lingua preferita</Label>
                    <Select
                      value={(contact as any).preferred_language || "italiano"}
                      onValueChange={(val) => updateField.mutate({ field: "preferred_language", value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="italiano">Italiano</SelectItem>
                        <SelectItem value="inglese">Inglese</SelectItem>
                        <SelectItem value="tedesco">Tedesco</SelectItem>
                        <SelectItem value="francese">Francese</SelectItem>
                        <SelectItem value="spagnolo">Spagnolo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px] font-medium">Canale preferito</Label>
                    <Select
                      value={(contact as any).preferred_channel || "whatsapp"}
                      onValueChange={(val) => updateField.mutate({ field: "preferred_channel", value: val })}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3 pt-2 border-t">
                    <Label className="text-[11px] font-medium">Opt-out comunicazioni</Label>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-[11px]">WhatsApp</span>
                      </div>
                      <Switch
                        checked={(contact as any).optout_whatsapp || false}
                        onCheckedChange={(checked) => updateField.mutate({ field: "optout_whatsapp", value: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-violet-600" />
                        <span className="text-[11px]">Email</span>
                      </div>
                      <Switch
                        checked={(contact as any).optout_email || false}
                        onCheckedChange={(checked) => updateField.mutate({ field: "optout_email", value: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-[11px]">SMS</span>
                      </div>
                      <Switch
                        checked={(contact as any).optout_sms || false}
                        onCheckedChange={(checked) => updateField.mutate({ field: "optout_sms", value: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-orange-600" />
                        <span className="text-[11px]">Chiamate</span>
                      </div>
                      <Switch
                        checked={(contact as any).optout_call || false}
                        onCheckedChange={(checked) => updateField.mutate({ field: "optout_call", value: checked })}
                      />
                    </div>
                    {(contact as any).unsubscribed && (
                      <div className="text-[10px] text-destructive flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3" />
                        Disiscritto il {(contact as any).unsubscribed_at ? format(new Date((contact as any).unsubscribed_at), "dd/MM/yyyy", { locale: it }) : "data sconosciuta"}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          </div>
        </>
      )}

      {/* Vertical icon strip — solo desktop (su mobile usa l'hero quick actions) */}
      <div className="hidden md:flex w-10 border-l flex-col items-center py-2 gap-1 bg-muted/30 shrink-0">
        {RIGHT_TABS.map((tab) => (
          <Tooltip key={tab.key}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "h-8 w-8 rounded flex items-center justify-center transition-colors",
                  rightTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setRightTab(rightTab === tab.key ? null : tab.key)}
              >
                <tab.icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{tab.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Merge dialog */}
      <ContactMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        sourceContact={contact ? { id: contact.id, first_name: contact.first_name || "", last_name: contact.last_name || "", email: contact.email || undefined, phone: contact.phone || undefined } : null}
        companyId={companyId!}
        onMerged={(keepId) => {
          // Se il contatto corrente è stato fuso via, vai sul sopravvissuto.
          if (keepId !== contact?.id) navigate(`${routePrefix}/contatti/${keepId}`);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo contatto?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Tutti i dati associati verranno eliminati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteContact.mutate()}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pre-flight arricchimento: verifica/trova il sito PRIMA dello scraping */}
      <Dialog open={enrichSetupOpen} onOpenChange={setEnrichSetupOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radar className="h-4 w-4 text-orange-600" /> Arricchisci contatto</DialogTitle>
            <DialogDescription className="text-xs">
              Controlla che il sito sia quello giusto (o cercalo dal nome): lo scraping legge email, telefoni e P.IVA da lì.
              VIES e registri usano la P.IVA. I campi vuoti del contatto verranno compilati.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ragione sociale</Label>
              <Input value={enrichName} onChange={(e) => setEnrichName(e.target.value)} placeholder="Es. Rossi Costruzioni SRL" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sito web</Label>
              <div className="flex gap-1.5">
                <Input value={enrichWebsite} onChange={(e) => setEnrichWebsite(e.target.value)} placeholder="https://…" className="h-8 text-xs flex-1" />
                {enrichWebsite.trim() && (
                  <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs shrink-0" title="Apri il sito per controllarlo">
                    <a href={enrichWebsite.startsWith("http") ? enrichWebsite : `https://${enrichWebsite}`} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" /></a>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1" disabled={findingSite || !enrichName.trim()} onClick={findWebsite}>
                  {findingSite ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Cerca sito
                </Button>
              </div>
              {siteCandidates !== null && (
                siteCandidates.length > 0 ? (
                  <div className="rounded-md border divide-y mt-1">
                    {siteCandidates.map((c) => (
                      <button
                        key={c.domain}
                        type="button"
                        onClick={() => setEnrichWebsite(c.url)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/60 transition-colors",
                          enrichWebsite === c.url && "bg-orange-50",
                        )}
                      >
                        <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-medium shrink-0">{c.domain}</span>
                        <span className="text-muted-foreground truncate flex-1">{c.title}</span>
                        <a
                          href={c.url} target="_blank" rel="noreferrer"
                          className="text-[10px] text-primary underline shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          apri
                        </a>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">Nessun candidato trovato: inserisci il sito a mano o vai di P.IVA.</p>
                )
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">P.IVA</Label>
              <Input value={enrichPiva} onChange={(e) => setEnrichPiva(e.target.value)} placeholder="11 cifre (per VIES e registro imprese)" className="h-8 text-xs" />
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">Basta uno dei tre campi; più ne dai, meglio incrocia.</p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <Button size="sm" className="flex-1 gap-1.5 bg-orange-600 hover:bg-orange-700" disabled={enriching || (!enrichWebsite.trim() && !enrichPiva.trim() && !enrichName.trim())} onClick={runEnrich}>
                {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />} Avvia arricchimento
              </Button>
              {/* Visura/bilancio openapi (a parte perché consuma crediti openapi
                  e richiede la P.IVA): anagrafica camerale completa + bilancio + soci */}
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 border-slate-300"
                disabled={visuraLoading || (enrichPiva.replace(/\D/g, "").length !== 11 && ((contact as { vat_number?: string | null })?.vat_number?.replace(/\D/g, "").length !== 11))}
                onClick={runVisura}
                title="Scarica la visura camerale da openapi.it (bilancio, soci, PEC, ATECO…). Richiede P.IVA e consuma crediti openapi."
              >
                {visuraLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />} Visura / bilancio
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Risultati arricchimento scraper (solo piattaforma) */}
      <Dialog open={enrichOpen} onOpenChange={setEnrichOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radar className="h-4 w-4 text-orange-600" /> Dati trovati dallo scraper</DialogTitle>
            <DialogDescription className="text-xs">
              Sito, VIES e registri pubblici. I campi vuoti del contatto sono stati compilati automaticamente.
            </DialogDescription>
          </DialogHeader>
          {enrichResult && (() => {
            const r = enrichResult as {
              vies?: { valid?: boolean; name?: string; address?: string };
              firmografici?: Record<string, unknown>;
              visura?: Record<string, unknown>;
              openapi_error?: string;
              emails?: string[]; phones?: string[];
              phones_classified?: Array<{ e164: string; type: "mobile" | "landline"; whatsapp: boolean }>;
              facebook_url?: string; instagram_url?: string; linkedin_url?: string;
              partita_iva?: string | null;
              site_partita_iva?: string | null;
              contact_updated?: string[];
              intent_signals?: Record<string, boolean> | string[];
              intent_score?: number;
            };
            // Coerenza sito↔azienda: se sul sito c'è una P.IVA, confrontala con
            // quella nota → conferma (o smentisce) che il sito è quello giusto.
            const knownPiva = enrichPiva.replace(/\s/g, "") || null;
            const sitePivaMatch = r.site_partita_iva && knownPiva
              ? (r.site_partita_iva.replace(/^IT/i, "") === knownPiva.replace(/^IT/i, "") ? "match" : "mismatch")
              : null;
            const row = (label: string, value: React.ReactNode) => (
              <div className="flex items-start gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
                <span className="font-medium break-all">{value}</span>
              </div>
            );
            const SIGNAL_LABELS: Record<string, string> = {
              outdated_copyright: "sito con anno vecchio", not_mobile: "sito non mobile",
              no_https: "sito senza HTTPS", has_form: "ha un form contatti", no_website: "nessun sito",
            };
            const activeSignals = r.intent_signals && !Array.isArray(r.intent_signals)
              ? Object.entries(r.intent_signals).filter(([, v]) => v).map(([k]) => SIGNAL_LABELS[k] || k)
              : [];
            const score = typeof r.intent_score === "number" ? r.intent_score : null;
            const scoreColor = score == null ? "" : score >= 75 ? "bg-red-100 text-red-700" : score >= 60 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
            const scoreLabel = score == null ? "" : score >= 75 ? "Lead caldo" : score >= 60 ? "Lead tiepido" : "Lead freddo";
            return (
              <div className="space-y-3">
                {score != null && (
                  <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2">
                    <Radar className="h-4 w-4 text-orange-600 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">Segnale d'acquisto</span>
                        <Badge className={cn("h-4 px-1.5 text-[10px]", scoreColor)}>{scoreLabel} · {score}/100</Badge>
                      </div>
                      {activeSignals.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">{activeSignals.join(" · ")}</p>}
                    </div>
                  </div>
                )}
                {sitePivaMatch === "match" && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    ✓ <b>Sito confermato</b>: la P.IVA pubblicata sul sito coincide con quella dell'azienda.
                  </div>
                )}
                {sitePivaMatch === "mismatch" && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                    ⚠️ <b>Verifica il sito</b>: sul sito c'è la P.IVA {r.site_partita_iva}, diversa da quella indicata ({knownPiva}).
                    Potrebbe non essere il sito di questa azienda — controlla prima di fidarti dei recapiti trovati.
                  </div>
                )}
                {r.site_partita_iva && !knownPiva && (
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
                    ℹ️ P.IVA <b>{r.site_partita_iva}</b> rilevata dal sito e usata per VIES/registri.
                  </div>
                )}
                {r.contact_updated && r.contact_updated.length > 0 && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    ✓ Compilati sul contatto: <b>{r.contact_updated.join(", ")}</b>
                  </div>
                )}
                {(r.vies || r.partita_iva) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" /> Anagrafica ufficiale (VIES)</p>
                    {r.partita_iva && row("P.IVA", <>{r.partita_iva} {r.vies?.valid === true ? <Badge className="ml-1 h-4 px-1 text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">valida</Badge> : r.vies?.valid === false ? <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">non valida</Badge> : null}</>)}
                    {r.vies?.name && row("Ragione sociale", r.vies.name)}
                    {r.vies?.address && row("Sede legale", r.vies.address)}
                  </div>
                )}
                {(() => {
                  const vis = r.visura as Record<string, unknown> | undefined;
                  if (!vis) return null;
                  const LABELS: Record<string, string> = {
                    ragione_sociale: "Ragione sociale", forma_giuridica: "Forma giuridica",
                    stato_attivita: "Stato attività", data_costituzione: "Costituita il",
                    capitale_sociale: "Capitale sociale", rea: "REA", codice_fiscale: "Codice fiscale",
                    sdi: "Codice SDI", pec: "PEC", ateco: "ATECO", ateco_desc: "Attività (ATECO)",
                    indirizzo: "Indirizzo", comune: "Comune", provincia: "Provincia", cap: "CAP",
                    dipendenti: "Dipendenti", fatturato: "Fatturato", utile: "Utile", anno_bilancio: "Anno bilancio",
                  };
                  const fmtMoneyIt = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
                  const rows = Object.entries(LABELS)
                    .filter(([k]) => vis[k] != null && String(vis[k]).trim() !== "")
                    .map(([k]) => {
                      let val: React.ReactNode = String(vis[k]);
                      if ((k === "capitale_sociale" || k === "fatturato" || k === "utile") && typeof vis[k] === "number") val = fmtMoneyIt(vis[k] as number);
                      if (k === "pec") val = <a href={`mailto:${vis[k]}`} className="text-primary underline">{String(vis[k])}</a>;
                      return <div key={k}>{row(LABELS[k], val)}</div>;
                    });
                  const soci = Array.isArray(vis.soci) ? vis.soci as Array<{ nome?: string; ruolo?: string }> : [];
                  const amm = Array.isArray(vis.amministratori) ? vis.amministratori as Array<{ nome?: string; ruolo?: string }> : [];
                  if (rows.length === 0 && soci.length === 0 && amm.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" /> Visura camerale (registro imprese)</p>
                      {rows}
                      {amm.length > 0 && row("Amministratori", <span className="flex flex-col gap-0.5">{amm.map((p, i) => <span key={i}>{p.nome}{p.ruolo ? ` — ${p.ruolo}` : ""}</span>)}</span>)}
                      {soci.length > 0 && row("Soci", <span className="flex flex-col gap-0.5">{soci.map((p, i) => <span key={i}>{p.nome}{p.ruolo ? ` — ${p.ruolo}` : ""}</span>)}</span>)}
                    </div>
                  );
                })()}
                {r.openapi_error && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                    ⚠️ Dati camerali non disponibili — {r.openapi_error}
                    {/Wrong Token|non configurato|401/i.test(r.openapi_error) && (
                      <> Configura un token openapi.it valido in <b>Impostazioni → API</b> per visura, PEC e firmografici.</>
                    )}
                  </div>
                )}
                {((r.emails?.length ?? 0) > 0 || (r.phones_classified?.length ?? r.phones?.length ?? 0) > 0) && (() => {
                  const classified = r.phones_classified ?? (r.phones ?? []).map((e164) => ({ e164, type: "landline" as const, whatsapp: false }));
                  const mobiles = classified.filter((p) => p.type === "mobile");
                  const landlines = classified.filter((p) => p.type === "landline");
                  return (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1"><AtSign className="h-3 w-3" /> Recapiti trovati sul sito</p>
                      <p className="text-[10px] text-muted-foreground mb-1.5 italic">Numeri normalizzati e filtrati (esclusi P.IVA e sequenze non valide). Verifica sempre prima di contattare.</p>
                      {r.emails?.map((e) => <div key={e}>{row("Email", <a href={`mailto:${e}`} className="text-primary underline">{e}</a>)}</div>)}
                      {mobiles.map((p) => (
                        <div key={p.e164}>{row(
                          <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> Cellulare</span>,
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            {p.e164}
                            <Badge className="h-4 px-1 text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-0.5"><MessageSquare className="h-2.5 w-2.5" /> WhatsApp possibile</Badge>
                          </span>,
                        )}</div>
                      ))}
                      {landlines.map((p) => (
                        <div key={p.e164}>{row(
                          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> Fisso</span>,
                          p.e164,
                        )}</div>
                      ))}
                      {mobiles.length === 0 && (
                        <p className="text-[11px] text-amber-700 mt-1">Nessun cellulare trovato: sul sito solo numeri fissi. Il cellulare (per WhatsApp) va cercato altrove.</p>
                      )}
                    </div>
                  );
                })()}
                {(r.facebook_url || r.instagram_url || r.linkedin_url) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> Social</p>
                    {r.linkedin_url && row("LinkedIn", <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="text-primary underline">{r.linkedin_url}</a>)}
                    {r.facebook_url && row("Facebook", <a href={r.facebook_url} target="_blank" rel="noreferrer" className="text-primary underline">{r.facebook_url}</a>)}
                    {r.instagram_url && row("Instagram", <a href={r.instagram_url} target="_blank" rel="noreferrer" className="text-primary underline">{r.instagram_url}</a>)}
                  </div>
                )}
                {(r.intent_signals?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Segnali dal sito</p>
                    <div className="flex flex-wrap gap-1">{r.intent_signals!.map((s: any) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
                  </div>
                )}
                {!r.vies && !r.firmografici && (r.emails?.length ?? 0) === 0 && (r.phones?.length ?? 0) === 0 && !r.facebook_url && !r.instagram_url && !r.linkedin_url && (
                  <p className="text-xs text-muted-foreground py-2">Nessun dato aggiuntivo trovato. Prova ad aggiungere sito web o P.IVA al contatto e rilancia.</p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Visura camerale openapi (bilancio, soci, PEC, ATECO…) */}
      <Dialog open={visuraOpen} onOpenChange={setVisuraOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-600" /> Visura camerale</DialogTitle>
            <DialogDescription className="text-xs">Dati ufficiali dal registro imprese (openapi.it). I campi vuoti del contatto sono stati compilati.</DialogDescription>
          </DialogHeader>
          {visuraResult && (visuraResult.ok && visuraResult.fields ? (() => {
            const f = visuraResult.fields as Record<string, unknown>;
            const LABELS: Record<string, string> = {
              ragione_sociale: "Ragione sociale", forma_giuridica: "Forma giuridica", stato_attivita: "Stato attività",
              data_costituzione: "Costituita il", capitale_sociale: "Capitale sociale", rea: "REA", codice_fiscale: "Codice fiscale",
              sdi: "Codice SDI", pec: "PEC", ateco: "ATECO", ateco_desc: "Attività (ATECO)", indirizzo: "Indirizzo",
              comune: "Comune", provincia: "Provincia", cap: "CAP", dipendenti: "Dipendenti", fatturato: "Fatturato",
              utile: "Utile", anno_bilancio: "Anno bilancio",
            };
            const money = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
            const rowV = (label: string, value: React.ReactNode) => (
              <div className="flex items-start gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
                <span className="font-medium break-all">{value}</span>
              </div>
            );
            const rows = Object.entries(LABELS).filter(([k]) => f[k] != null && String(f[k]).trim() !== "").map(([k]) => {
              let val: React.ReactNode = String(f[k]);
              if ((k === "capitale_sociale" || k === "fatturato" || k === "utile") && typeof f[k] === "number") val = money(f[k] as number);
              if (k === "pec") val = <a href={`mailto:${f[k]}`} className="text-primary underline">{String(f[k])}</a>;
              return <div key={k}>{rowV(LABELS[k], val)}</div>;
            });
            const soci = Array.isArray(f.soci) ? f.soci as Array<{ nome?: string; ruolo?: string }> : [];
            const amm = Array.isArray(f.amministratori) ? f.amministratori as Array<{ nome?: string; ruolo?: string }> : [];
            return (
              <div className="space-y-1">
                {visuraResult.contact_updated && visuraResult.contact_updated.length > 0 && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800 mb-2">
                    ✓ Compilati sul contatto: <b>{visuraResult.contact_updated.join(", ")}</b>
                  </div>
                )}
                {rows}
                {amm.length > 0 && rowV("Amministratori", <span className="flex flex-col gap-0.5">{amm.map((p, i) => <span key={i}>{p.nome}{p.ruolo ? ` — ${p.ruolo}` : ""}</span>)}</span>)}
                {soci.length > 0 && rowV("Soci", <span className="flex flex-col gap-0.5">{soci.map((p, i) => <span key={i}>{p.nome}{p.ruolo ? ` — ${p.ruolo}` : ""}</span>)}</span>)}
                {rows.length === 0 && amm.length === 0 && soci.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">Nessun campo restituito da openapi per questa P.IVA.</p>
                )}
              </div>
            );
          })() : (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              ⚠️ Visura non disponibile — {visuraResult.error}
              {/Wrong Token|non configurato|401/i.test(visuraResult.error || "") && (
                <> Configura un token openapi.it valido in <b>Impostazioni → API</b> per visura, bilancio e PEC.</>
              )}
            </div>
          ))}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
});
MarketingContactDetail.displayName = "MarketingContactDetail";
export default MarketingContactDetail;
