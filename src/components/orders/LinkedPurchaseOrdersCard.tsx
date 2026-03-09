import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Package, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { CreatePurchaseOrderButton } from "./CreatePurchaseOrderButton";

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza", inviato: "Inviato", confermato: "Confermato",
  parziale: "Parziale", ricevuto: "Ricevuto", annullato: "Annullato",
};

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confermato: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  parziale: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ricevuto: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  annullato: "bg-destructive/10 text-destructive",
};

interface OrderItem {
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
}

interface LinkedPurchaseOrdersCardProps {
  orderId: string;
  orderCode?: string | null;
  items: OrderItem[];
}

export function LinkedPurchaseOrdersCard({ orderId, orderCode, items }: LinkedPurchaseOrdersCardProps) {
  const { data: linkedPOs = [], isLoading } = useQuery({
    queryKey: ["linked-purchase-orders", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, suppliers(name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        oda_number: string;
        status: string;
        total: number;
        suppliers: { name: string } | null;
      }>;
    },
    enabled: !!orderId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" /> OdA Collegati
        </CardTitle>
        <CreatePurchaseOrderButton orderId={orderId} orderCode={orderCode} items={items} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : linkedPOs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun ordine d'acquisto collegato.</p>
        ) : (
          <div className="space-y-3">
            {linkedPOs.map((po) => (
              <Link
                key={po.id}
                to={`/azienda/ordini-acquisto/${po.id}`}
                className="flex items-center justify-between p-2 rounded-md border hover:bg-accent transition-colors group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{po.oda_number}</span>
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[po.status] || ""}`}>
                      {STATUS_LABELS[po.status] || po.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{po.suppliers?.name || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(Number(po.total))}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
