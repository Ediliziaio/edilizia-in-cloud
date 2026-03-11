import { History, ArrowDown, ArrowUp, RotateCcw, Bookmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrderMaterialsHistory } from "@/hooks/useMagazzinoLive";

interface Props {
  companyId: string;
  orderId: string;
}

const MOVEMENT_CONFIG: Record<string, { label: string; icon: typeof ArrowDown; color: string; bg: string }> = {
  carico: { label: "Carico", icon: ArrowDown, color: "text-green-700", bg: "bg-green-50" },
  scarico: { label: "Scarico", icon: ArrowUp, color: "text-red-700", bg: "bg-red-50" },
  scarico_automatico: { label: "Scarico automatico", icon: ArrowUp, color: "text-orange-700", bg: "bg-orange-50" },
  prenotazione: { label: "Prenotazione", icon: Bookmark, color: "text-blue-700", bg: "bg-blue-50" },
  rilascio: { label: "Rilascio", icon: RotateCcw, color: "text-purple-700", bg: "bg-purple-50" },
  rettifica: { label: "Rettifica", icon: RotateCcw, color: "text-gray-700", bg: "bg-gray-50" },
  reso_fornitore: { label: "Reso fornitore", icon: ArrowUp, color: "text-yellow-700", bg: "bg-yellow-50" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

export default function OrderMaterialsHistory({ companyId, orderId }: Props) {
  const { data: movements = [], isLoading } = useOrderMaterialsHistory(companyId, orderId);

  if (isLoading) return (
    <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Caricamento storico...</CardContent></Card>
  );

  if (movements.length === 0) return (
    <Card>
      <CardContent className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <History className="h-4 w-4" /> Nessun movimento materiali per questa commessa
      </CardContent>
    </Card>
  );

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
          {movements.map((mov) => {
            const cfg = MOVEMENT_CONFIG[mov.movement_type] ?? MOVEMENT_CONFIG.carico;
            const Icon = cfg.icon;
            const isOut = ["scarico", "scarico_automatico", "reso_fornitore"].includes(mov.movement_type);

            return (
              <div key={mov.movement_id} className={`flex items-start gap-3 p-2 rounded-md border text-sm ${cfg.bg}`}>
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{mov.stock_item_name ?? "Articolo rimosso"}</span>
                    <Badge variant="outline" className={`text-xs ${cfg.color} border-current`}>
                      {cfg.label}
                    </Badge>
                    {mov.lot_number && (
                      <span className="text-[10px] text-muted-foreground">Lotto: {mov.lot_number}</span>
                    )}
                  </div>
                  {mov.order_item_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">Articolo commessa: {mov.order_item_name}</p>
                  )}
                  {mov.notes && <p className="text-xs text-muted-foreground mt-0.5">{mov.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono text-sm ${isOut ? "text-red-600" : "text-green-600"}`}>
                    {isOut ? "-" : "+"}{mov.quantity} pz
                  </div>
                  {mov.unit_cost && (
                    <div className="text-[10px] text-muted-foreground">{fmt(mov.unit_cost * mov.quantity)}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(mov.created_at).toLocaleDateString("it-IT", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  {mov.performed_by_name && (
                    <div className="text-[10px] text-muted-foreground">{mov.performed_by_name}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
