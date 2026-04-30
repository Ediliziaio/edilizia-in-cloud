import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  /** id magazzino selezionato in UI; null = tutti i magazzini visibili via RLS. */
  warehouseFilter: string | null;
  onRegisterArrival?: () => void;
}

interface DDTRow {
  id: string;
  numero_ddt: string;
  data_ricezione: string;
  stato: "attesa" | "parziale" | "ricevuto" | string;
  quantita_ricevuta: number | null;
  warehouse_id: string | null;
  purchase_order_id: string;
  note: string | null;
  warehouse: { name: string } | null;
  purchase_order: { oda_number: string | null; supplier_id: string | null } | null;
}

const STATO_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ricevuto: "default",
  parziale: "secondary",
  attesa: "outline",
};

/**
 * Tab "DDT" dentro la pagina Warehouse.tsx.
 *
 * Mostra i documenti DDT di ricezione visibili all'utente corrente.
 * RLS applica già il filtro (`ddt_ricezione_scoped_access`):
 *  - company_admin: tutti i DDT della company
 *  - magazziniere: solo i DDT dei propri magazzini
 *
 * Il filtro `warehouseFilter` è solo UI (restrizione locale sopra quello RLS).
 */
export function WarehouseDDTTab({ warehouseFilter, onRegisterArrival }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const {
    data: ddts = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<DDTRow[]>({
    queryKey: ["ddt-ricezione", companyId, warehouseFilter],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("ddt_ricezione")
        .select(`
          id, numero_ddt, data_ricezione, stato, quantita_ricevuta,
          warehouse_id, purchase_order_id, note,
          warehouse:warehouses (name),
          purchase_order:purchase_orders (oda_number, supplier_id)
        `)
        .eq("company_id", companyId!)
        .order("data_ricezione", { ascending: false });

      if (warehouseFilter) {
        q = q.eq("warehouse_id", warehouseFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DDTRow[];
    },
  });

  if (isLoading) {
    return (
      <p
        className="text-muted-foreground text-center py-8"
        role="status"
        aria-live="polite"
      >
        Caricamento DDT…
      </p>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent
          className="py-10 flex flex-col items-center gap-3 text-center"
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle
            className="h-10 w-10 text-destructive/70"
            aria-hidden="true"
          />
          <p className="text-sm text-destructive">
            Errore nel caricamento dei DDT. Riprova tra qualche secondo.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (ddts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <FileText
            className="h-12 w-12 mx-auto text-muted-foreground/40"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">Nessun DDT di ricezione registrato.</p>
          <p className="text-xs text-muted-foreground">
            I DDT compaiono qui quando ricevi merce su un ordine di acquisto.
          </p>
          {onRegisterArrival && (
            <Button className="mt-3" onClick={onRegisterArrival}>
              Registra arrivo merce
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {ddts.map((d) => {
        const badgeVariant = STATO_BADGE[d.stato] ?? "outline";
        const qta = typeof d.quantita_ricevuta === "number" ? d.quantita_ricevuta : 0;
        return (
          <Card key={d.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">DDT {d.numero_ddt}</span>
                  <Badge variant={badgeVariant}>{d.stato}</Badge>
                  {d.warehouse?.name && (
                    <span className="text-xs text-muted-foreground">
                      · {d.warehouse.name}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(new Date(d.data_ricezione), "dd MMM yyyy", { locale: it })}
                  {d.purchase_order?.oda_number &&
                    ` · ODA ${d.purchase_order.oda_number}`}
                  {qta > 0 && ` · Qtà ${qta}`}
                </div>
                {d.note && (
                  <p className="text-xs mt-1 text-muted-foreground line-clamp-1">
                    {d.note}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/azienda/ordini-acquisto/${d.purchase_order_id}`}
                    aria-label={`Apri ordine di acquisto collegato al DDT ${d.numero_ddt}`}
                  >
                    Apri ODA
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default WarehouseDDTTab;
