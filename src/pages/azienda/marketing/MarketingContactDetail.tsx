import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Phone, Mail, Star, ChevronDown, ChevronLeft, ChevronRight,
  FileText, Activity, StickyNote, CalendarDays, Target, Plus, Send, Search,
  Bell, User, Settings, X, Filter,
} from "lucide-react";
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

// ── Inline editable field ──
function InlineField({ label, value, onSave, type = "text", options }: {
  label: string; value: string; onSave: (v: string) => void; type?: string; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || "")) onSave(draft);
  };

  if (type === "select" && options) {
    return (
      <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground truncate">{label}</Label>
        <Select value={value || ""} onValueChange={onSave}>
          <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1 hover:bg-muted/50"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
      <Label className="text-xs text-muted-foreground truncate">{label}</Label>
      {editing ? (
        <Input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-7 text-xs px-1"
        />
      ) : (
        <p
          className="text-xs min-h-[32px] flex items-center cursor-pointer hover:bg-muted/50 rounded px-1"
          onClick={() => setEditing(true)}
        >
          {value || <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );
}

// ── AVATAR COLORS ──
const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500",
];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Activity type icons & labels ──
function getActivityIcon(type: string) {
  switch (type) {
    case "created": return <User className="h-3.5 w-3.5" />;
    case "updated": return <Settings className="h-3.5 w-3.5" />;
    case "note_added": return <StickyNote className="h-3.5 w-3.5" />;
    case "email_sent": return <Mail className="h-3.5 w-3.5" />;
    case "opportunity_linked": return <Target className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case "created": return "bg-emerald-100 text-emerald-600";
    case "updated": return "bg-blue-100 text-blue-600";
    case "note_added": return "bg-amber-100 text-amber-600";
    case "email_sent": return "bg-violet-100 text-violet-600";
    default: return "bg-muted text-muted-foreground";
  }
}

// ── Date separator helper ──
function getDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

// ── RIGHT SIDEBAR TABS ──
type RightTab = "activities" | "notes" | "appointments" | "opportunities" | "documents" | "settings";
const RIGHT_TABS: { key: RightTab; icon: any; label: string }[] = [
  { key: "documents", icon: FileText, label: "Documenti" },
  { key: "activities", icon: Activity, label: "Attività" },
  { key: "notes", icon: StickyNote, label: "Note" },
  { key: "appointments", icon: CalendarDays, label: "Calendario" },
  { key: "opportunities", icon: Target, label: "Opportunità" },
  { key: "settings", icon: Settings, label: "Impostazioni" },
];

// ── Opportunities Panel for right sidebar ──
function OpportunitiesPanel({ contactId, companyId }: { contactId: string; companyId: string }) {
  const { data: opps = [], isLoading } = useQuery({
    queryKey: ["contact_opportunities", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, name, value, status, marketing_pipeline_stages(name), marketing_pipelines(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
  });

  if (isLoading) return <p className="text-[11px] text-muted-foreground text-center py-4">Caricamento...</p>;

  if (opps.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-8">Nessuna opportunità collegata</p>;

  return (
    <div className="space-y-2">
      {opps.map((opp: any) => (
        <div key={opp.id} className="rounded bg-muted/50 p-2 space-y-0.5">
          <p className="text-[11px] font-medium">{opp.name}</p>
          <div className="flex items-center gap-1">
            <Badge variant={opp.status === "won" ? "default" : opp.status === "lost" ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
              {opp.status === "open" ? "Aperta" : opp.status === "won" ? "Vinta" : "Persa"}
            </Badge>
            {opp.value > 0 && <span className="text-[10px] text-muted-foreground">{Number(opp.value).toLocaleString("it-IT")} €</span>}
          </div>
          {opp.marketing_pipelines?.name && (
            <p className="text-[10px] text-muted-foreground">{opp.marketing_pipelines.name} → {opp.marketing_pipeline_stages?.name}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MarketingContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [rightTab, setRightTab] = useState<RightTab | null>("notes");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [docFilter, setDocFilter] = useState("all");

  // ── Fetch contact ──
  const { data: contact, isLoading } = useQuery({
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
        ?.filter((r) => r.role === "company_admin" || r.role === "company_staff")
        .map((r) => r.user_id) || [];

      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: !!companyId,
  });

  // ── Fetch custom fields ──
  const { data: customFields = [] } = useQuery({
    queryKey: ["marketing_custom_fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .order("section")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

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
  });

  // ── Fetch activities ──
  const { data: activities = [] } = useQuery({
    queryKey: ["marketing_contact_activities", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("marketing_contact_activities")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ── Fetch notes ──
  const { data: notes = [] } = useQuery({
    queryKey: ["marketing_contact_notes", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*")
        .eq("contact_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ── Update contact field ──
  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      const { error } = await supabase
        .from("marketing_contacts")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
      if (companyId) {
        await supabase.from("marketing_contact_activities").insert({
          contact_id: id!,
          company_id: companyId,
          activity_type: "updated",
          description: `Campo "${field}" aggiornato`,
          created_by: user?.id,
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
      await supabase.from("marketing_contact_activities").insert({
        contact_id: id!,
        company_id: companyId,
        activity_type: "note_added",
        description: "Nota aggiunta",
        created_by: user.id,
      });
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
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>;
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
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* ══════════ LEFT COLUMN ══════════ */}
      <div className="w-[340px] min-w-[340px] border-r flex flex-col">
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
          <div className="p-4 space-y-4">
            {/* Avatar + Name + Delete */}
            <div className="flex items-center gap-2.5">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className={cn("text-sm font-bold text-white", getAvatarColor(fullName))}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h2 className="font-semibold text-base flex-1 truncate">{fullName}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Titolare, Follower & Call Center */}
            <div className="grid grid-cols-3 gap-2">
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
                    {staff.map((s: any) => (
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
                    {staff.map((s: any) => (
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

                {/* Created info */}
                <div className="pt-2 text-[10px] text-muted-foreground px-1">
                  <p>Creato il: {format(new Date(contact.created_at), "dd MMM yyyy, HH:mm", { locale: it })}</p>
                  {contact.source && <p>Fonte: {contact.source}</p>}
                </div>
              </TabsContent>

              <TabsContent value="dnd" className="mt-2">
                <p className="text-xs text-muted-foreground text-center py-6">DND - Prossimamente</p>
              </TabsContent>

              <TabsContent value="actions" className="mt-2">
                <p className="text-xs text-muted-foreground text-center py-6">Azioni - Prossimamente</p>
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

        {/* Timeline */}
        <ScrollArea className="flex-1">
          <div className="p-4 max-w-2xl mx-auto w-full">
            {groupedActivities.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-12">Nessuna attività registrata</p>
            ) : (
              <div className="space-y-4">
                {groupedActivities.map((group) => (
                  <div key={group.label}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {/* Activity entries */}
                    <div className="space-y-2">
                      {group.items.map((act: any) => (
                        <div key={act.id} className="flex items-start gap-2.5 py-1.5">
                          <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5", getActivityColor(act.activity_type))}>
                            {getActivityIcon(act.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs">{act.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(new Date(act.created_at), "HH:mm", { locale: it })}
                            </p>
                          </div>
                          <button className="text-[10px] text-primary hover:underline shrink-0">Dettagli</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Message input bar */}
        <div className="h-12 border-t flex items-center px-3 gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <Mail className="h-3.5 w-3.5" />
          </Button>
          <Input placeholder="Digita un messaggio..." className="border-0 bg-muted/50 shadow-none h-8 text-xs" disabled />
          <Button size="icon" className="h-7 w-7 shrink-0"><Send className="h-3.5 w-3.5" /></Button>
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
              {rightTab === "documents" && (
                <div className="space-y-2.5">
                  <Input placeholder="Cerca per nome del documento" className="h-7 text-[11px]" />
                  <div className="flex gap-1">
                    {["all", "internal", "sent", "received"].map(f => (
                      <button
                        key={f}
                        className={cn("text-[10px] px-2 py-1 rounded-full", docFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                        onClick={() => setDocFilter(f)}
                      >
                        {f === "all" ? "Tutto" : f === "internal" ? "Interno" : f === "sent" ? "Inviato" : "Ricevuto"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center py-8">Ancora nessun documento</p>
                </div>
              )}

              {/* Activities panel */}
              {rightTab === "activities" && (
                <div className="space-y-2">
                  {activities.map((act: any) => (
                    <div key={act.id} className="rounded bg-muted/50 p-2 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">{act.activity_type}</Badge>
                      </div>
                      <p className="text-[11px]">{act.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(act.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                      </p>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-6">Nessuna attività</p>
                  )}
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
                      <div key={note.id} className="rounded bg-muted/50 p-2 space-y-0.5">
                        <p className="text-[11px] whitespace-pre-wrap">{note.content}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                        </p>
                      </div>
                    ))}
                    {notes.length === 0 && (
                      <p className="text-[11px] text-muted-foreground text-center py-4">Nessuna nota</p>
                    )}
                  </div>
                </div>
              )}

              {/* Appointments placeholder */}
              {rightTab === "appointments" && (
                <p className="text-[11px] text-muted-foreground text-center py-8">Prossimamente: appuntamenti</p>
              )}

              {rightTab === "opportunities" && (
                <OpportunitiesPanel contactId={id!} companyId={companyId!} />
              )}

              {/* Settings placeholder */}
              {rightTab === "settings" && (
                <p className="text-[11px] text-muted-foreground text-center py-8">Prossimamente: impostazioni</p>
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
  );
}
