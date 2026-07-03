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
  const percentOk = Math.abs(percentSum - 100) < 0.01;

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
            <div key={idx} className="flex items-end gap-2 rounded-lg border bg-slate-50/60 p-2">
              <div className="flex-1 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrizione</span>
                <Input
                  value={p.label}
                  onChange={(e) => updatePhase(idx, { label: e.target.value })}
                  placeholder="Es. Acconto alla firma"
                  className="h-8"
                />
              </div>
              <div className="w-28 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</span>
                <Select value={p.type} onValueChange={(v) => updatePhase(idx, { type: v as QuotePaymentPhaseType })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">{TYPE_LABEL.deposit}</SelectItem>
                    <SelectItem value="balance">{TYPE_LABEL.balance}</SelectItem>
                    <SelectItem value="financing">{TYPE_LABEL.financing}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">%</span>
                <Input
                  type="number" min={0} max={100} step={1}
                  value={p.percent}
                  onChange={(e) => updatePhase(idx, { percent: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-right"
                />
              </div>
              <div className="w-28 space-y-1 text-right">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Importo</span>
                <div className="flex h-8 items-center justify-end rounded-md border bg-white px-2 text-sm font-medium tabular-nums">
                  {formatCurrency(p.amount)}
                </div>
              </div>
              <Button
                type="button" variant="ghost" size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                onClick={() => removePhase(idx)}
                aria-label="Rimuovi fase"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {phases.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={addPhase}>
                <Plus className="h-3.5 w-3.5" /> Aggiungi fase
              </Button>
              {!percentOk && (
                <span className="text-xs text-amber-700">
                  Le percentuali sommano {percentSum}% (non 100%): l'ultima fase compensa la differenza.
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
