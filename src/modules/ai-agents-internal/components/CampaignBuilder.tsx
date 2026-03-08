import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Rocket, Users, Phone, Calendar } from "lucide-react";
import { useInternalAgents } from "../hooks/useInternalAgents";
import { useInternalCampaigns } from "../hooks/useInternalCampaigns";
import { CAMPAIGN_TYPE_OPTIONS } from "../types/internalAgent.types";
import type { CampaignType, CampaignTargetType, InternalCampaignInsert } from "../types/internalAgent.types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STEPS = [
  { label: "Tipo & Nome", icon: Phone },
  { label: "Target", icon: Users },
  { label: "Schedulazione", icon: Calendar },
  { label: "Conferma", icon: Rocket },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CampaignBuilder({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const { data: agents } = useInternalAgents();
  const { createCampaign } = useInternalCampaigns();

  // Form state
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("payment_reminder");
  const [agentId, setAgentId] = useState("");
  const [targetType, setTargetType] = useState<CampaignTargetType>("manual");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [callsPerMinute, setCallsPerMinute] = useState(2);

  // Load contacts for manual selection
  const contactsQuery = useQuery({
    queryKey: ["campaign-contacts-list"],
    enabled: targetType === "manual",
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: profile } = await supabase.from("profiles" as never).select("company_id").eq("id", user.id).single();
      const companyId = (profile as any)?.company_id;
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, phone")
        .eq("company_id", companyId)
        .not("phone", "is", null)
        .eq("optout_call", false)
        .order("last_name")
        .limit(500);
      return (data || []) as { id: string; first_name: string; last_name: string; phone: string }[];
    },
  });

  const contacts = contactsQuery.data || [];

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const canNext = () => {
    if (step === 0) return name.trim() && agentId;
    if (step === 1) return targetType === "filter" ? (filterTags || filterSource) : selectedContacts.length > 0;
    if (step === 2) return scheduleMode === "immediate" || scheduledAt;
    return true;
  };

  const handleSubmit = async () => {
    const input: InternalCampaignInsert = {
      name,
      agent_id: agentId,
      campaign_type: campaignType,
      target_type: targetType,
      calls_per_minute: callsPerMinute,
      scheduled_at: scheduleMode === "scheduled" ? scheduledAt : null,
    };

    if (targetType === "manual") {
      input.contact_ids = selectedContacts;
    } else {
      input.filter_config = {
        tags: filterTags ? filterTags.split(",").map((t) => t.trim()) : [],
        source: filterSource || undefined,
      };
    }

    await createCampaign.mutateAsync(input);
    onClose();
  };

  const targetCount = targetType === "manual" ? selectedContacts.length : "~";

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova Campagna Outbound</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 0: Type & Name */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome campagna</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Sollecito Marzo 2026" />
            </div>
            <div className="space-y-2">
              <Label>Tipo campagna</Label>
              <Select value={campaignType} onValueChange={(v) => setCampaignType(v as CampaignType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agente interno</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Seleziona agente" /></SelectTrigger>
                <SelectContent>
                  {(agents || []).filter((a) => a.status === "active").map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 1: Target */}
        {step === 1 && (
          <div className="space-y-4">
            <RadioGroup value={targetType} onValueChange={(v) => setTargetType(v as CampaignTargetType)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="t-manual" />
                <Label htmlFor="t-manual">Selezione manuale</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="filter" id="t-filter" />
                <Label htmlFor="t-filter">Filtro dinamico</Label>
              </div>
            </RadioGroup>

            {targetType === "manual" ? (
              <div className="space-y-2">
                <Label>Contatti ({selectedContacts.length} selezionati)</Label>
                <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
                  {contacts.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(c.id)}
                        onChange={() => toggleContact(c.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{c.first_name} {c.last_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                    </label>
                  ))}
                  {contacts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nessun contatto con telefono disponibile</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tags (separati da virgola)</Label>
                  <Input value={filterTags} onChange={(e) => setFilterTags(e.target.value)} placeholder="Es. cliente-vip, lead-caldo" />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input value={filterSource} onChange={(e) => setFilterSource(e.target.value)} placeholder="Es. meta, website" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4">
            <RadioGroup value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "immediate" | "scheduled")} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="immediate" id="s-now" />
                <Label htmlFor="s-now">Invio immediato</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scheduled" id="s-later" />
                <Label htmlFor="s-later">Programmata</Label>
              </div>
            </RadioGroup>

            {scheduleMode === "scheduled" && (
              <div className="space-y-2">
                <Label>Data e ora</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Chiamate al minuto (rate limit)</Label>
              <Input type="number" min={1} max={10} value={callsPerMinute} onChange={(e) => setCallsPerMinute(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Massimo 10 chiamate al minuto per evitare sovraccarico</p>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Riepilogo Campagna</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{name}</span></div>
              <div><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline" className="ml-1">{campaignType}</Badge></div>
              <div><span className="text-muted-foreground">Agente:</span> <span className="font-medium">{agents?.find((a) => a.id === agentId)?.name || "-"}</span></div>
              <div><span className="text-muted-foreground">Target:</span> <span className="font-medium">{targetCount} contatti</span></div>
              <div><span className="text-muted-foreground">Invio:</span> <span className="font-medium">{scheduleMode === "immediate" ? "Immediato" : scheduledAt}</span></div>
              <div><span className="text-muted-foreground">Rate:</span> <span className="font-medium">{callsPerMinute} chiamate/min</span></div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {step === 0 ? "Annulla" : "Indietro"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Avanti <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createCampaign.isPending}>
              <Rocket className="h-4 w-4 mr-2" />
              {scheduleMode === "immediate" ? "Crea e Avvia" : "Crea Campagna"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
