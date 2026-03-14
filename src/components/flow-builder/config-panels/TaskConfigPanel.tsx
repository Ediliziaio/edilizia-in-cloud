import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablePicker } from "./VariablePicker";

interface TaskConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
}

export function TaskConfigPanel({ config, onChange }: TaskConfigPanelProps) {
  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Titolo attività</Label>
          <VariablePicker onInsert={(v) => onChange("titolo", (config.titolo || "") + v)} />
        </div>
        <Input
          value={config.titolo || ""}
          onChange={e => onChange("titolo", e.target.value)}
          placeholder="Es: Richiama {{contatto.first_name}}"
          className="h-8 text-xs"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Descrizione</Label>
          <VariablePicker onInsert={(v) => onChange("descrizione", (config.descrizione || "") + v)} />
        </div>
        <Textarea
          value={config.descrizione || ""}
          onChange={e => onChange("descrizione", e.target.value)}
          placeholder="Descrizione della task..."
          className="text-xs min-h-[60px]"
        />
      </div>

      {/* Deadline + Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Scadenza (giorni)</Label>
          <Input
            type="number"
            min={0}
            value={config.scadenza_giorni || 1}
            onChange={e => onChange("scadenza_giorni", parseInt(e.target.value) || 1)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priorità</Label>
          <Select value={config.priorita || "media"} onValueChange={v => onChange("priorita", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bassa">Bassa</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assignee */}
      <div className="space-y-1.5">
        <Label className="text-xs">Assegna a</Label>
        <Select value={config.assegna_a || "contatto_owner"} onValueChange={v => onChange("assegna_a", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contatto_owner">Owner del contatto</SelectItem>
            <SelectItem value="utente_corrente">Utente corrente</SelectItem>
            <SelectItem value="specifico">Utente specifico...</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
