// ============================================================================
// DDTRicezioneDetail — Dettaglio procedurale DDT (UX super-company)
// ----------------------------------------------------------------------------
// Sezioni (in ordine operativo):
//   1. Header + stato + azioni rapide (verifica / non-conforme)
//   2. Documento DDT principale (hero preview)
//   3. Allegati multipli (bolla, packing list, foto danni, firma, altro)
//   4. Dati consegna — corriere / autista / mezzo / ore (inline edit)
//   5. Ricezione fisica — magazzino / ricevente / firma
//   6. Controllo qualità — non conformità / danni
//   7. Articoli ODA + goods_receipts (per-articolo)
//   8. Sidebar — link cross-entity (ODA, fornitore, cliente, magazzino)
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, FileCheck, Loader2, Truck, ShoppingCart, FileText, Warehouse,
  Package, Plus, CheckCircle2, Trash2, Edit3, Save, X, ExternalLink,
  Paperclip, Camera, User, Phone, Clock, MapPin, AlertTriangle, ShieldCheck,
  FilePlus2, Hash, Calendar, Image as ImageIcon, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDDTRicezioneDetail,
  useDDTRicezioneMutations,
  useDDTAttachments,
  type DDTStato,
  type DDTAttachmentKind,
  type DDTAttachment,
} from "@/hooks/useDDTRicezione";
import { usePurchaseOrderDetail } from "@/hooks/usePurchaseOrders";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
import {
  DDTFilePreview,
  DDTMainFilePreview,
} from "@/components/ddt/DDTFilePreview";
import { DDTAttachmentUploader } from "@/components/ddt/DDTAttachmentUploader";
import { cn } from "@/lib/utils";

// Fallback icon import name — lucide-react's signature icon is exported as
// `Signature` but to avoid clashes with the DOM type we alias locally.
// Note: "SignatureIcon" above comes from the same import line as a fallback.

const QUALITY_LABELS: Record<string, string> = {
  ok: "OK",
  damaged: "Danneggiato",
  partial: "Parziale",
  pending: "In verifica",
};

const QUALITY_COLORS: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  damaged: "bg-rose-100 text-rose-800",
  partial: "bg-amber-100 text-amber-800",
  pending: "bg-muted text-muted-foreground",
};

export default function DDTRicezioneDetail() {
  const { ddtId } = useParams();
  const navigate = useNavigate();
  const { ddt, isLoading, receipts, isReceiptsLoading } = useDDTRicezioneDetail(ddtId);
  const { updateDDT, deleteDDT, createGoodsReceipt, deleteGoodsReceipt } =
    useDDTRicezioneMutations(ddt?.purchase_order_id ?? null);
  const {
    uploadMainDDT,
    uploadAttachments,
    uploadSignature,
    deleteAttachment,
  } = useDDTAttachments(ddtId);

  const po = ddt?.purchase_orders;
  const { items: poItems, isItemsLoading } = usePurchaseOrderDetail(po?.id ?? null);

  // ── Edit header state ────────────────────────────────────
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editHeader, setEditHeader] = useState<{
    numero_ddt: string;
    data_ricezione: string;
    stato: DDTStato;
    quantita_ricevuta: string;
    warehouse_id: string | null;
    note: string;
  } | null>(null);

  const startEditHeader = () => {
    if (!ddt) return;
    setEditHeader({
      numero_ddt: ddt.numero_ddt,
      data_ricezione: ddt.data_ricezione,
      stato: ddt.stato,
      quantita_ricevuta: String(ddt.quantita_ricevuta ?? ""),
      warehouse_id: ddt.warehouse_id ?? null,
      note: ddt.note ?? "",
    });
    setIsEditingHeader(true);
  };

  const saveEditHeader = () => {
    if (!ddt || !editHeader) return;
    if (!editHeader.numero_ddt.trim()) {
      toast.error("Numero DDT obbligatorio");
      return;
    }
    updateDDT.mutate(
      {
        id: ddt.id,
        updates: {
          numero_ddt: editHeader.numero_ddt.trim(),
          data_ricezione: editHeader.data_ricezione,
          stato: editHeader.stato,
          quantita_ricevuta: parseFloat(editHeader.quantita_ricevuta) || 0,
          warehouse_id: editHeader.warehouse_id,
          note: editHeader.note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setIsEditingHeader(false);
          setEditHeader(null);
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

  // ── Consegna (corriere / autista) edit state ──────────────
  const [isEditingConsegna, setIsEditingConsegna] = useState(false);
  const [editConsegna, setEditConsegna] = useState<{
    corriere: string;
    targa_mezzo: string;
    autista_nome: string;
    autista_telefono: string;
    ora_arrivo: string; // HH:mm locale
    ora_partenza: string; // HH:mm locale
  } | null>(null);

  const startEditConsegna = () => {
    if (!ddt) return;
    const toHM = (iso: string | null | undefined) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return format(d, "HH:mm");
    };
    setEditConsegna({
      corriere: ddt.corriere ?? "",
      targa_mezzo: ddt.targa_mezzo ?? "",
      autista_nome: ddt.autista_nome ?? "",
      autista_telefono: ddt.autista_telefono ?? "",
      ora_arrivo: toHM(ddt.ora_arrivo ?? null),
      ora_partenza: toHM(ddt.ora_partenza ?? null),
    });
    setIsEditingConsegna(true);
  };

  const saveEditConsegna = () => {
    if (!ddt || !editConsegna) return;
    const base = ddt.data_ricezione;
    const isoFromHM = (hm: string) => {
      if (!hm) return null;
      try {
        return new Date(`${base}T${hm}:00`).toISOString();
      } catch {
        return null;
      }
    };
    updateDDT.mutate(
      {
        id: ddt.id,
        updates: {
          corriere: editConsegna.corriere.trim() || null,
          targa_mezzo: editConsegna.targa_mezzo.trim().toUpperCase() || null,
          autista_nome: editConsegna.autista_nome.trim() || null,
          autista_telefono: editConsegna.autista_telefono.trim() || null,
          ora_arrivo: isoFromHM(editConsegna.ora_arrivo),
          ora_partenza: isoFromHM(editConsegna.ora_partenza),
        },
      },
      {
        onSuccess: () => {
          setIsEditingConsegna(false);
          setEditConsegna(null);
        },
      }
    );
  };

  // ── Ricevente + non conformità edit ──────────────────────
  const [editRicevutoDa, setEditRicevutoDa] = useState("");
  const [editNonConf, setEditNonConf] = useState("");
  const [editHasDamages, setEditHasDamages] = useState(false);
  const [isEditingQC, setIsEditingQC] = useState(false);

  const startEditQC = () => {
    if (!ddt) return;
    setEditRicevutoDa(ddt.ricevuto_da_nome ?? "");
    setEditNonConf(ddt.non_conformita ?? "");
    setEditHasDamages(!!ddt.has_damages);
    setIsEditingQC(true);
  };

  const saveEditQC = () => {
    if (!ddt) return;
    updateDDT.mutate(
      {
        id: ddt.id,
        updates: {
          ricevuto_da_nome: editRicevutoDa.trim() || null,
          non_conformita: editNonConf.trim() || null,
          has_damages: editHasDamages,
          // Se c'è non conformità e non è già non_conforme, aggiorna stato
          ...(editHasDamages && ddt.stato !== "non_conforme"
            ? { stato: "non_conforme" as DDTStato }
            : {}),
        },
      },
      { onSuccess: () => setIsEditingQC(false) }
    );
  };

  // ── Main DDT file replace ─────────────────────────────────
  const replaceMainRef = useRef<HTMLInputElement>(null);
  const onReplaceMainClick = () => replaceMainRef.current?.click();

  // ── Firma upload ─────────────────────────────────────────
  const signatureRef = useRef<HTMLInputElement>(null);
  const onSignatureClick = () => signatureRef.current?.click();

  // ── Quick action: segna verificato ────────────────────────
  const markVerified = () => {
    if (!ddt) return;
    if (ddt.stato === "verificato") return;
    if (!confirm("Confermi che questo DDT è stato verificato e la merce è conforme?")) return;
    updateDDT.mutate({
      id: ddt.id,
      updates: { stato: "verificato" },
    });
  };

  const markNonConforme = () => {
    if (!ddt) return;
    updateDDT.mutate({
      id: ddt.id,
      updates: { stato: "non_conforme", has_damages: true },
    });
    setIsEditingQC(true);
    setEditHasDamages(true);
    setEditRicevutoDa(ddt.ricevuto_da_nome ?? "");
    setEditNonConf(ddt.non_conformita ?? "");
  };

  // ── Goods receipts ───────────────────────────────────────
  const [receiveItemId, setReceiveItemId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveQuality, setReceiveQuality] = useState<
    "ok" | "damaged" | "partial" | "pending"
  >("ok");
  const [receiveNotes, setReceiveNotes] = useState("");

  const selectedItem = useMemo(
    () => poItems.find((i) => i.id === receiveItemId) || null,
    [poItems, receiveItemId]
  );

  const itemPendingQty = (it: (typeof poItems)[number]) => {
    const qty = Number(it.quantity) || 0;
    const recv = Number(it.quantity_received) || 0;
    return Math.max(0, qty - recv);
  };

  const openReceiveFor = (itemId: string) => {
    const it = poItems.find((x) => x.id === itemId);
    if (!it) return;
    if (!it.order_item_id) {
      toast.error(
        "Questo articolo ODA non è collegato a una riga d'ordine cliente. Collegalo per registrare la ricezione."
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
    const rawQty = parseFloat(receiveQty);
    if (!rawQty || rawQty <= 0) {
      toast.error("La quantità deve essere maggiore di zero");
      return;
    }
    // Validation hardening: cap realistic + arrotonda a 2 decimali per
    // evitare float precision artifacts (es. 1.999999999 → 2.00). Senza
    // questi check si potevano inserire valori abnormi (999999999) o
    // accumulare errori di virgola mobile su goods_receipts successivi.
    if (rawQty > 999999) {
      toast.error("Quantità troppo alta (max 999.999). Controlla il valore.");
      return;
    }
    const qty = Math.round(rawQty * 100) / 100;
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

  // ── Render ───────────────────────────────────────────────
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

  const attachments = (ddt.attachments ?? []) as DDTAttachment[];
  const totalReceivedInDDT = receipts.reduce(
    (s, r) => s + Number(r.quantity_received || 0),
    0
  );
  const canVerify = ddt.stato !== "verificato" && ddt.stato !== "non_conforme";
  const meta = DDT_STATO_META[ddt.stato] ?? DDT_STATO_META.atteso;

  return (
    <div className="space-y-5 pb-10">
      {/* ═══════════════════════════════════════════════════════════
          HEADER — back + title + status + azioni rapide
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/azienda/ordini?tab=ddt")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className={cn(
              "h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center shrink-0",
              "bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20"
            )}
          >
            <FileCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold truncate">
                DDT {ddt.numero_ddt}
              </h1>
              <DDTStatusBadge stato={ddt.stato} />
              {ddt.has_damages && ddt.stato !== "non_conforme" && (
                <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  danni segnalati
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 inline mr-1" />
                {format(new Date(ddt.data_ricezione), "dd MMMM yyyy", { locale: it })}
              </p>
              {po?.suppliers?.name && (
                <p className="text-xs text-muted-foreground">
                  · <Truck className="h-3 w-3 inline mr-1" />
                  {po.suppliers.name}
                </p>
              )}
              {ddt.verified_at && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  · <ShieldCheck className="h-3 w-3 inline mr-1" />
                  verificato il {format(new Date(ddt.verified_at), "dd/MM/yyyy HH:mm", { locale: it })}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canVerify && (
            <Button
              size="sm"
              onClick={markVerified}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={updateDDT.isPending}
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Marca verificato</span>
              <span className="sm:hidden">Verifica</span>
            </Button>
          )}
          {ddt.stato !== "non_conforme" && (
            <Button
              size="sm"
              variant="outline"
              onClick={markNonConforme}
              className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
              disabled={updateDDT.isPending}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Non conforme</span>
            </Button>
          )}
          {!isEditingHeader ? (
            <>
              <Button variant="outline" size="sm" onClick={startEditHeader}>
                <Edit3 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Modifica</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditingHeader(false);
                  setEditHeader(null);
                }}
              >
                <X className="h-4 w-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={saveEditHeader} disabled={updateDDT.isPending}>
                {updateDDT.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" /> Salva
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          METADATI BASE CARD (con edit inline)
          ═══════════════════════════════════════════════════════════ */}
      <Card className={cn("border-l-4", `border-l-${meta.dotColor.replace("bg-", "")}`)}
        style={{
          borderLeftColor:
            {
              "bg-sky-500": "rgb(14 165 233)",
              "bg-slate-400": "rgb(148 163 184)",
              "bg-amber-500": "rgb(245 158 11)",
              "bg-emerald-500": "rgb(16 185 129)",
              "bg-green-600": "rgb(22 163 74)",
              "bg-rose-500": "rgb(244 63 94)",
            }[meta.dotColor] ?? "transparent",
        }}
      >
        <CardContent className="pt-4 pb-4">
          {!isEditingHeader ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetaCell
                icon={Hash}
                label="Numero"
                value={<span className="font-mono font-medium">{ddt.numero_ddt}</span>}
              />
              <MetaCell
                icon={Calendar}
                label="Data ricezione"
                value={format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}
              />
              <MetaCell
                icon={Package}
                label="Quantità"
                value={Number(ddt.quantita_ricevuta).toLocaleString("it-IT", {
                  maximumFractionDigits: 2,
                })}
              />
              <MetaCell
                icon={Warehouse}
                label="Magazzino"
                value={ddt.warehouses?.name ?? "—"}
              />
              {ddt.note && (
                <div className="col-span-2 sm:col-span-4 pt-1 border-t">
                  <p className="text-xs text-muted-foreground">Note</p>
                  <p className="text-sm">{ddt.note}</p>
                </div>
              )}
            </div>
          ) : editHeader ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Numero DDT *</Label>
                <Input
                  value={editHeader.numero_ddt}
                  onChange={(e) =>
                    setEditHeader({ ...editHeader, numero_ddt: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data ricezione</Label>
                <Input
                  type="date"
                  value={editHeader.data_ricezione}
                  onChange={(e) =>
                    setEditHeader({ ...editHeader, data_ricezione: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stato</Label>
                <Select
                  value={editHeader.stato}
                  onValueChange={(v) =>
                    setEditHeader({ ...editHeader, stato: v as DDTStato })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atteso">Atteso (pre-avviso)</SelectItem>
                    <SelectItem value="ricevuto">Ricevuto completo</SelectItem>
                    <SelectItem value="parziale">Parziale</SelectItem>
                    <SelectItem value="verificato">Verificato</SelectItem>
                    <SelectItem value="non_conforme">Non conforme</SelectItem>
                    <SelectItem value="attesa">In attesa (legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantità ricevuta</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editHeader.quantita_ricevuta}
                  onChange={(e) =>
                    setEditHeader({
                      ...editHeader,
                      quantita_ricevuta: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Magazzino</Label>
                <WarehouseSelect
                  value={editHeader.warehouse_id}
                  onChange={(v) =>
                    setEditHeader({ ...editHeader, warehouse_id: v })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Note</Label>
                <Textarea
                  rows={2}
                  value={editHeader.note}
                  onChange={(e) =>
                    setEditHeader({ ...editHeader, note: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          GRID: Colonna sx (documenti / consegna / QC / items) + sidebar
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ─── MAIN COLUMN ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* ─── 1. DOCUMENTO DDT PRINCIPALE ─── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                Documento DDT
                {ddt.ddt_file_url && (
                  <Badge variant="secondary" className="text-[10px]">
                    caricato
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Hidden input per replace */}
              <input
                ref={replaceMainRef}
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && ddt) {
                    uploadMainDDT.mutate({ ddtId: ddt.id, file: f });
                  }
                  if (replaceMainRef.current) replaceMainRef.current.value = "";
                }}
              />

              {ddt.ddt_file_url && ddt.ddt_file_name && ddt.ddt_file_mime ? (
                <DDTMainFilePreview
                  url={ddt.ddt_file_url}
                  name={ddt.ddt_file_name}
                  mime={ddt.ddt_file_mime}
                  onReplace={onReplaceMainClick}
                  onDelete={() => {
                    updateDDT.mutate({
                      id: ddt.id,
                      updates: {
                        ddt_file_url: null,
                        ddt_file_name: null,
                        ddt_file_mime: null,
                      },
                    });
                  }}
                />
              ) : (
                <DDTAttachmentUploader
                  title="Carica il DDT cartaceo"
                  description="Fotografa il documento ricevuto dal corriere o carica il PDF. Resta il documento di riferimento."
                  defaultKind="ddt"
                  multiple={false}
                  isUploading={uploadMainDDT.isPending}
                  onFilesSelected={(files) => {
                    const first = files[0];
                    if (first && ddt) {
                      uploadMainDDT.mutate({ ddtId: ddt.id, file: first.file });
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* ─── 2. ALLEGATI MULTI ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Allegati
                  <Badge variant="secondary" className="text-xs">
                    {attachments.length}
                  </Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {attachments.map((att) => (
                    <DDTFilePreview
                      key={att.path}
                      url={att.url}
                      name={att.name}
                      mime={att.mime}
                      size={att.size}
                      kind={att.kind}
                      uploadedAt={att.uploaded_at}
                      onDelete={() =>
                        deleteAttachment.mutate({
                          ddtId: ddt.id,
                          path: att.path,
                        })
                      }
                    />
                  ))}
                </div>
              )}

              <AttachmentUploaderInline
                uploading={uploadAttachments.isPending}
                onSubmit={(files) => {
                  uploadAttachments.mutate({ ddtId: ddt.id, files });
                }}
              />
            </CardContent>
          </Card>

          {/* ─── 3. DATI CONSEGNA ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Dati consegna & corriere
                </CardTitle>
                {!isEditingConsegna ? (
                  <Button size="sm" variant="ghost" onClick={startEditConsegna}>
                    <Edit3 className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Modifica</span>
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingConsegna(false);
                        setEditConsegna(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEditConsegna}
                      disabled={updateDDT.isPending}
                    >
                      {updateDDT.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1" /> Salva
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!isEditingConsegna ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetaCell
                    icon={Truck}
                    label="Corriere"
                    value={ddt.corriere || "—"}
                    muted={!ddt.corriere}
                  />
                  <MetaCell
                    icon={MapPin}
                    label="Targa mezzo"
                    value={
                      ddt.targa_mezzo ? (
                        <span className="font-mono">{ddt.targa_mezzo}</span>
                      ) : (
                        "—"
                      )
                    }
                    muted={!ddt.targa_mezzo}
                  />
                  <MetaCell
                    icon={User}
                    label="Autista"
                    value={ddt.autista_nome || "—"}
                    muted={!ddt.autista_nome}
                  />
                  <MetaCell
                    icon={Phone}
                    label="Telefono"
                    value={
                      ddt.autista_telefono ? (
                        <a
                          href={`tel:${ddt.autista_telefono}`}
                          className="text-primary hover:underline"
                        >
                          {ddt.autista_telefono}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                    muted={!ddt.autista_telefono}
                  />
                  <MetaCell
                    icon={Clock}
                    label="Ora arrivo"
                    value={
                      ddt.ora_arrivo
                        ? format(new Date(ddt.ora_arrivo), "HH:mm", { locale: it })
                        : "—"
                    }
                    muted={!ddt.ora_arrivo}
                  />
                  <MetaCell
                    icon={Clock}
                    label="Ora partenza"
                    value={
                      ddt.ora_partenza
                        ? format(new Date(ddt.ora_partenza), "HH:mm", { locale: it })
                        : "—"
                    }
                    muted={!ddt.ora_partenza}
                  />
                </div>
              ) : editConsegna ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" /> Corriere / trasportatore
                    </Label>
                    <Input
                      value={editConsegna.corriere}
                      onChange={(e) =>
                        setEditConsegna({ ...editConsegna, corriere: e.target.value })
                      }
                      placeholder="es. GLS, DHL, SDA"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> Targa mezzo
                    </Label>
                    <Input
                      value={editConsegna.targa_mezzo}
                      onChange={(e) =>
                        setEditConsegna({
                          ...editConsegna,
                          targa_mezzo: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="AB123CD"
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <User className="h-3.5 w-3.5" /> Nome autista
                    </Label>
                    <Input
                      value={editConsegna.autista_nome}
                      onChange={(e) =>
                        setEditConsegna({
                          ...editConsegna,
                          autista_nome: e.target.value,
                        })
                      }
                      placeholder="Mario Rossi"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> Telefono autista
                    </Label>
                    <Input
                      type="tel"
                      value={editConsegna.autista_telefono}
                      onChange={(e) =>
                        setEditConsegna({
                          ...editConsegna,
                          autista_telefono: e.target.value,
                        })
                      }
                      placeholder="+39 123 456 7890"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Ora arrivo
                    </Label>
                    <Input
                      type="time"
                      value={editConsegna.ora_arrivo}
                      onChange={(e) =>
                        setEditConsegna({
                          ...editConsegna,
                          ora_arrivo: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Ora partenza
                    </Label>
                    <Input
                      type="time"
                      value={editConsegna.ora_partenza}
                      onChange={(e) =>
                        setEditConsegna({
                          ...editConsegna,
                          ora_partenza: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* ─── 4. RICEVENTE + CONTROLLO QUALITÀ ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Ricevente & controllo qualità
                </CardTitle>
                {!isEditingQC ? (
                  <Button size="sm" variant="ghost" onClick={startEditQC}>
                    <Edit3 className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Modifica</span>
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditingQC(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEditQC}
                      disabled={updateDDT.isPending}
                    >
                      {updateDDT.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1" /> Salva
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Ricevuto da */}
              {!isEditingQC ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MetaCell
                    icon={User}
                    label="Ricevuto da"
                    value={ddt.ricevuto_da_nome || "—"}
                    muted={!ddt.ricevuto_da_nome}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <PenLine className="h-3 w-3" /> Firma
                    </p>
                    {ddt.signature_url ? (
                      <a
                        href={ddt.signature_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 mt-0.5 group"
                      >
                        <img
                          src={ddt.signature_url}
                          alt="Firma"
                          className="h-10 bg-white border rounded-md px-1 group-hover:border-primary transition"
                        />
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted-foreground italic">
                          Nessuna firma
                        </span>
                        <input
                          ref={signatureRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && ddt) {
                              uploadSignature.mutate({
                                ddtId: ddt.id,
                                file: f,
                              });
                            }
                            if (signatureRef.current)
                              signatureRef.current.value = "";
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onSignatureClick}
                          disabled={uploadSignature.isPending}
                          className="h-7 text-xs gap-1"
                        >
                          <Camera className="h-3 w-3" /> Acquisisci
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome ricevente</Label>
                    <Input
                      value={editRicevutoDa}
                      onChange={(e) => setEditRicevutoDa(e.target.value)}
                      placeholder="es. Luca Bianchi (magazziniere)"
                    />
                  </div>
                </div>
              )}

              {/* Danni + non conformità */}
              <div
                className={cn(
                  "rounded-lg border p-3",
                  (isEditingQC ? editHasDamages : ddt.has_damages)
                    ? "border-rose-200 bg-rose-50/50"
                    : "bg-muted/20"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle
                      className={cn(
                        "h-4 w-4 shrink-0 mt-0.5",
                        (isEditingQC ? editHasDamages : ddt.has_damages)
                          ? "text-rose-500"
                          : "text-muted-foreground"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        Presenza di danni o difformità
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isEditingQC
                          ? "Attiva se la merce presenta difformità rispetto all'ODA."
                          : ddt.has_damages
                            ? "Sì, segnalate"
                            : "Nessuna difformità segnalata"}
                      </p>
                    </div>
                  </div>
                  {isEditingQC && (
                    <Switch
                      checked={editHasDamages}
                      onCheckedChange={setEditHasDamages}
                    />
                  )}
                </div>

                {isEditingQC ? (
                  editHasDamages && (
                    <Textarea
                      value={editNonConf}
                      onChange={(e) => setEditNonConf(e.target.value)}
                      rows={3}
                      className="mt-3 text-sm bg-white"
                      placeholder="Descrivi la non conformità: pezzi mancanti, articoli danneggiati, imballo rotto, errori di quantità…"
                    />
                  )
                ) : ddt.non_conformita ? (
                  <div className="mt-2 rounded-md bg-white border border-rose-100 p-2.5 text-sm">
                    {ddt.non_conformita}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ─── 5. GOODS RECEIPTS (ricezione per articolo) ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Ricezioni merce per articolo
                  <Badge variant="secondary" className="text-xs">
                    {receipts.length}
                  </Badge>
                </CardTitle>
                {totalReceivedInDDT > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Totale:{" "}
                    <strong>
                      {totalReceivedInDDT.toLocaleString("it-IT", {
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {isReceiptsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : receipts.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Nessuna ricezione per articolo registrata. Registra la ricezione
                  degli articoli ODA sotto — il carico magazzino è automatico.
                </div>
              ) : (
                <div className="divide-y border rounded-md">
                  {receipts.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-3 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {r.order_items?.description || "Articolo"}
                          </span>
                          {r.quality_check_status && (
                            <Badge
                              className={`text-[10px] ${
                                QUALITY_COLORS[r.quality_check_status] || ""
                              }`}
                            >
                              {QUALITY_LABELS[r.quality_check_status] ||
                                r.quality_check_status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(r.receipt_date), "dd/MM/yyyy HH:mm", {
                            locale: it,
                          })}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">
                          {Number(r.quantity_received).toLocaleString("it-IT", {
                            maximumFractionDigits: 2,
                          })}
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

              {/* Item picker & quick-receive */}
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Articoli ODA · registra ricezione
                </p>
                {isItemsLoading ? (
                  <div className="flex justify-center py-4">
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
                              <p className="font-medium truncate text-sm">
                                {it.description}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {it.sku && (
                                  <span className="text-xs font-mono text-muted-foreground">
                                    {it.sku}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {recv.toLocaleString("it-IT", {
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  /{" "}
                                  {qty.toLocaleString("it-IT", {
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  {it.unit_of_measure || "pz"}
                                </span>
                                <Badge
                                  variant={pct === 100 ? "default" : "secondary"}
                                  className={`text-[10px] ${
                                    pct === 100
                                      ? "bg-emerald-100 text-emerald-800"
                                      : ""
                                  }`}
                                >
                                  {pct}%
                                </Badge>
                                {!linkedToOrder && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-amber-700 border-amber-300"
                                  >
                                    non legato a ordine
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
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                            )}
                          </div>

                          {isReceiving && (
                            <div className="mt-3 p-3 rounded-md bg-muted/30 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    Quantità ricevuta
                                  </Label>
                                  <Input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    max={pending}
                                    value={receiveQty}
                                    onChange={(e) => setReceiveQty(e.target.value)}
                                    placeholder={String(pending)}
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    Max da ricevere: {pending}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Qualità</Label>
                                  <Select
                                    value={receiveQuality}
                                    onValueChange={(v) =>
                                      setReceiveQuality(v as typeof receiveQuality)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ok">OK</SelectItem>
                                      <SelectItem value="partial">
                                        Parziale
                                      </SelectItem>
                                      <SelectItem value="damaged">
                                        Danneggiato
                                      </SelectItem>
                                      <SelectItem value="pending">
                                        In verifica
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Note</Label>
                                  <Input
                                    value={receiveNotes}
                                    onChange={(e) =>
                                      setReceiveNotes(e.target.value)
                                    }
                                    placeholder="Opzionale"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={submitReceive}
                                  disabled={
                                    createGoodsReceipt.isPending || !receiveQty
                                  }
                                >
                                  {createGoodsReceipt.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{" "}
                                      Conferma ricezione
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
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── SIDEBAR ─────────────────────────────────── */}
        <div className="space-y-4">
          <SidebarCard
            title="Ordine d'Acquisto"
            icon={ShoppingCart}
            empty={!po}
          >
            {po && (
              <button
                type="button"
                onClick={() => navigate(`/azienda/ordini-acquisto/${po.id}`)}
                className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-sm">
                    {po.oda_number}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stato: <strong>{po.status}</strong>
                </p>
              </button>
            )}
          </SidebarCard>

          <SidebarCard
            title="Fornitore"
            icon={Truck}
            empty={!po?.suppliers?.name}
          >
            {po?.suppliers?.name && (
              <div className="p-3 rounded-md bg-muted/30">
                <p className="font-medium text-sm">{po.suppliers.name}</p>
                {po.suppliers.email && (
                  <a
                    href={`mailto:${po.suppliers.email}`}
                    className="text-xs text-primary hover:underline block mt-0.5"
                  >
                    {po.suppliers.email}
                  </a>
                )}
              </div>
            )}
          </SidebarCard>

          <SidebarCard
            title="Ordine Cliente"
            icon={FileText}
            empty={!po?.orders?.id}
            emptyLabel="ODA non collegato a un ordine cliente"
          >
            {po?.orders?.id && (
              <button
                type="button"
                onClick={() => navigate(`/azienda/ordini/${po.orders!.id}`)}
                className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-sm">
                    {po.orders.order_code}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                </div>
              </button>
            )}
          </SidebarCard>

          <SidebarCard
            title="Magazzino destinazione"
            icon={Warehouse}
            empty={!ddt.warehouses?.name}
            emptyLabel="Nessun magazzino"
          >
            {ddt.warehouses?.name && (
              <button
                type="button"
                onClick={() => navigate("/azienda/magazzino")}
                className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {ddt.warehouses.name}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stock aggiornato automaticamente dalle ricezioni.
                </p>
              </button>
            )}
          </SidebarCard>

          {/* Timeline di audit */}
          {(ddt.verified_at || ddt.created_at) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ol className="space-y-2 text-xs">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
                    <span>
                      <strong>Creato</strong>
                      <br />
                      <span className="text-muted-foreground">
                        {format(
                          new Date(ddt.created_at),
                          "dd/MM/yyyy 'alle' HH:mm",
                          { locale: it }
                        )}
                      </span>
                    </span>
                  </li>
                  {ddt.verified_at && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                      <span>
                        <strong>Verificato</strong>
                        <br />
                        <span className="text-muted-foreground">
                          {format(
                            new Date(ddt.verified_at),
                            "dd/MM/yyyy 'alle' HH:mm",
                            { locale: it }
                          )}
                        </span>
                      </span>
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Piccolo cell helper per metadati ────────────────────────────────────
function MetaCell({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <div
        className={cn(
          "text-sm mt-0.5 truncate",
          muted ? "text-muted-foreground italic" : "font-medium"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Sidebar card wrapper ────────────────────────────────────────────────
function SidebarCard({
  title,
  icon: Icon,
  children,
  empty,
  emptyLabel = "Non disponibile",
}: {
  title: string;
  icon: React.ElementType;
  children?: React.ReactNode;
  empty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {empty ? (
          <p className="text-xs text-muted-foreground italic">{emptyLabel}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// ─── Uploader inline che include kind selector + DDTAttachmentUploader ──
function AttachmentUploaderInline({
  onSubmit,
  uploading,
}: {
  uploading?: boolean;
  onSubmit: (files: { file: File; kind: DDTAttachmentKind }[]) => void;
}) {
  const [kind, setKind] = useState<DDTAttachmentKind>("bolla");
  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs shrink-0 flex items-center gap-1">
          <ImageIcon className="h-3.5 w-3.5" /> Tipo allegato:
        </Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as DDTAttachmentKind)}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bolla">Bolla di consegna</SelectItem>
            <SelectItem value="packing_list">Packing list</SelectItem>
            <SelectItem value="danni">Foto danni / non conformità</SelectItem>
            <SelectItem value="firma">Firma ricevente</SelectItem>
            <SelectItem value="altro">Altro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DDTAttachmentUploader
        compact
        defaultKind={kind}
        multiple
        isUploading={uploading}
        onFilesSelected={onSubmit}
      />
    </div>
  );
}
