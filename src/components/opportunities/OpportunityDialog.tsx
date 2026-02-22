import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateOpportunity, useCompanyStaff } from "@/hooks/useOpportunitiesData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Plus, User, UserPlus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  stages: { id: string; name: string }[];
}

export function OpportunityDialog({ open, onOpenChange, pipelineId, stages }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const createOpportunity = useCreateOpportunity();

  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const [oppName, setOppName] = useState("");
  const [nameManuallySet, setNameManuallySet] = useState(false);
  const [stageId, setStageId] = useState(stages[0]?.id || "");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [oppCompanyName, setOppCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Fetch contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing_contacts_search", companyId, contactSearch],
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
    enabled: !!companyId && open,
  });

  // Fetch staff (fixed: filter by role)
  const { data: staff = [] } = useCompanyStaff();

  // Fetch opportunity custom fields
  const { data: customFields = [] } = useQuery({
    queryKey: ["marketing_custom_fields_opportunity", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .eq("object_type", "opportunity")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

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
    setValue("");
    setSource("");
    setOppCompanyName("");
    setNotes("");
    setAssignedTo("");
    setFollowerId("");
    setCustomFieldValues({});
  };

  const handleSelectContact = (c: any) => {
    setSelectedContactId(c.id);
    setShowNewContact(false);
    setContactSearch(`${c.first_name} ${c.last_name || ""}`.trim());
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
        source: source || undefined,
        assigned_to: assignedTo || undefined,
        follower_id: followerId || undefined,
        company_name: oppCompanyName || undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: async (data: any) => {
          const oppId = data?.id;
          if (oppId && Object.keys(customFieldValues).length > 0) {
            const rows = Object.entries(customFieldValues)
              .filter(([, v]) => v.trim())
              .map(([fieldId, val]) => ({ opportunity_id: oppId, field_id: fieldId, value: val }));
            if (rows.length > 0) {
              await supabase.from("marketing_opportunity_field_values").insert(rows);
            }
          }
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuova Opportunità</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 pb-2">
            {/* Contact combobox */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Contatto</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca contatto per nome o email..."
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
                  className="pl-8 h-9 text-sm"
                />
                {showDropdown && !showNewContact && (
                  <div className="absolute z-50 w-full mt-1 border rounded-lg bg-popover shadow-lg max-h-[200px] overflow-y-auto">
                    {contacts.map((c: any) => (
                      <button
                        key={c.id}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0 flex items-center gap-2 ${selectedContactId === c.id ? "bg-primary/10 text-primary" : ""}`}
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
                    ))}
                    <button
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 text-primary font-medium border-t"
                      onClick={() => {
                        setShowNewContact(true);
                        setSelectedContactId("");
                        setShowDropdown(false);
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      + Crea nuovo contatto
                    </button>
                  </div>
                )}
              </div>

              {/* Selected contact badge */}
              {selectedContactId && selectedContact && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-sm">
                  <User className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-primary">{selectedContact.first_name} {selectedContact.last_name || ""}</span>
                  {selectedContact.city && <span className="text-muted-foreground text-xs">· {selectedContact.city}</span>}
                  <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSelectedContactId(""); setContactSearch(""); setNameManuallySet(false); }}>✕</button>
                </div>
              )}

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
            </div>

            {/* Opportunity details */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Dettagli Opportunità</Label>

              <div className="space-y-1">
                <Label className="text-xs">Nome opportunità</Label>
                <Input
                  value={oppName}
                  onChange={(e) => { setOppName(e.target.value); setNameManuallySet(true); }}
                  placeholder="Auto: nome contatto - città"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fase</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valore (€)</Label>
                  <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="h-8 text-sm" type="number" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fonte</Label>
                  <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="es. Passaparola" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Azienda</Label>
                  <Input value={oppCompanyName} onChange={(e) => setOppCompanyName(e.target.value)} placeholder="Nome azienda" className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Titolare</Label>
                  <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assegnato</SelectItem>
                      {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Follower</Label>
                  <Select value={followerId || "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuno</SelectItem>
                      {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note..." rows={2} className="text-sm" />
              </div>
            </div>

            {/* Custom fields */}
            {customFields.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-semibold">Campi personalizzati</Label>
                {customFields.map((field: any) => (
                  <div key={field.id} className="space-y-1">
                    <Label className="text-xs">{field.name}</Label>
                    {field.field_type === "select" && field.options?.length ? (
                      <Select value={customFieldValues[field.id] || ""} onValueChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent>
                          {field.options.map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={customFieldValues[field.id] || ""}
                        onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        className="h-8 text-sm"
                        type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={createOpportunity.isPending}>
            {createOpportunity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crea Opportunità
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
