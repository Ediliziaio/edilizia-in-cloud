/**
 * QuotePaymentTermsCard — modalità + fasi di pagamento STRUTTURATE del preventivo.
 *
 * Percent-driven: l'importo di ogni fase si ricalcola dal totale (l'ultima assorbe il
 * resto → somma === totale). Le fasi usano lo stesso `type` delle rate della commessa
 * (deposit/balance/financing) così alla conversione si copiano 1:1 in order_installments.
 */
import { useMemo } from "react";
import { Wallet, Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import {
  type QuotePaymentPhase,
  type QuotePaymentPhaseType,
  PAYMENT_METHOD_PRESETS,
  recalcPhaseAmounts,
  phasesPercentTotal,
  defaultQuotePaymentPhases,
  paymentPlanError,
} from "@/lib/preventivi/paymentTerms";

interface Props {
  total: number;
  method: string;
  phases: QuotePaymentPhase[];
  onMethodChange: (method: string) => void;
  onPhasesChange: (phases: QuotePaymentPhase[]) => void;
}

const TYPE_LABEL: Record<QuotePaymentPhaseType, string> = {
  deposit: "Acconto",
  balance: "Saldo",
  financing: "Finanziamento",
};

export function QuotePaymentTermsCard({
  total, method, phases, onMethodChange, onPhasesChange,
}: Props) {
  // Importi visualizzati: sempre ricalcolati dal totale corrente.
  const computed = useMemo(() => recalcPhaseAmounts(phases, total), [phases, total]);
  const percentSum = useMemo(() => phasesPercentTotal(phases), [phases]);
  const planError = paymentPlanError(phases);
  const percentOk = planError === null;

  const push = (next: QuotePaymentPhase[]) => onPhasesChange(recalcPhaseAmounts(next, total));

  const updatePhase = (idx: number, patch: Partial<QuotePaymentPhase>) =>
    push(phases.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const addPhase = () =>
    push([...phases, { label: `Rata ${phases.length + 1}`, type: "deposit", percent: 0, amount: 0 }]);

  const removePhase = (idx: number) => push(phases.filter((_, i) => i !== idx));

  const applyDefault = () => push(defaultQuotePaymentPhases());

  return (
    <Card className="border-orange-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-orange-600" />
          Modalità e fasi di pagamento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Compilate nel preventivo, firmate dal cliente e riportate automaticamente nella commessa.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Modalità */}
        <div className="space-y-1.5">
          <Label htmlFor="payment-method">Modalità di pagamento</Label>
          <Input
            id="payment-method"
            list="payment-method-presets"
            value={method}
            onChange={(e) => onMethodChange(e.target.value)}
            placeholder="Es. Bonifico bancario"
          />
          <datalist id="payment-method-presets">
            {PAYMENT_METHOD_PRESETS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>

        {/* Fasi */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fasi di pagamento</Label>
            {phases.length === 0 ? (
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={applyDefault}>
                <Plus className="h-3.5 w-3.5" /> Piano standard (30/70)
              </Button>
            ) : (
              <Badge
                variant="outline"
                className={percentOk
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"}
              >
                {percentOk ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                {percentSum}%
              </Badge>
            )}
          </div>

          {computed.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border bg-slate-50/60 p-3 xl:grid-cols-[minmax(0,1fr)_7rem_5rem_7rem_auto]">
              <div className="col-span-3 min-w-0 space-y-1 xl:col-span-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrizione</span>
                <Input
                  value={p.label}
                  aria-label={`Descrizione fase ${idx + 1}`}
                  onChange={(e) => updatePhase(idx, { label: e.target.value })}
                  placeholder="Es. Acconto alla firma"
                  className="h-8"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</span>
                <Select value={p.type} onValueChange={(v) => updatePhase(idx, { type: v as QuotePaymentPhaseType })}>
                  <SelectTrigger className="h-8" aria-label={`Tipo fase ${idx + 1}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">{TYPE_LABEL.deposit}</SelectItem>
                    <SelectItem value="balance">{TYPE_LABEL.balance}</SelectItem>
                    <SelectItem value="financing">{TYPE_LABEL.financing}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">%</span>
                <Input
                  type="number" min={0} max={100} step={0.01}
                  aria-label={`Percentuale fase ${idx + 1}`}
                  value={p.percent}
                  onChange={(e) => updatePhase(idx, { percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  className="h-8 text-right"
                />
              </div>
              <div className="col-span-2 min-w-0 space-y-1 text-right xl:col-span-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Importo</span>
                <div className="flex h-8 items-center justify-end rounded-md border bg-white px-2 text-sm font-medium tabular-nums">
                  {formatCurrency(p.amount)}
                </div>
              </div>
              <Button
                type="button" variant="ghost" size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                onClick={() => removePhase(idx)}
                aria-label={`Rimuovi fase ${idx + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {phases.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={addPhase}>
                <Plus className="h-3.5 w-3.5" /> Aggiungi fase
              </Button>
              {percentSum < 100 && phases.every((p) => Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100) && (
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => push([...phases, {
                  label: "Saldo a fine lavori", type: "balance",
                  percent: Math.round((100 - percentSum) * 100) / 100, amount: 0,
                }])}>
                  Completa con saldo {Math.round((100 - percentSum) * 100) / 100}%
                </Button>
              )}
              {!percentOk && (
                <span role="alert" className="w-full text-xs text-amber-700">
                  {planError} Gli importi mostrati seguono le percentuali inserite, senza compensazioni nascoste.
                </span>
              )}
            </div>
          )}
        </div>

        {/* La regola a monte: la commessa parte coi soldi del cliente, non
            coi tuoi. E le stesse fasi valgono verso il sub (back-to-back). */}
        <p className="text-[11px] text-muted-foreground">
          Regola dell'acconto: copre l'acconto al fornitore più il primo mese di manodopera —
          la commessa parte coi soldi del cliente. Verso i sub: stesse fasi, pagate a SAL incassato.
        </p>

        {/* Le sei clausole del manuale (pag. 75): da scrivere nel contratto,
            non da chiedere al telefono. Chiuse di default: chi prepara il
            contratto le apre e le copia. */}
        <details className="group rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-slate-700 marker:content-none">
            Le sei clausole che valgono più di uno sconto — da scrivere nel contratto
          </summary>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li><strong className="text-slate-700">Acconto minimo 25-30%</strong>, incassato prima di ordinare qualunque materiale.</li>
            <li><strong className="text-slate-700">SAL a cadenza fissa mensile</strong>, contabilizzati a misura sul lavoro eseguito — non milestone tipo «a tetto finito», che si prestano a discussione.</li>
            <li><strong className="text-slate-700">Pagamento del SAL a 30 giorni dall'emissione</strong>, non dall'accettazione: sennò il committente allunga i tempi semplicemente non firmando.</li>
            <li><strong className="text-slate-700">Sospensione lavori automatica</strong> a 15 giorni dal mancato incasso di un SAL, con ripresa dei termini. Nero su bianco.</li>
            <li><strong className="text-slate-700">Ritenuta di garanzia svincolata a 6 mesi</strong> dalla fine lavori, non a 12 o 24 — o sostituita da una polizza fideiussoria che costa centinaia di euro e ti lascia i soldi in cassa.</li>
            <li><strong className="text-slate-700">Back-to-back sui subappalti</strong>: il sub si paga quando incassi il SAL che copre il suo lavoro.</li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
