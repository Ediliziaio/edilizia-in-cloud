import { useState, useEffect } from "react";
import { ritenutaSuLordo, IVA_SCORPORO_BANCA } from "@/lib/orders/bonusFiscali";
import { formatCurrency } from "@/lib/formatters";
// 2026-05-27: parseDecimalIT al posto di parseFloat sui campi importo —
// su iOS Safari il tasto virgola era bloccato da `type="number"` e
// parseFloat tagliava il decimale italiano (es. "1.500,50" → 1.500).
// Stesso pattern già applicato a CreateOrder/EditOrder/Cedolini/EditorRighe.
// 2026-07-25: al blur i campi importo rimandano a video il valore
// interpretato (formatDecimalIT). Prima il campo continuava a mostrare il
// testo digitato: chi scriveva "1.500" vedeva "1.500" e si portava a casa
// 1,50 € nel totale, nel PDF e in fattura senza un solo segnale.
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { RegistraIncassoPrimaNota, useIncassiRegistrati } from "./RegistraIncassoPrimaNota";
import { RiconciliaRateBancaDialog } from "./RiconciliaRateBancaDialog";
import type { RataDaIncassare } from "@/lib/rateBankMatch";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, CalendarIcon, Check, Clock, Building2, Landmark, AlertTriangle, Link2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Installment } from "@/lib/orderUtils";
import {
  EVENTI_RATA, dataAttesaRata, giorniAllEvento, statoIncassoRata,
  type DateCommessa,
} from "@/lib/orders/rateEventi";
import { BonusLinesCard } from "@/components/orders/BonusLinesCard";
import {
  type BonusLine,
  type DatiCausale,
  bonusLineVuota,
} from "@/lib/orders/bonusFiscali";

export type PaymentType = 'standard' | 'financing';
export type AmountInputMode = 'net' | 'gross';

// ── DatePickerField ─────────────────────────────────────────────
function DatePickerField({ label, date, onDateChange, disabled = false }: {
  label: string;
  date?: Date;
  onDateChange: (date?: Date) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "justify-start text-left font-normal h-8 text-xs",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {date ? format(date, "dd/MM/yyyy", { locale: it }) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          autoFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

// ── PaymentStatusRow ────────────────────────────────────────────
type PaymentStatus = 'non_pagato' | 'pagato';

function PaymentStatusRow({ label, amount, paid, paidDate, expectedDate, onPaidChange, onPaidDateChange, onExpectedDateChange, readOnly = false,
  evento, triggerStatusId, giorniPreavviso, dateCommessa, statiCommessa, onEventoChange, onTriggerStatusChange, onGiorniPreavvisoChange }: {
  label: string;
  amount: number;
  paid?: boolean;
  paidDate?: Date;
  expectedDate?: Date;
  onPaidChange?: (paid: boolean) => void;
  onPaidDateChange?: (date?: Date) => void;
  onExpectedDateChange?: (date?: Date) => void;
  readOnly?: boolean;
  /** Evento del cantiere a cui la rata è agganciata. */
  evento?: string | null;
  triggerStatusId?: string | null;
  giorniPreavviso?: number | null;
  /** Date del cantiere: servono a mostrare quando cadrà davvero la rata. */
  dateCommessa?: DateCommessa;
  statiCommessa?: Array<{ id: string; name: string }>;
  onEventoChange?: (evento: string) => void;
  onTriggerStatusChange?: (statusId: string | null) => void;
  onGiorniPreavvisoChange?: (giorni: number) => void;
}) {
  if (amount <= 0) return null;

  const status: PaymentStatus = paid ? 'pagato' : 'non_pagato';
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  // La rata può essere agganciata a un evento del cantiere invece che a una
  // data fissa: in quel caso la scadenza la calcola il sistema e si sposta
  // da sola quando sposti i lavori.
  const eventoCorrente = evento || 'data_fissa';
  const aEvento = eventoCorrente !== 'data_fissa';
  const dataDaEvento = aEvento && dateCommessa
    ? dataAttesaRata(eventoCorrente, expectedDate?.toLocaleDateString('en-CA') ?? null, dateCommessa)
    : (expectedDate?.toLocaleDateString('en-CA') ?? null);
  const statoIncasso = statoIncassoRata({ isPaid: !!paid, dataAttesa: dataDaEvento, giorniPreavviso, oggi });
  const giorni = giorniAllEvento(dataDaEvento, oggi);
  const scaduta = statoIncasso === 'scaduta';
  const inPreavviso = statoIncasso === 'preavviso';

  const handleStatusChange = (newStatus: PaymentStatus) => {
    // SOLO onPaidChange: il parent (handleInstallmentPaidChange) già azzera
    // expected_date/paid_date nello STESSO update. La seconda chiamata qui
    // (onExpectedDateChange/onPaidDateChange) partiva dalla closure STALE di
    // installments e SOVRASCRIVEVA il toggle appena fatto → "Pagato" tornava
    // subito "Non pagato" e il cambio non si salvava mai (bug segnalato).
    onPaidChange?.(newStatus === 'pagato');
  };

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-lg border ${scaduta ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900' : inPreavviso ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900' : 'bg-muted/30'}`}>
      <div className="flex justify-between items-center gap-2">
        <span className="font-medium flex items-center gap-2 min-w-0">
          <span className="truncate">{label}</span>
          {inPreavviso && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" />
              {giorni !== null && giorni <= 1 ? 'Domani' : `Tra ${giorni} giorni`}
            </span>
          )}
          {scaduta && (
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/50 dark:text-red-300">
              Scaduta
            </span>
          )}
        </span>
        <span className="font-semibold">{formatCurrency(amount)}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Bottoni segmented al posto della select: 1 tap invece di 2 e lo
            stato si legge a colpo d'occhio (richiesta utente, mobile-friendly). */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <div className="inline-flex rounded-lg border bg-background p-0.5" role="radiogroup" aria-label={`Stato pagamento ${label}`}>
            <button
              type="button"
              role="radio"
              aria-checked={status === 'non_pagato'}
              disabled={readOnly}
              onClick={() => handleStatusChange('non_pagato')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                status === 'non_pagato'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Clock className="h-3 w-3" />
              Non pagato
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={status === 'pagato'}
              disabled={readOnly}
              onClick={() => handleStatusChange('pagato')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                status === 'pagato'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Check className="h-3 w-3" />
              Pagato
            </button>
          </div>
        </div>
        
        {paid ? (
          <DatePickerField
            label="Data incasso"
            date={paidDate}
            onDateChange={onPaidDateChange || (() => {})}
            disabled={readOnly}
          />
        ) : aEvento ? (
          // Agganciata a un evento: la data la calcola il sistema, e si sposta
          // insieme al cantiere. Mostrarla comunque, altrimenti non si capisce
          // quando cade davvero.
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Scade il</span>
            <span className="font-medium">
              {dataDaEvento
                ? format(new Date(`${dataDaEvento}T00:00:00`), "d MMM yyyy", { locale: it })
                : "quando accadrà"}
            </span>
          </div>
        ) : (
          <DatePickerField
            label="Data prevista"
            date={expectedDate}
            onDateChange={onExpectedDateChange || (() => {})}
            disabled={readOnly}
          />
        )}
      </div>

      {/* Quando si incassa: l'evento del cantiere, non solo una data sul
          calendario. È il modo in cui i pagamenti si pattuiscono davvero
          ("acconto alla firma, saldo a fine lavori"). */}
      {!paid && onEventoChange && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">Si incassa</span>
          <Select value={eventoCorrente} onValueChange={onEventoChange} disabled={readOnly}>
            <SelectTrigger className="h-7 w-auto min-w-[190px] text-xs" aria-label={`Quando si incassa ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENTI_RATA
                .filter((e) => e.value !== "stato_commessa" || (statiCommessa?.length ?? 0) > 0)
                .map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          {eventoCorrente === "stato_commessa" && (statiCommessa?.length ?? 0) > 0 && (
            <Select
              value={triggerStatusId ?? ""}
              onValueChange={(v) => onTriggerStatusChange?.(v || null)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-7 w-auto min-w-[150px] text-xs" aria-label={`Stato che fa scadere ${label}`}>
                <SelectValue placeholder="scegli lo stato" />
              </SelectTrigger>
              <SelectContent>
                {(statiCommessa ?? []).map((st) => (
                  <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {aEvento && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              · avvisami
              <Input
                type="number"
                min={0}
                max={90}
                value={giorniPreavviso ?? 7}
                onChange={(e) => onGiorniPreavvisoChange?.(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
                className="h-7 w-14 px-2 text-xs"
                disabled={readOnly}
                aria-label={`Giorni di preavviso per ${label}`}
              />
              giorni prima
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── FinancialSummary (editable) ─────────────────────────────────

interface FinancialSummaryProps {
  totalAmount: string;
  vatRate: string;
  paymentType: PaymentType;
  installments: Installment[];
  onInstallmentsChange: (installments: Installment[]) => void;
  numInstallments: number;
  onNumInstallmentsChange: (num: number) => void;
  onTotalAmountChange: (value: string) => void;
  onVatRateChange: (value: string) => void;
  onPaymentTypeChange: (value: PaymentType) => void;
  balance: number;
  readOnly?: boolean;
  /** Date del cantiere: mostrano quando cadrà davvero una rata agganciata a un evento. */
  dateCommessa?: DateCommessa;
  /** Stati commessa dell'azienda, per la rata che scade "quando arriva a…". */
  statiCommessa?: Array<{ id: string; name: string }>;
  hasBuildingBonus?: boolean;
  onHasBuildingBonusChange?: (value: boolean) => void;
  financingCost?: string;
  onFinancingCostChange?: (value: string) => void;
  /** Ripartizione su più agevolazioni: attiva solo per le aziende che l'hanno accesa. */
  bonusMultipliEnabled?: boolean;
  bonusLines?: BonusLine[];
  onBonusLinesChange?: (lines: BonusLine[]) => void;
  /** CF cliente / P.IVA impresa, per comporre le causali dei bonifici parlanti. */
  datiCausale?: DatiCausale;
}

export function FinancialSummary({
  totalAmount, vatRate, paymentType,
  installments, onInstallmentsChange,
  numInstallments, onNumInstallmentsChange,
  onTotalAmountChange, onVatRateChange, onPaymentTypeChange,
  balance, readOnly = false,
  hasBuildingBonus, onHasBuildingBonusChange,
  financingCost, onFinancingCostChange,
  bonusMultipliEnabled = false, bonusLines = [], onBonusLinesChange,
  datiCausale, dateCommessa, statiCommessa,}: FinancialSummaryProps) {
  const [inputMode, setInputMode] = useState<AmountInputMode>('net');
  const [rawTotalInput, setRawTotalInput] = useState(totalAmount);
  const [rawFinancingCostInput, setRawFinancingCostInput] = useState(financingCost || "");
  const [rawAmountInputs, setRawAmountInputs] = useState<Record<number, string>>({});

  const vat = parseFloat(vatRate) || 22;
  const total = parseDecimalIT(totalAmount) || 0;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;

  // Sync raw total input
  useEffect(() => {
    if (inputMode === 'gross') {
      setRawTotalInput(formatDecimalIT(totalWithVat > 0 ? totalWithVat : null));
    } else {
      setRawTotalInput(totalAmount);
    }
  }, [totalAmount, inputMode, totalWithVat]);

  // Sync raw amount inputs only when installments structure changes (count/positions)
  const installmentsStructureKey = installments
    .filter(i => i.type !== 'balance')
    .map(i => i.position)
    .join(',');

  useEffect(() => {
    setRawAmountInputs(prev => {
      const newRaw: Record<number, string> = {};
      installments.forEach(i => {
        if (i.type !== 'balance') {
          // Keep existing raw value if position already exists, otherwise init from amount
          // Seed in formato IT: `String(1.234)` avrebbe rimesso nel campo una
          // stringa ambigua ("1.234") che al blur successivo verrebbe riletta
          // come 1234. Il numero entra nel campo già disambiguato.
          newRaw[i.position] = prev[i.position] !== undefined
            ? prev[i.position]
            : (i.amount > 0 ? formatDecimalIT(i.amount) : "");
        }
      });
      return newRaw;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installmentsStructureKey]);

  useEffect(() => {
    setRawFinancingCostInput(financingCost || "");
  }, [financingCost]);

  // Input mode handlers
  const handleInputModeChange = (mode: AmountInputMode) => {
    setInputMode(mode);
    if (mode === 'gross') {
      setRawTotalInput(totalWithVat > 0 ? totalWithVat.toFixed(2) : "");
    } else {
      setRawTotalInput(totalAmount);
    }
  };

  const handleTotalBlur = () => {
    if (inputMode === 'gross') {
      const grossAmount = parseDecimalIT(rawTotalInput) || 0;
      const netAmount = grossAmount / (1 + vat / 100);
      onTotalAmountChange(formatDecimalIT(netAmount > 0 ? netAmount : null));
      setRawTotalInput(formatDecimalIT(grossAmount > 0 ? grossAmount : null));
    } else {
      // L'eco passa dal valore PARSATO, non dal testo digitato: è l'unico
      // punto in cui l'utente può accorgersi che "1.500" è stato letto come
      // millecinquecento (o come 1,50) prima che finisca nel preventivo.
      const netAmount = parseDecimalIT(rawTotalInput);
      const echo = formatDecimalIT(netAmount > 0 ? netAmount : null);
      onTotalAmountChange(echo);
      setRawTotalInput(echo);
    }
  };

  const handleVatRateChange = (newRate: string) => {
    onVatRateChange(newRate);
    if (inputMode === 'gross' && rawTotalInput) {
      const newVat = parseFloat(newRate) || 22;
      const newGross = total * (1 + newVat / 100);
      setRawTotalInput(newGross > 0 ? newGross.toFixed(2) : "");
    }
  };

  // Accendere il bonus con la ripartizione attiva semina subito una riga che
  // copre tutto l'imponibile: l'utente la spezza invece di partire dal vuoto.
  const handleBuildingBonusChange = (value: boolean) => {
    onHasBuildingBonusChange?.(value);
    if (value && bonusMultipliEnabled && onBonusLinesChange && bonusLines.length === 0) {
      onBonusLinesChange([bonusLineVuota(0, total)]);
    }
  };

  // Installment handlers
  const handleInstallmentAmountBlur = (position: number) => {
    const raw = rawAmountInputs[position] || "";
    const val = parseDecimalIT(raw) || 0;
    const updated = installments.map(i =>
      i.position === position ? { ...i, amount: val } : i
    );
    onInstallmentsChange(updated);
    // Rimette nel campo il valore interpretato (vuoto se 0, per non
    // sporcare di "0,00" le rate non ancora compilate).
    setRawAmountInputs(prev => ({
      ...prev,
      [position]: val > 0 ? formatDecimalIT(val) : "",
    }));
  };

  const handleInstallmentPaidChange = (position: number, paid: boolean) => {
    const updated = installments.map(i =>
      i.position === position ? {
        ...i,
        is_paid: paid,
        // Data LOCALE (en-CA): toISOString è UTC e di sera segnava ieri
        paid_date: paid ? new Date().toLocaleDateString('en-CA') : null,
        expected_date: paid ? null : i.expected_date,
      } : i
    );
    onInstallmentsChange(updated);
  };

  /** Evento, stato agganciato e giorni di preavviso della singola rata. */
  const handleInstallmentEventoChange = (position: number, patch: Partial<Installment>) => {
    onInstallmentsChange(installments.map(i => (i.position === position ? { ...i, ...patch } : i)));
  };

  const handleInstallmentDateChange = (position: number, field: 'paid_date' | 'expected_date', date?: Date) => {
    const updated = installments.map(i =>
      i.position === position ? {
        ...i,
        // en-CA = YYYY-MM-DD LOCALE: toISOString() è UTC e di sera salvava
        // il giorno prima (bug sistemico già corretto altrove).
        [field]: date ? date.toLocaleDateString('en-CA') : null,
      } : i
    );
    onInstallmentsChange(updated);
  };

  // Render an installment amount input + payment status
  const renderInstallmentInput = (inst: Installment, labelOverride?: string) => (
    <div key={inst.position} className="space-y-2">
      <Label>{labelOverride || inst.label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
        <Input
          type="text" inputMode="decimal"
          value={rawAmountInputs[inst.position] ?? ""}
          onChange={(e) => setRawAmountInputs(prev => ({ ...prev, [inst.position]: e.target.value }))}
          onBlur={() => handleInstallmentAmountBlur(inst.position)}
          className="pl-8" placeholder="0.00"
          disabled={readOnly}
        />
      </div>
      {inst.amount > 0 && (
        <PaymentStatusRow
          label={`Stato ${inst.label}`}
          amount={inst.amount}
          paid={inst.is_paid}
          paidDate={inst.paid_date ? new Date(inst.paid_date) : undefined}
          expectedDate={inst.expected_date ? new Date(inst.expected_date) : undefined}
          onPaidChange={(paid) => handleInstallmentPaidChange(inst.position, paid)}
          onPaidDateChange={(date) => handleInstallmentDateChange(inst.position, 'paid_date', date)}
          evento={inst.trigger_evento}
          triggerStatusId={inst.trigger_status_id}
          giorniPreavviso={inst.giorni_preavviso}
          dateCommessa={dateCommessa}
          statiCommessa={statiCommessa}
          onEventoChange={(ev) => handleInstallmentEventoChange(inst.position, { trigger_evento: ev, trigger_status_id: ev === 'stato_commessa' ? inst.trigger_status_id ?? null : null })}
          onTriggerStatusChange={(sid) => handleInstallmentEventoChange(inst.position, { trigger_status_id: sid })}
          onGiorniPreavvisoChange={(g) => handleInstallmentEventoChange(inst.position, { giorni_preavviso: g })}
          onExpectedDateChange={(date) => handleInstallmentDateChange(inst.position, 'expected_date', date)}
          readOnly={readOnly}
        />
      )}
    </div>
  );

  // Render balance section
  const renderBalance = (labelText: string) => {
    const balanceInst = installments.find(i => i.type === 'balance');
    return (
      <div className="pt-4 border-t space-y-3">
        <div className="flex justify-between items-center text-lg font-semibold">
          <span>{labelText}</span>
          <span>{formatCurrency(balance)}</span>
        </div>
        {balance > 0 && balanceInst && (
          <PaymentStatusRow
            label="Stato Saldo"
            amount={balance}
            paid={balanceInst.is_paid}
            paidDate={balanceInst.paid_date ? new Date(balanceInst.paid_date) : undefined}
            expectedDate={balanceInst.expected_date ? new Date(balanceInst.expected_date) : undefined}
            onPaidChange={(paid) => handleInstallmentPaidChange(balanceInst.position, paid)}
            onPaidDateChange={(date) => handleInstallmentDateChange(balanceInst.position, 'paid_date', date)}
            evento={balanceInst.trigger_evento}
            triggerStatusId={balanceInst.trigger_status_id}
            giorniPreavviso={balanceInst.giorni_preavviso}
            dateCommessa={dateCommessa}
            statiCommessa={statiCommessa}
            onEventoChange={(ev) => handleInstallmentEventoChange(balanceInst.position, { trigger_evento: ev, trigger_status_id: ev === 'stato_commessa' ? balanceInst.trigger_status_id ?? null : null })}
            onTriggerStatusChange={(sid) => handleInstallmentEventoChange(balanceInst.position, { trigger_status_id: sid })}
            onGiorniPreavvisoChange={(g) => handleInstallmentEventoChange(balanceInst.position, { giorni_preavviso: g })}
            onExpectedDateChange={(date) => handleInstallmentDateChange(balanceInst.position, 'expected_date', date)}
            readOnly={readOnly}
          />
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Euro className="h-5 w-5" />
          Riepilogo Finanziario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Type */}
        <div className="space-y-2">
          <Label>Tipo Pagamento</Label>
          <Select
            value={paymentType}
            onValueChange={(value: PaymentType) => onPaymentTypeChange(value)}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (Acconti)</SelectItem>
              <SelectItem value="financing">Finanziamento</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount Input Mode Toggle */}
        {!readOnly && (
          <Tabs value={inputMode} onValueChange={(v) => handleInputModeChange(v as AmountInputMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="net">Imponibile</TabsTrigger>
              <TabsTrigger value="gross">IVA Inclusa</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Total Amount */}
        <div className="space-y-2">
          <Label htmlFor="total">
            {inputMode === 'gross' ? 'Importo Totale (IVA Inclusa)' : 'Importo Totale (Imponibile)'} *
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
            <Input
              id="total"
              type="text" inputMode="decimal"
              value={rawTotalInput}
              onChange={(e) => setRawTotalInput(e.target.value)}
              onBlur={handleTotalBlur}
              className="pl-8" placeholder="0.00"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* VAT Rate */}
        <div className="space-y-2">
          <Label>Aliquota IVA</Label>
          <Select value={vatRate} onValueChange={handleVatRateChange} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="22">22%</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Building Bonus Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="building-bonus" className="cursor-pointer">Bonus Edilizio</Label>
          </div>
          <Switch
            id="building-bonus"
            checked={hasBuildingBonus || false}
            onCheckedChange={handleBuildingBonusChange}
            disabled={readOnly}
          />
        </div>

        {/* Ripartizione su più agevolazioni (opt-in azienda): il contratto si
            divide fra due o più bonus, ognuno con la sua pratica e la sua
            causale di bonifico parlante. */}
        {hasBuildingBonus && bonusMultipliEnabled && onBonusLinesChange && (
          <BonusLinesCard
            lines={bonusLines}
            onChange={onBonusLinesChange}
            totaleCommessa={total}
            vatRate={vat}
            readOnly={readOnly}
            datiCausale={datiCausale}
          />
        )}

        {/* VAT Summary */}
        <div className="p-3 rounded-lg bg-muted/50 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Imponibile</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>IVA ({vat}%)</span>
            <span>{formatCurrency(vatAmount)}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-2">
            <span>Totale con IVA</span>
            <span>{formatCurrency(totalWithVat)}</span>
          </div>
          {hasBuildingBonus && (() => {
            // Il /1.22 di prima era GIUSTO: la banca non conosce l'aliquota
            // della fattura e per prassi scorpora sempre al 22% (circolare AdE
            // 40/E/2010). Sostituirlo con l'IVA vera gonfiava la trattenuta su
            // ogni lavoro al 10% o al 4%.
            const bankTaxableBase = totalWithVat / (1 + IVA_SCORPORO_BANCA);
            const bankWithholding = ritenutaSuLordo(totalWithVat);
            return (
              <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Ritenuta Bonus Edilizio
                </p>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-700 dark:text-amber-300">Imponibile bancario (÷ {(1 + vat / 100).toFixed(2)})</span>
                  <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankTaxableBase)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-amber-700 dark:text-amber-300">Ritenuta 11%</span>
                  <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankWithholding)}</span>
                </div>
                {/* Il numero che interessa davvero: quanto entra in cassa */}
                <div className="flex justify-between text-sm font-bold border-t border-amber-200 dark:border-amber-800 pt-1 mt-1">
                  <span className="text-amber-900 dark:text-amber-100">Incasso netto (dopo ritenuta)</span>
                  <span className="text-amber-900 dark:text-amber-100">{formatCurrency(totalWithVat - bankWithholding)}</span>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Ritenuta trattenuta dalla banca — recuperabile in dichiarazione
                </p>
              </div>
            );
          })()}
        </div>

        {paymentType === 'standard' ? (
          <>
            {/* Number of installments selector */}
            {!readOnly && (
              <div className="space-y-2">
                <Label>Numero Rate</Label>
                {/* Include anche 1 (solo Saldo): le commesse salvate senza acconti
                    hanno numInstallments=1 — senza l'opzione il trigger restava
                    VUOTO (value fuori lista) e sembrava un campo rotto. */}
                <Select
                  value={numInstallments.toString()}
                  onValueChange={(v) => onNumInstallmentsChange(parseInt(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleziona numero rate" /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n === 1 ? "1 (solo Saldo, nessun acconto)" : `${n} rate (${n - 1} ${n - 1 === 1 ? 'Acconto' : 'Acconti'} + Saldo)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  // Sintesi a colpo d'occhio: quanto è già allocato in acconti
                  // e quanto resta a saldo, senza dover scorrere i singoli campi.
                  const deposits = installments.filter(i => i.type === 'deposit');
                  if (deposits.length === 0) return null;
                  const depositsTotal = deposits.reduce((s, d) => s + (d.amount || 0), 0);
                  return (
                    <p className="text-xs text-muted-foreground">
                      {deposits.length} {deposits.length === 1 ? 'acconto' : 'acconti'} per {formatCurrency(depositsTotal)} · Saldo {formatCurrency(balance)}
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Deposit installments */}
            {installments.filter(i => i.type === 'deposit').map(inst => renderInstallmentInput(inst))}

            {/* Balance */}
            {renderBalance("Saldo da Pagare")}
          </>
        ) : (
          <>
            {/* Number of deposits selector for financing */}
            {!readOnly && (
              <div className="space-y-2">
                <Label>Numero Acconti</Label>
                <Select
                  value={(numInstallments - 2).toString()}
                  onValueChange={(v) => onNumInstallmentsChange(parseInt(v) + 2)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n === 0 ? 'Nessun acconto' : `${n} Accont${n === 1 ? 'o' : 'i'} bonifico`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deposit installments (if any) */}
            {installments.filter(i => i.type === 'deposit').map(inst =>
              renderInstallmentInput(inst, inst.label + ' (opzionale)')
            )}

            {/* Financing amount */}
            {(() => {
              const finInst = installments.find(i => i.type === 'financing');
              return finInst ? renderInstallmentInput(finInst, 'Valore Finanziamento') : null;
            })()}

            {/* Financing Cost */}
            <div className="space-y-2">
              <Label htmlFor="financing-cost">Costo Finanziaria</Label>
              <p className="text-xs text-muted-foreground">Commissione da versare alla finanziaria (es. tasso zero)</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  id="financing-cost"
                  type="text" inputMode="decimal"
                  value={rawFinancingCostInput}
                  onChange={(e) => setRawFinancingCostInput(e.target.value)}
                  onBlur={() => {
                    const val = parseDecimalIT(rawFinancingCostInput);
                    const echo = val > 0 ? formatDecimalIT(val) : "";
                    setRawFinancingCostInput(echo);
                    onFinancingCostChange?.(echo);
                  }}
                  className="pl-8" placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Balance */}
            {renderBalance("Saldo Cliente")}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── FinancialSummaryReadOnly ────────────────────────────────────

interface FinancialSummaryReadOnlyProps {
  totalAmount: number;
  vatRate?: number;
  paymentType: PaymentType;
  installments: Installment[];
  hasBuildingBonus?: boolean;
  financingCost?: number;
  onInstallmentPaidToggle?: (installment: Installment, paid: boolean) => void;
  /** Se presente, le date incasso/prevista diventano modificabili inline
      (solo rate già su DB, cioè con id). */
  onInstallmentDateChange?: (installment: Installment, field: 'paid_date' | 'expected_date', date?: Date) => void;
  /** Con orderId + conPrimaNota, le rate pagate offrono "Registra incasso"
      in Prima Nota (gate: permesso canViewPrimaNota del chiamante). */
  orderId?: string;
  orderCode?: string | null;
  conPrimaNota?: boolean;
  /** Nome del cliente: aiuta il match banca↔rate (citato nella causale). */
  clienteNome?: string | null;
}

export function FinancialSummaryReadOnly({
  totalAmount,
  vatRate = 22,
  paymentType,
  installments,
  hasBuildingBonus,
  financingCost,
  onInstallmentPaidToggle,
  onInstallmentDateChange,
  orderId,
  orderCode,
  conPrimaNota,
  clienteNome,
}: FinancialSummaryReadOnlyProps) {
  const { effectiveCompany } = useAuth();
  // Una query per tutta la card: quali rate hanno già la loro registrazione.
  const { data: incassiRegistrati = {} } = useIncassiRegistrati(orderId, !!conPrimaNota);
  const [riconciliaOpen, setRiconciliaOpen] = useState(false);
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;
  const financingCostValue = paymentType === "financing" ? (financingCost || 0) : 0;

  // Piani a 3+ rate: il tipo rata conosce solo deposit/balance/financing, quindi
  // SAL intermedi e saldo arrivano ENTRAMBI come 'balance'. Solo l'ULTIMA rata
  // balance è il saldo calcolato per differenza: le intermedie valgono il LORO
  // importo. Prima ogni riga 'balance' mostrava l'intero residuo e la seconda
  // spariva dalla lista (il render faceva find() della prima e basta).
  const posSaldoFinale = installments.reduce<number | null>(
    (acc, i) => (i.type === 'balance' ? Math.max(acc ?? i.position, i.position) : acc),
    null,
  );
  const isSaldoFinale = (i: Installment) => i.type === 'balance' && i.position === posSaldoFinale;
  const sommaAltreRate = installments
    .filter(i => !isSaldoFinale(i))
    .reduce((sum, i) => sum + i.amount, 0);
  const balanceAmount = Math.max(0, totalWithVat - sommaAltreRate - financingCostValue);
  const importoRata = (i: Installment) => (isSaldoFinale(i) ? balanceAmount : i.amount);
  const collectedAmount = installments
    .filter(i => i.is_paid)
    .reduce((sum, i) => sum + importoRata(i), 0);
  const dueAmount = Math.max(0, totalWithVat - financingCostValue - collectedAmount);

  const formatPaymentDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: it });
  };

  // SAL semplificato (richiesta utente): nel dettaglio commessa ogni rata si
  // gestisce direttamente — bottoni Pagato/Non pagato ben visibili (prima era
  // uno switch microscopico senza etichetta che nessuno riconosceva), data
  // incasso/prevista modificabile inline, evidenza rossa sulle scadute.
  const renderPaymentRow = (inst: Installment, displayAmount?: number) => {
    const amount = displayAmount ?? inst.amount;
    if (amount <= 0 && inst.type !== 'balance') return null;

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const scaduta = !inst.is_paid && !!inst.expected_date && new Date(inst.expected_date) < oggi;
    const canEditDate = !!onInstallmentDateChange && !!inst.id;

    return (
      <div
        key={inst.position}
        className={cn(
          "p-3 rounded-lg space-y-2",
          scaduta
            ? "bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900"
            : "bg-muted/30",
        )}
      >
        <div className={cn("flex justify-between gap-2", inst.type === 'balance' && "pt-2 border-t")}>
          <span className={cn("flex items-center gap-2 min-w-0", inst.type === 'balance' ? "font-medium" : "text-muted-foreground")}>
            <span className="truncate">{inst.label}</span>
            {scaduta && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/50 dark:text-red-300">
                Scaduta
              </span>
            )}
          </span>
          <span className={inst.type === 'balance' ? "font-bold text-lg" : "text-primary font-medium"}>
            {formatCurrency(amount)}
          </span>
        </div>
        {amount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onInstallmentPaidToggle ? (
              <div className="inline-flex rounded-lg border bg-background p-0.5" role="radiogroup" aria-label={`Stato pagamento ${inst.label}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!inst.is_paid}
                  onClick={() => inst.is_paid && onInstallmentPaidToggle(inst, false)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    !inst.is_paid
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Clock className="h-3 w-3" />
                  Non pagato
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!inst.is_paid}
                  onClick={() => !inst.is_paid && onInstallmentPaidToggle(inst, true)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    inst.is_paid
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Check className="h-3 w-3" />
                  {inst.type === 'financing' ? 'Incassato' : 'Pagato'}
                </button>
              </div>
            ) : inst.is_paid ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                {inst.type === 'financing' ? 'Incassato' : 'Pagato'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Clock className="h-3 w-3" />
                In attesa
              </span>
            )}

            {/* Data: modificabile inline quando possibile, altrimenti testo */}
            {inst.is_paid ? (
              canEditDate ? (
                <DatePickerField
                  label="Data incasso"
                  date={inst.paid_date ? new Date(inst.paid_date) : undefined}
                  onDateChange={(d) => onInstallmentDateChange!(inst, 'paid_date', d)}
                />
              ) : (
                inst.paid_date && (
                  <span className="text-xs text-muted-foreground">il {formatPaymentDate(inst.paid_date)}</span>
                )
              )
            ) : canEditDate ? (
              <DatePickerField
                label="Data prevista"
                date={inst.expected_date ? new Date(inst.expected_date) : undefined}
                onDateChange={(d) => onInstallmentDateChange!(inst, 'expected_date', d)}
              />
            ) : (
              inst.expected_date && (
                <span className="text-xs text-muted-foreground">Previsto {formatPaymentDate(inst.expected_date)}</span>
              )
            )}
          </div>
        )}
        {/* Rata incassata → un tap e la registrazione nasce in Prima Nota
            (solo rate su DB: senza id non c'e' aggancio idempotente). */}
        {conPrimaNota && orderId && inst.is_paid && !!inst.id && amount > 0 && (
          <div className="flex justify-end">
            <RegistraIncassoPrimaNota
              inst={inst}
              amount={amount}
              orderId={orderId}
              orderCode={orderCode}
              entryId={incassiRegistrati[inst.id]}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Euro className="h-5 w-5" />
          Riepilogo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Imponibile</span>
          <span className="font-medium">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">IVA ({vatRate}%)</span>
          <span>{formatCurrency(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-primary font-medium">
          <span>Totale con IVA</span>
          <span>{formatCurrency(totalWithVat)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
          <div className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
            <div className="text-[11px]">Incassato</div>
            <div className="font-semibold">{formatCurrency(collectedAmount)}</div>
          </div>
          <div className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">
            <div className="text-[11px]">Da incassare</div>
            <div className="font-semibold">{formatCurrency(dueAmount)}</div>
          </div>
        </div>
        {/* Avanzamento incasso a colpo d'occhio */}
        {(() => {
          const incassabile = totalWithVat - financingCostValue;
          if (incassabile <= 0) return null;
          const pct = Math.min(100, Math.round((collectedAmount / incassabile) * 100));
          return (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-right text-[11px] text-muted-foreground">{pct}% incassato</p>
            </div>
          );
        })()}
        {hasBuildingBonus && (() => {
          // Base della banca: lordo scorporato al 22% convenzionale, non con
          // l'aliquota del documento (circolare AdE 40/E/2010).
          const bankTaxableBase = totalWithVat / (1 + IVA_SCORPORO_BANCA);
          const bankWithholding = ritenutaSuLordo(totalWithVat);
          return (
            <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Ritenuta Bonus Edilizio
              </p>
              <div className="flex justify-between text-xs">
                <span className="text-amber-700 dark:text-amber-300">Imponibile bancario (÷ {(1 + vatRate / 100).toFixed(2)})</span>
                <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankTaxableBase)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-amber-700 dark:text-amber-300">Ritenuta 11%</span>
                <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankWithholding)}</span>
              </div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Importo trattenuto dalla banca — recuperabile in dichiarazione
              </p>
            </div>
          );
        })()}

        <div className="pt-3 border-t space-y-3">
          {/* Intestazione sezione: rende riconoscibile la gestione pagamenti */}
          {(() => {
            const visibili = installments.filter(i => i.amount > 0 || i.type === 'balance');
            const pagate = visibili.filter(i => i.is_paid).length;
            // Rate ancora da incassare, con l'importo MOSTRATO (per il saldo
            // quello calcolato): sono i candidati della riconciliazione banca.
            const daIncassare: RataDaIncassare[] = installments
              .filter(i => !i.is_paid && !!i.id)
              .map(i => ({
                id: i.id!,
                label: i.label,
                amount: importoRata(i),
                expected_date: i.expected_date ?? null,
              }))
              .filter(r => r.amount > 0);
            return (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Pagamenti</span>
                <span className="flex items-center gap-2">
                  {conPrimaNota && orderId && daIncassare.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRiconciliaOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                      title="Cerca fra gli accrediti bancari i bonifici che combaciano con le rate da incassare"
                    >
                      <Landmark className="h-3 w-3" />
                      Riconcilia con banca
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">{pagate}/{visibili.length} rate incassate</span>
                </span>
                {conPrimaNota && orderId && (
                  <RiconciliaRateBancaDialog
                    open={riconciliaOpen}
                    onOpenChange={setRiconciliaOpen}
                    companyId={effectiveCompany?.id}
                    orderId={orderId}
                    orderCode={orderCode}
                    clienteNome={clienteNome}
                    rateNonPagate={daIncassare}
                  />
                )}
              </div>
            );
          })()}
          {/* Deposit installments */}
          {installments.filter(i => i.type === 'deposit').map(inst => renderPaymentRow(inst))}

          {/* Financing (if applicable) */}
          {paymentType === 'financing' && (() => {
            const finInst = installments.find(i => i.type === 'financing');
            return finInst ? renderPaymentRow(finInst) : null;
          })()}

          {/* Financing cost */}
          {paymentType === 'financing' && financingCostValue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Costo Finanziaria</span>
              <span className="text-destructive font-medium">- {formatCurrency(financingCostValue)}</span>
            </div>
          )}

          {/* Rate intermedie (SAL) e saldo finale: tutte le righe 'balance'
              in ordine di posizione. Prima veniva mostrata solo la prima,
              con l'intero residuo come importo. */}
          {installments
            .filter(i => i.type === 'balance')
            .sort((a, b) => a.position - b.position)
            .map(inst => renderPaymentRow(inst, importoRata(inst)))}
        </div>
      </CardContent>
    </Card>
  );
}
