/**
 * Ricavi e costi mese per mese (cg_get_ce_mensile): barre sfumate per i
 * ricavi, linea con ombra per i costi, fondo a puntini. Sopra: mese migliore,
 * mesi in cui i costi hanno superato i ricavi, differenza dell'anno.
 */
import { useId, useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CEMensileRow } from "@/hooks/controlloGestione/useCEriclassificato";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { COLORI_GRAFICO, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg } from "./comune";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const MESI_BREVI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MESI_INTERI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Basta mese, ricavi e costi (variabili + fissi): lo usa anche la contabilità generale. */
type RigaMese = Pick<CEMensileRow, "mese" | "ricavi" | "costi_var" | "costi_fissi">;

export function GraficoRicaviCosti({ righe, altezza = 220 }: { righe: RigaMese[]; altezza?: number }) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();

  const dati = useMemo(
    () =>
      righe.map((r) => {
        const costi = (Number(r.costi_var) || 0) + (Number(r.costi_fissi) || 0);
        const ricavi = Number(r.ricavi) || 0;
        return { mese: r.mese, etichetta: MESI_BREVI[r.mese - 1] ? t(MESI_BREVI[r.mese - 1]) : String(r.mese), ricavi, costi, differenza: ricavi - costi };
      }),
    [righe, t],
  );

  const stat = useMemo(() => {
    const conMovimenti = dati.filter((d) => d.ricavi !== 0 || d.costi !== 0);
    if (conMovimenti.length === 0) return null;
    const migliore = conMovimenti.reduce((a, b) => (b.ricavi > a.ricavi ? b : a));
    const inRosso = conMovimenti.filter((d) => d.costi > d.ricavi).length;
    const differenza = conMovimenti.reduce((s, d) => s + d.differenza, 0);
    return { migliore, inRosso, mesi: conMovimenti.length, differenza };
  }, [dati]);

  if (!stat) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("Nessun ricavo o costo registrato mese per mese.")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
        <StatGrafico
          etichetta={t("Mese migliore")}
          valore={formatEuroRiquadro(stat.migliore.ricavi)}
          nota={t("ricavi di {valore}", { valore: t(MESI_INTERI[stat.migliore.mese - 1] ?? "") })}
        />
        <StatGrafico
          etichetta={t("Mesi in rosso")}
          valore={`${stat.inRosso} su ${stat.mesi}`}
          nota={t("costi sopra i ricavi")}
          tono={stat.inRosso > 0 ? "cattivo" : "buono"}
        />
        <StatGrafico
          etichetta={t("Ricavi − costi")}
          valore={`${stat.differenza > 0 ? "+" : ""}${formatEuroRiquadro(stat.differenza)}`}
          nota={t("somma dei mesi")}
          tono={stat.differenza >= 0 ? "buono" : "cattivo"}
        />
      </div>
      <div style={{ height: altezza }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dati} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
            {defsGrafico(id, { ricavi: COLORI_GRAFICO.blu, costi: COLORI_GRAFICO.arancio })}
            <CartesianGrid fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
            <XAxis dataKey="etichetta" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={64} tickFormatter={euroAsse} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={p.payload as never}
                  label={t(MESI_INTERI[((p.payload?.[0]?.payload as { mese?: number } | undefined)?.mese ?? 1) - 1] ?? "")}
                  extra={(riga) => {
                    const d = Number(riga.differenza) || 0;
                    return (
                      <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                        {t("Differenza:")}{" "}
                        <span className={d >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-rose-600 dark:text-rose-400"}>
                          {d > 0 ? "+" : ""}{formatCurrency(d)}
                        </span>
                      </p>
                    );
                  }}
                />
              )}
            />
            <Bar
              dataKey="ricavi"
              name="Ricavi"
              fill={`url(#${id}-barra-ricavi)`}
              radius={[6, 6, 2, 2]}
              maxBarSize={34}
              isAnimationActive={!fermo}
              animationDuration={800}
            />
            <Line
              dataKey="costi"
              name="Costi"
              type="monotone"
              stroke={COLORI_GRAFICO.arancio}
              strokeWidth={2.5}
              filter={`url(#${id}-ombra)`}
              dot={{ r: 2.5, fill: COLORI_GRAFICO.arancio, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))", fill: COLORI_GRAFICO.arancio }}
              isAnimationActive={!fermo}
              animationDuration={900}
              animationBegin={200}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-end gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.blu }} />{t("Ricavi")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: COLORI_GRAFICO.arancio }} />{t("Costi")}</span>
      </div>
    </div>
  );
}
