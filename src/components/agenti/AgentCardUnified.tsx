import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bot,
  Phone,
  MessageSquare,
  Users,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import type { UnifiedAgent, TipoAgente, StatoAgente } from "@/types/unifiedAgent.types";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TIPO_CONFIG: Record<
  TipoAgente,
  { label: string; icon: typeof Bot; badgeClass: string }
> = {
  vocale: { label: "Vocale", icon: Phone, badgeClass: "bg-primary/10 text-primary border-primary/20" },
  chat: { label: "Chat", icon: MessageSquare, badgeClass: "bg-accent text-accent-foreground border-accent" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, badgeClass: "bg-accent text-accent-foreground border-accent" },
  interno: { label: "Interno", icon: Users, badgeClass: "bg-secondary text-secondary-foreground border-secondary" },
  campagna: { label: "Campagna", icon: Megaphone, badgeClass: "bg-primary/10 text-primary border-primary/20" },
};

const STATO_CONFIG: Record<StatoAgente, { label: string; variant: "default" | "secondary" | "outline" }> = {
  attivo: { label: "Attivo", variant: "default" },
  bozza: { label: "Bozza", variant: "secondary" },
  pausa: { label: "In pausa", variant: "outline" },
  archiviato: { label: "Archiviato", variant: "outline" },
};

interface Props {
  agente: UnifiedAgent;
  onClick: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, stato: StatoAgente) => void;
}

export function AgentCardUnified({ agente, onClick, onArchive, onDelete, onToggleStatus }: Props) {
  const tipoCfg = TIPO_CONFIG[agente.tipo];
  const statoCfg = STATO_CONFIG[agente.stato];
  const TipoIcon = tipoCfg.icon;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate text-foreground">{agente.nome}</h3>
              <p className="text-[11px] text-muted-foreground">
                {agente.lingua.toUpperCase()} · {format(new Date(agente.creato_il), "d MMM yyyy", { locale: it })}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onClick}>
                <Pencil className="h-4 w-4 mr-2" /> Modifica
              </DropdownMenuItem>
              {agente.stato === "attivo" ? (
                <DropdownMenuItem onClick={() => onToggleStatus(agente.id, "pausa")}>
                  <Pause className="h-4 w-4 mr-2" /> Metti in pausa
                </DropdownMenuItem>
              ) : agente.stato !== "archiviato" ? (
                <DropdownMenuItem onClick={() => onToggleStatus(agente.id, "attivo")}>
                  <Play className="h-4 w-4 mr-2" /> Attiva
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onArchive(agente.id)}>
                <Archive className="h-4 w-4 mr-2" /> Archivia
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(agente.id)}>
                <Trash2 className="h-4 w-4 mr-2" /> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tipoCfg.badgeClass}`}>
            <TipoIcon className="h-3 w-3" /> {tipoCfg.label}
          </span>
          <Badge variant={statoCfg.variant} className="text-[10px]">
            {statoCfg.label}
          </Badge>
        </div>

        {/* Mini stats */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {(agente.tipo === "vocale" || agente.tipo === "campagna" || agente.tipo === "interno") && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {agente.chiamate_totali}
            </span>
          )}
          {(agente.tipo === "chat" || agente.tipo === "whatsapp") && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {agente.chat_totali}
            </span>
          )}
          <span>{Math.round(agente.minuti_totali)} min</span>
        </div>
      </CardContent>
    </Card>
  );
}
