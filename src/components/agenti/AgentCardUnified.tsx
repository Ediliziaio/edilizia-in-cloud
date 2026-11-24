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
  MoreHorizontal,
  Copy,
  Archive,
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
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

const TIPO_CONFIG: Record<
  TipoAgente,
  { label: string; icon: typeof Bot; headerClass: string; badgeClass: string }
> = {
  vocale: {
    label: "Vocale",
    icon: Phone,
    headerClass: "border-b border-sky-100 bg-gradient-to-br from-sky-50 to-background dark:border-sky-950 dark:from-sky-950/65",
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
  attivo: { label: "Attivo", dotClass: "bg-[hsl(var(--success))]", variant: "default" },
  bozza: { label: "Bozza", dotClass: "bg-muted-foreground", variant: "secondary" },
  pausa: { label: "In pausa", dotClass: "bg-[hsl(var(--warning))]", variant: "outline" },
  archiviato: { label: "Archiviato", dotClass: "bg-muted-foreground/50", variant: "outline" },
};

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeDateLabel = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "Data non disponibile";
  return format(date, "d MMM yyyy", { locale: dateFnsCampo() });
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
  /** Telefono: gli agenti si guardano; accendere, configurare, duplicare ed eliminare si fa dal computer. */
  soloLettura?: boolean;
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
  soloLettura = false,
}: Props) {
  const t = useT();
  const tipoCfg = TIPO_CONFIG[agente.tipo] ?? TIPO_CONFIG.interno;
  const statoCfg = STATO_CONFIG[agente.stato] ?? STATO_CONFIG.bozza;
  const TipoIcon = tipoCfg.icon;
  const isVoiceType = agente.tipo === "vocale" || agente.tipo === "campagna";
  const isChatType = agente.tipo === "chat" || agente.tipo === "whatsapp";

  return (
    <Card className="eic-workspace-card flex min-w-0 flex-col overflow-hidden rounded-xl">
      {/* Colored header */}
      <div className={`px-4 py-3 ${tipoCfg.headerClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="eic-workspace-icon">
              <TipoIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{agente.nome}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${tipoCfg.badgeClass}`}>
                  <TipoIcon className="h-2.5 w-2.5" /> {t(tipoCfg.label)}
                </span>
                {(agente.elevenlabs_agent_id || agente.tools_config?.voice_provider === "fish_audio") && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/60 dark:text-orange-200">
                    <Zap className="h-2.5 w-2.5" /> {agente.tools_config?.voice_provider === "fish_audio" ? "Fish" : "EL"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!soloLettura && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("Azioni di {nome}", { nome: String(agente.nome ?? "") })}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {agente.stato !== "archiviato" && (
                  <>
                    <DropdownMenuItem disabled={isToggling} onSelect={() => onToggleStatus(agente.id, agente.stato === "attivo" ? "pausa" : "attivo")}>
                      {agente.stato === "attivo" ? <><Pause className="mr-2 h-4 w-4" /> {t("Metti in pausa")}</> : <><Play className="mr-2 h-4 w-4" /> {t("Attiva agente")}</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => onDuplicate(agente.id)}>
                  <Copy className="h-4 w-4 mr-2" /> {t("Duplica")}
                </DropdownMenuItem>
                {agente.stato !== "archiviato" && (
                  <DropdownMenuItem onClick={() => onArchive(agente.id)}>
                    <Archive className="h-4 w-4 mr-2" /> {t("Archivia")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(agente.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> {t("Elimina")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col p-4">
        {/* Status badge */}
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={statoCfg.variant} className="text-xs gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${statoCfg.dotClass}`} />
            {t(statoCfg.label)}
          </Badge>
          {agente.voice_nome && isVoiceType && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mic className="h-2.5 w-2.5" /> {agente.voice_nome}
            </span>
          )}
        </div>

        {/* Description */}
        {agente.descrizione && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
            {agente.descrizione}
          </p>
        )}

        {/* Contextual metrics */}
        <div className="mb-3 mt-auto grid grid-cols-3 gap-2">
          {(isVoiceType) && (
            <>
              <MetricBox icon={Phone} label={t("Chiamate")} value={safeNumber(agente.chiamate_totali)} />
              <MetricBox icon={Clock} label={t("Minuti")} value={Math.round(safeNumber(agente.minuti_totali))} />
              <MetricBox
                icon={TrendingUp}
                label={t("Completate")}
                value={safeNumber(agente.chiamate_totali) > 0
                  ? `${Math.round((safeNumber(agente.chiamate_completate) / safeNumber(agente.chiamate_totali)) * 100)}%`
                  : "–"}
              />
            </>
          )}
          {isChatType && (
            <>
              <MetricBox icon={MessageSquare} label={t("Chat")} value={agente.chat_totali} />
              <MetricBox icon={Clock} label={t("Minuti")} value={Math.round(safeNumber(agente.minuti_totali))} />
              <MetricBox icon={Users} label={t("Utenti")} value="–" />
            </>
          )}
          {agente.tipo === "interno" && (
            <>
              <MetricBox icon={MessageSquare} label={t("Richieste")} value={agente.chat_totali} />
              <MetricBox icon={Clock} label={t("Tempo")} value={`${Math.round(safeNumber(agente.minuti_totali))}m`} />
              <MetricBox icon={CheckCircle2} label={t("Risolte")} value="–" />
            </>
          )}
        </div>

        {/* Footer with date */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {(agente.lingua || "it").toUpperCase()} · {safeDateLabel(agente.creato_il)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onNavigateConversations(agente.id)}>
              {isVoiceType ? t("Chiamate") : t("Chat")}
            </Button>
            <Button variant="outline" size="sm" className="eic-motion-button" onClick={onClick}>{soloLettura ? t("Apri") : t("Configura")}</Button>
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
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
