import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { availableColors } from "@/lib/orderStatusTemplates";

/** Il nome in italiano di ogni colore, per chi usa il lettore di schermo. */
const NOME_COLORE: Record<string, string> = {
  "#2563EB": "blu", "#16A34A": "verde", "#CA8A04": "ambra", "#DC2626": "rosso",
  "#7C3AED": "viola", "#0891B2": "ciano", "#EA580C": "arancione", "#DB2777": "rosa",
};

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Scegli il colore"
        >
          <div
            className="h-5 w-5 rounded-full border border-border"
            style={{ backgroundColor: value }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" align="start">
        <div className="grid grid-cols-4 gap-1">
          {availableColors.map((color) => (
            <Button
              key={color}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 p-0",
                value === color && "ring-2 ring-primary ring-offset-2"
              )}
              onClick={() => onChange(color)}
              aria-label={`Colore ${NOME_COLORE[color] ?? color}`}
              aria-pressed={value === color}
            >
              <div
                className="h-6 w-6 rounded-full"
                style={{ backgroundColor: color }}
              />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
