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
import { cn } from "@/lib/utils";
import { Headphones, CreditCard, Wrench, Bot, Phone, Star } from "lucide-react";
import type { InternalAgentInsert, InternalAgentType } from "../types/internalAgent.types";
import { AGENT_TYPE_OPTIONS } from "../types/internalAgent.types";

interface CreateInternalAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InternalAgentInsert) => void;
  isLoading: boolean;
}

const typeIcons: Record<InternalAgentType, typeof Bot> = {
  customer_service: Headphones,
  payment_reminder: CreditCard,
  work_coordinator: Wrench,
  survey: Star,
  after_sales: Phone,
  custom: Bot,
};

const typePrompts: Record<InternalAgentType, { prompt: string; firstMessage: string }> = {
  customer_service: {
    prompt: "Sei un assistente clienti professionale per un'azienda edile. Rispondi alle domande su ordini, date lavori e pagamenti. Usa {{client_name}} per personalizzare la conversazione.",
    firstMessage: "Buongiorno {{client_name}}! Sono l'assistente virtuale. Come posso aiutarla oggi?",
  },
  payment_reminder: {
    prompt: "Sei un assistente per i solleciti di pagamento. Comunica gli importi dovuti in modo cortese e professionale. Il cliente si chiama {{client_name}} e deve {{balance_due}}.",
    firstMessage: "Buongiorno {{client_name}}, la contatto in merito al saldo relativo ai lavori completati. Ha un momento per parlarne?",
  },
  work_coordinator: {
    prompt: "Sei un coordinatore lavori. Conferma date, comunica variazioni e raccogli conferme dai clienti. Il prossimo intervento per {{client_name}} è previsto per {{last_order_date}}.",
    firstMessage: "Buongiorno {{client_name}}! La contatto per confermare il suo prossimo intervento. Ha un momento?",
  },
  survey: {
    prompt: "Sei un intervistatore per la soddisfazione clienti. Raccogli feedback strutturato (voto 1-5) sui lavori completati per {{client_name}}.",
    firstMessage: "Buongiorno {{client_name}}! La contatto per un breve sondaggio sulla sua esperienza con i nostri servizi. Le ruberò solo 2 minuti.",
  },
  after_sales: {
    prompt: "Sei un assistente post-vendita per un'azienda edile. Gestisci richieste di manutenzione, segnalazioni e assistenza per i clienti esistenti.",
    firstMessage: "Buongiorno! Sono l'assistente post-vendita. Come posso assisterla con i lavori completati?",
  },
  custom: {
    prompt: "",
    firstMessage: "",
  },
};

export function CreateInternalAgentWizard({ open, onOpenChange, onSubmit, isLoading }: CreateInternalAgentWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<InternalAgentType>("customer_service");
  const [name, setName] = useState("");

  const reset = () => {
    setStep(1);
    setSelectedType("customer_service");
    setName("");
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const prompts = typePrompts[selectedType];
    onSubmit({
      name: name.trim(),
      agent_type: selectedType,
      system_prompt: prompts.prompt,
      first_message: prompts.firstMessage,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Tipo di agente interno" : "Nome dell'agente"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="grid gap-2 max-h-[400px] overflow-y-auto">
            {AGENT_TYPE_OPTIONS.map((opt) => {
              const Icon = typeIcons[opt.value];
              return (
                <button
                  key={opt.value}
                  onClick={() => { setSelectedType(opt.value); setStep(2); }}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border text-left transition-colors hover:bg-accent/50",
                    selectedType === opt.value && "ring-2 ring-primary"
                  )}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome agente *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="Es. Assistente Post-Vendita"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-right">{name.length}/50</p>
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
