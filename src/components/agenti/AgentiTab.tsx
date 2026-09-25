import { useState } from "react";
import { Plus, Search, Bot, Phone, MessageSquare, Users, Megaphone, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
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
  useDuplicateUnifiedAgent,
} from "@/hooks/useUnifiedAgents";
import type { TipoAgente } from "@/types/unifiedAgent.types";
import { useNavigate } from "react-router-dom";
import { useAiAgentsBasePath } from "@/hooks/useAiAgentsBasePath";
import { useIsMobile } from "@/hooks/use-mobile";
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
  // Telefono: gli agenti si guardano, si creano e si modificano da computer o tablet.
  const isMobile = useIsMobile();
  // Prefix dinamico: /azienda/agenti-ai OR /admin/marketing/agenti-ai in base
  // al contesto corrente, così le navigate non sbattono fuori dal SuperAdmin.
  const basePath = useAiAgentsBasePath();
  const { data: agenti = [], isLoading, isError, error, refetch, isFetching } = useUnifiedAgents({
    tipo: filtroTipo,
    stato: filtroStato,
    cerca,
  });
  const deleteAgent = useDeleteUnifiedAgent();
  const updateStatus = useUpdateUnifiedAgentStatus();
  const duplicateAgent = useDuplicateUnifiedAgent();

  const handleCrea = (tipo?: TipoAgente) => {
    setTipoPreselezionato(tipo || null);
    setShowCreate(true);
  };

  const handleNavigate = (agente: { id: string; tipo: TipoAgente }) => {
    navigate(`${basePath}/${agente.id}`);
  };

  const handleNavigateConversations = (id: string) => {
    navigate(`${basePath}/${id}`);
  };

  return (
    <div className="px-6 py-6 max-md:px-0 max-md:py-3">
      {/* Toolbar — dentro una scheda con bordo, cosi' filtri e azioni si
          leggono come una barra di controllo e non come testo sulla pagina.
          Telefono: resta la ricerca. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm max-md:mb-3 max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
        <div className="flex items-center gap-1.5 flex-wrap max-md:hidden">
          {TIPO_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.value}
                onClick={() => setFiltroTipo(chip.value)}
                aria-pressed={filtroTipo === chip.value}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  filtroTipo === chip.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-primary/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3 w-3" /> {chip.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 max-md:hidden" />

        <div className="relative max-md:w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca agente..."
            className="pl-8 w-48 h-8 text-sm max-md:h-9 max-md:w-full"
          />
        </div>

        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-36 h-8 text-sm max-md:hidden">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            <SelectItem value="attivo">Attivi</SelectItem>
            <SelectItem value="pausa">In pausa</SelectItem>
            <SelectItem value="bozza">Bozza</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => handleCrea()} className="max-md:hidden">
          <Plus className="h-4 w-4 mr-1.5" /> Nuovo agente
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 py-16 text-center">
          <AlertTriangle className="mb-3 h-10 w-10 text-destructive" />
          <p className="text-lg font-semibold text-foreground">Agenti non caricati</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {(error as Error)?.message || "Non riesco a leggere gli agenti AI in questo momento."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Riprova
          </Button>
        </div>
      ) : agenti.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 max-md:rounded-xl max-md:px-3 max-md:py-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-inset ring-blue-100 max-md:hidden">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <p className="text-lg font-semibold text-foreground max-md:text-[13px]">
            {filtroTipo !== "tutti"
              ? `Nessun agente ${TIPO_CHIPS.find((c) => c.value === filtroTipo)?.label?.toLowerCase()}`
              : "Nessun agente creato"}
          </p>
          {isMobile ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">si crea da computer o tablet</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
                Crea il tuo primo agente AI per gestire conversazioni, qualificare lead e fissare appuntamenti.
              </p>
              <Button className="mt-4" onClick={() => handleCrea(filtroTipo !== "tutti" ? (filtroTipo as TipoAgente) : undefined)}>
                <Plus className="h-4 w-4 mr-1.5" /> Crea agente
              </Button>
            </>
          )}

          {filtroTipo === "tutti" && !isMobile && (
            <div className="mt-8 w-full max-w-3xl">
              <p className="mb-2.5 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Oppure parti da un tipo
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {TIPO_CHIPS.filter((c) => c.value !== "tutti").map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.value}
                    onClick={() => handleCrea(chip.value as TipoAgente)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-300 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
                  >
                    <Icon className="h-6 w-6 text-primary" />
                    <span className="text-xs font-semibold text-slate-900">{chip.label}</span>
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-md:gap-2">
          {agenti.map((agente) => (
            <AgentCardUnified
              key={agente.id}
              agente={agente}
              soloLettura={isMobile}
              onClick={() => handleNavigate(agente)}
              onArchive={(id) => updateStatus.mutate({ id, stato: "archiviato" })}
              onDelete={(id) => setDeleteId(id)}
              onToggleStatus={(id, stato) => updateStatus.mutate({ id, stato })}
              onDuplicate={(id) => duplicateAgent.mutate(id)}
              onNavigateConversations={handleNavigateConversations}
              isToggling={updateStatus.isPending}
            />
          ))}
          <button
            onClick={() => handleCrea()}
            className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-500 transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary max-md:hidden"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Nuovo agente</span>
          </button>
        </div>
      )}

      <AgentCreateModal
        open={showCreate}
        tipoPreselezionato={tipoPreselezionato}
        onClose={() => setShowCreate(false)}
        onSuccess={(id) => {
          setShowCreate(false);
          navigate(`${basePath}/${id}`);
        }}
      />

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
