import { useState } from "react";
import { OdaPaymentsDialog, type SpesaFornitura } from "./OdaPaymentsDialog";
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
import { documentiDb } from "@/lib/ddt/documentiPersistenti";
import { formatCurrency } from "@/lib/formatters";
import { etichettaMetodoCosto } from "@/lib/costi/metodiPagamento";
import { consegnatoFatturatoOda, contabilitaOda, quantitaFornitura, type RataOda, type RigaOdaConsegna } from "@/lib/orders/odaContabilita";
import { quotaIvata } from "@/lib/fatturazione/quoteOrdini";

interface Costo {
  id: string;
  amount: number | string;
  is_paid: boolean | null;
  due_date: string | null;
  paid_date: string | null;
  quota?: number;
}

interface Fattura {
  id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  totale_documento: number | string | null;
  stato: string | null;
  tipo_documento: string | null;
  company_cost_id: string | null;
  imponibile_totale: number | string | null;
}

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function OdaAccountingCard({
  odaId,
  totaleOrdine,
  stato,
  righe,
}: {
  odaId: string;
  totaleOrdine: number;
  stato: string;
  /** Le righe dell'ordine, per il confronto fra arrivato e fatturato. */
  righe?: RigaOdaConsegna[];
}) {
  const [pagamentiAperti, setPagamentiAperti] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["oda-contabilita", odaId],
    queryFn: async () => {
      const [costiRes, fattureRes, quoteRes] = await Promise.all([
        documentiDb
          .from("company_costs")
          .select("id, amount, is_paid, due_date, paid_date")
          .eq("purchase_order_id", odaId)
          .is("annullato_il", null),
        documentiDb
          .from("fatture_ricevute")
          .select("id, numero_fattura, data_fattura, totale_documento, stato, tipo_documento, company_cost_id, imponibile_totale")
          .eq("purchase_order_id", odaId),
        // Le fatture divise tra più ordini: qui conta solo la quota di questo.
        documentiDb
          .from("fattura_ricevuta_ordini")
          .select("importo, fattura:fatture_ricevute(id, numero_fattura, data_fattura, totale_documento, imponibile_totale, stato, tipo_documento, company_cost_id)")
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
        .filter((q) => q.fattura && !['annullata', 'scartata', 'rifiutata'].includes(q.fattura.stato ?? ''))
        .map((q) => ({
          ...q.fattura!,
          quota: Number(q.fattura!.imponibile_totale) > 0 ? Number(q.importo) / Number(q.fattura!.imponibile_totale) : 0,
          imponibile_totale: Number(q.importo),
          totale_documento: quotaIvata(
            Number(q.importo),
            q.fattura!.imponibile_totale != null ? Number(q.fattura!.imponibile_totale) : null,
            q.fattura!.totale_documento != null ? Number(q.fattura!.totale_documento) : null,
          ),
        }));
      const costi = (costiRes.data ?? []) as Costo[];
      const quoteMancanti = quote.filter(q => q.company_cost_id && !costi.some(c => c.id === q.company_cost_id));
      if (quoteMancanti.length) {
        const res = await documentiDb.from('company_costs')
          .select('id, amount, is_paid, due_date, paid_date').is('annullato_il', null)
          .in('id', [...new Set(quoteMancanti.map(q => q.company_cost_id))]);
        if (res.error) throw res.error;
        for (const c of (res.data ?? []) as Costo[]) {
          const quota = Math.min(1, quoteMancanti.filter(q => q.company_cost_id === c.id).reduce((s, q) => s + q.quota, 0));
          costi.push({ ...c, quota, amount: Number(c.amount) * quota });
        }
      }
      // Le scadenze vere (RiBa, acconto e saldo) stanno nelle rate dei costi.
      let rate: RataOda[] = [];
      if (costi.length > 0) {
        const rateRes = await documentiDb
          .from("rate_fornitori")
          .select("company_cost_id, numero, scadenza, importo, metodo, stato")
          .in("company_cost_id", costi.map((c) => c.id));
        if (rateRes.error) throw rateRes.error;
        rate = ((rateRes.data ?? []) as (RataOda & { company_cost_id: string })[]).map(r => ({
          ...r, importo: Number(r.importo) * (costi.find(c => c.id === r.company_cost_id)?.quota ?? 1),
        }));
      }
      return {
        costi,
        fatture: [...new Map([...quote, ...((fattureRes.data ?? []) as Fattura[])]
          .filter(f => !['annullata', 'scartata', 'rifiutata'].includes(f.stato ?? ''))
          .map(f => [f.id, f])).values()],
        rate,
      };
    },
    enabled: !!odaId && stato !== "bozza" && stato !== "annullato",
  });

  // Sulle bozze non c'e' niente da contabilizzare: mostrare due righe vuote
  // sarebbe solo rumore.
  if (stato === "bozza" || stato === "annullato") return null;

  if (isLoading) return <QuoteCard title="Contabilità" icon={<Wallet className="h-4 w-4"/>}><p role="status" className="text-sm text-slate-500">Caricamento dati contabili…</p></QuoteCard>;
  if (isError) return <QuoteCard title="Contabilità" icon={<Wallet className="h-4 w-4"/>}><p role="alert" className="text-sm text-red-700">Dati contabili non disponibili. Non è possibile verificare costi e fatture.</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>void refetch()}>Riprova</Button></QuoteCard>;

  const costi = data?.costi ?? [];
  const fatture = data?.fatture ?? [];
  const totaleCosti = costi.reduce((s, c) => s + Number(c.amount || 0), 0);
  const nonPagati = costi.filter((c) => !c.is_paid).length;
  const conto = contabilitaOda(totaleOrdine, fatture, data?.rate ?? []);
  const arrivo = righe?.length ? consegnatoFatturatoOda(righe, conto.fatturato) : null;
  const quantita = quantitaFornitura(righe ?? []);
  const spese: SpesaFornitura[] = costi.map(c => ({ id: c.id, quota: c.quota }));

  return (
    <>
    {pagamentiAperti && <OdaPaymentsDialog odaId={odaId} spese={spese} onClose={() => setPagamentiAperti(false)} />}
    <QuoteCard title="Contabilità" icon={<Wallet className="h-4 w-4" />}>
      <div className="space-y-2.5 text-sm">
        {quantita.righe > 0 && <div className="rounded-lg border bg-muted/20 p-3" aria-label="Quantità della fornitura">
          <p className="font-medium">{quantita.completa ? 'Quantità complete' : `${quantita.complete} di ${quantita.righe} righe complete`}</p>
          {quantita.unita.map(q => <p key={q.um} className="mt-1 text-xs text-muted-foreground">
            {q.ordinate.toLocaleString('it-IT')} {q.um} ordinati · {q.ricevute.toLocaleString('it-IT')} ricevuti · {q.residue.toLocaleString('it-IT')} da ricevere
          </p>)}
        </div>}
        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Costo registrato</span>
          {costi.length > 0 ? (
            <button type="button" onClick={()=>setPagamentiAperti(true)} className="text-right group">
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
              Nessuno: l'ordine è ancora un impegno finché non si registra un costo o una fattura
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-500">Fatturato IVA compresa</span>
          {fatture.length > 0 ? (
            <button type="button" disabled={!costi.length} onClick={()=>setPagamentiAperti(true)} className="text-right group">
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
            onClick={() => setPagamentiAperti(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Pagamenti e residuo
          </Button>
        )}

        {costi.length>1 && <p className="text-xs text-muted-foreground">{costi.length} spese collegate: apri il riepilogo per scegliere la fattura e vedere tutti i residui.</p>}

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

        {arrivo && arrivo.consegnato > 0 && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-500">Ricevuto ai prezzi dell’ODA</span>
            <span className="text-right">
              <span className="font-semibold text-slate-900">{formatCurrency(arrivo.consegnato)}</span>
              <span className="block text-[11px] text-slate-500">
                IVA compresa · le differenze di prezzo non indicano merce mancante
                {arrivo.righeSenzaPrezzo > 0 ? ` · ${arrivo.righeSenzaPrezzo} righe senza prezzo` : ""}
              </span>
            </span>
          </div>
        )}

        {conto.stato === "eccede" && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Fatturati <strong>{formatCurrency(conto.eccedenza)}</strong> in più dell'ordine
              ({formatCurrency(totaleOrdine)}), IVA compresa.{quantita.completa ? ' Le quantità sono complete: controlla prezzi ed eventuali spese aggiuntive.' : ' Controlla prezzi e quantità separatamente.'}
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
