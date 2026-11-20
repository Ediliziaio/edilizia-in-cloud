import { useId } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import type { GiornoGoogleOrganico } from "@/hooks/useSitiGoogleMetriche";

const numero = new Intl.NumberFormat("it-IT");
const giornoBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const giornoIntero = new Intl.DateTimeFormat("it-IT", { dateStyle: "full", timeZone: "UTC" });
const metriche = [
  { chiave: "clic", nome: "Clic Search Console", colore: "#2563eb" },
  { chiave: "sessioni", nome: "Sessioni organiche GA4", colore: "#c2410c", tratteggio: "5 3" },
] as const;

export function GoogleOrganicoChart({ serie, giorni, mostraTabella, onMostraTabella }: {
  serie: GiornoGoogleOrganico[];
  giorni: number;
  mostraTabella: boolean;
  onMostraTabella: () => void;
}) {
  const idTabella = useId();
  const ciSonoDati = serie.some(g => g.clic !== null && g.sessioni !== null);

  if (!ciSonoDati) return null;

  return (
    <div className="mt-4 min-w-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3 sm:px-4">
        <div>
          <h4 className="text-sm font-semibold">Andamento giornaliero</h4>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {metriche.map(m => (
              <span key={m.chiave} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-4 shrink-0 border-t-2"
                  style={{ borderColor: m.colore, borderTopStyle: "tratteggio" in m ? "dashed" : "solid" }} />
                {m.nome}
              </span>
            ))}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-expanded={mostraTabella} aria-controls={idTabella}
          onClick={onMostraTabella}>
          {mostraTabella ? "Nascondi dati giornalieri" : "Mostra dati giornalieri"}
        </Button>
      </div>
      <div className="px-2 pt-2 sm:px-4" role="img"
        aria-label={`Clic Search Console e sessioni organiche GA4, giorno per giorno negli ultimi ${giorni} giorni`}>
        <ResponsiveContainer width="100%" height={242}>
          <LineChart data={serie} margin={{ top: 8, right: 15, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="giorno" tickLine={false} axisLine={false} minTickGap={22} interval="preserveStartEnd"
              tickFormatter={(giorno: string) => giornoBreve.format(new Date(giorno))}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis allowDecimals={false} domain={[0, "auto"]} tickLine={false} axisLine={false} width={44}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Tooltip labelFormatter={giorno => giornoIntero.format(new Date(String(giorno)))}
              formatter={valore => numero.format(Number(valore))}
              contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: 8, fontSize: 12 }} />
            {metriche.map(m => (
              <Line key={m.chiave} name={m.nome} dataKey={m.chiave} stroke={m.colore} strokeWidth={2}
                strokeDasharray={"tratteggio" in m ? m.tratteggio : undefined}
                dot={{ r: 2, strokeWidth: 0, fill: m.colore }} activeDot={{ r: 4 }}
                isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {serie.some(g => g.clic === null || g.sessioni === null) && (
        <p className="px-3 pb-3 text-xs text-muted-foreground sm:px-4">
          Il grafico mostra i valori dei giorni coperti da entrambe le fonti.
        </p>
      )}
      <div id={idTabella} hidden={!mostraTabella} className="max-h-80 overflow-auto border-t">
        {mostraTabella && <table className="w-full text-sm">
          <caption className="sr-only">Clic e sessioni organiche per giorno</caption>
          <thead className="sticky top-0 bg-muted">
            <tr className="text-left">
              <th scope="col" className="p-2.5 font-medium">Giorno</th>
              {metriche.map(m => <th key={m.chiave} scope="col" className="p-2.5 text-right font-medium">{m.nome}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...serie].reverse().map(g => (
              <tr key={g.giorno}>
                <th scope="row" className="p-2.5 text-left font-normal">
                  <time dateTime={g.giorno}>{giornoBreve.format(new Date(g.giorno))}</time>
                </th>
                {metriche.map(m => (
                  <td key={m.chiave} className="p-2.5 text-right tabular-nums">
                    {g[m.chiave] === null ? <span aria-label="Dato non disponibile">—</span> : numero.format(g[m.chiave])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
    </div>
  );
}
