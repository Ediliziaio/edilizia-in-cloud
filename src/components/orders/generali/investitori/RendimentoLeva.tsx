// src/components/orders/generali/investitori/RendimentoLeva.tsx
// Il perché del modulo: quanto rende. Il rendimento dell'operazione (ROI e TIR del
// progetto, prima del debito) contro quello dei mezzi propri (ROE e TIR dopo interessi,
// spese e quote degli investitori): la differenza è l'effetto leva. Poi il costo del
// debito mese per mese, le fonti nel tempo contro il fabbisogno di cassa del piano, e uno
// scenario sul debito («tasso +1%», «mutuo più basso»).
import { useMemo, useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TONI, euro, nomeMese, percento } from "@/components/orders/generali/piano/formato";
import {
  calcolaInvestitori, scenarioDebitoNeutro,
  type ContiInvestitori, type Fonte, type Movimento, type NumeriOperazione, type ScenarioDebito,
} from "@/lib/orders/generali/investitoriConti";
import { cn } from "@/lib/utils";

const PUNTI = [-1, -0.5, 0, 0.5, 1, 2];
const DEBITO = [-50, -30, -20, -10, 0, 10, 20];
const COLORI = { propri: "#64748b", investitori: "#0284c7", debito: "#f59e0b", fabbisogno: "#0f172a" };

const punti = (n: number | null) =>
  n === null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : "−"}${(Math.abs(n) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`;
const migliaia = (v: unknown) => `${Math.round(Number(v) / 1000).toLocaleString("it-IT")}k`;

interface Props {
  conti: ContiInvestitori;
  fonti: Fonte[];
  movimenti: Movimento[];
  numeri: NumeriOperazione | null;
  oggi: string;
}

export function RendimentoLeva({ conti, fonti, movimenti, numeri, oggi }: Props) {
  const [scenario, setScenario] = useState<ScenarioDebito>({ tassoPunti: 0, debitoPct: 0 });
  const attivo = !scenarioDebitoNeutro(scenario);
  const conScenario = useMemo(
    () => (attivo ? calcolaInvestitori({ fonti, movimenti, numeri, oggi, scenario }) : null),
    [attivo, fonti, movimenti, numeri, oggi, scenario],
  );
  const haDebito = conti.costoDebito.interessi.stima > 0 || conti.costoDebito.spese.stima > 0 || fonti.some((f) => f.tipo === "banca" || f.tipo === "finanziamento" || f.tipo === "prestito");

  return (
    <div className="space-y-4">
      <section aria-label="Rendimento e leva" className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Rendimento e leva</h3>
            <p className="text-xs text-muted-foreground">L'operazione come se fosse tutta a capitale, contro quello che resta ai mezzi propri dopo debito e investitori.</p>
          </div>
          {haDebito && (
            <div className="flex flex-wrap gap-3" aria-label="Scenario sul debito">
              <Scelta id="scen-tasso" etichetta="Tasso" valore={scenario.tassoPunti} valori={PUNTI}
                testo={(v) => (v === 0 ? "com'è" : `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("it-IT")}%`)}
                onCambia={(v) => setScenario((s) => ({ ...s, tassoPunti: v }))} />
              <Scelta id="scen-debito" etichetta="Banca e finanziamenti" valore={scenario.debitoPct} valori={DEBITO}
                testo={(v) => (v === 0 ? "com'è" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`)}
                onCambia={(v) => setScenario((s) => ({ ...s, debitoPct: v }))} />
            </div>
          )}
        </div>

        {!numeri ? (
          <p className="mt-2 text-sm text-muted-foreground">Con il piano economico qui vedrai ROI e TIR dell'operazione e quanto rendono i mezzi propri.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Blocco titolo="L'operazione" nota={`margine prima del debito ${euro(conti.rendimenti.progetto.margine)} sul capitale massimo ${euro(conti.rendimenti.progetto.capitale)}`}>
                <Cifra etichetta="ROI" valore={percento(conti.rendimenti.progetto.roi)} />
                <Cifra etichetta="TIR del progetto" valore={percento(conti.rendimenti.progetto.tir)} />
              </Blocco>
              <Blocco
                titolo="I mezzi propri"
                nota={conti.rendimenti.mezziPropri
                  ? `utile ${euro(conti.rendimenti.mezziPropri.utile)} su ${euro(conti.rendimenti.mezziPropri.capitale)} messi`
                  : "Aggiungi i mezzi propri tra le fonti per vedere quanto rendono."}
              >
                <Cifra etichetta="ROE" valore={percento(conti.rendimenti.mezziPropri?.roe ?? null)} scenario={conScenario ? percento(conScenario.rendimenti.mezziPropri?.roe ?? null) : undefined} />
                <Cifra etichetta="TIR dei mezzi propri" valore={percento(conti.rendimenti.mezziPropri?.tir ?? null)} scenario={conScenario ? percento(conScenario.rendimenti.mezziPropri?.tir ?? null) : undefined} />
              </Blocco>
              <Blocco titolo="Effetto leva" nota="ROE meno ROI: positivo se il debito e gli investitori costano meno di quanto rende l'operazione.">
                <Cifra
                  etichetta="Leva"
                  valore={punti(conti.rendimenti.leva)}
                  tono={conti.rendimenti.leva === null ? undefined : conti.rendimenti.leva >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}
                  scenario={conScenario ? punti(conScenario.rendimenti.leva) : undefined}
                />
              </Blocco>
            </div>
            {conScenario && (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                Con lo scenario: costo del debito {euro(conScenario.costoDebito.totale)} (oggi {euro(conti.costoDebito.totale)}), utile da dividere {euro(conScenario.utile.stima)}
                {conScenario.scoperto >= 1 ? `, e alle fonti mancano ${euro(conScenario.scoperto)} per coprire il picco` : ""}.
              </p>
            )}
          </>
        )}
      </section>

      {haDebito && <CostoDebito conti={conti} numeri={numeri} />}
      {conti.composizione.length > 1 && <FontiNelTempo conti={conti} conPiano={!!numeri?.fabbisogno?.length} />}
    </div>
  );
}

function Scelta({ id, etichetta, valore, valori, testo, onCambia }: {
  id: string; etichetta: string; valore: number; valori: number[]; testo: (v: number) => string; onCambia: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{etichetta}</Label>
      <Select value={String(valore)} onValueChange={(v) => onCambia(Number(v))}>
        <SelectTrigger id={id} className="h-9 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          {valori.map((v) => <SelectItem key={v} value={String(v)}>{testo(v)}</SelectItem>)}
        </SelectContent>
      </Select>
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

function CostoDebito({ conti, numeri }: { conti: ContiInvestitori; numeri: NumeriOperazione | null }) {
  const c = conti.costoDebito;
  const dati = c.mensile.map((m) => ({ etichetta: nomeMese(m.mese), interessi: m.interessi, spese: m.spese, reale: m.reale }));
  const righe: [string, typeof c.interessi][] = [["Interessi", c.interessi], ["Spese", c.spese]];
  return (
    <section aria-label="Costo del debito" className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Costo del debito</h3>
        <p className="text-sm">
          Totale stimato <span className="font-medium tabular-nums">{euro(c.totale)}</span>
          {c.costoAnnuo !== null && <span className="text-xs text-muted-foreground"> · costo effettivo {percento(c.costoAnnuo)} l'anno</span>}
        </p>
      </div>
      <table className="mt-2 w-full max-w-xl text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-normal" />
            {(["previsto", "reale", "aFinire"] as const).map((t) => (
              <th key={t} className="py-1 text-right font-normal">
                <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", TONI[t].punto)} />{t === "previsto" ? "Previsto" : t === "reale" ? "Pagato" : "A finire"}</span>
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
        <div className="mt-3 h-40" aria-label="Interessi e spese mese per mese">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dati} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" width={48} tickFormatter={migliaia} />
              <RechartsTooltip formatter={(v, n) => [euro(Number(v)), n === "interessi" ? "Interessi" : "Spese"]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="interessi" stackId="c" fill="#f59e0b" />
              <Bar dataKey="spese" stackId="c" fill="#b45309" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {numeri?.interessiNelPiano
          ? `Il piano ha già una voce «Oneri finanziari» (${euro(numeri.oneriNelPiano?.stima ?? 0)} a finire): l'utile da dividere non li toglie una seconda volta. Se il costo qui è diverso, aggiorna quella voce del piano.`
          : "Il piano non ha una voce «Oneri finanziari»: questo costo si toglie dal margine del piano prima di dividere l'utile."}
      </p>
    </section>
  );
}

function FontiNelTempo({ conti, conPiano }: { conti: ContiInvestitori; conPiano: boolean }) {
  const dati = conti.composizione.map((m) => ({ ...m, etichetta: nomeMese(m.mese) }));
  const nomi: Record<string, string> = { propri: "Mezzi propri", investitori: "Investitori", debito: "Banca e finanziamenti", fabbisogno: "Fabbisogno del piano" };
  return (
    <section aria-label="Fonti nel tempo" className="rounded-lg border bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">Fonti nel tempo</h3>
      <p className="text-xs text-muted-foreground">
        Il capitale dentro a fine mese per fonte{conPiano ? ", contro il capitale che il piano chiede (la linea)" : ""}. Fino a oggi i movimenti veri, poi la proiezione: erogazioni quando servono, rimborsi secondo il loro piano.
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(["propri", "investitori", "debito"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLORI[k] }} />{nomi[k]}</li>
        ))}
        {conPiano && <li className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: COLORI.fabbisogno }} />{nomi.fabbisogno}</li>}
      </ul>
    </section>
  );
}
