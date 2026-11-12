// src/components/orders/generali/investitori/RiquadroInvestitori.tsx
// Il riquadro degli investitori in Panoramica: capitale raccolto dalle fonti contro il
// capitale massimo impegnato del piano, e il rendimento atteso. Lo vede chi vede i margini.
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { euro } from "@/components/orders/generali/piano/formato";
import { useGeneraleInvestitori } from "@/hooks/useGeneraleInvestitori";
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

export function RiquadroInvestitori({ riepilogo }: PropsScheda) {
  const inv = useGeneraleInvestitori(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  // Da telefono la scheda non c'è: il riquadro si legge e basta.
  const telefono = useIsMobile();
  if (!riepilogo.permessi.margini || inv.isError) return null;

  const apri = () => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "investitori");
    setParametri(dopo, { replace: true });
  };

  const intestazione = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="generale-section-icon"><Landmark aria-hidden="true" /></span>Investitori</h2>
      {!telefono && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={apri}>
          Apri gli investitori <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  if (inv.isLoading) {
    return (
      <section className="space-y-2 rounded-lg border bg-card px-4 py-3">
        {intestazione}
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  const c = inv.conti;
  if (c.fonti.length === 0) {
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        {intestazione}
        <p className="mt-1 text-sm text-muted-foreground">
          Aggiungi le fonti (mezzi propri, investitori, banca) per vedere se coprono il capitale che l'operazione chiede.
        </p>
      </section>
    );
  }

  const n = inv.numeri;
  return (
    <section aria-label="Investitori" className="generale-panel px-4 py-4">
      {intestazione}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Numero etichetta="Capitale ancora dentro" valore={euro(c.totali.dentro)} nota={`impegni ${euro(c.totali.impegno)}`} />
        <Numero etichetta="Ancora da versare" valore={euro(c.totali.daVersare)} nota="impegni non ancora versati" />
      </div>
      <dl className="generale-mini-sources mt-3 border-t pt-3">{c.copertura.map(g => <div key={g.gruppo}><dt>{g.nome}</dt><dd>{euro(g.dentro)}</dd></div>)}</dl>
      {c.costoDebito.totale >= 1 && (
        <p className="mt-2 text-xs text-muted-foreground">Costo del debito stimato: {euro(c.costoDebito.totale)} tra interessi e spese.</p>
      )}
      {n && c.scoperto >= 1 && (
        <p className="mt-2 text-xs text-destructive">
          Le fonti non coprono il picco di esposizione: mancano {euro(c.scoperto)}.
        </p>
      )}
    </section>
  );
}
