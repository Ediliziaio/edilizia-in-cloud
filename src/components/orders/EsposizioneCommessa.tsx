/**
 * EsposizioneCommessa — "Chi finanzia il cantiere": la cassa CONSUNTIVA della
 * commessa nel tempo (la card "Cassa della commessa" resta la previsione).
 *
 * Entrate = rate incassate (lorde), uscite = costi pagati (lordi): il saldo
 * dice chi sta anticipando i soldi — se è sotto zero, il cantiere lo stai
 * finanziando tu. Il grafico è il family chart mensile (entrate smeraldo,
 * uscite rosso, linea = saldo cumulato); il picco di esposizione è calcolato
 * evento per evento nell'hook, non sui mesi.
 *
 * Con l'avanzamento fasi disponibile aggiunge il confronto del manuale:
 * % eseguita vs % incassata → "lavoro fatto non ancora incassato".
 * Sparisce da sola (null) finché non c'è nessun movimento: sulle commesse
 * appena aperte parla la previsione, non il consuntivo.
 */
import { useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { Banknote, CalendarClock, HandCoins, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { useEsposizioneCommessa, type RataEsposizione } from "@/hooks/useEsposizioneCommessa";

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
    <div className="rounded-2xl bg-[#173b67] p-3 sm:p-4">
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
  installments,
  cashTotalGross,
  avanzamentoPct,
  anchorId,
}: {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  financingCost: number;
  installments: RataEsposizione[];
  /** Target incassi lordo (totale ivato − finanziaria): stesso "su X" del piano rate. */
  cashTotalGross: number;
  /** Media % delle fasi lavorazione; null se la commessa non ha fasi. */
  avanzamentoPct: number | null;
  /** id DOM per lo scroll dalla fascia verdetto (solo sul mount desktop:
   *  mobile e desktop sono entrambi nel DOM, un id doppio punterebbe al nodo nascosto). */
  anchorId?: string;
}) {
  const { esposizione, isLoading } = useEsposizioneCommessa({
    orderId,
    totalAmount,
    vatRate,
    financingCost,
    installments,
  });

  const incassataPct = cashTotalGross > 0 ? Math.min(100, (esposizione.incassato / cashTotalGross) * 100) : 0;
  const maturatoNonIncassato = useMemo(() => {
    if (avanzamentoPct == null || avanzamentoPct <= 0 || cashTotalGross <= 0) return 0;
    return Math.max(0, (avanzamentoPct / 100) * cashTotalGross - esposizione.incassato);
  }, [avanzamentoPct, cashTotalGross, esposizione.incassato]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (!esposizione.hasMovimenti) return null;

  const { incassato, uscite, saldoOggi, picco, daPagare, serieMensile } = esposizione;
  const clienteFinanzia = saldoOggi >= 0;

  return (
    <Card id={anchorId} className={`scroll-mt-24 border-l-4 ${clienteFinanzia ? "border-l-emerald-500" : "border-l-red-500"}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className={`h-4 w-4 ${clienteFinanzia ? "text-emerald-500" : "text-red-500"}`} />
          Chi finanzia il cantiere
        </CardTitle>
        <Badge
          variant="outline"
          className={`text-xs font-semibold ${
            clienteFinanzia
              ? "bg-emerald-100 text-emerald-700 border-emerald-300"
              : "bg-red-100 text-red-700 border-red-300"
          }`}
        >
          {clienteFinanzia ? "+" : "−"}{formatCurrencyCompact(Math.abs(saldoOggi))}
        </Badge>
      </CardHeader>
      {/* Mobile: il segno nella testata e i quattro numeri; frase e grafico al computer. */}
      <CardContent className="space-y-3 max-sm:p-3 max-sm:pt-0">
        <p className={`text-[13px] leading-snug max-sm:hidden ${clienteFinanzia ? "text-emerald-700" : "text-red-600"}`}>
          {clienteFinanzia ? (
            <>
              Fin qui il cantiere lo finanzia il cliente: incassato{" "}
              <strong>{formatCurrency(incassato)}</strong>, pagato <strong>{formatCurrency(uscite)}</strong>.
            </>
          ) : (
            <>
              Fin qui il cantiere lo stai finanziando tu: hai pagato{" "}
              <strong>{formatCurrency(Math.abs(saldoOggi))}</strong> più di quanto incassato
              ({formatCurrency(uscite)} usciti contro {formatCurrency(incassato)}).
            </>
          )}
        </p>

        {/* Grafico mensile — solo se c'è una storia da raccontare (≥2 mesi) */}
        {serieMensile.length >= 2 && (
          <div className="max-sm:hidden">
            <div className="mb-1 flex flex-wrap items-center justify-end gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Incassi</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-rose-500" /> Uscite</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-900" /> Saldo</span>
            </div>
            <div className="h-[190px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serieMensile} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
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
                      Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }),
                      name === "entrate" ? "Incassi" : name === "uscite" ? "Uscite" : "Saldo",
                    ]}
                    labelFormatter={(label) => `Mese: ${label}`}
                  />
                  <Bar dataKey="entrate" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="uscite" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={22} />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#0f172a", strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
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
            hint={picco && picco.value < 0 ? `il ${fmtData(picco.date)}` : undefined}
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
