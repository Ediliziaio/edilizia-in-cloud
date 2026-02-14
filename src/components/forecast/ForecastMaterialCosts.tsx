import { Package, ShoppingCart, Wallet, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import type { MaterialCosts, Supplier } from "@/lib/forecastTypes";

interface ForecastMaterialCostsProps {
  materialCosts: MaterialCosts;
  supplierFilter: string;
  onSupplierFilterChange: (value: string) => void;
  suppliers: Supplier[];
  hasPendingItems: boolean;
}

export function ForecastMaterialCosts({
  materialCosts,
  supplierFilter,
  onSupplierFilterChange,
  suppliers,
  hasPendingItems,
}: ForecastMaterialCostsProps) {
  if (!hasPendingItems) return null;

  return (
    <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-800">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" />
              Uscite Materiali Previste
            </CardTitle>
            <CardDescription>
              Costi articoli da acquistare o già ordinati
            </CardDescription>
          </div>
          <Select value={supplierFilter} onValueChange={onSupplierFilterChange}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Filtra per fornitore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              <SelectItem value="no-supplier">Senza fornitore</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.name}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Collapsible>
            <div className="p-4 rounded-lg bg-background border">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium">Da Ordinare</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </div>
              </CollapsibleTrigger>
              <p className="text-2xl font-bold text-orange-600 mt-2">
                {formatCurrency(materialCosts.toOrder.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {materialCosts.toOrder.count} articoli
              </p>
              <CollapsibleContent className="mt-3 pt-3 border-t space-y-1">
                {materialCosts.toOrder.items.slice(0, 5).map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="truncate mr-2">{item.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatCurrency((item.purchase_price || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
                {materialCosts.toOrder.count > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{materialCosts.toOrder.count - 5} altri articoli
                  </p>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Collapsible>
            <div className="p-4 rounded-lg bg-background border">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Ordinati (in arrivo)</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </div>
              </CollapsibleTrigger>
              <p className="text-2xl font-bold text-blue-600 mt-2">
                {formatCurrency(materialCosts.ordered.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {materialCosts.ordered.count} articoli
              </p>
              <CollapsibleContent className="mt-3 pt-3 border-t space-y-1">
                {materialCosts.ordered.items.slice(0, 5).map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="truncate mr-2">{item.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatCurrency((item.purchase_price || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
                {materialCosts.ordered.count > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{materialCosts.ordered.count - 5} altri articoli
                  </p>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="p-4 rounded-lg bg-background border-2 border-orange-300 dark:border-orange-700">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-orange-700" />
              <span className="text-sm font-medium">Totale Impegni</span>
            </div>
            <p className="text-2xl font-bold text-orange-700">
              {formatCurrency(materialCosts.toOrder.total + materialCosts.ordered.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {materialCosts.toOrder.count + materialCosts.ordered.count} articoli totali
            </p>
            {supplierFilter !== "all" && (
              <Badge variant="outline" className="mt-2 text-xs">
                Filtro: {supplierFilter === "no-supplier" ? "Senza fornitore" : supplierFilter}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
