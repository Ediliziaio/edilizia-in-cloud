import { AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBlockedOrders } from "@/hooks/useMagazzinoLive";
import { useNavigate } from "react-router-dom";

export default function BlockedOrdersPanel() {
  const { data: blockedOrders = [], isLoading } = useBlockedOrders();
  const navigate = useNavigate();

  if (isLoading || blockedOrders.length === 0) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Ordini a Rischio Blocco
          <Badge variant="destructive" className="ml-auto">{blockedOrders.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {blockedOrders.slice(0, 5).map((order) => (
          <div
            key={order.order_id}
            className="flex items-center justify-between p-2 rounded-md bg-background/80 border text-sm"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {order.order_code ?? "Senza codice"} — {order.customer_name}
              </div>
              <div className="text-xs text-muted-foreground">
                Posa: {order.expected_date ? format(new Date(order.expected_date), "d MMM yyyy", { locale: it }) : "N/D"}
                {" · "}
                <span className="text-destructive font-medium">{order.missing_items}/{order.total_items} mancanti</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              onClick={() => navigate(`/azienda/ordini/${order.order_id}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {blockedOrders.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{blockedOrders.length - 5} altri ordini a rischio
          </p>
        )}
      </CardContent>
    </Card>
  );
}
