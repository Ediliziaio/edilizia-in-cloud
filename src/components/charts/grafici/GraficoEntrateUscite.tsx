/**
 * Entrate e uscite mese per mese (16/11/2026, Prima nota): barre sfumate verdi e rosse su
 * fondo a puntini, tooltip a scheda con il saldo del mese, e sopra la riga dei totali del
 * periodo (entrate, uscite, saldo). Stessa veste degli altri grafici di questa cartella.
 */
import { useId, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import {
  COLORI_GRAFICO, Comparsa, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg,
} from "./comune";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface MeseEntrateUscite {
  /** etichetta sull'asse («nov 26») */
  month: string;
  entrate: number;
  uscite: number;
}

export function GraficoEntrateUscite({
  dati, titolo = "Entrate e uscite, ultimi 6 mesi", altezza = 200,
  nomeEntrate = "Entrate", nomeUscite = "Uscite", notaPeriodo = "nei 6 mesi", onMese, meseScelto,
}: {
  dati: MeseEntrateUscite[];
  titolo?: string;
  altezza?: number;
  /** Nello Scadenzario: «Da incassare» / «Da pagare». */
  nomeEntrate?: string;
  nomeUscite?: string;
  notaPeriodo?: string;
  /** Clic su una colonna: l'indice del mese (per filtrare). */
  onMese?: (indice: number) => void;
  /** Indice del mese scelto: gli altri si attenuano. */
  meseScelto?: number | null;
}) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();

  const righe = useMemo(() => dati.map((d) => ({ mese: d.month, [nomeEntrate]: d.entrate, [nomeUscite]: d.uscite })), [dati, nomeEntrate, nomeUscite]);
  const tot = useMemo(() => {
    const entrate = dati.reduce((s, d) => s + d.entrate, 0);
    const uscite = dati.reduce((s, d) => s + d.uscite, 0);
    return { entrate, uscite, saldo: entrate - uscite };
  }, [dati]);

  return (
    <Comparsa className="rounded-2xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{t(titolo)}</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORI_GRAFICO.verde }} /> {t(nomeEntrate)}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORI_GRAFICO.rosso }} /> {t(nomeUscite)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
        <StatGrafico etichetta={t(nomeEntrate)} valore={formatEuroRiquadro(tot.entrate)} nota={t(notaPeriodo)} tono="buono" />
        <StatGrafico etichetta={t(nomeUscite)} valore={formatEuroRiquadro(tot.uscite)} nota={t(notaPeriodo)} />
        <StatGrafico
          etichetta={t("Saldo")}
          valore={`${tot.saldo > 0 ? "+" : ""}${formatEuroRiquadro(tot.saldo)}`}
          nota={t("entrate meno uscite")}
          tono={tot.saldo >= 0 ? "buono" : "cattivo"}
        />
      </div>

      <div className="mt-3" style={{ height: altezza }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={righe}
            barGap={3}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            className={onMese ? "cursor-pointer outline-none [&_*]:outline-none" : "outline-none [&_*]:outline-none"}
            onClick={(e) => {
              // recharts 3: l'etichetta della colonna, non più il payload.
              const stato = e as { activeLabel?: string | number | null } | null;
              const i = stato?.activeLabel != null ? righe.findIndex((r) => r.mese === String(stato.activeLabel)) : -1;
              if (i >= 0) onMese?.(i);
            }}
          >
            {defsGrafico(id, { verde: COLORI_GRAFICO.verde, rosso: COLORI_GRAFICO.rosso })}
            <rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-punti)`} />
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="mese" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
            <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} tickFormatter={euroAsse} width={56} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
              content={
                <TooltipScheda
                  extra={(r) => {
                    const saldo = Number(r[nomeEntrate] ?? 0) - Number(r[nomeUscite] ?? 0);
                    return (
                      <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                        {t("Saldo del mese")}{" "}
                        <span className={saldo >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-rose-600 dark:text-rose-400"}>
                          {saldo > 0 ? "+" : ""}{formatCurrency(saldo)}
                        </span>
                      </p>
                    );
                  }}
                />
              }
            />
            <Bar dataKey={nomeEntrate} fill={`url(#${id}-barra-verde)`} radius={[5, 5, 0, 0]} maxBarSize={26} isAnimationActive={!fermo}>
              {righe.map((r, i) => <Cell key={r.mese} fillOpacity={meseScelto != null && i !== meseScelto ? 0.3 : 1} />)}
            </Bar>
            <Bar dataKey={nomeUscite} fill={`url(#${id}-barra-rosso)`} radius={[5, 5, 0, 0]} maxBarSize={26} isAnimationActive={!fermo}>
              {righe.map((r, i) => <Cell key={r.mese} fillOpacity={meseScelto != null && i !== meseScelto ? 0.3 : 1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Comparsa>
  );
}

export default GraficoEntrateUscite;
