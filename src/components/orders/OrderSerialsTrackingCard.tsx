/**
 * Card "Tracking Seriali" nella pagina commessa.
 *
 * Per ogni riga order_items mostra:
 *  - nome articolo + product_code (codice articolo)
 *  - counter "N/qty seriali assegnati"
 *  - button "Gestisci seriali" → apre AssignSerialsDialog (manuale + scanner)
 *
 * Le query per i seriali partono solo quando la Card viene espansa (lazy),
 * per non scatenare N query in parallelo al mount della pagina commessa.
 */
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ScanLine, Package } from "lucide-react";
import { AssignSerialsDialog } from "@/components/warehouse/AssignSerialsDialog";
import { useStockUnitsByOrderItem } from "@/hooks/warehouse/useStockUnits";
import type { OrderItemData } from "@/lib/orderUtils";

interface OrderSerialsTrackingCardProps {
  orderId: string;
  orderItems: OrderItemData[];
}

export function OrderSerialsTrackingCard({
  orderId,
  orderItems,
}: OrderSerialsTrackingCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Filtra righe con quantity > 0 — niente da tracciare per qty=0
  const trackableItems = orderItems.filter((it) => (it.quantity ?? 0) > 0);

  if (trackableItems.length === 0) return null;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors pb-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Package className="h-4 w-4 text-orange-600" />
            <CardTitle className="text-base">Tracking Seriali & Garanzie</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {trackableItems.length} {trackableItems.length === 1 ? "articolo" : "articoli"}
          </Badge>
        </div>
        {!expanded && (
          <CardDescription className="text-xs ml-6">
            Assegna i seriali dei pannelli/prodotti specifici a ogni riga della commessa.
            Scannerizza il QR del bancale o inserisci manualmente i seriali per garanzie individuali.
          </CardDescription>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {trackableItems.map((item) => (
            <SerialsTrackingRow
              key={item.id}
              orderId={orderId}
              orderItemId={item.id}
              itemName={item.name}
              productCode={(item as unknown as { product_code?: string }).product_code ?? null}
              quantity={item.quantity ?? 0}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

interface SerialsTrackingRowProps {
  orderId: string;
  orderItemId: string;
  itemName: string;
  productCode: string | null;
  quantity: number;
}

function SerialsTrackingRow({
  orderId,
  orderItemId,
  itemName,
  productCode,
  quantity,
}: SerialsTrackingRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: units = [] } = useStockUnitsByOrderItem(orderItemId);

  const assignedCount = units.length;
  const complete = assignedCount >= quantity;
  const partial = assignedCount > 0 && !complete;

  return (
    <>
      <div className="flex items-center justify-between gap-3 border rounded-md p-3 hover:bg-muted/30 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{itemName}</span>
            {productCode && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {productCode}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className="text-muted-foreground">Seriali:</span>
            <Badge
              variant={complete ? "default" : partial ? "secondary" : "outline"}
              className={
                complete
                  ? "bg-emerald-600"
                  : partial
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : ""
              }
            >
              {assignedCount} / {quantity}
            </Badge>
            {complete && <span className="text-emerald-600 text-xs">✓ Completo</span>}
          </div>
        </div>
        <Button
          variant={complete ? "outline" : "default"}
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <ScanLine className="h-3.5 w-3.5 mr-1.5" />
          Gestisci seriali
        </Button>
      </div>

      {dialogOpen && (
        <AssignSerialsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          orderId={orderId}
          orderItemId={orderItemId}
          expectedQty={quantity}
          itemLabel={productCode ? `${itemName} · ${productCode}` : itemName}
        />
      )}
    </>
  );
}
