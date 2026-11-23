import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { Ref } from "react";
import { Link, type To } from "react-router-dom";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Button } from "@/components/ui/button";
import type { MeseComposizione } from "@/lib/orders/generali/investitoriConti";
import { euro, nomeMese } from "../piano/formato";

export function CoperturaMensileInvestitori({ mesi, mese, ipotesi, cambiaMese, registro, refArea }: {
  mesi: MeseComposizione[];
  mese: MeseComposizione;
  ipotesi?: MeseComposizione;
  cambiaMese: (mese: string) => void;
  registro: To;
  refArea: Ref<HTMLElement>;
}) {
  const valori = [
    { titolo: "Fabbisogno del piano", importo: mese.fabbisogno, colore: "" },
    { titolo: mese.reale ? "Capitale a fine mese" : "Capitale stimato a fine mese", importo: mese.capitaleDalleFonti, colore: "",
      confronto: ipotesi?.capitaleDalleFonti },
    { titolo: "Da coprire", importo: mese.scoperto, colore: mese.scoperto > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
      confronto: ipotesi?.scoperto },
  ];
  return <section ref={refArea} tabIndex={-1} aria-labelledby="copertura-mensile-investitori" className="generale-panel">
    <header className="flex flex-wrap items-center gap-2 px-3 py-2">
      <h3 id="copertura-mensile-investitori" className="mr-auto flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-primary" aria-hidden="true" /> Copertura mensile
      </h3>
      <OfficeSelect label="Mese della copertura" value={mese.mese} onValueChange={cambiaMese} className="h-8 w-44 text-xs"
        options={mesi.map(m => ({
          value: m.mese,
          label: `${nomeMese(m.mese)}${m.scoperto >= 1 ? " · scoperto" : ""}`,
        }))} />
      <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
        <Link to={registro}>Movimenti del mese <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
      </Button>
    </header>
    <dl className="grid grid-cols-1 border-t bg-muted/20 sm:grid-cols-3 sm:divide-x">
      {valori.map(v => <div key={v.titolo} className="flex items-baseline justify-between gap-2 px-3 py-2 sm:block">
        <dt className="text-xs text-muted-foreground">{v.titolo}</dt>
        <dd className="text-right sm:text-left">
          <span className={`text-sm font-semibold tabular-nums ${v.colore}`}>{euro(v.importo)}</span>
          {v.confronto !== undefined && <span className="block text-xs text-blue-800 dark:text-blue-300">Con ipotesi {euro(v.confronto)}</span>}
        </dd>
      </div>)}
    </dl>
    {!mese.reale && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
      La stima include erogazioni e rimborsi attesi. Il registro mostra i movimenti inseriti.
    </p>}
  </section>;
}
