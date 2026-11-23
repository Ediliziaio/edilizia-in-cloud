// src/components/orders/generali/investitori/RendimentoLeva.tsx
// Il perché del modulo: quanto rende. Il rendimento dell'operazione (ROI e TIR del
// progetto, prima del debito) contro quello dei mezzi propri (ROE e TIR dopo interessi,
// spese e quote degli investitori): la differenza è l'effetto leva. Poi il costo del
// debito mese per mese, le fonti nel tempo contro il fabbisogno di cassa del piano, e uno
// scenario sul debito («tasso +1%», «mutuo più basso»).
import type { ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { TONI, euro, nomeMese, percento } from "@/components/orders/generali/piano/formato";
import {
  aPrestito, type ContiInvestitori, type NumeriOperazione,
} from "@/lib/orders/generali/investitoriConti";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const COLORI = { propri: "#64748b", investitori: "#0284c7", debito: "rgb(var(--brand-accent, 249 115 22))", fabbisogno: "hsl(var(--foreground))", ipotesi: "#2563eb" };

const punti = (n: number | null) =>
  n === null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toLocaleString(intlCampo(), { maximumFractionDigits: 1 })} punti`;
const migliaia = (v: unknown) => `${Math.round(Number(v) / 1000).toLocaleString(intlCampo())}k`;

interface Props {
  conti: ContiInvestitori;
  numeri: NumeriOperazione | null;
  conScenario: ContiInvestitori | null;
}

export function RendimentoLeva({ conti, numeri, conScenario }: Props) {
  const t = useT();
  const haDebito = conti.fonti.some(c => aPrestito(c.fonte.tipo));

  return (
    <div className="space-y-4">
      <section aria-label={t("Rendimento e leva")} className="rounded-lg border bg-card px-4 py-3">
        <h3 className="text-sm font-semibold">{t("Rendimento e leva")}</h3>
        <p className="text-xs text-muted-foreground">{t("Rendimento dell’operazione e dei mezzi propri dopo debito e investitori.")}</p>

        {!numeri ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Con il piano economico qui vedrai ROI e TIR dell'operazione e quanto rendono i mezzi propri.")}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Blocco titolo={t("L'operazione")} nota={t("margine prima del debito {margine} sul capitale massimo {capitale}", { margine: euro(conti.rendimenti.progetto.margine), capitale: euro(conti.rendimenti.progetto.capitale) })}>
                <Cifra etichetta="ROI" valore={percento(conti.rendimenti.progetto.roi)} />
                <Cifra etichetta={t("TIR del progetto")} valore={percento(conti.rendimenti.progetto.tir)} />
              </Blocco>
              <Blocco
                titolo={t("I mezzi propri")}
                nota={conti.rendimenti.mezziPropri
                  ? t("utile {utile} su {capitale} messi", { utile: euro(conti.rendimenti.mezziPropri.utile), capitale: euro(conti.rendimenti.mezziPropri.capitale) })
                  : t("Aggiungi i mezzi propri tra le fonti per vedere quanto rendono.")}
              >
                <Cifra etichetta="ROE" valore={percento(conti.rendimenti.mezziPropri?.roe ?? null)} scenario={conScenario ? percento(conScenario.rendimenti.mezziPropri?.roe ?? null) : undefined} />
                <Cifra etichetta={t("TIR dei mezzi propri")} valore={percento(conti.rendimenti.mezziPropri?.tir ?? null)} scenario={conScenario ? percento(conScenario.rendimenti.mezziPropri?.tir ?? null) : undefined} />
              </Blocco>
              <Blocco titolo={t("Effetto leva")} nota={t("ROE meno ROI: positivo se il debito e gli investitori costano meno di quanto rende l'operazione.")}>
                <Cifra
                  etichetta={t("Leva")}
                  valore={punti(conti.rendimenti.leva)}
                  tono={conti.rendimenti.leva === null ? undefined : conti.rendimenti.leva >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}
                  scenario={conScenario ? punti(conScenario.rendimenti.leva) : undefined}
                />
              </Blocco>
            </div>
          </>
        )}
      </section>

      {haDebito && <CostoDebito conti={conti} numeri={numeri} mostraCasoBase={!!conScenario} />}
      {conti.composizione.length > 1 && <FontiNelTempo conti={conti} conPiano={!!numeri?.fabbisogno?.length} conScenario={conScenario} />}
    </div>
  );
}

function Blocco({ titolo, nota, children }: { titolo: string; nota: string; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{titolo}</p>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">{children}</div>
      <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p>
    </div>
  );
}

function Cifra({ etichetta, valore, tono, scenario }: { etichetta: string; valore: string; tono?: string; scenario?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{etichetta}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tono)}>
        {valore}
        {scenario !== undefined && scenario !== valore && <span className="ml-1.5 text-sm font-normal text-amber-700 dark:text-amber-400">→ {scenario}</span>}
      </p>
    </div>
  );
}

function CostoDebito({ conti, numeri, mostraCasoBase }: { conti: ContiInvestitori; numeri: NumeriOperazione | null; mostraCasoBase: boolean }) {
  const tr = useT();
  const c = conti.costoDebito;
  const dati = c.mensile.map((m) => ({ etichetta: nomeMese(m.mese), interessi: m.interessi, spese: m.spese, reale: m.reale }));
  const righe: [string, typeof c.interessi][] = [[tr("Interessi"), c.interessi], [tr("Spese"), c.spese]];
  return (
    <section aria-label={tr("Costo del debito")} className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{tr("Costo del debito")} {mostraCasoBase && <span className="text-xs font-normal text-muted-foreground">· {tr("Base")}</span>}</h3>
        <p className="text-sm">
          {tr("Totale stimato")} <span className="font-medium tabular-nums">{euro(c.totale)}</span>
          {c.costoAnnuo !== null && <span className="text-xs text-muted-foreground"> {tr("· costo effettivo {perc} l'anno", { perc: percento(c.costoAnnuo) })}</span>}
        </p>
      </div>
      <table className="mt-2 w-full max-w-xl text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-normal" />
            {(["previsto", "reale", "aFinire"] as const).map((t) => (
              <th key={t} className="py-1 text-right font-normal">
                <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", TONI[t].punto)} />{t === "previsto" ? tr("Previsto") : t === "reale" ? tr("Pagato") : tr("A finire")}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {righe.map(([nome, col]) => (
            <tr key={nome} className="border-t">
              <td className="py-1.5">{nome}</td>
              <td className="py-1.5 text-right tabular-nums">{euro(col.previsto)}</td>
              <td className={cn("py-1.5 text-right tabular-nums", TONI.reale.testo)}>{euro(col.adOggi)}</td>
              <td className={cn("py-1.5 text-right tabular-nums", TONI.aFinire.testo)}>{euro(col.aFinire)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dati.length > 1 && (
        <div className="mt-3 h-40" aria-label={tr("Interessi e spese mese per mese")}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dati} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" width={48} tickFormatter={migliaia} />
              <RechartsTooltip formatter={(v, n) => [euro(Number(v)), n === "interessi" ? tr("Interessi") : tr("Spese")]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="interessi" stackId="c" fill="#f59e0b" />
              <Bar dataKey="spese" stackId="c" fill="#b45309" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {numeri?.interessiNelPiano
          ? tr("Il piano ha già una voce «Oneri finanziari» ({importo} a finire): l'utile da dividere non li toglie una seconda volta. Se il costo qui è diverso, aggiorna quella voce del piano.", { importo: euro(numeri.oneriNelPiano?.stima ?? 0) })
          : (numeri?.oneriRealiNelPiano ?? 0) > 0
            ? tr("Il piano non ha una voce «Oneri finanziari», ma conta già {importo} di interessi e spese pagati: dal margine si toglie solo il resto, prima di dividere l'utile.", { importo: euro(numeri!.oneriRealiNelPiano!) })
            : tr("Il piano non ha una voce «Oneri finanziari»: questo costo si toglie dal margine del piano prima di dividere l'utile.")}
      </p>
    </section>
  );
}

function FontiNelTempo({ conti, conPiano, conScenario }: { conti: ContiInvestitori; conPiano: boolean; conScenario: ContiInvestitori | null }) {
  const t = useT();
  const coperturaSimulata = new Map(conScenario?.composizione.filter(m => !m.reale).map(m => [m.mese, m.capitaleDalleFonti]));
  const dati = conti.composizione.map((m) => ({ ...m, etichetta: nomeMese(m.mese), ipotesi: coperturaSimulata.get(m.mese) ?? null }));
  const nomi: Record<string, string> = { propri: t("Mezzi propri"), investitori: t("Investitori"), debito: t("Banca e finanziamenti"), fabbisogno: t("Fabbisogno del piano"), ipotesi: t("Capitale con ipotesi") };
  return (
    <section aria-label={t("Fonti nel tempo")} className="rounded-lg border bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">{t("Fonti nel tempo")}</h3>
      <p className="text-xs text-muted-foreground">
        {conPiano ? t("Il capitale dentro a fine mese per fonte, contro il capitale che il piano chiede (la linea).") : t("Il capitale dentro a fine mese per fonte.")} {t("Fino a oggi i movimenti veri, poi la proiezione: erogazioni quando servono, rimborsi secondo il loro piano.")}
      </p>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dati} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" width={56} tickFormatter={migliaia} />
            <RechartsTooltip formatter={(v, n) => [euro(Number(v)), nomi[String(n)] ?? String(n)]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
            <Bar dataKey="propri" stackId="f" fill={COLORI.propri} />
            <Bar dataKey="investitori" stackId="f" fill={COLORI.investitori} />
            <Bar dataKey="debito" stackId="f" fill={COLORI.debito} />
            {conPiano && <Line dataKey="fabbisogno" type="stepAfter" stroke={COLORI.fabbisogno} strokeWidth={2} dot={false} />}
            {conScenario && <Line dataKey="ipotesi" type="stepAfter" stroke={COLORI.ipotesi} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(["propri", "investitori", "debito"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLORI[k] }} />{nomi[k]}</li>
        ))}
        {conPiano && <li className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: COLORI.fabbisogno }} />{nomi.fabbisogno}</li>}
        {conScenario && <li className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: COLORI.ipotesi }} />{nomi.ipotesi}</li>}
      </ul>
    </section>
  );
}
