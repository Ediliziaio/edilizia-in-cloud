import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Check, User, Loader2 } from "lucide-react";
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
import type { ClienteSnapshot } from "@/types/fatturazione";
import { useRigheComposer, type RigaComposerItem } from "@/components/orders/RigheComposer";

// ── Types ────────────────────────────────────────────────────────

type OrderItemRow = RigaComposerItem;

interface CreaProformaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode: string | null;
  orderDescription: string;
  totalAmount: number;
  vatRate: number;
  customerId: string | null;
  customerName: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(value);
}

// ── Component ────────────────────────────────────────────────────

export function CreaProformaDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  orderDescription,
  totalAmount: _totalAmount,
  vatRate,
  customerId,
  customerName,
}: CreaProformaDialogProps) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const defaultVat = vatRate > 0 ? vatRate : 22;

  // ── Fetch order items ────────────────────────────────────────
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["order-items-for-proforma", orderId],
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

  // ── Composizione righe flessibile (articoli selezionabili + righe libere) ──
  const { righe: previewRighe, totals, node: composerNode } = useRigheComposer({
    orderItems, defaultVat, itemsLoading, open, label: "Righe proforma",
  });
  const totaleLordo = totals.lordo;

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

  const handleCreaProforma = () => {
    // Blocca la creazione di una proforma senza righe.
    if (previewRighe.length === 0) {
      toast.error("Nessuna riga da fatturare", {
        description: "Aggiungi almeno un articolo alla commessa prima di generare la proforma.",
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
        }
      : undefined;

    const noteDoc = `Proforma per commessa ${orderCode || ""} — ${orderDescription}`.trim();

    createMutation.mutate(
      {
        tipo: "proforma" as const,
        ...(clienteSnapshot && { cliente_snapshot: clienteSnapshot }),
        ...(matchedAnagrafica?.id && { anagrafica_id: matchedAnagrafica.id }),
        righe: previewRighe,
        ordine_id: orderId,
        note_documento: noteDoc,
        ...(matchedAnagrafica?.metodo_pagamento_default && {
          metodo_pagamento_codice: matchedAnagrafica.metodo_pagamento_default,
        }),
      },
      {
        onSuccess: async (doc) => {
          // Collegamento documento↔commessa atomico (stesso pattern di CreaDDTDialog).
          if (companyId) {
            try {
              await linkMutation.mutateAsync({
                fatturaId: doc.id,
                ordineId: orderId,
                importoAssociato: totaleLordo,
                companyId,
              });
            } catch (err) {
              toast.error("Proforma creata ma collegamento commessa fallito", {
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
            <FileText className="h-5 w-5 text-primary" />
            Crea proforma da commessa {orderCode}
          </DialogTitle>
          <DialogDescription>
            Documento proforma non fiscale. Scegli quali articoli includere (o nessuno) e aggiungi
            righe descrittive libere. Potrai convertirlo in fattura quando necessario.
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

        <Separator />

        {/* ── Composizione righe (articoli selezionabili + righe libere) ── */}
        {composerNode}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleCreaProforma}
            disabled={createMutation.isPending || previewRighe.length === 0}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-1.5" />
            )}
            {createMutation.isPending
              ? "Creazione in corso..."
              : `Crea proforma · ${fmt(totaleLordo)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
