// src/components/orders/generali/simulatore/Risultati.tsx
// I risultati dell'ipotesi, aggiornati mentre si scrive: conviene? Margine, capitale,
// rendimenti, pareggio, durata, gli avvisi e la sensibilità sulle quattro leve.
import { useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { euro, euroSegno, nomeMese, percento } from "@/components/orders/generali/piano/formato";
import { punti } from "@/components/orders/generali/simulatore/formato";
import { sensibilita, type Ipotesi, type RisultatoIpotesi } from "@/lib/orders/generali/simulatore";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const migliaia = (v: unknown) => `${Math.round(Number(v) / 1000).toLocaleString(intlCampo())}k`;
const tono = (n: number | null) => (n === null ? "" : n < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400");

function Numero({ titolo, valore, sotto, className, title }: { titolo: string; valore: ReactNode; sotto?: ReactNode; className?: string; title?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2" title={title}>
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className={cn("text-lg font-semibold tabular-nums", className)}>{valore}</p>
      {sotto && <p className="text-xs text-muted-foreground">{sotto}</p>}
    </div>
  );
}

export function Risultati({ risultato: r }: { risultato: RisultatoIpotesi }) {
  const t = useT();
  const n = r.numeri;
  const serie = r.piano.cassa.previsto.map((m) => ({ mese: nomeMese(m.mese), cumulato: m.cumulato }));
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero titolo={t("Ricavi")} valore={euro(n.ricavi)} sotto={n.prezzoMq !== null ? t("{importo}/m² medi", { importo: euro(n.prezzoMq) }) : undefined} />
        <Numero titolo={t("Costi")} valore={euro(n.costi)} sotto={n.costoMq !== null ? t("cantiere {importo}/m²", { importo: euro(n.costoMq) }) : undefined} />
        <Numero titolo={t("Margine prima degli interessi")} valore={euro(n.margine)} className={tono(n.margine)} sotto={t("{percentuale} dei ricavi", { percentuale: percento(n.marginePct) })} />
        <Numero titolo={t("Utile dopo gli interessi")} valore={euro(n.utileNetto)} className={tono(n.utileNetto)}
          sotto={t("interessi e spese {importo} · {percentuale}", { importo: euro(n.oneriFinanziari), percentuale: percento(n.utileNettoPct) })} />
        <Numero titolo={t("Capitale massimo impegnato")} valore={euro(n.capitaleMassimo)} sotto={n.meseCapitaleMassimo ? t("a {mese}", { mese: nomeMese(n.meseCapitaleMassimo) }) : t("nessun fabbisogno")} />
        <Numero titolo={t("ROI · TIR del progetto")} valore={`${percento(n.roi)} · ${percento(n.tirProgetto)}`} sotto={t("margine sui costi · rendimento annuo")} />
        <Numero titolo={t("ROE · TIR dei mezzi propri")} valore={`${percento(n.roe)} · ${percento(n.tirPropri)}`} className={tono(n.roe)}
          sotto={t("leva {punti}", { punti: punti(n.leva) })} title={t("La leva è il ROE meno il rendimento del progetto sul capitale massimo.")} />
        <Numero titolo={t("Prezzo di pareggio")} valore={n.pareggioMq !== null ? `${euro(n.pareggioMq)}/m²` : "—"}
          sotto={n.durataMesi !== null ? t("interessi compresi · durata {n} mesi", { n: n.durataMesi }) : t("interessi compresi")} />
      </div>

      {r.avvisi.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          {r.avvisi.map((a) => (
            <li key={a} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{a}</li>
          ))}
        </ul>
      )}

      {serie.length > 1 && (
        <section aria-label={t("Cassa cumulata")} className="rounded-lg border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("Cassa cumulata dell'operazione, prima delle fonti: il punto più basso è il capitale che serve.")}</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mese" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={migliaia} tick={{ fontSize: 11 }} width={48} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <RechartsTooltip formatter={(v) => euro(Number(v))} />
                <Area type="monotone" dataKey="cumulato" name={t("Cumulato")} stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

export function Sensibilita({ ipotesi, risultato }: { ipotesi: Ipotesi; risultato: RisultatoIpotesi }) {
  const t = useT();
  const righe = useMemo(() => sensibilita(ipotesi, risultato.numeri), [ipotesi, risultato]);
  const base = risultato.numeri;
  return (
    <section aria-label={t("Sensibilità")} className="rounded-lg border bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">{t("E se va diversamente?")}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{t("Ogni riga cambia una cosa sola rispetto all'ipotesi com'è.")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-normal">{t("Caso")}</th>
              <th className="px-3 font-normal text-right">{t("Utile dopo gli interessi")}</th>
              <th className="px-3 font-normal text-right">{t("Differenza")}</th>
              <th className="px-3 font-normal text-right">ROE</th>
              <th className="px-3 font-normal text-right">{t("TIR progetto")}</th>
              <th className="pl-3 font-normal text-right">{t("Capitale massimo")}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b">
              <td className="py-1.5 pr-3 font-medium">{t("Com'è")}</td>
              <td className={cn("px-3 text-right", tono(base.utileNetto))}>{euro(base.utileNetto)}</td>
              <td className="px-3 text-right text-muted-foreground">—</td>
              <td className="px-3 text-right">{percento(base.roe)}</td>
              <td className="px-3 text-right">{percento(base.tirProgetto)}</td>
              <td className="pl-3 text-right">{euro(base.capitaleMassimo)}</td>
            </tr>
            {righe.map((r) => (
              <tr key={r.caso.chiave} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{t(r.caso.nome)}</td>
                <td className={cn("px-3 text-right", tono(r.numeri.utileNetto))}>{euro(r.numeri.utileNetto)}</td>
                <td className={cn("px-3 text-right", tono(Math.abs(r.differenzaUtile) < 0.5 ? null : r.differenzaUtile))}>{euroSegno(r.differenzaUtile)}</td>
                <td className="px-3 text-right">{percento(r.numeri.roe)}</td>
                <td className="px-3 text-right">{percento(r.numeri.tirProgetto)}</td>
                <td className="pl-3 text-right">{euro(r.numeri.capitaleMassimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
