import { type ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
/**
 * EsposizioneCommessa — "Chi finanzia il cantiere": la cassa CONSUNTIVA della
 * commessa nel tempo (la card "Cassa della commessa" resta la previsione).
 *
 * Entrate = rate incassate (lorde), uscite = costi pagati (lordi): il saldo
 * dice chi sta anticipando i soldi — se è sotto zero, il cantiere lo stai
 * finanziando tu. Il grafico è il family chart mensile (entrate smeraldo,
 * uscite rosso, linea = saldo cumulato); il picco di esposizione è calcolato
 * a fine giornata nell'hook, non sui mesi: senza orari non si inventa un picco infragiornaliero.
 *
 * Con l'avanzamento fasi disponibile aggiunge il confronto del manuale:
 * % eseguita vs % incassata → "lavoro fatto non ancora incassato".
 * Sparisce da sola (null) finché non c'è nessun movimento: sulle commesse
 * appena aperte parla la previsione, non il consuntivo.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { Banknote, CalendarClock, ChevronDown, ChevronRight, HandCoins, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { useEsposizioneCommessa, type RataEsposizione } from "@/hooks/useEsposizioneCommessa";
import type { VoceCassa } from "@/lib/orders/cashExposureTimeline";
import type { VarianteDatata } from "@/lib/commissions";
import { cassaLiberaCommessa } from "@/lib/orders/cassaLibera";
import { useCostoPrevistoCommessa } from "@/hooks/useCostoPrevistoCommessa";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** Da dove arriva ogni movimento: la chiave la mette il calcolo, la frase sta qui. */
const VOCE_CASSA: Record<VoceCassa, string> = {
  rata: "Rata incassata",
  incasso: "Incasso registrato",
  costo: "Fattura fornitore",
  manodopera: "Manodopera interna",
  ditta: "Ditta esterna",
  provvigione: "Provvigione",
};

/** "al 50%" ma "all'80%" / "all'8%" / "all'11%". */
const alPct = (n: number, t: (testo: string, valori?: Readonly<Record<string, string | number>>) => string) => {
  const r = Math.round(n);
  const apostrofo = r === 8 || r === 11 || (r >= 80 && r <= 89);
  return apostrofo ? t("all'{n}%", { n: r }) : t("al {n}%", { n: r });
};

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

/**
 * CassaVerdettoBand — la fascia navy in testa alla commessa: il verdetto di
 * cassa a colpo d'occhio, nello stesso linguaggio delle testate di Costi e
 * Finanza. Tre numeri, tutti cliccabili: Chi finanzia (→ card esposizione),
 * Incassato e Da incassare con la prossima rata (→ piano rate). Niente
 * margine qui: quello resta al Conto economico qui sotto — la fascia parla
 * solo di soldi veri, entrati e usciti.
 */
export function CassaVerdettoBand({
  orderId,
  totalAmount,
  vatRate,
  financingCost,
  financingCostMode,
  installments,
  collectedGross,
  cashTotalGross,
  canViewCosts,
  onVaiPagamenti,
  onVaiEsposizione,
}: {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  financingCost: number;
  financingCostMode?: ModalitaCostoFinanziaria | null;
  installments: RataEsposizione[];
  /** Incassato lordo del piano rate (stesso numero del Riepilogo). */
  collectedGross: number;
  cashTotalGross: number;
  /** Senza costi niente "Chi finanzia": restano incassato e da incassare. */
  canViewCosts: boolean;
  onVaiPagamenti: () => void;
  onVaiEsposizione: () => void;
}) {
  const t = useT();
  const { esposizione } = useEsposizioneCommessa({
    orderId,
    totalAmount,
    vatRate,
    financingCost,
  financingCostMode,
    installments,
    enabled: canViewCosts,
  });

  const daIncassare = Math.max(0, cashTotalGross - collectedGross);
  const incassataPct = cashTotalGross > 0 ? Math.round(Math.min(100, (collectedGross / cashTotalGross) * 100)) : 0;

  // Prossima rata non pagata (per data attesa): il "quando" del da incassare.
  const prossimaRata = useMemo(() => {
    const unpaid = installments.filter((i) => !i.is_paid && (Number(i.amount) || 0) > 0 && i.type !== "financing");
    if (unpaid.length === 0) return null;
    const next = [...unpaid].sort((a, b) => (a.expected_date ?? "9999").localeCompare(b.expected_date ?? "9999"))[0];
    if (!next?.expected_date) return null;
    return { date: next.expected_date, scaduta: next.expected_date < new Date().toISOString().slice(0, 10) };
  }, [installments]);

  const saldo = esposizione.saldoOggi;
  const clienteFinanzia = saldo >= 0;

  // Commessa senza importi (totale 0): "0% su 0 €" non dice niente — meglio niente.
  if (cashTotalGross <= 0 && !esposizione.hasMovimenti) return null;

  return (
    <div className="rounded-2xl bg-eic-navy-deep p-3 sm:p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-100">
        {t("La cassa di questa commessa")}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {canViewCosts && (
          <div className="col-span-2 sm:col-span-1">
            <NavyStatCard
              label={t("Chi finanzia il cantiere")}
              value={
                esposizione.hasMovimenti
                  ? `${clienteFinanzia ? "+" : "−"}${formatCurrencyCompact(Math.abs(saldo))}`
                  : "—"
              }
              sub={
                esposizione.hasMovimenti
                  ? clienteFinanzia
                    ? t("il cliente: incassato più che pagato")
                    : t("tu: pagato più che incassato")
                  : t("nessun movimento ancora")
              }
              icon={HandCoins}
              tone={esposizione.hasMovimenti && !clienteFinanzia ? "text-red-300" : "text-emerald-300"}
              onClick={onVaiEsposizione}
            />
          </div>
        )}
        <NavyStatCard
          label={t("Incassato")}
          value={formatCurrencyCompact(collectedGross)}
          sub={t("{percentuale}% su {totale}", { percentuale: incassataPct, totale: formatCurrencyCompact(cashTotalGross) })}
          icon={Banknote}
          tone="text-blue-100"
          onClick={onVaiPagamenti}
        />
        <NavyStatCard
          label={t("Da incassare")}
          value={formatCurrencyCompact(daIncassare)}
          sub={
            daIncassare <= 0
              ? t("tutto incassato")
              : prossimaRata
                ? prossimaRata.scaduta ? t("rata scaduta il {data}", { data: fmtData(prossimaRata.date) }) : t("prossima rata il {data}", { data: fmtData(prossimaRata.date) })
                : t("nessuna scadenza fissata")
          }
          icon={CalendarClock}
          tone={prossimaRata?.scaduta && daIncassare > 0 ? "text-orange-300" : "text-blue-100"}
          onClick={onVaiPagamenti}
        />
      </div>
    </div>
  );
}

export function EsposizioneCommessa({
  orderId,
  totalAmount,
  vatRate,
  financingCost,
  financingCostMode,
  installments,
  varianti,
  cashTotalGross,
  avanzamentoPct,
  anchorId,
  scenarioMateriali,
}: {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  financingCost: number;
  financingCostMode?: ModalitaCostoFinanziaria | null;
  installments: RataEsposizione[];
  /** Varianti approvate con la data (vedi useEsposizioneCommessa). */
  varianti?: ReadonlyArray<VarianteDatata>;
  /** Target incassi lordo (totale ivato − finanziaria): stesso "su X" del piano rate. */
  cashTotalGross: number;
  /** Media % delle fasi lavorazione; null se la commessa non ha fasi. */
  avanzamentoPct: number | null;
  /** id DOM per lo scroll dalla fascia verdetto (solo sul mount desktop:
   *  mobile e desktop sono entrambi nel DOM, un id doppio punterebbe al nodo nascosto). */
  anchorId?: string;
  /** Lo scenario «e se pago i materiali prima di incassare?»: sta qui dentro,
   *  chiuso, perché è un'ipotesi sugli stessi soldi di cui parla questa card.
   *  Era un secondo riquadro subito sotto, con un suo picco e un suo verdetto:
   *  due storie di cassa una sotto l'altra, e nessuna delle due si fidava. */
  scenarioMateriali?: ReactNode;
}) {
  const t = useT();
  const { esposizione, isLoading, isError, recorded } = useEsposizioneCommessa({
    orderId,
    totalAmount,
    vatRate,
    financingCost,
  financingCostMode,
    installments,
    varianti,
  });

  // Il costo previsto serve a dire quanto manca ancora da spendere: resta una
  // stima dichiarata, mai sottratta dalla cassa (lorda contro senza IVA).
  const previsto = useCostoPrevistoCommessa(orderId, true);
  const [meseAperto, setMeseAperto] = useState<string | null>(null);
  const incassataPct = cashTotalGross > 0 ? Math.min(100, (esposizione.incassato / cashTotalGross) * 100) : 0;
  const maturatoNonIncassato = useMemo(() => {
    if (avanzamentoPct == null || avanzamentoPct <= 0 || cashTotalGross <= 0) return 0;
    return Math.max(0, Math.round(((avanzamentoPct / 100) * cashTotalGross - esposizione.incassato) * 100) / 100);
  }, [avanzamentoPct, cashTotalGross, esposizione.incassato]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (isError) return <p role="alert" className="rounded-xl border p-4 text-sm text-amber-700">{t("Non riesco a leggere i movimenti di cassa della commessa.")}</p>;
  if (!esposizione.hasMovimenti) return null;

  const { incassato, uscite, saldoOggi, picco, daPagare, serieMensile } = esposizione;
  const clienteFinanzia = saldoOggi >= 0;
  const cassa = cassaLiberaCommessa({ saldoOggi, daPagare, costoPrevisto: previsto.costo, avanzamentoPct });

  return (
    <Card id={anchorId} className={`scroll-mt-24 ${clienteFinanzia ? "" : "border-l-4 border-l-red-500"}`}>
      {/* In testa il verdetto, grande (01/11/2026): chi sta mettendo i soldi in questo cantiere, e quanti. */}
      <CardHeader className="space-y-2 pb-3 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className={`h-4 w-4 ${clienteFinanzia ? "text-emerald-500" : "text-red-500"}`} />
            {t("Chi finanzia il cantiere")}
          </CardTitle>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums leading-none ${clienteFinanzia ? "text-emerald-700" : "text-red-700"}`}>
              {clienteFinanzia ? "+" : "−"}{formatCurrency(Math.abs(saldoOggi))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{clienteFinanzia ? t("in cassa grazie al cliente") : t("anticipati da te")}</p>
          </div>
        </div>
        <p className={`rounded-lg px-3 py-2 text-sm ${clienteFinanzia ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {clienteFinanzia ? (
            <>{t("Fin qui il cantiere lo")} <strong>{t("finanzia il cliente")}</strong>{t(": entrati {entrati}, usciti {usciti}.", { entrati: formatCurrency(incassato), usciti: formatCurrency(uscite) })}</>
          ) : (
            <>{t("Fin qui il cantiere lo")} <strong>{t("stai finanziando tu")}</strong>{t(": hai pagato {differenza} più di quanto hai incassato ({usciti} usciti, {entrati} entrati).", { differenza: formatCurrency(Math.abs(saldoOggi)), usciti: formatCurrency(uscite), entrati: formatCurrency(incassato) })}</>
          )}
        </p>
      </CardHeader>
      {/* Mobile: verdetto e quattro numeri; il grafico al computer. */}
      <CardContent className="space-y-3 max-sm:p-3 max-sm:pt-0">
        {/* Grafico mensile — solo se c'è una storia da raccontare (≥2 mesi) */}
        {serieMensile.length >= 2 && (
          <div className="max-sm:hidden">
            <div className="mb-1 flex flex-wrap items-center justify-end gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("Incassi")}</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-rose-500" /> {t("Uscite")}</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-sky-600" /> {t("Cassa del cantiere")}</span>
            </div>
            <div className="h-[230px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serieMensile} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cassaCantiere" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    stroke="#94a3b8"
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                    }}
                    formatter={(value, name) => [
                      Number(value).toLocaleString(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }),
                      name === "entrate" ? t("Incassi del mese") : name === "uscite" ? t("Uscite del mese") : t("Cassa del cantiere"),
                    ]}
                    labelFormatter={(label) => t("Mese: {mese}", { mese: String(label) })}
                  />
                  {/* Sotto la linea dello zero il cantiere lo stai finanziando tu. */}
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Area type="monotone" dataKey="saldo" stroke="#0284c7" strokeWidth={2} fill="url(#cassaCantiere)" dot={{ r: 3, fill: "#0284c7", strokeWidth: 0 }} activeDot={{ r: 4 }} />
                  <Bar dataKey="entrate" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="uscite" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={16} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Il grafico fa vedere l'andamento, la tabella fa leggere i numeri: chiusa
            di default, perché la cassa mese per mese si guarda quando serve. */}
        {serieMensile.length >= 2 && (
          <details className="rounded-lg border" open={serieMensile.length <= 12}>
            <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium marker:hidden">
              {t("Cash flow mese per mese")}
              <span className="ml-1.5 font-normal text-muted-foreground">{t("apri un mese per vedere i movimenti")}</span>
            </summary>
            <div className="overflow-x-auto border-t px-3 pb-2">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-1.5 text-left font-medium">{t("Mese")}</th>
                    <th scope="col" className="py-1.5 pl-3 text-right font-medium">{t("Incassi")}</th>
                    <th scope="col" className="py-1.5 pl-3 text-right font-medium">{t("Uscite")}</th>
                    <th scope="col" className="py-1.5 pl-3 text-right font-medium">{t("Cassa a fine mese")}</th>
                  </tr>
                </thead>
                <tbody>
                  {serieMensile.map((m) => {
                    const apribile = m.movimenti.length > 0;
                    const aperto = meseAperto === m.ym;
                    return (
                      <Fragment key={m.ym}>
                        <tr className="border-t">
                          <th scope="row" className="py-1.5 text-left font-normal">
                            {apribile ? (
                              <button type="button" className="flex items-center gap-1" aria-expanded={aperto} onClick={() => setMeseAperto(aperto ? null : m.ym)}>
                                {aperto ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                                {m.label}
                              </button>
                            ) : m.label}
                          </th>
                          <td className="py-1.5 pl-3 text-right tabular-nums">{m.entrate > 0 ? formatCurrency(m.entrate) : "—"}</td>
                          <td className="py-1.5 pl-3 text-right tabular-nums">{m.uscite > 0 ? formatCurrency(m.uscite) : "—"}</td>
                          <td className={`py-1.5 pl-3 text-right font-medium tabular-nums ${m.saldo < 0 ? "text-red-700" : "text-foreground"}`}>
                            {m.saldo < 0 ? "−" : ""}{formatCurrency(Math.abs(m.saldo))}
                          </td>
                        </tr>
                        {aperto && m.movimenti.map((mov, i) => (
                          <tr key={`${m.ym}-${i}`} className="border-t bg-slate-50/60 text-[12px] dark:bg-muted/20">
                            <th scope="row" className="py-1 pl-5 text-left font-normal text-muted-foreground">
                              {fmtData(mov.date)} · {t(VOCE_CASSA[mov.voce])}
                            </th>
                            <td className="py-1 pl-3 text-right tabular-nums text-emerald-700">{mov.in > 0 ? formatCurrency(mov.in) : ""}</td>
                            <td className="py-1 pl-3 text-right tabular-nums text-rose-700">{mov.out > 0 ? formatCurrency(mov.out) : ""}</td>
                            <td />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("Cassa a fine mese: il cumulato di quello che è entrato meno quello che è uscito, mese dopo mese. Sotto zero il cantiere lo stai finanziando tu.")}
              </p>
            </div>
          </details>
        )}

        {scenarioMateriali && (
          <details className="rounded-lg border">
            <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium marker:hidden">
              {t("E se paghi i materiali prima di incassare?")}
              <span className="ml-1.5 font-normal text-muted-foreground">{t("scenario sui soli materiali")}</span>
            </summary>
            <div className="border-t px-3 py-2">{scenarioMateriali}</div>
          </details>
        )}

        {/* Telefono: la frase sopra dice già incassato e pagato; qui solo quello che manca, in
            una riga (prima quattro riquadri che ripetevano la frase). */}
        {(daPagare > 0 || (picco && picco.value < 0)) && (
          <p className="text-[13px] text-muted-foreground sm:hidden">
            {daPagare > 0 && <>{t("Ancora da pagare")} <strong className="text-foreground">{formatCurrencyCompact(daPagare)}</strong></>}
            {daPagare > 0 && picco && picco.value < 0 && " · "}
            {picco && picco.value < 0 && <>{t("picco")} <strong className="text-red-600">−{formatCurrencyCompact(Math.abs(picco.value))}</strong> {t("il {data}", { data: fmtData(picco.date) })}</>}
          </p>
        )}
        {/* Cassa libera: quanto dei soldi in mano è davvero tuo. L'acconto che sembra
            utile è il modo più comune di finanziare un cantiere con un altro.
            Senza fatture in attesa la cifra sarebbe identica a quella della fascia qui
            sopra: in quel caso resta solo l'avviso sui costi che devono ancora arrivare. */}
        {(cassa.daPagare > 0 || cassa.daSostenere != null) && (
          <div className="rounded-lg border bg-slate-50/70 p-3 dark:bg-muted/20">
            {cassa.daPagare > 0 && (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">{t("Cassa libera")}</span>
                  <strong className={`text-lg tabular-nums ${cassa.libera >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {cassa.libera < 0 ? "−" : ""}{formatCurrency(Math.abs(cassa.libera))}
                  </strong>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t("Incassato meno pagato, meno le fatture già arrivate e non ancora pagate.")}
                </p>
              </>
            )}
            {cassa.daSostenere != null && (
              <p className={`text-[13px] ${cassa.copre ? "text-muted-foreground" : "text-amber-800"} ${cassa.daPagare > 0 ? "mt-1" : ""}`}>
                {cassa.copre
                  ? t("Dal preventivo mancano ancora {costi} di costi, e la cassa li copre.", { costi: formatCurrency(cassa.daSostenere) })
                  : t("Dal preventivo mancano ancora {costi} di costi: la cassa non basta, la differenza la metti tu.", { costi: formatCurrency(cassa.daSostenere) })}
              </p>
            )}
          </div>
        )}

        {/* Numeri chiave */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 max-sm:hidden">
          <Mini label={t("Incassato")} value={formatCurrencyCompact(incassato)} valueClass="text-emerald-600" />
          <Mini label={t("Pagato")} value={formatCurrencyCompact(uscite)} valueClass="text-rose-600" />
          <Mini
            label={t("Picco esposizione")}
            value={picco && picco.value < 0 ? `−${formatCurrencyCompact(Math.abs(picco.value))}` : t("mai in rosso")}
            hint={picco && picco.value < 0 ? t("a fine giornata {data}", { data: fmtData(picco.date) }) : undefined}
            valueClass={picco && picco.value < 0 ? "text-red-600" : "text-emerald-600"}
          />
          <Mini
            label={t("Ancora da pagare")}
            value={daPagare > 0 ? formatCurrencyCompact(daPagare) : "—"}
            hint={daPagare > 0 ? t("costi registrati non pagati") : undefined}
          />
        </div>

        {/* Eseguito vs incassato: il credito invisibile del manuale */}
        {avanzamentoPct != null && avanzamentoPct > 0 && cashTotalGross > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {maturatoNonIncassato > 0 && avanzamentoPct - incassataPct >= 10 ? (
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : null}
            <span>
              {t("Lavori")} <strong className="text-foreground">{alPct(avanzamentoPct, t)}</strong>{t(", incassato il")}{" "}
              <strong className="text-foreground">{Math.round(incassataPct)}%</strong>
              {maturatoNonIncassato > 0 ? (
                <>
                  : <strong className={avanzamentoPct - incassataPct >= 10 ? "text-amber-600" : "text-foreground"}>{formatCurrency(maturatoNonIncassato)}</strong>{" "}
                  {t("di lavoro fatto ancora da incassare.")}
                </>
              ) : (
                t(": gli incassi tengono il passo dei lavori.")
              )}
            </span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground max-sm:hidden">{recorded ? t("Movimenti di prima nota registrati. I costi della squadra non sono automaticamente pagamenti.") : t("Pagamenti manuali con data effettiva. Verifica i movimenti in prima nota.")}</p>
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2 sm:p-2.5 min-w-0">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={`text-sm sm:text-base font-bold leading-tight tabular-nums truncate ${valueClass ?? ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}
