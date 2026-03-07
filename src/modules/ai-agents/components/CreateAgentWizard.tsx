import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Bot, Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIAgentInsert } from "../types/agent.types";

interface CreateAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AIAgentInsert) => void;
  isLoading: boolean;
}

type AgentType = "blank" | "personal" | "business";

const agentTypes: { type: AgentType; label: string; desc: string; icon: typeof Bot }[] = [
  { type: "blank", label: "Agente Vuoto", desc: "Parti da zero con un agente personalizzato", icon: Bot },
  { type: "personal", label: "Assistente Personale", desc: "Assistente per le attività quotidiane", icon: User },
  { type: "business", label: "Agente Aziendale", desc: "Per vendite, supporto e lead generation", icon: Briefcase },
];

export function CreateAgentWizard({ open, onOpenChange, onSubmit, isLoading }: CreateAgentWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<AgentType>("blank");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [objective, setObjective] = useState("");
  const [textOnly, setTextOnly] = useState(false);

  const reset = () => {
    setStep(1);
    setSelectedType("blank");
    setName("");
    setWebsite("");
    setObjective("");
    setTextOnly(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      agent_type: selectedType,
      website_url: website.trim() || undefined,
      objective: objective.trim() || undefined,
      text_only: textOnly,
      system_prompt: selectedType === "business"
        ? "Sei un agente commerciale professionale per un'azienda edile. Rispondi in modo chiaro e cortese."
        : selectedType === "personal"
          ? "Sei un assistente personale efficiente e amichevole."
          : "",
      first_message: selectedType === "business"
        ? "Buongiorno! Come posso aiutarla oggi?"
        : selectedType === "personal"
          ? "Ciao! Come posso assisterti?"
          : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Scegli il tipo di agente" : "Configura il tuo agente"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="grid gap-3">
            {agentTypes.map(({ type, label, desc, icon: Icon }) => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setStep(2); }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-lg border text-left transition-colors hover:bg-accent/50",
                  selectedType === type && "ring-2 ring-primary"
                )}
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome agente *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="Es. Assistente Vendite"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground text-right">{name.length}/50</p>
            </div>
            <div className="space-y-2">
              <Label>Sito web (opzionale)</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.miosito.it"
              />
            </div>
            <div className="space-y-2">
              <Label>Obiettivo principale</Label>
              <Textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Descrivere lo scopo principale dell'agente..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Solo chat (senza audio)</Label>
              <Switch checked={textOnly} onCheckedChange={setTextOnly} />
            </div>
          </div>
        )}

        {step === 2 && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Indietro
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || isLoading}>
              {isLoading ? "Creazione..." : "Crea agente"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
