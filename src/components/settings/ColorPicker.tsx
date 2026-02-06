import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { availableColors } from "@/lib/orderStatusTemplates";

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
