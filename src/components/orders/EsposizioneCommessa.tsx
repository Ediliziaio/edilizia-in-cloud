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
import { useMemo } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { Banknote, CalendarClock, HandCoins, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { useEsposizioneCommessa, type RataEsposizione } from "@/hooks/useEsposizioneCommessa";
import type { VarianteDatata } from "@/lib/commissions";

/** "al 50%" ma "all'80%" / "all'8%" / "all'11%". */
const alPct = (n: number) => {
  const r = Math.round(n);
  const apostrofo = r === 8 || r === 11 || (r >= 80 && r <= 89);
  return `${apostrofo ? "all'" : "al "}${r}%`;
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
        La cassa di questa commessa
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {canViewCosts && (
          <div className="col-span-2 sm:col-span-1">
            <NavyStatCard
              label="Chi finanzia il cantiere"
              value={
                esposizione.hasMovimenti
                  ? `${clienteFinanzia ? "+" : "−"}${formatCurrencyCompact(Math.abs(saldo))}`
                  : "—"
              }
              sub={
                esposizione.hasMovimenti
                  ? clienteFinanzia
                    ? "il cliente: incassato più che pagato"
                    : "tu: pagato più che incassato"
                  : "nessun movimento ancora"
              }
              icon={HandCoins}
              tone={esposizione.hasMovimenti && !clienteFinanzia ? "text-red-300" : "text-emerald-300"}
              onClick={onVaiEsposizione}
            />
          </div>
        )}
        <NavyStatCard
          label="Incassato"
          value={formatCurrencyCompact(collectedGross)}
          sub={`${incassataPct}% su ${formatCurrencyCompact(cashTotalGross)}`}
          icon={Banknote}
          tone="text-blue-100"
          onClick={onVaiPagamenti}
        />
        <NavyStatCard
          label="Da incassare"
          value={formatCurrencyCompact(daIncassare)}
          sub={
            daIncassare <= 0
              ? "tutto incassato"
              : prossimaRata
                ? `${prossimaRata.scaduta ? "rata scaduta il" : "prossima rata il"} ${fmtData(prossimaRata.date)}`
                : "nessuna scadenza fissata"
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
}) {
  const { esposizione, isLoading, isError, recorded } = useEsposizioneCommessa({
    orderId,
    totalAmount,
    vatRate,
    financingCost,
  financingCostMode,
    installments,
    varianti,
  });

  const incassataPct = cashTotalGross > 0 ? Math.min(100, (esposizione.incassato / cashTotalGross) * 100) : 0;
  const maturatoNonIncassato = useMemo(() => {
    if (avanzamentoPct == null || avanzamentoPct <= 0 || cashTotalGross <= 0) return 0;
    return Math.max(0, Math.round(((avanzamentoPct / 100) * cashTotalGross - esposizione.incassato) * 100) / 100);
  }, [avanzamentoPct, cashTotalGross, esposizione.incassato]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (isError) return <p role="alert" className="rounded-xl border p-4 text-sm text-amber-700">Non riesco a leggere i movimenti di cassa della commessa.</p>;
  if (!esposizione.hasMovimenti) return null;

  const { incassato, uscite, saldoOggi, picco, daPagare, serieMensile } = esposizione;
  const clienteFinanzia = saldoOggi >= 0;

  return (
    <Card id={anchorId} className={`scroll-mt-24 border-l-4 ${clienteFinanzia ? "border-l-emerald-500" : "border-l-red-500"}`}>
      {/* In testa il verdetto, grande (01/11/2026): chi sta mettendo i soldi in questo cantiere, e quanti. */}
      <CardHeader className="space-y-2 pb-3 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className={`h-4 w-4 ${clienteFinanzia ? "text-emerald-500" : "text-red-500"}`} />
            Chi finanzia il cantiere
          </CardTitle>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums leading-none ${clienteFinanzia ? "text-emerald-700" : "text-red-700"}`}>
              {clienteFinanzia ? "+" : "−"}{formatCurrency(Math.abs(saldoOggi))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{clienteFinanzia ? "in cassa grazie al cliente" : "anticipati da te"}</p>
          </div>
        </div>
        <p className={`rounded-lg px-3 py-2 text-sm ${clienteFinanzia ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {clienteFinanzia ? (
            <>Fin qui il cantiere lo <strong>finanzia il cliente</strong>: entrati {formatCurrency(incassato)}, usciti {formatCurrency(uscite)}.</>
          ) : (
            <>Fin qui il cantiere lo <strong>stai finanziando tu</strong>: hai pagato {formatCurrency(Math.abs(saldoOggi))} più di quanto hai incassato ({formatCurrency(uscite)} usciti, {formatCurrency(incassato)} entrati).</>
          )}
        </p>
      </CardHeader>
      {/* Mobile: verdetto e quattro numeri; il grafico al computer. */}
      <CardContent className="space-y-3 max-sm:p-3 max-sm:pt-0">
        {/* Grafico mensile — solo se c'è una storia da raccontare (≥2 mesi) */}
        {serieMensile.length >= 2 && (
          <div className="max-sm:hidden">
            <div className="mb-1 flex flex-wrap items-center justify-end gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Incassi</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-rose-500" /> Uscite</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-sky-600" /> Cassa del cantiere</span>
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
                      Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }),
                      name === "entrate" ? "Incassi del mese" : name === "uscite" ? "Uscite del mese" : "Cassa del cantiere",
                    ]}
                    labelFormatter={(label) => `Mese: ${label}`}
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

        {/* Numeri chiave */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Mini label="Incassato" value={formatCurrencyCompact(incassato)} valueClass="text-emerald-600" />
          <Mini label="Pagato" value={formatCurrencyCompact(uscite)} valueClass="text-rose-600" />
          <Mini
            label="Picco esposizione"
            value={picco && picco.value < 0 ? `−${formatCurrencyCompact(Math.abs(picco.value))}` : "mai in rosso"}
            hint={picco && picco.value < 0 ? `a fine giornata ${fmtData(picco.date)}` : undefined}
            valueClass={picco && picco.value < 0 ? "text-red-600" : "text-emerald-600"}
          />
          <Mini
            label="Ancora da pagare"
            value={daPagare > 0 ? formatCurrencyCompact(daPagare) : "—"}
            hint={daPagare > 0 ? "costi registrati non pagati" : undefined}
          />
        </div>

        {/* Eseguito vs incassato: il credito invisibile del manuale */}
        {avanzamentoPct != null && avanzamentoPct > 0 && cashTotalGross > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {maturatoNonIncassato > 0 && avanzamentoPct - incassataPct >= 10 ? (
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : null}
            <span>
              Lavori <strong className="text-foreground">{alPct(avanzamentoPct)}</strong>, incassato il{" "}
              <strong className="text-foreground">{Math.round(incassataPct)}%</strong>
              {maturatoNonIncassato > 0 ? (
                <>
                  : <strong className={avanzamentoPct - incassataPct >= 10 ? "text-amber-600" : "text-foreground"}>{formatCurrency(maturatoNonIncassato)}</strong>{" "}
                  di lavoro fatto ancora da incassare.
                </>
              ) : (
                ": gli incassi tengono il passo dei lavori."
              )}
            </span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">{recorded ? "Movimenti di prima nota registrati. I costi della squadra non sono automaticamente pagamenti." : "Pagamenti manuali con data effettiva. Verifica i movimenti in prima nota."}</p>
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
