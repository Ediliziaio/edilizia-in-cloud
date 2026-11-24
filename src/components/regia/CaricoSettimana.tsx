/**
 * Il carico dei prossimi sette giorni nella Regia operativa: per ogni giorno
 * quanti lavori, consegne e appuntamenti (dall'agenda vera), in barre
 * impilate. Sopra: il giorno più pieno, il totale, i giorni liberi.
 */
import { useId, useMemo } from "react";
import { addDays, format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EventoAgenda, TipoEvento } from "@/lib/regia/agendaOperativa";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { COLORI_GRAFICO, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

const SERIE: Array<{ tipo: TipoEvento; nome: string; colore: string }> = [
  { tipo: "lavoro", nome: "Lavori", colore: COLORI_GRAFICO.blu },
  { tipo: "merce", nome: "Consegne", colore: COLORI_GRAFICO.arancio },
  { tipo: "appuntamento", nome: "Appuntamenti", colore: COLORI_GRAFICO.viola },
];

export interface GiornoCarico {
  giorno: string;
  etichetta: string;
  lungo: string;
  lavoro: number;
  merce: number;
  appuntamento: number;
  totale: number;
}

/** I sette giorni da oggi, ciascuno con i conteggi per tipo. */
export function caricoSettimana(eventi: EventoAgenda[], oggi = new Date()): GiornoCarico[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(oggi, i);
    const giorno = format(d, "yyyy-MM-dd");
    const delGiorno = eventi.filter((e) => e.giorno === giorno);
    const conta = (t: TipoEvento) => delGiorno.filter((e) => e.tipo === t).length;
    const riga = {
      giorno,
      etichetta: i === 0 ? "Oggi" : i === 1 ? "Domani" : format(d, "EEE d", { locale: dateFnsCampo() }).replace(/^./, (c) => c.toUpperCase()),
      lungo: format(d, "EEEE d MMMM", { locale: dateFnsCampo() }),
      lavoro: conta("lavoro"),
      merce: conta("merce"),
      appuntamento: conta("appuntamento"),
      totale: 0,
    };
    riga.totale = riga.lavoro + riga.merce + riga.appuntamento;
    return riga;
  });
}

export function CaricoSettimana({ giorni }: { giorni: GiornoCarico[] }) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const stat = useMemo(() => {
    const totale = giorni.reduce((s, g) => s + g.totale, 0);
    const pieno = giorni.reduce((a, b) => (b.totale > a.totale ? b : a), giorni[0]);
    const liberi = giorni.filter((g) => g.totale === 0).length;
    return { totale, pieno, liberi };
  }, [giorni]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
        <StatGrafico etichetta={t("In settimana")} valore={String(stat.totale)} nota={t("impegni in agenda")} />
        <StatGrafico
          etichetta={t("Giorno più pieno")}
          valore={stat.pieno && stat.pieno.totale > 0 ? String(stat.pieno.totale) : "—"}
          nota={stat.pieno && stat.pieno.totale > 0 ? stat.pieno.lungo : t("nessun impegno")}
        />
        <StatGrafico etichetta={t("Giorni liberi")} valore={t("{n} su 7", { n: stat.liberi })} nota={t("senza impegni")} tono={stat.liberi === 7 ? "neutro" : "buono"} />
      </div>
      <div className="h-[170px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={giorni} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="26%">
            {defsGrafico(id, Object.fromEntries(SERIE.map((s) => [s.tipo, s.colore])))}
            <CartesianGrid fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
            <XAxis dataKey="etichetta" tickFormatter={(v) => t(String(v))} tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={6} interval={0} />
            <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={(p.payload ?? []).map((x) => ({ ...x, color: SERIE.find((s) => s.tipo === x.dataKey)?.colore })) as never}
                  label={(p.payload?.[0]?.payload as GiornoCarico | undefined)?.lungo ?? p.label}
                  formato={(v) => String(v)}
                />
              )}
            />
            {SERIE.map((s, i) => (
              <Bar
                key={s.tipo}
                dataKey={s.tipo}
                name={t(s.nome)}
                stackId="carico"
                fill={`url(#${id}-barra-${s.tipo})`}
                radius={i === SERIE.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={34}
                isAnimationActive={!fermo}
                animationDuration={700}
                animationBegin={i * 120}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-muted-foreground">
        {SERIE.map((s) => (
          <span key={s.tipo} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colore }} />
            {t(s.nome)}
          </span>
        ))}
      </div>
    </div>
  );
}
