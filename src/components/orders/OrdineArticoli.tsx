import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import { OrderItemsList, type OrderItem } from "./OrderItemsList";
import { OrderAttachments } from "./OrderAttachments";
import { SupplierPaymentsCard } from "./SupplierPaymentsCard";
import type { OrderItemData } from "@/lib/orderUtils";

interface OrdineArticoliProps {
  orderId: string;
  displayItems: OrderItem[];
  orderItems: OrderItemData[];
  companyId: string;
  onItemsChange: (newItems: OrderItem[]) => void;
  onItemUpdate: (item: OrderItem) => void;
  onAttachmentsRefresh: () => void;
}

export function OrdineArticoli({
  orderId,
  displayItems,
  orderItems,
  companyId,
  onItemsChange,
  onItemUpdate,
  onAttachmentsRefresh,
}: OrdineArticoliProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-orange-500" />
            Articoli
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderItemsList
            items={displayItems}
            onItemsChange={onItemsChange}
            editable={true}
            allowEdit={true}
            showStatusControls={true}
            onAttachmentsRefresh={onAttachmentsRefresh}
            onItemUpdate={onItemUpdate}
          />
        </CardContent>
      </Card>

      <OrderAttachments orderId={orderId} editable={true} />

      <SupplierPaymentsCard items={orderItems} companyId={companyId} />
    </div>
  );
}
