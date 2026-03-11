import { useState } from "react";
import { AlertTriangle, Truck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useBlockedOrders, ORDER_ITEM_STATUS_CONFIG } from "@/hooks/useMagazzinoLive";
import { useNavigate } from "react-router-dom";

interface Props {
  companyId: string;
  compact?: boolean;
  minimal?: boolean;
}

const urgencyConfig = {
  critica: { label: "Critica", className: "bg-red-100 text-red-800 border-red-300" },
  alta: { label: "Alta", className: "bg-amber-100 text-amber-800 border-amber-300" },
  normale: { label: "Normale", className: "bg-blue-100 text-blue-800 border-blue-300" },
};

function BlockedOrdersFull({ companyId }: { companyId: string }) {
  const { data: blocked = [], isLoading } = useBlockedOrders(companyId);
  const navigate = useNavigate();

  if (isLoading) return <p className="text-sm text-muted-foreground py-4 text-center">Analisi blocchi materiali...</p>;
  if (blocked.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Nessun ordine bloccato</p>;

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {blocked.map((order) => (
        <div
          key={order.order_id}
          className="p-2 rounded-md bg-background border text-sm cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate(`/azienda/ordini/${order.order_id}`)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate flex items-center gap-2">
                {order.order_code ?? order.order_id.slice(0, 8)} — {order.customer_name}
                <Badge className={`text-[10px] ${urgencyConfig[order.urgency_level].className}`}>
                  {urgencyConfig[order.urgency_level].label}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                {order.work_start_date && (
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    Inizio lavori: {new Date(order.work_start_date).toLocaleDateString("it-IT")}
                  </span>
                )}
                <Badge variant="outline" className="text-xs shrink-0">
                  {order.blocking_items_count} mancant{order.blocking_items_count === 1 ? "e" : "i"}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
          {order.missing_items.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {order.missing_items.slice(0, 4).map((item) => {
                const cfg = ORDER_ITEM_STATUS_CONFIG[item.status];
                return (
                  <span key={item.item_id} className={`text-[10px] px-1.5 py-0.5 rounded ${cfg?.bgColor} ${cfg?.color}`}>
                    {item.name.length > 20 ? item.name.slice(0, 20) + "…" : item.name} — {cfg?.label}
                  </span>
                );
              })}
              {order.missing_items.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{order.missing_items.length - 4} altri</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BlockedOrdersPanel({ companyId, compact = false, minimal = false }: Props) {
  const { data: blocked = [], isLoading } = useBlockedOrders(companyId);
  const [open, setOpen] = useState(false);

  if (minimal) {
    const count = blocked.length;
    return (
      <>
        <button
          onClick={() => count > 0 && setOpen(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            count > 0
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-default"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {isLoading ? "…" : count > 0 ? `${count} ordini bloccati` : "Nessun blocco"}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Ordini Bloccati — Materiali Mancanti
              </DialogTitle>
              <DialogDescription>
                {count} ordini bloccati per mancanza materiali
              </DialogDescription>
            </DialogHeader>
            <BlockedOrdersFull companyId={companyId} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full card mode (legacy)
  const navigate = useNavigate();

  if (isLoading) return (
    <Card><CardContent className="py-4 text-center text-sm text-muted-foreground">Analisi blocchi materiali...</CardContent></Card>
  );

  if (blocked.length === 0) return (
    <Card><CardContent className="py-4 text-center text-sm text-muted-foreground">Nessun ordine bloccato per mancanza materiali</CardContent></Card>
  );

  const critici = blocked.filter((o) => o.urgency_level === "critica").length;
  const alti = blocked.filter((o) => o.urgency_level === "alta").length;
  const displayed = compact ? blocked.slice(0, 5) : blocked;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Ordini Bloccati — Materiali Mancanti
          <Badge variant="destructive" className="ml-auto">{blocked.length}</Badge>
        </CardTitle>
        <div className="flex gap-2 text-xs">
          {critici > 0 && <span className="text-red-700 font-medium">{critici} critici</span>}
          {alti > 0 && <span className="text-amber-700 font-medium">{alti} urgenti</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayed.map((order) => (
          <div
            key={order.order_id}
            className="p-2 rounded-md bg-background/80 border text-sm cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigate(`/azienda/ordini/${order.order_id}`)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {order.order_code ?? order.order_id.slice(0, 8)} — {order.customer_name}
                  <Badge className={`text-[10px] ${urgencyConfig[order.urgency_level].className}`}>
                    {urgencyConfig[order.urgency_level].label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  {order.work_start_date && (
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      Inizio lavori: {new Date(order.work_start_date).toLocaleDateString("it-IT")}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs shrink-0">
                    {order.blocking_items_count} mancant{order.blocking_items_count === 1 ? "e" : "i"}
                  </Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            {!compact && order.missing_items.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {order.missing_items.slice(0, 4).map((item) => {
                  const cfg = ORDER_ITEM_STATUS_CONFIG[item.status];
                  return (
                    <span key={item.item_id} className={`text-[10px] px-1.5 py-0.5 rounded ${cfg?.bgColor} ${cfg?.color}`}>
                      {item.name.length > 20 ? item.name.slice(0, 20) + "…" : item.name} — {cfg?.label}
                    </span>
                  );
                })}
                {order.missing_items.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{order.missing_items.length - 4} altri</span>
                )}
              </div>
            )}
          </div>
        ))}
        {compact && blocked.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{blocked.length - 5} ordini bloccati
          </p>
        )}
      </CardContent>
    </Card>
  );
}
