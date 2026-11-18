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
import { normalizzaIvaCommessa, saldiIvaCommessa, type saldoIva } from "@/lib/orders/ivaCommessa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SezioneRichiudibile } from "./SezioneRichiudibile";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useIvaCommessa(orderId: string, abilitato = true) {
  return useQuery({
    queryKey: ["commessa-iva", orderId],
    enabled: abilitato,
    queryFn: async () => {
      const { data, error } = await db.rpc("commessa_iva", { p_order_id: orderId });
      if (error) throw error;
      return normalizzaIvaCommessa(data);
    },
  });
}

export function IvaCommessa({ orderId, compatta = false, aperta = false }: { orderId: string; compatta?: boolean; aperta?: boolean }) {
  const q = useIvaCommessa(orderId);
  const d = q.data;
  if (q.isError || !d) {
    const messaggio = q.isLoading ? "Caricamento IVA…" : "Dati IVA non disponibili";
    const stato = <p role={q.isLoading ? "status" : "alert"} className="text-sm text-muted-foreground">
      {messaggio}{q.isError && <>. <button type="button" className="underline" onClick={() => void q.refetch()}>Riprova</button></>}
    </p>;
    return compatta ? (
      <SezioneRichiudibile titolo="IVA della commessa" icona={<Landmark className="h-4 w-4" />} riepilogo={messaggio} aperta={aperta}>
        {stato}
      </SezioneRichiudibile>
    ) : q.isError ? stato : null;
  }
  const { oggi, fine, senzaFatture } = saldiIvaCommessa(d);
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
  const coloreSaldo = (s: ReturnType<typeof saldoIva>) => s.verso === "versare" ? "text-amber-800 dark:text-amber-200"
    : s.verso === "credito" ? "text-emerald-700 dark:text-emerald-300" : "";
  const haDettagli = !senzaFatture || [d.debito_da_fatturare, d.split_payment, d.credito_previsto_costi,
    d.credito_previsto_ditte, d.reverse_charge_imponibile].some(valore => valore > 0);
  const contenuto = (
    <Card className={compatta ? "border-0 shadow-none" : undefined}>
      {!compatta && <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-5 w-5 text-primary" aria-hidden="true" />IVA della commessa</CardTitle>
        <p className="text-sm text-muted-foreground">
          L'IVA delle vendite si versa; quella degli acquisti con IVA in fattura si scala. Il reverse charge (subappalti edili, acquisti
          dall'estero) si integra e si detrae insieme: non cambia il saldo e non riduce l'IVA delle vendite.
        </p>
      </CardHeader>}
      <CardContent className={compatta ? "space-y-3 p-0" : "space-y-3"}>
        {!compatta && <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Ad oggi (fatture registrate)</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${oggi.verso === "versare" ? "text-amber-700" : oggi.verso === "credito" ? "text-green-700" : ""}`}>{testoSaldo(oggi)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">A fine commessa (previsto)</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${fine.verso === "versare" ? "text-amber-700" : fine.verso === "credito" ? "text-green-700" : ""}`}>{testoSaldo(fine)}</p>
          </div>
        </div>}
        {(!compatta || haDettagli) ? <div className="divide-y rounded-lg border px-3">
          {(!compatta || !senzaFatture) && riga("IVA sulle fatture emesse", d.debito_fatturato, `${d.fatture_emesse} ${d.fatture_emesse === 1 ? "fattura emessa" : "fatture emesse"} · ${formatCurrency(d.imponibile_fatturato)} di imponibile al netto delle note di credito`, true)}
          {d.debito_da_fatturare > 0 && riga("IVA sui lavori ancora da fatturare", d.debito_da_fatturare, `Aliquota prevista ${aliquota}% · Valore commessa ${formatCurrency(d.valore_commessa)}`)}
          {d.split_payment > 0 && riga("Split payment (non a debito)", d.split_payment, "La versa direttamente l'ente pubblico: non entra nel tuo saldo")}
          {(!compatta || !senzaFatture) && riga("IVA a credito sugli acquisti", d.credito_fatture, `${d.fatture_ricevute} ${d.fatture_ricevute === 1 ? "fattura collegata" : "fatture collegate"} · ${formatCurrency(d.imponibile_acquisti)} di imponibile`, true)}
          {d.credito_previsto_costi > 0 && riga("IVA a credito prevista, costi senza fattura elettronica", d.credito_previsto_costi, `${d.costi_senza_fattura_elettronica} ${d.costi_senza_fattura_elettronica === 1 ? "costo registrato" : "costi registrati"} a mano: diventa credito quando arriva la fattura`)}
          {d.credito_previsto_ditte > 0 && riga("IVA a credito prevista, ditte con IVA", d.credito_previsto_ditte, "Dai costi delle ditte che fatturano con IVA, non ancora registrati come costo")}
          {d.reverse_charge_imponibile > 0 && riga("Reverse charge (neutro)", d.reverse_charge_iva,
            `IVA ${aliquota}% integrata su ${formatCurrency(d.reverse_charge_imponibile)}: va a debito e a credito per lo stesso importo, il saldo non cambia`)}
        </div> : <p className="text-sm text-muted-foreground">Nessun importo IVA registrato o previsto.</p>}
        <p className="text-xs text-muted-foreground">
          {compatta ? "Gli importi sono riferiti alla singola commessa. La liquidazione IVA si calcola su tutta l’azienda." : <>
          Stima per la commessa, utile per la cassa: la liquidazione vera si fa per periodo su tutta l'azienda, e un'IVA indetraibile
          (es. auto, rappresentanza) va tolta dal credito con il commercialista.</>}
        </p>
      </CardContent>
    </Card>
  );
  return compatta ? (
    <SezioneRichiudibile titolo="IVA della commessa" icona={<Landmark className="h-4 w-4" />} aperta={aperta}
      riepilogo={<>
        <span><span className="text-muted-foreground">Ad oggi </span><strong className={coloreSaldo(oggi)}>{senzaFatture ? "Nessuna fattura" : testoSaldo(oggi)}</strong></span>
        <span><span className="text-muted-foreground">Stima finale </span><strong className={coloreSaldo(fine)}>{testoSaldo(fine)}</strong></span>
      </>}>
      {contenuto}
    </SezioneRichiudibile>
  ) : contenuto;
}
