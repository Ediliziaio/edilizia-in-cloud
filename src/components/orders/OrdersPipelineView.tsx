import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { OrdersPipelineColumn } from "./OrdersPipelineColumn";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type OrderWithDetails, type OrderStatus } from "@/lib/orderUtils";

interface OrdersPipelineViewProps {
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
  onStatusChange?: (orderId: string, newStatusId: string) => Promise<void>;
}

export function OrdersPipelineView({ orders, statuses, onStatusChange }: OrdersPipelineViewProps) {
  const [activeOrder, setActiveOrder] = useState<OrderWithDetails | null>(null);

  // Sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = orders.find(o => o.id === active.id);
    if (order) {
      setActiveOrder(order);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOrder(null);
    
    if (!over) return;

    const orderId = active.id as string;
    const newStatusId = over.id as string;
    
    // Trova l'ordine corrente
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Se lo stato è lo stesso, non fare nulla
    if (order.current_status_id === newStatusId) return;

    // Verifica che lo stato di destinazione sia valido
    const isValidStatus = statuses.some(s => s.id === newStatusId);
    if (!isValidStatus) return;

    // Chiama il callback per aggiornare lo stato
    if (onStatusChange) {
      await onStatusChange(orderId, newStatusId);
    }
  };

  const handleDragCancel = () => {
    setActiveOrder(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {/* Colonne per ogni stato */}
        {statuses.map(status => (
          <OrdersPipelineColumn 
            key={status.id}
            status={status}
            orders={ordersByStatus[status.id] || []}
            isDragEnabled={!!onStatusChange}
          />
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
                  <OrdersPipelineCard 
                    key={order.id} 
                    order={order} 
                    isDraggable={false}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Drag Overlay - mostra la card durante il trascinamento */}
      <DragOverlay>
        {activeOrder ? (
          <div className="w-[260px]">
            <OrdersPipelineCard order={activeOrder} isDraggable={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
