import { Clock, CalendarDays, CalendarClock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

interface DelayConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
  onPatch: (patch: Record<string, any>) => void;
}

export function DelayConfigPanel({ config, onChange, onPatch }: DelayConfigPanelProps) {
  const tipo = config.delay_tipo || "attendi";
  const giorniAttivi: number[] = config.delay_giorni_settimana?.length ? config.delay_giorni_settimana : [0, 1, 2, 3, 4, 5, 6];
  const legacyMinutes = (Number(config.giorni) || 0) * 1440 + (Number(config.ore) || 0) * 60 + (Number(config.minuti) || 0);
  const displayedDuration = config.delay_durata ?? config.delay_value ?? (legacyMinutes || 1);
  const displayedUnit = config.delay_unita ?? ({ days: "giorni", hours: "ore", minutes: "minuti" }[config.delay_unit as string]) ?? (legacyMinutes ? "minuti" : config.delay_durata != null ? "giorni" : "ore");
  // Attesa ancorata all'appuntamento: il motore la conosce da tempo
  // (delay_tipo "prima_appuntamento" + delay_ore), ma il pannello non la
  // mostrava — chi apriva un promemoria "24 ore prima" vedeva un riquadro
  // vuoto e, toccando un pulsante, perdeva l'ancoraggio senza accorgersene.
  const oreApp = Number(config.delay_ore ?? 24);
  const unitaApp = oreApp > 0 && oreApp < 1 ? "minuti" : "ore";
  const valoreApp = unitaApp === "minuti" ? Math.round(oreApp * 60) : oreApp;
  const scriviApp = (valore: number, unita: string) =>
    onChange("delay_ore", unita === "minuti" ? Math.max(1, valore) / 60 : Math.max(1, valore));

  return (
    <div className="space-y-4">
      {/* Tipo */}
      <div className="space-y-1.5">
        <Label className="text-xs">Tipo attesa</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: "attendi", label: "Attendi per", icon: Clock },
            { val: "fino_a", label: "Fino a un orario", icon: CalendarDays },
            { val: "prima_appuntamento", label: "Prima dell'appuntamento", icon: CalendarClock },
          ].map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.val}
                onClick={() => onPatch({ delay_tipo: opt.val,
                  ...(opt.val === "fino_a" && !config.delay_orario ? { delay_orario: "09:00" } : {}),
                  ...(opt.val === "prima_appuntamento" && config.delay_ore == null ? { delay_ore: 24 } : {}),
                })}
                className={cn(
                  "flex items-center justify-center gap-1.5 p-2 rounded-lg border text-center text-xs font-medium transition-all",
                  opt.val === "prima_appuntamento" && "col-span-2",
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
              value={displayedDuration}
              onChange={e => onPatch({ delay_durata: e.target.value === "" ? "" : Number(e.target.value), delay_unita: displayedUnit })}
              className="h-8 text-xs w-20"
            />
            <Select value={displayedUnit} onValueChange={v => onPatch({ delay_unita: v, delay_durata: displayedDuration })}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Secondi: nelle conversazioni (WhatsApp, bot) la pausa
                    giusta è di trenta secondi, non di un minuto. */}
                <SelectItem value="secondi">Secondi</SelectItem>
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

      {/* Ancorata all'appuntamento */}
      {tipo === "prima_appuntamento" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quanto prima</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={valoreApp}
              onChange={e => scriviApp(parseInt(e.target.value) || 1, unitaApp)}
              className="h-8 text-xs w-20"
            />
            <Select value={unitaApp} onValueChange={u => scriviApp(valoreApp, u)}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minuti">Minuti prima</SelectItem>
                <SelectItem value="ore">Ore prima</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si conta dal primo appuntamento futuro del contatto. Se l'appuntamento
            non c'è, o è già passato, il flusso prosegue subito.
          </p>
        </div>
      )}

      {/* Day picker */}
      {tipo !== "prima_appuntamento" && (
      <div className="space-y-1.5">
        <Label className="text-xs">Solo in questi giorni</Label>
        <div className="flex gap-1 flex-wrap">
          {GIORNI.map((g, i) => {
            const attivo = giorniAttivi.includes(i);
            return (
              <button
                key={i}
                aria-pressed={attivo}
                disabled={attivo && giorniAttivi.length === 1}
                onClick={() => {
                  if (attivo && giorniAttivi.length === 1) return;
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
      )}
    </div>
  );
}
