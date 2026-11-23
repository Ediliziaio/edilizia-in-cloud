/**
 * Quanto pesa questo ordine sulla commessa che lo ha generato.
 *
 * L'errore d'acquisto che costa non e' il prezzo sbagliato di una vite: e'
 * accorgersi A FINE LAVORI che gli acquisti si sono mangiati il margine.
 * Questo riquadro fa il conto NEL MOMENTO IN CUI SI ORDINA, quando si e'
 * ancora in tempo a fermarsi: valore commessa, gia' impegnato con gli altri
 * ordini, questo ordine, incidenza totale.
 *
 * Niente AI e niente verdetti: due numeri affiancati e una barra. Chi legge
 * puo' rifare la divisione a mente, ed e' per questo che ci crede.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Scale, ExternalLink } from "lucide-react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  odaId: string;
  orderId: string | null;
  /** Imponibile e stato correnti di QUESTO ordine (gia' caricati dal dettaglio). */
  imponibileOrdine: number;
  statoOrdine: string;
}

export function OdaImpattoCommessaCard({ odaId, orderId, imponibileOrdine, statoOrdine }: Props) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["oda-impatto-commessa", orderId, odaId],
    queryFn: async () => {
      const [commessaRes, odaRes] = await Promise.all([
        supabase.from("orders").select("order_code, total_amount").eq("id", orderId!).single(),
        supabase
          .from("purchase_orders")
          .select("id, subtotal, status")
          .eq("order_id", orderId!),
      ]);
      if (commessaRes.error) throw commessaRes.error;
      // Senza questo check un errore lasciava impegnatoAltri=0 e la barra
      // verde anche a commessa satura — proprio il numero su cui si decide.
      if (odaRes.error) throw odaRes.error;
      const altri = (odaRes.data ?? []).filter(
        (o) =>
          o.id !== odaId &&
          (ODA_STATI_EMESSI as readonly string[]).includes(o.status),
      );
      return {
        codice: commessaRes.data.order_code as string | null,
        valoreCommessa: Number(commessaRes.data.total_amount) || 0,
        impegnatoAltri: altri.reduce((s, o) => s + Number(o.subtotal || 0), 0),
        numAltri: altri.length,
      };
    },
    enabled: !!orderId,
  });

  if (!orderId || !data) return null;

  const { codice, valoreCommessa, impegnatoAltri, numAltri } = data;
  const questoEmesso = (ODA_STATI_EMESSI as readonly string[]).includes(statoOrdine);
  const totale = impegnatoAltri + imponibileOrdine;
  const pct = valoreCommessa > 0 ? (totale / valoreCommessa) * 100 : null;

  // Fasce oneste sull'incidenza acquisti/vendita: sotto meta' commessa e'
  // fisiologico, fra 50 e 70 va guardato, oltre 70 il margine e' in pericolo
  // prima ancora di contare la manodopera.
  const colore =
    pct == null ? "bg-slate-300"
    : pct > 70 ? "bg-red-500"
    : pct > 50 ? "bg-amber-400"
    : "bg-emerald-500";
  const testoPct =
    pct == null ? null
    : pct > 70 ? "text-red-600"
    : pct > 50 ? "text-amber-600"
    : "text-emerald-600";

  return (
    <QuoteCard title={t("Impatto sulla commessa")} icon={<Scale className="h-4 w-4" />}>
      <div className="space-y-2 text-sm">
        <p className="text-xs text-slate-500">{t("Importi al netto dell’IVA.")}</p>
        <div className="flex justify-between">
          <span className="text-slate-500">{codice ? t("Valore commessa ({codice})", { codice }) : t("Valore commessa")}</span>
          <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(valoreCommessa)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">
            {numAltri > 0 ? t("Altri ordini emessi ({n})", { n: numAltri }) : t("Altri ordini emessi")}
          </span>
          <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(impegnatoAltri)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">
            {questoEmesso ? t("Questo ordine") : t("Questo ordine (bozza)")}
          </span>
          <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(imponibileOrdine)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2">
          <span className="font-semibold text-slate-700">
            {questoEmesso ? t("Impegnato totale") : t("Impegnato se lo mandi")}
          </span>
          <span className={`font-bold tabular-nums ${testoPct ?? "text-slate-900"}`}>
            {formatCurrency(totale)}
            {pct != null && ` · ${Math.round(pct)}%`}
          </span>
        </div>

        {pct != null && (
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colore}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        )}

        {pct != null && pct > 100 && (
          <p className="text-xs text-red-600 font-medium">
            {t("Gli acquisti superano l'intero valore della commessa: qui si lavora in perdita ancora prima della manodopera.")}
          </p>
        )}
        {pct != null && pct > 70 && pct <= 100 && (
          <p className="text-xs text-amber-700">
            {t("Acquisti oltre il 70% della vendita: con la manodopera il margine rischia di sparire. Controlla prima di mandare altri ordini.")}
          </p>
        )}

        <Link
          to={`/azienda/ordini/${orderId}`}
          className="inline-flex items-center gap-1 text-xs text-orange-600 font-semibold hover:text-orange-700 pt-1"
        >
          {t("Apri la commessa")} <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </QuoteCard>
  );
}
