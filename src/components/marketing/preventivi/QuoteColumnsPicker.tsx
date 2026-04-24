import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Settings2 } from "lucide-react";

// Column keys disponibili nella lista preventivi.
// `required:true` significa che non può essere nascosta (es. Numero).
export type QuoteColumnKey =
  | "numero"
  | "cliente"
  | "titolo"
  | "commerciale"
  | "stato"
  | "totale"
  | "data"
  | "scadenza"
  | "fonte"
  | "margine"
  | "commissione"
  | "contatto"
  | "opportunita"
  | "approvazione";

export interface QuoteColumnDef {
  key: QuoteColumnKey;
  label: string;
  required?: boolean;
  adminOnly?: boolean;
}

export const QUOTE_COLUMNS: QuoteColumnDef[] = [
  { key: "numero", label: "Numero", required: true },
  { key: "cliente", label: "Cliente" },
  { key: "titolo", label: "Titolo" },
  { key: "commerciale", label: "Commerciale" },
  { key: "stato", label: "Stato" },
  { key: "totale", label: "Totale" },
  { key: "data", label: "Data creazione" },
  { key: "scadenza", label: "Scadenza" },
  { key: "fonte", label: "Fonte" },
  { key: "margine", label: "Margine %", adminOnly: true },
  { key: "commissione", label: "Commissione", adminOnly: true },
  { key: "contatto", label: "Contatto collegato" },
  { key: "opportunita", label: "Opportunità collegata" },
  { key: "approvazione", label: "Stato approvazione" },
];

export const DEFAULT_VISIBLE_COLUMNS: QuoteColumnKey[] = [
  "numero",
  "cliente",
  "titolo",
  "commerciale",
  "stato",
  "totale",
  "data",
];

const STORAGE_KEY = "quotes-visible-columns-v1";

export function loadVisibleColumns(): Set<QuoteColumnKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(DEFAULT_VISIBLE_COLUMNS);
    const arr = JSON.parse(raw) as string[];
    const valid = arr.filter((k) =>
      QUOTE_COLUMNS.some((c) => c.key === k)
    ) as QuoteColumnKey[];
    // Le required sono sempre presenti
    for (const c of QUOTE_COLUMNS) {
      if (c.required && !valid.includes(c.key)) valid.push(c.key);
    }
    return new Set(valid);
  } catch {
    return new Set(DEFAULT_VISIBLE_COLUMNS);
  }
}

export function saveVisibleColumns(cols: Set<QuoteColumnKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cols)));
  } catch {
    /* no-op */
  }
}

interface Props {
  visible: Set<QuoteColumnKey>;
  onChange: (next: Set<QuoteColumnKey>) => void;
  isAdmin: boolean;
}

export function QuoteColumnsPicker({ visible, onChange, isAdmin }: Props) {
  const available = useMemo(
    () => QUOTE_COLUMNS.filter((c) => !c.adminOnly || isAdmin),
    [isAdmin]
  );

  const toggle = (key: QuoteColumnKey) => {
    const col = QUOTE_COLUMNS.find((c) => c.key === key);
    if (col?.required) return;
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
    saveVisibleColumns(next);
  };

  const visibleCount = available.filter((c) => visible.has(c.key)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Settings2 className="h-4 w-4 mr-2" />
          Colonne
          <span className="ml-1 text-muted-foreground text-xs">
            ({visibleCount}/{available.length})
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={visible.has(col.key)}
            disabled={col.required}
            onCheckedChange={() => toggle(col.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {col.label}
            {col.required && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                obbligatoria
              </span>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
