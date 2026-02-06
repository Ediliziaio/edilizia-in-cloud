import React from "react";
import { icons } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { availableIcons, type AvailableIcon } from "@/lib/orderStatusTemplates";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  color?: string;
}

export function IconPicker({ value, onChange, color = "#2563EB" }: IconPickerProps) {
  const CurrentIcon = icons[value as keyof typeof icons] || icons.Circle;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          style={{ borderColor: color }}
        >
          <CurrentIcon className="h-4 w-4" style={{ color }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-5 gap-1">
          {availableIcons.map((iconName) => {
            const Icon = icons[iconName as keyof typeof icons];
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
