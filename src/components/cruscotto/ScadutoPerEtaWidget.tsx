import { useNavigate } from "react-router-dom";
import { ArrowRight, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ciambella } from "@/components/charts/grafici/Ciambella";
import { formatCurrency } from "@/lib/formatters";
import type { ScadutoPerEta } from "@/hooks/useCruscottoData";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Dal 08/11/2026 le voci sono quelle del Previsionale (rate, scadenze e fatture,
 * una volta sola): lo stesso numero della sua pagina, «Incassi scaduti».
 *
 * Lo scaduto da incassare (lo stesso numero in cima alla pagina) diviso per
 * età. 325.000 € scaduti da una settimana e scaduti da sei mesi sono due
 * problemi diversi: il primo è un sollecito, il secondo un credito a rischio.
 */
// Più vecchio, più rosso: ambra, arancio, rosso, rosso scuro.
const COLORI_ETA = ["hsl(43 96% 56%)", "hsl(25 95% 53%)", "hsl(0 84% 60%)", "hsl(0 72% 42%)"];

export function ScadutoPerEtaWidget({ scaduto, isLoading }: { scaduto: ScadutoPerEta; isLoading: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (scaduto.rate === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <Hourglass className="h-4 w-4 text-muted-foreground" />
          {t("Scaduto per età")}
          <span className="text-[11px] font-medium text-muted-foreground/80">{t("a oggi")}</span>
          <span className="basis-full text-xs font-normal text-muted-foreground sm:ml-auto sm:basis-auto">
            {formatCurrency(scaduto.totale)} · {scaduto.rate === 1 ? t("{n} incasso", { n: scaduto.rate }) : t("{n} incassi", { n: scaduto.rate })}
            {scaduto.ritardoMedio !== null && <>{" "}{t("· ritardo medio {ritardoMedio} gg", { ritardoMedio: String(scaduto.ritardoMedio ?? "") })}</>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* 14/11/2026: una ciambella per età al posto della barra e dei quattro riquadri:
            si vede a colpo d'occhio quanta parte dello scaduto è vecchia. */}
        <Ciambella
          titolo={t("Scaduto per età")}
          etichettaCentro="Scaduto"
          dimensione={140}
          fette={scaduto.fasce.map((f, i) => ({
            nome: f.etichetta,
            valore: f.importo,
            colore: COLORI_ETA[i],
            nota: `${f.rate} ${f.rate === 1 ? "incasso" : "incassi"}`,
          }))}
        />
        <button type="button" onClick={() => navigate("/azienda/previsionale")}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {t("Apri gli incassi scaduti nel Previsionale")} <ArrowRight className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  );
}
