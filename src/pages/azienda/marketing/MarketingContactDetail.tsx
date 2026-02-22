import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Phone, Mail, Star, ChevronDown, ChevronRight,
  FileText, Activity, StickyNote, CalendarDays, Target, Plus, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TagSelector } from "@/components/marketing/TagSelector";
import { cn } from "@/lib/utils";

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
      <div className="space-y-0.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Select value={value || ""} onValueChange={onSave}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-8 text-sm"
        />
      ) : (
        <p
          className="text-sm min-h-[2rem] flex items-center cursor-pointer hover:bg-muted/50 rounded px-2 -mx-2"
          onClick={() => setEditing(true)}
        >
          {value || <span className="text-muted-foreground italic">—</span>}
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

// ── RIGHT SIDEBAR TABS ──
type RightTab = "activities" | "notes" | "appointments" | "opportunities" | "documents";
const RIGHT_TABS: { key: RightTab; icon: any; label: string }[] = [
  { key: "activities", icon: Activity, label: "Attività" },
  { key: "notes", icon: StickyNote, label: "Note" },
  { key: "appointments", icon: CalendarDays, label: "Appuntamenti" },
  { key: "opportunities", icon: Target, label: "Opportunità" },
  { key: "documents", icon: FileText, label: "Documenti" },
];

export default function MarketingContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [rightTab, setRightTab] = useState<RightTab>("notes");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newNote, setNewNote] = useState("");

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

  // ── Fetch staff for assignment ──
  const { data: staff = [] } = useQuery({
    queryKey: ["company_staff", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
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
      // Log activity
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── LEFT COLUMN ── */}
      <div className="w-80 border-r flex flex-col bg-background">
        <div className="p-4 border-b flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/marketing/contatti")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Contatti
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Avatar + Name */}
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarFallback className={cn("text-lg font-bold text-white", getAvatarColor(fullName))}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-lg">{fullName}</h2>
                <p className="text-sm text-muted-foreground">{contact.email || "Nessuna email"}</p>
              </div>
            </div>

            <Separator />

            {/* Titolare & Follower */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Titolare</Label>
                <Select
                  value={(contact as any).assigned_to || ""}
                  onValueChange={(v) => updateField.mutate({ field: "assigned_to", value: v || null })}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Follower</Label>
                <Select
                  value={(contact as any).follower_id || ""}
                  onValueChange={(v) => updateField.mutate({ field: "follower_id", value: v || null })}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nessun follower" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tag</Label>
              <TagSelector
                selectedTags={contact.tags || []}
                onTagsChange={(tags) => updateField.mutate({ field: "tags", value: tags })}
              />
            </div>

            <Separator />

            {/* Collapsible: Contatto */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold w-full group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90" />
                Contatto
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                <InlineField label="Nome" value={contact.first_name} onSave={(v) => updateField.mutate({ field: "first_name", value: v })} />
                <InlineField label="Cognome" value={contact.last_name || ""} onSave={(v) => updateField.mutate({ field: "last_name", value: v })} />
                <InlineField label="Email" value={contact.email || ""} onSave={(v) => updateField.mutate({ field: "email", value: v })} type="email" />
                <InlineField label="Telefono" value={contact.phone || ""} onSave={(v) => updateField.mutate({ field: "phone", value: v })} type="tel" />
                <InlineField label="Data di nascita" value={(contact as any).date_of_birth || ""} onSave={(v) => updateField.mutate({ field: "date_of_birth", value: v || null })} type="date" />
                <InlineField label="Fonte" value={contact.source || ""} onSave={(v) => updateField.mutate({ field: "source", value: v })} />
                <InlineField
                  label="Tipo di contatto"
                  value={(contact as any).contact_type || "lead"}
                  onSave={(v) => updateField.mutate({ field: "contact_type", value: v })}
                  type="select"
                  options={["lead", "cliente", "partner", "fornitore", "altro"]}
                />
              </CollapsibleContent>
            </Collapsible>

            {/* Collapsible: General Info */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold w-full group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90" />
                Informazioni generali
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                <InlineField label="Azienda" value={contact.company_name || ""} onSave={(v) => updateField.mutate({ field: "company_name", value: v })} />
                <InlineField label="Indirizzo" value={(contact as any).address || ""} onSave={(v) => updateField.mutate({ field: "address", value: v })} />
                <InlineField label="Città" value={(contact as any).city || ""} onSave={(v) => updateField.mutate({ field: "city", value: v })} />
                <InlineField label="Provincia" value={(contact as any).province || ""} onSave={(v) => updateField.mutate({ field: "province", value: v })} />
                <InlineField label="CAP" value={(contact as any).postal_code || ""} onSave={(v) => updateField.mutate({ field: "postal_code", value: v })} />
                <InlineField label="Paese" value={(contact as any).country || ""} onSave={(v) => updateField.mutate({ field: "country", value: v })} />
                <InlineField label="Sito web" value={(contact as any).website || ""} onSave={(v) => updateField.mutate({ field: "website", value: v })} />
              </CollapsibleContent>
            </Collapsible>

            {/* Collapsible: Custom Fields */}
            {customFields.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold w-full group">
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90" />
                  Campi personalizzati
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  {customFields.map((cf: any) => (
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
            <div className="pt-4 text-xs text-muted-foreground space-y-1">
              <p>Creato il: {format(new Date(contact.created_at), "dd MMM yyyy, HH:mm", { locale: it })}</p>
              {contact.source && <p>Fonte: {contact.source}</p>}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ── CENTER COLUMN ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="font-semibold text-lg truncate">{fullName}</h1>
          <div className="flex items-center gap-1">
            {contact.phone && (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={`tel:${contact.phone}`}><Phone className="h-4 w-4" /></a>
              </Button>
            )}
            {contact.email && (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={`mailto:${contact.email}`}><Mail className="h-4 w-4" /></a>
              </Button>
            )}
          </div>
        </div>

        {/* Timeline */}
        <ScrollArea className="flex-1 p-4">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">Nessuna attività registrata</p>
          ) : (
            <div className="space-y-4">
              {activities.map((act: any) => (
                <div key={act.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-sm">{act.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(act.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Message placeholder */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2.5">
            <Input placeholder="Digita un messaggio..." className="border-0 bg-transparent shadow-none h-8" disabled />
            <Button size="icon" className="h-8 w-8" disabled><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div className="w-72 border-l flex flex-col bg-background">
        {/* Tab icons */}
        <div className="flex border-b">
          {RIGHT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors",
                rightTab === tab.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setRightTab(tab.key)}
              title={tab.label}
            >
              <tab.icon className="h-4 w-4" />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 p-3">
          {rightTab === "notes" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Textarea
                  placeholder="Scrivi una nota..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!newNote.trim() || addNote.isPending}
                  onClick={() => addNote.mutate(newNote.trim())}
                >
                  <Plus className="h-4 w-4 mr-1" /> Aggiungi nota
                </Button>
              </div>
              <Separator />
              {notes.map((note: any) => (
                <div key={note.id} className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                  </p>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nessuna nota</p>
              )}
            </div>
          )}

          {rightTab === "activities" && (
            <div className="space-y-3">
              {activities.map((act: any) => (
                <div key={act.id} className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{act.activity_type}</Badge>
                  </div>
                  <p className="text-sm">{act.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(act.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                  </p>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nessuna attività</p>
              )}
            </div>
          )}

          {rightTab === "appointments" && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Prossimamente: appuntamenti collegati
            </p>
          )}

          {rightTab === "opportunities" && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Prossimamente: opportunità collegate
            </p>
          )}

          {rightTab === "documents" && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Prossimamente: documenti caricati
            </p>
          )}
        </ScrollArea>
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
