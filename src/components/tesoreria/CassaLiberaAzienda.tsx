/**
 * «Quanto è davvero mio» — la cassa libera dell'azienda, in tre righe.
 *
 * Il saldo del conto è il numero che tutti guardano ed è quello che inganna di
 * più: dentro ci sono gli acconti dei clienti (lavoro ancora da fare) e fuori
 * ci sono le fatture già arrivate (soldi che hanno già un destinatario). Qui
 * si legge in fila: in banca, meno quello che devi, uguale quello che resta.
 *
 * Le stesse regole della commessa (`cassaLiberaCommessa`): nel numero finale
 * entrano solo fatti. Crediti e anticipi dei cantieri restano sotto, come
 * contesto, perché non sono cassa — o lo sono già.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { HandCoins } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useCassaLiberaAzienda } from "@/hooks/useCassaLiberaAzienda";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function Riga({ etichetta, valore, nota, forte, colore }: {
  etichetta: string;
  valore: string;
  nota?: string;
  forte?: boolean;
  colore?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5", forte && "border-t pt-2")}>
      <span className="min-w-0">
        <span className={cn("text-sm", forte ? "font-semibold" : "text-muted-foreground")}>{etichetta}</span>
        {nota && <span className="block text-xs text-muted-foreground">{nota}</span>}
      </span>
      <strong className={cn("tabular-nums", forte ? "text-xl" : "text-base font-medium", colore)}>{valore}</strong>
    </div>
  );
}

export function CassaLiberaAzienda() {
  const t = useT();
  const { data, isError, isPending } = useCassaLiberaAzienda();
  // Nessun permesso sui saldi, dati non caricati o azienda senza conti: niente
  // riquadro. Un numero a metà qui è peggio che nessun numero.
  if (isPending || isError || !data) return null;
  if (data.inBanca === 0 && data.daPagare === 0) return null;

  const { inBanca, daPagare, libera, scadeSubito, scaduto, daIncassare, anticipatoDaiCantieri, copre } = data;

  return (
    <Card className={cn("max-sm:rounded-xl", libera < 0 && "border-l-4 border-l-red-500")}>
      <CardHeader className="pb-2 max-sm:p-3 max-sm:pb-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className={cn("h-4 w-4", libera >= 0 ? "text-emerald-500" : "text-red-500")} aria-hidden="true" />
          {t("Quanto è davvero tuo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        <Riga etichetta={t("In banca oggi")} valore={formatCurrency(inBanca)} nota={t("saldo di tutti i conti attivi")} />
        <Riga
          etichetta={t("Fatture già arrivate da pagare")}
          valore={`−${formatCurrency(daPagare)}`}
          nota={scaduto > 0
            ? t("di cui {importo} già scaduti", { importo: formatCurrency(scaduto) })
            : t("uscite registrate e non ancora pagate")}
          colore="text-rose-600"
        />
        <Riga
          etichetta={t("Cassa libera")}
          valore={`${libera < 0 ? "−" : ""}${formatCurrency(Math.abs(libera))}`}
          forte
          colore={libera >= 0 ? "text-emerald-700" : "text-red-700"}
        />

        <p className={cn("mt-2 text-[13px]", copre ? "text-muted-foreground" : "text-amber-800")}>
          {scadeSubito > 0
            ? (copre
              ? t("Nei prossimi 30 giorni scadono {importo}: la cassa libera li copre.", { importo: formatCurrency(scadeSubito) })
              : t("Nei prossimi 30 giorni scadono {importo}: la cassa libera non basta, serve incassare prima.", { importo: formatCurrency(scadeSubito) }))
            : t("Nei prossimi 30 giorni non scade niente.")}
        </p>

        {(daIncassare > 0 || anticipatoDaiCantieri > 0) && (
          <div className="mt-2 border-t pt-2 text-[13px] text-muted-foreground">
            {daIncassare > 0 && (
              <p>{t("Dai clienti devi ancora incassare {importo}: non è cassa finché non arriva.", { importo: formatCurrency(daIncassare) })}</p>
            )}
            {anticipatoDaiCantieri > 0 && (
              <p className={daIncassare > 0 ? "mt-0.5" : undefined}>
                {t("I cantieri aperti hanno pagato {importo} più di quanto hanno incassato: li stai finanziando tu. Quei soldi sono già usciti dal conto, non vanno tolti un\u2019altra volta.", { importo: formatCurrency(anticipatoDaiCantieri) })}{" "}
                <Link to="/azienda/ordini?tab=marginalita" className="font-medium underline underline-offset-2">{t("Vedi quali")}</Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CassaLiberaAzienda;
