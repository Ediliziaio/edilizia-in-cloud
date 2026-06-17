import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, AlertTriangle, RefreshCw, ArrowDownToLine, Truck } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { formatCurrency } from "@/lib/formatters";

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

/** Stato → variante badge per i DDT in uscita (documenti_fiscali). */
const STATO_USCITA_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  emessa: "default",
  bozza: "outline",
  annullata: "destructive",
};

/**
 * Tab "DDT" dentro la pagina Warehouse.tsx, con due sezioni:
 *  - In entrata: DDT di ricezione (ddt_ricezione, da ordini di acquisto).
 *  - In uscita:  DDT emessi verso cantiere/cliente (documenti_fiscali tipo='ddt',
 *                generati da "Spedisci a cantiere" / Uscita merce).
 *
 * RLS applica già i filtri di visibilità su entrambe le sorgenti. Il filtro
 * `warehouseFilter` è solo UI e si applica ai soli DDT in entrata (i DDT in
 * uscita non sono legati a un magazzino nella tabella documenti_fiscali).
 */
export function WarehouseDDTTab({ warehouseFilter, onRegisterArrival }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // ── DDT in entrata (ricezione) ──────────────────────────────────────────
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

  // ── DDT in uscita (emessi) ──────────────────────────────────────────────
  const {
    data: usciteData,
    isLoading: isLoadingUscite,
    error: errorUscite,
    refetch: refetchUscite,
    isRefetching: isRefetchingUscite,
  } = useDocumentiFiscali({ tipo: "ddt", perPage: 100 });
  const uscite = usciteData?.documenti ?? [];

  return (
    <Tabs defaultValue="entrata" className="space-y-4">
      <TabsList>
        <TabsTrigger value="entrata" className="gap-1.5">
          <ArrowDownToLine className="h-4 w-4" />
          In entrata
          {ddts.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">{ddts.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="uscita" className="gap-1.5">
          <Truck className="h-4 w-4" />
          In uscita
          {uscite.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">{uscite.length}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* ───────────────── In entrata ───────────────── */}
      <TabsContent value="entrata" className="space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8" role="status" aria-live="polite">
            Caricamento DDT…
          </p>
        ) : error ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center" role="alert" aria-live="assertive">
              <AlertTriangle className="h-10 w-10 text-destructive/70" aria-hidden="true" />
              <p className="text-sm text-destructive">Errore nel caricamento dei DDT. Riprova tra qualche secondo.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
                Riprova
              </Button>
            </CardContent>
          </Card>
        ) : ddts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" aria-hidden="true" />
              <p className="text-muted-foreground">Nessun DDT di ricezione registrato.</p>
              <p className="text-xs text-muted-foreground">
                I DDT in entrata compaiono qui quando ricevi merce su un ordine di acquisto.
              </p>
              {onRegisterArrival && (
                <Button className="mt-3" onClick={onRegisterArrival}>
                  Registra arrivo merce
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          ddts.map((d) => {
            const badgeVariant = STATO_BADGE[d.stato] ?? "outline";
            const qta = typeof d.quantita_ricevuta === "number" ? d.quantita_ricevuta : 0;
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">DDT {d.numero_ddt}</span>
                      <Badge variant={badgeVariant}>{d.stato}</Badge>
                      {d.warehouse?.name && (
                        <span className="text-xs text-muted-foreground">· {d.warehouse.name}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(d.data_ricezione), "dd MMM yyyy", { locale: it })}
                      {d.purchase_order?.oda_number && ` · ODA ${d.purchase_order.oda_number}`}
                      {qta > 0 && ` · Qtà ${qta}`}
                    </div>
                    {d.note && (
                      <p className="text-xs mt-1 text-muted-foreground line-clamp-1">{d.note}</p>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 gap-1 sm:w-auto">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
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
          })
        )}
      </TabsContent>

      {/* ───────────────── In uscita ───────────────── */}
      <TabsContent value="uscita" className="space-y-3">
        {isLoadingUscite ? (
          <p className="text-muted-foreground text-center py-8" role="status" aria-live="polite">
            Caricamento DDT…
          </p>
        ) : errorUscite ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center" role="alert" aria-live="assertive">
              <AlertTriangle className="h-10 w-10 text-destructive/70" aria-hidden="true" />
              <p className="text-sm text-destructive">Errore nel caricamento dei DDT in uscita. Riprova tra qualche secondo.</p>
              <Button variant="outline" size="sm" onClick={() => refetchUscite()} disabled={isRefetchingUscite}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetchingUscite ? "animate-spin" : ""}`} aria-hidden="true" />
                Riprova
              </Button>
            </CardContent>
          </Card>
        ) : uscite.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" aria-hidden="true" />
              <p className="text-muted-foreground">Nessun DDT in uscita.</p>
              <p className="text-xs text-muted-foreground">
                I DDT in uscita si generano da “Spedisci a cantiere” / Uscita merce: lo scarico
                crea il DDT in bozza con le righe scansionate.
              </p>
            </CardContent>
          </Card>
        ) : (
          uscite.map((d) => {
            const badgeVariant = STATO_USCITA_BADGE[d.stato] ?? "outline";
            const dest = d.cliente_snapshot?.ragione_sociale;
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">DDT {d.numero}</span>
                      <Badge variant={badgeVariant}>{d.stato}</Badge>
                      {d.totale_documento > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {formatCurrency(d.totale_documento)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {d.data_emissione &&
                        format(new Date(d.data_emissione), "dd MMM yyyy", { locale: it })}
                      {dest && ` · ${dest}`}
                      {d.codice_commessa_convenzione && ` · ${d.codice_commessa_convenzione}`}
                    </div>
                    {d.note_documento && (
                      <p className="text-xs mt-1 text-muted-foreground line-clamp-1">{d.note_documento}</p>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 gap-1 sm:w-auto">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                      <a href={`/azienda/documenti/${d.id}`} aria-label={`Apri DDT ${d.numero}`}>
                        Apri DDT
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </TabsContent>
    </Tabs>
  );
}

export default WarehouseDDTTab;
