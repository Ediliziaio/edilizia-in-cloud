import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Truck, Sparkles, Check, User, Loader2, Info } from "lucide-react";
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

function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build DDT lines from order items */
function buildRigheFromItems(
  items: OrderItemRow[],
  defaultVat: number
): RigaDocumento[] {
  return items.map((item, idx) => {
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

  // ── Derived data ─────────────────────────────────────────────
  const previewRighe = useMemo(
    () => buildRigheFromItems(orderItems, defaultVat),
    [orderItems, defaultVat]
  );

  const totaleImponibile = useMemo(() => previewRighe.reduce((s, r) => s + r.imponibile, 0), [previewRighe]);
  const totaleIva = useMemo(() => previewRighe.reduce((s, r) => s + r.imposta, 0), [previewRighe]);
  const totaleLordo = useMemo(() => previewRighe.reduce((s, r) => s + r.totale_riga, 0), [previewRighe]);

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

  const handleCreaDDT = () => {
    // P2 FIX: blocca creazione DDT vuoto (non conforme normativo).
    if (previewRighe.length === 0) {
      toast.error("Impossibile creare un DDT senza righe", {
        description: "Aggiungi almeno un articolo all'ordine prima di generare il DDT.",
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

    const noteDoc = `DDT per ordine ${orderCode || ""} — ${orderDescription}`.trim();

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
              toast.error("DDT creato ma collegamento ordine fallito", {
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

  // Compute total colli from items if not manually set
  const autoColli = useMemo(
    () => orderItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    [orderItems]
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Crea DDT da ordine {orderCode}
          </DialogTitle>
          <DialogDescription>
            Documento di Trasporto — i dati del cliente e gli articoli verranno compilati dall'ordine.
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

        {/* ── DDT lines preview ──────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Articoli DDT ({previewRighe.length})
          </p>

          {itemsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : previewRighe.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Info className="h-4 w-4 shrink-0" />
              <span>Nessun articolo trovato nell'ordine. Il DDT verrà creato vuoto.</span>
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
                  <span>Totale DDT</span>
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
            onClick={handleCreaDDT}
            disabled={createMutation.isPending}
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
