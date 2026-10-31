/**
 * IVA della commessa (31/10/2026): a debito, a credito, reverse charge e saldo (funzione commessa_iva).
 * Pensata come la legge l'amministrazione: l'IVA delle vendite si versa; quella degli acquisti con IVA in
 * fattura si scala; il reverse charge (subappalti edili, estero) si integra e si detrae insieme, quindi non
 * cambia il saldo e non compensa l'IVA delle vendite.
 */
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { normalizzaIvaCommessa, saldoIva } from "@/lib/orders/ivaCommessa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function IvaCommessa({ orderId }: { orderId: string }) {
  const q = useQuery({
    queryKey: ["commessa-iva", orderId],
    queryFn: async () => {
      const { data, error } = await db.rpc("commessa_iva", { p_order_id: orderId });
      if (error) throw error;
      return normalizzaIvaCommessa(data);
    },
  });
  if (q.isLoading) return null;
  if (q.isError) return <p role="alert" className="text-sm text-muted-foreground">IVA della commessa non disponibile. <button className="underline" onClick={() => void q.refetch()}>Riprova</button></p>;
  const d = q.data;
  if (!d) return null;
  const oggi = saldoIva(d.debito_fatturato, d.credito_fatture);
  const fine = saldoIva(Math.max(d.debito_previsto, d.debito_fatturato), d.credito_fatture + d.credito_previsto_costi + d.credito_previsto_ditte);
  const aliquota = d.aliquota.toLocaleString("it-IT");
  const riga = (etichetta: string, valore: number, nota?: string, forte = false) => (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <div className="min-w-0">
        <p className={forte ? "font-semibold" : ""}>{etichetta}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${forte ? "font-semibold" : ""}`}>{formatCurrency(valore)}</p>
    </div>
  );
  const testoSaldo = (s: ReturnType<typeof saldoIva>) =>
    s.verso === "versare" ? `${formatCurrency(s.importo)} da versare` : s.verso === "credito" ? `${formatCurrency(s.importo)} a credito` : "In pari";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-5 w-5 text-primary" aria-hidden="true" />IVA della commessa</CardTitle>
        <p className="text-sm text-muted-foreground">
          L'IVA delle vendite si versa; quella degli acquisti con IVA in fattura si scala. Il reverse charge (subappalti edili, acquisti
          dall'estero) si integra e si detrae insieme: non cambia il saldo e non riduce l'IVA delle vendite.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Ad oggi (fatture registrate)</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${oggi.verso === "versare" ? "text-amber-700" : oggi.verso === "credito" ? "text-green-700" : ""}`}>{testoSaldo(oggi)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">A fine commessa (previsto)</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${fine.verso === "versare" ? "text-amber-700" : fine.verso === "credito" ? "text-green-700" : ""}`}>{testoSaldo(fine)}</p>
          </div>
        </div>
        <div className="divide-y rounded-lg border px-3">
          {riga("IVA a debito, fatturata", d.debito_fatturato, `${d.fatture_emesse} ${d.fatture_emesse === 1 ? "fattura emessa" : "fatture emesse"} su ${formatCurrency(d.imponibile_fatturato)} di imponibile (note di credito in meno)`, true)}
          {d.debito_da_fatturare > 0 && riga("IVA a debito, ancora da fatturare", d.debito_da_fatturare, `${aliquota}% sul valore della commessa (${formatCurrency(d.valore_commessa)}) non ancora fatturato`)}
          {d.split_payment > 0 && riga("Split payment (non a debito)", d.split_payment, "La versa direttamente l'ente pubblico: non entra nel tuo saldo")}
          {riga("IVA a credito, fatture d'acquisto", d.credito_fatture, `${d.fatture_ricevute} ${d.fatture_ricevute === 1 ? "fattura collegata" : "fatture collegate"} su ${formatCurrency(d.imponibile_acquisti)} di imponibile`, true)}
          {d.credito_previsto_costi > 0 && riga("IVA a credito prevista, costi senza fattura elettronica", d.credito_previsto_costi, `${d.costi_senza_fattura_elettronica} ${d.costi_senza_fattura_elettronica === 1 ? "costo registrato" : "costi registrati"} a mano: diventa credito quando arriva la fattura`)}
          {d.credito_previsto_ditte > 0 && riga("IVA a credito prevista, ditte con IVA", d.credito_previsto_ditte, "Dai costi delle ditte che fatturano con IVA, non ancora registrati come costo")}
          {d.reverse_charge_imponibile > 0 && riga("Reverse charge (neutro)", d.reverse_charge_iva,
            `IVA ${aliquota}% integrata su ${formatCurrency(d.reverse_charge_imponibile)}: va a debito e a credito per lo stesso importo, il saldo non cambia`)}
        </div>
        <p className="text-xs text-muted-foreground">
          Stima per la commessa, utile per la cassa: la liquidazione vera si fa per periodo su tutta l'azienda, e un'IVA indetraibile
          (es. auto, rappresentanza) va tolta dal credito con il commercialista.
        </p>
      </CardContent>
    </Card>
  );
}
