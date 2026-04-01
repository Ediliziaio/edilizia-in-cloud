import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketPreset {
  key: string;
  label: string;
  icon: typeof Clock;
  count: number;
  apply: () => void;
}

interface TicketFilterPresetsProps {
  activePreset: string | null;
  onClearPreset: () => void;
  presets: TicketPreset[];
}

export function TicketFilterPresets({ activePreset, onClearPreset, presets }: TicketFilterPresetsProps) {
  const visible = presets.filter((p) => p.count > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium text-muted-foreground shrink-0">Rapidi:</span>
      {visible.map((preset) => {
        const Icon = preset.icon;
        const isActive = activePreset === preset.key;
        return (
          <Button
            key={preset.key}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={cn("h-7 text-xs gap-1.5 transition-all", isActive && "shadow-sm")}
            onClick={isActive ? onClearPreset : preset.apply}
          >
            <Icon className="h-3 w-3" />
            {preset.label}
            <Badge
              variant="secondary"
              className={cn(
                "ml-0.5 h-4 min-w-[16px] px-1 text-[10px] font-bold",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : ""
              )}
            >
              {preset.count}
            </Badge>
          </Button>
        );
      })}
      {activePreset && (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onClearPreset}>
          <X className="h-3 w-3" /> Rimuovi
        </Button>
      )}
    </div>
  );
}
