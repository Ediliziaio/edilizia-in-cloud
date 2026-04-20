// ============================================================================
// DDTRicezioneDetail — Dettaglio DDT con collegamenti e ricezione per articolo
// ----------------------------------------------------------------------------
// Mostra:
//   - header DDT (numero, data, stato, quantità)
//   - Link cross-entity: ODA · Ordine Cliente · Fornitore · Magazzino
//   - goods_receipts già registrate con questo DDT (aggiorna warehouse_stock)
//   - articoli ODA pendenti di ricezione con quick-add goods_receipt
// ============================================================================

import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileCheck, Loader2, Truck, ShoppingCart, FileText, Warehouse,
  Package, Plus, CheckCircle2, Trash2, Edit3, Save, X, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDDTRicezioneDetail,
  useDDTRicezioneMutations,
  type DDTStato,
} from "@/hooks/useDDTRicezione";
import { usePurchaseOrderDetail } from "@/hooks/usePurchaseOrders";
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

const QUALITY_LABELS: Record<string, string> = {
  ok: "OK",
  damaged: "Danneggiato",
  partial: "Parziale",
  pending: "In verifica",
};

const QUALITY_COLORS: Record<string, string> = {
  ok: "bg-green-100 text-green-800",
  damaged: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
  pending: "bg-muted text-muted-foreground",
};

export default function DDTRicezioneDetail() {
  const { ddtId } = useParams();
  const navigate = useNavigate();
  const { ddt, isLoading, receipts, isReceiptsLoading } = useDDTRicezioneDetail(ddtId);
  const { updateDDT, deleteDDT, createGoodsReceipt, deleteGoodsReceipt } =
    useDDTRicezioneMutations(ddt?.purchase_order_id ?? null);

  // L'ODA linkato — carichiamo anche gli items per il quick-add goods_receipt
  const po = ddt?.purchase_orders;
  const { items: poItems, isItemsLoading } = usePurchaseOrderDetail(po?.id ?? null);

  // Edit state header DDT
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    numero_ddt: string;
    data_ricezione: string;
    stato: DDTStato;
    quantita_ricevuta: string;
    warehouse_id: string | null;
    note: string;
  } | null>(null);

  const startEdit = () => {
    if (!ddt) return;
    setEditForm({
      numero_ddt: ddt.numero_ddt,
      data_ricezione: ddt.data_ricezione,
      stato: ddt.stato,
      quantita_ricevuta: String(ddt.quantita_ricevuta ?? ""),
      warehouse_id: ddt.warehouse_id ?? null,
      note: ddt.note ?? "",
    });
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!ddt || !editForm) return;
    if (!editForm.numero_ddt.trim()) {
      toast.error("Numero DDT obbligatorio");
      return;
    }
    updateDDT.mutate(
      {
        id: ddt.id,
        updates: {
          numero_ddt: editForm.numero_ddt.trim(),
          data_ricezione: editForm.data_ricezione,
          stato: editForm.stato,
          quantita_ricevuta: parseFloat(editForm.quantita_ricevuta) || 0,
          warehouse_id: editForm.warehouse_id,
          note: editForm.note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setEditForm(null);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!ddt) return;
    if (!confirm(`Eliminare il DDT ${ddt.numero_ddt}? L'operazione non è reversibile.`)) return;
    deleteDDT.mutate(ddt.id, {
      onSuccess: () => {
        if (po?.id) navigate(`/azienda/ordini-acquisto/${po.id}`);
        else navigate("/azienda/ordini?tab=ddt");
      },
    });
  };

  // ── Receive-item dialog state ─────────────────────────────────
  const [receiveItemId, setReceiveItemId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveQuality, setReceiveQuality] = useState<"ok" | "damaged" | "partial" | "pending">("ok");
  const [receiveNotes, setReceiveNotes] = useState("");

  const selectedItem = useMemo(
    () => poItems.find((i) => i.id === receiveItemId) || null,
    [poItems, receiveItemId]
  );

  const itemPendingQty = (it: typeof poItems[number]) => {
    const qty = Number(it.quantity) || 0;
    const recv = Number(it.quantity_received) || 0;
    return Math.max(0, qty - recv);
  };

  const openReceiveFor = (itemId: string) => {
    const it = poItems.find((x) => x.id === itemId);
    if (!it) return;
    // Preferisci collegare per order_item_id: serve ODA → order_item_id mapping
    if (!it.order_item_id) {
      toast.error(
        "Questo articolo ODA non è collegato a una riga d'ordine cliente (order_item). Collegalo per registrare la ricezione."
      );
      return;
    }
    setReceiveItemId(itemId);
    setReceiveQty(String(itemPendingQty(it) || 1));
    setReceiveQuality("ok");
    setReceiveNotes("");
  };

  const submitReceive = () => {
    if (!ddt || !selectedItem) return;
    const qty = parseFloat(receiveQty);
    if (!qty || qty <= 0) {
      toast.error("La quantità deve essere maggiore di zero");
      return;
    }
    if (!selectedItem.order_item_id) {
      toast.error("order_item_id mancante");
      return;
    }

    createGoodsReceipt.mutate(
      {
        ddt_ricezione_id: ddt.id,
        order_item_id: selectedItem.order_item_id,
        quantity_received: qty,
        warehouse_id: ddt.warehouse_id,
        supplier_id: null,
        ddt_number: ddt.numero_ddt,
        quality_check_status: receiveQuality,
        quality_notes: null,
        notes: receiveNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setReceiveItemId(null);
          setReceiveQty("");
          setReceiveNotes("");
        },
      }
    );
  };

  const handleDeleteReceipt = (receiptId: string) => {
    if (!confirm("Eliminare questa ricezione? Lo stock verrà ricalcolato.")) return;
    deleteGoodsReceipt.mutate(receiptId);
  };

  // ── Render ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ddt) {
    return (
      <div className="text-center py-12 space-y-3">
        <FileCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground">DDT non trovato</p>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini?tab=ddt")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Torna ai DDT
        </Button>
      </div>
    );
  }

  const totalReceivedInDDT = receipts.reduce((s, r) => s + Number(r.quantity_received || 0), 0);

  return (
    <div className="space-y-6">
      {/* ─── Back + Title ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/azienda/ordini?tab=ddt")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileCheck className="h-6 w-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              DDT {ddt.numero_ddt}
            </h1>
            <p className="text-xs text-muted-foreground">
              Registrato il {format(new Date(ddt.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit3 className="h-4 w-4 mr-1" /> Modifica
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditForm(null); }}>
                <X className="h-4 w-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={updateDDT.isPending}>
                {updateDDT.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salva</>}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Header card ─────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-5">
          {!isEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Numero DDT</p>
                <p className="font-mono font-medium">{ddt.numero_ddt}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data ricezione</p>
                <p className="font-medium">{format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stato</p>
                <Badge className={`${STATO_COLORS[ddt.stato]} mt-0.5`}>{STATO_LABELS[ddt.stato]}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quantità dichiarata</p>
                <p className="font-medium">
                  {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                </p>
              </div>
              {ddt.note && (
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-xs text-muted-foreground">Note</p>
                  <p className="text-sm">{ddt.note}</p>
                </div>
              )}
            </div>
          ) : editForm ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Numero DDT *</Label>
                <Input
                  value={editForm.numero_ddt}
                  onChange={(e) => setEditForm({ ...editForm, numero_ddt: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Data ricezione</Label>
                <Input
                  type="date"
                  value={editForm.data_ricezione}
                  onChange={(e) => setEditForm({ ...editForm, data_ricezione: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Stato</Label>
                <Select
                  value={editForm.stato}
                  onValueChange={(v) => setEditForm({ ...editForm, stato: v as DDTStato })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ricevuto">Ricevuto completo</SelectItem>
                    <SelectItem value="parziale">Parziale</SelectItem>
                    <SelectItem value="attesa">In attesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantità ricevuta</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.quantita_ricevuta}
                  onChange={(e) => setEditForm({ ...editForm, quantita_ricevuta: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Magazzino</Label>
                <WarehouseSelect
                  value={editForm.warehouse_id}
                  onChange={(v) => setEditForm({ ...editForm, warehouse_id: v })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Note</Label>
                <Textarea
                  rows={2}
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── MAIN: Goods Receipts + Item Picker ─────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Goods receipts registrate con questo DDT */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Ricezioni merce registrate
                  <Badge variant="secondary" className="text-xs">{receipts.length}</Badge>
                </CardTitle>
                {totalReceivedInDDT > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Totale: <strong>{totalReceivedInDDT.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</strong>
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isReceiptsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : receipts.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Nessuna ricezione per articolo registrata. Usa la lista sotto per registrare
                  la ricezione degli articoli dell'ODA, il carico magazzino verrà generato
                  automaticamente.
                </div>
              ) : (
                <div className="divide-y border rounded-md">
                  {receipts.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {r.order_items?.description || "Articolo"}
                          </span>
                          {r.quality_check_status && (
                            <Badge className={`text-[10px] ${QUALITY_COLORS[r.quality_check_status] || ""}`}>
                              {QUALITY_LABELS[r.quality_check_status] || r.quality_check_status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(r.receipt_date), "dd/MM/yyyy HH:mm", { locale: it })}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">
                          {Number(r.quantity_received).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">unità</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteReceipt(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Articoli ODA → quick-add goods_receipt */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Articoli ODA · registra ricezione per articolo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isItemsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : poItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessun articolo nell'ODA collegato.
                </p>
              ) : (
                <div className="divide-y border rounded-md">
                  {poItems.map((it) => {
                    const qty = Number(it.quantity) || 0;
                    const recv = Number(it.quantity_received) || 0;
                    const pending = itemPendingQty(it);
                    const pct = qty > 0 ? Math.round((recv / qty) * 100) : 0;
                    const linkedToOrder = !!it.order_item_id;
                    const isReceiving = receiveItemId === it.id;
                    return (
                      <div key={it.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{it.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {it.sku && <span className="text-xs font-mono text-muted-foreground">{it.sku}</span>}
                              <span className="text-xs text-muted-foreground">
                                {recv.toLocaleString("it-IT", { maximumFractionDigits: 2 })} / {qty.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {it.unit_of_measure || "pz"}
                              </span>
                              <Badge
                                variant={pct === 100 ? "default" : "secondary"}
                                className={`text-[10px] ${pct === 100 ? "bg-green-100 text-green-800" : ""}`}
                              >
                                {pct}%
                              </Badge>
                              {!linkedToOrder && (
                                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                                  non legato a ordine cliente
                                </Badge>
                              )}
                            </div>
                          </div>
                          {!isReceiving && pending > 0 && linkedToOrder && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReceiveFor(it.id)}
                              className="shrink-0"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Ricevi
                            </Button>
                          )}
                          {!isReceiving && pending === 0 && (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-1" />
                          )}
                        </div>

                        {isReceiving && (
                          <div className="mt-3 p-3 rounded-md bg-muted/30 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Quantità ricevuta</Label>
                                <Input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  max={pending}
                                  value={receiveQty}
                                  onChange={(e) => setReceiveQty(e.target.value)}
                                  placeholder={String(pending)}
                                />
                                <p className="text-[10px] text-muted-foreground">Max da ricevere: {pending}</p>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Qualità</Label>
                                <Select
                                  value={receiveQuality}
                                  onValueChange={(v) => setReceiveQuality(v as typeof receiveQuality)}
                                >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ok">OK</SelectItem>
                                    <SelectItem value="partial">Parziale</SelectItem>
                                    <SelectItem value="damaged">Danneggiato</SelectItem>
                                    <SelectItem value="pending">In verifica</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Note</Label>
                                <Input
                                  value={receiveNotes}
                                  onChange={(e) => setReceiveNotes(e.target.value)}
                                  placeholder="Opzionale"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={submitReceive}
                                disabled={createGoodsReceipt.isPending || !receiveQty}
                              >
                                {createGoodsReceipt.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Conferma ricezione
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setReceiveItemId(null)}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Annulla
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── SIDE: Linked entities ─────────────────────── */}
        <div className="space-y-4">
          {/* ODA */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" /> Ordine d'Acquisto
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {po ? (
                <button
                  type="button"
                  onClick={() => navigate(`/azienda/ordini-acquisto/${po.id}`)}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-sm">{po.oda_number}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Stato: <strong>{po.status}</strong>
                  </p>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground italic">Non disponibile</p>
              )}
            </CardContent>
          </Card>

          {/* Fornitore */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> Fornitore
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {po?.suppliers?.name ? (
                <div className="p-3 rounded-md bg-muted/30">
                  <p className="font-medium text-sm">{po.suppliers.name}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Non disponibile</p>
              )}
            </CardContent>
          </Card>

          {/* Ordine Cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Ordine Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {po?.orders?.id ? (
                <button
                  type="button"
                  onClick={() => navigate(`/azienda/ordini/${po.orders!.id}`)}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-sm">{po.orders.order_code}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground italic">ODA non collegato a un ordine cliente</p>
              )}
            </CardContent>
          </Card>

          {/* Magazzino */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <Warehouse className="h-3.5 w-3.5" /> Magazzino destinazione
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {ddt.warehouses?.name ? (
                <button
                  type="button"
                  onClick={() => navigate("/azienda/magazzino")}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{ddt.warehouses.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Lo stock si aggiorna automaticamente al registro delle ricezioni.
                  </p>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nessun magazzino</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
