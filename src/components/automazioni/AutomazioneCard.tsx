import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Edit2, Trash2, Play, Activity, CheckCircle2, XCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { AutomationRule } from "@/hooks/useAutomazioni";

const TRIGGER_LABEL: Record<string, string> = {
  contatto_creato: "Nuovo contatto/lead",
  opportunita_creata: "Nuova opportunità",
  opportunita_stage_cambiato: "Cambio fase opportunità",
  appuntamento_confermato: "Appuntamento confermato",
  appuntamento_completato: "Appuntamento completato",
  cantiere_fase_completata: "Fase cantiere completata",
  cantiere_creato: "Nuovo cantiere",
  task_completato: "Task completato",
  scadenza_reminder: "Promemoria scadenza",
  cron: "Programmato",
};

const AZIONE_LABEL: Record<string, string> = {
  crea_task: "→ Crea task",
  invia_notifica: "→ Invia notifica",
  invia_email: "→ Invia email",
  invia_sms: "→ Invia SMS",
  assegna_agente: "→ Riassegna agente",
  chiama_webhook: "→ Chiama webhook",
  esegui_agente_ai: "→ Esegui agente AI",
  crea_opportunita: "→ Crea opportunità",
  crea_appuntamento: "→ Crea appuntamento",
  aggiorna_campo: "→ Aggiorna campo",
  cambia_stato: "→ Cambia stato",
};

const CATEGORIA_COLOR: Record<string, string> = {
  task: "bg-emerald-100 text-emerald-700",
  marketing: "bg-pink-100 text-pink-700",
  crm: "bg-blue-100 text-blue-700",
  cantieri: "bg-amber-100 text-amber-700",
  notifiche: "bg-purple-100 text-purple-700",
  generale: "bg-muted text-muted-foreground",
};

interface Props {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (attiva: boolean) => void;
  onDelete: () => void;
}

export function AutomazioneCard({ rule, onEdit, onToggle, onDelete }: Props) {
  const azioniSec = (rule.azioni_secondarie as unknown[]) ?? [];

  return (
    <div className={`
      bg-card rounded-xl border p-4 flex flex-col gap-3
      transition-all hover:shadow-md
      ${!rule.attiva ? "opacity-60" : ""}
      ${rule.ultima_esecuzione_ok === false ? "border-destructive/30" : "border-border"}
    `}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0
          ${rule.attiva ? "bg-foreground/90" : "bg-muted"}
        `}>
          {rule.icona ?? "⚡"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground truncate text-sm">{rule.nome}</div>
          {rule.descrizione && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{rule.descrizione}</div>
          )}
          <Badge
            variant="outline"
            className={`mt-1 text-[10px] px-1.5 py-0 ${CATEGORIA_COLOR[rule.categoria] ?? ""}`}
          >
            {rule.categoria}
          </Badge>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-2" /> Modifica
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trigger → Azione */}
      <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Play className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="font-medium">
            {TRIGGER_LABEL[rule.trigger_tipo] ?? rule.trigger_tipo}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground pl-5">
          <span>{AZIONE_LABEL[rule.azione_tipo] ?? rule.azione_tipo}</span>
          {rule.azione_tipo === "crea_task" && rule.azione_config?.titolo && (
            <span className="text-muted-foreground/60 truncate">
              "{String(rule.azione_config.titolo).substring(0, 30)}"
            </span>
          )}
        </div>
        {azioniSec.length > 0 && (
          <div className="text-muted-foreground/60 pl-5 text-[10px]">
            +{azioniSec.length} azione{azioniSec.length > 1 ? "i" : ""} aggiuntiv{azioniSec.length > 1 ? "e" : "a"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {rule.ultima_esecuzione ? (
            <>
              {rule.ultima_esecuzione_ok
                ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                : <XCircle className="w-3 h-3 text-destructive" />
              }
              {formatDistanceToNow(new Date(rule.ultima_esecuzione), {
                addSuffix: true, locale: it
              })}
            </>
          ) : (
            <>
              <Activity className="w-3 h-3" />
              Mai eseguita
            </>
          )}
          {rule.esecuzioni_totali > 0 && (
            <span className="text-muted-foreground/50">· {rule.esecuzioni_totali}×</span>
          )}
        </div>
        <Switch checked={rule.attiva} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}
