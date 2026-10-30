import { useState } from "react";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
/**
 * Cosa e' successo a questo ordine dopo la merce: il costo e la fattura.
 *
 * Il legame ordine -> costo -> fattura esiste sul database (company_costs
 * .purchase_order_id, fatture_ricevute.purchase_order_id) ma non si vedeva da
 * nessuna parte, quindi in pratica non serviva a niente. Qui si legge in tre
 * righe se la fornitura e' stata contabilizzata, se e' arrivata la fattura e
 * se la fattura combacia con l'ordine.
 */
import { useQuery } from "@tanstack/react-query";
import { Wallet, FileText, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { etichettaMetodoCosto } from "@/lib/costi/metodiPagamento";
import { contabilitaOda, type RataOda } from "@/lib/orders/odaContabilita";
import { quotaIvata } from "@/lib/fatturazione/quoteOrdini";

interface Costo {
  id: string;
  amount: number | string;
  is_paid: boolean | null;
  due_date: string | null;
  paid_date: string | null;
}

interface Fattura {
  id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  totale_documento: number | string | null;
  stato: string | null;
  tipo_documento: string | null;
}

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function OdaAccountingCard({
  odaId,
  totaleOrdine,
  stato,
}: {
  odaId: string;
  totaleOrdine: number;
  stato: string;
}) {
  const [paymentCostId, setPaymentCostId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["oda-contabilita", odaId],
    queryFn: async () => {
      const [costiRes, fattureRes, quoteRes] = await Promise.all([
        (supabase as any)
          .from("company_costs")
          .select("id, amount, is_paid, due_date, paid_date")
          .eq("purchase_order_id", odaId),
        (supabase as any)
          .from("fatture_ricevute")
          .select("id, numero_fattura, data_fattura, totale_documento, stato, tipo_documento")
          .eq("purchase_order_id", odaId),
        // Le fatture divise tra più ordini: qui conta solo la quota di questo.
        (supabase as any)
          .from("fattura_ricevuta_ordini")
          .select("importo, fattura:fatture_ricevute(id, numero_fattura, data_fattura, totale_documento, imponibile_totale, stato, tipo_documento)")
          .eq("purchase_order_id", odaId),
      ]);
      // Un errore di lettura NON deve diventare "nessun costo registrato":
      // la card affermerebbe con sicurezza il contrario del vero.
      if (costiRes.error) throw costiRes.error;
      if (fattureRes.error) throw fattureRes.error;
      if (quoteRes.error) throw quoteRes.error;
      const quote = ((quoteRes.data ?? []) as Array<{
        importo: number | string;
        fattura: (Fattura & { imponibile_totale: number | string | null }) | null;
      }>)
        .filter((q) => q.fattura)
        .map((q) => ({
          ...q.fattura!,
          totale_documento: quotaIvata(
            Number(q.importo),
            q.fattura!.imponibile_totale != null ? Number(q.fattura!.imponibile_totale) : null,
            q.fattura!.totale_documento != null ? Number(q.fattura!.totale_documento) : null,
          ),
        }));
      const costi = (costiRes.data ?? []) as Costo[];
      // Le scadenze vere (RiBa, acconto e saldo) stanno nelle rate dei costi.
      let rate: RataOda[] = [];
      if (costi.length > 0) {
        const rateRes = await (supabase as any)
          .from("rate_fornitori")
          .select("numero, scadenza, importo, metodo, stato")
          .in("company_cost_id", costi.map((c) => c.id));
        if (rateRes.error) throw rateRes.error;
        rate = (rateRes.data ?? []) as RataOda[];
      }
      return {
        costi,
        fatture: [...((fattureRes.data ?? []) as Fattura[]), ...quote],
        rate,
      };
    },
    enabled: !!odaId,
  });

  // Sulle bozze non c'e' niente da contabilizzare: mostrare due righe vuote
  // sarebbe solo rumore.
  if (stato === "bozza" || stato === "annullato") return null;

  const costi = data?.costi ?? [];
  const fatture = data?.fatture ?? [];
  const totaleCosti = costi.reduce((s, c) => s + Number(c.amount || 0), 0);
  const nonPagati = costi.filter((c) => !c.is_paid).length;
  const conto = contabilitaOda(totaleOrdine, fatture, data?.rate ?? []);

  return (
    <>
    {paymentCostId && <ExpensePaymentDialog key={paymentCostId} costId={paymentCostId} onClose={()=>setPaymentCostId(null)} />}
    <QuoteCard title="Contabilità" icon={<Wallet className="h-4 w-4" />}>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Costo registrato</span>
          {costi.length > 0 ? (
            <button type="button" onClick={()=>setPaymentCostId(costi[0]?.id??null)} className="text-right group">
              <span className="font-semibold text-slate-900 group-hover:text-orange-600 inline-flex items-center gap-1">
                {formatCurrency(totaleCosti)}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
              </span>
              <span className="block text-[11px] text-slate-500">
                {nonPagati > 0 ? `${nonPagati} da pagare` : "pagato"}
              </span>
            </button>
          ) : (
            <span className="text-right text-slate-400 text-xs max-w-[60%]">
              Nessuno: si crea quando l'ordine passa a "ricevuto"
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Fattura fornitore</span>
          {fatture.length > 0 ? (
            <button type="button" disabled={!costi.length} onClick={()=>setPaymentCostId(costi[0]?.id??null)} className="text-right group">
              <span className="font-semibold text-slate-900 group-hover:text-orange-600 inline-flex items-center gap-1">
                {formatCurrency(conto.fatturato)}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
              </span>
              <span className="block text-[11px] text-slate-500">
                {fatture.length === 1
                  ? `n. ${fatture[0].numero_fattura ?? "—"} del ${dataIt(fatture[0].data_fattura)}`
                  : `${fatture.length} documenti`}
              </span>
            </button>
          ) : (
            <span className="text-right text-slate-400 text-xs">Non ancora arrivata</span>
          )}
        </div>

        {costi.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8"
            onClick={() => setPaymentCostId(costi.find(c => !c.is_paid)?.id ?? costi[0]?.id ?? null)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Pagamenti e residuo
          </Button>
        )}

        {costi.length>1 && <div className="flex flex-wrap gap-2">{costi.map((c,i)=><Button key={c.id} size="sm" variant="outline" onClick={()=>setPaymentCostId(c.id)}>Costo {i+1} · {formatCurrency(Number(c.amount))}</Button>)}</div>}

        {conto.prossima && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Prossima uscita</span>
            <span className="text-right">
              <span className="font-semibold text-slate-900">{formatCurrency(conto.prossima.importo)}</span>
              <span className="block text-[11px] text-slate-500">
                {[
                  conto.prossima.scadenza ? `il ${dataIt(conto.prossima.scadenza)}` : "senza data",
                  etichettaMetodoCosto(conto.prossima.rate[0]?.metodo),
                  conto.rateAperte.length > 1 ? `${conto.rateAperte.length} rate da pagare` : null,
                ].filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>
        )}

        {conto.stato === "eccede" && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Fatturati <strong>{formatCurrency(conto.eccedenza)}</strong> in più dell'ordine
              ({formatCurrency(totaleOrdine)}). Verifica prima di pagare.
            </span>
          </div>
        )}
        {conto.stato === "parziale" && (
          <p className="flex items-start gap-1.5 text-xs text-slate-600">
            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              Restano da fatturare <strong>{formatCurrency(conto.residuo)}</strong> su {formatCurrency(totaleOrdine)}:
              un acconto, una consegna parziale o fatture ancora da arrivare.
            </span>
          </p>
        )}
        {conto.stato === "combacia" && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Fatture e ordine combaciano
          </p>
        )}

        {costi.length === 0 && fatture.length === 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-slate-400 pt-1">
            <FileText className="h-3 w-3 shrink-0 mt-0.5" />
            Finché non arrivano merce e fattura, questo ordine è un impegno: non pesa
            ancora sui costi né sulla cassa.
          </p>
        )}
      </div>
    </QuoteCard>
    </>
  );
}
