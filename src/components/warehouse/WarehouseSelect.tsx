import { Warehouse as WarehouseIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWarehouses } from "@/hooks/useWarehouses";
import { cn } from "@/lib/utils";

interface WarehouseSelectProps {
  /** ID del magazzino selezionato */
  value?: string | null;
  /** Callback alla selezione */
  onChange: (warehouseId: string | null) => void;
  /** Placeholder when no value */
  placeholder?: string;
  /** Allow "all warehouses" option (valore speciale "all") */
  allowAll?: boolean;
  /** Label per l'opzione "tutti" */
  allLabel?: string;
  /** Mostra solo magazzini attivi (default: true) */
  onlyActive?: boolean;
  /** CSS aggiuntivo */
  className?: string;
  /** Disabilita il controllo */
  disabled?: boolean;
  /** Rende il campo opzionale (aggiunge opzione "Nessuno") */
  nullable?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  main: "Principale",
  secondary: "Secondario",
  site: "Cantiere",
  vehicle: "Veicolo",
};

/**
 * WarehouseSelect — selettore magazzino riutilizzabile.
 * Carica l'elenco magazzini dalla company corrente.
 */
export function WarehouseSelect({
  value,
  onChange,
  placeholder = "Seleziona magazzino…",
  allowAll = false,
  allLabel = "Tutti i magazzini",
  onlyActive = true,
  className,
  disabled = false,
  nullable = false,
}: WarehouseSelectProps) {
  const { warehouses, isLoading } = useWarehouses(onlyActive);

  const handleChange = (val: string) => {
    if (val === "__all__") return onChange(null);
    if (val === "__none__") return onChange(null);
    onChange(val);
  };

  const selectValue = value ?? (allowAll ? "__all__" : "");

  return (
    <Select
      value={selectValue || ""}
      onValueChange={handleChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <div className="flex items-center gap-2">
          <WarehouseIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <SelectValue placeholder={isLoading ? "Caricamento…" : placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {allowAll && (
          <SelectItem value="__all__">{allLabel}</SelectItem>
        )}
        {nullable && (
          <SelectItem value="__none__">— Nessuno —</SelectItem>
        )}
        {warehouses.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            <span className="flex items-center gap-1.5">
              {w.name}
              {w.is_default && (
                <span className="text-xs text-muted-foreground">(predefinito)</span>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                · {TYPE_LABEL[w.type] ?? w.type}
              </span>
            </span>
          </SelectItem>
        ))}
        {!isLoading && warehouses.length === 0 && (
          <SelectItem value="__empty__" disabled>
            Nessun magazzino disponibile
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
