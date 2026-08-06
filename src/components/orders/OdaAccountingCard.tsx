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
import { Link } from "react-router-dom";
import { Wallet, FileText, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

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
  const { data } = useQuery({
    queryKey: ["oda-contabilita", odaId],
    queryFn: async () => {
      const [costiRes, fattureRes] = await Promise.all([
        (supabase as any)
          .from("company_costs")
          .select("id, amount, is_paid, due_date, paid_date")
          .eq("purchase_order_id", odaId),
        (supabase as any)
          .from("fatture_ricevute")
          .select("id, numero_fattura, data_fattura, totale_documento, stato")
          .eq("purchase_order_id", odaId),
      ]);
      return {
        costi: (costiRes.data ?? []) as Costo[],
        fatture: (fattureRes.data ?? []) as Fattura[],
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
  const totaleFatture = fatture.reduce((s, f) => s + Number(f.totale_documento || 0), 0);
  const nonPagati = costi.filter((c) => !c.is_paid).length;

  // Tolleranza di un centesimo: arrotondamenti dell'IVA non sono scostamenti.
  const scostamento = fatture.length > 0 ? totaleFatture - totaleOrdine : 0;
  const scostamentoRilevante = Math.abs(scostamento) > 0.01;

  return (
    <QuoteCard title="Contabilità" icon={<Wallet className="h-4 w-4" />}>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Costo registrato</span>
          {costi.length > 0 ? (
            <Link to="/azienda/costi" className="text-right group">
              <span className="font-semibold text-slate-900 group-hover:text-orange-600 inline-flex items-center gap-1">
                {formatCurrency(totaleCosti)}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
              </span>
              <span className="block text-[11px] text-slate-500">
                {nonPagati > 0 ? `${nonPagati} da pagare` : "pagato"}
              </span>
            </Link>
          ) : (
            <span className="text-right text-slate-400 text-xs max-w-[60%]">
              Nessuno: si crea quando l'ordine passa a "ricevuto"
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Fattura fornitore</span>
          {fatture.length > 0 ? (
            <Link to="/azienda/documenti/fatture-ricevute" className="text-right group">
              <span className="font-semibold text-slate-900 group-hover:text-orange-600 inline-flex items-center gap-1">
                {formatCurrency(totaleFatture)}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
              </span>
              <span className="block text-[11px] text-slate-500">
                {fatture.length === 1
                  ? `n. ${fatture[0].numero_fattura ?? "—"} del ${dataIt(fatture[0].data_fattura)}`
                  : `${fatture.length} fatture`}
              </span>
            </Link>
          ) : (
            <span className="text-right text-slate-400 text-xs">Non ancora arrivata</span>
          )}
        </div>

        {fatture.length > 0 && (
          scostamentoRilevante ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
              <span>
                La fattura è di <strong>{formatCurrency(Math.abs(scostamento))}</strong>{" "}
                {scostamento > 0 ? "superiore" : "inferiore"} all'ordine
                ({formatCurrency(totaleOrdine)}). Verifica prima di pagare.
              </span>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Fattura e ordine combaciano
            </p>
          )
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
  );
}
