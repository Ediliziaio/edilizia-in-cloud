import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StockItem } from "@/types/warehouse";

interface StockMovementHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
}

export function StockMovementHistoryDialog({
  open,
  onOpenChange,
  item,
}: StockMovementHistoryDialogProps) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock-movements", item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase
        .from("warehouse_movements")
        .select(`
          id, movement_type, quantity, notes, created_at, performed_by,
          order_item_id
        `)
        .eq("stock_item_id", item.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch linked order info for movements with order_item_id
      const orderItemIds = data
        .filter((m) => m.order_item_id)
        .map((m) => m.order_item_id!);

      let orderMap: Record<string, string> = {};
      if (orderItemIds.length > 0) {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("id, order_id, order:orders(order_code)")
          .in("id", orderItemIds);

        if (orderItems) {
          for (const oi of orderItems) {
            const orderCode = (oi as any).order?.order_code;
            orderMap[oi.id] = orderCode || oi.order_id.slice(0, 8);
          }
        }
      }

      return data.map((m) => ({
        ...m,
        orderCode: m.order_item_id ? orderMap[m.order_item_id] || "—" : null,
      }));
    },
    enabled: !!item && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico Movimenti: {item?.name}</DialogTitle>
          <DialogDescription>
            Tutti i movimenti di carico e scarico per questo articolo
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
        ) : movements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun movimento registrato per questo articolo.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Qtà</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Ordine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={m.movement_type === "carico" ? "default" : "destructive"}
                      className={
                        m.movement_type === "carico"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {m.movement_type === "carico" ? "Carico" : "Scarico"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {m.movement_type === "carico" ? "+" : "−"}{m.quantity}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {m.notes || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.orderCode || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
