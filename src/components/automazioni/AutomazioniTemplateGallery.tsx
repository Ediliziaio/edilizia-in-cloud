import { useState } from "react";
import { useAutomationTemplates, useAttivaTemplate, type AutomationRule } from "@/hooks/useAutomazioni";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Search, Zap } from "lucide-react";
import { toast } from "sonner";

const TRIGGER_SHORT: Record<string, string> = {
  contatto_creato: "Nuovo lead arriva nel CRM",
  opportunita_creata: "Nuova opportunità creata",
  opportunita_stage_cambiato: "Opportunità cambia fase",
  appuntamento_confermato: "Appuntamento viene confermato",
  appuntamento_completato: "Appuntamento è avvenuto",
  cantiere_fase_completata: "Fase del cantiere completata",
  cantiere_creato: "Nuovo cantiere aperto",
  task_completato: "Task viene completato",
  scadenza_reminder: "Promemoria scadenza",
  cron: "Ogni giorno/settimana",
};

const AZIONE_SHORT: Record<string, string> = {
  crea_task: "crea un task",
  invia_notifica: "invia notifica in-app",
  invia_email: "invia email",
  esegui_agente_ai: "chiama agente AI",
  assegna_agente: "riassegna a un agente",
  invia_sms: "invia SMS",
  chiama_webhook: "chiama webhook",
};

const CATEGORIA_EMOJI: Record<string, string> = {
  task: "✅", marketing: "📢", crm: "💼", cantieri: "🏗️", notifiche: "🔔", generale: "🔧",
};

interface Props {
  categoria: string;
  onCustomizza: (template: AutomationRule) => void;
}

export function AutomazioniTemplateGallery({ categoria, onCustomizza }: Props) {
  const [cerca, setCerca] = useState("");
  const [attivati, setAttivati] = useState<Set<string>>(new Set());
  const { data: templates, isLoading } = useAutomationTemplates(categoria as any);
  const attivaTemplate = useAttivaTemplate();

  const filtered = (templates ?? []).filter(t =>
    !cerca ||
    t.nome.toLowerCase().includes(cerca.toLowerCase()) ||
    (t.descrizione ?? "").toLowerCase().includes(cerca.toLowerCase())
  );

  const handleAttiva = async (template: AutomationRule) => {
    try {
      await attivaTemplate.mutateAsync(template);
      setAttivati(prev => new Set([...prev, template.id]));
      toast.success(`"${template.nome}" attivata!`);
    } catch {
      toast.error("Errore nell'attivazione del template");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intro + Search */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Template Automazioni</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Attiva in un click automazioni pronte per il settore edilizia.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca template..."
            className="pl-9"
            value={cerca}
            onChange={e => setCerca(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(template => {
          const isAttivato = attivati.has(template.id);
          const config = template.azione_config as Record<string, unknown>;
          return (
            <div
              key={template.id}
              className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-foreground/80 to-foreground/60 flex items-center justify-center text-xl flex-shrink-0">
                  {template.icona ?? "⚡"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground text-sm leading-snug">
                    {template.nome}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {template.descrizione}
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 rounded-lg px-3 py-2 text-xs text-primary">
                <span className="font-medium">Quando:</span>{" "}
                {TRIGGER_SHORT[template.trigger_tipo] ?? template.trigger_tipo}
                <br />
                <span className="font-medium">Allora:</span>{" "}
                {AZIONE_SHORT[template.azione_tipo] ?? template.azione_tipo}
                {config?.titolo && (
                  <span className="text-primary/70"> → "{String(config.titolo).substring(0, 40)}"</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-auto">
                <Badge variant="outline" className="text-[10px]">
                  {CATEGORIA_EMOJI[template.categoria] ?? "⚡"} {template.categoria}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onCustomizza(template)}
                  >
                    Personalizza
                  </Button>
                  <Button
                    size="sm"
                    className={`h-7 text-xs ${isAttivato ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                    onClick={() => !isAttivato && handleAttiva(template)}
                    disabled={isAttivato || attivaTemplate.isPending}
                  >
                    {isAttivato ? (
                      <><Check className="w-3.5 h-3.5 mr-1" />Attivata</>
                    ) : (
                      <><Zap className="w-3.5 h-3.5 mr-1" />Attiva</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nessun template trovato{cerca ? ` per "${cerca}"` : ""}.
        </div>
      )}
    </div>
  );
}
