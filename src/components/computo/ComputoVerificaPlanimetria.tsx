import { Map as MapIcon, ExternalLink } from "lucide-react";
import type { verificaComputoConPlanimetria } from "@/lib/planimetrie/computoConPlanimetria";
import { percorsoMisuraSullaPianta, type FonteStudio, type RigaStudio } from "@/lib/planimetrie/studioImmobiliare";

type Righe = ReturnType<typeof verificaComputoConPlanimetria>;

const stati = {
  pianta: "Da misure della pianta",
  indicativa: "Indicativa dalla variante",
  manuale: "Inserita o modificata a mano",
  daMisurare: "Da quantificare",
} as const;
const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6, useGrouping: "always" });
const mostraQuantita = (n: number | null | undefined, unita: string) => n == null ? "—" : `${formato.format(n)} ${unita}`;

export function ComputoVerificaPlanimetria({ fonte, righe, variante, scalaIncerta, avviso, onUsaMisura }: {
  fonte: FonteStudio;
  righe?: Righe;
  variante?: string;
  scalaIncerta?: boolean;
  avviso?: string;
  onUsaMisura: (riga: RigaStudio) => void;
}) {
  const ambito = new URLSearchParams({ versione: String(fonte.versione), ambito: `progetto:${fonte.varianteId}` });
  const conteggi = { pianta: 0, indicativa: 0, manuale: 0, daMisurare: 0 };
  righe?.forEach(r => conteggi[r.stato]++);
  return <section className="rounded-xl border bg-card text-sm" aria-label="Origine delle quantità">
    <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <MapIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <h3 className="font-semibold">Quantità dalla planimetria</h3>
          <p className="text-xs text-muted-foreground">{variante || `Variante ${fonte.varianteId}`} · Versione {fonte.versione}</p>
        </div>
      </div>
      <a href={`/azienda/planimetrie/${fonte.planimetriaId}?${ambito}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Apri la variante <ExternalLink className="h-3 w-3" />
      </a>
    </div>
    {avviso && <p role="status" className="px-3 pb-2.5 text-xs text-amber-800">{avviso}</p>}
    {righe && <>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-xs tabular-nums">
        {conteggi.pianta > 0 && <span><strong>{conteggi.pianta}</strong> da misure della pianta</span>}
        {conteggi.indicativa > 0 && <span><strong>{conteggi.indicativa}</strong> indicative dalla variante</span>}
        {conteggi.manuale > 0 && <span><strong>{conteggi.manuale}</strong> inserite o modificate a mano</span>}
        {conteggi.daMisurare > 0 && <span><strong>{conteggi.daMisurare}</strong> da quantificare</span>}
      </div>
      <details className="border-t px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-primary">Confronta le quantità voce per voce</summary>
        {scalaIncerta && <p className="mt-2 text-xs text-amber-800">La variante contiene misure stimate. Verificale sul posto prima di usare il computo.</p>}
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full min-w-[450px] text-left text-xs" aria-label="Confronto delle quantità">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr><th scope="col" className="p-2">Lavorazione</th><th scope="col" className="p-2 text-right">Nella variante</th><th scope="col" className="p-2 text-right">Nel computo</th><th scope="col" className="p-2">Origine della misura</th><th scope="col" className="p-2">Fonte del prezzo</th></tr>
            </thead>
            <tbody className="divide-y">
              {righe.map(({ voce, indice, riga, quantita, stato }) => {
                const percorso = riga && percorsoMisuraSullaPianta(fonte,riga);
                return <tr key={voce.id}>
                <th scope="row" className="p-2 align-top font-medium">
                  {voce.numero || indice + 1}. {voce.descrizione.split("\n")[0] || "Lavorazione"}
                  {riga && <p className="mt-0.5 font-normal text-muted-foreground">{riga.piano} · {riga.criterio}</p>}
                  {percorso && <a className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline" href={percorso} target="_blank" rel="noreferrer">
                    Vedi sulla pianta <ExternalLink className="size-3" aria-hidden="true"/>
                  </a>}
                </th>
                <td className="p-2 text-right align-top tabular-nums">{mostraQuantita(riga?.quantita, riga?.unita ?? "")}</td>
                <td className="p-2 text-right align-top tabular-nums">{mostraQuantita(quantita, voce.unita)}</td>
                <td className={`p-2 align-top ${stato === "pianta" ? "text-muted-foreground" : "text-amber-800"}`}>
                  {riga?.quantificazioneSospesa ? "Misura sospesa sulla pianta" : stati[stato]}
                  {riga && riga.quantita !== null && !voce.detrazione && (stato === "manuale" || stato === "daMisurare") &&
                    <button type="button" className="mt-1 block font-medium text-primary underline underline-offset-2"
                      aria-label={`Usa misura dalla variante per ${riga.descrizione}`} onClick={() => onUsaMisura(riga)}>Usa misura dalla variante</button>}
                </td>
                <td className="p-2 align-top text-muted-foreground">
                  {voce.tariffa && <p className="font-medium">{voce.tariffa}</p>}
                  {voce.fonte || (voce.prezzo.trim() ? "Prezzo senza fonte registrata" : "Prezzo da definire")}
                </td>
              </tr>;})}
            </tbody>
          </table>
        </div>
      </details>
    </>}
  </section>;
}
