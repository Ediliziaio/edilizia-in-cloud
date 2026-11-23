import { useMemo, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { CampoNumero } from "./Campi";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { preparaProveVendita } from "@/lib/orders/generali/prezziVendita";
import type { IpotesiDaConfrontare } from "./Confronto";

const valuta = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",useGrouping:"always"});
const percentuale = new Intl.NumberFormat("it-IT",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2});
const euro = (n: number | null) => n === null ? "—" : valuta.format(n);
const quota = (n: number | null) => n === null ? "—" : percentuale.format(n);

export function ProvaPrezziVendita({ riferimento, progetto, apertoIniziale }: {
  riferimento: IpotesiDaConfrontare;
  progetto: IpotesiDaConfrontare;
  apertoIniziale: boolean;
}) {
  const [aperto,setAperto] = useState(apertoIniziale);
  const prova = useMemo(()=>aperto ? preparaProveVendita(riferimento.ipotesi,progetto.ipotesi) : null,[aperto,riferimento.ipotesi,progetto.ipotesi]);
  return <Collapsible open={aperto} onOpenChange={setAperto} className="rounded-xl border bg-card">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="flex h-auto w-full justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Prova tre prezzi di vendita</span>
        <ChevronDown className={`h-4 w-4 ${aperto ? "rotate-180" : ""}`} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="border-t px-4 py-4">
      {prova ? <Prezzi prova={prova} riferimento={riferimento.nome} progetto={progetto.nome} /> :
        <p className="text-sm text-muted-foreground">Aggiungi almeno un’unità da vendere nella seconda ipotesi.</p>}
    </CollapsibleContent>
  </Collapsible>;
}

function Prezzi({ prova,riferimento,progetto }: {
  prova: NonNullable<ReturnType<typeof preparaProveVendita>>;
  riferimento: string;
  progetto: string;
}) {
  const [prezzi,setPrezzi] = useState<Array<number | null>>(()=>{
    const primo = prova.attuale || prova.base.ricavi;
    const almeno = Math.max(primo,prova.prezzoPariEuro ?? 0,prova.prezzoPariPercentuale ?? 0,1);
    const passo = Math.max(1, 0.5 * 10 ** (Math.floor(Math.log10(almeno))-1));
    return [primo,prova.prezzoPariEuro ?? prova.prezzoPariPercentuale,Math.ceil(almeno*1.02/passo)*passo];
  });
  const risultati = useMemo(()=>prezzi.map(p=>p === null ? null : prova.simula(p)),[prezzi,prova]);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Confronto <strong className="text-foreground">{progetto}</strong> con {riferimento}.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border bg-primary/5 px-3 py-2.5">
        <h3 className="text-xs font-medium text-primary">Stesso margine in euro</h3>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{prova.prezzoPariEuro === null ? "Non raggiungibile" : euro(prova.prezzoPariEuro)}</p>
        <p className="text-xs text-muted-foreground">Margine di riferimento {euro(prova.base.margine)}</p>
      </div>
      <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
        <h3 className="text-xs font-medium text-muted-foreground">Stesso margine sui ricavi</h3>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{prova.base.marginePct === null ? "Riferimento senza ricavi" :
          prova.prezzoPariPercentuale === null ? "Non raggiungibile" : euro(prova.prezzoPariPercentuale)}</p>
        <p className="text-xs text-muted-foreground">Percentuale di riferimento {quota(prova.base.marginePct)}</p>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {prezzi.map((p,i)=><CampoNumero key={i} id={`prezzo-vendita-prova-${i}`} etichetta={`Prezzo di vendita ${i+1}`} unita="€" valore={p} vuotoPermesso
        onCambia={n=>setPrezzi(p=>p.map((val,k)=>k===i ? n : val))} />)}
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <table aria-label="Margine ai tre prezzi di vendita" className="w-full min-w-[545px] text-sm tabular-nums">
        <thead className="border-b bg-muted/30 text-muted-foreground"><tr>
          <th scope="col" className="px-3 py-2 text-left font-medium">Vendita</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Costi</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Margine prima degli interessi</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Sui ricavi</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Dal riferimento</th>
        </tr></thead>
        <tbody className="divide-y">{risultati.map((r,i)=><tr key={i}>
          <th scope="row" className="px-3 py-2 text-left font-medium">{euro(r?.prezzo ?? null)}</th>
          <td className="px-3 py-2 text-right">{euro(r?.costi ?? null)}</td>
          <td className="px-3 py-2 text-right font-medium">{euro(r?.margine ?? null)}</td>
          <td className="px-3 py-2 text-right">{quota(r?.marginePct ?? null)}</td>
          <td className={`px-3 py-2 text-right ${r && r.differenza < 0 ? "text-red-700 dark:text-red-300" : ""}`}>
            {r && r.differenza > 0 ? "+" : ""}{euro(r?.differenza ?? null)}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
