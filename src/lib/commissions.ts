export type CommissionType = "fixed" | "percentage_sold" | "percentage_collected" | "percentage_margin";
export type CompensationMode = "only_commission" | "fixed_plus_commission" | "fixed_only";
export type VariableCompensationStatus =
  | "estimated"
  | "matured"
  | "held"
  | "approval"
  | "payable"
  | "paid"
  | "disputed";
export type CommissionMarginRisk = "healthy" | "watch" | "warning" | "critical";

export interface CommissionCalculationInput {
  commissionType?: string | null;
  commissionValue?: number | string | null;
  totalAmount?: number | string | null;
  collectedAmount?: number | string | null;
  marginAmount?: number | string | null;
  deductionAmount?: number | string | null;
  compensationMode?: string | null;
}

export interface InstallmentLike {
  type?: string | null;
  amount?: number | string | null;
  is_paid?: boolean | null;
}

export interface VariableCompensationStatusInput {
  commissionType?: string | null;
  grossAmount?: number | string | null;
  deductionAmount?: number | string | null;
  netAmount?: number | string | null;
  soldAmount?: number | string | null;
  collectedAmount?: number | string | null;
  isPaid?: boolean | null;
  paidDate?: string | null;
  paymentExpectedDate?: string | null;
  errorCount?: number | string | null;
  hasHold?: boolean | null;
  hasManualAdjustment?: boolean | null;
  today?: Date;
}

export interface VariableCompensationStatusInfo {
  status: VariableCompensationStatus;
  label: string;
  hint: string;
}

export interface CommissionBreakdownInput {
  commissionType?: string | null;
  commissionValue?: number | string | null;
  soldAmount?: number | string | null;
  collectedAmount?: number | string | null;
  grossAmount?: number | string | null;
  deductionAmount?: number | string | null;
  incentivesAmount?: number | string | null;
  netAmount?: number | string | null;
}

export interface CommissionBreakdownLine {
  label: string;
  amount: number;
  kind: "base" | "bonus" | "malus" | "net";
}

export interface CommissionMarginImpactInput {
  revenueNet?: number | string | null;
  variableCosts?: number | string | null;
  commissionNet?: number | string | null;
}

export interface CommissionMarginImpact {
  marginBeforeCommission: number;
  marginAfterCommission: number;
  marginAfterPercent: number;
  risk: CommissionMarginRisk;
}

function money(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function positiveMoney(value: number | string | null | undefined): number {
  return Math.max(0, money(value));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateOnly(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function calculateCommissionGross(input: CommissionCalculationInput): number {
  if (input.compensationMode === "fixed_only") return 0;

  const value = positiveMoney(input.commissionValue);
  const totalAmount = positiveMoney(input.totalAmount);
  const collectedAmount = positiveMoney(input.collectedAmount);
  const marginAmount = positiveMoney(input.marginAmount);
  switch (input.commissionType) {
    case "fixed":
      return roundMoney(value);
    case "percentage_sold":
      return roundMoney(totalAmount * (value / 100));
    case "percentage_collected":
      return roundMoney(collectedAmount * (value / 100));
    case "percentage_margin":
      return roundMoney(marginAmount * (value / 100));
    default:
      return 0;
  }
}

export function calculateCommissionNet(input: CommissionCalculationInput): number {
  return Math.max(0, roundMoney(calculateCommissionGross(input) - positiveMoney(input.deductionAmount)));
}

export function calculateStoredCommissionNet(
  commissionAmount?: number | string | null,
  deductionAmount?: number | string | null
): number {
  return Math.max(0, roundMoney(positiveMoney(commissionAmount) - positiveMoney(deductionAmount)));
}

export function deriveVariableCompensationStatus(input: VariableCompensationStatusInput): VariableCompensationStatusInfo {
  const gross = positiveMoney(input.grossAmount);
  const deduction = positiveMoney(input.deductionAmount);
  const net = input.netAmount == null ? calculateStoredCommissionNet(gross, deduction) : positiveMoney(input.netAmount);
  const soldAmount = positiveMoney(input.soldAmount);
  const collectedAmount = positiveMoney(input.collectedAmount);
  const errorCount = positiveMoney(input.errorCount);
  const expectedDate = parseIsoDate(input.paymentExpectedDate);
  const today = dateOnly(input.today ?? new Date());

  if (input.isPaid || input.paidDate) {
    return { status: "paid", label: "Pagata", hint: "Compenso gia liquidato." };
  }

  if (input.hasHold) {
    return { status: "held", label: "Bloccata", hint: "Compenso trattenuto da una regola o da una condizione aperta." };
  }

  if (errorCount > 0 && deduction > 0) {
    return { status: "disputed", label: "Contestata", hint: "Sono presenti errori o malus che riducono il compenso." };
  }

  if (input.hasManualAdjustment && net > 0) {
    return { status: "approval", label: "Da approvare", hint: "Sono presenti rettifiche da verificare prima della liquidazione." };
  }

  if (input.commissionType === "percentage_collected" && collectedAmount <= 0 && soldAmount > 0) {
    return { status: "estimated", label: "Stimata", hint: "Il compenso dipende dagli incassi e non e ancora maturato." };
  }

  if (net <= 0) {
    return { status: "held", label: "Azzerata", hint: "Il netto pagabile e pari a zero." };
  }

  if (expectedDate && expectedDate > today) {
    return { status: "matured", label: "Maturata", hint: "Importo maturato, con liquidazione pianificata piu avanti." };
  }

  return { status: "payable", label: "Pagabile", hint: "Importo pronto per la prossima liquidazione." };
}

export function buildCommissionBreakdown(input: CommissionBreakdownInput): CommissionBreakdownLine[] {
  const gross = positiveMoney(input.grossAmount);
  const deduction = positiveMoney(input.deductionAmount);
  const incentives = positiveMoney(input.incentivesAmount);
  const net = input.netAmount == null ? calculateStoredCommissionNet(gross + incentives, deduction) : positiveMoney(input.netAmount);

  return [
    { label: "Base calcolata", amount: gross, kind: "base" },
    { label: "Premi e rettifiche positive", amount: incentives, kind: "bonus" },
    { label: "Malus e decurtazioni", amount: -deduction, kind: "malus" },
    { label: "Netto pagabile", amount: net, kind: "net" },
  ];
}

export function calculateCommissionMarginImpact(input: CommissionMarginImpactInput): CommissionMarginImpact {
  const revenueNet = positiveMoney(input.revenueNet);
  const variableCosts = positiveMoney(input.variableCosts);
  const commissionNet = positiveMoney(input.commissionNet);
  const marginBeforeCommission = roundMoney(revenueNet - variableCosts);
  const marginAfterCommission = roundMoney(marginBeforeCommission - commissionNet);
  const marginAfterPercent = revenueNet > 0 ? roundMoney((marginAfterCommission / revenueNet) * 100) : 0;

  let risk: CommissionMarginRisk = "healthy";
  if (marginAfterCommission < 0) risk = "critical";
  else if (marginAfterPercent < 10) risk = "warning";
  else if (marginAfterPercent < 20) risk = "watch";

  return { marginBeforeCommission, marginAfterCommission, marginAfterPercent, risk };
}

export function grossToNetAmount(grossAmount: number | string | null | undefined, vatRate?: number | string | null): number {
  const gross = money(grossAmount);
  const vat = money(vatRate);
  return gross / (1 + vat / 100);
}

export function calculateCollectedGrossFromInstallments({
  installments,
  totalAmount,
  vatRate,
  financingCost = 0,
  includeFinancing = false,
}: {
  installments: InstallmentLike[];
  totalAmount: number | string | null | undefined;
  vatRate: number | string | null | undefined;
  financingCost?: number | string | null;
  includeFinancing?: boolean;
}): number {
  const totalGross = money(totalAmount) * (1 + money(vatRate) / 100);
  const nonBalanceSum = installments
    .filter((i) => i.type !== "balance")
    .reduce((sum, i) => sum + money(i.amount), 0);
  const balanceAmount = Math.max(0, totalGross - nonBalanceSum - money(financingCost));

  return installments
    .filter((i) => i.is_paid && (includeFinancing || i.type !== "financing"))
    .reduce((sum, i) => sum + (i.type === "balance" ? balanceAmount : money(i.amount)), 0);
}

export function calculateCollectedNetFromInstallments(args: {
  installments: InstallmentLike[];
  totalAmount: number | string | null | undefined;
  vatRate: number | string | null | undefined;
  financingCost?: number | string | null;
  includeFinancing?: boolean;
}): number {
  return grossToNetAmount(calculateCollectedGrossFromInstallments(args), args.vatRate);
}
