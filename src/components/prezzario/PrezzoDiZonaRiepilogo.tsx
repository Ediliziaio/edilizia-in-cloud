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

interface Props {
  riepilogo: RiepilogoConfronto | null;
  fonteLabel: string | null;
  regione: string | null;
  isLoading: boolean;
  indisponibile: "regione-mancante" | "prezzario-mancante" | null;
  /** Layout compatto per la barra sotto al computo. */
  compatto?: boolean;
}

export function PrezzoDiZonaRiepilogo({
  riepilogo, fonteLabel, regione, isLoading, indisponibile, compatto = false,
}: Props) {
  if (indisponibile) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-2 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {indisponibile === "regione-mancante"
              ? "Per confrontare i prezzi col mercato serve sapere in che regione lavori: compila la provincia della sede in Impostazioni → Profilo azienda."
              : `Non c'è un prezzario pubblicato per ${regione}. Non confronto con quello di un'altra regione: sarebbe peggio che non confrontare.`}
          </span>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !riepilogo) {
    return (
      <Card className="border-dashed">
        <CardContent className="px-3 py-2.5 text-xs text-muted-foreground">
          Confronto col prezzario {fonteLabel ?? "regionale"} in corso…
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
              ? `Nel prezzario ${fonteLabel} ho trovato ${trovate} ${trovate === 1 ? "voce simile" : "voci simili"}, ma senza unità di misura dichiarata: confrontare i prezzi senza sapere se sono al metro quadro o a pezzo direbbe un numero a caso.`
              : `Nessuna voce del computo ha una corrispondenza nel prezzario ${fonteLabel}. Non c'è niente da confrontare.`}
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

  return (
    <Card>
      <CardContent className={compatto ? "space-y-2 px-3 py-2.5" : "space-y-3 px-4 py-3"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Prezzo di zona · {fonteLabel}
          </div>
          <Badge variant="outline" className="text-[10px] font-normal">
            {riepilogo.confrontate} di {riepilogo.totali} voci
          </Badge>
        </div>

        <div className="flex items-baseline gap-2">
          <Icona className={`h-5 w-5 shrink-0 ${colore}`} />
          <span className={`text-2xl font-bold tabular-nums ${colore}`}>
            {riepilogo.scostamentoPct == null
              ? "—"
              : `${riepilogo.scostamentoPct > 0 ? "+" : ""}${riepilogo.scostamentoPct.toFixed(1)}%`}
          </span>
          <span className="text-sm text-muted-foreground">
            {tono === "sopra" ? "sopra il prezzario" : tono === "sotto" ? "sotto il prezzario" : "in linea col prezzario"}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Chiedi{" "}
          <strong className="text-foreground">
            {formatCurrency(Math.abs(riepilogo.scostamentoEuro))}
          </strong>
          {riepilogo.scostamentoEuro >= 0 ? " in più" : " in meno"} di quanto
          costerebbe a prezzario, sulle voci confrontate.
        </p>

        <div className="space-y-1">
          <Progress value={coperturaPct} className="h-1.5" />
          <p className="text-[11px] leading-4 text-muted-foreground">
            Calcolato sul {coperturaPct}% dell'importo ({formatCurrency(riepilogo.importoConfrontato)} su{" "}
            {formatCurrency(riepilogo.importoTotale)}).
            {parziale && " Su meno di due terzi del computo: prendilo come indicazione, non come misura."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
