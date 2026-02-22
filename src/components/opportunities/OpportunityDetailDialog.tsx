import { useState, useEffect, useMemo } from "react";
import { useUpdateOpportunity, useDeleteOpportunity, useCompanyStaff, useOpportunityNotes, useAddOpportunityNote, usePipelines } from "@/hooks/useOpportunitiesData";
import {
  useContactCustomFields, useOpportunityCustomFields,
  useContactFieldValues, useOpportunityFieldValues,
  useUpdateContact, useUpsertContactFieldValues, useUpsertOpportunityFieldValues,
} from "@/hooks/useOpportunityDetailData";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { TagSelector } from "@/components/marketing/TagSelector";
import {
  Loader2, Trash2, StickyNote, FileText, CalendarDays, Activity,
  CreditCard, Users, Settings2, User, Mail, Phone,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  opportunity: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string }[];
}

type Tab = "details" | "notes" | "appointments" | "activities" | "payments" | "members";

export function OpportunityDetailDialog({ opportunity, open, onOpenChange, stages }: Props) {
  const navigate = useNavigate();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const { data: staff = [] } = useCompanyStaff();
  const { data: notes = [] } = useOpportunityNotes(opportunity?.id || null);
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

  // Contact fields
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactCustomValues, setContactCustomValues] = useState<Record<string, string>>({});

  // Opportunity fields
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("open");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [oppNotes, setOppNotes] = useState("");
  const [oppTags, setOppTags] = useState<string[]>([]);
  const [oppCustomValues, setOppCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (opportunity) {
      const contact = opportunity.marketing_contacts;
      setContactEmail(contact?.email || "");
      setContactPhone(contact?.phone || "");
      setName(opportunity.name || "");
      setStageId(opportunity.stage_id || "");
      setStatus(opportunity.status || "open");
      setValue(String(opportunity.value || 0));
      setSource(opportunity.source || "");
      setAssignedTo(opportunity.assigned_to || "");
      setFollowerId(opportunity.follower_id || "");
      setCompanyName(opportunity.company_name || "");
      setOppNotes(opportunity.notes || "");
      setOppTags(opportunity.tags || []);
      setTab("details");
      setNewNote("");
    }
  }, [opportunity]);

  // Sync custom field values when loaded
  useEffect(() => {
    const map: Record<string, string> = {};
    contactFieldValues.forEach((v: any) => { map[v.field_id] = v.value || ""; });
    setContactCustomValues(map);
  }, [contactFieldValues]);

  useEffect(() => {
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
    // 1. Update opportunity
    updateOpp.mutate({
      id: opportunity.id,
      name, stage_id: stageId, status,
      value: parseFloat(value) || 0,
      source: source || null,
      assigned_to: assignedTo || null,
      follower_id: followerId || null,
      company_name: companyName || null,
      notes: oppNotes || null,
      tags: oppTags,
    });

    // 2. Update contact base fields if changed
    if (contact && (contactEmail !== (contact.email || "") || contactPhone !== (contact.phone || ""))) {
      updateContact.mutate({ id: contact.id, email: contactEmail || null, phone: contactPhone || null });
    }

    // 3. Upsert contact custom field values
    const contactFieldsToUpsert = Object.entries(contactCustomValues)
      .filter(([fieldId, val]) => {
        const original = contactFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ contact_id: opportunity.contact_id, field_id, value: value || null }));
    if (contactFieldsToUpsert.length) upsertContactFields.mutate(contactFieldsToUpsert);

    // 4. Upsert opportunity custom field values
    const oppFieldsToUpsert = Object.entries(oppCustomValues)
      .filter(([fieldId, val]) => {
        const original = oppFieldValues.find((v: any) => v.field_id === fieldId);
        return (original?.value || "") !== val;
      })
      .map(([field_id, value]) => ({ opportunity_id: opportunity.id, field_id, value: value || null }));
    if (oppFieldsToUpsert.length) upsertOppFields.mutate(oppFieldsToUpsert);

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!confirm("Eliminare questa opportunità?")) return;
    deleteOpp.mutate(opportunity.id, { onSuccess: () => onOpenChange(false) });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNote.mutate({ opportunityId: opportunity.id, content: newNote.trim() }, { onSuccess: () => setNewNote("") });
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
    { key: "appointments", label: "Prenota/aggiorna appuntamento", icon: <CalendarDays className="h-4 w-4" />, enabled: false },
    { key: "activities", label: "Attività", icon: <Activity className="h-4 w-4" />, enabled: false },
    { key: "notes", label: "Note", icon: <StickyNote className="h-4 w-4" />, enabled: true },
    { key: "payments", label: "Pagamenti", icon: <CreditCard className="h-4 w-4" />, enabled: false },
    { key: "members", label: "Oggetti Membri", icon: <Users className="h-4 w-4" />, enabled: false },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold">Modifica "{fullName}{cityPart}"</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggiungi e Modifica opportunità Dettagli, attività, note e Appuntamento.
          </p>
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
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <Checkbox checked={hideEmpty} onCheckedChange={(c) => setHideEmpty(!!c)} className="h-3.5 w-3.5" />
                        Nascondi campi vuoti
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nome del contatto primario</Label>
                        <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {fullName || "—"}
                        </div>
                      </div>

                      {(!hideEmpty || contactEmail) && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Email primaria</Label>
                          <div className="relative">
                            <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty || contactPhone) && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Telefono primario</Label>
                          <div className="relative">
                            <Phone className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="h-8 text-sm pl-8" />
                          </div>
                        </div>
                      )}

                      {(!hideEmpty) && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Contatti aggiuntivo</Label>
                          <p className="text-xs text-muted-foreground italic px-1">Aggiungi altri contatti</p>
                        </div>
                      )}

                      {/* Custom contact fields */}
                      {contactCustomFields.map((field: any) =>
                        renderCustomField(field, contactCustomValues, setContactCustomValues)
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
                          <Select value={stageId} onValueChange={setStageId}>
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
                          <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Aperta</SelectItem>
                              <SelectItem value="won">Vinta</SelectItem>
                              <SelectItem value="lost">Persa</SelectItem>
                              <SelectItem value="abandoned">Abbandonata</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Valore dell'opportunità (€)</Label>
                          <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="h-8 text-sm" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Titolare</Label>
                          <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Non assegnato</SelectItem>
                              {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
  );
}
