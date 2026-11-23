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

import { cn } from "@/lib/utils";
import { AlertTriangle, Euro, Package, Truck, type LucideIcon } from "lucide-react";
import { OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
import { formatCurrency } from "@/lib/formatters";
import type { MagazzinoRiepilogo } from "@/hooks/useMagazzinoRiepilogo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type WarehouseInventoryMetricKey =
  | "inventory_value"
  | "stock_items"
  | "low_stock"
  | "incoming_7d"
  | "missing_cost";

interface Props {
  riepilogo?: MagazzinoRiepilogo;
  isLoading?: boolean;
  canViewCosts?: boolean;
  visibleCards?: WarehouseInventoryMetricKey[];
  /** Se fornito, le card diventano cliccabili e invocano questo handler. */
  onCardClick?: (key: WarehouseInventoryMetricKey) => void;
  /** Card attualmente attiva (evidenziata). */
  activeKey?: WarehouseInventoryMetricKey | null;
}


export default function WarehouseInventoryStats({ riepilogo, visibleCards, onCardClick, activeKey, isLoading = false, canViewCosts = true }: Props) {
  const t = useT();
  const articoli = (n: number) => (n === 1 ? t("{n} articolo", { n }) : t("{n} articoli", { n }));
  const a = riepilogo?.articoli;
  const arrivo = riepilogo?.in_arrivo;
  const conGiacenza = a?.con_giacenza ?? 0;
  const senzaCosto = a?.senza_costo ?? 0;
  const sottoScorta = a?.sotto_scorta ?? 0;
  const inArrivo = arrivo?.articoli ?? 0;

  const cards = [
    {
      key: "inventory_value" as const,
      label: t("Valore inventario"),
      value: formatCurrency(Number(a?.valore ?? 0)),
      // un valore con articoli senza costo è un valore per difetto: va detto
      hint: senzaCosto > 0 ? t("{senzaCosto} senza costo: il valore vero è più alto", { senzaCosto: articoli(senzaCosto) }) : conGiacenza > 0 ? t("{conGiacenza} a stock", { conGiacenza: articoli(conGiacenza) }) : t("magazzino vuoto"),
      icon: Euro,
      accent: senzaCosto > 0 ? ("amber" as const) : ("blue" as const),
    },
    {
      key: "stock_items" as const,
      label: t("Articoli a stock"),
      value: String(conGiacenza),
      hint: (a?.negativi ?? 0) > 0 ? t("{negativi} con giacenza negativa", { negativi: String(articoli(a!.negativi) ?? "") }) : t("{valore} in anagrafica", { valore: String(articoli(a?.n ?? 0) ?? "") }),
      icon: Package,
      accent: (a?.negativi ?? 0) > 0 ? ("red" as const) : ("primary" as const),
    },
    {
      key: "low_stock" as const,
      label: t("Sotto scorta"),
      value: String(sottoScorta),
      hint: sottoScorta > 0 ? t("disponibile sotto il minimo") : t("tutto ok"),
      icon: AlertTriangle,
      accent: sottoScorta > 0 ? ("amber" as const) : ("emerald" as const),
    },
    {
      key: "incoming_7d" as const,
      label: t("In arrivo"),
      value: String(inArrivo),
      hint: inArrivo > 0 ? t("articoli negli ordini fornitore aperti") : t("nessun ordine aperto"),
      icon: Truck,
      accent: "blue" as const,
    },
    {
      key: "missing_cost" as const,
      label: t("Senza costo"),
      value: String(senzaCosto),
      hint: senzaCosto > 0 ? t("falsano il valore") : t("anagrafica ok"),
      icon: Euro,
      accent: senzaCosto > 0 ? ("red" as const) : ("emerald" as const),
    },
  ];

  const visible = new Set<WarehouseInventoryMetricKey>(
    visibleCards ?? ["inventory_value", "stock_items", "low_stock", "incoming_7d"],
  );

  const mostrate = cards.filter((card) => visible.has(card.key) && (canViewCosts || !["inventory_value", "missing_cost"].includes(card.key)));

  // Sul telefono: tre riquadri su una riga, quattro in due righe da due. Con tre colonne
  // fisse il quarto restava da solo su una riga.
  return (
    <div className={cn("grid gap-2 sm:grid-cols-4 sm:gap-3", mostrate.length % 3 === 0 ? "grid-cols-3" : "grid-cols-2")}>
      {mostrate.map(({ key, ...card }) => (
        <KpiCard
          key={key}
          {...card}
          isLoading={isLoading || !riepilogo}
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
  isLoading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: keyof typeof accentMap;
  onClick?: () => void;
  active?: boolean;
  isLoading: boolean;
}) {
  return (
    <OperationalSummaryMetric
      icon={Icon}
      label={label}
      value={value}
      hint={isLoading ? undefined : hint}
      isLoading={isLoading}
      tone={accentMap[accent]}
      onClick={onClick}
      active={active}
    />
  );
}
