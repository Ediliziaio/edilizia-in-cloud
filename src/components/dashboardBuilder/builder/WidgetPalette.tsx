/**
 * WidgetPalette — pannello di destra del builder.
 * Due tab:
 *   1. "Template" — widget pre-configurati raggruppati per area di business
 *      (Vendite, Ordini, Clienti, Finanza, Magazzino, Team).
 *      Cliccando si aggiunge un widget con metric + aggregazione + titolo già
 *      impostati: zero configurazione richiesta.
 *   2. "Generici" — widget vuoti (KPI, grafici, tabella, testo) da configurare
 *      manualmente con la metrica che si preferisce.
 * Con search globale che cerca in entrambe le liste.
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
  Sparkles,
  LayoutGrid,
  Square,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WidgetConfig, WidgetType } from "@/lib/dashboardBuilder/types";
import { ALL_RECIPES, RECIPE_CATEGORIES } from "@/lib/dashboardBuilder/widgetRecipes";

export interface PaletteItem {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSize: { w: number; h: number };
  defaultConfig?: Partial<WidgetConfig>;
}

const GENERIC_CATEGORIES: Array<{
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
        type: "stat_tile",
        label: "Tile di stato",
        description: "Tile colorato in stile cruscotto (CASSA / LAVORO)",
        icon: Square,
        defaultSize: { w: 3, h: 2 },
        defaultConfig: { tone: "neutral" },
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
        description: "Anello circolare con stato (98/100 Eccellente)",
        icon: Gauge,
        defaultSize: { w: 4, h: 3 },
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
        type: "alert_list",
        label: "Lista alert",
        description: "Elenco voci con bordo colorato e azione",
        icon: AlertTriangle,
        defaultSize: { w: 4, h: 4 },
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
        label: "Intestazione sezione",
        description: "Titolo + linea (es. \"SALES CONTROL\")",
        icon: Minus,
        defaultSize: { w: 12, h: 1 },
      },
    ],
  },
];

const ALL_GENERIC: PaletteItem[] = GENERIC_CATEGORIES.flatMap((c) => c.items);

interface Props {
  onAdd: (item: PaletteItem) => void;
}

// ─────────────────────────────────────────────────────────────────
// Shared row renderer
// ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onClick,
}: {
  item: PaletteItem;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-accent transition-colors group"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight truncate">
          {item.label}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {item.description}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export function WidgetPalette({ onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"templates" | "generic">("templates");

  const query = search.trim().toLowerCase();

  // Filtri search per tab
  const filterItems = (items: PaletteItem[]) =>
    query
      ? items.filter(
          (i) =>
            i.label.toLowerCase().includes(query) ||
            i.description.toLowerCase().includes(query),
        )
      : items;

  // Durante la search mostriamo sempre tutti i risultati di ENTRAMBI i tab,
  // ma raggruppati per provenienza.
  const searchMode = query.length > 0;
  const searchTemplates = searchMode ? filterItems(ALL_RECIPES) : [];
  const searchGeneric = searchMode ? filterItems(ALL_GENERIC) : [];
  const searchTotal = searchTemplates.length + searchGeneric.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel title + search */}
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
        <p className="text-xs font-semibold text-foreground">Aggiungi widget</p>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca in template e widget…"
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

      {/* Search mode: risultati piatti */}
      {searchMode ? (
        <div className="flex-1 overflow-auto min-h-0 px-2 pb-4">
          {searchTotal === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground px-4">
              Nessun widget trovato per "{search}"
            </div>
          ) : (
            <div className="space-y-3">
              {searchTemplates.length > 0 && (
                <section>
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Template ({searchTemplates.length})
                  </p>
                  <div className="space-y-0.5">
                    {searchTemplates.map((item, i) => (
                      <ItemRow key={`t-${i}`} item={item} onClick={() => onAdd(item)} />
                    ))}
                  </div>
                </section>
              )}
              {searchGeneric.length > 0 && (
                <section>
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
                    <LayoutGrid className="h-3 w-3" /> Widget generici ({searchGeneric.length})
                  </p>
                  <div className="space-y-0.5">
                    {searchGeneric.map((item, i) => (
                      <ItemRow key={`g-${i}`} item={item} onClick={() => onAdd(item)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "templates" | "generic")}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4 pt-1 pb-0 shrink-0">
            <TabsList className="w-full h-8 rounded-lg">
              <TabsTrigger value="templates" className="flex-1 text-xs h-6 rounded-md gap-1">
                <Sparkles className="h-3 w-3" />
                Template
              </TabsTrigger>
              <TabsTrigger value="generic" className="flex-1 text-xs h-6 rounded-md gap-1">
                <LayoutGrid className="h-3 w-3" />
                Generici
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab: Template per area ───────────────────────────── */}
          <TabsContent
            value="templates"
            className="flex-1 overflow-auto min-h-0 px-2 pb-4 mt-2"
          >
            <p className="px-2 pb-2 text-[11px] text-muted-foreground leading-snug">
              Widget pre-configurati pronti all'uso. Scegli per area e
              personalizza dopo.
            </p>
            <Accordion
              type="multiple"
              defaultValue={RECIPE_CATEGORIES.map((c) => c.id)}
              className="space-y-0"
            >
              {RECIPE_CATEGORIES.map((cat) => (
                <AccordionItem key={cat.id} value={cat.id} className="border-none">
                  <AccordionTrigger className="py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:no-underline rounded-md hover:bg-accent/40 transition-colors">
                    {cat.label}
                    <span className="ml-auto mr-2 text-[10px] text-muted-foreground/60 font-normal normal-case tracking-normal">
                      {cat.items.length}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1 pt-0">
                    <div className="space-y-0.5">
                      {cat.items.map((item, i) => (
                        <ItemRow
                          key={`${cat.id}-${i}`}
                          item={item}
                          onClick={() => onAdd(item)}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>

          {/* Tab: Generici ───────────────────────────────────────── */}
          <TabsContent
            value="generic"
            className="flex-1 overflow-auto min-h-0 px-2 pb-4 mt-2"
          >
            <p className="px-2 pb-2 text-[11px] text-muted-foreground leading-snug">
              Widget vuoti da configurare manualmente scegliendo la metrica.
            </p>
            <Accordion
              type="multiple"
              defaultValue={GENERIC_CATEGORIES.map((c) => c.id)}
              className="space-y-0"
            >
              {GENERIC_CATEGORIES.map((cat) => (
                <AccordionItem key={cat.id} value={cat.id} className="border-none">
                  <AccordionTrigger className="py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:no-underline rounded-md hover:bg-accent/40 transition-colors">
                    {cat.label}
                  </AccordionTrigger>
                  <AccordionContent className="pb-1 pt-0">
                    <div className="space-y-0.5">
                      {cat.items.map((item) => (
                        <ItemRow
                          key={item.type}
                          item={item}
                          onClick={() => onAdd(item)}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
