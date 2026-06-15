import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Receipt, Sparkles, Check, User, Package, Loader2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import { useLinkFatturaOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import type { Installment } from "@/lib/orderUtils";
import type { ClienteSnapshot, RigaDocumento } from "@/types/fatturazione";

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
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build invoice lines from order items */
function buildRigheFromItems(
  items: OrderItemRow[],
  orderCode: string | null,
  defaultVat: number
): RigaDocumento[] {
  return items.map((item, idx) => {
    const qty = item.quantity ?? 1;
    const unitPrice = item.unit_price ?? 0;
    const discountPct = item.discount_percent ?? 0;
    const aliquotaNum = item.vat_rate ?? defaultVat;
    const aliquota = String(aliquotaNum);

    // Prezzo unitario netto (senza sconto)
    const prezzoNetto = discountPct > 0
      ? round2(unitPrice * (1 - discountPct / 100))
      : unitPrice;

    const imponibile = round2(prezzoNetto * qty);
    const imposta = round2(imponibile * aliquotaNum / 100);
    const totaleRiga = round2(imponibile + imposta);

    // Build rich description
    let descrizione = item.name;
    if (item.description) {
      descrizione += `\n${item.description}`;
    }

    return {
      id: crypto.randomUUID(),
      numero_linea: idx + 1,
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
  });
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

  const previewRighe = useMemo(() => {
    if (mode === "acconto" && selectedInstallment) {
      return [buildRigaAcconto(selectedInstallment, orderCode, orderDescription, defaultVat)];
    }
    return buildRigheFromItems(orderItems, orderCode, defaultVat);
  }, [mode, selectedInstallment, orderItems, orderCode, orderDescription, defaultVat]);

  const totaleImponibile = useMemo(() => previewRighe.reduce((s, r) => s + r.imponibile, 0), [previewRighe]);
  const totaleIva = useMemo(() => previewRighe.reduce((s, r) => s + r.imposta, 0), [previewRighe]);
  const totaleLordo = useMemo(() => previewRighe.reduce((s, r) => s + r.totale_riga, 0), [previewRighe]);

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

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

    // Build causale/note
    const rataLabel = selectedInstallment
      ? `${selectedInstallment.label || LABEL_MAP[selectedInstallment.type] || "Pagamento"} — `
      : "";
    const noteDoc = `${rataLabel}Rif. commessa ${orderCode || ""} — ${orderDescription}`.trim();

    createMutation.mutate(
      {
        tipo: "fattura" as const,
        ...(clienteSnapshot && { cliente_snapshot: clienteSnapshot }),
        ...(matchedAnagrafica?.id && { anagrafica_id: matchedAnagrafica.id }),
        righe: previewRighe,
        ordine_id: orderId,
        note_documento: noteDoc,
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
            I dati del cliente, gli articoli e l'IVA verranno compilati automaticamente dalla commessa.
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

        {/* ── Invoice lines preview ───────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Righe fattura ({previewRighe.length})
          </p>

          {itemsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : previewRighe.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Info className="h-4 w-4 shrink-0" />
              <span>Nessun articolo trovato nella commessa. La fattura verrà creata vuota.</span>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_50px_80px_45px_70px] gap-1 px-3 py-1.5 bg-muted/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Descrizione</span>
                <span className="text-right">Qtà</span>
                <span className="text-right">Prezzo</span>
                <span className="text-right">IVA</span>
                <span className="text-right">Totale</span>
              </div>
              {/* Rows */}
              <div className="divide-y max-h-48 overflow-auto">
                {previewRighe.map((riga) => (
                  <div
                    key={riga.id}
                    className="grid grid-cols-[1fr_50px_80px_45px_70px] gap-1 px-3 py-2 text-xs items-start"
                  >
                    <span className="text-gray-800 leading-tight line-clamp-2">
                      {riga.descrizione}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {riga.quantita}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {fmt(riga.prezzo_unitario)}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {riga.aliquota_iva}%
                    </span>
                    <span className="text-right tabular-nums font-medium">
                      {fmt(riga.totale_riga)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="bg-muted/30 border-t px-3 py-2 space-y-0.5">
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
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleCreaFattura}
            disabled={createMutation.isPending}
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
