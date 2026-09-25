import { useMemo } from "react";
import { ListChecks, RefreshCw, SlidersHorizontal, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

type ChoiceRow = {
  group: string;
  label: string;
  value: string;
};

interface RenderResultRefinementPanelProps {
  config: unknown;
  title?: string;
  description?: string;
  noteValue?: string;
  notePlaceholder?: string;
  onNoteChange?: (value: string) => void;
  onEditChoices?: () => void;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  /** Riga piccola sotto i bottoni (es. «La prima correzione entro 10 minuti è inclusa»). */
  regenerateNote?: string;
  disabled?: boolean;
  maxItems?: number;
}

const SKIP_KEYS = new Set([
  "prompt",
  "final_prompt",
  "system_prompt",
  "user_prompt",
  "negative_prompt",
  "domainPromptBlocks",
  "promptValidation",
  "validation",
  "legacy_config",
  "input_image_meta",
  "scene_analysis",
  "analysis",
  "created_at",
  "updated_at",
  "company_id",
  "user_id",
  "created_by",
  "session_id",
  "id",
  "url",
  "path",
  "result_url",
  "result_urls",
  "image_url",
  "original_photo_url",
]);

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Si" : null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return humanize(value);
  if (Array.isArray(value)) {
    const formatted = value
      .map((item) => formatValue(item))
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
    return formatted || null;
  }
  return null;
}

function collectChoices(value: unknown, group = "Generale", rows: ChoiceRow[] = []): ChoiceRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return rows;

  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (SKIP_KEYS.has(key) || key.startsWith("_")) return;
    if (raw === null || raw === undefined || raw === "") return;

    if (typeof raw === "object" && !Array.isArray(raw)) {
      collectChoices(raw, humanize(key), rows);
      return;
    }

    const formatted = formatValue(raw);
    if (!formatted) return;

    rows.push({
      group,
      label: humanize(key),
      value: formatted,
    });
  });

  return rows;
}

export function RenderResultRefinementPanel({
  config,
  title = "Scelte configurate",
  description = "Riepilogo delle finiture e delle regole applicate. Il prompt tecnico resta nascosto.",
  noteValue,
  notePlaceholder = "Scrivi cosa vuoi modificare nel prossimo render. Esempio: rendi la finitura piu calda, mantieni identici gli arredi, sostituisci solo il dettaglio selezionato.",
  onNoteChange,
  onEditChoices,
  onRegenerate,
  regenerateLabel = "Genera variante",
  regenerateNote,
  disabled,
  maxItems = 22,
}: RenderResultRefinementPanelProps) {
  const isMobile = useIsMobile();
  const choices = useMemo(() => collectChoices(config).slice(0, maxItems), [config, maxItems]);
  const groups = useMemo(() => Array.from(new Set(choices.map((item) => item.group))), [choices]);

  // Telefono: resta solo la richiesta e il bottone, secondario rispetto a
  // «Manda al cliente». L'elenco delle scelte (nomi di campo tecnici, fino a
  // 22 riquadri) si rilegge dal computer.
  if (isMobile) {
    return (
      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="space-y-2 p-3">
          <div className="text-[13px] font-semibold">Vuoi cambiare qualcosa?</div>
          {noteValue !== undefined && onNoteChange && (
            <Textarea
              value={noteValue}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Es. finitura più calda, il resto identico…"
              className="min-h-[88px] bg-white placeholder:text-[13px]"
              disabled={disabled}
            />
          )}
          <div className="flex gap-2">
            {onEditChoices && (
              <Button
                type="button"
                variant="outline"
                className="w-11 shrink-0 px-0"
                onClick={onEditChoices}
                disabled={disabled}
                aria-label="Modifica scelte"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            )}
            {onRegenerate && (
              <Button type="button" variant="outline" className="min-w-0 flex-1 gap-2" onClick={onRegenerate} disabled={disabled}>
                {disabled ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                <span className="truncate">{regenerateLabel}</span>
              </Button>
            )}
          </div>
          {regenerateNote && <p className="text-[11px] text-muted-foreground">{regenerateNote}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ListChecks className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {choices.length > 0 ? (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group} className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {choices
                    .filter((choice) => choice.group === group)
                    .map((choice) => (
                      <div key={`${choice.group}-${choice.label}-${choice.value}`} className="rounded-xl border bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{choice.label}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{choice.value}</div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-3 text-sm text-muted-foreground">
            Nessuna scelta tecnica leggibile da mostrare per questo render.
          </div>
        )}

        {noteValue !== undefined && onNoteChange && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Richiesta libera per la prossima variante</div>
              <Badge variant="outline" className="font-medium">
                Non mostra il prompt
              </Badge>
            </div>
            <Textarea
              value={noteValue}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={notePlaceholder}
              className="min-h-[104px] bg-white"
              disabled={disabled}
            />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {onEditChoices && (
            <Button type="button" variant="outline" className="gap-2" onClick={onEditChoices} disabled={disabled}>
              <SlidersHorizontal className="h-4 w-4" />
              Modifica scelte
            </Button>
          )}
          {onRegenerate && (
            <Button type="button" className="gap-2" onClick={onRegenerate} disabled={disabled}>
              {disabled ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {regenerateLabel}
            </Button>
          )}
        </div>
        {regenerateNote && <p className="text-xs text-muted-foreground">{regenerateNote}</p>}
      </CardContent>
    </Card>
  );
}
