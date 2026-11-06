import { FinancingCostModeField } from "./FinancingCostModeField";
import { costoTrattenuto, type ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ritenutaSuLordo, IVA_SCORPORO_BANCA } from "@/lib/orders/bonusFiscali";
import { formatCurrency } from "@/lib/formatters";
import { incassiDellaCommessa } from "@/lib/orders/incassiCommessa";
import { calculateInstallmentCollections, type VarianteDatata } from "@/lib/commissions";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, CalendarIcon, Check, Clock, Building2, Landmark, AlertTriangle, Link2, FileText, Plus, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Installment } from "@/lib/orderUtils";
import {
  GRUPPI_EVENTO, eventiDelGruppo, dataAttesaRata, giorniAllEvento, statoIncassoRata,
  type DateCommessa,
} from "@/lib/orders/rateEventi";
import { BonusLinesCard } from "@/components/orders/BonusLinesCard";
import { quandoSiIncassa } from "@/lib/orders/modelliPagamento";
import { indiceSaldoFinale, importoSaldoFinale } from "@/lib/orders/saldoFinale";
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
  evento, triggerStatusId, triggerNumero, giorniPreavviso, dateCommessa, statiCommessa, onEventoChange, onTriggerStatusChange, onTriggerNumeroChange, onGiorniPreavvisoChange, nuova = false }: {
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
  triggerNumero?: number | null;
  giorniPreavviso?: number | null;
  /** Date del cantiere: servono a mostrare quando cadrà davvero la rata. */
  dateCommessa?: DateCommessa;
  statiCommessa?: Array<{ id: string; name: string }>;
  onEventoChange?: (evento: string) => void;
  onTriggerStatusChange?: (statusId: string | null) => void;
  onTriggerNumeroChange?: (numero: number | null) => void;
  onGiorniPreavvisoChange?: (giorni: number) => void;
  /** Commessa in creazione: una rata che cade oggi non è «scaduta» (la prima rata «alla firma» nasce con la data di oggi). */
  nuova?: boolean;
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
  const scaduta = statoIncasso === 'scaduta' && !(nuova && giorni === 0);
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
              {/* Raggruppati per fase del cantiere: contratto, materiali,
                  lavori, fatture. Dodici voci in fila non si leggono. */}
              {GRUPPI_EVENTO.map((g) => {
                const voci = eventiDelGruppo(g.value)
                  .filter((e) => e.value !== "stato_commessa" || (statiCommessa?.length ?? 0) > 0);
                if (voci.length === 0) return null;
                return (
                  <SelectGroup key={g.value}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {voci.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
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

          {eventoCorrente === "sal_numero" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              n.
              <Input
                type="number"
                min={1}
                max={99}
                value={triggerNumero ?? ""}
                placeholder="1"
                onChange={(e) => onTriggerNumeroChange?.(e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                className="h-7 w-14 px-2 text-xs"
                disabled={readOnly}
                aria-label={`Numero del SAL per ${label}`}
              />
            </span>
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
  daContratto?: boolean;
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
  hasLinkedInvoices?: boolean;
  invoiceLinksError?: boolean;
  /** Date del cantiere: mostrano quando cadrà davvero una rata agganciata a un evento. */
  dateCommessa?: DateCommessa;
  /** Stati commessa dell'azienda, per la rata che scade "quando arriva a…". */
  statiCommessa?: Array<{ id: string; name: string }>;
  hasBuildingBonus?: boolean;
  onHasBuildingBonusChange?: (value: boolean) => void;
  financingCost?: string;
  financingCostMode?: ModalitaCostoFinanziaria | null;
  onFinancingCostModeChange?: (value: ModalitaCostoFinanziaria | null) => void;
  onFinancingCostChange?: (value: string) => void;
  /** Ripartizione su più agevolazioni: attiva solo per le aziende che l'hanno accesa. */
  bonusMultipliEnabled?: boolean;
  bonusLines?: BonusLine[];
  onBonusLinesChange?: (lines: BonusLine[]) => void;
  /** CF cliente / P.IVA impresa, per comporre le causali dei bonifici parlanti. */
  datiCausale?: DatiCausale;
  /** Commessa in creazione: una rata che cade oggi (per esempio «alla firma») non è ancora «scaduta». */
  nuova?: boolean;
  /** Da dove viene l'aliquota proposta, sotto il campo. */
  notaIva?: string;
}

export function FinancialSummary({
  totalAmount, vatRate, paymentType,
  installments, onInstallmentsChange,
  numInstallments, onNumInstallmentsChange,
  onTotalAmountChange, onVatRateChange, onPaymentTypeChange,
  balance, readOnly = false, hasLinkedInvoices = false, invoiceLinksError = false,
  hasBuildingBonus, onHasBuildingBonusChange,
  financingCost, onFinancingCostChange, financingCostMode, onFinancingCostModeChange,
  bonusMultipliEnabled = false, bonusLines = [], onBonusLinesChange,
  datiCausale, dateCommessa, statiCommessa, nuova, daContratto = false, notaIva,}: FinancialSummaryProps) {
  const [inputMode, setInputMode] = useState<AmountInputMode>('net');
  const [rawTotalInput, setRawTotalInput] = useState(totalAmount);
  const [rawFinancingCostInput, setRawFinancingCostInput] = useState(financingCost || "");
  const [rawAmountInputs, setRawAmountInputs] = useState<Record<number, string>>({});

  const ivaConfermata = vatRate.trim() !== "";
  const vat = ivaConfermata ? parseDecimalIT(vatRate) : 0;
  const total = parseDecimalIT(totalAmount) || 0;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;
  useEffect(() => { if (!ivaConfermata) setInputMode('net'); }, [ivaConfermata]);

  // Sync raw total input
  useEffect(() => {
    if (inputMode === 'gross') {
      setRawTotalInput(formatDecimalIT(totalWithVat > 0 ? totalWithVat : null));
    } else {
      setRawTotalInput(totalAmount);
    }
  }, [totalAmount, inputMode, totalWithVat]);

  // Sync raw amount inputs when the installments structure OR their amounts change. Gli importi cambiano
  // da fuori quando si applica un modello di pagamento o cambia il totale: i campi li seguono. Mentre si
  // digita l'importo non cambia (si salva al blur), quindi il testo scritto non viene toccato.
  // Il saldo finale non ha un campo: è il residuo. I SAL intermedi («balance» non finali) sì.
  const posSaldoFinaleModulo = installments[indiceSaldoFinale(installments)]?.position ?? null;
  const isSaldoFinaleModulo = (i: Installment) => i.type === 'balance' && i.position === posSaldoFinaleModulo;
  const installmentsStructureKey = installments
    .filter(i => !isSaldoFinaleModulo(i))
    .map(i => `${i.position}:${i.amount}`)
    .join(',');

  useEffect(() => {
    setRawAmountInputs(() => {
      const newRaw: Record<number, string> = {};
      installments.forEach(i => {
        if (!isSaldoFinaleModulo(i)) {
          // Seed in formato IT: `String(1.234)` avrebbe rimesso nel campo una
          // stringa ambigua ("1.234") che al blur successivo verrebbe riletta
          // come 1234. Il numero entra nel campo già disambiguato.
          newRaw[i.position] = i.amount > 0 ? formatDecimalIT(i.amount) : "";
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
    if (!newRate.trim() || newRate === vatRate || ![0, 4, 5, 10, 22].includes(Number(newRate))) return;
    onVatRateChange(newRate);
    if (inputMode === 'gross' && rawTotalInput) {
      const newVat = newRate.trim() !== "" && Number.isFinite(Number(newRate)) ? Number(newRate) : 22;
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
    // Un importo scritto a mano non segue più la percentuale del modello di pagamento.
    const updated = installments.map(i =>
      i.position === position ? { ...i, amount: val, percent: val === i.amount ? i.percent : null } : i
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
  // Il nome della rata lo scrive chi la incassa: «merce pronta», «al rogito», «SAL di marzo».
  // Prima era fabbricato dal codice (Acconto 1, Rata 2, Saldo) e non si poteva toccare.
  const handleInstallmentLabelChange = (position: number, label: string) => {
    onInstallmentsChange(installments.map((i) => (i.position === position ? { ...i, label } : i)));
  };

  // Una rata si aggiunge e si toglie da sola. Cambiare il «numero rate» rifaceva il piano
  // da capo e buttava via nomi ed eventi scritti a mano.
  const rinumera = (righe: Installment[]): Installment[] => righe.map((r, idx) => ({ ...r, position: idx }));

  const aggiungiRata = () => {
    const saldo = installments.filter((i) => i.type === 'balance');
    const prima = installments.filter((i) => i.type !== 'balance');
    const nuove = rinumera([
      ...prima,
      { position: 0, label: `Rata ${prima.length + 1}`, type: 'deposit', amount: 0, is_paid: false },
      ...saldo,
    ]);
    onInstallmentsChange(nuove);
  };

  const togliRata = (position: number) => {
    onInstallmentsChange(rinumera(installments.filter((i) => i.position !== position)));
  };

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
      {labelOverride || readOnly ? (
        <Label>{labelOverride || inst.label}</Label>
      ) : (
        <div className="flex items-center gap-1">
          <Input
            value={inst.label}
            onChange={(e) => handleInstallmentLabelChange(inst.position, e.target.value)}
            aria-label={`Nome della rata ${inst.position + 1}`}
            maxLength={60}
            placeholder="Nome della rata"
            className="h-8 border-transparent bg-transparent px-1 text-sm font-medium hover:border-input focus:border-input"
          />
          {inst.type !== 'balance' && (
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
              aria-label={`Togli la rata ${inst.label}`} title="Togli questa rata" onClick={() => togliRata(inst.position)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
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
          amount={inst.type === "financing" && financingCostMode === "trattenuto" ? Math.max(0, inst.amount - parseDecimalIT(financingCost || "")) : inst.amount}
          paid={inst.is_paid}
          paidDate={inst.paid_date ? new Date(inst.paid_date) : undefined}
          expectedDate={inst.expected_date ? new Date(inst.expected_date) : undefined}
          onPaidChange={(paid) => handleInstallmentPaidChange(inst.position, paid)}
          onPaidDateChange={(date) => handleInstallmentDateChange(inst.position, 'paid_date', date)}
          evento={inst.trigger_evento}
          triggerStatusId={inst.trigger_status_id}
          triggerNumero={inst.trigger_numero}
          giorniPreavviso={inst.giorni_preavviso}
          nuova={nuova}
          dateCommessa={dateCommessa}
          statiCommessa={statiCommessa}
          onEventoChange={(ev) => handleInstallmentEventoChange(inst.position, { trigger_evento: ev, trigger_status_id: ev === 'stato_commessa' ? inst.trigger_status_id ?? null : null })}
          onTriggerStatusChange={(sid) => handleInstallmentEventoChange(inst.position, { trigger_status_id: sid })}
          onTriggerNumeroChange={(n) => handleInstallmentEventoChange(inst.position, { trigger_numero: n })}
          onGiorniPreavvisoChange={(g) => handleInstallmentEventoChange(inst.position, { giorni_preavviso: g })}
          onExpectedDateChange={(date) => handleInstallmentDateChange(inst.position, 'expected_date', date)}
          readOnly={readOnly}
        />
      )}
    </div>
  );

  // Render balance section
  const renderBalance = (labelText: string) => {
    // Il saldo finale è l'ULTIMA rata «balance»; i SAL intermedi hanno il loro campo sopra.
    const balanceInst = installments.find(isSaldoFinaleModulo);
    const balanceShown = balanceInst?.amount_from_contract ? balanceInst.amount : balance;
    return (
      <div className="pt-4 border-t space-y-3">
        <div className="flex justify-between items-center text-lg font-semibold">
          <span>{labelText}</span>
          <span>{formatCurrency(balanceShown)}</span>
        </div>
        {balanceShown > 0 && balanceInst && (
          <PaymentStatusRow
            label="Stato Saldo"
            amount={balanceShown}
            paid={balanceInst.is_paid}
            paidDate={balanceInst.paid_date ? new Date(balanceInst.paid_date) : undefined}
            expectedDate={balanceInst.expected_date ? new Date(balanceInst.expected_date) : undefined}
            onPaidChange={(paid) => handleInstallmentPaidChange(balanceInst.position, paid)}
            onPaidDateChange={(date) => handleInstallmentDateChange(balanceInst.position, 'paid_date', date)}
            evento={balanceInst.trigger_evento}
            triggerStatusId={balanceInst.trigger_status_id}
            triggerNumero={balanceInst.trigger_numero}
            giorniPreavviso={balanceInst.giorni_preavviso}
            nuova={nuova}
            dateCommessa={dateCommessa}
            statiCommessa={statiCommessa}
            onEventoChange={(ev) => handleInstallmentEventoChange(balanceInst.position, { trigger_evento: ev, trigger_status_id: ev === 'stato_commessa' ? balanceInst.trigger_status_id ?? null : null })}
            onTriggerStatusChange={(sid) => handleInstallmentEventoChange(balanceInst.position, { trigger_status_id: sid })}
            onTriggerNumeroChange={(n) => handleInstallmentEventoChange(balanceInst.position, { trigger_numero: n })}
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
            value={daContratto && installments.length === 0 ? "" : paymentType}
            onValueChange={(value) => {
              if ((value === "standard" || value === "financing") && value !== paymentType) onPaymentTypeChange(value);
            }}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder="Condizioni da confermare" />
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
              <TabsTrigger value="gross" disabled={!ivaConfermata}>IVA Inclusa</TabsTrigger>
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
              className="pl-8" placeholder={daContratto ? "Importo di competenza da confermare" : "0.00"}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* VAT Rate */}
        <div className="space-y-2">
          <Label>Aliquota IVA</Label>
          <Select value={vatRate} onValueChange={handleVatRateChange} disabled={readOnly}>
            <SelectTrigger aria-label="Aliquota IVA"><SelectValue placeholder="Da confermare dal contratto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0% · da confermare il regime</SelectItem>
              <SelectItem value="4">4%</SelectItem>
              <SelectItem value="5">5%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="22">22%</SelectItem>
            </SelectContent>
          </Select>
          {notaIva && <p className="text-xs text-muted-foreground">{notaIva}</p>}
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
            <span>{daContratto && !totalAmount.trim() ? "Da confermare" : formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{ivaConfermata ? `IVA (${vat}%)` : "IVA da confermare"}</span>
            <span>{ivaConfermata ? formatCurrency(vatAmount) : "—"}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-2">
            <span>Totale con IVA</span>
            <span>{ivaConfermata ? formatCurrency(totalWithVat) : "Da definire dopo conferma IVA"}</span>
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
                  <span className="text-amber-700 dark:text-amber-300">Imponibile bancario (÷ {(1 + IVA_SCORPORO_BANCA).toFixed(2).replace(".", ",")})</span>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="mr-auto">Rate · {installments.length}</Label>
                  {/* Col contratto importato le rate possono non esserci ancora: si dice
                      com'è, e finché ce ne sono si può tornare a «nessuna». */}
                  {daContratto && (installments.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nessuna rata: da confermare dal contratto</span>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onNumInstallmentsChange(0)}>
                      Torna a nessuna rata
                    </Button>
                  ))}
                  {/* Una rata alla volta: il menu «numero rate» rifaceva il piano da capo e
                      buttava via nomi, importi ed eventi scritti a mano. */}
                  <Button type="button" variant="outline" size="sm" onClick={aggiungiRata}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />Aggiungi una rata
                  </Button>
                </div>
                {invoiceLinksError && <p role="alert" className="text-xs text-destructive">
                  Non riesco a verificare i documenti collegati. Prima di cambiare il piano,
                  controlla le fatture e le bozze in «Fatture al cliente».
                </p>}
                {hasLinkedInvoices && <p role="status" className="text-xs text-amber-700">
                  La commessa ha documenti collegati. Cambiando numero o importi delle rate,
                  verifica e riconcilia i collegamenti in «Fatture al cliente»: i documenti restano
                  nell’elenco, ma non vengono ridimensionati automaticamente sul nuovo piano.
                </p>}
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

            {/* Acconti e SAL intermedi, in ordine di posizione: ognuno col suo importo */}
            {installments
              .filter(i => i.type === 'deposit' || (i.type === 'balance' && !isSaldoFinaleModulo(i)))
              .sort((a, b) => a.position - b.position)
              .map(inst => renderInstallmentInput(inst))}

            {/* Balance */}
            {installments.length > 0 ? renderBalance("Saldo da Pagare") : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pagamenti da confermare. Nessuna rata o scadenza generata dal contratto.</p>}
          </>
        ) : (
          <>
            {/* Number of deposits selector for financing */}
            {!readOnly && (
              <div className="space-y-2">
                <Label>Numero Acconti</Label>
                <Select
                  value={(numInstallments - 2).toString()}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (v !== "" && Number.isInteger(n) && n >= 0 && n <= 5 && n + 2 !== numInstallments) onNumInstallmentsChange(n + 2);
                  }}
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

            {/* SAL intermedi, ognuno col suo importo */}
            {installments
              .filter(i => i.type === 'balance' && !isSaldoFinaleModulo(i))
              .sort((a, b) => a.position - b.position)
              .map(inst => renderInstallmentInput(inst))}

            {/* Financing amount */}
            {(() => {
              const finInst = installments.find(i => i.type === 'financing');
              return finInst ? renderInstallmentInput(finInst, 'Valore Finanziamento') : null;
            })()}

            {/* Financing Cost */}
            <div className="space-y-2">
              <Label htmlFor="financing-cost">Costo Finanziaria</Label>
              <p className="text-xs text-muted-foreground">Costo a carico dell’azienda, trattenuto oppure pagato separatamente</p>
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

            {onFinancingCostModeChange && <FinancingCostModeField value={financingCostMode} onChange={onFinancingCostModeChange} disabled={readOnly} />}
            {financingCostMode && <p className="rounded-md bg-muted p-3 text-sm" aria-live="polite">
              Incasso previsto dalla finanziaria: <strong>{formatCurrency(Math.max(0,
                installments.filter(i => i.type === "financing").reduce((sum, i) => sum + i.amount, 0)
                - (financingCostMode === "trattenuto" ? parseDecimalIT(financingCost || "") : 0)))}</strong>.
              {financingCostMode === "separato" && <> Costo da registrare come uscita separata: <strong>{formatCurrency(parseDecimalIT(financingCost || ""))}</strong>.</>}
            </p>}
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
  financingCostMode?: ModalitaCostoFinanziaria | null;
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
  /** Varianti approvate con la data: il saldo già pagato conta quelle fino al giorno del pagamento. */
  varianti?: ReadonlyArray<VarianteDatata>;
}

export function FinancialSummaryReadOnly({
  totalAmount,
  vatRate = 22,
  paymentType,
  installments,
  hasBuildingBonus,
  financingCost,
  financingCostMode,
  onInstallmentPaidToggle,
  onInstallmentDateChange,
  orderId,
  orderCode,
  conPrimaNota,
  clienteNome,
  varianti,
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
  // La regola sta in lib/orders/saldoFinale, la stessa del salvataggio.
  const posSaldoFinale = installments[indiceSaldoFinale(installments)]?.position ?? null;
  const isSaldoFinale = (i: Installment) => i.type === 'balance' && i.position === posSaldoFinale;
  const balanceAmount = importoSaldoFinale(installments, totalWithVat, financingCostValue, financingCostMode);
  // Il saldo già pagato vale quanto è entrato quel giorno: una variante approvata dopo resta da incassare.
  const incassiRate = varianti
    ? calculateInstallmentCollections({ installments, totalAmount, vatRate, financingCost: financingCostValue, financingCostMode, includeFinancing: true, varianti })
    : null;
  const importoRata = (i: Installment) => (isSaldoFinale(i)
    ? (i.is_paid && incassiRate ? incassiRate[installments.indexOf(i)] ?? balanceAmount : balanceAmount)
    : i.type === "financing" && financingCostMode === "trattenuto" ? Math.max(0, i.amount - financingCostValue) : i.amount);
  // Stessa regola di intestazione e conto economico (incassiDellaCommessa).
  const incassi = incassiDellaCommessa({ installments, totalAmount, vatRate, paymentType, financingCost, financingCostMode, varianti });
  const collectedAmount = incassi.incassatoLordo;
  const dueAmount = incassi.daIncassareLordo;

  const formatPaymentDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: it });
  };

  // Ogni rata in una riga (01/11/2026, Dimora): prima lo STATO — incassata, da incassare, scaduta — poi
  // importo, fattura e data. L'azienda incassa: «Incassata», non «Pagato» (pagato è quello che dà lei).
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorniDa = (d: string) => Math.round((oggi.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  const renderPaymentRow = (inst: Installment, displayAmount?: number) => {
    const amount = displayAmount ?? inst.amount;
    const partialPaid = Number(inst.fattura?.importo_pagato ?? 0);
    const isPartial = !inst.is_paid && partialPaid > 0 && partialPaid < amount;
    if (amount <= 0 && inst.type !== 'balance') return null;

    const scaduta = !inst.is_paid && !!inst.expected_date && new Date(inst.expected_date) < oggi;
    const canEditDate = !!onInstallmentDateChange && !!inst.id;
    // La data prevista di una rata a evento è quella dell'evento (la tiene il database): non si scrive a
    // mano. La data dell'incasso, invece, si scrive come sempre.
    const aEvento = !!inst.trigger_evento && inst.trigger_evento !== 'data_fissa';
    const canEditExpected = canEditDate && !aEvento;
    const stato = inst.is_paid ? "incassata" : scaduta ? "scaduta" : isPartial ? "parziale" : "da_incassare";
    const STILE = {
      incassata: { punto: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", testo: "Incassata" },
      da_incassare: { punto: "bg-amber-400", pill: "bg-amber-50 text-amber-800 ring-amber-200", testo: "Da incassare" },
      parziale: { punto: "bg-sky-500", pill: "bg-sky-50 text-sky-800 ring-sky-200", testo: "Incassata in parte" },
      scaduta: { punto: "bg-red-500", pill: "bg-red-50 text-red-800 ring-red-200", testo: "Scaduta" },
    }[stato];
    // La data si legge nel selettore accanto quando c'è: qui non si ripete. Resta per le scadute (con i giorni).
    const quando = inst.is_paid
      ? (inst.paid_date && !canEditDate ? `il ${formatPaymentDate(inst.paid_date)}` : null)
      : scaduta && inst.expected_date
        ? `doveva entrare il ${formatPaymentDate(inst.expected_date)} · da ${giorniDa(inst.expected_date)} giorni`
        : aEvento
          ? `Si incassa ${quandoSiIncassa(inst.trigger_evento, inst.trigger_numero)}${inst.expected_date ? ` · il ${formatPaymentDate(inst.expected_date)}` : " · data ancora da conoscere"}`
          : canEditExpected ? null : inst.expected_date ? `prevista il ${formatPaymentDate(inst.expected_date)}` : "senza data prevista";
    // Al telefono il selettore della data non c'è (si corregge dal computer): la data si legge qui.
    const dataTelefono = inst.is_paid
      ? (inst.paid_date ? `il ${formatPaymentDate(inst.paid_date)}` : null)
      : inst.expected_date ? `prevista il ${formatPaymentDate(inst.expected_date)}` : null;

    return (
      <li
        key={inst.position}
        className={cn(
          // Telefono (01/11/2026): tre righe al massimo — nome, stato e importo; data o fattura; comandi.
          "grid gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-y-2 sm:py-3",
          stato === "scaduta" && "bg-red-50/60 dark:bg-red-950/20",
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", STILE.punto)} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-x-2">
              <span className="min-w-0 truncate font-medium">{inst.label}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STILE.pill)}>{STILE.testo}</span>
              <span className={cn("ml-auto shrink-0 font-semibold tabular-nums sm:hidden", stato === "incassata" ? "text-emerald-700" : "text-foreground")}>{formatCurrency(amount)}</span>
            </p>
            {/* Seconda riga: quando (al telefono anche la data, che al computer sta nel selettore) e fattura. */}
            {(quando || isPartial || dataTelefono || inst.fattura) && (
              <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-snug", stato === "scaduta" ? "font-medium text-red-700" : "text-muted-foreground")}>
                {quando && <span>{quando}</span>}
                {!quando && dataTelefono && <span className="sm:hidden">{dataTelefono}</span>}
                {isPartial && <span>entrati {formatCurrency(partialPaid)}, restano {formatCurrency(Math.max(0, amount - partialPaid))}</span>}
                {/* La fattura interna che incassa la rata (25/09/2026): pagata l'una, pagata l'altra. */}
                {inst.fattura && (
                  <Link to={`/azienda/documenti/${inst.fattura.id}/dettaglio`} className="tap-compact inline-flex items-center gap-1 font-normal text-primary hover:underline">
                    <FileText className="h-3 w-3" />
                    {inst.fattura.stato === "bozza" ? "Fattura in bozza" : `Fattura n. ${inst.fattura.numero ?? ""}`}
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-5 sm:justify-end sm:gap-2 sm:pl-0">
          <span className={cn("text-base font-semibold tabular-nums max-sm:hidden", stato === "incassata" ? "text-emerald-700" : "text-foreground")}>{formatCurrency(amount)}</span>
          {amount > 0 && onInstallmentPaidToggle && (
            <div className="inline-flex rounded-lg border bg-background p-0.5" role="radiogroup" aria-label={`Stato incasso ${inst.label}`}>
              <button
                type="button" role="radio" aria-checked={!inst.is_paid}
                onClick={() => inst.is_paid && onInstallmentPaidToggle(inst, false)}
                className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-2.5",
                  !inst.is_paid ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "text-muted-foreground hover:bg-muted")}
              >
                <Clock className="h-3 w-3 max-sm:hidden" />Da incassare
              </button>
              <button
                type="button" role="radio" aria-checked={!!inst.is_paid}
                onClick={() => !inst.is_paid && onInstallmentPaidToggle(inst, true)}
                className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-2.5",
                  inst.is_paid ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "text-muted-foreground hover:bg-muted")}
              >
                <Check className="h-3 w-3 max-sm:hidden" />Incassata
              </button>
            </div>
          )}
          {/* Data: si corregge da qui. Incassata → data dell'incasso; da incassare → data prevista. */}
          {amount > 0 && (inst.is_paid ? canEditDate : canEditExpected) && (
            <span className="max-sm:hidden"><DatePickerField
              label={inst.is_paid ? "Data incasso" : "Data prevista"}
              date={inst.is_paid ? (inst.paid_date ? new Date(inst.paid_date) : undefined) : (inst.expected_date ? new Date(inst.expected_date) : undefined)}
              onDateChange={(d) => onInstallmentDateChange!(inst, inst.is_paid ? 'paid_date' : 'expected_date', d)}
            /></span>
          )}
          {/* Rata incassata → un tap e la registrazione nasce in Prima Nota (solo rate su DB: senza id non
              c'e' aggancio idempotente). Con una fattura interna l'incasso lo scrive la fattura: un secondo
              sarebbe un doppione (e il database lo rifiuta). */}
          {conPrimaNota && orderId && inst.is_paid && !!inst.id && amount > 0 && !inst.documento_fiscale_id && (
            <RegistraIncassoPrimaNota inst={inst} amount={amount} orderId={orderId} orderCode={orderCode} entryId={incassiRegistrati[inst.id]} />
          )}
        </div>
      </li>
    );
  };

  const visibili = installments.filter(i => i.amount > 0 || i.type === 'balance');
  const incassate = visibili.filter(i => i.is_paid).length;
  // Rate ancora da incassare, con l'importo MOSTRATO (per il saldo quello calcolato): sono i candidati della
  // riconciliazione banca. Senza le rate con una fattura interna: il bonifico va sulla fattura, e la rata la segue.
  const daIncassare: RataDaIncassare[] = installments
    .filter(i => !i.is_paid && !!i.id && !i.documento_fiscale_id)
    .map(i => ({ id: i.id!, label: i.label, amount: importoRata(i), expected_date: i.expected_date ?? null }))
    .filter(r => r.amount > 0);
  const prossima = installments
    .filter(i => !i.is_paid && importoRata(i) > 0)
    .sort((a, b) => String(a.expected_date ?? "9999").localeCompare(String(b.expected_date ?? "9999")))[0];
  const incassabile = totalWithVat - costoTrattenuto(financingCostValue, financingCostMode);
  const pct = incassabile > 0 ? Math.min(100, Math.round((collectedAmount / incassabile) * 100)) : 0;
  const ordinate = [
    ...installments.filter(i => i.type === 'deposit'),
    ...(paymentType === 'financing' ? installments.filter(i => i.type === 'financing') : []),
    // Rate intermedie (SAL) e saldo finale: tutte le righe 'balance' in ordine di posizione.
    ...installments.filter(i => i.type === 'balance').sort((a, b) => a.position - b.position),
  ];

  return (
    <Card>
      <CardHeader className="space-y-3 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Euro className="h-5 w-5 max-sm:h-4 max-sm:w-4" />
              Incassi dal cliente
            </CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {visibili.length === 0
                ? "Nessuna rata ancora."
                : incassate === visibili.length
                  ? `Tutte le ${visibili.length} rate incassate.`
                  : `${incassate} di ${visibili.length} rate incassate${prossima ? ` · prossima: ${prossima.label}${prossima.expected_date ? ` il ${formatPaymentDate(prossima.expected_date)}` : ""}` : ""}.`}
            </p>
          </div>
          {conPrimaNota && orderId && daIncassare.length > 0 && (
            <button
              type="button"
              onClick={() => setRiconciliaOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-orange-50 hover:text-orange-700 max-sm:hidden"
              title="Cerca fra gli accrediti bancari i bonifici che combaciano con le rate da incassare"
            >
              <Landmark className="h-3.5 w-3.5" />
              Riconcilia con banca
            </button>
          )}
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
        {incassabile > 0 && (
          <div className="space-y-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Quanto è incassato" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
              <span><strong className="text-emerald-700">{formatCurrency(collectedAmount)}</strong> incassati · {pct}%</span>
              <span>{dueAmount > 0 ? <>da incassare <strong className="text-amber-700">{formatCurrency(dueAmount)}</strong></> : "niente da incassare"}</span>
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 max-sm:p-3 max-sm:pt-0 max-sm:text-sm">
        {ordinate.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-lg border" aria-label="Rate del cliente">
            {ordinate.map(inst => renderPaymentRow(inst, importoRata(inst)))}
          </ul>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pagamenti da confermare: nessuna rata o scadenza generata dal contratto.</p>
        )}

        {paymentType === 'financing' && financingCostValue > 0 && (
          <p className="flex justify-between text-sm">
            <span className="text-muted-foreground">Costo della finanziaria{financingCostMode === "trattenuto" ? " (trattenuto)" : financingCostMode === "separato" ? " (uscita separata)" : " (modalità da verificare)"}</span>
            <span className="font-medium text-destructive">- {formatCurrency(financingCostValue)}</span>
          </p>
        )}

        {/* Il contratto, in fondo e in piccolo: è il riferimento, non la prima cosa da leggere. */}
        <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>Contratto: imponibile <span className="tabular-nums text-foreground">{formatCurrency(totalAmount)}</span> + IVA {vatRate}% <span className="tabular-nums">{formatCurrency(vatAmount)}</span></span>
          <span>Totale <strong className="tabular-nums text-foreground">{formatCurrency(totalWithVat)}</strong> IVA inclusa</span>
        </p>

        {hasBuildingBonus && (() => {
          // Base della banca: lordo scorporato al 22% convenzionale, non con
          // l'aliquota del documento (circolare AdE 40/E/2010).
          const bankTaxableBase = totalWithVat / (1 + IVA_SCORPORO_BANCA);
          const bankWithholding = ritenutaSuLordo(totalWithVat);
          return (
            <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200">
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
      </CardContent>
    </Card>
  );
}
