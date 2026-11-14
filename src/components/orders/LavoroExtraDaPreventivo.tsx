/**
 * Un preventivo accettato dal committente diventa un lavoro extra su una sua commessa già aperta (10/11/2026).
 * Dalla scheda committente si arriva qui con `?lavoro_extra_da=<preventivo>`: si apre il popup «Lavori extra e
 * varianti» col lavoro extra già scritto dalle voci del preventivo. Il resto è il flusso di sempre — rivedi, PDF,
 * firma online o copia firmata — e all'approvazione nasce la fase nelle Lavorazioni.
 *
 * Quando il lavoro extra è salvato, il preventivo diventa «convertito» e ricorda la variante (quotes.variante_id):
 * non si usa una seconda volta, né per un'altra variante né per una commessa. Dal 14/11/2026 lo lega la funzione
 * `preventivo_diventa_lavoro_extra`, che lo rifiuta se nel frattempo è stato usato.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { emptyVariationDraft } from "@/lib/orders/variationDraft";
import { bozzaLavoroExtra, type RigaPerVariante, type TestataPerVariante } from "@/lib/preventivi/preventiviCommittente";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OdVSection } from "./OdVSection";
import type { VariationContext } from "./VariationEditor";

export function LavoroExtraDaPreventivo({ quoteId, orderId, companyId, context, onChiudi }: {
  quoteId: string;
  orderId: string;
  companyId: string;
  context: VariationContext;
  onChiudi: () => void;
}) {
  const queryClient = useQueryClient();
  const [idVariante] = useState(() => crypto.randomUUID());
  const preventivo = useQuery({
    queryKey: ["lavoro-extra-da-preventivo", quoteId, companyId],
    staleTime: Infinity,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: q, error: e1 }, { data: righe, error: e2 }, { data: giaCommessa, error: e3 }] = await Promise.all([
        db.from("quotes")
          .select("id, status, variante_id, quote_number, title, description, signed_at, signed_by_name, subtotal, discount_amount, total, vat_amount")
          .eq("id", quoteId).eq("company_id", companyId).maybeSingle(),
        db.from("quote_items")
          .select("name, description, quantity, unit_price, unit_of_measure, item_category, is_optional, discount_percent")
          .eq("quote_id", quoteId).order("sort_order"),
        // Un preventivo diventato commessa resta «accettata»: va escluso anche lui (14/11/2026).
        db.from("orders").select("id").eq("quote_id", quoteId).eq("company_id", companyId).is("deleted_at", null).limit(1),
      ]);
      if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
      if (!q) throw new Error("Preventivo non trovato.");
      if (q.status !== "accettata" || q.variante_id || (giaCommessa ?? []).length > 0) {
        throw new Error("Questo preventivo non è accettato, oppure è già diventato una commessa o un lavoro extra.");
      }
      return { q: q as TestataPerVariante, righe: (righe ?? []) as RigaPerVariante[] };
    },
  });
  const bozza = useMemo(() => (preventivo.data ? bozzaLavoroExtra(preventivo.data.q, preventivo.data.righe, {
    ...emptyVariationDraft(),
    documentCompanyName: context.companyName, documentCompanyDetails: context.companyDetails,
    documentCustomerName: context.customerName, documentCustomerDetails: context.customerAddress,
  }) : null), [preventivo.data, context.companyName, context.companyDetails, context.customerName, context.customerAddress]);

  /** Alla chiusura del lavoro extra: se è stato salvato, il preventivo lo ricorda e diventa convertito. */
  const chiusa = async () => {
    try {
      const { data: variante } = await supabase.from("ordini_variazione").select("id").eq("id", idVariante).eq("order_id", orderId).maybeSingle();
      if (variante) {
        // Lo lega il database (20290321100000), col permesso sulle commesse e sotto lock: l'UPDATE diretto su quotes,
        // per chi non ha il permesso sui preventivi, toccava 0 righe in silenzio e il preventivo restava riusabile.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc("preventivo_diventa_lavoro_extra", { p_quote: quoteId, p_variante: idVariante });
        if (error) throw new Error(error.message ?? "Collegamento non riuscito.");
        toast.success("Lavoro extra creato dal preventivo", { description: "Mandalo da firmare o carica la copia firmata: all'approvazione diventa una fase." });
        queryClient.invalidateQueries({ queryKey: ["preventivi-committente"] });
        queryClient.invalidateQueries({ queryKey: ["preventivi-cliente"] });
        queryClient.invalidateQueries({ queryKey: ["preventivi-per-commessa"] });
      }
    } catch (e) {
      toast.error("Il lavoro extra c'è, ma il preventivo non risulta collegato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      onChiudi();
    }
  };

  if (preventivo.isError) {
    return (
      <Dialog open onOpenChange={(o) => !o && onChiudi()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lavoro extra dal preventivo</DialogTitle>
            <DialogDescription>{preventivo.error instanceof Error ? preventivo.error.message : "Preventivo non leggibile."}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }
  if (!bozza) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Lavoro extra dal preventivo {preventivo.data?.q.quote_number ?? ""}</DialogTitle>
          <DialogDescription>Voci e importo vengono dal preventivo accettato. Controlla e salva.</DialogDescription>
        </DialogHeader>
        <OdVSection orderId={orderId} companyId={companyId} context={context} bozzaIniziale={{ id: idVariante, bozza }} onBozzaChiusa={() => void chiusa()} />
      </DialogContent>
    </Dialog>
  );
}
