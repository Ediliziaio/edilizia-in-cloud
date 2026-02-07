import { useState } from "react";
import { Link } from "react-router-dom";
import { differenceInDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { WarehouseItem } from "@/types/warehouse";

interface WarehouseAlert {
  type: "critical" | "warning";
  title: string;
  orderId: string;
  orderCode: string | null;
  customerName: string;
  daysUntilPosa: number;
  expectedDate: string;
  itemsCount: number;
}

interface WarehouseAlertsProps {
  items: WarehouseItem[];
}

function calculateAlerts(items: WarehouseItem[]): WarehouseAlert[] {
  const alerts: WarehouseAlert[] = [];
  const today = new Date();

  // Group by order
  const orderGroups = new Map<string, { 
    orderId: string;
    orderCode: string | null;
    customerName: string;
    expectedDate: string | null;
    items: WarehouseItem[];
  }>();

  items.forEach((item) => {
    const orderId = item.order.id;
    if (!orderGroups.has(orderId)) {
      orderGroups.set(orderId, {
        orderId,
        orderCode: item.order.order_code,
        customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
        expectedDate: item.order.expected_date || item.order.work_start_date,
        items: [],
      });
    }
    orderGroups.get(orderId)!.items.push(item);
  });

  orderGroups.forEach((group) => {
    const notReadyItems = group.items.filter(
      (i) => i.status === "da_ordinare" || i.status === "ordinato"
    );

    if (group.expectedDate && notReadyItems.length > 0) {
      const expectedDate = new Date(group.expectedDate);
      const daysUntil = differenceInDays(expectedDate, today);

      if (daysUntil <= 7 && daysUntil >= 0) {
        alerts.push({
          type: daysUntil <= 3 ? "critical" : "warning",
          title: daysUntil === 0 
            ? "OGGI" 
            : daysUntil === 1 
              ? "Domani" 
              : `${daysUntil}g`,
          orderId: group.orderId,
          orderCode: group.orderCode,
          customerName: group.customerName,
          daysUntilPosa: daysUntil,
          expectedDate: group.expectedDate,
          itemsCount: notReadyItems.length,
        });
      }
    }
  });

  return alerts.sort((a, b) => a.daysUntilPosa - b.daysUntilPosa);
}

export default function WarehouseAlerts({ items }: WarehouseAlertsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const alerts = calculateAlerts(items);

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.type === "critical").length;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM", { locale: it });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div 
        className={cn(
          "flex items-center justify-between p-3 rounded-lg border transition-colors",
          criticalCount > 0 
            ? "bg-destructive/10 border-destructive/30" 
            : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
        )}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className={cn(
            "h-4 w-4",
            criticalCount > 0 ? "text-destructive" : "text-amber-600"
          )} />
          <span className="text-sm font-medium">
            {alerts.length} {alerts.length === 1 ? "avviso" : "avvisi"}
            {criticalCount > 0 && (
              <span className="text-destructive ml-1">
                ({criticalCount} {criticalCount === 1 ? "urgente" : "urgenti"})
              </span>
            )}
          </span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            {isOpen ? "Nascondi" : "Mostra"}
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )} />
          </Button>
        </CollapsibleTrigger>
      </div>
      
      <CollapsibleContent className="mt-2 space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.orderId}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border text-sm",
              alert.type === "critical"
                ? "bg-destructive/5 border-destructive/20"
                : "bg-amber-50/50 border-amber-200/50 dark:bg-amber-950/10"
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn(
                "font-bold text-xs px-2 py-0.5 rounded",
                alert.type === "critical" 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-amber-500 text-white"
              )}>
                {alert.title}
              </span>
              <span className="font-medium">
                {alert.orderCode || "Ordine"} - {alert.customerName}
              </span>
              <span className="text-muted-foreground">
                {alert.itemsCount} articoli • {formatDate(alert.expectedDate)}
              </span>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/azienda/ordini/${alert.orderId}`}>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
