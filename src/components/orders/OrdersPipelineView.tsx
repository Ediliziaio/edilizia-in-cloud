import { useMemo } from "react";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrderWithDetails {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  current_status_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
}

interface OrderStatus {
  id: string;
  name: string;
  color: string;
  position?: number;
}

interface OrdersPipelineViewProps {
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
}

export function OrdersPipelineView({ orders, statuses }: OrdersPipelineViewProps) {
  // Raggruppa ordini per stato
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, OrderWithDetails[]> = {};
    
    // Inizializza tutte le colonne (anche vuote)
    statuses.forEach(status => {
      grouped[status.id] = [];
    });
    
    // Colonna per ordini senza stato
    grouped["no-status"] = [];
    
    // Popola con ordini
    orders.forEach(order => {
      if (order.current_status_id && grouped[order.current_status_id]) {
        grouped[order.current_status_id].push(order);
      } else {
        grouped["no-status"].push(order);
      }
    });
    
    return grouped;
  }, [orders, statuses]);

  // Ordini senza stato assegnato
  const ordersWithoutStatus = ordersByStatus["no-status"] || [];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
      {/* Colonne per ogni stato */}
      {statuses.map(status => (
        <div 
          key={status.id} 
          className="flex-shrink-0 w-[280px] bg-muted/30 rounded-lg p-3"
        >
          {/* Header colonna */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: status.color }}
            />
            <h3 className="font-medium text-sm">{status.name}</h3>
            <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {ordersByStatus[status.id]?.length || 0}
            </span>
          </div>
          
          {/* Cards */}
          <ScrollArea className="h-[calc(100vh-350px)] pr-2">
            <div className="space-y-2">
              {ordersByStatus[status.id]?.map(order => (
                <OrdersPipelineCard key={order.id} order={order} />
              ))}
              
              {ordersByStatus[status.id]?.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Nessun ordine
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      ))}
      
      {/* Colonna per ordini senza stato (se ce ne sono) */}
      {ordersWithoutStatus.length > 0 && (
        <div className="flex-shrink-0 w-[280px] bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <h3 className="font-medium text-sm">Senza stato</h3>
            <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {ordersWithoutStatus.length}
            </span>
          </div>
          
          <ScrollArea className="h-[calc(100vh-350px)] pr-2">
            <div className="space-y-2">
              {ordersWithoutStatus.map(order => (
                <OrdersPipelineCard key={order.id} order={order} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
