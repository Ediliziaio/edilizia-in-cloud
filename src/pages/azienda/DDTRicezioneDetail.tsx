import type * as React from "react";
import { useConsegneDDT } from "@/hooks/useConsegneDDT";
import { ricezioneNonAllineata } from "@/lib/magazzino/ricezioneNonAllineata";
import { useFileDDT } from "@/hooks/useFileDDT";
// ============================================================================
// DDTRicezioneDetail — la scheda di una bolla ricevuta
// ----------------------------------------------------------------------------
// Una bolla risponde a quattro domande, e la pagina le pone in quest'ordine:
//
//   1. CHE COSA È ARRIVATO    le righe della merce, col prezzo, correggibili a
//                             mano. È la prima cosa che si guarda su una bolla.
//   2. COM'ERA IL DOCUMENTO   «Documenti della bolla»: l'originale e gli allegati
//                             (le righe si correggono guardandolo).
//   3. TORNA CON L'ORDINE?    ricezioni per articolo e articoli dell'ODA, con
//                             le quantità che mancano.
//   4. CHI L'HA PORTATA       corriere, mezzo, autista, orari.
//   5. CHI L'HA PRESA         ricevente, firma, non conformità, danni.
//
//   Testata: numero, data, righe della merce, stato, e le azioni
//            (verifica / non conforme / modifica).
//   Colonna destra: collegamenti (ordini, fornitore, commesse, destinazione,
//            fattura e confronto prezzi — modificabili), chi l'ha portata, chi
//            l'ha presa, storia.
//
// 29/10/2026 — Prima l'ordine era un altro: il file, gli allegati, il corriere,
// la targa, l'autista, e la merce al sesto posto. Il corriere veniva prima di
// quello che era arrivato. Le righe, poi, erano in sola lettura: l'AI scriveva
// e nessuno poteva correggere.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDentroPopupDocumento, useIdDocumento, useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DDTRigheCard } from "@/components/ddt/DDTRigheCard";
import { DocumentiBollaCard } from "@/components/ddt/DocumentiBollaCard";
import { ConsegneDDTCard } from "@/components/ddt/ConsegneDDTCard";
import { ControlloOrdiniDDTCard } from "@/components/ddt/ControlloOrdiniDDTCard";
import { ArrivoPosizioniPanel } from "@/components/ddt/ArrivoPosizioniPanel";
import { CollegamentiDDTCard, TimelineBolla } from "@/components/ddt/CollegamentiDDTCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowLeft, FileCheck, Loader2, Truck, FileText,
  Package, Plus, CheckCircle2, Trash2, Edit3, Save, X, ExternalLink,
  Camera, User, Phone, Clock, MapPin, AlertTriangle, ShieldCheck,
  FilePlus2, Hash, Calendar, PenLine, ListTree,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDDTRicezioneDetail,
  useDDTRicezioneMutations,
  useDDTAttachments,
  useDDTRighe,
  type DDTStato,
  type DDTAttachment,
} from "@/hooks/useDDTRicezione";
import { usePurchaseOrderDetail } from "@/hooks/usePurchaseOrders";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
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
  const { ddtId: ddtIdIndirizzo } = useParams();
  const ddtId = useIdDocumento(ddtIdIndirizzo);
  const navigate = useNavigaDocumento();
  const inPopup = useDentroPopupDocumento();
  const { ddt, isLoading, isError: erroreDDT, refetch: rileggiDDT, receipts, isReceiptsLoading, isReceiptsError } = useDDTRicezioneDetail(ddtId);
  const fileDocumento = useFileDDT(ddt);
  const consegneDocumento = useConsegneDDT(ddt?.company_id ?? "",ddtId ?? "");
  const destinazioneMista = new Set((consegneDocumento.data ?? []).filter(c=>c.tipo!=="servizio").map(c=>c.destinazione)).size>1;
  const { updateDDT, deleteDDT, createGoodsReceipt, deleteGoodsReceipt } =
    useDDTRicezioneMutations(ddt?.purchase_order_id ?? null);
  const {
    uploadMainDDT,
    uploadAttachments,
    uploadSignature,
    deleteAttachment,
  } = useDDTAttachments(ddtId);

  const po = ddt?.purchase_orders;
  // Le righe servono già alla card della merce: stessa chiave di query, quindi
  // qui non parte nessuna chiamata in più.
  const { data: righeMerce = [] } = useDDTRighe(ddtId);
  // Il fornitore sta sulla bolla dal 29/10/2026: una bolla senza ordine
  // d'acquisto lo ha solo lì. Prima la colonna propria, poi l'ODA.
  const fornitoreNome = ddt?.suppliers?.name ?? po?.suppliers?.name ?? null;
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
    /** Stringa vuota = «non si sa»: il campo nel database resta NULL. */
    trasporto_a_cura_di: string;
    porto: string;
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
      trasporto_a_cura_di: ddt.trasporto_a_cura_di ?? "",
      porto: ddt.porto ?? "",
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
          trasporto_a_cura_di:
            (editConsegna.trasporto_a_cura_di || null) as "fornitore" | "noi" | "terzi" | null,
          porto: (editConsegna.porto || null) as "franco" | "assegnato" | null,
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

  /**
   * Quello che non torna fra la bolla e l'ordine. Prima bisognava dedurlo
   * scorrendo tutti gli articoli e confrontando due numeri a testa: nessuno lo
   * faceva, e una consegna incompleta passava liscia.
   */
  const scostamenti = useMemo(() => {
    const incompleti = poItems.filter((it) => {
      const qty = Number(it.quantity) || 0;
      const recv = Number(it.quantity_received) || 0;
      return Math.max(0, qty - recv) > 0;
    });
    return {
      nonAllineato: poItems.some((it) => ricezioneNonAllineata(it, receipts)),
      mancanti: incompleti.reduce((s, it) => {
        const qty = Number(it.quantity) || 0;
        const recv = Number(it.quantity_received) || 0;
        return s + Math.max(0, qty - recv);
      }, 0),
      articoliIncompleti: incompleti.length,
      // Senza articoli d'ordine non c'è niente a cui abbinare le righe: dirlo
      // sarebbe un allarme per una cosa che non si può fare.
      righeNonAbbinate:
        poItems.length > 0 ? righeMerce.filter((r) => !r.order_item_id).length : 0,
    };
  }, [poItems, righeMerce, receipts]);

  const openReceiveFor = (itemId: string) => {
    if (ddt?.destinazione === "cantiere") return;
    const it = poItems.find((x) => x.id === itemId);
    if (!it || isReceiptsLoading || isReceiptsError) return;
    if (!po || !["inviato", "confermato", "parziale"].includes(po.status)) {
      toast.error("Verifica e conferma l’ordine prima di registrare una ricezione.");
      return;
    }
    if (ricezioneNonAllineata(it, receipts)) {
      toast.error("Ricezione già registrata: verifica il riepilogo OdA prima di aggiungere altra merce.");
      return;
    }
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
    if (!ddt || ddt.destinazione === "cantiere" || !selectedItem || isReceiptsLoading || isReceiptsError) return;
    if (!po || !["inviato", "confermato", "parziale"].includes(po.status)) {
      toast.error("Lo stato dell’ordine non consente nuove ricezioni.");
      return;
    }
    if (ricezioneNonAllineata(selectedItem, receipts)) {
      toast.error("Ricezione già registrata: il riepilogo OdA deve essere verificato.");
      return;
    }
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
    if (qty <= 0) { toast.error("La quantità minima è 0,01."); return; }
    if (!Number.isInteger(qty)) {
      toast.error("Questa ricezione gestisce quantità intere: nessun movimento registrato.");
      return;
    }
    const pending = itemPendingQty(selectedItem);
    if (qty > pending) {
      toast.error("La quantità ricevuta supera il residuo");
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
    // Messaggio corretto: l'RPC insert_goods_receipt_atomic NON tocca
    // warehouse_stock.quantity (lo stock fisico è gestito separatamente
    // dal carico rapido / batch_carico_from_scans). Quindi il DELETE
    // pulisce solo il fulfillment status su order_items.
    if (!confirm("Eliminare questa registrazione di ricezione? Lo stato della riga commessa tornerà a 'in attesa'.")) return;
    deleteGoodsReceipt.mutate(receiptId);
  };

  // ── Render ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5 pb-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!ddt) {
    return (
      <div className="text-center py-12 space-y-3">
        <FileCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <p role={erroreDDT ? "alert" : undefined} className="text-muted-foreground">{erroreDDT ? "Non riesco a caricare il DDT. Riprova; il documento non è stato eliminato." : "DDT non trovato"}</p>
        {erroreDDT && <Button variant="outline" onClick={() => rileggiDDT()}>Riprova</Button>}
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
  const odaConQuantitaRicevute = poItems.some((item) => Number(item.quantity_received) > 0);
  const canVerify = ddt.stato !== "verificato" && ddt.stato !== "non_conforme";
  // Ritiro: non l'ha portata nessuno, siamo andati a prenderla noi. Cambia che
  // cosa la pagina chiede e che cosa mostra.
  const ritiro = ddt.trasporto_a_cura_di === "noi";
  const meta = DDT_STATO_META[ddt.stato] ?? DDT_STATO_META.atteso;
  const apriConsegne = () =>
    document.getElementById("consegne-ddt")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-5 pb-10">
      {/* ═══════════════════════════════════════════════════════════
          HEADER — back + title + status + azioni rapide
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex w-full items-center gap-2 min-w-0 sm:w-auto sm:flex-1">
          {!inPopup && <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/azienda/ordini?tab=ddt")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>}
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
              {fornitoreNome && (
                <p className="text-xs text-muted-foreground">
                  · <Truck className="h-3 w-3 inline mr-1" />
                  {fornitoreNome}
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
          {/* L'originale del fornitore a portata di mano: le schede che lo
              mostrano stanno in fondo alla colonna della merce. */}
          {fileDocumento.data && (
            <Button variant="outline" size="sm" asChild>
              <a href={fileDocumento.data} target="_blank" rel="noreferrer" className="gap-1.5">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Bolla originale</span>
              </a>
            </Button>
          )}
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
        <CardContent className="py-3">
          {/* 11/11/2026 — Solo quello che non sta altrove: valore della merce
              e destinazione li dicono già la tabella e i Collegamenti, lo
              stato «verificata» la testata. */}
          {!isEditingHeader ? (
            <div className="grid grid-cols-3 gap-4 sm:max-w-2xl">
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
                icon={ListTree}
                label="Merce"
                value={
                  righeMerce.length > 0 ? (
                    <span>
                      {righeMerce.length} {righeMerce.length === 1 ? "riga" : "righe"}
                    </span>
                  ) : receipts.length > 0 ? (
                    <span>{receipts.length} {receipts.length === 1 ? "articolo ricevuto" : "articoli ricevuti"}</span>
                  ) : (
                    <span className="text-amber-600">nessuna riga</span>
                  )
                }
              />
              {ddt.note && (
                <div className="col-span-3 pt-1 border-t">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ─── MAIN COLUMN ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5 min-w-0">

          {/* ─── 1. LA MERCE: che cosa è arrivato ───
              Che cosa c'è scritto sul documento, prezzi compresi. Sotto, le
              ricezioni per articolo: un'altra cosa, cioè le quantità entrate in
              magazzino contro una riga d'ordine. Tenerle separate è ciò che
              evita di contare la stessa merce due volte. */}
          <DDTRigheCard
            ddtId={ddtId}
            consegnaDiretta={ddt.destinazione === "cantiere" && !destinazioneMista}
            gestioneConsegneEsplicita={true}
            odaId={ddt?.purchase_order_id}
            fornitoreId={ddt?.supplier_id}
            aiConfidenza={ddt?.ai_confidenza}
            aiAvvisi={ddt?.ai_avvisi}
            ricezioni={receipts.length}
            quantitaInTestata={
              ddt?.quantita_ricevuta != null ? Number(ddt.quantita_ricevuta) : null
            }
          />

          {/* Sul telefono la colonna destra finisce in fondo, dopo tutta la
              merce: i collegamenti si vedono qui, subito sotto le righe. */}
          <div className="lg:hidden">
            <CollegamentiDDTCard ddt={ddt} ricezioni={receipts.length} onApriConsegne={apriConsegne} />
          </div>

          {/* Le posizioni su misura dell'ordine: la bolla propone, chi riceve conferma. */}
          {ddt?.purchase_order_id && <ArrivoPosizioniPanel odaId={ddt.purchase_order_id} ddtId={ddtId} nascondiSeVuoto />}

          <ControlloOrdiniDDTCard key={`controllo:${ddt.id}`} ddt={ddt} />
          <div id="consegne-ddt" className="scroll-mt-5"><ConsegneDDTCard key={ddt.id} ddt={ddt} /></div>
          {/* ─── 2. I DOCUMENTI: l'originale in cima, poi gli allegati ───
              11/11/2026 — Erano due schede con due caricatori grandi
              («Documento DDT» e «Allegati»): ora un elenco e un pulsante.
              I prezzi dalla fattura stanno nei Collegamenti, vicino alla
              fattura: ripeterli qui era una terza scheda per la stessa cosa. */}
          <DocumentiBollaCard
            key={`documenti:${ddt.id}`}
            ddt={ddt}
            fileUrl={fileDocumento.data}
            fileErrore={fileDocumento.isError}
            onRiprovaFile={() => void fileDocumento.refetch()}
            allegati={attachments}
            inCaricamento={uploadMainDDT.isPending || uploadAttachments.isPending}
            onCaricaOriginale={(file) => uploadMainDDT.mutate({ ddtId: ddt.id, file })}
            onRimuoviOriginale={() =>
              updateDDT.mutate({
                id: ddt.id,
                updates: {
                  ddt_file_url: null,
                  ddt_file_name: null,
                  ddt_file_mime: null,
                  ddt_file_bucket: null,
                },
              })
            }
            onCaricaAllegati={(files) => uploadAttachments.mutate({ ddtId: ddt.id, files })}
            onEliminaAllegato={(path) => deleteAttachment.mutate({ ddtId: ddt.id, path })}
          />

          {/* ─── 3. TORNA CON L'ORDINE? ricezioni per articolo e articoli dell'ODA ─── */}
          {(!(ddt.ricezione_esplicita || consegneDocumento.data?.length) || receipts.length > 0) && <Card>
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
              {/* Che cosa non torna, detto in una riga invece che lasciato
                  dedurre scorrendo venti articoli. */}
              {ddt?.destinazione !== "cantiere" && (scostamenti.mancanti > 0 || scostamenti.righeNonAbbinate > 0) && (
                <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 space-y-1">
                  {scostamenti.nonAllineato && <p>Residuo da verificare: le ricezioni registrate e il riepilogo OdA non sono allineati. Non ripetere le ricezioni già presenti.</p>}
                  {!scostamenti.nonAllineato && scostamenti.mancanti > 0 && (
                    <p className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Mancano ancora{" "}
                      <strong>
                        {scostamenti.mancanti.toLocaleString("it-IT", {
                          maximumFractionDigits: 2,
                        })}
                      </strong>{" "}
                      unità su {scostamenti.articoliIncompleti}{" "}
                      {scostamenti.articoliIncompleti === 1 ? "articolo" : "articoli"}{" "}
                      dell'ordine.
                    </p>
                  )}
                  {scostamenti.righeNonAbbinate > 0 && (
                    <p className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {scostamenti.righeNonAbbinate}{" "}
                      {scostamenti.righeNonAbbinate === 1 ? "riga" : "righe"} della bolla
                      non {scostamenti.righeNonAbbinate === 1 ? "è" : "sono"} abbinat
                      {scostamenti.righeNonAbbinate === 1 ? "a" : "e"} a un articolo
                      dell'ordine. Verifica se è merce aggiuntiva oppure una riga da
                      abbinare prima di registrare altre ricezioni.
                    </p>
                  )}
                </div>
              )}

              {isReceiptsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : isReceiptsError ? (
                <p className="text-sm text-destructive" role="alert">
                  Impossibile leggere le ricezioni. Ricarica la pagina prima di registrare altra merce.
                </p>
              ) : receipts.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  {odaConQuantitaRicevute
                    ? "Nessuna ricezione per articolo collegata a questa bolla. L’OdA riporta già quantità ricevute, anche tramite altri percorsi o altre bolle: verifica i Movimenti prima di registrare altra merce."
                    : "Nessuna ricezione per articolo collegata a questa bolla. Prima di registrare un arrivo, verifica che la merce non sia già stata caricata da un altro percorso."}
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
                  Articoli OdA · quantità ricevute complessive
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
                      const nonAllineata = ricezioneNonAllineata(it, receipts);
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
                                  Registrato sull’OdA:{" "}
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
                                    non collegato a un articolo della commessa
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {ddt?.destinazione !== "cantiere" && !isReceiving && pending > 0 && linkedToOrder && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReceiveFor(it.id)}
                                disabled={isReceiptsLoading || isReceiptsError || nonAllineata || !po || !["inviato", "confermato", "parziale"].includes(po.status)}
                                className="shrink-0"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Ricevi
                              </Button>
                            )}
                            {!isReceiving && pending === 0 && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                            )}
                          </div>

                          {po && !["inviato", "confermato", "parziale"].includes(po.status) && <p className="mt-2 text-sm text-amber-700" role="status">{po.status === "ricevuto"
                            ? "Ordine già ricevuto: consulta le ricezioni e i movimenti registrati prima di effettuare altre operazioni."
                            : po.status === "annullato"
                              ? "Ordine annullato: non è possibile registrare nuove ricezioni."
                              : `Ordine in stato ${po.status}: verifica e conferma l’ordine prima di registrare nuove ricezioni.`}</p>}
                          {nonAllineata && <p className="mt-2 text-sm text-amber-700" role="status">La ricezione è già registrata, ma il riepilogo OdA non è allineato{po?.status === "bozza" ? " perché l’ordine è ancora in bozza" : ""}. Controlla le ricezioni qui sopra e lo stato dell’ordine prima di aggiungere altra merce: ripetere la ricezione può duplicare la giacenza.</p>}
                          {isReceiptsError && <p className="mt-2 text-sm text-destructive" role="alert">Impossibile verificare le ricezioni esistenti. Ricarica la pagina prima di registrare altra merce.</p>}
                          {isReceiving && (
                            <div className="mt-3 p-3 rounded-md bg-muted/30 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    Quantità ricevuta
                                  </Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    step="1"
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
          </Card>}
        </div>

        {/* ─── COLONNA DESTRA: le schede brevi, una sotto l'altra ───
            11/11/2026 — Prima «Chi ha portato» stava da sola nella prima riga
            della griglia, alta quanto tutta la colonna della merce: sotto, uno
            spazio vuoto enorme, e «Dove si incastra» finiva in fondo alla
            pagina. Ora le schede brevi stanno insieme in una colonna sola,
            collegamenti per primi. Non sticky: la colonna è più alta dello
            schermo e la parte bassa diventerebbe irraggiungibile. */}
        <div className="space-y-5 min-w-0">
          <div className="hidden lg:block">
            <CollegamentiDDTCard ddt={ddt} ricezioni={receipts.length} onApriConsegne={apriConsegne} />
          </div>

          {/* ─── 4. CHI L'HA PORTATA: corriere, mezzo, autista, orari ─── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  {ritiro ? "Ritirata da noi" : "Chi ha portato la merce"}
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
              {!isEditingConsegna && (ddt.trasporto_a_cura_di || ddt.porto) && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {[ddt.trasporto_a_cura_di ? TRASPORTO_ETICHETTA[ddt.trasporto_a_cura_di] : null, ddt.porto ? `porto ${ddt.porto}` : null].filter(Boolean).join(" · ")}
                </p>
              )}
              {!isEditingConsegna ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
                  {/* Su un ritiro non c'è nessun corriere: c'è il nostro
                      furgone e il nostro uomo. Le celle vuote del corriere
                      erano il 99,6% delle bolle. */}
                  {!ritiro && (
                    <MetaCell
                      icon={Truck}
                      label={ddt.trasporto_a_cura_di === "terzi" ? "Corriere" : "Chi l'ha portata"}
                      value={ddt.corriere || "—"}
                      muted={!ddt.corriere}
                    />
                  )}
                  <MetaCell
                    icon={MapPin}
                    label={ritiro ? "Il nostro mezzo" : "Targa mezzo"}
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
                    label={ritiro ? "Chi è andato a ritirarla" : "Autista"}
                    value={ddt.autista_nome || "—"}
                    muted={!ddt.autista_nome}
                  />
                  {!ritiro && (
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
                  )}
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
                  {/* Una bolla vecchia, o caricata senza AI, deve poter dire
                      «questa l'abbiamo ritirata noi»: senza questo campo in
                      modifica, il ritiro si poteva dire solo alla creazione. */}
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" /> Chi ha portato la merce
                    </Label>
                    <Select
                      value={editConsegna.trasporto_a_cura_di || "non_so"}
                      onValueChange={(v) =>
                        setEditConsegna({
                          ...editConsegna,
                          trasporto_a_cura_di: v === "non_so" ? "" : v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non_so">Non si sa</SelectItem>
                        <SelectItem value="fornitore">L'ha portata il fornitore</SelectItem>
                        <SelectItem value="noi">Siamo andati a ritirarla</SelectItem>
                        <SelectItem value="terzi">Un corriere</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Il trasporto chi lo paga</Label>
                    <Select
                      value={editConsegna.porto || "non_so"}
                      onValueChange={(v) =>
                        setEditConsegna({ ...editConsegna, porto: v === "non_so" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non_so">Non si sa</SelectItem>
                        <SelectItem value="franco">Compreso nel prezzo (franco)</SelectItem>
                        <SelectItem value="assegnato">A nostro carico (assegnato)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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

          {/* ─── 5. CHI L'HA PRESA, E COM'ERA ─── */}
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
                <div className="grid grid-cols-2 gap-3">
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
                        <img loading="lazy"
                          src={ddt.signature_url}
                          alt="Firma"
                          className="h-10 bg-white border rounded-md px-1 group-hover:border-primary transition"
                        />
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted-foreground italic">
                          Nessuna
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

          <TimelineBolla ddt={ddt} />
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

const TRASPORTO_ETICHETTA: Record<"fornitore" | "noi" | "terzi", string> = {
  fornitore: "portata dal fornitore",
  noi: "ritirata da noi",
  terzi: "portata da un corriere",
};
