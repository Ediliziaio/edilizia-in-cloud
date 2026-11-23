import { useMemo, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { CampoNumero } from "./Campi";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { preparaProveVendita } from "@/lib/orders/generali/prezziVendita";
import type { IpotesiDaConfrontare } from "./Confronto";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const euro = (n: number | null) => n === null ? "—" : new Intl.NumberFormat(intlCampo(),{style:"currency",currency:"EUR",useGrouping:"always"}).format(n);
const quota = (n: number | null) => n === null ? "—" : new Intl.NumberFormat(intlCampo(),{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);

export function ProvaPrezziVendita({ riferimento, progetto, apertoIniziale }: {
  riferimento: IpotesiDaConfrontare;
  progetto: IpotesiDaConfrontare;
  apertoIniziale: boolean;
}) {
  const t = useT();
  const [aperto,setAperto] = useState(apertoIniziale);
  const prova = useMemo(()=>aperto ? preparaProveVendita(riferimento.ipotesi,progetto.ipotesi) : null,[aperto,riferimento.ipotesi,progetto.ipotesi]);
  return <Collapsible open={aperto} onOpenChange={setAperto} className="rounded-xl border bg-card">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="flex h-auto w-full justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> {t("Prova tre prezzi di vendita")}</span>
        <ChevronDown className={`h-4 w-4 ${aperto ? "rotate-180" : ""}`} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="border-t px-4 py-4">
      {prova ? <Prezzi prova={prova} riferimento={riferimento.nome} progetto={progetto.nome} /> :
        <p className="text-sm text-muted-foreground">{t("Aggiungi almeno un’unità da vendere nella seconda ipotesi.")}</p>}
    </CollapsibleContent>
  </Collapsible>;
}

function Prezzi({ prova,riferimento,progetto }: {
  prova: NonNullable<ReturnType<typeof preparaProveVendita>>;
  riferimento: string;
  progetto: string;
}) {
  const t = useT();
  const [prezzi,setPrezzi] = useState<Array<number | null>>(()=>{
    const primo = prova.attuale || prova.base.ricavi;
    const almeno = Math.max(primo,prova.prezzoPariEuro ?? 0,prova.prezzoPariPercentuale ?? 0,1);
    const passo = Math.max(1, 0.5 * 10 ** (Math.floor(Math.log10(almeno))-1));
    return [primo,prova.prezzoPariEuro ?? prova.prezzoPariPercentuale,Math.ceil(almeno*1.02/passo)*passo];
  });
  const risultati = useMemo(()=>prezzi.map(p=>p === null ? null : prova.simula(p)),[prezzi,prova]);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("Confronto {progetto} con {riferimento}.", { progetto: "\u0000", riferimento }).split("\u0000").map((pezzo, i) => (
      <span key={i}>{i > 0 && <strong className="text-foreground" dir="auto">{progetto}</strong>}{pezzo}</span>
    ))}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border bg-primary/5 px-3 py-2.5">
        <h3 className="text-xs font-medium text-primary">{t("Stesso margine in euro")}</h3>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{prova.prezzoPariEuro === null ? t("Non raggiungibile") : euro(prova.prezzoPariEuro)}</p>
        <p className="text-xs text-muted-foreground">{t("Margine di riferimento {importo}", { importo: euro(prova.base.margine) })}</p>
      </div>
      <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t("Stesso margine sui ricavi")}</h3>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{prova.base.marginePct === null ? t("Riferimento senza ricavi") :
          prova.prezzoPariPercentuale === null ? t("Non raggiungibile") : euro(prova.prezzoPariPercentuale)}</p>
        <p className="text-xs text-muted-foreground">{t("Percentuale di riferimento {percentuale}", { percentuale: quota(prova.base.marginePct) })}</p>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {prezzi.map((p,i)=><CampoNumero key={i} id={`prezzo-vendita-prova-${i}`} etichetta={t("Prezzo di vendita {n}", { n: i+1 })} unita="€" valore={p} vuotoPermesso
        onCambia={n=>setPrezzi(p=>p.map((val,k)=>k===i ? n : val))} />)}
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <table aria-label={t("Margine ai tre prezzi di vendita")} className="w-full min-w-[545px] text-sm tabular-nums">
        <thead className="border-b bg-muted/30 text-muted-foreground"><tr>
          <th scope="col" className="px-3 py-2 text-left font-medium">{t("Vendita")}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{t("Costi")}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{t("Margine prima degli interessi")}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{t("Sui ricavi")}</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">{t("Dal riferimento")}</th>
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
