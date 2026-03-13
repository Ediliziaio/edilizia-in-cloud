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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Briefcase, User, LayoutTemplate, ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentTemplates, type AgentTemplate } from "../hooks/useAgentTemplates";
import type { AIAgentInsert } from "../types/agent.types";

interface CreateAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AIAgentInsert) => void;
  isLoading: boolean;
}

type AgentType = "blank" | "personal" | "business";
type Step = "choose" | "templates" | "configure";

const agentTypes: { type: AgentType; label: string; desc: string; icon: typeof Bot }[] = [
  { type: "blank", label: "Agente Vuoto", desc: "Parti da zero con un agente personalizzato", icon: Bot },
  { type: "personal", label: "Assistente Personale", desc: "Assistente per le attività quotidiane", icon: User },
  { type: "business", label: "Agente Aziendale", desc: "Per vendite, supporto e lead generation", icon: Briefcase },
];

const CATEGORIA_COLORS: Record<string, string> = {
  vendite: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  assistenza: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  operativo: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  marketing: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  interno: "bg-muted text-muted-foreground",
};

export function CreateAgentWizard({ open, onOpenChange, onSubmit, isLoading }: CreateAgentWizardProps) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedType, setSelectedType] = useState<AgentType>("blank");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [objective, setObjective] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [textOnly, setTextOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { data: templates } = useAgentTemplates();

  const filteredTemplates = (templates ?? []).filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const reset = () => {
    setStep("choose");
    setSelectedType("blank");
    setName("");
    setWebsite("");
    setObjective("");
    setSystemPrompt("");
    setFirstMessage("");
    setTextOnly(false);
    setSearch("");
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const applyTemplate = (template: AgentTemplate) => {
    setName(template.name);
    setObjective(template.objective ?? "");
    setSystemPrompt(template.system_prompt);
    setFirstMessage(template.first_message);
    setSelectedType(template.agent_type as AgentType);
    setStep("configure");
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      agent_type: selectedType,
      website_url: website.trim() || undefined,
      objective: objective.trim() || undefined,
      text_only: textOnly,
      system_prompt: systemPrompt.trim() ||
        (selectedType === "business"
          ? "Sei un agente commerciale professionale per un'azienda edile. Rispondi in modo chiaro e cortese."
          : selectedType === "personal"
            ? "Sei un assistente personale efficiente e amichevole."
            : ""),
      first_message: firstMessage.trim() ||
        (selectedType === "business"
          ? "Buongiorno! Come posso aiutarla oggi?"
          : selectedType === "personal"
            ? "Ciao! Come posso assisterti?"
            : ""),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "choose" && "Scegli il tipo di agente"}
            {step === "templates" && "Scegli un template"}
            {step === "configure" && "Configura il tuo agente"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP: Choose type */}
        {step === "choose" && (
          <div className="grid gap-3">
            {/* Template gallery entry */}
            <button
              onClick={() => setStep("templates")}
              className="flex items-center gap-4 p-4 rounded-lg border text-left transition-colors hover:bg-accent/50 border-dashed border-primary/40"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <LayoutTemplate className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Crea da Template</p>
                <p className="text-sm text-muted-foreground">
                  Scegli un template pre-configurato per il settore edilizia
                </p>
              </div>
              {templates && (
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {templates.length}
                </Badge>
              )}
            </button>

            {agentTypes.map(({ type, label, desc, icon: Icon }) => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setStep("configure"); }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-lg border text-left transition-colors hover:bg-accent/50",
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

        {/* STEP: Template gallery */}
        {step === "templates" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca template..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="flex-1 max-h-[400px]">
              <div className="grid gap-2 pr-3">
                {filteredTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="text-xl mt-0.5">{t.icona}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{t.name}</p>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0", CATEGORIA_COLORS[t.categoria])}
                        >
                          {t.categoria}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    </div>
                  </button>
                ))}
                {filteredTemplates.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nessun template trovato.
                  </p>
                )}
              </div>
            </ScrollArea>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStep("choose"); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
            </Button>
          </div>
        )}

        {/* STEP: Configure */}
        {step === "configure" && (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 pr-3">
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
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Istruzioni di comportamento per l'agente..."
                  rows={3}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>Primo messaggio</Label>
                <Textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="Il messaggio di benvenuto dell'agente..."
                  rows={2}
                  className="text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Solo chat (senza audio)</Label>
                <Switch checked={textOnly} onCheckedChange={setTextOnly} />
              </div>
            </div>
          </ScrollArea>
        )}

        {step === "configure" && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep("choose")}>
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
