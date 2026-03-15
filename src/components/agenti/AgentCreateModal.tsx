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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Phone, MessageSquare, Users, Megaphone } from "lucide-react";
import { useCreateUnifiedAgent } from "@/hooks/useUnifiedAgents";
import type { TipoAgente, UnifiedAgentInsert } from "@/types/unifiedAgent.types";
import { LANGUAGE_OPTIONS } from "@/modules/ai-agents/types/agent.types";

const TIPO_OPTIONS: { value: TipoAgente; label: string; icon: typeof Phone; desc: string }[] = [
  { value: "vocale", label: "Vocale", icon: Phone, desc: "Gestisce chiamate in/out via AI" },
  { value: "chat", label: "Chat", icon: MessageSquare, desc: "Widget chat per il sito web" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, desc: "Bot per WhatsApp Business" },
  { value: "interno", label: "Interno", icon: Users, desc: "Assistente AI per il team" },
  { value: "campagna", label: "Campagna", icon: Megaphone, desc: "Agente per outbound automatizzato" },
];

interface Props {
  open: boolean;
  tipoPreselezionato?: TipoAgente | null;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export function AgentCreateModal({ open, tipoPreselezionato, onClose, onSuccess }: Props) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoAgente>(tipoPreselezionato || "vocale");
  const [lingua, setLingua] = useState("it");
  const [descrizione, setDescrizione] = useState("");

  const createAgent = useCreateUnifiedAgent();

  const handleCreate = () => {
    if (!nome.trim()) return;
    const input: UnifiedAgentInsert = {
      nome: nome.trim(),
      tipo,
      lingua,
      descrizione: descrizione.trim() || undefined,
    };
    createAgent.mutate(input, {
      onSuccess: (data) => onSuccess(data.id),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo agente AI</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo */}
          <div className="grid grid-cols-5 gap-1.5">
            {TIPO_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTipo(opt.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-center transition-all text-[11px] ${
                    tipo === opt.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Nome */}
          <div>
            <Label htmlFor="agent-name">Nome agente</Label>
            <Input
              id="agent-name"
              placeholder="Es: Assistente Clienti"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          {/* Lingua */}
          <div>
            <Label>Lingua</Label>
            <Select value={lingua} onValueChange={setLingua}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrizione */}
          <div>
            <Label>Descrizione (opzionale)</Label>
            <Textarea
              placeholder="Breve descrizione dell'agente..."
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createAgent.isPending}>
            Annulla
          </Button>
          <Button onClick={handleCreate} disabled={!nome.trim() || createAgent.isPending}>
            {createAgent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea agente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
