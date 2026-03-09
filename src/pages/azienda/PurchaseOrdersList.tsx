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
import { Package, Plus, Loader2, Search, Truck } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";

const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800",
  confermato: "bg-emerald-100 text-emerald-800",
  parziale: "bg-amber-100 text-amber-800",
  ricevuto: "bg-green-100 text-green-800",
  annullato: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  confermato: "Confermato",
  parziale: "Parziale",
  ricevuto: "Ricevuto",
  annullato: "Annullato",
};

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { orders, isLoading, create } = usePurchaseOrders();
  const { suppliers } = useOperationalSuppliers();
  const [tab, setTab] = useState("tutti");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newDelivery, setNewDelivery] = useState("");

  const filtered = useMemo(() => {
    let list = orders;
    if (tab === "attivi") list = list.filter((o) => !["annullato", "ricevuto"].includes(o.status));
    else if (tab === "ricevuti") list = list.filter((o) => o.status === "ricevuto");
    else if (tab === "annullati") list = list.filter((o) => o.status === "annullato");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.oda_number.toLowerCase().includes(q) ||
        o.suppliers?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, tab, search]);

  const counts = useMemo(() => ({
    tutti: orders.length,
    attivi: orders.filter((o) => !["annullato", "ricevuto"].includes(o.status)).length,
    ricevuti: orders.filter((o) => o.status === "ricevuto").length,
    annullati: orders.filter((o) => o.status === "annullato").length,
  }), [orders]);

  const kpis = useMemo(() => {
    const active = orders.filter((o) => !["annullato", "ricevuto"].includes(o.status));
    return {
      activeCount: active.length,
      activeTotal: active.reduce((s, o) => s + Number(o.total), 0),
      totalAll: orders.reduce((s, o) => s + Number(o.total), 0),
    };
  }, [orders]);

  const handleCreate = () => {
    if (!newSupplierId) return;
    create.mutate(
      { supplier_id: newSupplierId, expected_delivery_date: newDelivery || undefined },
      {
        onSuccess: (data: any) => {
          setNewOpen(false);
          setNewSupplierId("");
          setNewDelivery("");
          navigate(`/azienda/ordini-acquisto/${data.id}`);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Ordini d'Acquisto</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo OdA
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">OdA attivi</p>
          <p className="text-xl font-bold">{kpis.activeCount}</p>
          <p className="text-xs text-muted-foreground">{fmtEur(kpis.activeTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Totale OdA</p>
          <p className="text-xl font-bold">{orders.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Valore totale</p>
          <p className="text-xl font-bold">{fmtEur(kpis.totalAll)}</p>
        </CardContent></Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="tutti">Tutti ({counts.tutti})</TabsTrigger>
            <TabsTrigger value="attivi">Attivi ({counts.attivi})</TabsTrigger>
            <TabsTrigger value="ricevuti">Ricevuti ({counts.ricevuti})</TabsTrigger>
            <TabsTrigger value="annullati">Annullati</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca OdA..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessun ordine d'acquisto trovato.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">N° OdA</th>
              <th className="text-left p-3 font-medium">Fornitore</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Stato</th>
              <th className="text-right p-3 font-medium">Totale</th>
              <th className="text-left p-3 font-medium">Consegna</th>
            </tr></thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className={`border-b hover:bg-muted/30 cursor-pointer ${o.status === "annullato" ? "opacity-50" : ""}`}
                  onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
                >
                  <td className="p-3 font-mono text-xs font-medium">{o.oda_number}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                      {o.suppliers?.name || "—"}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</td>
                  <td className="p-3">
                    <Badge className={`text-xs ${STATUS_COLORS[o.status] || ""}`}>
                      {STATUS_LABELS[o.status] || o.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-medium">{fmtEur(Number(o.total))}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {o.expected_delivery_date ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New OdA Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuovo Ordine d'Acquisto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fornitore</Label>
              <Select value={newSupplierId} onValueChange={setNewSupplierId}>
                <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data consegna prevista (opzionale)</Label>
              <Input type="date" value={newDelivery} onChange={(e) => setNewDelivery(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!newSupplierId || create.isPending}>
              {create.isPending ? "Creazione..." : "Crea OdA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
