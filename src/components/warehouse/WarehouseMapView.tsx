import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { StockItem } from "@/types/warehouse";

interface WarehouseSection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
}

interface WarehouseMapViewProps {
  stockItems: StockItem[];
  sections: WarehouseSection[];
  activeSectionFilter: string;
  onFilterSection: (sectionId: string) => void;
}

interface SectionStats {
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  lowStockCount: number;
}

function computeStats(items: StockItem[]): SectionStats {
  return items.reduce(
    (acc, item) => ({
      itemCount: acc.itemCount + 1,
      totalQuantity: acc.totalQuantity + item.quantity,
      totalValue: acc.totalValue + item.unit_cost * item.quantity,
      lowStockCount:
        acc.lowStockCount +
        (item.min_stock_level > 0 && item.quantity <= item.min_stock_level ? 1 : 0),
    }),
    { itemCount: 0, totalQuantity: 0, totalValue: 0, lowStockCount: 0 }
  );
}

export function WarehouseMapView({
  stockItems,
  sections,
  activeSectionFilter,
  onFilterSection,
}: WarehouseMapViewProps) {
  const statsBySection = useMemo(() => {
    const map = new Map<string | null, SectionStats>();
    const grouped = new Map<string | null, StockItem[]>();

    for (const item of stockItems) {
      const key = item.section_id || null;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    for (const [key, items] of grouped) {
      map.set(key, computeStats(items));
    }

    return map;
  }, [stockItems]);

  const unassignedStats = statsBySection.get(null) || {
    itemCount: 0,
    totalQuantity: 0,
    totalValue: 0,
    lowStockCount: 0,
  };

  if (sections.length === 0 && unassignedStats.itemCount === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <MapPin className="h-4 w-4" />
        Mappa Magazzino
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {sections.map((section) => {
          const stats = statsBySection.get(section.id) || {
            itemCount: 0,
            totalQuantity: 0,
            totalValue: 0,
            lowStockCount: 0,
          };
          const isActive = activeSectionFilter === section.id;

          return (
            <SectionCard
              key={section.id}
              name={section.name}
              description={section.description}
              color={section.color}
              stats={stats}
              isActive={isActive}
              onClick={() =>
                onFilterSection(isActive ? "all" : section.id)
              }
            />
          );
        })}

        {/* Senza zona */}
        <SectionCard
          name="Senza zona"
          description={null}
          color="hsl(var(--muted-foreground))"
          stats={unassignedStats}
          isActive={activeSectionFilter === "none"}
          onClick={() =>
            onFilterSection(activeSectionFilter === "none" ? "all" : "none")
          }
        />
      </div>
    </div>
  );
}

function SectionCard({
  name,
  description,
  color,
  stats,
  isActive,
  onClick,
}: {
  name: string;
  description: string | null;
  color: string;
  stats: SectionStats;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
        isActive ? "ring-2 ring-primary shadow-md" : ""
      }`}
      style={{ borderLeftColor: color }}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-1">
          <span className="font-medium text-sm truncate">{name}</span>
          {stats.lowStockCount > 0 && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-xs gap-1">
            <Package className="h-3 w-3" />
            {stats.itemCount}
          </Badge>
          <span className="text-xs text-muted-foreground">
            qtà {stats.totalQuantity}
          </span>
        </div>
        <p className="text-xs font-medium">
          {formatCurrency(stats.totalValue)}
        </p>
      </CardContent>
    </Card>
  );
}
