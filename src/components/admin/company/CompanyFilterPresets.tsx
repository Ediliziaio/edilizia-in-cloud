import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPreset {
  key: string;
  label: string;
  icon: typeof Clock;
  description: string;
  color: string;
  count: number;
  apply: () => void;
}

interface CompanyFilterPresetsProps {
  activePreset: string | null;
  onClearPreset: () => void;
  presets: FilterPreset[];
}

export function CompanyFilterPresets({ activePreset, onClearPreset, presets }: CompanyFilterPresetsProps) {
  const visiblePresets = presets.filter((p) => p.count > 0);
  if (visiblePresets.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-1 sm:flex-wrap sm:overflow-x-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="hidden text-xs font-medium text-muted-foreground shrink-0 sm:inline">Filtri rapidi:</span>
      {visiblePresets.map((preset) => {
        const Icon = preset.icon;
        const isActive = activePreset === preset.key;
        return (
          <Button
            key={preset.key}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 shrink-0 text-xs gap-1.5 transition-all",
              isActive && "shadow-sm"
            )}
            onClick={isActive ? onClearPreset : preset.apply}
            title={preset.description}
          >
            <Icon className="h-3 w-3" />
            {preset.label}
            <Badge
              variant="secondary"
              className={cn(
                "ml-0.5 h-4 min-w-[16px] px-1 text-xs font-bold",
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
          <X className="h-3 w-3" /> Rimuovi filtro
        </Button>
      )}
    </div>
  );
}
