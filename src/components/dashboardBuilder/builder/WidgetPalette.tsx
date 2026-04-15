/**
 * WidgetPalette — pannello di sinistra del builder.
 * Mostra i widget disponibili raggruppati per categoria,
 * con ricerca e accordion per espandere/chiudere i gruppi.
 */
import { useState } from "react";
import {
  Search,
  X,
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table2,
  Gauge,
  CircleDot,
  Type,
  Minus,
  Hash,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { WidgetType } from "@/lib/dashboardBuilder/types";

export interface PaletteItem {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSize: { w: number; h: number };
}

const CATEGORIES: Array<{
  id: string;
  label: string;
  items: PaletteItem[];
}> = [
  {
    id: "kpi",
    label: "KPI & Numeri",
    items: [
      {
        type: "kpi_card",
        label: "Scheda KPI",
        description: "Valore chiave con confronto periodo",
        icon: Hash,
        defaultSize: { w: 3, h: 2 },
      },
      {
        type: "progress",
        label: "Barra progresso",
        description: "Avanzamento verso un obiettivo",
        icon: CircleDot,
        defaultSize: { w: 3, h: 2 },
      },
      {
        type: "gauge",
        label: "Indicatore",
        description: "Misuratore circolare con range",
        icon: Gauge,
        defaultSize: { w: 3, h: 4 },
      },
    ],
  },
  {
    id: "charts",
    label: "Grafici",
    items: [
      {
        type: "chart_line",
        label: "Grafico linea",
        description: "Andamento nel tempo",
        icon: LineChart,
        defaultSize: { w: 6, h: 4 },
      },
      {
        type: "chart_bar",
        label: "Grafico barre",
        description: "Confronto tra categorie",
        icon: BarChart3,
        defaultSize: { w: 6, h: 4 },
      },
      {
        type: "chart_area",
        label: "Grafico area",
        description: "Volume cumulativo nel tempo",
        icon: AreaChart,
        defaultSize: { w: 6, h: 4 },
      },
      {
        type: "chart_pie",
        label: "Grafico torta",
        description: "Distribuzione percentuale",
        icon: PieChart,
        defaultSize: { w: 4, h: 4 },
      },
    ],
  },
  {
    id: "tables",
    label: "Tabelle & Testo",
    items: [
      {
        type: "table",
        label: "Tabella dati",
        description: "Lista con colonne configurabili",
        icon: Table2,
        defaultSize: { w: 6, h: 4 },
      },
      {
        type: "text_markdown",
        label: "Testo libero",
        description: "Contenuto testuale e note",
        icon: Type,
        defaultSize: { w: 6, h: 2 },
      },
      {
        type: "divider",
        label: "Separatore",
        description: "Linea divisoria tra sezioni",
        icon: Minus,
        defaultSize: { w: 12, h: 1 },
      },
    ],
  },
];

// Flat list for search across all categories
const ALL_ITEMS: PaletteItem[] = CATEGORIES.flatMap((c) => c.items);

interface Props {
  onAdd: (item: PaletteItem) => void;
}

export function WidgetPalette({ onAdd }: Props) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const filteredCategories = query
    ? [
        {
          id: "search",
          label: `Risultati per "${search}"`,
          items: ALL_ITEMS.filter(
            (item) =>
              item.label.toLowerCase().includes(query) ||
              item.description.toLowerCase().includes(query),
          ),
        },
      ]
    : CATEGORIES;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel title */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <p className="text-xs font-semibold text-foreground mb-2">Aggiungi widget</p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca widget…"
            className="pl-8 h-8 text-sm pr-7"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Accordion categories */}
      <div className="flex-1 overflow-auto min-h-0 px-2 pb-4">
        {filteredCategories.length === 0 || filteredCategories[0]?.items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground px-4">
            Nessun widget trovato per "{search}"
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={["kpi", "charts", "tables", "search"]}
            className="space-y-0"
          >
            {filteredCategories.map((cat) => (
              <AccordionItem
                key={cat.id}
                value={cat.id}
                className="border-none"
              >
                <AccordionTrigger className="py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:no-underline rounded-md hover:bg-accent/40 transition-colors">
                  {cat.label}
                </AccordionTrigger>
                <AccordionContent className="pb-1 pt-0">
                  <div className="space-y-0.5">
                    {cat.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => onAdd(item)}
                          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-accent transition-colors group"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight truncate">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {item.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
