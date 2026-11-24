import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablePicker } from "./VariablePicker";
import { EvidenzaObbligatoria, campoVuoto } from "./EvidenzaObbligatoria";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface TaskConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
  companyId?: string;
}

export function TaskConfigPanel({ config, onChange, companyId }: TaskConfigPanelProps) {
  const t = useT();
  const aggiorna = config.item_id === "aggiorna_task";
  return (
    <div className="space-y-4">
      {/* Il required di "Aggiorna stato attività": PRIMA il pannello non lo
          mostrava affatto — nodo impossibile da completare dalla UI. */}
      {aggiorna && (
        <EvidenzaObbligatoria mostra={campoVuoto(config.task_id)}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("ID Task da aggiornare")}</Label>
              <VariablePicker companyId={companyId} onInsert={(v) => onChange("task_id", (config.task_id || "") + v)} />
            </div>
            <Input
              value={config.task_id || ""}
              onChange={e => onChange("task_id", e.target.value)}
              placeholder="{{task.id}}"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">{t("Di solito la variabile {variabile} dal trigger task.", { variabile: "{{task.id}}" })}</p>
          </div>
        </EvidenzaObbligatoria>
      )}
      {/* Title */}
      <EvidenzaObbligatoria mostra={!aggiorna && campoVuoto(config.titolo)}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("Titolo attività")}</Label>
          <VariablePicker companyId={companyId} onInsert={(v) => onChange("titolo", (config.titolo || "") + v)} />
        </div>
        <Input
          value={config.titolo || ""}
          onChange={e => onChange("titolo", e.target.value)}
          placeholder="Es: Richiama {{contatto.first_name}}"
          className="h-8 text-xs"
        />
      </div>
      </EvidenzaObbligatoria>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("Descrizione")}</Label>
          <VariablePicker companyId={companyId} onInsert={(v) => onChange("descrizione", (config.descrizione || "") + v)} />
        </div>
        <Textarea
          value={config.descrizione || ""}
          onChange={e => onChange("descrizione", e.target.value)}
          placeholder={t("Descrizione della task...")}
          className="text-xs min-h-[60px]"
        />
      </div>

      {/* Deadline + Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("Scadenza (giorni)")}</Label>
          <Input
            type="number"
            min={0}
            value={config.scadenza_giorni || 1}
            onChange={e => onChange("scadenza_giorni", parseInt(e.target.value) || 1)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("Priorità")}</Label>
          <Select value={config.priorita || "media"} onValueChange={v => onChange("priorita", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bassa">{t("Bassa")}</SelectItem>
              <SelectItem value="media">{t("Media")}</SelectItem>
              <SelectItem value="alta">{t("Alta")}</SelectItem>
              <SelectItem value="urgente">{t("Urgente")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assignee */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("Assegna a")}</Label>
        <Select value={config.assegnato_a || "contatto_owner"} onValueChange={v => onChange("assegnato_a", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contatto_owner">{t("Owner del contatto")}</SelectItem>
            <SelectItem value="utente_corrente">{t("Utente corrente")}</SelectItem>
            <SelectItem value="specifico">{t("Utente specifico...")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
