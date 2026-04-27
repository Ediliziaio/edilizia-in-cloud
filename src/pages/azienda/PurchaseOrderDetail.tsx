import { useState, lazy, Suspense } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Loader2, Plus, Trash2, Send, CheckCircle2, Package,
  Truck, Save, XCircle, ExternalLink, FileCheck, ShieldCheck, Paperclip,
  AlertTriangle, ScanLine,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePurchaseOrderDetail, usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import type { PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import type { DDTStato } from "@/hooks/useDDTRicezione";
import { ArticleCombobox, type ArticleTemplateData } from "@/components/orders/ArticleCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { VerifyPurchaseOrderDialog } from "@/components/orders/VerifyPurchaseOrderDialog";
import { VerificationHistoryCard } from "@/components/orders/VerificationHistoryCard";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { DDTStatusBadge } from "@/components/ddt/DDTStatusBadge";

// MP2 P1a: ricezione via scansione QR/barcode (lazy: trascina @zxing solo on-demand).
const OdaReceiveSheet = lazy(() =>
  import("@/components/warehouse/OdaReceiveSheet").then((m) => ({ default: m.OdaReceiveSheet })),
);

const fmtEur = (n: number) => formatCurrency(n);

const STATUS_FLOW: Record<string, string[]> = {
  bozza: ["inviato", "annullato"],
  inviato: ["confermato", "annullato"],
  confermato: ["parziale", "ricevuto"],
  parziale: ["ricevuto"],
  ricevuto: [],
  annullato: [],
};

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza", inviato: "Inviato", confermato: "Confermato",
  parziale: "Parziale", ricevuto: "Ricevuto", annullato: "Annullato",
};

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800",
  confermato: "bg-emerald-100 text-emerald-800",
  parziale: "bg-amber-100 text-amber-800",
  ricevuto: "bg-green-100 text-green-800",
  annullato: "bg-destructive/10 text-destructive",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  inviato: <Send className="h-3.5 w-3.5 mr-1" />,
  confermato: <CheckCircle2 className="h-3.5 w-3.5 mr-1" />,
  ricevuto: <Package className="h-3.5 w-3.5 mr-1" />,
  annullato: <XCircle className="h-3.5 w-3.5 mr-1" />,
};

export default function PurchaseOrderDetail() {
  const { odaId } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { order, isLoading, items, isItemsLoading, addItem, updateItem, deleteItem } = usePurchaseOrderDetail(odaId || null);
  const { updateStatus, update } = usePurchaseOrders();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  // AI Verification
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  // M4 — DDT ricezione (nuovo wizard procedurale)
  const [ddtDialogOpen, setDdtDialogOpen] = useState(false);
  const [receiveScanOpen, setReceiveScanOpen] = useState(false);

  const { data: ddtList = [] } = useQuery({
    queryKey: ["ddt-ricezione", odaId],
    queryFn: async () => {
      const { data } = await supabase.from("ddt_ricezione").select("*").eq("purchase_order_id", odaId!).order("data_ricezione", { ascending: false });
      return data || [];
    },
    enabled: !!odaId,
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Ordine non trovato</p>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini-acquisto")}>Torna alla lista</Button>
      </div>
    );
  }

  const supplier = order.suppliers as any;
  const nextStatuses = STATUS_FLOW[order.status] || [];
  const isEditable = order.status === "bozza";

  const handleStatusChange = async (ns: string) => {
    updateStatus.mutate({ id: order.id, status: ns }, {
      onSuccess: async () => {
        // Auto-generate cost when status becomes "ricevuto"
        if (ns === "ricevuto" && effectiveCompany?.id) {
          try {
            const today = format(new Date(), "yyyy-MM-dd");
            const { error } = await supabase.from("company_costs").insert({
              company_id: effectiveCompany.id,
              name: `OdA ${order.oda_number} - ${supplier?.name || "Fornitore"}`,
              cost_type: "variable",
              amount: Number(order.subtotal),
              vat_rate: Number(order.vat_total) > 0 && Number(order.subtotal) > 0
                ? Math.round((Number(order.vat_total) / Number(order.subtotal)) * 100)
                : 22,
              category: "materiali",
              recurrence: "once",
              due_date: today,
              is_paid: false,
              supplier_id: order.supplier_id,
              notes: `Generato automaticamente da OdA ${order.oda_number}`,
            });
            if (error) throw error;
            toast.success("Costo registrato in Costi Aziendali");
          } catch {
            toast.error("OdA ricevuto, ma errore nella registrazione del costo");
          }
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => navigate("/azienda/ordini-acquisto")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Ordini Acquisto
        </Button>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">{order.oda_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-xs border-0 ${STATUS_COLORS[order.status] || ""}`}>{STATUS_LABELS[order.status] || order.status}</Badge>
            {order.orders?.order_code && (
              <Link to={`/azienda/ordini/${order.order_id}`} className="inline-flex">
                <Badge variant="outline" className="text-xs hover:bg-accent cursor-pointer">
                  Ord. {order.orders.order_code} <ExternalLink className="h-3 w-3 ml-1" />
                </Badge>
              </Link>
            )}
          </div>
        </div>

        {/* Status actions */}
        <div className="flex gap-2 flex-wrap">
          {order.status !== "bozza" && order.status !== "annullato" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerifyDialogOpen(true)}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Verifica AI
            </Button>
          )}
          {/* MP2 P1a: ricezione via scansione QR — solo per ODA in stato pending */}
          {(["inviato", "confermato", "parziale"] as Array<typeof order.status>).includes(order.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiveScanOpen(true)}
            >
              <ScanLine className="h-3.5 w-3.5 mr-1" />
              Ricevi via scansione
            </Button>
          )}
          {nextStatuses.map((ns) => (
            <Button
              key={ns}
              variant={ns === "annullato" ? "destructive" : "default"}
              size="sm"
              onClick={() => handleStatusChange(ns)}
              disabled={updateStatus.isPending}
            >
              {STATUS_ICONS[ns]}
              {STATUS_LABELS[ns]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Items table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Articoli</CardTitle>
                {isEditable && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addItem.mutate({
                      purchase_order_id: order.id,
                      description: "Nuovo articolo",
                      quantity: 1,
                      unit_price: 0,
                      vat_rate: 22,
                    })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isItemsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nessun articolo. Clicca "Aggiungi" per iniziare.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50">
                      <th className="text-left p-2 pl-4 font-medium">Descrizione</th>
                      <th className="text-right p-2 font-medium w-20">Qtà</th>
                      <th className="text-left p-2 font-medium w-16">UM</th>
                      <th className="text-right p-2 font-medium w-24">Prezzo</th>
                      <th className="text-right p-2 font-medium w-16">Sc.%</th>
                      <th className="text-right p-2 font-medium w-16">IVA%</th>
                      <th className="text-right p-2 font-medium w-24">Totale</th>
                      {isEditable && <th className="p-2 w-10"></th>}
                      {!isEditable && order.status !== "annullato" && <th className="text-right p-2 font-medium w-20">Ricevuti</th>}
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          isEditable={isEditable}
                          showReceived={!isEditable && order.status !== "annullato"}
                          onUpdate={(updates) => updateItem.mutate({ id: item.id, updates })}
                          onDelete={() => deleteItem.mutate(item.id)}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-medium">Imponibile:</td>
                        <td className="p-2 text-right font-medium">{fmtEur(Number(order.subtotal))}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right text-muted-foreground">IVA:</td>
                        <td className="p-2 text-right text-muted-foreground">{fmtEur(Number(order.vat_total))}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30 border-t">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-bold">Totale:</td>
                        <td className="p-2 text-right font-bold">{fmtEur(Number(order.total))}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Note</p>
                {!editingNotes ? (
                  <Button variant="ghost" size="sm" onClick={() => { setNotes(order.notes || ""); setEditingNotes(true); }}>Modifica</Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>Annulla</Button>
                    <Button size="sm" onClick={() => { update.mutate({ id: order.id, updates: { notes } }); setEditingNotes(false); }}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Salva
                    </Button>
                  </div>
                )}
              </div>
              {editingNotes ? (
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes || "Nessuna nota."}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview / Info */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Fornitore</p>
              </div>
              <p className="font-semibold">{supplier?.name || "—"}</p>
              {supplier?.email && <p className="text-sm text-muted-foreground">{supplier.email}</p>}
              {supplier?.address && <p className="text-xs text-muted-foreground">{supplier.address}, {supplier.city} {supplier.province}</p>}
              {supplier?.vat_number && <p className="text-xs text-muted-foreground">P.IVA: {supplier.vat_number}</p>}
              {supplier?.iban && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">IBAN</p>
                    <p className="text-xs font-mono">{supplier.iban}</p>
                    {supplier.bank_name && <p className="text-xs text-muted-foreground">{supplier.bank_name}</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data emissione</span>
                <span>{format(new Date(order.issue_date), "dd/MM/yyyy", { locale: it })}</span>
              </div>
              {order.expected_delivery_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consegna prevista</span>
                  <span>{format(new Date(order.expected_delivery_date), "dd/MM/yyyy", { locale: it })}</span>
                </div>
              )}
              {order.actual_delivery_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consegna effettiva</span>
                  <span>{format(new Date(order.actual_delivery_date), "dd/MM/yyyy", { locale: it })}</span>
                </div>
              )}
              {order.payment_terms && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagamento</span>
                  <span>{order.payment_terms}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Totale</span>
                <span>{fmtEur(Number(order.total))}</span>
              </div>
            </CardContent>
          </Card>

          {/* Progresso Ricezione */}
          {order.status !== "bozza" && order.status !== "annullato" && items.length > 0 && (() => {
            const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0);
            const receivedQty = items.reduce((s, i) => s + Number(i.quantity_received || 0), 0);
            const pct = totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0;
            return (
              <Card>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Ricezione merce
                    </span>
                    <span className="font-medium">{receivedQty}/{totalQty} pz ({pct}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-muted-foreground/20"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {pct === 100 && (
                    <p className="text-xs text-emerald-600 font-medium">Tutti gli articoli ricevuti</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* M4 — DDT Ricezione card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" aria-hidden="true" /> DDT Ricezione
                  {ddtList.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{ddtList.length}</Badge>
                  )}
                </CardTitle>
                <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setDdtDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registra
                </Button>
              </div>
              {ddtList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] mt-1">
                  {(() => {
                    const counts: Record<string, number> = {};
                    for (const d of ddtList as { stato: DDTStato }[]) {
                      counts[d.stato] = (counts[d.stato] ?? 0) + 1;
                    }
                    return (
                      <>
                        {counts.verificato ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                            {counts.verificato} verificat{counts.verificato === 1 ? "o" : "i"}
                          </Badge>
                        ) : null}
                        {counts.ricevuto ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">
                            {counts.ricevuto} ricevut{counts.ricevuto === 1 ? "o" : "i"}
                          </Badge>
                        ) : null}
                        {counts.parziale ? (
                          <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                            {counts.parziale} parzial{counts.parziale === 1 ? "e" : "i"}
                          </Badge>
                        ) : null}
                        {counts.non_conforme ? (
                          <Badge className="bg-rose-100 text-rose-800 text-[10px]">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            {counts.non_conforme} non conform{counts.non_conforme === 1 ? "e" : "i"}
                          </Badge>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {ddtList.length === 0 ? (
                <div className="text-center py-5 space-y-2">
                  <FileCheck className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Nessun DDT registrato</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDdtDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Registra il primo DDT
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(ddtList as {
                    id: string;
                    numero_ddt: string;
                    data_ricezione: string;
                    quantita_ricevuta: number;
                    stato: DDTStato;
                    note: string | null;
                    attachments?: unknown[] | null;
                    ddt_file_url?: string | null;
                    has_damages?: boolean;
                  }[]).map((ddt) => {
                    const attachCount =
                      (Array.isArray(ddt.attachments) ? ddt.attachments.length : 0) +
                      (ddt.ddt_file_url ? 1 : 0);
                    return (
                      <button
                        type="button"
                        key={ddt.id}
                        onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                        className="w-full flex items-start justify-between p-2 rounded-md bg-muted/40 hover:bg-muted text-xs gap-2 text-left transition-colors group border border-transparent hover:border-primary/20"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium truncate font-mono">{ddt.numero_ddt}</p>
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {ddt.data_ricezione?.split("-").reverse().join("/")} ·{" "}
                            {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })} unità
                          </p>
                          {(attachCount > 0 || ddt.has_damages) && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {attachCount > 0 && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  {attachCount}
                                </span>
                              )}
                              {ddt.has_damages && (
                                <span className="text-[10px] text-rose-600 flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  danni
                                </span>
                              )}
                            </div>
                          )}
                          {ddt.note && <p className="text-muted-foreground italic truncate mt-0.5">{ddt.note}</p>}
                        </div>
                        <DDTStatusBadge stato={ddt.stato} size="sm" className="shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Verification History */}
          <VerificationHistoryCard purchaseOrderId={order.id} />
        </div>
      </div>

      {/* Verify Purchase Order Dialog */}
      <VerifyPurchaseOrderDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        purchaseOrderId={order.id}
        odaNumber={order.oda_number}
        orderId={order.order_id}
        orderCode={order.orders?.order_code}
      />

      {/* DDT Wizard — nuovo dialog procedurale multi-step con upload foto/PDF */}
      <NewDDTDialog
        open={ddtDialogOpen}
        onOpenChange={setDdtDialogOpen}
        prefillPurchaseOrderId={odaId ?? null}
      />

      {/* MP2 P1a — ricezione via scansione QR/barcode (skip step 1-2 grazie a lockedOdaId) */}
      <Suspense fallback={null}>
        {receiveScanOpen && (
          <OdaReceiveSheet
            open={receiveScanOpen}
            onOpenChange={setReceiveScanOpen}
            lockedOdaId={order.id}
          />
        )}
      </Suspense>
    </div>
  );
}

// ========== INLINE ITEM ROW ==========
function ItemRow({
  item,
  isEditable,
  showReceived,
  onUpdate,
  onDelete,
}: {
  item: PurchaseOrderItem;
  isEditable: boolean;
  showReceived: boolean;
  onUpdate: (updates: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const [desc, setDesc] = useState(item.description);
  const [qty, setQty] = useState(String(item.quantity));
  const [um, setUm] = useState(item.unit_of_measure || "pz");
  const [price, setPrice] = useState(String(item.unit_price));
  const [disc, setDisc] = useState(String(item.discount_percent));
  const [vat, setVat] = useState(String(item.vat_rate));
  const [received, setReceived] = useState(String(item.quantity_received));

  const handleBlur = () => {
    const updates: Record<string, any> = {};
    if (desc !== item.description) updates.description = desc;
    if (Number(qty) !== item.quantity) updates.quantity = Number(qty);
    if (um !== (item.unit_of_measure || "pz")) updates.unit_of_measure = um;
    if (Number(price) !== item.unit_price) updates.unit_price = Number(price);
    if (Number(disc) !== item.discount_percent) updates.discount_percent = Number(disc);
    if (Number(vat) !== item.vat_rate) updates.vat_rate = Number(vat);
    if (Object.keys(updates).length > 0) onUpdate(updates);
  };

  const handleReceivedBlur = () => {
    if (Number(received) !== item.quantity_received) {
      onUpdate({ quantity_received: Number(received), received_date: new Date().toISOString().split("T")[0] });
    }
  };

  const handleArticleSelect = (name: string, templateData?: ArticleTemplateData) => {
    setDesc(name);
    const updates: Record<string, any> = { description: name };
    if (templateData) {
      const newPrice = String(templateData.standard_cost > 0 ? templateData.standard_cost : templateData.unit_price);
      const newUm = templateData.unit_of_measure || "pz";
      const newVat = String(templateData.vat_rate || 22);
      const newSku = templateData.sku || null;

      setPrice(newPrice);
      setUm(newUm);
      setVat(newVat);

      updates.unit_price = Number(newPrice);
      updates.unit_of_measure = newUm;
      updates.vat_rate = Number(newVat);
      updates.sku = newSku;
      updates.article_template_id = templateData.id;
    }
    onUpdate(updates);
  };

  if (!isEditable && !showReceived) {
    return (
      <tr className="border-b">
        <td className="p-2 pl-4">{item.description}</td>
        <td className="p-2 text-right">{item.quantity}</td>
        <td className="p-2">{item.unit_of_measure || "pz"}</td>
        <td className="p-2 text-right">{fmtEur(item.unit_price)}</td>
        <td className="p-2 text-right">{item.discount_percent > 0 ? `${item.discount_percent}%` : "—"}</td>
        <td className="p-2 text-right">{item.vat_rate}%</td>
        <td className="p-2 text-right font-medium">{fmtEur(Number(item.line_total))}</td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="p-1 pl-2">
        {isEditable ? (
          <ArticleCombobox
            value={desc}
            onValueChange={handleArticleSelect}
            placeholder="Seleziona articolo..."
          />
        ) : (
          <span className="pl-2">{item.description}</span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={handleBlur} className="h-8 text-sm text-right w-16" />
        ) : (
          <span className="block text-right">{item.quantity}</span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input value={um} onChange={(e) => setUm(e.target.value)} onBlur={handleBlur} className="h-8 text-sm w-14" />
        ) : (
          <span>{item.unit_of_measure || "pz"}</span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={handleBlur} className="h-8 text-sm text-right w-20" />
        ) : (
          <span className="block text-right">{fmtEur(item.unit_price)}</span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input type="number" value={disc} onChange={(e) => setDisc(e.target.value)} onBlur={handleBlur} className="h-8 text-sm text-right w-14" />
        ) : (
          <span className="block text-right">{item.discount_percent > 0 ? `${item.discount_percent}%` : "—"}</span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} onBlur={handleBlur} className="h-8 text-sm text-right w-14" />
        ) : (
          <span className="block text-right">{item.vat_rate}%</span>
        )}
      </td>
      <td className="p-2 text-right font-medium">{fmtEur(Number(item.line_total))}</td>
      {isEditable && (
        <td className="p-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </td>
      )}
      {showReceived && (
        <td className="p-1">
          <Input
            type="number"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            onBlur={handleReceivedBlur}
            className="h-8 text-sm text-right w-16"
            max={item.quantity}
          />
        </td>
      )}
    </tr>
  );
}
