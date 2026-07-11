import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Truck, Check, User, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import { useLinkFatturaOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import type { ClienteSnapshot } from "@/types/fatturazione";
import { useRigheComposer, type RigaComposerItem } from "@/components/orders/RigheComposer";

// ── Types ────────────────────────────────────────────────────────

type OrderItemRow = RigaComposerItem;

interface CreaDDTDialogProps {
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

const CAUSALI_TRASPORTO = [
  { value: "vendita", label: "Vendita" },
  { value: "reso", label: "Reso" },
  { value: "omaggio", label: "Omaggio" },
  { value: "conto_lavoro", label: "Conto lavoro" },
  { value: "deposito", label: "Deposito" },
  { value: "esposizione", label: "Esposizione" },
  { value: "riparazione", label: "Riparazione" },
  { value: "altro", label: "Altro" },
];

// ── Component ────────────────────────────────────────────────────

export function CreaDDTDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  orderDescription,
  totalAmount: _totalAmount,
  vatRate,
  customerId,
  customerName,
}: CreaDDTDialogProps) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const defaultVat = vatRate > 0 ? vatRate : 22;

  // DDT-specific fields
  const [causaleTrasporto, setCausaleTrasporto] = useState("vendita");
  const [porto, setPorto] = useState("Franco");
  const [aspettoBeni, setAspettoBeni] = useState("");
  const [numeroColli, setNumeroColli] = useState("");
  const [pesoKg, setPesoKg] = useState("");

  // Reset fields on open
  useEffect(() => {
    if (open) {
      setCausaleTrasporto("vendita");
      setPorto("Franco");
      setAspettoBeni("");
      setNumeroColli("");
      setPesoKg("");
    }
  }, [open]);

  // ── Fetch order items ────────────────────────────────────────
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["order-items-for-ddt", orderId],
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
      const { data: byClienteId } = await supabase
        .from("anagrafiche_native")
        .select("*")
        .eq("company_id", companyId!)
        .eq("cliente_id", customerId!)
        .maybeSingle();
      if (byClienteId) return byClienteId;

      if (customerName) {
        const parts = customerName.trim().split(/\s+/);
        if (parts.length >= 2) {
          const { data: byName } = await supabase
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
    orderItems, defaultVat, itemsLoading, open, label: "Righe DDT",
  });
  const totaleLordo = totals.lordo;

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

  const handleCreaDDT = () => {
    // P2 FIX: blocca creazione DDT vuoto (non conforme normativo).
    if (previewRighe.length === 0) {
      toast.error("Impossibile creare un DDT senza righe", {
        description: "Aggiungi almeno un articolo alla commessa prima di generare il DDT.",
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

    const noteDoc = `DDT per commessa ${orderCode || ""} — ${orderDescription}`.trim();

    createMutation.mutate(
      {
        tipo: "ddt" as const,
        ...(clienteSnapshot && { cliente_snapshot: clienteSnapshot }),
        ...(matchedAnagrafica?.id && { anagrafica_id: matchedAnagrafica.id }),
        righe: previewRighe,
        ordine_id: orderId,
        note_documento: noteDoc,
        // DDT-specific fields
        ddt_causale_trasporto: causaleTrasporto,
        ddt_porto: porto,
        ...(aspettoBeni && { ddt_aspetto_beni: aspettoBeni }),
        ...(numeroColli && { ddt_numero_colli: parseInt(numeroColli, 10) || undefined }),
        ...(pesoKg && { ddt_peso: parseFloat(pesoKg) || undefined }),
      },
      {
        onSuccess: async (doc) => {
          // P1 FIX: await linkMutation così DDT e link sono creati
          // atomicamente prima di navigare. Se il link fallisce, non
          // chiudiamo il dialog (il DDT esiste, ma è orfano — l'utente
          // deve sapere che deve ripetere l'operazione manualmente dal documento).
          if (companyId) {
            try {
              await linkMutation.mutateAsync({
                fatturaId: doc.id,
                ordineId: orderId,
                importoAssociato: totaleLordo,
                companyId,
              });
            } catch (err) {
              toast.error("DDT creato ma collegamento commessa fallito", {
                description:
                  err instanceof Error ? err.message : "Apri il documento e riprova dal dettaglio.",
              });
              // Navighiamo comunque al DDT così l'utente può verificare
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

  // Compute total colli from the composed lines (rispetta le esclusioni)
  const autoColli = useMemo(
    () => previewRighe.reduce((sum, r) => sum + (r.quantita ?? 1), 0),
    [previewRighe]
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Crea DDT da commessa {orderCode}
          </DialogTitle>
          <DialogDescription>
            Documento di Trasporto. Scegli quali articoli inserire (o nessuno) e aggiungi righe
            descrittive libere. Potrai modificarlo nell'editor prima di emetterlo.
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

        {/* ── DDT Transport fields ───────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Dati trasporto
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Causale trasporto</Label>
              <Select value={causaleTrasporto} onValueChange={setCausaleTrasporto}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAUSALI_TRASPORTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porto</Label>
              <Select value={porto} onValueChange={setPorto}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Franco">Franco (mittente)</SelectItem>
                  <SelectItem value="Assegnato">Assegnato (destinatario)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aspetto beni</Label>
              <Input
                className="h-8 text-xs"
                placeholder="es. Cartoni, Bancali..."
                value={aspettoBeni}
                onChange={(e) => setAspettoBeni(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">N. colli</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  placeholder={String(autoColli)}
                  value={numeroColli}
                  onChange={(e) => setNumeroColli(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Peso (kg)</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  value={pesoKg}
                  onChange={(e) => setPesoKg(e.target.value)}
                />
              </div>
            </div>
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
            onClick={handleCreaDDT}
            disabled={createMutation.isPending || previewRighe.length === 0}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Truck className="h-4 w-4 mr-1.5" />
            )}
            {createMutation.isPending
              ? "Creazione in corso..."
              : "Crea DDT"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
