import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateOpportunity, useDeleteOpportunity, useCompanyStaff, useCompanySalespeople, useCompanyCallCenterUsers, useOpportunityNotes, useAddOpportunityNote, usePipelines } from "@/hooks/useOpportunitiesData";
import {
  useContactCustomFields, useOpportunityCustomFields,
  useContactFieldValues, useOpportunityFieldValues,
  useUpdateContact, useUpsertContactFieldValues, useUpsertOpportunityFieldValues,
} from "@/hooks/useOpportunityDetailData";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { TagSelector } from "@/components/marketing/TagSelector";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Trash2, StickyNote, FileText, CalendarDays, Activity, Receipt,
  Settings2, User, Mail, Phone, UserPlus, DatabaseZap, RefreshCw, Folder, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { syncTagsToContact, removeTagFromContact } from "@/hooks/useTagSync";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { MarketingDocumentsPanel } from "@/components/marketing/MarketingDocumentsPanel";
import { OpportunityAppointmentTab } from "@/components/opportunities/OpportunityAppointmentTab";
import { STATUS_OPTIONS } from "@/types/opportunities";

interface Props {
  opportunity: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string; auto_status?: string | null }[];
  initialTab?: string;
}

type Tab = "details" | "notes" | "appointments" | "activities" | "documents" | "quotes";

export function OpportunityDetailDialog({ opportunity, open, onOpenChange, stages, initialTab }: Props) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const { data: staff = [] } = useCompanyStaff();
  const { data: salespeople = [] } = useCompanySalespeople();
  const { data: callCenterUsers = [] } = useCompanyCallCenterUsers();
  const { data: notes = [] } = useOpportunityNotes(opportunity?.id || null, opportunity?.contact_id || null);
  const addNote = useAddOpportunityNote();
  const { data: pipelines = [] } = usePipelines();

  const { data: contactCustomFields = [] } = useContactCustomFields();
  const { data: oppCustomFields = [] } = useOpportunityCustomFields();
  const { data: contactFieldValues = [] } = useContactFieldValues(opportunity?.contact_id || null);
  const { data: oppFieldValues = [] } = useOpportunityFieldValues(opportunity?.id || null);
  const updateContact = useUpdateContact();
  const upsertContactFields = useUpsertContactFieldValues();
  const upsertOppFields = useUpsertOpportunityFieldValues();

  const [tab, setTab] = useState<Tab>("details");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Contact fields
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactCity, setContactCity] = useState("");
  const [contactCustomValues, setContactCustomValues] = useState<Record<string, string>>({});

  // Opportunity fields
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("open");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [callCenterId, setCallCenterId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [oppNotes, setOppNotes] = useState("");
  const [oppTags, setOppTags] = useState<string[]>([]);
  const [oppCustomValues, setOppCustomValues] = useState<Record<string, string>>({});
  const [probability, setProbability] = useState(50);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [showLossDialog, setShowLossDialog] = useState(false);
  const [pendingLostStatus, setPendingLostStatus] = useState(false);

  // Loss reasons for the company
  const { data: lossReasons = [] } = useQuery({
    queryKey: ["opportunity_loss_reasons", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_loss_reasons")
        .select("*")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Change contact state
  const [changingContact, setChangingContact] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);

  // Track synced IDs to prevent infinite loops
  const lastSyncedContactFieldsRef = useRef<string>("");
  const lastSyncedOppFieldsRef = useRef<string>("");

  // Fetch contacts for change contact combobox
  const { data: searchContacts = [] } = useQuery({
    queryKey: ["marketing_contacts_search_detail", companyId, contactSearch],
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, city")
        .eq("company_id", companyId!)
        .limit(20);
      if (contactSearch) {
        query = query.or(`first_name.ilike.%${contactSearch}%,last_name.ilike.%${contactSearch}%,email.ilike.%${contactSearch}%`);
      }
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && changingContact,
  });

  useEffect(() => {
    if (opportunity) {
      const contact = opportunity.marketing_contacts;
      setContactEmail(contact?.email || "");
      setContactPhone(contact?.phone || "");
      setContactCity(contact?.city || "");
      setName(opportunity.name || "");
      setStageId(opportunity.stage_id || "");
      setStatus(opportunity.status || "open");
      setValue(String(opportunity.value || 0));
      setSource(opportunity.source || "");
      setAssignedTo(opportunity.assigned_to || "");
      setFollowerId(opportunity.follower_id || "");
      setCallCenterId(opportunity.call_center_id || "");
      setCompanyName(opportunity.company_name || "");
      setOppNotes(opportunity.notes || "");
      setOppTags(opportunity.tags || []);
      setProbability(opportunity.probability ?? 50);
      setExpectedCloseDate(opportunity.expected_close_date || "");
      setLossReason(opportunity.loss_reason || "");
      setLossNotes(opportunity.loss_notes || "");
      setTab((initialTab as Tab) || "details");
      setNewNote("");
      setChangingContact(false);
      setShowNewContactForm(false);
      setPendingContactId(null);
      lastSyncedContactFieldsRef.current = "";
      lastSyncedOppFieldsRef.current = "";
    }
  }, [opportunity, initialTab]);

  // Auto-sync: merge contact tags into opportunity if missing (safety net)
  // Guard: only write if there are actually missing tags to avoid unnecessary DB writes
  const lastSyncedTagsRef = useRef<string>("");
  useEffect(() => {
    if (!opportunity || !open) return;
    const contact = opportunity.marketing_contacts;
    if (!contact?.tags?.length) return;
    const oppTagsCurrent: string[] = opportunity.tags || [];
    const missing = contact.tags.filter((t: string) => !oppTagsCurrent.includes(t));
    if (missing.length === 0) return;
    // Prevent duplicate syncs for the same opportunity
    const syncKey = `${opportunity.id}-${missing.sort().join(",")}`;
    if (lastSyncedTagsRef.current === syncKey) return;
    lastSyncedTagsRef.current = syncKey;
    const merged = [...new Set([...oppTagsCurrent, ...contact.tags])];
    setOppTags(merged);
    supabase
      .from("marketing_opportunities")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", opportunity.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
      });
  }, [opportunity?.id, open, queryClient]);

  // Sync contact custom field values - with guard to prevent infinite loop
  useEffect(() => {
    const serialized = JSON.stringify(contactFieldValues);
    if (serialized === lastSyncedContactFieldsRef.current) return;
    lastSyncedContactFieldsRef.current = serialized;
    const map: Record<string, string> = {};
    contactFieldValues.forEach((v: any) => { map[v.field_id] = v.value || ""; });
    setContactCustomValues(map);
  }, [contactFieldValues]);

  // Sync opportunity custom field values - with guard to prevent infinite loop
  useEffect(() => {
    const serialized = JSON.stringify(oppFieldValues);
    if (serialized === lastSyncedOppFieldsRef.current) return;
    lastSyncedOppFieldsRef.current = serialized;
    const map: Record<string, string> = {};
    oppFieldValues.forEach((v: any) => { map[v.field_id] = v.value || ""; });
    setOppCustomValues(map);
  }, [oppFieldValues]);

  if (!opportunity) return null;

  const contact = opportunity.marketing_contacts;
  const fullName = contact ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() : opportunity.name;
  const cityPart = contact?.city ? ` - ${contact.city}` : "";
  const pipelineName = pipelines.find((p: any) => p.id === opportunity.pipeline_id)?.name || "";

  const isSaving = updateOpp.isPending || updateContact.isPending || upsertContactFields.isPending || upsertOppFields.isPending;

  const handleSave = async () => {
    // Handle new contact creation if pending
    let finalContactId = pendingContactId || opportunity.contact_id;

    if (showNewContactForm && newContactName.trim()) {
      const nameParts = newContactName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || null;

      const { data: newContact, error } = await supabase
        .from("marketing_contacts")
        .insert({
          company_id: companyId!,
          first_name: firstName,
          last_name: lastName,
          email: newContactEmail || null,
          phone: newContactPhone || null,
        })
        .select("id")
        .single();

      if (error) { toast.error(error.message); return; }
      finalContactId = newContact.id;
    }

    // 2. Update contact base fields if changed (only if not changing contact)
    if (!pendingContactId && !showNewContactForm && contact && (contactEmail !== (contact.email || "") || contactPhone !== (contact.phone || "") || contactCity !== (contact.city || ""))) {
      updateContact.mutate({ id: contact.id, email: contactEmail || null, phone: contactPhone || null, city: contactCity || null });
    }

    // 3. Upsert contact custom field values
    const contactFieldsToUpsert = Object.entries(contactCustomValues)
      .filter(([fieldId, val]) => {
        const original = contactFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ contact_id: finalContactId, field_id, value: value || null }));
    if (contactFieldsToUpsert.length) upsertContactFields.mutate(contactFieldsToUpsert);

    // 4. Upsert opportunity custom field values
    const oppFieldsToUpsert = Object.entries(oppCustomValues)
      .filter(([fieldId, val]) => {
        const original = oppFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ opportunity_id: opportunity.id, field_id, value: value || null }));
    if (oppFieldsToUpsert.length) upsertOppFields.mutate(oppFieldsToUpsert);

    // 1. Update opportunity (toast + close on success)
    updateOpp.mutate({
      id: opportunity.id,
      name, stage_id: stageId, status,
      value: parseFloat(value) || 0,
      source: source || null,
      assigned_to: assignedTo || null,
      follower_id: followerId || null,
      call_center_id: callCenterId || null,
      company_name: companyName || null,
      notes: oppNotes || null,
      tags: oppTags,
      contact_id: finalContactId,
      probability,
      expected_close_date: expectedCloseDate || null,
      loss_reason: lossReason || null,
      loss_notes: lossNotes || null,
    }, {
      onSuccess: async () => {
        // Bidirectional tag sync: added tags → contact, removed tags → contact
        const originalTags: string[] = opportunity.tags || [];
        const addedTags = oppTags.filter((t: string) => !originalTags.includes(t));
        const removedTags = originalTags.filter((t: string) => !oppTags.includes(t));

        if (addedTags.length > 0) {
          await syncTagsToContact(finalContactId, addedTags);
        }
        for (const tag of removedTags) {
          await removeTagFromContact(finalContactId, tag);
        }
        toast.success("Opportunità aggiornata con successo");
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e.message || "Errore durante il salvataggio"),
    });
  };

  const handleDelete = () => {
    setConfirmDelete(true);
  };

  const confirmDeleteAction = () => {
    deleteOpp.mutate(opportunity.id, { onSuccess: () => { setConfirmDelete(false); onOpenChange(false); } });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNote.mutate({ opportunityId: opportunity.id, contactId: opportunity.contact_id, content: newNote.trim() }, { onSuccess: () => setNewNote("") });
  };

  const handleSelectExistingContact = (c: any) => {
    setPendingContactId(c.id);
    setContactEmail(c.email || "");
    setContactPhone(c.phone || "");
    setContactCity(c.city || "");
    setContactSearch(`${c.first_name} ${c.last_name || ""}`.trim());
    setShowContactDropdown(false);
    setShowNewContactForm(false);
  };

  const renderCustomField = (field: any, values: Record<string, string>, setValues: (v: Record<string, string>) => void) => {
    const val = values[field.id] || "";
    if (hideEmpty && !val && tab === "details") return null;

    const onChange = (newVal: string) => setValues({ ...values, [field.id]: newVal });

    return (
      <div key={field.id} className="space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        {field.field_type === "select" ? (
          <Select value={val || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {(field.options || []).map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : field.field_type === "number" ? (
          <Input value={val} onChange={(e) => onChange(e.target.value)} type="number" className="h-8 text-sm" />
        ) : field.field_type === "date" ? (
          <Input value={val} onChange={(e) => onChange(e.target.value)} type="date" className="h-8 text-sm" />
        ) : field.field_type === "textarea" ? (
          <Textarea value={val} onChange={(e) => onChange(e.target.value)} rows={2} className="text-sm" />
        ) : (
          <Input value={val} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
        )}
      </div>
    );
  };

  const sidebarTabs: { key: Tab; label: string; icon: React.ReactNode; enabled: boolean }[] = [
    { key: "details", label: "Dettagli dell'opportunità", icon: <FileText className="h-4 w-4" />, enabled: true },
    { key: "appointments", label: "Prenota/aggiorna appuntamento", icon: <CalendarDays className="h-4 w-4" />, enabled: true },
    { key: "activities", label: "Attività", icon: <Activity className="h-4 w-4" />, enabled: true },
    { key: "notes", label: "Note", icon: <StickyNote className="h-4 w-4" />, enabled: true },
    { key: "documents", label: "Documenti", icon: <Folder className="h-4 w-4" />, enabled: true },
    { key: "quotes", label: "Preventivi", icon: <Receipt className="h-4 w-4" />, enabled: true },
  ];

  const searchTrimmed = contactSearch.trim();

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <DialogTitle className="text-lg font-semibold">Modifica "{fullName}{cityPart}"</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Aggiungi e Modifica opportunità Dettagli, attività, note e Appuntamento.
          </DialogDescription>
        </div>

        <Separator />

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-[200px] border-r bg-muted/20 py-2 shrink-0">
            {sidebarTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  if (!t.enabled) { toast.info(`${t.label}: in arrivo`); return; }
                  setTab(t.key);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs transition-colors text-left ${
                  tab === t.key
                    ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                    : "text-muted-foreground hover:bg-muted/50"
                } ${!t.enabled ? "opacity-50" : ""}`}
              >
                {t.icon}
                <span className="leading-tight">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-5">
              {tab === "details" && (
                <div className="space-y-6">
                  {/* Contatto Dettagli */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Contatto Dettagli</h3>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <Checkbox checked={hideEmpty} onCheckedChange={(c) => setHideEmpty(!!c)} className="h-3.5 w-3.5" />
                          Nascondi campi vuoti
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Contact name - with change button */}
                      {!changingContact ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nome del contatto primario</Label>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-sm flex-1">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              {pendingContactId ? contactSearch : (fullName || "—")}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                setChangingContact(true);
                                setContactSearch("");
                                setShowNewContactForm(false);
                                setPendingContactId(null);
                              }}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Cambia
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Cerca o crea contatto</Label>
                          <div className="relative">
                            <Input
                              placeholder="Cerca contatto..."
                              value={contactSearch}
                              onChange={(e) => {
                                setContactSearch(e.target.value);
                                setShowContactDropdown(true);
                                setShowNewContactForm(false);
                              }}
                              onFocus={() => setShowContactDropdown(true)}
                              onBlur={() => setTimeout(() => setShowContactDropdown(false), 300)}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            {showContactDropdown && (
                              <div className="absolute z-50 w-full mt-1 border rounded-lg bg-popover shadow-lg max-h-[200px] overflow-y-auto">
                                {searchContacts.length > 0 ? (
                                  searchContacts.map((c: any) => (
                                    <button
                                      key={c.id}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0 flex items-center gap-2"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        handleSelectExistingContact(c);
                                        setChangingContact(false);
                                      }}
                                    >
                                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="font-medium text-xs truncate">{c.first_name} {c.last_name || ""}</p>
                                        {c.email && <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>}
                                      </div>
                                    </button>
                                  ))
                                ) : (
                                  <div className="flex flex-col items-center py-4 text-muted-foreground">
                                    <DatabaseZap className="h-6 w-6 mb-1 opacity-40" />
                                    <p className="text-xs">Nessun risultato</p>
                                  </div>
                                )}
                                <button
                                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-primary font-medium border-t"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setShowNewContactForm(true);
                                    setShowContactDropdown(false);
                                    setChangingContact(false);
                                    setPendingContactId(null);
                                    if (searchTrimmed) setNewContactName(searchTrimmed);
                                  }}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  + {searchTrimmed || ""} (Crea nuovo contatto)
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setChangingContact(false);
                              setPendingContactId(null);
                            }}
                          >
                            Annulla
                          </button>
                        </div>
                      )}

                      {/* New contact inline form */}
                      {showNewContactForm && (
                        <div className="space-y-2 p-3 rounded-lg border border-dashed bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Nuovo contatto</Label>
                            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowNewContactForm(false)}>Annulla</button>
                          </div>
                          <Input placeholder="Nome e cognome *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="h-8 text-sm" />
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} className="h-8 text-sm" type="email" />
                            <Input placeholder="Telefono" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="h-8 text-sm" type="tel" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactEmail) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Email primaria</Label>
                          <div className="relative">
                            <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactPhone) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Telefono primario</Label>
                          <div className="relative">
                            <Phone className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactCity) && !showNewContactForm && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Città</Label>
                          <Input value={contactCity} onChange={(e) => setContactCity(e.target.value)} className="h-8 text-sm" />
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Opportunità Dettagli */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Opportunità Dettagli</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nome opportunità</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sequenza</Label>
                          <div className="h-8 px-3 border rounded-md bg-muted/30 text-sm flex items-center">
                            {pipelineName || "—"}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fase</Label>
                          <Select value={stageId} onValueChange={(newStageId) => {
                            setStageId(newStageId);
                            // Auto-update status based on stage's auto_status
                            const pipeline = pipelines.find((p: any) => p.id === opportunity.pipeline_id);
                            const targetStage = pipeline?.marketing_pipeline_stages?.find((s: any) => s.id === newStageId);
                            if (targetStage?.auto_status) {
                              setStatus(targetStage.auto_status);
                            }
                          }}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Stato</Label>
                          <Select value={status} onValueChange={(newStatus) => {
                            if (newStatus === "lost" && status !== "lost") {
                              setPendingLostStatus(true);
                              setShowLossDialog(true);
                            } else {
                              setStatus(newStatus);
                              if (newStatus !== "lost") {
                                setLossReason("");
                                setLossNotes("");
                              }
                            }
                          }}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Valore dell'opportunità (€)</Label>
                          <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="h-8 text-sm" />
                        </div>
                      </div>

                      {/* Probability + Expected Close Date */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Probabilità di chiusura ({probability}%)</Label>
                          <Slider
                            value={[probability]}
                            onValueChange={([v]) => setProbability(v)}
                            min={0}
                            max={100}
                            step={5}
                            className="py-2"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>0%</span>
                            <span className="font-medium">Pesato: {((parseFloat(value) || 0) * probability / 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })} €</span>
                            <span>100%</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Data chiusura prevista</Label>
                          <Input
                            type="date"
                            value={expectedCloseDate}
                            onChange={(e) => setExpectedCloseDate(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Loss reason (shown only when status is lost) */}
                      {status === "lost" && (
                        <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <Label className="text-xs font-semibold">Motivo della perdita</Label>
                          </div>
                          <Select value={lossReason || "none"} onValueChange={(v) => setLossReason(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona motivo..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Nessuno —</SelectItem>
                              <SelectItem value="prezzo">Prezzo troppo alto</SelectItem>
                              <SelectItem value="concorrenza">Scelto concorrente</SelectItem>
                              <SelectItem value="tempistica">Tempistica non adatta</SelectItem>
                              <SelectItem value="non_risponde">Non risponde</SelectItem>
                              <SelectItem value="non_interessato">Non più interessato</SelectItem>
                              <SelectItem value="budget">Budget insufficiente</SelectItem>
                              <SelectItem value="altro">Altro</SelectItem>
                              {lossReasons.map((r: any) => (
                                <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Note sulla perdita</Label>
                            <Textarea
                              value={lossNotes}
                              onChange={(e) => setLossNotes(e.target.value)}
                              placeholder="Dettagli opzionali..."
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Titolare</Label>
                          <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Non assegnato</SelectItem>
                              {salespeople.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Follower</Label>
                          <Select value={followerId || "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessuno</SelectItem>
                              {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Call Center</Label>
                          <Select value={callCenterId || "none"} onValueChange={(v) => setCallCenterId(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessuno</SelectItem>
                              {callCenterUsers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nome dell'azienda</Label>
                          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fonte dell'opportunità</Label>
                          <Input value={source} onChange={(e) => setSource(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Etichette</Label>
                        <TagSelector selectedTags={oppTags} onTagsChange={setOppTags} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Note</Label>
                        <Textarea value={oppNotes} onChange={(e) => setOppNotes(e.target.value)} rows={2} className="text-sm" />
                      </div>

                      {/* Custom opportunity fields */}
                      {oppCustomFields.map((field: any) =>
                        renderCustomField(field, oppCustomValues, setOppCustomValues)
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === "notes" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Scrivi una nota..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                      className="text-sm flex-1"
                    />
                    <Button size="sm" onClick={handleAddNote} disabled={addNote.isPending || !newNote.trim()} className="self-end">
                      {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
                    </Button>
                  </div>
                  <Separator />
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nessuna nota</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note: any) => (
                        <div key={note.id} className="p-3 rounded-lg border bg-muted/20">
                          <div className="flex items-center gap-2 mb-1">
                            {note.opportunity_id === opportunity.id ? (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Opportunità</Badge>
                            ) : note.opportunity_id ? (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">Altra opp.</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">Contatto</Badge>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {format(new Date(note.created_at), "d MMM yyyy HH:mm", { locale: it })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "appointments" && (
                <OpportunityAppointmentTab
                  contactId={opportunity.contact_id}
                  companyId={companyId!}
                  opportunityId={opportunity.id}
                  contactName={fullName}
                />
              )}

              {tab === "activities" && (
                <LinkedTasks
                  opportunityId={opportunity.id}
                  category="opportunita"
                  companyId={companyId}
                />
              )}

              {tab === "documents" && (
                <MarketingDocumentsPanel
                  contactId={opportunity.contact_id}
                  opportunityId={opportunity.id}
                  companyId={companyId!}
                  linkToOpportunity
                />
              )}

              {tab === "quotes" && (
                <OpportunityQuotesTab
                  contactId={opportunity.contact_id}
                  companyId={companyId}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { navigate("/azienda/impostazioni/campi-personalizzati"); onOpenChange(false); }}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Aggiungi/gestisci campi
            </button>
            <span className="text-[11px] text-muted-foreground">
              Creato il: {format(new Date(opportunity.created_at), "d MMM yyyy", { locale: it })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleteOpp.isPending} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aggiorna
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questa opportunità?</AlertDialogTitle>
          <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDeleteAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Loss reason dialog */}
    <AlertDialog open={showLossDialog} onOpenChange={(open) => {
      if (!open) {
        setPendingLostStatus(false);
      }
      setShowLossDialog(open);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Motivo della perdita
          </AlertDialogTitle>
          <AlertDialogDescription>
            Seleziona il motivo per cui questa opportunità è stata persa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <Select value={lossReason || "none"} onValueChange={(v) => setLossReason(v === "none" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleziona motivo..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Nessuno —</SelectItem>
              <SelectItem value="prezzo">Prezzo troppo alto</SelectItem>
              <SelectItem value="concorrenza">Scelto concorrente</SelectItem>
              <SelectItem value="tempistica">Tempistica non adatta</SelectItem>
              <SelectItem value="non_risponde">Non risponde</SelectItem>
              <SelectItem value="non_interessato">Non più interessato</SelectItem>
              <SelectItem value="budget">Budget insufficiente</SelectItem>
              <SelectItem value="altro">Altro</SelectItem>
              {lossReasons.map((r: any) => (
                <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={lossNotes}
            onChange={(e) => setLossNotes(e.target.value)}
            placeholder="Note opzionali..."
            rows={2}
            className="text-sm"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingLostStatus(false)}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setStatus("lost");
              setPendingLostStatus(false);
              setShowLossDialog(false);
            }}
          >
            Conferma Perdita
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
