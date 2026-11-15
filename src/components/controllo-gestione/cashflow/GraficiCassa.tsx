/**
 * I due grafici in cima al Cash Flow (15/11/2026, richiesta del titolare: «le candele mese
 * per mese che vedo i risultati»).
 *
 * - Candele del saldo: ogni mese una candela dal saldo di inizio a quello di fine. Verde se il
 *   mese chiude più alto di come è iniziato, rossa se più basso. I mesi previsti sono più chiari.
 *   Non ci sono «stoppini»: del passato si conoscono solo inizio e fine mese, e un massimo o un
 *   minimo inventato sarebbe un numero falso.
 * - Incassi e uscite della gestione per mese, con il flusso netto come linea.
 *
 * Stessi numeri della tabella sotto (RendicontoCassa), nessuna lettura in più.
 */
import { useId } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import type { RendicontoCassa } from "@/lib/controlloGestione/rendicontoCassa";
import { COLORI_GRAFICO, StatGrafico, TESTO_ASSE, defsGrafico, euroAsse, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const VERDE = "hsl(142 64% 40%)";
const ROSSO = "hsl(0 72% 51%)";
const eur = (cents: number | null | undefined) => (cents == null ? "—" : euroIntero(cents / 100));

interface Riga {
  mese: string;
  tipo: string;
  inizio: number | null;
  fine: number | null;
  corpo: [number, number] | null;
  sale: boolean;
  incassi: number;
  uscite: number;
  netto: number;
}

function Scheda({ titolo, children, className }: { titolo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border bg-card p-4 shadow-sm ${className ?? ""}`}>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{titolo}</h3>
      {children}
    </div>
  );
}

function TooltipMese({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Riga }> }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="min-w-[200px] rounded-xl border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 font-semibold">{r.mese} · {r.tipo}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Saldo a inizio mese</dt><dd className="text-right">{eur(r.inizio)}</dd>
        <dt className="text-muted-foreground">Incassi</dt><dd className="text-right text-emerald-600 dark:text-emerald-400">{eur(r.incassi)}</dd>
        <dt className="text-muted-foreground">Uscite</dt><dd className="text-right text-red-600 dark:text-red-400">{eur(-r.uscite)}</dd>
        <dt className="text-muted-foreground">Flusso netto</dt><dd className="text-right">{eur(r.netto)}</dd>
        <dt className="font-medium">Saldo a fine mese</dt><dd className="text-right font-semibold">{eur(r.fine)}</dd>
      </dl>
    </div>
  );
}

export function GraficiCassa({ r }: { r: RendicontoCassa }) {
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const etichettaTipo: Record<string, string> = { consuntivo: "consuntivo", "in-corso": "in corso", previsione: "previsione" };
  const righe: Riga[] = MESI.map((mese, i) => {
    const inizio = r.saldoInizio[i];
    const fine = r.saldoFine[i];
    const tipo = r.colonne[i]?.tipo ?? "consuntivo";
    return {
      mese,
      tipo: etichettaTipo[tipo] ?? tipo,
      inizio,
      fine,
      corpo: inizio == null || fine == null ? null : [Math.min(inizio, fine) / 100, Math.max(inizio, fine) / 100],
      sale: (fine ?? 0) >= (inizio ?? 0),
      incassi: (r.gruppi.incassi[i] ?? 0),
      uscite: -(r.gruppi.uscite[i] ?? 0),
      netto: r.flussoNetto[i] ?? 0,
    };
  });
  const previsto = (i: number) => r.colonne[i]?.tipo === "previsione";
  const conSaldo = righe.some((x) => x.corpo);
  const mesiSu = righe.filter((x) => x.corpo && x.sale && x.netto !== 0).length;
  const mesiGiu = righe.filter((x) => x.corpo && !x.sale).length;
  const totIncassi = righe.reduce((s, x) => s + x.incassi, 0);
  const totUscite = righe.reduce((s, x) => s + x.uscite, 0);
  const datiFlussi = righe.map((x) => ({ ...x, incassiE: x.incassi / 100, usciteE: -x.uscite / 100, nettoE: x.netto / 100 }));

  return (
    <div className="grid gap-3 max-sm:hidden xl:grid-cols-2">
      <Scheda titolo={`Saldo di cassa mese per mese · ${r.anno}`}>
        {conSaldo ? (
          <>
            <div className="mb-2 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
              <StatGrafico etichetta="Mesi in crescita" valore={String(mesiSu)} tono="buono" />
              <StatGrafico etichetta="Mesi in calo" valore={String(mesiGiu)} tono={mesiGiu > 0 ? "cattivo" : "neutro"} />
              <StatGrafico etichetta={`Saldo a fine ${r.anno}`} valore={eur(r.saldoFine[11])} />
            </div>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={righe} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
                  {defsGrafico(id, {})}
                  <CartesianGrid fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
                  <XAxis dataKey="mese" tickLine={false} axisLine={false} tick={TESTO_ASSE} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tick={TESTO_ASSE} width={64} tickFormatter={euroAsse} domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  <RechartsTooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<TooltipMese />} />
                  <Bar dataKey="corpo" radius={3} minPointSize={2} isAnimationActive={!fermo} animationDuration={700}>
                    {righe.map((x, i) => (
                      <Cell key={x.mese} fill={x.sale ? VERDE : ROSSO} fillOpacity={previsto(i) ? 0.45 : 0.9} stroke={x.sale ? VERDE : ROSSO} strokeOpacity={previsto(i) ? 0.9 : 0} strokeDasharray={previsto(i) ? "3 2" : undefined} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Ogni candela va dal saldo di inizio a quello di fine mese · tratteggiate le previste</p>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Manca il saldo dei conti: inseriscilo in Tesoreria per vedere le candele.</p>
        )}
      </Scheda>

      <Scheda titolo={`Incassi e uscite della gestione · ${r.anno}`}>
        <div className="mb-2 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <StatGrafico etichetta="Incassi" valore={eur(totIncassi)} tono="buono" />
          <StatGrafico etichetta="Uscite" valore={eur(-totUscite)} tono="cattivo" />
          <StatGrafico etichetta="Flusso operativo" valore={eur(r.kpi.flussoOperativoAnno)} tono={r.kpi.flussoOperativoAnno >= 0 ? "buono" : "cattivo"} />
        </div>
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datiFlussi} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
              {defsGrafico(`${id}f`, { verde: COLORI_GRAFICO.verde, rosso: COLORI_GRAFICO.rosso })}
              <CartesianGrid fill={`url(#${id}f-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
              <XAxis dataKey="mese" tickLine={false} axisLine={false} tick={TESTO_ASSE} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tick={TESTO_ASSE} width={64} tickFormatter={euroAsse} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
              <RechartsTooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<TooltipMese />} />
              <Bar dataKey="incassiE" name="Incassi" maxBarSize={16} radius={[4, 4, 0, 0]} isAnimationActive={!fermo}>
                {datiFlussi.map((x, i) => <Cell key={x.mese} fill={`url(#${id}f-barra-verde)`} fillOpacity={previsto(i) ? 0.45 : 1} />)}
              </Bar>
              <Bar dataKey="usciteE" name="Uscite" maxBarSize={16} radius={[0, 0, 4, 4]} isAnimationActive={!fermo}>
                {datiFlussi.map((x, i) => <Cell key={x.mese} fill={`url(#${id}f-barra-rosso)`} fillOpacity={previsto(i) ? 0.45 : 1} />)}
              </Bar>
              <Line type="monotone" dataKey="nettoE" name="Flusso netto" stroke={COLORI_GRAFICO.blu} strokeWidth={2.5} dot={{ r: 3, fill: COLORI_GRAFICO.blu, strokeWidth: 0 }} filter={`url(#${id}f-ombra)`} isAnimationActive={!fermo} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORI_GRAFICO.verde }} />Incassi</span>
          <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORI_GRAFICO.rosso }} />Uscite</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: COLORI_GRAFICO.blu }} />Flusso netto</span>
        </p>
      </Scheda>
    </div>
  );
}
