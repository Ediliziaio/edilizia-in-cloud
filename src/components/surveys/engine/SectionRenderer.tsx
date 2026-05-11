/**
 * SectionRenderer — Card collassabile con grid 12-col contenente i campi.
 */
import { useMemo, useState } from "react";
import type { FieldSection } from "@/types/surveys";
import { FieldRenderer } from "./FieldRenderer";
import { isVisible } from "./evalConditions";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionRendererProps {
  section: FieldSection;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  showErrors?: boolean;
}

export function SectionRenderer({ section, values, onChange, showErrors }: SectionRendererProps) {
  const visible = useMemo(() => isVisible(section.show_if, values), [section.show_if, values]);
  const [open, setOpen] = useState(section.default_open !== false);
  const collapsible = section.collapsible !== false;

  if (!visible) return null;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={collapsible ? setOpen : undefined}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between p-3 text-left bg-muted/30 hover:bg-muted/50 transition-colors",
              !collapsible && "cursor-default",
            )}
            disabled={!collapsible}
          >
            <div>
              <p className="font-semibold text-sm">{section.label}</p>
              {section.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{section.description}</p>
              )}
            </div>
            {collapsible && (
              open
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 grid grid-cols-12 gap-3">
            {section.fields.map((f) => (
              <FieldRenderer
                key={f.key}
                field={f}
                value={values[f.key]}
                allValues={values}
                onChange={onChange}
                showErrors={showErrors}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
