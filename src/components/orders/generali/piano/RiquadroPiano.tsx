// src/components/orders/generali/piano/RiquadroPiano.tsx
// Il riquadro del piano in Panoramica: margine previsto contro margine a finire (stima
// finale) e capitale impegnato. Usa la versione approvata (la bozza se non ce n'è).
import { useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { euro, euroSegno, nomeMese, nomePiano, tonoScostamento } from "@/components/orders/generali/piano/formato";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { cn } from "@/lib/utils";

function Numero({ etichetta, valore, nota, tono }: { etichetta: string; valore: string; nota?: string; tono?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tono)}>{valore}</p>
      {nota && <p className="truncate text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

export function RiquadroPiano({ riepilogo }: PropsScheda) {
  const n = useGeneralePianoNumeri(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  if (!riepilogo.permessi.margini || n.isError) return null;

  const apri = () => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "piano");
    setParametri(dopo, { replace: true });
  };

  const intestazione = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Piano economico
        {n.inVista?.stato === "bozza" && <Badge variant="outline" className="font-normal">bozza, non approvato</Badge>}
      </h2>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={apri}>
        Apri il piano <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );

  if (n.isLoading || (!n.vuoto && !n.piano)) {
    return (
      <section className="space-y-2 rounded-lg border bg-card px-4 py-3">
        {intestazione}
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  if (n.vuoto || !n.piano) {
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        {intestazione}
        <p className="mt-1 text-sm text-muted-foreground">
          Scrivi {nomePiano(riepilogo.generale.modello)} per vedere qui il margine a finire e il capitale impegnato.
        </p>
      </section>
    );
  }

  const t = n.piano.confronto.totali.margine;
  const c = n.piano.capitale;
  return (
    <section aria-label="Piano economico" className="rounded-lg border bg-card px-4 py-3">
      {intestazione}
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero etichetta="Margine previsto" valore={euro(t.previsto)} nota={n.inVista ? `versione ${n.inVista.numero}` : undefined} />
        <Numero
          etichetta="Margine a finire (stima)"
          valore={euro(t.stima)}
          tono={t.stima < 0 ? "text-destructive" : undefined}
          nota={`${euroSegno(t.scostamento)} sul previsto`}
        />
        <Numero
          etichetta="Capitale massimo impegnato"
          valore={euro(c.massimoStima)}
          nota={c.meseMassimoStima ? `a ${nomeMese(c.meseMassimoStima)}` : undefined}
        />
        <Numero etichetta="Capitale investito a oggi" valore={euro(c.investitoOggi)} nota="costi registrati meno incassi" />
      </div>
      {Math.abs(t.scostamento) >= 1 && (
        <p className={cn("mt-2 text-xs", tonoScostamento(t.scostamento, "margine"))}>
          {t.scostamento < 0
            ? `La stima finale è sotto il previsto di ${euro(-t.scostamento)}: apri il piano per vedere quali voci pesano.`
            : `La stima finale è sopra il previsto di ${euro(t.scostamento)}.`}
        </p>
      )}
    </section>
  );
}
