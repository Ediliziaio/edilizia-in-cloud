import { format } from "date-fns";
import { it } from "date-fns/locale";
import { History, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrderMaterialsHistory } from "@/hooks/useMagazzinoLive";

interface Props {
  orderId: string;
}

export default function OrderMaterialsHistory({ orderId }: Props) {
  const { data: movements = [], isLoading } = useOrderMaterialsHistory(orderId);

  if (isLoading) return null;
  if (movements.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nessun movimento materiali per questo ordine.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Storico Movimenti Materiali
          <Badge variant="secondary" className="ml-auto">{movements.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {movements.map((m) => {
            const isIn = m.movement_type === "carico";
            return (
              <div key={m.movement_id} className="flex items-start gap-3 p-2 rounded-md border text-sm">
                {isIn ? (
                  <ArrowDownCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.stock_item_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.movement_type} · {m.quantity} pz
                    {m.lot_number && ` · Lotto: ${m.lot_number}`}
                    {m.notes && ` · ${m.notes}`}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(m.created_at), "d MMM HH:mm", { locale: it })}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
