// ============================================================================
// DDTRicezioneList — Vista globale dei DDT fornitori
// ----------------------------------------------------------------------------
// Pagina/componente tab usata dentro OrdersList.tsx accanto a "Ordini d'Acquisto".
// Mostra tutti i DDT dell'azienda con filtri stato/periodo/magazzino e collegamenti
// ai documenti correlati (ODA, Ordine cliente, Fornitore, Magazzino).
// ============================================================================

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FileCheck, Plus, Loader2, Search, Truck, Warehouse, FileText,
  ShoppingCart, ArrowRight, Package,
} from "lucide-react";
import { useDDTRicezioneList, useDDTRicezioneMutations, type DDTStato } from "@/hooks/useDDTRicezione";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";

const STATO_COLORS: Record<DDTStato, string> = {
  ricevuto: "bg-green-100 text-green-800",
  parziale: "bg-amber-100 text-amber-800",
  attesa: "bg-muted text-muted-foreground",
};

const STATO_LABELS: Record<DDTStato, string> = {
  ricevuto: "Ricevuto",
  parziale: "Parziale",
  attesa: "In attesa",
};

export default function DDTRicezioneList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"tutti" | DDTStato>("tutti");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newPoId, setNewPoId] = useState("");
  const [newNumero, setNewNumero] = useState("");
  const [newData, setNewData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newStato, setNewStato] = useState<DDTStato>("ricevuto");
  const [newQty, setNewQty] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");

  const { data: ddtList = [], isLoading } = useDDTRicezioneList();
  const { orders } = usePurchaseOrders();
  const { createDDT } = useDDTRicezioneMutations(newPoId || null);

  // Solo ODA non annullati possono ricevere nuovi DDT
  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders]
  );

  const filtered = useMemo(() => {
    let list = ddtList;
    if (tab !== "tutti") list = list.filter((d) => d.stato === tab);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => {
        const po = d.purchase_orders;
        return (
          d.numero_ddt.toLowerCase().includes(q) ||
          po?.oda_number?.toLowerCase().includes(q) ||
          po?.suppliers?.name?.toLowerCase().includes(q) ||
          po?.orders?.order_code?.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [ddtList, tab, search]);

  const counts = useMemo(
    () => ({
      tutti: ddtList.length,
      ricevuto: ddtList.filter((d) => d.stato === "ricevuto").length,
      parziale: ddtList.filter((d) => d.stato === "parziale").length,
      attesa: ddtList.filter((d) => d.stato === "attesa").length,
    }),
    [ddtList]
  );

  const kpis = useMemo(() => {
    const totalQty = ddtList.reduce((s, d) => s + Number(d.quantita_ricevuta || 0), 0);
    const ricevuti = ddtList.filter((d) => d.stato === "ricevuto").length;
    const pct = ddtList.length > 0 ? Math.round((ricevuti / ddtList.length) * 100) : 0;
    return {
      total: ddtList.length,
      totalQty: totalQty.toLocaleString("it-IT", { maximumFractionDigits: 2 }),
      ricevuti,
      pct,
    };
  }, [ddtList]);

  const resetNewForm = () => {
    setNewPoId("");
    setNewNumero("");
    setNewData(format(new Date(), "yyyy-MM-dd"));
    setNewStato("ricevuto");
    setNewQty("");
    setNewWarehouseId(null);
    setNewNote("");
  };

  const handleCreate = () => {
    if (!newPoId) return;
    if (!newNumero.trim()) return;

    createDDT.mutate(
      {
        purchase_order_id: newPoId,
        numero_ddt: newNumero.trim(),
        data_ricezione: newData,
        quantita_ricevuta: parseFloat(newQty) || 0,
        stato: newStato,
        note: newNote.trim() || null,
        warehouse_id: newWarehouseId,
      },
      {
        onSuccess: (data) => {
          setNewOpen(false);
          resetNewForm();
          if (data?.id) navigate(`/azienda/ddt/${data.id}`);
        },
      }
    );
  };

  // Se l'utente seleziona un ODA nel form, precompila il magazzino se noto
  const selectedPO = useMemo(
    () => availablePOs.find((o) => o.id === newPoId),
    [availablePOs, newPoId]
  );

  return (
    <div className="space-y-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileCheck className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold truncate">DDT Fornitori</h1>
        </div>
        <Button onClick={() => setNewOpen(true)} className="shrink-0" disabled={availablePOs.length === 0}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Nuovo DDT</span>
          <span className="sm:hidden ml-1">Nuovo</span>
        </Button>
      </div>

      {/* ─── KPI ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">DDT totali</p>
            <p className="text-xl font-bold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">DDT ricevuti</p>
            <p className="text-xl font-bold">{kpis.ricevuti}</p>
            <p className="text-xs text-muted-foreground">{kpis.pct}% completi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Quantità totali</p>
            <p className="text-xl font-bold">{kpis.totalQty}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">In attesa / Parziale</p>
            <p className="text-xl font-bold">{counts.attesa + counts.parziale}</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filtri ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "tutti" | DDTStato)} className="flex-1">
          <TabsList className="flex flex-nowrap h-auto gap-1 p-1 w-full justify-start overflow-x-auto scrollbar-none">
            <TabsTrigger value="tutti" className="shrink-0">Tutti ({counts.tutti})</TabsTrigger>
            <TabsTrigger value="ricevuto" className="shrink-0">Ricevuti ({counts.ricevuto})</TabsTrigger>
            <TabsTrigger value="parziale" className="shrink-0">Parziali ({counts.parziale})</TabsTrigger>
            <TabsTrigger value="attesa" className="shrink-0">In attesa ({counts.attesa})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca DDT, ODA, fornitore..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* ─── List ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">
            {search || tab !== "tutti" ? "Nessun DDT trovato" : "Nessun DDT registrato"}
          </p>
          <p className="text-sm text-muted-foreground">
            {search || tab !== "tutti"
              ? "Prova a cambiare i filtri o i termini di ricerca."
              : "Registra il primo DDT per tracciare le ricezioni merce dai fornitori."}
          </p>
          {availablePOs.length > 0 && !search && tab === "tutti" && (
            <Button onClick={() => setNewOpen(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Registra primo DDT
            </Button>
          )}
          {availablePOs.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              Crea prima un Ordine d'Acquisto per poter registrare un DDT.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y border rounded-lg">
            {filtered.map((ddt) => {
              const po = ddt.purchase_orders;
              return (
                <div
                  key={ddt.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted cursor-pointer"
                  onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-medium">{ddt.numero_ddt}</span>
                      <Badge className={`text-xs ${STATO_COLORS[ddt.stato]}`}>
                        {STATO_LABELS[ddt.stato]}
                      </Badge>
                    </div>
                    {po && (
                      <div className="text-sm font-medium mt-0.5 flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{po.suppliers?.name || "—"}</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}</span>
                      {po?.oda_number && (
                        <span className="inline-flex items-center gap-0.5 text-primary">
                          <ShoppingCart className="h-3 w-3" /> {po.oda_number}
                        </span>
                      )}
                      {po?.orders?.order_code && (
                        <span className="inline-flex items-center gap-0.5 text-primary">
                          <FileText className="h-3 w-3" /> {po.orders.order_code}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-semibold text-sm">{Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                    <p className="text-[10px] text-muted-foreground">unità</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">N° DDT</th>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Fornitore</th>
                  <th className="text-left p-3 font-medium">ODA</th>
                  <th className="text-left p-3 font-medium">Ordine</th>
                  <th className="text-left p-3 font-medium">Magazzino</th>
                  <th className="text-right p-3 font-medium">Quantità</th>
                  <th className="text-left p-3 font-medium">Stato</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ddt) => {
                  const po = ddt.purchase_orders;
                  return (
                    <tr
                      key={ddt.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                    >
                      <td className="p-3 font-mono text-xs font-medium">{ddt.numero_ddt}</td>
                      <td className="p-3 text-muted-foreground">
                        {format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[180px]">{po?.suppliers?.name || "—"}</span>
                        </div>
                      </td>
                      <td
                        className="p-3 text-xs"
                        onClick={(e) => {
                          if (!po?.id) return;
                          e.stopPropagation();
                          navigate(`/azienda/ordini-acquisto/${po.id}`);
                        }}
                      >
                        {po?.oda_number ? (
                          <span className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
                            <ShoppingCart className="h-3 w-3" />
                            {po.oda_number}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td
                        className="p-3 text-xs"
                        onClick={(e) => {
                          if (!po?.orders?.id) return;
                          e.stopPropagation();
                          navigate(`/azienda/ordini/${po.orders.id}`);
                        }}
                      >
                        {po?.orders?.order_code ? (
                          <span className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
                            <FileText className="h-3 w-3" />
                            {po.orders.order_code}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {ddt.warehouses?.name ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Warehouse className="h-3 w-3" />
                            {ddt.warehouses.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        <Badge className={`text-xs ${STATO_COLORS[ddt.stato]}`}>
                          {STATO_LABELS[ddt.stato]}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── New DDT Dialog ──────────────────────────────────────── */}
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
          if (!o) resetNewForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              Nuovo DDT Fornitore
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Ordine di Acquisto *</Label>
              <Select value={newPoId} onValueChange={setNewPoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ODA..." />
                </SelectTrigger>
                <SelectContent>
                  {availablePOs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-mono text-xs">{o.oda_number}</span>
                      {" · "}
                      {o.suppliers?.name || "—"}
                      {o.orders?.order_code ? ` · ${o.orders.order_code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPO && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Package className="h-3 w-3" />
                  Stato ODA: <strong>{selectedPO.status}</strong>
                  {selectedPO.expected_delivery_date && (
                    <span>
                      · consegna prevista{" "}
                      {format(new Date(selectedPO.expected_delivery_date), "dd/MM/yyyy", { locale: it })}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Numero DDT *</Label>
              <Input
                value={newNumero}
                onChange={(e) => setNewNumero(e.target.value)}
                placeholder="es. DDT-2024-001"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data ricezione</Label>
                <Input type="date" value={newData} onChange={(e) => setNewData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Quantità ricevuta</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Stato</Label>
                <Select value={newStato} onValueChange={(v) => setNewStato(v as DDTStato)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ricevuto">Ricevuto completo</SelectItem>
                    <SelectItem value="parziale">Parziale</SelectItem>
                    <SelectItem value="attesa">In attesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Magazzino</Label>
                <WarehouseSelect
                  value={newWarehouseId}
                  onChange={setNewWarehouseId}
                  placeholder="Default"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea
                rows={2}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Opzionale"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewOpen(false);
                resetNewForm();
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newPoId || !newNumero.trim() || createDDT.isPending}
            >
              {createDDT.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registra DDT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
