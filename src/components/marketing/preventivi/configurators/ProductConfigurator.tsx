/**
 * ProductConfigurator — Preventivatore Unificato (Sprint A §4.7).
 *
 * Dispatcher dello Stadio 3. Switcha sul discriminant `source` del CatalogItem
 * per scegliere il renderer giusto:
 *   - `source === "family"`  → FamilyConfigurator (assi + misure + griglia)
 *   - `source === "article"` → ArticleConfigurator (modalità pz/mq/misura_libera/griglia)
 *
 * Il resto del flusso (AddItemDialog, QuoteBuilder) non deve conoscere la
 * distinzione: il dispatcher è l'unico punto che sa che esistono due modelli
 * di dati sotto la stessa UX. Entrambi i renderer restituiscono lo stesso
 * `ConfiguredItem[]`, che l'AddItemDialog propaga al QuoteBuilder.
 */
import { FamilyConfigurator } from "./FamilyConfigurator";
import { ArticleConfigurator } from "./ArticleConfigurator";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";

interface ProductConfiguratorProps {
  confirmLabel?: string;
  item: CatalogItem;
  tariffe: TariffaPro[];
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
}

export function ProductConfigurator(props: ProductConfiguratorProps) {
  const { item } = props;

  if (item.source === "family") {
    return (
      <FamilyConfigurator
        confirmLabel={props.confirmLabel}
        item={item}
        tariffe={props.tariffe}
        currentSortOrder={props.currentSortOrder}
        onBack={props.onBack}
        onAddItems={props.onAddItems}
      />
    );
  }

  return (
    <ArticleConfigurator
      confirmLabel={props.confirmLabel}
      item={item}
      tariffe={props.tariffe}
      currentSortOrder={props.currentSortOrder}
      onBack={props.onBack}
      onAddItems={props.onAddItems}
    />
  );
}

export default ProductConfigurator;
