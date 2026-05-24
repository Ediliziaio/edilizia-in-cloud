import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateOpportunity, useCompanyStaff, useCompanySalespeople, useCompanyCallCenterUsers } from "@/hooks/useOpportunitiesData";
import { useOpportunityCustomFields } from "@/hooks/useOpportunityDetailData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, UserPlus, Settings2, DatabaseZap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagSelector } from "@/components/marketing/TagSelector";
import { CustomFieldInput } from "@/components/shared/CustomFieldInput";
import { useNavigate } from "react-router-dom";
import { syncTagsToContact } from "@/hooks/useTagSync";
import { STATUS_OPTIONS } from "@/types/opportunities";
import { cleanPhone } from "@/lib/contactUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeTagList } from "@/lib/marketingTags";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  pipelineName?: string;
  stages: { id: string; name: string; auto_status?: string | null }[];
}

type ContactSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  company_name: string | null;
};

type OpportunityCustomField = {
  id: string;
  name: string;
  field_type: string | null;
  options?: string[] | null;
};

function sanitizeSearchTerm(value: string) {
  return value.replace(/[%,]/g, " ").trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s().-]{6,20}$/;

export function OpportunityDialog({ open, onOpenChange, pipelineId, pipelineName, stages }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canEditOpportunities = permissions.canEditMarketingOpportunities || permissions.canEditMarketing;
  const canEditContacts = permissions.canEditMarketingContacts || permissions.canEditMarketing;
  const createOpportunity = useCreateOpportunity();
  const navigate = useNavigate();

  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const [oppName, setOppName] = useState("");
  const [nameManuallySet, setNameManuallySet] = useState(false);
  const [stageId, setStageId] = useState(stages[0]?.id || "");
  const [status, setStatus] = useState("open");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [oppCompanyName, setOppCompanyName] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [callCenterId, setCallCenterId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Fix: sync stageId when stages load async
  useEffect(() => {
    if (stages.length > 0 && !stages.some(s => s.id === stageId)) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  // Fetch contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing_contacts_search", companyId, contactSearch],
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, city, company_name")
        .eq("company_id", companyId!)
        .limit(20);
      const safeSearch = sanitizeSearchTerm(contactSearch);
      if (safeSearch) {
        query = query.or(`first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
      }
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return data as ContactSearchResult[];
    },
    enabled: !!companyId && open,
  });

  const { data: staff = [] } = useCompanyStaff();
  const { data: salespeople = [] } = useCompanySalespeople();
  const { data: callCenterUsers = [] } = useCompanyCallCenterUsers();
  const { data: customFields = [] } = useOpportunityCustomFields();

  // Auto-name from contact
  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  useEffect(() => {
    if (selectedContact && !nameManuallySet) {
      const name = `${selectedContact.first_name} ${selectedContact.last_name || ""}`.trim();
      const autoName = selectedContact.city ? `${name} - ${selectedContact.city}` : name;
      setOppName(autoName);
    }
  }, [selectedContactId, selectedContact, nameManuallySet]);

  const resetForm = () => {
    setSelectedContactId("");
    setContactSearch("");
    setShowNewContact(false);
    setNewContactName("");
    setNewContactEmail("");
    setNewContactPhone("");
    setOppName("");
    setNameManuallySet(false);
    setStageId(stages[0]?.id || "");
    setStatus("open");
    setValue("");
    setSource("");
    setOppCompanyName("");
    setAssignedTo("");
    setFollowerId("");
    setCallCenterId("");
    setTags([]);
    setCustomFieldValues({});
  };

  const handleSelectContact = (c: ContactSearchResult) => {
    setSelectedContactId(c.id);
    setShowNewContact(false);
    setContactSearch(`${c.first_name} ${c.last_name || ""}`.trim());
    setNewContactEmail(c.email || "");
    setNewContactPhone(c.phone || "");
  };

  const normalizeContactPayload = () => {
    const email = newContactEmail.trim().toLowerCase() || null;
    const phone = newContactPhone.trim() ? cleanPhone(newContactPhone) : null;
    return { email, phone };
  };

  const validateContactPayload = (email: string | null, phone: string | null) => {
    if (!email && !phone) return "Inserisci almeno email o telefono del contatto";
    if (email && !EMAIL_RE.test(email)) return "Email del contatto non valida";
    if (phone && !PHONE_RE.test(phone)) return "Telefono del contatto non valido";
    return null;
  };

  const findDuplicateContact = async (email: string | null, phone: string | null, excludeId?: string) => {
    const checks: Promise<{ data: ContactSearchResult[] | null; error: any }>[] = [];
    if (email) {
      checks.push(
        supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone, city, company_name")
          .eq("company_id", companyId!)
          .eq("email", email)
          .limit(1)
      );
    }
    if (phone) {
      checks.push(
        supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone, city, company_name")
          .eq("company_id", companyId!)
          .eq("phone", phone)
          .limit(1)
      );
    }

    const results = await Promise.all(checks);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;

    return results
      .flatMap((result) => result.data || [])
      .find((contact) => contact.id !== excludeId) || null;
  };

  const handleSubmit = async () => {
    if (!canEditOpportunities) {
      toast.error("Non hai i permessi per creare opportunità");
      return;
    }
    if (!companyId) {
      toast.error("Azienda non selezionata");
      return;
    }
    let contactId = selectedContactId;

    if (showNewContact) {
      if (!canEditContacts) {
        toast.error("Non hai i permessi per creare contatti");
        return;
      }
      if (!newContactName.trim()) {
        toast.error("Inserisci il nome del contatto");
        return;
      }
      const { email, phone } = normalizeContactPayload();
      const contactError = validateContactPayload(email, phone);
      if (contactError) {
        toast.error(contactError);
        return;
      }
      const duplicate = await findDuplicateContact(email, phone);
      if (duplicate) {
        toast.error("Contatto già presente", { description: "Seleziona il contatto esistente per evitare duplicati nel CRM." });
        return;
      }
      const nameParts = newContactName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || null;

      const { data: newContact, error } = await supabase
        .from("marketing_contacts")
        .insert({
          company_id: companyId!,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        })
        .select("id")
        .single();

      if (error) { toast.error(error.message); return; }
      contactId = newContact.id;
    }

    if (!contactId) {
      toast.error("Seleziona o crea un contatto");
      return;
    }

    if (selectedContactId && selectedContact) {
      const { email: nextEmail, phone: nextPhone } = normalizeContactPayload();
      if ((selectedContact.email || null) !== nextEmail || (selectedContact.phone || null) !== nextPhone) {
        if (!canEditContacts) {
          toast.error("Non hai i permessi per modificare i contatti");
          return;
        }
        const contactError = validateContactPayload(nextEmail, nextPhone);
        if (contactError) {
          toast.error(contactError);
          return;
        }
        const duplicate = await findDuplicateContact(nextEmail, nextPhone, selectedContactId);
        if (duplicate) {
          toast.error("Email o telefono già usati da un altro contatto");
          return;
        }
        const { error } = await supabase
          .from("marketing_contacts")
          .update({
            email: nextEmail,
            phone: nextPhone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedContactId)
          .eq("company_id", companyId!);
        if (error) {
          toast.error("Contatto non aggiornato", { description: error.message });
          return;
        }
      }
    }

    if (!stageId) {
      toast.error("Seleziona una fase");
      return;
    }
    if (!oppName.trim()) {
      toast.error("Inserisci il nome dell'opportunità");
      return;
    }
    const numericValue = value.trim() ? Number(value) : 0;
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      toast.error("Il valore economico deve essere un numero positivo");
      return;
    }

    createOpportunity.mutate(
      {
        contact_id: contactId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: oppName.trim(),
        value: numericValue,
        status,
        source: source || undefined,
        assigned_to: assignedTo || undefined,
        follower_id: followerId || undefined,
        call_center_id: callCenterId || undefined,
        company_name: oppCompanyName || undefined,
      },
      {
        onSuccess: async (data: { id?: string } | null | undefined) => {
          const oppId = data?.id;
          if (oppId) {
            // Save tags and sync to contact
            const normalizedTags = normalizeTagList(tags);
            if (normalizedTags.length > 0) {
              await supabase.from("marketing_opportunities").update({ tags: normalizedTags }).eq("id", oppId).eq("company_id", companyId!);
              await syncTagsToContact(contactId, normalizedTags, companyId);
            }
            // Save custom field values
            if (Object.keys(customFieldValues).length > 0) {
              const rows = Object.entries(customFieldValues)
                .filter(([, v]) => v.trim())
                .map(([fieldId, val]) => ({ opportunity_id: oppId, field_id: fieldId, value: val }));
              if (rows.length > 0) {
                await supabase.from("marketing_opportunity_field_values").insert(rows);
              }
            }
          }
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const [showDropdown, setShowDropdown] = useState(false);
  const searchTrimmed = contactSearch.trim();

  const statusOptions = STATUS_OPTIONS;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-bold">Aggiungi Nuovo opportunità</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Crea Nuovo opportunità in dettagli e selezionando un contatto</DialogDescription>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-6">
              {/* Section 1: Contatto Dettagli */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground border-b pb-2">Contatto Dettagli</h3>

                {/* Contact combobox */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Nome del contatto primario <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="Cerca contatto..."
                      value={contactSearch}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setShowDropdown(true);
                        if (selectedContactId) {
                          setSelectedContactId("");
                          setNameManuallySet(false);
                        }
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 300)}
                      className="h-9 text-sm"
                    />
                    {showDropdown && !showNewContact && (
                      <div className="absolute z-50 w-full mt-1 border rounded-lg bg-popover shadow-lg max-h-[220px] overflow-y-auto">
                        {contacts.length > 0 ? (
                          contacts.map((c) => (
                            <button
                              key={c.id}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0 flex items-center gap-2 ${selectedContactId === c.id ? "bg-primary/10 text-primary" : ""}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                handleSelectContact(c);
                                setShowDropdown(false);
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
                          <div className="flex flex-col items-center py-6 text-muted-foreground">
                            <DatabaseZap className="h-8 w-8 mb-2 opacity-40" />
                            <p className="text-xs">No Data</p>
                          </div>
                        )}
                        {/* Create new contact option */}
                        <button
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-primary font-medium border-t"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowNewContact(true);
                            setSelectedContactId("");
                            setShowDropdown(false);
                            if (searchTrimmed) {
                              setNewContactName(searchTrimmed);
                            }
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          + {searchTrimmed || ""} (Crea nuovo contatto)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* New contact inline form */}
                {showNewContact && (
                  <div className="space-y-2 p-3 rounded-lg border border-dashed bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Nuovo contatto</Label>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowNewContact(false)}>Annulla</button>
                    </div>
                    <Input placeholder="Nome e cognome *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="h-8 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} className="h-8 text-sm" type="email" />
                      <Input placeholder="Telefono" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="h-8 text-sm" type="tel" />
                    </div>
                  </div>
                )}

                {/* Email + Phone (shown after selecting existing contact) */}
                {selectedContactId && selectedContact && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Email primaria</Label>
                      <Input
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                        placeholder="Inserisci email"
                        className="h-9 text-sm"
                        type="email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Telefono primario</Label>
                      <Input
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        placeholder="Telefono"
                        className="h-9 text-sm"
                        type="tel"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Opportunità Dettagli */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground border-b pb-2">Opportunità Dettagli</h3>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Nome opportunità <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={oppName}
                    onChange={(e) => { setOppName(e.target.value); setNameManuallySet(true); }}
                    placeholder="Auto: nome contatto - città"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Pipeline + Stage */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Sequenza</Label>
                    <Input
                      value={pipelineName || "Pipeline"}
                      readOnly
                      className="h-9 text-sm bg-muted cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Fase</Label>
                    <Select value={stageId} onValueChange={(v) => {
                      setStageId(v);
                      const stage = stages.find((s) => s.id === v);
                      if (stage?.auto_status) setStatus(stage.auto_status);
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Status + Value */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Stato</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Valore dell'opportunità</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">EUR</span>
                      <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="0"
                        className="h-9 text-sm pl-10"
                        type="number"
                      />
                    </div>
                  </div>
                </div>

                {/* Owner + Follower + Call Center */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">💼 Titolare</Label>
                    <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non assegnato</SelectItem>
                        {salespeople.length > 0 && salespeople[0]?.source === "all" && (
                          <div className="px-2 py-1 text-[10px] text-amber-600 font-medium">⚠ Nessun venditore configurato — mostro tutto lo staff</div>
                        )}
                        {salespeople.map((s: { id: string; name: string; source?: string }) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">👥 Follower</Label>
                    <Select value={followerId || "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuno</SelectItem>
                        {staff.map((s: { id: string; name: string }) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">📞 Call Center</Label>
                    <Select value={callCenterId || "none"} onValueChange={(v) => setCallCenterId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuno</SelectItem>
                        {callCenterUsers.length > 0 && callCenterUsers[0]?.source === "all" && (
                          <div className="px-2 py-1 text-[10px] text-amber-600 font-medium">⚠ Nessun call center configurato — mostro tutto lo staff</div>
                        )}
                        {callCenterUsers.map((s: { id: string; name: string; source?: string }) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Company + Source */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Nome dell'azienda</Label>
                    <Input value={oppCompanyName} onChange={(e) => setOppCompanyName(e.target.value)} placeholder="Nome azienda" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Fonte dell'opportunità</Label>
                    <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="es. Passaparola" className="h-9 text-sm" />
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Etichette</Label>
                  <TagSelector selectedTags={tags} onTagsChange={setTags} />
                </div>

                {/* Custom fields — v8.6.44: usa CustomFieldInput unificato
                    per supportare tutti i tipi (text/number/date/select/
                    radio/multiselect/checkbox/email/phone/url/time/currency/
                    percent/textarea). Prima il render gestiva solo select
                    e textbox generica, ignorando 11 tipi. */}
                {customFields && customFields.length > 0 && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campi personalizzati dell'opportunità</Label>
                    {(customFields as OpportunityCustomField[]).map((field) => (
                      <CustomFieldInput
                        key={field.id}
                        fieldId={field.id}
                        label={field.name}
                        type={field.field_type}
                        options={field.options}
                        value={customFieldValues[field.id] || ""}
                        onChange={(v) => setCustomFieldValues((prev) => ({
                          ...prev,
                          [field.id]: v === null || v === undefined ? "" : String(v),
                        }))}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between">
          <button
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={() => {
              onOpenChange(false);
              navigate("/azienda/impostazioni/campi-personalizzati");
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Aggiungi/gestisci campi
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { resetForm(); onOpenChange(false); }}>Annulla</Button>
            <Button size="sm" onClick={handleSubmit} disabled={createOpportunity.isPending || !canEditOpportunities}>
              {createOpportunity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
