import { Card, CardContent } from "@/components/ui/card";
import type { DashboardWidget } from "@/lib/dashboardBuilder/types";

interface Props {
  widget: DashboardWidget;
}

export function TextWidget({ widget }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title;
  const content = cfg.text ?? cfg.subtitle ?? "";

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 p-4 overflow-auto">
        {title && <h3 className="text-sm font-semibold mb-2">{title}</h3>}
        <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      </CardContent>
    </Card>
  );
}

export function DividerWidget({ widget }: Props) {
  const cfg = widget.config ?? {};
  const label = cfg.title;

  if (label) {
    return (
      <div className="h-full flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          {label}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center">
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
