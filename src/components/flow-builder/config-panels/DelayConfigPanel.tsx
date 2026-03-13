import { Clock, CalendarDays } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

interface DelayConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
}

export function DelayConfigPanel({ config, onChange }: DelayConfigPanelProps) {
  const tipo = config.delay_tipo || "attendi";
  const giorniAttivi: number[] = config.delay_giorni_settimana || [1, 2, 3, 4, 5];

  return (
    <div className="space-y-4">
      {/* Tipo */}
      <div className="space-y-1.5">
        <Label className="text-xs">Tipo attesa</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: "attendi", label: "Attendi per", icon: Clock },
            { val: "fino_a", label: "Fino a", icon: CalendarDays },
          ].map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.val}
                onClick={() => onChange("delay_tipo", opt.val)}
                className={cn(
                  "flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all",
                  tipo === opt.val
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      {tipo === "attendi" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Durata</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={config.delay_durata || 1}
              onChange={e => onChange("delay_durata", parseInt(e.target.value) || 1)}
              className="h-8 text-xs w-20"
            />
            <Select value={config.delay_unita || "giorni"} onValueChange={v => onChange("delay_unita", v)}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minuti">Minuti</SelectItem>
                <SelectItem value="ore">Ore</SelectItem>
                <SelectItem value="giorni">Giorni</SelectItem>
                <SelectItem value="settimane">Settimane</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Until time */}
      {tipo === "fino_a" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Orario specifico</Label>
          <Input
            type="time"
            value={config.delay_orario || "09:00"}
            onChange={e => onChange("delay_orario", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Day picker */}
      <div className="space-y-1.5">
        <Label className="text-xs">Solo in questi giorni</Label>
        <div className="flex gap-1 flex-wrap">
          {GIORNI.map((g, i) => {
            const attivo = giorniAttivi.includes(i);
            return (
              <button
                key={i}
                onClick={() => {
                  const next = attivo
                    ? giorniAttivi.filter(d => d !== i)
                    : [...giorniAttivi, i];
                  onChange("delay_giorni_settimana", next);
                }}
                className={cn(
                  "w-8 h-8 rounded-lg text-[10px] font-semibold transition-all",
                  attivo
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
