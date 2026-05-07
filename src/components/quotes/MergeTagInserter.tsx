/**
 * MergeTagInserter — popover per inserire merge tag in textarea/input.
 *
 * Click su un tag → inserisce {{tag}} nel campo target nella posizione
 * corrente del cursore (o append se ref non disponibile).
 *
 * Mostra i tag raggruppati per categoria con descrizione human-readable.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tag, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MERGE_TAGS } from "@/types/quoteTemplate";
import { cn } from "@/lib/utils";

const GROUP_LABELS: Record<string, string> = {
  cliente: "👤 Cliente",
  cantiere: "🏗️ Cantiere",
  preventivo: "📋 Preventivo",
  azienda: "🏢 Azienda",
  data: "📅 Data",
};

interface Props {
  /** Ref del textarea/input target (se fornito, inserisce alla posizione cursore) */
  targetRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
  /** Callback chiamato dopo l'inserimento con il nuovo valore completo */
  onInsert: (newValue: string) => void;
  /** Valore corrente del campo */
  currentValue: string;
  /** Custom trigger button. Default: piccolo button con icona Tag */
  trigger?: React.ReactNode;
}

export function MergeTagInserter({ targetRef, onInsert, currentValue, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = MERGE_TAGS.filter((t) =>
    !search ||
    t.tag.toLowerCase().includes(search.toLowerCase()) ||
    t.descrizione.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, typeof MERGE_TAGS>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  const insertTag = (tag: string) => {
    const placeholder = `{{${tag}}}`;
    const ta = targetRef?.current;
    if (ta && typeof ta.selectionStart === "number") {
      const start = ta.selectionStart ?? currentValue.length;
      const end = ta.selectionEnd ?? currentValue.length;
      const next = currentValue.slice(0, start) + placeholder + currentValue.slice(end);
      onInsert(next);
      // Riposiziona cursore dopo l'inserimento
      requestAnimationFrame(() => {
        ta.focus();
        const cursor = start + placeholder.length;
        try { ta.setSelectionRange(cursor, cursor); } catch { /* noop */ }
      });
    } else {
      onInsert((currentValue ?? "") + placeholder);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-[11px]">
            <Tag className="h-3 w-3" />
            Inserisci campo
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[340px] p-0 border-orange-100 shadow-2xl rounded-xl overflow-hidden flex flex-col"
        style={{ maxHeight: "min(70vh, 480px)" }}
      >
        <div className="px-3 py-2.5 border-b bg-gradient-to-br from-orange-50 to-amber-50 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag className="h-3.5 w-3.5 text-orange-600" />
            <p className="text-xs font-semibold text-slate-800">Inserisci campo dinamico</p>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Click su un campo → inserisce <code className="bg-white border border-slate-200 px-1 rounded text-[9px]">{`{{nome}}`}</code> sostituito a generazione PDF.
          </p>
          <div className="relative mt-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca campo..."
              className="h-7 pl-7 text-[11px] border-slate-200 bg-white"
            />
          </div>
        </div>
        <div className="overflow-y-auto p-2 flex-1 min-h-0 space-y-3">
          {Object.entries(grouped).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nessun campo trovato.</p>
          ) : (
            Object.entries(grouped).map(([group, tags]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1 mb-1">
                  {GROUP_LABELS[group] ?? group}
                </p>
                <div className="space-y-0.5">
                  {tags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => insertTag(t.tag)}
                      className={cn(
                        "w-full flex items-start justify-between gap-2 px-2 py-1.5 rounded-md text-left",
                        "hover:bg-orange-50 transition-colors group",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-700 group-hover:text-orange-700 truncate font-medium">
                          {t.descrizione}
                        </p>
                        <code className="text-[9px] text-slate-400 group-hover:text-orange-500 font-mono">
                          {`{{${t.tag}}}`}
                        </code>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
