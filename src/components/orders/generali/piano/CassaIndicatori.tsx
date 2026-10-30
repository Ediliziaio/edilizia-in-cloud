// src/components/orders/generali/piano/CassaIndicatori.tsx
// Flusso di cassa mese per mese, capitale impegnato e indicatori (margine, ROI, TIR, durata,
// valori al m²), affiancati: previsto · stima finale · scenario. Lo scenario è un «e se…»
// (prezzi più bassi, incassi in ritardo, costi più alti) e non cambia il piano.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro, nomeMese, percento } from "@/components/orders/generali/piano/formato";
import type { Indicatori, MeseCassa, PianoCalcolato, Scenario } from "@/lib/orders/generali/pianoConti";
import { cn } from "@/lib/utils";

const PARTITE_NOMI: Record<string, string> = { previsto: "previsto", reale: "reale", a_finire: "a finire", da_incassare: "da incassare" };

function CampoScenario({ id, etichetta, valore, onCambia, unita, max }: {
  id: string; etichetta: string; valore: number; onCambia: (v: number) => void; unita: string; max: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{etichetta}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={valore === 0 ? "" : String(valore)}
          placeholder="0"
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            onCambia(Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);
          }}
          className="h-9 w-20 text-right tabular-nums"
        />
        <span className="text-sm text-muted-foreground">{unita}</span>
      </div>
    </div>
  );
}

type Riga = { etichetta: string; valore: (i: Indicatori) => string; aiuto?: string; tono?: (i: Indicatori) => string | undefined };

const rosso = (n: number | null) => (n !== null && n < 0 ? "text-destructive" : undefined);

export function CassaIndicatori({ piano, scenario, onScenario, conUnita }: {
  piano: PianoCalcolato;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
  /** Il modulo Unità c'è: i m² mancanti sono un passo da fare, non un limite. */
  conUnita: boolean;
}) {
  const [tabella, setTabella] = useState(false);
  const [mese, setMese] = useState<MeseCassa | null>(null);
  const ind = piano.indicatori;
  const conScenario = ind.scenario !== null;
  const colonne: { nome: string; i: Indicatori }[] = [
    { nome: "Previsto", i: ind.previsto },
    { nome: "Stima finale", i: ind.stima },
    ...(ind.scenario ? [{ nome: "Scenario", i: ind.scenario }] : []),
  ];
  const conMq = ind.stima.mq !== null;

  const righe: Riga[] = [
    { etichetta: "Ricavi", valore: (i) => euro(i.ricavi) },
    { etichetta: "Costi", valore: (i) => euro(i.costi) },
    { etichetta: "Margine", valore: (i) => euro(i.margine), tono: (i) => rosso(i.margine) },
    { etichetta: "Margine sui ricavi", valore: (i) => percento(i.marginePct), tono: (i) => rosso(i.marginePct) },
    { etichetta: "ROI (margine sui costi)", valore: (i) => percento(i.roi), aiuto: "Quanto rende ogni euro speso.", tono: (i) => rosso(i.roi) },
    { etichetta: "Rendimento annuo (TIR)", valore: (i) => percento(i.tir), aiuto: "Il tasso annuo che rende i soldi messi pari a quelli che tornano, tenendo conto di quando.", tono: (i) => rosso(i.tir) },
    { etichetta: "Durata", valore: (i) => (i.durataMesi === null ? "—" : `${i.durataMesi} mesi · ${nomeMese(i.inizio)} → ${nomeMese(i.fine)}`) },
    { etichetta: "Capitale massimo impegnato", valore: (i) => (i.capitaleMassimo > 0 ? `${euro(i.capitaleMassimo)} · ${nomeMese(i.meseCapitaleMassimo)}` : euro(0)), aiuto: "Il punto più basso della cassa: quanto serve tra mezzi propri, soci, investitori e banca." },
    ...(conMq
      ? [
          { etichetta: "Costo di costruzione al m²", valore: (i: Indicatori) => euro(i.costoMq) },
          { etichetta: "Prezzo medio al m²", valore: (i: Indicatori) => euro(i.prezzoMq) },
          { etichetta: "Prezzo di pareggio al m²", valore: (i: Indicatori) => euro(i.pareggioMq), aiuto: "Il prezzo medio di vendita al m² sotto il quale l'operazione perde." },
        ]
      : []),
  ];

  const serie = (piano.cassa.scenario ?? piano.cassa.stima);
  const previsti = new Map(piano.cassa.previsto.map((m) => [m.mese, m.cumulato]));
  const datiGrafico = (() => {
    const mesi = [...new Set([...serie.map((m) => m.mese), ...piano.cassa.previsto.map((m) => m.mese)])].sort();
    const perMese = new Map(serie.map((m) => [m.mese, m]));
    // Il cumulato resta quello dell'ultimo mese noto: le due serie possono finire in mesi diversi.
    const punti: { mese: string; etichetta: string; entrate: number; uscite: number; cumulato: number; previsto: number | null }[] = [];
    for (const m of mesi) {
      const s = perMese.get(m);
      const prima = punti[punti.length - 1];
      punti.push({
        mese: m,
        etichetta: nomeMese(m),
        entrate: s?.entrate ?? 0,
        uscite: -(s?.uscite ?? 0),
        cumulato: s ? s.cumulato : prima?.cumulato ?? 0,
        previsto: previsti.has(m) ? previsti.get(m)! : prima?.previsto ?? null,
      });
    }
    return punti;
  })();

  return (
    <div className="space-y-4">
      <section aria-labelledby="scenari-titolo" className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="scenari-titolo" className="text-sm font-semibold">E se…</h3>
            <p className="text-xs text-muted-foreground">Uno scenario sulla stima: tocca solo quello che deve ancora succedere e non cambia il piano.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <CampoScenario id="sc-prezzo" etichetta="Prezzi più bassi del" unita="%" max={90} valore={scenario.prezzoPct} onCambia={(prezzoPct) => onScenario({ ...scenario, prezzoPct })} />
            <CampoScenario id="sc-ritardo" etichetta="Incassi in ritardo di" unita="mesi" max={60} valore={scenario.ritardoMesi} onCambia={(ritardoMesi) => onScenario({ ...scenario, ritardoMesi: Math.round(ritardoMesi) })} />
            <CampoScenario id="sc-costi" etichetta="Costi più alti del" unita="%" max={200} valore={scenario.costiPct} onCambia={(costiPct) => onScenario({ ...scenario, costiPct })} />
            {conScenario && (
              <Button variant="ghost" size="sm" onClick={() => onScenario({ prezzoPct: 0, ritardoMesi: 0, costiPct: 0 })}>Azzera</Button>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="indicatori-titolo" className="overflow-x-auto rounded-lg border bg-card">
        <h3 id="indicatori-titolo" className="sr-only">Indicatori</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Indicatore</th>
              {colonne.map((c) => <th key={c.nome} className="px-3 py-2 text-right font-medium">{c.nome}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {righe.map((r) => (
              <tr key={r.etichetta}>
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  {r.etichetta}
                  {r.aiuto && <span className="block text-[11px] text-muted-foreground">{r.aiuto}</span>}
                </th>
                {colonne.map((c) => (
                  <td key={c.nome} className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", c.nome === "Stima finale" && "font-medium", r.tono?.(c.i))}>
                    {r.valore(c.i)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-4 py-1.5 text-left font-normal">
                Capitale investito a oggi
                <span className="block text-[11px] text-muted-foreground">Costi registrati meno incassi.</span>
              </th>
              <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{euro(piano.capitale.investitoOggi)}</td>
              {conScenario && <td className="px-3 py-1.5 text-right tabular-nums">{euro(piano.capitale.investitoOggi)}</td>}
            </tr>
          </tbody>
        </table>
        {!conMq && (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {conUnita
              ? "Scrivi i m² commerciali delle unità per vedere costo al m² e prezzo di pareggio al m²."
              : "Costo al m² e prezzo di pareggio al m² compaiono quando le unità hanno i m² commerciali (modulo Unità e vendite)."}
          </p>
        )}
      </section>

      <section aria-labelledby="cassa-titolo" className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="cassa-titolo" className="text-sm font-semibold">Flusso di cassa {conScenario ? "(scenario)" : "(stima)"}</h3>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-600" /> Entrate</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" /> Uscite</span>
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-sky-700" /> Cassa cumulata</span>
            <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t-2 border-dashed border-slate-400" /> Cumulata prevista</span>
          </div>
        </div>
        {datiGrafico.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Dai un mese alle voci per vedere il flusso di cassa.</p>
        ) : (
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datiGrafico} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" width={56} tickFormatter={(v) => `${Math.round(Number(v) / 1000).toLocaleString("it-IT")}k`} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <RechartsTooltip
                  formatter={(value, name) => [euro(Number(value)), { entrate: "Entrate", uscite: "Uscite", cumulato: "Cassa cumulata", previsto: "Cumulata prevista" }[String(name)] ?? String(name)]}
                  contentStyle={{ borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="entrate" stackId="m" fill="#059669" maxBarSize={18} radius={[3, 3, 0, 0]} />
                <Bar dataKey="uscite" stackId="m" fill="#f43f5e" maxBarSize={18} radius={[0, 0, 3, 3]} />
                <Line dataKey="cumulato" type="stepAfter" stroke="#0369a1" strokeWidth={2} dot={false} />
                <Line dataKey="previsto" type="stepAfter" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTabella((t) => !t)} aria-expanded={tabella}>
            {tabella ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Mese per mese
          </Button>
          {tabella && (
            <div className="mt-2 max-h-[50vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Mese</th>
                    <th className="px-2 py-2 text-right font-medium">Entrate</th>
                    <th className="px-2 py-2 text-right font-medium">Uscite</th>
                    <th className="px-2 py-2 text-right font-medium">Netto</th>
                    <th className="px-3 py-2 text-right font-medium">Cassa cumulata</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {serie.map((m) => (
                    <tr key={m.mese} className={cn("cursor-pointer hover:bg-muted/40", m.mese === piano.oggi && "bg-sky-50/60 dark:bg-sky-500/10")} onClick={() => setMese(m)}>
                      <td className="px-3 py-1.5">
                        {nomeMese(m.mese)}
                        {m.passato && <span className="ml-1.5 text-[11px] text-muted-foreground">reale</span>}
                        {m.mese === piano.oggi && <span className="ml-1.5 text-[11px] text-sky-700 dark:text-sky-300">questo mese</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m.entrate ? euro(m.entrate) : ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m.uscite ? euro(m.uscite) : ""}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums", m.netto < 0 && "text-destructive")}>{euro(m.netto)}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums font-medium", m.cumulato < 0 && "text-destructive")}>{euro(m.cumulato)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mese && (
            <div className="mt-2 rounded-md border bg-muted/20 p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{nomeMese(mese.mese)}: da dove vengono i numeri</p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMese(null)}>Chiudi</Button>
              </div>
              <ul className="mt-1 max-h-60 divide-y overflow-auto">
                {mese.partite.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1">
                    <span className="min-w-0 truncate">
                      {p.etichetta} <span className="text-xs text-muted-foreground">· {PARTITE_NOMI[p.origine]}</span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", p.tipo === "ricavo" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                      {p.tipo === "ricavo" ? "+" : "−"}{euro(p.importo)}
                    </span>
                  </li>
                ))}
                {mese.partite.length === 0 && <li className="py-1 text-muted-foreground">Nessun movimento.</li>}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
