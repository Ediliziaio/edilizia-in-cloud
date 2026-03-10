import { useState, forwardRef } from "react";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Phone, Mail, Star, ChevronDown, ChevronLeft, ChevronRight,
  FileText, Plus, Send, Search,
  Bell, User, X, Filter,
  Loader2, AlertCircle, MessageSquare, Smartphone, Merge,
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
import { MarketingDocumentsPanel } from "@/components/marketing/MarketingDocumentsPanel";
import { ContactAIConversations } from "@/modules/ai-agents/components/ContactAIConversations";
import { ContactDndTab } from "@/components/marketing/ContactDndTab";
import { ContactActionsTab } from "@/components/marketing/ContactActionsTab";
import { ContactMergeDialog } from "@/components/marketing/ContactMergeDialog";
import { ContactSmsLog } from "@/components/marketing/ContactSmsLog";
import { ContactAttributionTab } from "@/components/contacts/ContactAttributionTab";
import { ContactInvoicesPanel } from "@/components/marketing/ContactInvoicesPanel";
import { UnifiedContactTimeline } from "@/components/marketing/UnifiedContactTimeline";
import { RefreshCw, CalendarDays } from "lucide-react";

// ── Extracted sub-components ──
import { InlineField } from "@/components/marketing/contacts/InlineField";
import { ContactAppointmentsPanel } from "@/components/marketing/contacts/ContactAppointmentsPanel";
import { OpportunitiesPanel } from "@/components/marketing/contacts/OpportunitiesPanel";
import { ContactQuotesPanel } from "@/components/marketing/contacts/ContactQuotesPanel";
import { getDateLabel, RIGHT_TABS, type RightTab } from "@/components/marketing/contacts/activityHelpers";
import { getAvatarColor } from "@/lib/contactUtils";

const MarketingContactDetail = forwardRef<HTMLDivElement>(function MarketingContactDetail(_props, _ref) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [rightTab, setRightTab] = useState<RightTab | null>("notes");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email" | "sms">("whatsapp");
  const [emailSubject, setEmailSubject] = useState("");

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

  // ── Fetch staff users for appointment dialog ──
  const { data: staffUsers = [] } = useQuery({
    queryKey: ["staff-users-for-contact", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name");
      if (!profiles?.length) return [];
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const validIds = roles?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role)).map((r) => r.user_id) || [];
      return profiles.filter((p) => validIds.includes(p.id));
    },
    enabled: !!companyId,
    staleTime: 600_000,
  });

  // ── Fetch contact ──
  const { data: contact, isLoading, isError, refetch } = useQuery({
    queryKey: ["marketing_contact", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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

  // ── Fetch staff for assignment ──
  const { data: staff = [] } = useQuery({
    queryKey: ["company_staff", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      if (error) throw error;

      const userIds = profiles.map((p) => p.id);
      if (userIds.length === 0) return [];

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const validUserIds = roles
        ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
        .map((r) => r.user_id) || [];

      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: !!companyId,
    staleTime: 600_000,
  });

  // ── Fetch salespeople (salesperson + company_admin) for Titolare ──
  const { data: salespeople = [] } = useQuery({
    queryKey: ["company_salespeople_contact", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      if (error) throw error;

      const userIds = profiles.map((p) => p.id);
      if (userIds.length === 0) return [];

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const validUserIds = roles
        ?.filter((r) => r.role === "salesperson" || r.role === "company_admin")
        .map((r) => r.user_id) || [];

      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: !!companyId,
    staleTime: 600_000,
  });

  // ── Fetch call center users for Call Center dropdown ──
  const { data: callCenterUsers = [] } = useQuery({
    queryKey: ["company_call_center_contact", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      if (error) throw error;

      const userIds = profiles.map((p) => p.id);
      if (userIds.length === 0) return [];

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const validUserIds = roles
        ?.filter((r) => r.role === "call_center")
        .map((r) => r.user_id) || [];

      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: !!companyId,
    staleTime: 600_000,
  });

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
      if (!id) return [];
      const { data, error } = await supabase
        .from("marketing_contact_activities")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch notes ──
  const { data: notes = [] } = useQuery({
    queryKey: ["marketing_contact_notes", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Fetch contact messages ──
  const { data: contactMessages = [] } = useQuery({
    queryKey: ["contact_messages", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  // ── Send message mutation ──
  const sendMessage = useMutation({
    mutationFn: async (params: { channel: string; content: string; subject?: string }) => {
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
      const channelLabel = vars.channel === "whatsapp" ? "WhatsApp" : vars.channel === "email" ? "Email" : "SMS";
      toast.success(`Messaggio ${channelLabel} inviato`);
    },
    onError: (e: any) => toast.error(e.message || "Errore invio messaggio"),
  });


  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      const { error } = await supabase
        .from("marketing_contacts")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", id!);
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
      const { error } = await supabase.from("marketing_contacts").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto eliminato");
      navigate("/azienda/marketing/contatti");
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
        <Button variant="outline" onClick={() => navigate("/azienda/marketing/contatti")}>
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

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      <div className="px-3 pt-2">
        <ApiHealthBanner filter={["whatsapp", "email"]} />
      </div>
      <div className="flex flex-1 overflow-hidden">
      {/* ══════════ LEFT COLUMN ══════════ */}
      <div className="w-[360px] min-w-[360px] border-r flex flex-col">
        {/* Header */}
        <div className="h-11 border-b flex items-center justify-between px-2 shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/azienda/marketing/contatti")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">Contatto Dettagli</span>
          </div>
          <div className="flex items-center gap-0.5">
            {totalContacts > 0 && (
              <span className="text-[11px] text-muted-foreground mr-1">
                {currentIdx >= 0 ? currentIdx + 1 : "?"}/{totalContacts}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!prevId} onClick={() => prevId && navigate(`/azienda/marketing/contatti/${prevId}`)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!nextId} onClick={() => nextId && navigate(`/azienda/marketing/contatti/${nextId}`)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            {/* Avatar + Name + Delete */}
            <div className="flex items-center gap-2.5">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className={cn("text-sm font-bold text-white", getAvatarColor(fullName))}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h2 className="font-semibold text-base flex-1 truncate">{fullName}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setMergeOpen(true)} title="Unisci contatti">
                <Merge className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

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
                          await syncTagsToOpportunities(id, tags);
                          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
                        }
                      }}
                    />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {(contact.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-[11px] px-1.5 py-0 gap-1 h-5">
                      {tag}
                      <X className="h-2.5 w-2.5 cursor-pointer" onClick={async () => {
                        updateField.mutate({ field: "tags", value: contact.tags.filter((t: string) => t !== tag) });
                        // Remove tag from linked opportunities too
                        if (id) {
                          await removeTagFromOpportunities(id, tag);
                          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
                        }
                      }} />
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
                    <InlineField label="Nome" value={contact.first_name} onSave={(v) => updateField.mutate({ field: "first_name", value: v })} />
                    <InlineField label="Cognome" value={contact.last_name || ""} onSave={(v) => updateField.mutate({ field: "last_name", value: v })} />
                    <InlineField label="Email" value={contact.email || ""} onSave={(v) => updateField.mutate({ field: "email", value: v })} type="email" />
                    <InlineField label="Telefono" value={contact.phone || ""} onSave={(v) => updateField.mutate({ field: "phone", value: v })} type="tel" />
                    <InlineField label="Data di nascita" value={contact.date_of_birth || ""} onSave={(v) => updateField.mutate({ field: "date_of_birth", value: v || null })} type="date" />
                    <InlineField label="Fonte" value={contact.source || ""} onSave={(v) => updateField.mutate({ field: "source", value: v })} />
                    <InlineField
                      label="Tipo contatto"
                      value={contact.contact_type || "lead"}
                      onSave={(v) => updateField.mutate({ field: "contact_type", value: v })}
                      type="select"
                      options={["lead", "cliente", "partner", "fornitore", "altro"]}
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
                    <InlineField label="Azienda" value={contact.company_name || ""} onSave={(v) => updateField.mutate({ field: "company_name", value: v })} />
                    <InlineField label="Indirizzo" value={contact.address || ""} onSave={(v) => updateField.mutate({ field: "address", value: v })} />
                    <InlineField label="Città" value={contact.city || ""} onSave={(v) => updateField.mutate({ field: "city", value: v })} />
                    <InlineField label="Provincia" value={contact.province || ""} onSave={(v) => updateField.mutate({ field: "province", value: v })} />
                    <InlineField label="CAP" value={contact.postal_code || ""} onSave={(v) => updateField.mutate({ field: "postal_code", value: v })} />
                    <InlineField label="Paese" value={contact.country || ""} onSave={(v) => updateField.mutate({ field: "country", value: v })} />
                    <InlineField label="Sito web" value={contact.website || ""} onSave={(v) => updateField.mutate({ field: "website", value: v })} />
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
                          />
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

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

      {/* ══════════ CENTER COLUMN ══════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-11 border-b flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className={cn("text-[10px] font-bold text-white", getAvatarColor(fullName))}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{fullName}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Bell className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Notifiche</TooltipContent></Tooltip>
            {contact.phone && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={`tel:${contact.phone}`}><Phone className="h-3.5 w-3.5" /></a>
                </Button>
              </TooltipTrigger><TooltipContent>Chiama</TooltipContent></Tooltip>
            )}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><CalendarDays className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Calendario</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Star className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Preferito</TooltipContent></Tooltip>
            {contact.email && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={`mailto:${contact.email}`}><Mail className="h-3.5 w-3.5" /></a>
                </Button>
              </TooltipTrigger><TooltipContent>Email</TooltipContent></Tooltip>
            )}
          </div>
        </div>

        {/* Unified Timeline */}
        <div className="flex-1 overflow-hidden">
          <UnifiedContactTimeline contactId={id!} companyId={companyId!} />
        </div>

        {/* Message input bar */}
        <div className="border-t shrink-0">
          {messageChannel === "email" && (
            <div className="px-3 pt-2">
              <Input
                placeholder="Oggetto email..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
                className="border-0 bg-muted/50 shadow-none h-7 text-xs"
              />
            </div>
          )}
          <div className="h-12 flex items-center px-3 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
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
            <Input
              placeholder={`Scrivi messaggio ${messageChannel === "whatsapp" ? "WhatsApp" : messageChannel === "email" ? "email" : "SMS"}...`}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value.slice(0, 5000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && messageText.trim() && !sendMessage.isPending) {
                  sendMessage.mutate({ channel: messageChannel, content: messageText.trim(), subject: messageChannel === "email" ? emailSubject.trim() || undefined : undefined });
                }
              }}
              className="border-0 bg-muted/50 shadow-none h-8 text-xs"
            />
            <Button
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={!messageText.trim() || sendMessage.isPending}
              onClick={() => sendMessage.mutate({ channel: messageChannel, content: messageText.trim(), subject: messageChannel === "email" ? emailSubject.trim() || undefined : undefined })}
            >
              {sendMessage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Recent messages */}
          {contactMessages.length > 0 && (
            <div className="px-3 pb-2 max-h-32 overflow-y-auto">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Messaggi recenti</p>
              {contactMessages.slice(0, 5).map((msg: any) => (
                <div key={msg.id} className="flex items-center gap-1.5 py-0.5">
                  {msg.channel === "whatsapp" ? <MessageSquare className="h-3 w-3 text-emerald-600 shrink-0" /> :
                   msg.channel === "email" ? <Mail className="h-3 w-3 text-violet-600 shrink-0" /> :
                   <Smartphone className="h-3 w-3 text-sky-600 shrink-0" />}
                  <span className="text-[10px] truncate flex-1">{msg.content}</span>
                  <Badge variant={msg.status === "sent" ? "default" : msg.status === "failed" ? "destructive" : "secondary"} className="text-[8px] h-3.5 px-1">
                    {msg.status}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {format(new Date(msg.created_at), "dd/MM HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══════════ RIGHT SIDEBAR ══════════ */}
      {/* Content panel (conditionally shown) */}
      {rightPanelOpen && (
        <div className="w-64 border-l flex flex-col bg-background">
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

      {/* Vertical icon strip */}
      <div className="w-10 border-l flex flex-col items-center py-2 gap-1 bg-muted/30 shrink-0">
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
