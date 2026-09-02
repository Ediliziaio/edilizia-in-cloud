import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Receipt, Sparkles, Check, User, Package, Loader2, Info, Plus, Trash2, ListPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import { useLinkFatturaOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import type { Installment } from "@/lib/orderUtils";
import type { ClienteSnapshot, RigaDocumento } from "@/types/fatturazione";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DetrazioniFiscaliFields } from "@/components/orders/DetrazioniFiscaliFields";
import { type DetrazioneValue, EMPTY_DETRAZIONE } from "@/lib/fatturazione/detrazioniEdilizie";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import { parseBonusLines, getPreset, causaleBonificoParlante } from "@/lib/orders/bonusFiscali";

// ── Types ────────────────────────────────────────────────────────

interface OrderItemRow {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  vat_rate: number | null;
  discount_percent: number | null;
  position: number | null;
}

interface CreaFatturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode: string | null;
  orderDescription: string;
  totalAmount: number;
  vatRate: number;
  customerId: string | null;
  customerName: string;
  installments: Installment[];
}

// ── Helpers ──────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  deposit: "Acconto",
  balance: "Saldo",
  financing: "Finanziamento",
};

function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a single invoice line from an order item (id stabile = item.id, così
 *  la selezione checkbox non salta a ogni ricalcolo). */
function buildRigaFromItem(item: OrderItemRow, defaultVat: number): RigaDocumento {
  const qty = item.quantity ?? 1;
  const unitPrice = item.unit_price ?? 0;
  const discountPct = item.discount_percent ?? 0;
  const aliquotaNum = item.vat_rate ?? defaultVat;
  const aliquota = String(aliquotaNum);

  const prezzoNetto = discountPct > 0
    ? round2(unitPrice * (1 - discountPct / 100))
    : unitPrice;

  const imponibile = round2(prezzoNetto * qty);
  const imposta = round2(imponibile * aliquotaNum / 100);
  const totaleRiga = round2(imponibile + imposta);

  let descrizione = item.name;
  if (item.description) descrizione += `\n${item.description}`;

  return {
    id: item.id, // id stabile dell'articolo
    numero_linea: 0, // rinumerato nella composizione finale
    descrizione,
    quantita: qty,
    unita_misura: "pz",
    prezzo_unitario: prezzoNetto,
    ...(discountPct > 0 && { sconto_percentuale: discountPct }),
    imponibile,
    aliquota_iva: aliquota,
    imposta,
    totale_riga: totaleRiga,
  };
}

/** Riga descrittiva LIBERA (aggiunta a mano): descrizione + qtà + prezzo + IVA.
 *  Serve per fatture che NON elencano gli articoli ma una prestazione/servizio. */
interface FreeLine {
  id: string;
  descrizione: string;
  quantita: number;
  prezzo: number;
  aliquota: number;
}

function freeLineToRiga(fl: FreeLine, defaultVat: number): RigaDocumento {
  const qty = fl.quantita > 0 ? fl.quantita : 1;
  const price = fl.prezzo || 0;
  const aliquotaNum = Math.max(0, fl.aliquota ?? defaultVat);
  const imponibile = round2(price * qty);
  const imposta = round2(imponibile * aliquotaNum / 100);
  return {
    id: fl.id,
    numero_linea: 0,
    descrizione: fl.descrizione.trim() || "Prestazione",
    quantita: qty,
    unita_misura: "pz",
    prezzo_unitario: price,
    imponibile,
    aliquota_iva: String(aliquotaNum),
    imposta,
    totale_riga: round2(imponibile + imposta),
  };
}

/** Build a single acconto line */
function buildRigaAcconto(
  installment: Installment,
  orderCode: string | null,
  orderDescription: string,
  defaultVat: number
): RigaDocumento {
  const tipoRata = installment.label || LABEL_MAP[installment.type] || "Pagamento";
  const codeStr = orderCode ? ` n. ${orderCode}` : "";
  const descShort = orderDescription.length > 80
    ? orderDescription.substring(0, 77) + "..."
    : orderDescription;

  const importoLordo = installment.amount || 0;
  // Clamp a >= 0: un'aliquota negativa renderebbe il divisore 0/NaN.
  const aliquotaNum = Math.max(0, defaultVat);
  const aliquota = String(aliquotaNum);
  const imponibile = round2(importoLordo / (1 + aliquotaNum / 100));
  const imposta = round2(importoLordo - imponibile);

  return {
    id: crypto.randomUUID(),
    numero_linea: 1,
    descrizione: `${tipoRata} commessa${codeStr} — ${descShort}`,
    quantita: 1,
    unita_misura: "pz",
    prezzo_unitario: imponibile,
    imponibile,
    aliquota_iva: aliquota,
    imposta,
    totale_riga: importoLordo,
  };
}

// ── Component ────────────────────────────────────────────────────

type InvoiceMode = "articoli" | "acconto";

export function CreaFatturaDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  orderDescription,
  totalAmount: _totalAmount,
  vatRate,
  customerId,
  customerName,
  installments,
}: CreaFatturaDialogProps) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const defaultVat = vatRate > 0 ? vatRate : 22;

  const [mode, setMode] = useState<InvoiceMode>("articoli");
  const [selectedInstId, setSelectedInstId] = useState<string | null>(null);
  // Articoli ESCLUSI dalla fattura (default: tutti inclusi). L'utente spunta via
  // ciò che non vuole in fattura → "solo alcuni articoli".
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());
  // Righe descrittive LIBERE aggiunte a mano (prestazioni/servizi senza articolo).
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [draft, setDraft] = useState<{ descrizione: string; quantita: string; prezzo: string; aliquota: string }>({
    descrizione: "", quantita: "1", prezzo: "", aliquota: "",
  });

  // Auto-select first unpaid installment when dialog opens
  useEffect(() => {
    if (open) {
      const firstUnpaid = installments.find(i => !i.is_paid);
      if (firstUnpaid) {
        setSelectedInstId(firstUnpaid.id || `pos-${firstUnpaid.position}`);
        // If it's a deposit type, default to acconto mode
        setMode(firstUnpaid.type === "deposit" ? "acconto" : "articoli");
      } else {
        setSelectedInstId(null);
        setMode("articoli");
      }
      // reset composizione a ogni apertura
      setExcludedItemIds(new Set());
      setFreeLines([]);
      setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
    }
  }, [open, installments]);

  // ── Fetch order items ────────────────────────────────────────
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["order-items-for-invoice", orderId],
    enabled: open && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, description, quantity, unit_price, vat_rate, discount_percent, position")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return (data || []) as OrderItemRow[];
    },
  });

  // ── Fetch matching anagrafica ────────────────────────────────
  const { data: matchedAnagrafica } = useQuery({
    queryKey: ["anagrafica-match", customerId, companyId],
    enabled: open && !!customerId && !!companyId,
    queryFn: async () => {
      const { data: byClienteId } = await (supabase as any)
        .from("anagrafiche_native")
        .select("*")
        .eq("company_id", companyId!)
        .eq("cliente_id", customerId!)
        .maybeSingle();
      if (byClienteId) return byClienteId;

      if (customerName) {
        const parts = customerName.trim().split(/\s+/);
        if (parts.length >= 2) {
          const { data: byName } = await (supabase as any)
            .from("anagrafiche_native")
            .select("*")
            .eq("company_id", companyId!)
            .or(`ragione_sociale.ilike.%${customerName}%,and(nome.ilike.%${parts[0]}%,cognome.ilike.%${parts[parts.length - 1]}%)`)
            .limit(1)
            .maybeSingle();
          if (byName) return byName;
        }
      }
      return null;
    },
  });

  // ── Derived data ─────────────────────────────────────────────
  const selectedInstallment = useMemo(() =>
    selectedInstId ? installments.find(i => (i.id || `pos-${i.position}`) === selectedInstId) : null,
    [installments, selectedInstId]
  );

  // Righe articolo INCLUSE (tutte tranne le escluse), con id stabile dell'articolo.
  const includedItemRighe = useMemo(
    () => orderItems.filter((it) => !excludedItemIds.has(it.id)).map((it) => buildRigaFromItem(it, defaultVat)),
    [orderItems, excludedItemIds, defaultVat],
  );

  // Composizione finale: base (acconto singola riga OPPURE articoli inclusi) +
  // righe libere. numero_linea rinumerato in sequenza.
  const previewRighe = useMemo(() => {
    const base = mode === "acconto" && selectedInstallment
      ? [buildRigaAcconto(selectedInstallment, orderCode, orderDescription, defaultVat)]
      : includedItemRighe;
    const free = freeLines.map((fl) => freeLineToRiga(fl, defaultVat));
    return [...base, ...free].map((r, i) => ({ ...r, numero_linea: i + 1 }));
  }, [mode, selectedInstallment, includedItemRighe, freeLines, orderCode, orderDescription, defaultVat]);

  const addFreeLine = () => {
    const descrizione = draft.descrizione.trim();
    if (!descrizione) { toast.error("Scrivi una descrizione per la riga"); return; }
    setFreeLines((prev) => [...prev, {
      id: crypto.randomUUID(),
      descrizione,
      quantita: Math.max(1, Number(draft.quantita) || 1),
      prezzo: Math.max(0, Number(draft.prezzo.replace(",", ".")) || 0),
      aliquota: draft.aliquota.trim() ? Math.max(0, Number(draft.aliquota)) : defaultVat,
    }]);
    setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
  };
  const removeFreeLine = (id: string) => setFreeLines((prev) => prev.filter((f) => f.id !== id));
  const toggleItem = (id: string) => setExcludedItemIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const totaleImponibile = useMemo(() => previewRighe.reduce((s, r) => s + r.imponibile, 0), [previewRighe]);
  const totaleIva = useMemo(() => previewRighe.reduce((s, r) => s + r.imposta, 0), [previewRighe]);
  const totaleLordo = useMemo(() => previewRighe.reduce((s, r) => s + r.totale_riga, 0), [previewRighe]);

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

  // Detrazioni fiscali edilizie + causale/note editabile (richiesta utente:
  // "permetti anche la modifica" + clausole detrazioni per l'edilizia).
  const [detrazione, setDetrazione] = useState<DetrazioneValue>(EMPTY_DETRAZIONE);

  // Commessa ripartita su più bonus: la fattura riguarda UNA pratica, quindi
  // una sola clausola. Qui la si sceglie invece di riscriverla a mano.
  const { bonusMultipli } = useBonusFiscaliFlags();
  const { data: bonusLines = [] } = useQuery({
    queryKey: ["order-bonus-lines", orderId],
    enabled: open && bonusMultipli && !!orderId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_bonus_lines")
        .select("*")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return parseBonusLines(data);
    },
  });
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const autoNote = useMemo(() => {
    const rataLabel = selectedInstallment
      ? `${selectedInstallment.label || LABEL_MAP[selectedInstallment.type] || "Pagamento"} — `
      : "";
    return `${rataLabel}Rif. commessa ${orderCode || ""} — ${orderDescription}`.trim();
  }, [selectedInstallment, orderCode, orderDescription]);
  // Reset a dialog chiusa.
  useEffect(() => {
    if (!open) {
      setDetrazione(EMPTY_DETRAZIONE);
      setNoteOverride(null);
    }
  }, [open]);

  const handleCreaFattura = () => {
    // Blocca la creazione di una fattura senza righe (non emettibile).
    if (previewRighe.length === 0) {
      toast.error("Nessuna riga da fatturare", {
        description: "Aggiungi almeno un articolo alla commessa o seleziona una rata.",
      });
      return;
    }

    const clienteSnapshot: ClienteSnapshot | undefined = matchedAnagrafica
      ? {
          ragione_sociale: matchedAnagrafica.ragione_sociale || customerName,
          nome: matchedAnagrafica.nome || undefined,
          cognome: matchedAnagrafica.cognome || undefined,
          partita_iva: matchedAnagrafica.partita_iva || undefined,
          codice_fiscale: matchedAnagrafica.codice_fiscale || undefined,
          codice_sdi: matchedAnagrafica.codice_sdi || undefined,
          pec: matchedAnagrafica.pec || undefined,
          indirizzo_via: matchedAnagrafica.indirizzo_via || undefined,
          indirizzo_cap: matchedAnagrafica.indirizzo_cap || undefined,
          indirizzo_comune: matchedAnagrafica.indirizzo_comune || undefined,
          indirizzo_provincia: matchedAnagrafica.indirizzo_provincia || undefined,
          indirizzo_nazione: matchedAnagrafica.indirizzo_nazione || "IT",
          tipo_cliente: matchedAnagrafica.tipo_cliente || "B2B",
          cig: matchedAnagrafica.cig || undefined,
          cup: matchedAnagrafica.cup || undefined,
        }
      : undefined;

    const earliestDate = selectedInstallment?.expected_date || undefined;

    // Causale/note: base editabile (autoNote o override) + eventuale dettaglio
    // manodopera. La clausola detrazioni va nel campo Causale (XML FatturaPA).
    const baseNote = (noteOverride ?? autoNote).trim();
    const extraNote: string[] = [];
    if (detrazione.active && detrazione.manodoperaEvidenzia && detrazione.manodoperaImporto.trim()) {
      extraNote.push(`Di cui costo manodopera: € ${detrazione.manodoperaImporto.trim()}`);
    }
    const noteDoc = [baseNote, ...extraNote].filter(Boolean).join(" — ");
    const causaleArr =
      detrazione.active && detrazione.clausola.trim() ? [detrazione.clausola.trim()] : undefined;

    createMutation.mutate(
      {
        tipo: "fattura" as const,
        ...(clienteSnapshot && { cliente_snapshot: clienteSnapshot }),
        ...(matchedAnagrafica?.id && { anagrafica_id: matchedAnagrafica.id }),
        righe: previewRighe,
        ordine_id: orderId,
        note_documento: noteDoc,
        ...(causaleArr && { causale: causaleArr }),
        ...(earliestDate && { data_scadenza: earliestDate }),
        ...(matchedAnagrafica?.metodo_pagamento_default && {
          metodo_pagamento_codice: matchedAnagrafica.metodo_pagamento_default,
        }),
      },
      {
        onSuccess: async (doc) => {
          // Crea il collegamento documento↔commessa in modo atomico prima di
          // navigare. Se il link fallisce non lasciamo la fattura "orfana"
          // senza avvisare l'utente (stesso pattern di CreaDDTDialog).
          if (companyId) {
            try {
              await linkMutation.mutateAsync({
                fatturaId: doc.id,
                ordineId: orderId,
                importoAssociato: totaleLordo,
                companyId,
              });
            } catch (err) {
              toast.error("Fattura creata ma collegamento commessa fallito", {
                description:
                  err instanceof Error ? err.message : "Apri il documento e riprova dal dettaglio.",
              });
              onOpenChange(false);
              navigate(`/azienda/documenti/${doc.id}?ordine_link=${orderId}`);
              return;
            }
          }
          onOpenChange(false);
          navigate(`/azienda/documenti/${doc.id}?ordine_link=${orderId}`);
        },
      }
    );
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Crea fattura da commessa {orderCode}
          </DialogTitle>
          <DialogDescription>
            Cliente e IVA sono precompilati dalla commessa. Scegli <strong>quali articoli</strong> mettere in
            fattura (o nessuno) e aggiungi <strong>righe descrittive libere</strong> per prestazioni/servizi.
          </DialogDescription>
        </DialogHeader>

        {/* ── Client banner ───────────────────────────────── */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{customerName}</p>
            {matchedAnagrafica ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-700">
                  Anagrafica trovata
                  {matchedAnagrafica.partita_iva && ` · P.IVA ${matchedAnagrafica.partita_iva}`}
                </span>
              </div>
            ) : (
              <span className="text-xs text-amber-600">
                Anagrafica non trovata — potrai selezionarla nell'editor
              </span>
            )}
          </div>
        </div>

        {/* ── Installment + Mode selector ─────────────────── */}
        {installments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rata di riferimento
              </p>
              <div className="flex flex-wrap gap-2">
                {installments.map((inst) => {
                  const key = inst.id || `pos-${inst.position}`;
                  const isSelected = selectedInstId === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedInstId(isSelected ? null : key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : inst.is_paid
                          ? "bg-muted/40 text-muted-foreground border-muted"
                          : "bg-white hover:bg-muted/30 border-border"
                      }`}
                    >
                      {inst.label || LABEL_MAP[inst.type] || "Pagamento"}
                      <span className="tabular-nums">{fmt(inst.amount || 0)}</span>
                      {inst.is_paid && (
                        <Check className="h-3 w-3 text-green-600 ml-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Mode toggle: articoli vs acconto */}
              {selectedInstallment && selectedInstallment.type === "deposit" && orderItems.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("articoli")}
                    className={`flex-1 text-xs py-2 px-3 rounded-md border transition-colors ${
                      mode === "articoli"
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-white hover:bg-muted/30 border-border text-muted-foreground"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                    Fattura con articoli
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("acconto")}
                    className={`flex-1 text-xs py-2 px-3 rounded-md border transition-colors ${
                      mode === "acconto"
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-white hover:bg-muted/30 border-border text-muted-foreground"
                    }`}
                  >
                    <Receipt className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                    Acconto singola riga
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* ── Composizione righe fattura ───────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Righe fattura ({previewRighe.length})
          </p>

          {itemsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Articoli della commessa con SELEZIONE (solo in modalità articoli):
                  spunta cosa mettere in fattura → "solo alcuni articoli". */}
              {mode === "articoli" && orderItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/60">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Package className="h-3 w-3" /> Articoli · {includedItemRighe.length}/{orderItems.length} in fattura
                    </span>
                    <div className="flex gap-2">
                      <button type="button" className="text-[10px] font-medium text-primary hover:underline" onClick={() => setExcludedItemIds(new Set())}>Tutti</button>
                      <button type="button" className="text-[10px] font-medium text-muted-foreground hover:underline" onClick={() => setExcludedItemIds(new Set(orderItems.map((i) => i.id)))}>Nessuno</button>
                    </div>
                  </div>
                  <div className="divide-y max-h-48 overflow-auto">
                    {orderItems.map((item) => {
                      const riga = buildRigaFromItem(item, defaultVat);
                      const included = !excludedItemIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`grid grid-cols-[22px_1fr_44px_74px_40px_74px] gap-1 px-3 py-2 text-xs items-start cursor-pointer transition-colors hover:bg-muted/30 ${included ? "" : "opacity-45"}`}
                        >
                          <Checkbox checked={included} onCheckedChange={() => toggleItem(item.id)} className="mt-0.5" />
                          <span className="leading-tight line-clamp-2 text-gray-800">{riga.descrizione}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                          <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Riga acconto (modalità acconto): singola riga read-only */}
              {mode === "acconto" && selectedInstallment && previewRighe[0] && (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  <span className="leading-tight text-gray-800">{previewRighe[0].descrizione}</span>
                  <span className="shrink-0 tabular-nums font-medium">{fmt(previewRighe[0].totale_riga)}</span>
                </div>
              )}

              {/* Righe descrittive LIBERE (prestazioni/servizi senza articolo) */}
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListPlus className="h-3 w-3" /> Righe descrittive (prestazioni, servizi, note)
                </div>
                {freeLines.length > 0 && (
                  <div className="divide-y">
                    {freeLines.map((fl) => {
                      const riga = freeLineToRiga(fl, defaultVat);
                      return (
                        <div key={fl.id} className="grid grid-cols-[1fr_44px_74px_40px_74px_26px] gap-1 px-3 py-2 text-xs items-center">
                          <span className="leading-tight line-clamp-2 text-gray-800">{riga.descrizione}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                          <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                          <button type="button" onClick={() => removeFreeLine(fl.id)} className="justify-self-end text-muted-foreground hover:text-red-600" title="Rimuovi riga">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_52px_72px_52px_auto] gap-1.5 border-t bg-background p-2 items-center">
                  <Input
                    value={draft.descrizione}
                    onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFreeLine(); } }}
                    placeholder="Descrizione (es. Manodopera, Sopralluogo…)"
                    className="h-8 text-xs"
                  />
                  <Input value={draft.quantita} onChange={(e) => setDraft((d) => ({ ...d, quantita: e.target.value }))} inputMode="decimal" placeholder="Qtà" className="h-8 text-xs text-right" title="Quantità" />
                  <Input value={draft.prezzo} onChange={(e) => setDraft((d) => ({ ...d, prezzo: e.target.value }))} inputMode="decimal" placeholder="Prezzo" className="h-8 text-xs text-right" title="Prezzo unitario (netto)" />
                  <Input value={draft.aliquota} onChange={(e) => setDraft((d) => ({ ...d, aliquota: e.target.value }))} inputMode="decimal" placeholder={`${defaultVat}`} className="h-8 text-xs text-right" title="Aliquota IVA %" />
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addFreeLine}>
                    <Plus className="h-3.5 w-3.5" /> Aggiungi
                  </Button>
                </div>
              </div>

              {/* Avviso fattura vuota */}
              {previewRighe.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>Nessuna riga selezionata: includi almeno un articolo o aggiungi una riga descrittiva.</span>
                </div>
              )}

              {/* Totali */}
              {previewRighe.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-0.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Imponibile</span>
                    <span className="tabular-nums">{fmt(totaleImponibile)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>IVA</span>
                    <span className="tabular-nums">{fmt(totaleIva)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-dashed">
                    <span>Totale fattura</span>
                    <span className="tabular-nums text-primary">{fmt(totaleLordo)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Causale editabile + detrazioni fiscali edilizie */}
        <Separator />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fattura-note" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Causale / note in fattura
            </Label>
            <Textarea
              id="fattura-note"
              value={noteOverride ?? autoNote}
              onChange={(e) => setNoteOverride(e.target.value)}
              rows={2}
              className="text-xs"
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              Modificabile. Righe e importi li rifinisci nell'editor che si apre dopo la creazione.
            </p>
          </div>
          {bonusLines.length > 0 && (
            <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2">
              <p className="text-xs font-semibold">A quale pratica si riferisce questa fattura?</p>
              <p className="text-[11px] text-muted-foreground">
                La commessa è divisa su {bonusLines.length} agevolazioni: scegline una e la clausola
                si compila da sola.
              </p>
              <div className="flex flex-wrap gap-2">
                {bonusLines.map((l) => {
                  const preset = getPreset(l.presetId);
                  const attiva = detrazione.active && detrazione.presetId === l.presetId;
                  return (
                    <Button
                      key={l.position}
                      type="button"
                      size="sm"
                      variant={attiva ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() =>
                        setDetrazione({
                          ...detrazione,
                          active: true,
                          presetId: l.presetId,
                          clausola: l.causale?.trim() || preset?.clausola || causaleBonificoParlante(l),
                          manodoperaEvidenzia:
                            detrazione.manodoperaEvidenzia || !!preset?.manodoperaConsigliata,
                        })
                      }
                    >
                      {l.label || preset?.label || "Agevolazione"} · {fmt(l.imponibile)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          <DetrazioniFiscaliFields value={detrazione} onChange={setDetrazione} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleCreaFattura}
            disabled={createMutation.isPending || previewRighe.length === 0}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Receipt className="h-4 w-4 mr-1.5" />
            )}
            {createMutation.isPending
              ? "Creazione in corso..."
              : `Crea fattura · ${fmt(totaleLordo)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
