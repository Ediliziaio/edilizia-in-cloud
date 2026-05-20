/**
 * BulkScheduleTemplateGallery — UI per clonare un template pre-fatto.
 *
 * Mostra la galleria di template (filtrabile per categoria). Click su una
 * card → callback `onSelect(template)` che il chiamante (wizard) usa per
 * pre-popolare i campi del form.
 *
 * Compatto: mostrato come primo step opzionale del BulkScheduleWizard
 * oppure come tab indipendente in /azienda/automazioni galleria.
 */
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BULK_SCHEDULE_TEMPLATES, type BulkScheduleTemplate } from "@/lib/automations/bulkScheduleTemplates";

const CATEGORIES: { value: BulkScheduleTemplate["category"] | "all"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "operativo", label: "Operativo" },
  { value: "finanza", label: "Finanza" },
  { value: "hr", label: "HR" },
  { value: "marketing", label: "Marketing" },
  { value: "compliance", label: "Compliance" },
];

interface Props {
  onSelect: (template: BulkScheduleTemplate) => void;
  onSkip?: () => void;
}

export function BulkScheduleTemplateGallery({ onSelect, onSkip }: Props) {
  const [filter, setFilter] = useState<BulkScheduleTemplate["category"] | "all">("all");

  const filtered = useMemo(() => {
    const list = filter === "all"
      ? BULK_SCHEDULE_TEMPLATES
      : BULK_SCHEDULE_TEMPLATES.filter((t) => t.category === filter);
    return [...list].sort((a, b) => b.priority - a.priority);
  }, [filter]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Parti da un template?</h3>
        <p className="text-xs text-muted-foreground">
          7 messaggi pronti per i casi più comuni. Click → personalizza nello step successivo.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-full border transition-colors",
              filter === c.value
                ? "bg-violet-100 border-violet-300 text-violet-700 font-medium"
                : "bg-card border-slate-200 hover:bg-slate-50 text-slate-600",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map((t) => (
          <Card
            key={t.id}
            className="cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all"
            onClick={() => onSelect(t)}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-2.5">
                <span className="text-2xl shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-sm">{t.name}</p>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{t.category}</Badge>
                    {t.config.template.mode === "ai_generated" && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-violet-50 text-violet-700 border-violet-200">AI</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{t.description}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                    <code className="font-mono">{t.config.cron}</code>
                    <span>·</span>
                    <span>{t.config.target.type}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {onSkip && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs">
            Salta — parti da zero
          </Button>
        </div>
      )}
    </div>
  );
}
