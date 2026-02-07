import { Link } from "react-router-dom";
import { differenceInDays } from "date-fns";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Truck, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  updated_at?: string | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    warehouse_arrival_date?: string | null;
    company_id: string;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

interface WarehouseAlert {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  items: WarehouseItem[];
  orderId: string;
  orderCode: string | null;
  customerName: string;
  daysUntilPosa?: number;
  expectedDate?: string;
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
            ? "Posa OGGI!" 
            : daysUntil === 1 
              ? "Posa domani" 
              : `Posa tra ${daysUntil} giorni`,
          description: `${notReadyItems.length} articoli non ancora pronti`,
          items: notReadyItems,
          orderId: group.orderId,
          orderCode: group.orderCode,
          customerName: group.customerName,
          daysUntilPosa: daysUntil,
          expectedDate: group.expectedDate,
        });
      }
    }
  });

  return alerts.sort((a, b) => (a.daysUntilPosa ?? 999) - (b.daysUntilPosa ?? 999));
}

export default function WarehouseAlerts({ items }: WarehouseAlertsProps) {
  const alerts = calculateAlerts(items);

  if (alerts.length === 0) return null;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM", { locale: it });
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <Alert
          key={`${alert.orderId}-${index}`}
          variant={alert.type === "critical" ? "destructive" : "default"}
          className={
            alert.type === "critical"
              ? "border-destructive/50 bg-destructive/10"
              : alert.type === "warning"
              ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20"
              : ""
          }
        >
          {alert.type === "critical" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Truck className="h-4 w-4" />
          )}
          <AlertTitle className="flex items-center justify-between">
            <span>
              {alert.type === "critical" ? "⚠️ URGENTE: " : "⏰ ATTENZIONE: "}
              {alert.title}
            </span>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span>
                  <strong>{alert.orderCode || "Ordine"}</strong> ({alert.customerName})
                  {alert.expectedDate && (
                    <span className="ml-2 text-muted-foreground">
                      - Posa il {formatDate(alert.expectedDate)}
                    </span>
                  )}
                </span>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/azienda/ordini/${alert.orderId}`}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Vai all'ordine
                  </Link>
                </Button>
              </div>
              <div className="text-sm">
                Articoli: {alert.items.map((i) => i.name).join(", ")}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
