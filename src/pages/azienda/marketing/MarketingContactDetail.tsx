import { useState, forwardRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
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
import { MarketingDocumentsPanel } from "@/components/marketing/MarketingDocumentsPanel";
import { ContactAIConversations } from "@/modules/ai-agents/components/ContactAIConversations";
import { ContactDndTab } from "@/components/marketing/ContactDndTab";
import { ContactActionsTab } from "@/components/marketing/ContactActionsTab";
import { ContactMergeDialog } from "@/components/marketing/ContactMergeDialog";
import { ContactSmsLog } from "@/components/marketing/ContactSmsLog";
import { ContactAttributionTab } from "@/components/contacts/ContactAttributionTab";
import { ContactInvoicesPanel } from "@/components/marketing/ContactInvoicesPanel";
import { UnifiedContactTimeline } from "@/components/marketing/UnifiedContactTimeline";
import { normalizeTagList, normalizeTagName } from "@/lib/marketingTags";
import { RefreshCw, CalendarDays, Sparkles } from "lucide-react";
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
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email" | "sms">("whatsapp");
  const [emailSubject, setEmailSubject] = useState("");
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
  const { data: contactMessages = [] } = useQuery({
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
          .eq("company_id", companyId),
        supabase
          .from("marketing_appointments")
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


  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      if (!canEditContacts) throw new Error("Non hai i permessi per modificare i contatti");
      const { error } = await supabase
        .from("marketing_contacts")
        .update({ [field]: value, updated_at: new Date().toISOString() })
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
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

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
    <div className="flex flex-col min-h-[calc(100vh-8rem)] md:h-[calc(100vh-3.5rem)] md:overflow-hidden bg-background">
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
              </TabsList>

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
                        if (!contact.postal_code) updateField.mutate({ field: "postal_code", value: c.cap });
                      }}
                    />
                    <InlineField label="Provincia" value={contact.province || ""} onSave={(v) => updateField.mutate({ field: "province", value: v })} disabled={!canEditContacts} />
                    <InlineField label="CAP" value={contact.postal_code || ""} onSave={(v) => updateField.mutate({ field: "postal_code", value: v })} disabled={!canEditContacts}
                      comuneMode="cap"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "postal_code", value: c.cap });
                        updateField.mutate({ field: "city", value: c.comune });
                        updateField.mutate({ field: "province", value: c.provinciaSigla });
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
                            supabase.from("marketing_opportunities").select("*", { count: "exact", head: true }).eq("contact_id", id),
                            supabase.from("marketing_opportunities").select("id").eq("contact_id", id).eq("status", "open"),
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
                  onUpdate={(field, value) => updateField.mutate({ field, value })}
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
      <div className="flex-1 flex flex-col min-w-0 h-[60vh] lg:h-auto">
        {/* Unified Timeline */}
        <div className="flex-1 overflow-hidden">
          <UnifiedContactTimeline contactId={id!} companyId={companyId!} contactPhone={contact.phone} contactEmail={contact.email} />
        </div>

        {/* Message input bar */}
        <div className="border-t shrink-0">
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
          <div className={messageChannel === "whatsapp" ? "flex items-start px-3 gap-2 py-2" : "h-12 flex items-center px-3 gap-2"}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 shrink-0">
                  {messageChannel === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> :
                   messageChannel === "email" ? <Mail className="h-3.5 w-3.5 text-violet-600" /> :
                   <Smartphone className="h-3.5 w-3.5 text-sky-600" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {contact.phone && (
                  <DropdownMenuItem onClick={() => setMessageChannel("whatsapp")}>
                    <MessageSquare className="h-3.5 w-3.5 mr-2 text-emerald-600" /> WhatsApp
                  </DropdownMenuItem>
                )}
                {contact.email && (
                  <DropdownMenuItem onClick={() => setMessageChannel("email")}>
                    <Mail className="h-3.5 w-3.5 mr-2 text-violet-600" /> Email
                  </DropdownMenuItem>
                )}
                {contact.phone && (
                  <DropdownMenuItem onClick={() => setMessageChannel("sms")}>
                    <Smartphone className="h-3.5 w-3.5 mr-2 text-sky-600" /> SMS
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {messageChannel === "whatsapp" ? (
              <WhatsAppComposer
                phone={contact.phone}
                isSending={sendMessage.isPending}
                className="flex-1"
                onSend={async ({ waNumberId, content, template }) => {
                  await sendMessage.mutateAsync({
                    channel: "whatsapp",
                    content,
                    wa_number_id: waNumberId,
                    template,
                  });
                }}
              />
            ) : (
              <>
                <Input
                  placeholder={`Scrivi messaggio ${messageChannel === "email" ? "email" : "SMS"}...`}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value.slice(0, 5000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && messageText.trim() && !sendMessage.isPending) {
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
                  className="border-0 bg-muted/50 shadow-none h-8 text-xs"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 md:h-7 md:w-7 shrink-0"
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
      {/* Content panel (conditionally shown) */}
      {rightPanelOpen && (
        <div className="hidden md:flex w-64 border-l flex-col bg-background">
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

          <ScrollArea className="flex-1">
            <div className="p-2.5">
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

              {/* Activities panel - LinkedTasks */}
              {rightTab === "activities" && id && companyId && (
                <LinkedTasks
                  contactId={id}
                  category="contatti"
                  companyId={companyId}
                />
              )}

              {/* Render AI panel */}
              {rightTab === "activities" && id && (
                <LinkedRendersList contactId={id} />
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
                      <div key={note.id} className="rounded bg-muted/50 p-2 space-y-0.5">
                        {(note as any).opportunity_id && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 mb-0.5">Opportunità</Badge>
                        )}
                        <p className="text-[11px] whitespace-pre-wrap">{note.content}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                        </p>
                        {note.profiles && (note.profiles as any).first_name && (
                          <p className="text-[10px] text-muted-foreground">
                            Creato da: <span className="font-medium">{(note.profiles as any).first_name} {(note.profiles as any).last_name}</span>
                          </p>
                        )}
                      </div>
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
      </div>
    </div>
  );
});
MarketingContactDetail.displayName = "MarketingContactDetail";
export default MarketingContactDetail;
