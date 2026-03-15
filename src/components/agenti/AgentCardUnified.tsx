import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bot,
  Phone,
  MessageSquare,
  Users,
  Megaphone,
  MoreVertical,
  Settings2,
  Copy,
  Trash2,
  Play,
  Pause,
  Zap,
  Mic,
  Clock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import type { UnifiedAgent, TipoAgente, StatoAgente } from "@/types/unifiedAgent.types";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TIPO_CONFIG: Record<
  TipoAgente,
  { label: string; icon: typeof Bot; headerClass: string; badgeClass: string }
> = {
  vocale: {
    label: "Vocale",
    icon: Phone,
    headerClass: "bg-primary/10 border-b border-primary/20",
    badgeClass: "bg-primary/15 text-primary border-primary/25",
  },
  chat: {
    label: "Chat",
    icon: MessageSquare,
    headerClass: "bg-[hsl(var(--success))]/10 border-b border-[hsl(var(--success))]/20",
    badgeClass: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/25",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageSquare,
    headerClass: "bg-[hsl(142,76%,36%)]/10 border-b border-[hsl(142,76%,36%)]/20",
    badgeClass: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/25",
  },
  interno: {
    label: "Interno",
    icon: Users,
    headerClass: "bg-secondary border-b border-border",
    badgeClass: "bg-secondary text-secondary-foreground border-border",
  },
  campagna: {
    label: "Campagna",
    icon: Megaphone,
    headerClass: "bg-[hsl(var(--warning))]/10 border-b border-[hsl(var(--warning))]/20",
    badgeClass: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/25",
  },
};

const STATO_CONFIG: Record<StatoAgente, { label: string; dotClass: string; variant: "default" | "secondary" | "outline" }> = {
  attivo: { label: "Attivo", dotClass: "bg-[hsl(var(--success))] animate-pulse", variant: "default" },
  bozza: { label: "Bozza", dotClass: "bg-muted-foreground", variant: "secondary" },
  pausa: { label: "In pausa", dotClass: "bg-[hsl(var(--warning))]", variant: "outline" },
  archiviato: { label: "Archiviato", dotClass: "bg-muted-foreground/50", variant: "outline" },
};

interface Props {
  agente: UnifiedAgent;
  onClick: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, stato: StatoAgente) => void;
  onDuplicate: (id: string) => void;
  onNavigateConversations: (id: string) => void;
  isToggling?: boolean;
}

export function AgentCardUnified({
  agente,
  onClick,
  onArchive,
  onDelete,
  onToggleStatus,
  onDuplicate,
  onNavigateConversations,
  isToggling = false,
}: Props) {
  const tipoCfg = TIPO_CONFIG[agente.tipo];
  const statoCfg = STATO_CONFIG[agente.stato];
  const TipoIcon = tipoCfg.icon;
  const isVoiceType = agente.tipo === "vocale" || agente.tipo === "campagna";
  const isChatType = agente.tipo === "chat" || agente.tipo === "whatsapp";

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow group">
      {/* Colored header */}
      <div className={`px-4 py-3 ${tipoCfg.headerClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-background/80 flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="h-4.5 w-4.5 text-foreground" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate text-foreground">{agente.nome}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${tipoCfg.badgeClass}`}>
                  <TipoIcon className="h-2.5 w-2.5" /> {tipoCfg.label}
                </span>
                {agente.elevenlabs_agent_id && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/20">
                    <Zap className="h-2.5 w-2.5" /> EL
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Toggle play/pause */}
            {agente.stato !== "archiviato" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isToggling}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(
                    agente.id,
                    agente.stato === "attivo" ? "pausa" : "attivo"
                  );
                }}
              >
                {agente.stato === "attivo" ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            {/* Kebab menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onClick}>
                  <Settings2 className="h-4 w-4 mr-2" /> Configura
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateConversations(agente.id)}>
                  {isVoiceType ? <Phone className="h-4 w-4 mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  {isVoiceType ? "Chiamate" : "Conversazioni"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDuplicate(agente.id)}>
                  <Copy className="h-4 w-4 mr-2" /> Duplica
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(agente.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <CardContent className="p-4 cursor-pointer" onClick={onClick}>
        {/* Status badge */}
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={statoCfg.variant} className="text-[10px] gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${statoCfg.dotClass}`} />
            {statoCfg.label}
          </Badge>
          {agente.voice_nome && isVoiceType && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Mic className="h-2.5 w-2.5" /> {agente.voice_nome}
            </span>
          )}
        </div>

        {/* Description */}
        {agente.descrizione && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {agente.descrizione}
          </p>
        )}

        {/* Contextual metrics */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(isVoiceType) && (
            <>
              <MetricBox icon={Phone} label="Chiamate" value={agente.chiamate_totali} />
              <MetricBox icon={Clock} label="Minuti" value={Math.round(agente.minuti_totali)} />
              <MetricBox
                icon={TrendingUp}
                label="Tasso"
                value={agente.chiamate_totali > 0
                  ? `${Math.round((agente.chiamate_completate / agente.chiamate_totali) * 100)}%`
                  : "–"}
              />
            </>
          )}
          {isChatType && (
            <>
              <MetricBox icon={MessageSquare} label="Chat" value={agente.chat_totali} />
              <MetricBox icon={Clock} label="Minuti" value={Math.round(agente.minuti_totali)} />
              <MetricBox icon={Users} label="Utenti" value="–" />
            </>
          )}
          {agente.tipo === "interno" && (
            <>
              <MetricBox icon={MessageSquare} label="Richieste" value={agente.chat_totali} />
              <MetricBox icon={Clock} label="Tempo" value={`${Math.round(agente.minuti_totali)}m`} />
              <MetricBox icon={CheckCircle2} label="Risolte" value="–" />
            </>
          )}
        </div>

        {/* Footer with date */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground">
            {agente.lingua.toUpperCase()} · {format(new Date(agente.creato_il), "d MMM yyyy", { locale: it })}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateConversations(agente.id);
              }}
            >
              {isVoiceType ? "Chiamate" : "Chat"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              Configura
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-1.5 rounded-md bg-muted/50">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs font-semibold text-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
