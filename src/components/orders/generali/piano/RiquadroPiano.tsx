// src/components/orders/generali/piano/RiquadroPiano.tsx
// Il riquadro del piano in Panoramica: margine previsto contro margine a finire (stima
// finale) e capitale impegnato. Usa la versione approvata (la bozza se non ce n'è).
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { euro, euroSegno, nomePiano, tonoScostamento } from "@/components/orders/generali/piano/formato";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const tr = useT();
  const n = useGeneralePianoNumeri(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  if (!riepilogo.permessi.margini || n.isError) return null;

  const apri = () => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "piano");
    setParametri(dopo, { replace: true });
  };

  const intestazione = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="generale-section-icon"><ChartNoAxesCombined aria-hidden="true" /></span>{tr("Piano economico")}
        {n.inVista?.stato === "bozza" && <Badge variant="outline" className="font-normal">{tr("bozza, non approvato")}</Badge>}
      </h2>
      <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={apri}>
        {tr("Apri il piano")} <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
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
    if (telefono) return null;
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        {intestazione}
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("Scrivi {piano} per vedere qui il margine a finire e il capitale impegnato.", { piano: nomePiano(riepilogo.generale.modello) })}
        </p>
      </section>
    );
  }

  const t = n.piano.confronto.totali.margine;
  const c = n.piano.capitale;
  // Stime incomplete: margine e scostamento non si possono dire. Una riga sola, non due «—» con
  // la stessa frase sotto (la Panoramica lo dice già nel percorso «Completa l'operazione»).
  if (n.piano.budgetCompleto === false) {
    return (
      <section aria-label={tr("Piano economico")} className="generale-panel px-4 py-4">
        {intestazione}
        <p className="mt-2 text-sm">
          {tr("Capitale investito a oggi")} <span className="font-semibold tabular-nums">{euro(c.investitoOggi)}</span>
          <span className="text-muted-foreground"> {tr("· costi registrati meno incassi")}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Margine previsto e scostamento compaiono quando il budget ha tutte le stime.")}</p>
      </section>
    );
  }
  return (
    <section aria-label={tr("Piano economico")} className="generale-panel px-4 py-4">
      {intestazione}
      <div className="mt-2 grid grid-cols-2 gap-3">
        {/* Qui il budget è completo: con le stime incomplete il riquadro è la riga sola qui sopra. */}
        <Numero etichetta={tr("Margine previsto")} valore={euro(t.previsto)} nota={n.inVista ? tr("versione {n}", { n: n.inVista.numero }) : undefined} />
        <Numero
          etichetta={tr("Scostamento del margine")}
          valore={euroSegno(t.scostamento)}
          tono={t.scostamento < 0 ? "text-destructive" : undefined}
          nota={tr("stima finale rispetto al previsto")}
        />
        <Numero etichetta={tr("Capitale investito a oggi")} valore={euro(c.investitoOggi)} nota={tr("costi registrati meno incassi")} />
      </div>
      {Math.abs(t.scostamento) >= 1 && (
        <p className={cn("mt-2 text-xs", tonoScostamento(t.scostamento, "margine"))}>
          {t.scostamento < 0
            ? tr("La stima finale è sotto il previsto di {importo}: apri il piano per vedere quali voci pesano.", { importo: euro(-t.scostamento) })
            : tr("La stima finale è sopra il previsto di {importo}.", { importo: euro(t.scostamento) })}
        </p>
      )}
    </section>
  );
}
