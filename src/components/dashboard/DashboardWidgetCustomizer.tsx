/**
 * Pannello di personalizzazione widget del dashboard.
 * Permette di nascondere/mostrare widget e riordinarli.
 */
import { ChevronUp, ChevronDown, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { type WidgetConfig } from "@/hooks/useDashboardWidgets";
import { cn } from "@/lib/utils";

interface DashboardWidgetCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReset: () => void;
}

export function DashboardWidgetCustomizer({
  open,
  onOpenChange,
  widgets,
  onToggle,
  onMove,
  onReset,
}: DashboardWidgetCustomizerProps) {
  const visibleCount = widgets.filter((w) => w.visible).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Personalizza Dashboard
              </SheetTitle>
              <SheetDescription className="text-xs mt-1">
                {visibleCount} di {widgets.length} widget attivi
              </SheetDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onReset} className="text-xs gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {widgets.map((widget, idx) => (
            <div
              key={widget.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                widget.visible
                  ? "bg-background border-border"
                  : "bg-muted/30 border-transparent opacity-60"
              )}
            >
              {/* Visibility toggle */}
              <Switch
                checked={widget.visible}
                onCheckedChange={() => onToggle(widget.id)}
                className="shrink-0"
              />

              {/* Label */}
              <span className="flex-1 text-sm font-medium truncate">
                {widget.label}
              </span>

              {/* Reorder buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onMove(widget.id, "up")}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onMove(widget.id, "down")}
                  disabled={idx === widgets.length - 1}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            Le preferenze vengono salvate automaticamente nel tuo browser.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
