import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import type { ContiInvestitori, ScenarioDebito } from "@/lib/orders/generali/investitoriConti";
import { euro, euroSegno, nomeMese, percento } from "../piano/formato";

const TASSI = [-1, -0.5, 0, 0.5, 1, 2];
const IMPEGNI = [-50, -30, -20, -10, 0, 10, 20];
const CON_SEGNO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
type Riga = { titolo: string; prima: number; dopo: number; crescitaPositiva?: boolean; mesePrima?: string | null; meseDopo?: string | null };

export function ScenarioFinanziamenti({ valore, cambia, base, ipotesi, haTassi, haBanca, apriMese }: {
  valore: ScenarioDebito;
  cambia: (valore: ScenarioDebito) => void;
  base: ContiInvestitori;
  ipotesi: ContiInvestitori | null;
  haTassi: boolean;
  haBanca: boolean;
  apriMese: (mese: string) => void;
}) {
  return <section aria-labelledby="investitori-titolo-scenario" className="generale-panel">
    <header className="flex flex-wrap items-center gap-2 px-3 py-2">
      <h3 id="investitori-titolo-scenario" className="mr-auto flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" /> Simula i finanziamenti
      </h3>
      {haTassi && <OfficeSelect label="Variazione del tasso annuo" className="h-8 w-44 text-xs" value={String(valore.tassoPunti)}
        options={TASSI.map(n => ({ value: String(n), label: n === 0 ? "Tassi attuali" : `Tassi ${CON_SEGNO.format(n)} ${Math.abs(n) === 1 ? "punto" : "punti"}` }))}
        onValueChange={v => cambia({ ...valore, tassoPunti: Number(v) })} />}
      {haBanca && <OfficeSelect label="Variazione di banca e finanziamenti" className="h-8 w-52 text-xs" value={String(valore.debitoPct)}
        options={IMPEGNI.map(n => ({ value: String(n), label: n === 0 ? "Importi attuali" : `Finanziamenti ${CON_SEGNO.format(n)}%` }))}
        onValueChange={v => cambia({ ...valore, debitoPct: Number(v) })} />}
      {ipotesi && <Button type="button" size="sm" variant="outline" className="h-8"
        onClick={() => cambia({ tassoPunti: 0, debitoPct: 0 })}>Azzera ipotesi</Button>}
    </header>
    {ipotesi && <ConfrontoFinanziamenti base={base} ipotesi={ipotesi} apriMese={apriMese} />}
  </section>;
}

function ConfrontoFinanziamenti({ base, ipotesi, apriMese }: {
  base: ContiInvestitori;
  ipotesi: ContiInvestitori;
  apriMese: (mese: string) => void;
}) {
  const baseRoe = base.rendimenti.mezziPropri?.roe ?? null;
  const ipotesiRoe = ipotesi.rendimenti.mezziPropri?.roe ?? null;
  const righe: Riga[] = [
    { titolo: "Costo stimato del debito", prima: base.costoDebito.totale, dopo: ipotesi.costoDebito.totale },
    ...(base.haPiano ? [
      { titolo: "Utile da ripartire", prima: base.utile.stima, dopo: ipotesi.utile.stima, crescitaPositiva: true },
      { titolo: "Scoperto negli impegni", prima: base.scopertoImpegni, dopo: ipotesi.scopertoImpegni },
      { titolo: "Scoperto mensile massimo", prima: base.scopertoCalendario.importo, dopo: ipotesi.scopertoCalendario.importo,
        mesePrima: base.scopertoCalendario.mese, meseDopo: ipotesi.scopertoCalendario.mese },
    ] : []),
  ];

  const valore = (n: number, mese?: string | null, collegamento = true) => <>
    {euro(n)}
    {mese && (collegamento
      ? <button type="button" className="ml-2 text-xs font-medium text-primary hover:underline"
        aria-label={`Apri copertura di ${nomeMese(mese)}`} onClick={() => apriMese(mese)}>{nomeMese(mese)}</button>
      : <span className="ml-2 text-xs text-muted-foreground">{nomeMese(mese)}</span>)}
  </>;

  return <>
    <div className="overflow-x-auto border-t">
      <table aria-label="Confronto delle ipotesi di finanziamento" className="generale-registro-tabella min-w-[34rem]">
        <thead className="bg-muted/40"><tr>
          <th scope="col">Indicatore</th><th scope="col" className="text-right">Base</th>
          <th scope="col" className="text-right">Con ipotesi</th><th scope="col" className="text-right">Differenza</th>
        </tr></thead>
        <tbody>{righe.map(r => {
          const delta = r.dopo - r.prima;
          const bene = r.crescitaPositiva ? delta > 0 : delta < 0;
          const tono = Math.abs(delta) < 0.5 ? "text-muted-foreground" : bene ? "text-emerald-700 dark:text-emerald-400" : "text-destructive";
          return <tr key={r.titolo}>
            <th scope="row" className="text-left">{r.titolo}</th>
            <td className="text-right tabular-nums">{valore(r.prima, r.mesePrima, r.mesePrima !== r.meseDopo)}</td>
            <td className="text-right font-semibold tabular-nums">{valore(r.dopo, r.meseDopo)}</td>
            <td className={`text-right font-medium tabular-nums ${tono}`}>{euroSegno(delta)}</td>
          </tr>;
        })}
          {(baseRoe !== null || ipotesiRoe !== null) && <tr>
            <th scope="row" className="text-left">Rendimento dei mezzi propri</th>
            <td className="text-right tabular-nums">{percento(baseRoe)}</td>
            <td className="text-right font-semibold tabular-nums">{percento(ipotesiRoe)}</td>
            <td className="text-right tabular-nums">{baseRoe === null || ipotesiRoe === null
              ? "—" : `${CON_SEGNO.format((ipotesiRoe - baseRoe) * 100)} punti`}</td>
          </tr>}
        </tbody>
      </table>
    </div>
    <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
      L’ipotesi conserva gli importi di erogazioni e rimborsi già inseriti. Le variazioni qui sono temporanee.
    </p>
  </>;
}
