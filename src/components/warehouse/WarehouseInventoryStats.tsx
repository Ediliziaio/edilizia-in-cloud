/**
 * WarehouseInventoryStats — i riquadri dell'inventario.
 *
 * I numeri arrivano dal database (magazzino_riepilogo), sul magazzino scelto.
 * Prima si calcolavano qui su tutti gli articoli di tutti i magazzini, fino a
 * mille, con tre regole diverse per «sotto scorta» e il valore che contava
 * anche le giacenze negative.
 *
 *   - Valore: giacenze positive × costo; se manca il costo lo si dice
 *   - Articoli a stock: con giacenza
 *   - Sotto scorta: disponibile sotto il minimo (come il riordino)
 *   - In arrivo: dagli ordini fornitore aperti
 *   - Senza costo: articoli a stock che falsano il valore
 */

import { AlertTriangle, Euro, Package, Truck, type LucideIcon } from "lucide-react";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { formatCurrency } from "@/lib/formatters";
import type { MagazzinoRiepilogo } from "@/hooks/useMagazzinoRiepilogo";

export type WarehouseInventoryMetricKey =
  | "inventory_value"
  | "stock_items"
  | "low_stock"
  | "incoming_7d"
  | "missing_cost";

interface Props {
  riepilogo?: MagazzinoRiepilogo;
  visibleCards?: WarehouseInventoryMetricKey[];
  /** Se fornito, le card diventano cliccabili e invocano questo handler. */
  onCardClick?: (key: WarehouseInventoryMetricKey) => void;
  /** Card attualmente attiva (evidenziata). */
  activeKey?: WarehouseInventoryMetricKey | null;
}

const articoli = (n: number) => `${n} ${n === 1 ? "articolo" : "articoli"}`;

export default function WarehouseInventoryStats({ riepilogo, visibleCards, onCardClick, activeKey }: Props) {
  const a = riepilogo?.articoli;
  const arrivo = riepilogo?.in_arrivo;
  const conGiacenza = a?.con_giacenza ?? 0;
  const senzaCosto = a?.senza_costo ?? 0;
  const sottoScorta = a?.sotto_scorta ?? 0;
  const inArrivo = arrivo?.articoli ?? 0;

  const cards = [
    {
      key: "inventory_value" as const,
      label: "Valore inventario",
      value: formatCurrency(Number(a?.valore ?? 0)),
      // un valore con articoli senza costo è un valore per difetto: va detto
      hint: senzaCosto > 0 ? `${articoli(senzaCosto)} senza costo: il valore vero è più alto` : conGiacenza > 0 ? `${articoli(conGiacenza)} a stock` : "magazzino vuoto",
      icon: Euro,
      accent: senzaCosto > 0 ? ("amber" as const) : ("blue" as const),
    },
    {
      key: "stock_items" as const,
      label: "Articoli a stock",
      value: String(conGiacenza),
      hint: (a?.negativi ?? 0) > 0 ? `${articoli(a!.negativi)} con giacenza negativa` : `${articoli(a?.n ?? 0)} in anagrafica`,
      icon: Package,
      accent: (a?.negativi ?? 0) > 0 ? ("red" as const) : ("primary" as const),
    },
    {
      key: "low_stock" as const,
      label: "Sotto scorta",
      value: String(sottoScorta),
      hint: sottoScorta > 0 ? "disponibile sotto il minimo" : "tutto ok",
      icon: AlertTriangle,
      accent: sottoScorta > 0 ? ("amber" as const) : ("emerald" as const),
    },
    {
      key: "incoming_7d" as const,
      label: "In arrivo",
      value: String(inArrivo),
      hint: inArrivo > 0 ? "articoli negli ordini fornitore aperti" : "nessun ordine aperto",
      icon: Truck,
      accent: "blue" as const,
    },
    {
      key: "missing_cost" as const,
      label: "Senza costo",
      value: String(senzaCosto),
      hint: senzaCosto > 0 ? "falsano il valore" : "anagrafica ok",
      icon: Euro,
      accent: senzaCosto > 0 ? ("red" as const) : ("emerald" as const),
    },
  ];

  const visible = new Set<WarehouseInventoryMetricKey>(
    visibleCards ?? ["inventory_value", "stock_items", "low_stock", "incoming_7d"],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.filter((card) => visible.has(card.key)).map(({ key, ...card }) => (
        <KpiCard
          key={key}
          {...card}
          onClick={onCardClick ? () => onCardClick(key) : undefined}
          active={activeKey === key}
        />
      ))}
    </div>
  );
}

const accentMap = {
  primary: "blue",
  emerald: "green",
  amber: "amber",
  blue: "blue",
  red: "red",
} as const;

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: keyof typeof accentMap;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <OperationalKpiCard
      icon={Icon}
      label={label}
      value={value}
      hint={hint}
      tone={accentMap[accent]}
      onClick={onClick}
      active={active}
    />
  );
}
