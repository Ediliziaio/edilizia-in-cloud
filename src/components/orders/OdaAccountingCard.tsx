/**
 * Cosa e' successo a questo ordine dopo la merce: il costo e la fattura.
 *
 * Il legame ordine -> costo -> fattura esiste sul database (company_costs
 * .purchase_order_id, fatture_ricevute.purchase_order_id) ma non si vedeva da
 * nessuna parte, quindi in pratica non serviva a niente. Qui si legge in tre
 * righe se la fornitura e' stata contabilizzata, se e' arrivata la fattura e
 * se la fattura combacia con l'ordine.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Wallet, FileText, AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  const queryClient = useQueryClient();
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
      // Un errore di lettura NON deve diventare "nessun costo registrato":
      // la card affermerebbe con sicurezza il contrario del vero.
      if (costiRes.error) throw costiRes.error;
      if (fattureRes.error) throw fattureRes.error;
      return {
        costi: (costiRes.data ?? []) as Costo[],
        fatture: (fattureRes.data ?? []) as Fattura[],
      };
    },
    enabled: !!odaId,
  });

  // Il pagamento si registra da qui invece che andando a cercare il costo in
  // un'altra pagina: e' il gesto che chiude il cerchio ordine → merce →
  // fattura → soldi usciti. Il pagamento E' l'uscita dalla banca, quindi
  // insieme a is_paid nasce anche la registrazione in Prima Nota — la stessa
  // scrittura (auto_source company_cost_payment) che farebbe la pagina Costi,
  // cosi' i due percorsi restano indistinguibili in contabilita'.
  const segnaPagato = useMutation({
    mutationFn: async () => {
      const oggi = new Date().toLocaleDateString("en-CA");
      const { data: pagati, error } = await (supabase as any)
        .from("company_costs")
        .update({ is_paid: true, paid_date: oggi })
        .eq("purchase_order_id", odaId)
        .eq("is_paid", false)
        .select("id, name, amount, company_id, payment_method");
      if (error) throw error;
      const rows = (pagati ?? []) as Array<{
        id: string; name: string | null; amount: number | string;
        company_id: string; payment_method: string | null;
      }>;

      // Uscita in Prima Nota, saltando i costi che ce l'hanno gia' (un costo
      // ri-pagato dopo un "non pagato" non deve raddoppiare l'uscita). Se la
      // scrittura contabile fallisce il pagamento resta valido: si avvisa,
      // non si annulla.
      let erroreContabile: string | null = null;
      if (rows.length > 0) {
        const { data: esistenti } = await (supabase as any)
          .from("prima_nota_entries")
          .select("cost_id")
          .in("cost_id", rows.map((r) => r.id))
          .eq("auto_source", "company_cost_payment");
        const gia = new Set(((esistenti ?? []) as Array<{ cost_id: string }>).map((e) => e.cost_id));
        const daScrivere = rows.filter((r) => !gia.has(r.id));
        if (daScrivere.length > 0) {
          const { error: ePn } = await (supabase as any).from("prima_nota_entries").insert(
            daScrivere.map((r) => ({
              company_id: r.company_id,
              direction: "uscita",
              amount: Number(r.amount || 0),
              description: `Pagamento: ${r.name ?? "fornitura"}`,
              entry_date: oggi,
              category: "Costi Aziendali",
              cost_id: r.id,
              is_auto: true,
              auto_source: "company_cost_payment",
              ...(r.payment_method ? { payment_method: r.payment_method } : {}),
            })),
          );
          if (ePn) erroreContabile = ePn.message ?? String(ePn);
        }
      }
      return { n: rows.length, erroreContabile };
    },
    onSuccess: ({ n, erroreContabile }) => {
      if (erroreContabile) {
        toast.warning(n === 1 ? "Pagamento registrato" : `${n} pagamenti registrati`, {
          description: `L'uscita in Prima Nota però non è stata scritta: ${erroreContabile}`,
        });
      } else {
        toast.success(n === 1 ? "Pagamento registrato" : `${n} pagamenti registrati`, {
          description: "Uscita in Prima Nota creata: cassa, tesoreria e contabilità vedono la stessa cosa.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita", odaId] });
      // Due prefissi: le liste/saldo usano "prima-nota", il grafico 6 mesi
      // usa "primaNota" (incoerenza storica del codebase).
      queryClient.invalidateQueries({ queryKey: ["prima-nota"] });
      queryClient.invalidateQueries({ queryKey: ["primaNota"] });
    },
    onError: (e) => toast.error("Pagamento non registrato", { description: String(e) }),
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

        {nonPagati > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8"
            disabled={segnaPagato.isPending}
            onClick={() => segnaPagato.mutate()}
          >
            {segnaPagato.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
            Segna pagato al fornitore
          </Button>
        )}

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
