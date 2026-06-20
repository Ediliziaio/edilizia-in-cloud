/**
 * TrasformaDialog — genera un PREVENTIVO (`quotes` + `quote_items`) o una
 * COMMESSA (`orders` via RPC `create_order_atomic`) dalle voci simulate,
 * riusando i flussi di creazione ESISTENTI (numerazione, RPC, righe).
 *
 * Preventivo (come QuoteBuilder.tsx):
 *   1. `generate_quote_number(p_company_id)` → quote_number progressivo.
 *   2. INSERT `quotes` (status 'bozza', title = nome simulazione, vat_amount/
 *      subtotal/total dal risultato, contact_id dalla simulazione, created_by).
 *   3. RPC `save_quote_items_atomic(p_quote_id, p_company_id, p_items)` con le
 *      voci mappate (line_total è GENERATED a DB → non inviato).
 *   4. naviga a `/azienda/marketing/preventivi/:id`.
 *
 * Commessa (come CreateOrder.tsx):
 *   - selezione cliente esistente (`useCompanyCustomers`) o creazione inline
 *     (`CreateCustomerDialog`) + stato iniziale (`order_statuses`).
 *   - RPC `create_order_atomic({ p_order_data, p_items, p_salesperson,
 *     p_user_id, p_installments })` con payload mappato (ritorna `{ id }`).
 *   - naviga a `/azienda/ordini/:id`.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, ClipboardList, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { friendlyPostgresError } from "@/lib/postgresErrors";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { mapVociToQuoteItems, mapToOrderPayload } from "@/lib/simulatore/trasforma";
import { round2 } from "@/lib/simulatore/calcoli";
import type { SimulazioneDoc, SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface TrasformaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: SimulazioneDoc;
  risultato: SimulazioneRisultato;
  simulazioneNome: string;
  /** Contatto marketing collegato alla simulazione (prefill client del preventivo). */
  contactId?: string | null;
}

type Modo = "preventivo" | "commessa";

interface OrderStatusRow {
  id: string;
  name: string;
  is_default: boolean | null;
  position: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Costo del finanziamento (interessi + spese) stimato dal risultato:
 * rata × numero_rate − importo_finanziato. Serve a popolare
 * `financing_cost` della commessa coerentemente con CreateOrder.
 */
function stimaCostoFinanziamento(
  doc: SimulazioneDoc,
  risultato: SimulazioneRisultato,
): number {
  const fin = doc.scenari.finanziamento;
  if (!fin || risultato.rata_mensile == null || !fin.numero_rate) return 0;
  const totaleDovuto = risultato.rata_mensile * fin.numero_rate;
  return Math.max(0, round2(totaleDovuto - fin.importo_finanziato));
}

export function TrasformaDialog({
  open,
  onOpenChange,
  doc,
  risultato,
  simulazioneNome,
  contactId = null,
}: TrasformaDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();

  const [modo, setModo] = useState<Modo>("preventivo");
  const [customerId, setCustomerId] = useState<string>("");
  // `null` = nessuna scelta esplicita → si usa lo stato di default della company.
  const [statusIdRaw, setStatusIdRaw] = useState<string | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset alla chiusura (evita setState-in-effect: il reset è guidato
  // dall'azione di chiusura, non da un effetto sull'`open`).
  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setModo("preventivo");
      setCustomerId("");
      setStatusIdRaw(null);
    }
    onOpenChange(next);
  };

  const { data: customers = [] } = useCompanyCustomers(companyId, open && modo === "commessa");

  const { data: statuses = [] } = useQuery<OrderStatusRow[]>({
    // Chiave dedicata (non condivisa con CreateOrder, che seleziona anche `color`).
    queryKey: ["order-statuses-trasforma", companyId],
    enabled: !!companyId && open && modo === "commessa",
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, is_default, position")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as OrderStatusRow[];
    },
  });

  // Stato iniziale effettivo: scelta esplicita oppure default della company
  // (derivato a render, senza setState-in-effect).
  const statusId =
    statusIdRaw ??
    statuses.find((s) => s.is_default)?.id ??
    statuses[0]?.id ??
    "";

  const hasVoci = doc.voci.length > 0;
  const titoloPreventivo = simulazioneNome.trim() || "Preventivo da simulazione";

  // ── Crea preventivo (flusso reale di QuoteBuilder) ──────────────────────────
  const creaPreventivo = async () => {
    if (!companyId || !user?.id) {
      toast.error("Sessione non valida", { description: "Azienda o utente non disponibili." });
      return;
    }
    setBusy(true);
    try {
      // 1) quote_number progressivo (RPC condivisa col QuoteBuilder).
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId,
      });
      const quoteNumber = (numData as string | null) || `OFF-${new Date().getFullYear()}-001`;

      // 2) INSERT quotes (denormalizzati dal risultato della simulazione).
      const subtotal = round2(risultato.ricavo_imponibile);
      const vatAmount = round2(risultato.iva_totale);
      const total = round2(risultato.prezzo_cliente);
      const quoteData: Record<string, unknown> = {
        company_id: companyId,
        quote_number: quoteNumber,
        status: "bozza",
        title: titoloPreventivo,
        contact_id: contactId,
        created_by: user.id,
        subtotal,
        discount_amount: 0,
        vat_amount: vatAmount,
        total,
      };
      const { data: quoteRow, error: quoteErr } = await sb
        .from("quotes")
        .insert(quoteData)
        .select("id")
        .single();
      if (quoteErr) throw quoteErr;
      const quoteId = quoteRow.id as string;

      // 3) Righe via RPC atomica (line_total è GENERATED → escluso dal payload).
      if (hasVoci) {
        const items = mapVociToQuoteItems(doc.voci, companyId, quoteId).map((it) => ({
          name: it.name,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
          unit_of_measure: it.unit_of_measure,
          item_category: it.item_category,
          item_type: it.item_type,
          tariffa_id: it.tariffa_id,
          sort_order: it.sort_order,
        }));
        const { error: rpcErr } = await supabase.rpc("save_quote_items_atomic", {
          p_quote_id: quoteId,
          p_company_id: companyId,
          p_items: items,
        });
        if (rpcErr) throw rpcErr;
      }

      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Preventivo creato", {
        description: `${quoteNumber} generato dalla simulazione.`,
      });
      onOpenChange(false);
      navigate(`/azienda/marketing/preventivi/${quoteId}`);
    } catch (err) {
      const { title, description } = friendlyPostgresError(err, {
        operation: "creazione preventivo",
      });
      toast.error(title, { description });
    } finally {
      setBusy(false);
    }
  };

  // ── Crea commessa (flusso reale di CreateOrder via create_order_atomic) ──────
  const creaCommessa = async () => {
    if (!companyId || !user?.id) {
      toast.error("Sessione non valida", { description: "Azienda o utente non disponibili." });
      return;
    }
    if (!customerId) {
      toast.error("Cliente mancante", { description: "Seleziona o crea un cliente per la commessa." });
      return;
    }
    if (!statusId) {
      toast.error("Stato mancante", { description: "Seleziona lo stato iniziale della commessa." });
      return;
    }
    setBusy(true);
    try {
      const payload = mapToOrderPayload(doc, risultato, {
        companyId,
        customerId,
        userId: user.id,
        statusId,
        description: titoloPreventivo,
        financingCost: stimaCostoFinanziamento(doc, risultato),
      });

      const createOrderAtomic = supabase.rpc as unknown as (
        fn: "create_order_atomic",
        args: Record<string, unknown>,
      ) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      const { data, error } = await createOrderAtomic("create_order_atomic", payload);
      if (error) throw error;
      const result = data as unknown as { id: string } | null;
      if (!result?.id) throw new Error("Risposta inattesa dalla funzione atomica");

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
      toast.success("Commessa creata", { description: "Commessa generata dalla simulazione." });
      onOpenChange(false);
      navigate(`/azienda/ordini/${result.id}`);
    } catch (err) {
      const { title, description } = friendlyPostgresError(err, {
        operation: "creazione commessa",
      });
      toast.error(title, { description });
    } finally {
      setBusy(false);
    }
  };

  const customerLabel = useMemo(
    () => (c: { first_name: string | null; last_name: string | null; email?: string | null }) =>
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() + (c.email ? ` (${c.email})` : ""),
    [],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trasforma simulazione</DialogTitle>
            <DialogDescription>
              Genera un documento dalle voci simulate riutilizzando i flussi esistenti.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Scelta tipo documento */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModo("preventivo")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  modo === "preventivo"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-input hover:bg-accent",
                )}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Preventivo</span>
                <span className="text-xs text-muted-foreground">
                  Bozza nel CRM con le voci
                </span>
              </button>
              <button
                type="button"
                onClick={() => setModo("commessa")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  modo === "commessa"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-input hover:bg-accent",
                )}
              >
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Commessa</span>
                <span className="text-xs text-muted-foreground">
                  Ordine per un cliente
                </span>
              </button>
            </div>

            {/* Riepilogo importi */}
            <div className="rounded-lg border bg-secondary/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Imponibile</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(risultato.ricavo_imponibile)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(risultato.iva_totale)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t pt-1">
                <span className="font-semibold">Totale cliente</span>
                <span className="font-bold tabular-nums">
                  {formatCurrency(risultato.prezzo_cliente)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {doc.voci.length} {doc.voci.length === 1 ? "voce" : "voci"}
                {risultato.durata_settimane > 0
                  ? ` · ${risultato.durata_settimane} settimane`
                  : ""}
              </p>
            </div>

            {/* Campi specifici commessa */}
            {modo === "commessa" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <div className="flex gap-2">
                    <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleziona un cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>
                          Seleziona un cliente
                        </SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {customerLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowCreateCustomer(true)}
                      title="Nuovo cliente"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Stato iniziale</Label>
                  <Select value={statusId || "__none__"} onValueChange={(v) => setStatusIdRaw(v === "__none__" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>
                        Seleziona stato
                      </SelectItem>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!hasVoci && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                La simulazione non ha voci: il documento verrà creato vuoto.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Annulla
            </Button>
            <Button
              onClick={modo === "preventivo" ? creaPreventivo : creaCommessa}
              disabled={busy || (modo === "commessa" && (!customerId || !statusId))}
              className="gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {modo === "preventivo" ? "Crea preventivo" : "Crea commessa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        onCustomerCreated={(newId) => setCustomerId(newId)}
      />
    </>
  );
}
