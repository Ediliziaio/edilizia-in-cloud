import { useState } from "react";
import { Plus, Search, Bot, Phone, MessageSquare, Users, Megaphone, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentCardUnified } from "./AgentCardUnified";
import { AgentCreateModal } from "./AgentCreateModal";
import {
  useUnifiedAgents,
  useDeleteUnifiedAgent,
  useUpdateUnifiedAgentStatus,
} from "@/hooks/useUnifiedAgents";
import type { TipoAgente, StatoAgente } from "@/types/unifiedAgent.types";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIPO_CHIPS: { value: string; label: string; icon: typeof Bot }[] = [
  { value: "tutti", label: "Tutti", icon: Bot },
  { value: "vocale", label: "Vocale", icon: Phone },
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "interno", label: "Interno", icon: Users },
  { value: "campagna", label: "Campagna", icon: Megaphone },
];

export function AgentiTab() {
  const [filtroTipo, setFiltroTipo] = useState("tutti");
  const [filtroStato, setFiltroStato] = useState("tutti");
  const [cerca, setCerca] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [tipoPreselezionato, setTipoPreselezionato] = useState<TipoAgente | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const navigate = useNavigate();
  const { data: agenti = [], isLoading } = useUnifiedAgents({
    tipo: filtroTipo,
    stato: filtroStato,
    cerca,
  });
  const deleteAgent = useDeleteUnifiedAgent();
  const updateStatus = useUpdateUnifiedAgentStatus();

  const handleCrea = (tipo?: TipoAgente) => {
    setTipoPreselezionato(tipo || null);
    setShowCreate(true);
  };

  const handleNavigate = (agente: { id: string; tipo: TipoAgente }) => {
    // Route to appropriate editor based on type
    if (agente.tipo === "interno") {
      navigate(`/azienda/agente-interno/${agente.id}`);
    } else {
      navigate(`/azienda/marketing/agente-ai/${agente.id}`);
    }
  };

  return (
    <div className="px-6 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Type chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TIPO_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.value}
                onClick={() => setFiltroTipo(chip.value)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filtroTipo === chip.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3 w-3" /> {chip.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca agente..."
            className="pl-8 w-48 h-8 text-sm"
          />
        </div>

        {/* Status filter */}
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="attivo">Attivi</SelectItem>
            <SelectItem value="pausa">In pausa</SelectItem>
            <SelectItem value="bozza">Bozza</SelectItem>
          </SelectContent>
        </Select>

        {/* Create */}
        <Button size="sm" onClick={() => handleCrea()}>
          <Plus className="h-4 w-4 mr-1.5" /> Nuovo agente
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agenti.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <p className="text-lg font-semibold text-foreground">
            {filtroTipo !== "tutti"
              ? `Nessun agente ${TIPO_CHIPS.find((c) => c.value === filtroTipo)?.label?.toLowerCase()}`
              : "Nessun agente creato"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
            Crea il tuo primo agente AI per gestire conversazioni, qualificare lead e fissare appuntamenti.
          </p>
          <Button className="mt-4" onClick={() => handleCrea(filtroTipo !== "tutti" ? (filtroTipo as TipoAgente) : undefined)}>
            <Plus className="h-4 w-4 mr-1.5" /> Crea agente
          </Button>

          {/* Quick-create type cards */}
          {filtroTipo === "tutti" && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-3xl w-full">
              {TIPO_CHIPS.filter((c) => c.value !== "tutti").map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.value}
                    onClick={() => handleCrea(chip.value as TipoAgente)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <Icon className="h-6 w-6 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{chip.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agenti.map((agente) => (
            <AgentCardUnified
              key={agente.id}
              agente={agente}
              onClick={() => handleNavigate(agente)}
              onArchive={(id) => updateStatus.mutate({ id, stato: "archiviato" })}
              onDelete={(id) => setDeleteId(id)}
              onToggleStatus={(id, stato) => updateStatus.mutate({ id, stato })}
            />
          ))}
          {/* Add card */}
          <button
            onClick={() => handleCrea()}
            className="h-40 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Nuovo agente</span>
          </button>
        </div>
      )}

      {/* Create modal */}
      <AgentCreateModal
        open={showCreate}
        tipoPreselezionato={tipoPreselezionato}
        onClose={() => setShowCreate(false)}
        onSuccess={(id) => {
          setShowCreate(false);
          // Navigate to editor for the new agent
          navigate(`/azienda/marketing/agente-ai/${id}`);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo agente?</AlertDialogTitle>
            <AlertDialogDescription>
              L'agente verrà eliminato permanentemente. Questa azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deleteAgent.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
