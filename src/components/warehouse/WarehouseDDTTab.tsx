import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, AlertTriangle, RefreshCw, ArrowDownToLine, Truck, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { useBillingMode } from "@/contexts/BillingModeContext";
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

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? "—" : format(parsed, "dd MMM yyyy", { locale: it });
}

/**
 * Tab "DDT" dentro la pagina Warehouse.tsx, con due sezioni a tabella:
 *  - In entrata: DDT di ricezione (ddt_ricezione, da ordini di acquisto).
 *  - In uscita:  DDT emessi verso cantiere/cliente (documenti_fiscali tipo='ddt',
 *                generati da "Spedisci a cantiere" / Uscita merce).
 *
 * RLS applica già i filtri di visibilità. Il filtro `warehouseFilter` è solo UI
 * e si applica ai soli DDT in entrata (i DDT in uscita non sono legati a un
 * magazzino nella tabella documenti_fiscali).
 *
 * "Apri" usa la navigazione SPA (useNavigate) per evitare reload completi:
 *  - entrata → ordine di acquisto collegato
 *  - uscita  → editor documento (/azienda/documenti/:id), stessa rotta usata
 *              dal flusso "Spedisci a cantiere" alla generazione del DDT.
 */
export function WarehouseDDTTab({ warehouseFilter, onRegisterArrival }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  // DDT in uscita: il PDF si genera dal record documenti_fiscali e funziona in
  // QUALSIASI modalità fatturazione (l'editor /azienda/documenti/:id è invece
  // riservato alla modalità "native" — su aziende "external" redirige).
  const { generate: generateDDT, isGenerating } = useShipmentDDTPDF();
  const { isNative } = useBillingMode();

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
      <TabsContent value="entrata">
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
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° DDT</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>ODA</TableHead>
                    <TableHead>Magazzino</TableHead>
                    <TableHead className="text-center">Qtà</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ddts.map((d) => {
                    const qta = typeof d.quantita_ricevuta === "number" ? d.quantita_ricevuta : 0;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {d.numero_ddt}
                          {d.note && (
                            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">{d.note}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATO_BADGE[d.stato] ?? "outline"}>{d.stato}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {fmtDate(d.data_ricezione)}
                        </TableCell>
                        <TableCell className="text-sm">{d.purchase_order?.oda_number ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.warehouse?.name ?? "—"}</TableCell>
                        <TableCell className="text-center">{qta > 0 ? qta : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/azienda/ordini-acquisto/${d.purchase_order_id}`)}
                            aria-label={`Apri ordine di acquisto collegato al DDT ${d.numero_ddt}`}
                          >
                            Apri ODA
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </TabsContent>

      {/* ───────────────── In uscita ───────────────── */}
      <TabsContent value="uscita">
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
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° DDT</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Commessa</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uscite.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.numero}
                        {d.note_documento && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">{d.note_documento}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATO_USCITA_BADGE[d.stato] ?? "outline"}>{d.stato}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDate(d.data_emissione)}
                      </TableCell>
                      <TableCell className="text-sm">{d.cliente_snapshot?.ragione_sociale ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.codice_commessa_convenzione ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.totale_documento)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateDDT(d.id)}
                            disabled={isGenerating}
                            aria-label={`Scarica PDF del DDT ${d.numero}`}
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
                            ) : (
                              <Download className="h-3.5 w-3.5 sm:mr-1.5" />
                            )}
                            <span className="hidden sm:inline">Scarica DDT</span>
                          </Button>
                          {isNative && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/azienda/documenti/${d.id}`)}
                              aria-label={`Apri DDT ${d.numero} nell'editor`}
                            >
                              Apri
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default WarehouseDDTTab;
