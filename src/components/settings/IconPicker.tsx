import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { availableIcons } from "@/lib/orderStatusTemplates";
import { getStatusIcon, STATUS_ICON_REGISTRY } from "@/lib/statusIconRegistry";

/** Il nome in italiano di ogni icona, per chi usa il lettore di schermo (i nomi tecnici non dicono niente). */
const NOME_ICONA: Record<string, string> = {
  FileText: "documento", CheckCircle: "spunta", Clipboard: "appunti", Ruler: "metro", Factory: "fabbrica", Package: "pacco",
  Truck: "camion", Wrench: "chiave inglese", Home: "casa", Zap: "fulmine", Sun: "sole", Hammer: "martello",
  PaintBucket: "vernice", Settings: "ingranaggio", Clock: "orologio", Calendar: "calendario", Shield: "scudo",
  Star: "stella", Award: "premio", Flag: "bandiera", LifeBuoy: "salvagente",
};

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  color?: string;
}

/**
 * 2026-05-27 (perf fix P0): prima il file importava `icons` map intera da
 * lucide-react (5000+ componenti, ~320KB nel chunk). Ora usa il registry
 * centralizzato `statusIconRegistry` con ~70 icone selezionate tree-shaken.
 *
 * Riduzione bundle: -300KB su CompanyDetail chunk (era 365KB).
 */
export function IconPicker({ value, onChange, color = "#2563EB" }: IconPickerProps) {
  const CurrentIcon = getStatusIcon(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          style={{ borderColor: color }}
          aria-label="Scegli l'icona"
        >
          <CurrentIcon className="h-4 w-4" style={{ color }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-5 gap-1">
          {availableIcons.map((iconName) => {
            const Icon = STATUS_ICON_REGISTRY[iconName];
            if (!Icon) return null;
            return (
              <Button
                key={iconName}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10",
                  value === iconName && "bg-primary/10 border border-primary"
                )}
                onClick={() => onChange(iconName)}
                aria-label={`Icona ${NOME_ICONA[iconName] ?? iconName}`}
                aria-pressed={value === iconName}
              >
                <Icon className="h-5 w-5" />
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
