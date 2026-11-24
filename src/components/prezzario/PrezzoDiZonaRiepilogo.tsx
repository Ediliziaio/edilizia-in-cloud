/**
 * Il verdetto di fine preventivo: quanto si sta sopra o sotto il prezzario
 * della propria regione, e su quanta parte del computo quel verdetto vale.
 *
 * La copertura non è un dettaglio tecnico da nascondere: "+12% sul mercato"
 * calcolato su un quinto dell'importo è un'impressione, non una misura, e chi
 * legge deve poterlo distinguere da un +12% calcolato su tutto.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { tonoScostamento, type RiepilogoConfronto } from "@/lib/prezzario/confronto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  riepilogo: RiepilogoConfronto | null;
  fonteLabel: string | null;
  regione: string | null;
  isLoading: boolean;
  indisponibile: "regione-mancante" | "prezzario-mancante" | "errore-ricerca" | null;
  /** Layout compatto per la barra sotto al computo. */
  compatto?: boolean;
}

export function PrezzoDiZonaRiepilogo({
  riepilogo, fonteLabel, regione, isLoading, indisponibile, compatto = false,
}: Props) {
  const t = useT();
  if (indisponibile) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-2 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {indisponibile === "regione-mancante"
              ? t("Per confrontare i prezzi col mercato serve sapere in che regione lavori: compila la provincia della sede in Impostazioni → Profilo aziendale.")
              : indisponibile === "errore-ricerca"
                ? t("Confronto col prezzario temporaneamente non disponibile. Nessun prezzo del preventivo è stato modificato.")
              : t("Non c'è un prezzario pubblicato per {regione}. Non confronto con quello di un'altra regione: sarebbe peggio che non confrontare.", { regione: regione ?? "" })}
          </span>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !riepilogo) {
    return (
      <Card className="border-dashed">
        <CardContent className="px-3 py-2.5 text-xs text-muted-foreground">
          {t("Confronto col prezzario {fonte} in corso…", { fonte: fonteLabel ?? t("regionale") })}
        </CardContent>
      </Card>
    );
  }

  if (riepilogo.confrontate === 0) {
    // Due situazioni diverse, e chi legge deve poterle distinguere: "il
    // prezzario non ha queste lavorazioni" è un problema suo, "le ha ma non
    // dice in che unità" è un problema del prezzario caricato.
    const trovate = riepilogo.trovateNonConfrontabili;
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-2 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {trovate > 0
              ? t(trovate === 1 ? "Nel prezzario {fonteLabel} ho trovato {n} voce simile, ma senza unità di misura dichiarata: confrontare i prezzi senza sapere se sono al metro quadro o a pezzo direbbe un numero a caso." : "Nel prezzario {fonteLabel} ho trovato {n} voci simili, ma senza unità di misura dichiarata: confrontare i prezzi senza sapere se sono al metro quadro o a pezzo direbbe un numero a caso.", { fonteLabel: fonteLabel ?? "", n: trovate })
              : t("Nessuna voce del computo ha una corrispondenza nel prezzario {fonteLabel}. Non c'è niente da confrontare.", { fonteLabel: fonteLabel ?? "" })}
          </span>
        </CardContent>
      </Card>
    );
  }

  const tono = tonoScostamento(riepilogo.scostamentoPct);
  const Icona = tono === "sopra" ? TrendingUp : tono === "sotto" ? TrendingDown : Minus;
  const colore = tono === "sopra" ? "text-amber-600" : tono === "sotto" ? "text-sky-600" : "text-emerald-600";
  const coperturaPct = Math.round(riepilogo.copertura * 100);
  const parziale = riepilogo.copertura < 0.6;
  // La frase si traduce intera; l'importo, in grassetto, entra dove sta il segnaposto.
  const fraseScostamento = (riepilogo.scostamentoEuro >= 0
    ? t("Chiedi {importo} in più di quanto costerebbe a prezzario, sulle voci confrontate.", { importo: "\u0001" })
    : t("Chiedi {importo} in meno di quanto costerebbe a prezzario, sulle voci confrontate.", { importo: "\u0001" })).split("\u0001");

  return (
    <Card>
      <CardContent className={compatto ? "space-y-2 px-3 py-2.5" : "space-y-3 px-4 py-3"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {t("Prezzo di zona")} · {fonteLabel}
          </div>
          <Badge variant="outline" className="text-[10px] font-normal">{t("{n} di {n2} voci", { n: riepilogo.confrontate, n2: riepilogo.totali })}</Badge>
        </div>

        <div className="flex items-baseline gap-2">
          <Icona className={`h-5 w-5 shrink-0 ${colore}`} />
          <span className={`text-2xl font-bold tabular-nums ${colore}`}>
            {riepilogo.scostamentoPct == null
              ? "—"
              : `${riepilogo.scostamentoPct > 0 ? "+" : ""}${riepilogo.scostamentoPct.toFixed(1)}%`}
          </span>
          <span className="text-sm text-muted-foreground">
            {tono === "sopra" ? t("sopra il prezzario") : tono === "sotto" ? t("sotto il prezzario") : t("in linea col prezzario")}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {fraseScostamento[0]}
          <strong className="text-foreground">
            {formatCurrency(Math.abs(riepilogo.scostamentoEuro))}
          </strong>
          {fraseScostamento[1]}
        </p>

        <div className="space-y-1">
          <Progress value={coperturaPct} className="h-1.5" />
          <p className="text-[11px] leading-4 text-muted-foreground">
            {t("Calcolato sul {percentuale}% dell'importo ({confrontato} su {totale}).", { percentuale: coperturaPct, confrontato: formatCurrency(riepilogo.importoConfrontato), totale: formatCurrency(riepilogo.importoTotale) })}
            {parziale && ` ${t("Su meno di due terzi del computo: prendilo come indicazione, non come misura.")}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
