/**
 * WarehouseStats — KPI cards per modalità Workflow ordini.
 *
 * Cards CLICCABILI: ognuna applica il filtro corrispondente (toggle on/off).
 * Elimina la duplicazione tra KPI cards e pill quick filter sotto.
 *
 * Cards: In Ritardo · In Magazzino · In Transito · Da Ordinare.
 */

import { Package, ShoppingCart, Truck, AlertOctagon } from "lucide-react";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { formatCurrency } from "@/lib/formatters";
import type { OrderItemStatus } from "@/types/warehouse";
import type { MagazzinoRiepilogo } from "@/hooks/useMagazzinoRiepilogo";

export type WarehouseStatsFilter =
  | { kind: "all" }
  | { kind: "quick"; value: "overdue" }
  | { kind: "status"; value: OrderItemStatus };

export type WarehouseOrderMetricKey = "overdue" | "in_magazzino" | "ordinato" | "da_ordinare";

interface WarehouseStatsProps {
  /**
   * I conteggi su tutte le righe di commessa dell'azienda (e del magazzino
   * scelto), dal database. Prima si contavano le 50 righe della pagina
   * mostrata, già filtrate: cliccando un riquadro gli altri andavano a zero.
   */
  riepilogo?: MagazzinoRiepilogo["righe"];
  /** Stato corrente del filter (da Warehouse.tsx: status o quick filter). */
  activeFilter: WarehouseStatsFilter;
  /** Click su una KPI card → applica filtro (o lo rimuove se già attivo). */
  onCardClick: (next: WarehouseStatsFilter) => void;
  visibleCards?: WarehouseOrderMetricKey[];
}

/** Determina se un certo filtro è attualmente attivo (per highlight visivo). */
function isFilterActive(active: WarehouseStatsFilter, candidate: WarehouseStatsFilter): boolean {
  if (active.kind === "all" && candidate.kind === "all") return true;
  if (active.kind === "quick" && candidate.kind === "quick") return active.value === candidate.value;
  if (active.kind === "status" && candidate.kind === "status") return active.value === candidate.value;
  return false;
}

const vuoto = { count: 0, orders: 0, value: 0 };
const commesse = (n: number) => `${n} ${n === 1 ? "commessa" : "commesse"}`;
const da = (c?: { n: number; commesse: number; valore?: number }) =>
  c ? { count: c.n, orders: c.commesse, value: Number(c.valore ?? 0) } : vuoto;

export default function WarehouseStats({ riepilogo, activeFilter, onCardClick, visibleCards }: WarehouseStatsProps) {
  const stats = {
    overdue: da(riepilogo?.in_ritardo),
    inMagazzino: da(riepilogo?.in_magazzino),
    ordinati: da(riepilogo?.ordinato),
    daOrdinare: da(riepilogo?.da_ordinare),
  };

  /** Toggle: se la card è già il filtro attivo → reset a "all", altrimenti applica. */
  const handleClick = (candidate: WarehouseStatsFilter) => {
    onCardClick(isFilterActive(activeFilter, candidate) ? { kind: "all" } : candidate);
  };

  const visible = new Set<WarehouseOrderMetricKey>(
    visibleCards ?? ["overdue", "in_magazzino", "ordinato", "da_ordinare"],
  );

  return (
    // Quattro per riga da 768px: sono conteggi brevi (38, 7, 42) e a due per
    // riga, con gli altri quattro riquadri sotto, i numeri prendevano 320px.
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {/* In Ritardo */}
      {visible.has("overdue") && (
        <ClickableCard
          active={isFilterActive(activeFilter, { kind: "quick", value: "overdue" })}
          onClick={() => handleClick({ kind: "quick", value: "overdue" })}
          accent={stats.overdue.count > 0 ? "destructive" : "muted"}
          title="In Ritardo"
          icon={AlertOctagon}
          value={stats.overdue.count}
          primaryHint={stats.overdue.count > 0 ? `${commesse(stats.overdue.orders)} · scaduti` : "nessun ritardo"}
          secondaryHint={null}
        />
      )}

      {/* In Magazzino */}
      {visible.has("in_magazzino") && (
        <ClickableCard
          active={isFilterActive(activeFilter, { kind: "status", value: "in_magazzino" })}
          onClick={() => handleClick({ kind: "status", value: "in_magazzino" })}
          accent="emerald"
          title="In Magazzino"
          icon={Package}
          value={stats.inMagazzino.count}
          primaryHint={
            stats.inMagazzino.count > 0
              ? `${commesse(stats.inMagazzino.orders)} · ${formatCurrency(stats.inMagazzino.value)}`
              : "nulla in stock"
          }
          secondaryHint={null}
        />
      )}

      {/* In Transito */}
      {visible.has("ordinato") && (
        <ClickableCard
          active={isFilterActive(activeFilter, { kind: "status", value: "ordinato" })}
          onClick={() => handleClick({ kind: "status", value: "ordinato" })}
          accent="blue"
          title="In Transito"
          icon={Truck}
          value={stats.ordinati.count}
          primaryHint={
            stats.ordinati.count > 0
              ? `${commesse(stats.ordinati.orders)} · ${formatCurrency(stats.ordinati.value)}`
              : "nessun arrivo"
          }
          secondaryHint={null}
        />
      )}

      {/* Da Ordinare */}
      {visible.has("da_ordinare") && (
        <ClickableCard
          active={isFilterActive(activeFilter, { kind: "status", value: "da_ordinare" })}
          onClick={() => handleClick({ kind: "status", value: "da_ordinare" })}
          accent="amber"
          title="Da Ordinare"
          icon={ShoppingCart}
          value={stats.daOrdinare.count}
          primaryHint={
            stats.daOrdinare.count > 0
              ? `${commesse(stats.daOrdinare.orders)} · ${formatCurrency(stats.daOrdinare.value)}`
              : "lista vuota"
          }
          secondaryHint={null}
        />
      )}
    </div>
  );
}

const accentTone = {
  destructive: "red",
  emerald: "green",
  blue: "blue",
  amber: "amber",
  muted: "slate",
} as const;

function ClickableCard({
  active,
  onClick,
  accent,
  title,
  icon: Icon,
  value,
  primaryHint,
  secondaryHint,
}: {
  active: boolean;
  onClick: () => void;
  accent: keyof typeof accentTone;
  title: string;
  icon: typeof Package;
  value: number;
  primaryHint: string;
  // null = empty-state pulito (mostriamo solo primaryHint per evitare
  // rumore tipo "0 ordini · 0,00 €" che si tronca e non aggiunge info).
  secondaryHint: string | null;
}) {
  const hint = secondaryHint ? `${primaryHint} · ${secondaryHint}` : primaryHint;
  return (
    <OperationalKpiCard
      icon={Icon}
      label={title}
      value={value}
      hint={hint}
      tone={accentTone[accent]}
      onClick={onClick}
      active={active}
      className="h-full text-left"
    />
  );
}
