import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Lock, GripVertical } from "lucide-react";
import { COLUMNS } from "./ContactsTable";

export interface CustomFieldDef {
  id: string;
  name: string;
  field_type: string;
}

interface ContactFieldsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleColumns: Set<string>;
  onApply: (columns: Set<string>) => void;
  customFields?: CustomFieldDef[];
}

export function ContactFieldsSheet({ open, onOpenChange, visibleColumns, onApply, customFields = [] }: ContactFieldsSheetProps) {
  const [draft, setDraft] = useState<Set<string>>(new Set(visibleColumns));
  const [search, setSearch] = useState("");

  const allColumns = useMemo(() => {
    const staticCols = COLUMNS.map(c => ({ key: c.key as string, label: c.label, fixed: c.key === "name" }));
    const cfCols = customFields.map(f => ({ key: `cf_${f.id}`, label: f.name, fixed: false }));
    return [...staticCols, ...cfCols];
  }, [customFields]);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setDraft(new Set(visibleColumns));
      setSearch("");
    }
    onOpenChange(v);
  };

  const q = search.toLowerCase();

  const activeFields = useMemo(() =>
    allColumns.filter((c) => c.fixed || draft.has(c.key)).filter((c) => !q || c.label.toLowerCase().includes(q)),
    [allColumns, draft, q]
  );

  const inactiveFields = useMemo(() =>
    allColumns.filter((c) => !c.fixed && !draft.has(c.key)).filter((c) => !q || c.label.toLowerCase().includes(q)),
    [allColumns, draft, q]
  );

  const toggleField = (key: string) => {
    if (key === "name") return;
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-lg font-bold">Gestisci campi</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Scegli le colonne da mostrare nella tabella contatti
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 pb-20 mt-3 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca campi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Active fields */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Campi nella tabella</p>
            {activeFields.map((col) => (
              <div key={col.key} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50">
                {col.fixed ? (
                  <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                ) : (
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
                )}
                <Checkbox
                  checked
                  disabled={col.fixed}
                  onCheckedChange={() => toggleField(col.key)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs truncate">{col.label}</span>
              </div>
            ))}
          </div>

          {/* Inactive fields */}
          {inactiveFields.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Aggiungi campi</p>
              {inactiveFields.map((col) => (
                <div key={col.key} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50">
                  <div className="w-3.5" />
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggleField(col.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs truncate">{col.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-2 px-5 py-3 bg-background border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft as any);
              onOpenChange(false);
            }}
          >
            Applica
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
