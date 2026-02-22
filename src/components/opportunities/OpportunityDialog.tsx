import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateOpportunity, useCompanyStaff } from "@/hooks/useOpportunitiesData";
import { useOpportunityCustomFields } from "@/hooks/useOpportunityDetailData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, UserPlus, FileText, Settings2, DatabaseZap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagSelector } from "@/components/marketing/TagSelector";
import { useNavigate } from "react-router-dom";
import { syncTagsToContact } from "@/hooks/useTagSync";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  pipelineName?: string;
  stages: { id: string; name: string; auto_status?: string | null }[];
}

export function OpportunityDialog({ open, onOpenChange, pipelineId, pipelineName, stages }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
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
  const [tags, setTags] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Fetch contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing_contacts_search", companyId, contactSearch],
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, city, company_name")
        .eq("company_id", companyId!)
        .limit(20);
      if (contactSearch) {
        query = query.or(`first_name.ilike.%${contactSearch}%,last_name.ilike.%${contactSearch}%,email.ilike.%${contactSearch}%`);
      }
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

  const { data: staff = [] } = useCompanyStaff();
  const { data: customFields = [] } = useOpportunityCustomFields();

  // Auto-name from contact
  const selectedContact = contacts.find((c: any) => c.id === selectedContactId);

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
    setTags([]);
    setCustomFieldValues({});
  };

  const handleSelectContact = (c: any) => {
    setSelectedContactId(c.id);
    setShowNewContact(false);
    setContactSearch(`${c.first_name} ${c.last_name || ""}`.trim());
    setNewContactEmail(c.email || "");
    setNewContactPhone(c.phone || "");
  };

  const handleSubmit = async () => {
    let contactId = selectedContactId;

    if (showNewContact) {
      if (!newContactName.trim()) {
        toast.error("Inserisci il nome del contatto");
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
          email: newContactEmail || null,
          phone: newContactPhone || null,
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
    if (!stageId) {
      toast.error("Seleziona una fase");
      return;
    }

    createOpportunity.mutate(
      {
        contact_id: contactId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: oppName || "Nuova Opportunità",
        value: value ? parseFloat(value) : 0,
        status,
        source: source || undefined,
        assigned_to: assignedTo || undefined,
        follower_id: followerId || undefined,
        company_name: oppCompanyName || undefined,
      },
      {
        onSuccess: async (data: any) => {
          const oppId = data?.id;
          if (oppId) {
            // Save tags and sync to contact
            if (tags.length > 0) {
              await supabase.from("marketing_opportunities").update({ tags }).eq("id", oppId);
              await syncTagsToContact(contactId, tags);
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
  const filteredContacts = contacts;

  const statusOptions = [
    { value: "open", label: "Aperta" },
    { value: "won", label: "Vinta" },
    { value: "lost", label: "Persa" },
    { value: "abandoned", label: "Abbandonata" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-bold">Aggiungi Nuovo opportunità</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Crea Nuovo opportunità in dettagli e selezionando un contatto</DialogDescription>
        </div>

        {/* Body with sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-[200px] border-r bg-muted/30 p-3 shrink-0">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" />
              Dettagli dell'opportunità
            </button>
          </div>

          {/* Content */}
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
                        {filteredContacts.length > 0 ? (
                          filteredContacts.map((c: any) => (
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

                {/* Owner + Follower */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Titolare</Label>
                    <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non assegnato</SelectItem>
                        {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Follower</Label>
                    <Select value={followerId || "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuno</SelectItem>
                        {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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

                {/* Custom fields */}
                {customFields && customFields.length > 0 && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campi personalizzati dell'opportunità</Label>
                    {customFields.map((field: any) => (
                      <div key={field.id} className="space-y-1">
                        <Label className="text-xs font-medium">{field.name}</Label>
                        {field.field_type === "select" && field.options?.length ? (
                          <Select value={customFieldValues[field.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: v }))}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={customFieldValues[field.id] || ""}
                            onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            className="h-9 text-sm"
                            type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                          />
                        )}
                      </div>
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
            <Button size="sm" onClick={handleSubmit} disabled={createOpportunity.isPending}>
              {createOpportunity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
