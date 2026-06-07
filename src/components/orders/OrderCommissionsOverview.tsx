import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Award,
  CheckCircle2,
  Clock3,
  Euro,
  FileText,
  Percent,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildCommissionBreakdown,
  calculateCollectedNetFromInstallments,
  calculateCommissionGross,
  calculateStoredCommissionNet,
  deriveVariableCompensationStatus,
  type CommissionBreakdownLine,
  type InstallmentLike,
  type VariableCompensationStatus,
  type VariableCompensationStatusInfo,
} from "@/lib/commissions";
import { formatCurrency } from "@/lib/formatters";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CommissionType = "fixed" | "percentage_sold" | "percentage_collected";
type GenericCompensationType = CommissionType | "percentage_margin" | "bonus" | "malus" | "manual";
type CompensationMode = "only_commission" | "fixed_plus_commission" | "fixed_only";
type StatusFilter = "all" | "unpaid" | VariableCompensationStatus;
type PeriodFilter = "all" | "current_month" | "last_month" | "current_year";

interface OrderLike {
  id: string;
  order_code: string | null;
  description: string | null;
  total_amount: number | null;
  vat_rate?: number | null;
  financing_cost?: number | null;
  created_at: string | null;
  installments?: InstallmentLike[] | null;
  customer: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  status?: {
    name: string | null;
    color: string | null;
  } | null;
}

interface CommissionRow {
  id: string;
  salesperson_id: string;
  commission_type: CommissionType | string;
  commission_value: number | null;
  commission_amount: number | null;
  deduction_amount: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
  payment_expected_date: string | null;
  created_at: string;
  salesperson: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    commission_type: CommissionType | string | null;
    commission_value: number | null;
    compensation_mode: CompensationMode | string | null;
    fixed_monthly_eur: number | null;
  } | null;
  order: OrderLike | null;
}

interface LedgerEntry {
  order_salesperson_id: string;
  entry_type: string;
  amount_delta: number | string | null;
}

interface CompensationBeneficiary {
  id: string;
  display_name: string;
  role: string;
  source_type?: string | null;
  source_id?: string | null;
  default_compensation_type?: GenericCompensationType | string | null;
  default_compensation_value?: number | null;
}

interface GenericCompensationRow {
  id: string;
  company_id: string;
  order_id: string;
  beneficiary_id: string;
  legacy_order_salesperson_id: string | null;
  role: string | null;
  compensation_type: GenericCompensationType | string;
  compensation_value: number | null;
  basis: string | null;
  gross_amount: number | null;
  bonus_amount: number | null;
  deduction_amount: number | null;
  net_amount: number | null;
  status: string | null;
  expected_payment_date: string | null;
  paid_date: string | null;
  created_at: string;
  beneficiary: CompensationBeneficiary | null;
  order: OrderLike | null;
}

interface LocalCompensationRow {
  id: string;
  company_id: string;
  order_id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  role: string;
  compensation_type: GenericCompensationType;
  compensation_value: number;
  gross_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  net_amount: number;
  status: VariableCompensationStatus;
  expected_payment_date: string | null;
  paid_date: string | null;
  created_at: string;
}

interface CompensationViewRow {
  id: string;
  source: "legacy" | "generic" | "local";
  beneficiaryId: string;
  beneficiaryName: string;
  role: string;
  order: OrderLike | null;
  customerName: string;
  ruleLabel: string;
  ruleDetail: string;
  gross: number;
  bonus: number;
  deductions: number;
  net: number;
  statusInfo: VariableCompensationStatusInfo;
  statusDate: string | null;
  createdAt: string;
  breakdown: CommissionBreakdownLine[];
}

interface BeneficiarySummary {
  id: string;
  name: string;
  role: string;
  rowsCount: number;
  net: number;
  payable: number;
  paid: number;
  held: number;
  bonus: number;
}

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  fixed: "Fisso",
  percentage_sold: "% venduto",
  percentage_collected: "% incassato",
  percentage_margin: "% margine",
  bonus: "Premio",
  malus: "Malus",
  manual: "Manuale",
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "Tutti gli stati",
  unpaid: "Non pagate",
  estimated: "Stimate",
  matured: "Maturate",
  held: "Bloccate",
  approval: "Da approvare",
  payable: "Pagabili",
  paid: "Pagate",
  disputed: "Contestazioni",
};

const STATUS_BADGE_CLASS: Record<VariableCompensationStatus, string> = {
  estimated: "border-slate-200 bg-slate-50 text-slate-700",
  matured: "border-amber-200 bg-amber-50 text-amber-800",
  held: "border-orange-200 bg-orange-50 text-orange-800",
  approval: "border-blue-200 bg-blue-50 text-blue-800",
  payable: "border-emerald-200 bg-emerald-50 text-emerald-800",
  paid: "border-slate-200 bg-slate-100 text-slate-700",
  disputed: "border-red-200 bg-red-50 text-red-800",
};

const ROLE_LABELS: Record<string, string> = {
  commerciale: "Commerciale",
  tecnico: "Tecnico",
  capo_cantiere: "Capo cantiere",
  call_center: "Call center",
  partner: "Partner",
  segnalatore: "Segnalatore",
  installatore: "Installatore",
  subappaltatore: "Subappaltatore",
  fornitore: "Fornitore",
  manuale: "Manuale",
};

const LOCAL_COMP_STORAGE_PREFIX = "variable_compensations:";

function numeric(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function positiveNumeric(value: number | string | null | undefined): number {
  return Math.max(0, numeric(value));
}

function fullName(person: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const name = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim();
  return name || "Beneficiario";
}

function customerName(customer: OrderLike["customer"] | null | undefined): string {
  const name = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim();
  return name || "Cliente non indicato";
}

function orderName(order: OrderLike | null | undefined): string {
  if (!order) return "Commessa";
  return order.order_code || order.description || order.id.slice(0, 8);
}

function formatRule(type?: string | null, value?: number | null): string {
  if (type === "fixed") return formatCurrency(value || 0);
  if (type === "percentage_sold") return `${numeric(value)}% su venduto`;
  if (type === "percentage_collected") return `${numeric(value)}% su incassato`;
  if (type === "percentage_margin") return `${numeric(value)}% su margine`;
  if (type === "bonus") return `Premio ${formatCurrency(value || 0)}`;
  if (type === "malus") return `Malus ${formatCurrency(value || 0)}`;
  if (type === "manual") return `Manuale ${formatCurrency(value || 0)}`;
  return "Regola non impostata";
}

function formatContract(row: CommissionRow): string {
  const salesperson = row.salesperson;
  const mode = salesperson?.compensation_mode || "only_commission";
  if (mode === "fixed_only") return "Solo fisso";
  const base = formatRule(salesperson?.commission_type, salesperson?.commission_value);
  if (mode === "fixed_plus_commission") {
    return `${formatCurrency(salesperson?.fixed_monthly_eur || 0)}/mese + ${base}`;
  }
  return base;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "dd/MM/yyyy");
}

function isInPeriod(dateIso: string | null | undefined, period: PeriodFilter): boolean {
  if (period === "all") return true;
  if (!dateIso) return false;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "current_year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  }

  if (period === "last_month") {
    start.setMonth(now.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  }

  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  end.setMonth(now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return date >= start && date <= end;
}

function rowPeriodDate(row: CompensationViewRow): string | null {
  return row.statusDate || row.createdAt || null;
}

function positiveAdjustments(entries: LedgerEntry[]): number {
  const relevantTypes = new Set(["manual_bonus", "manual_adjustment", "ai_adjustment"]);
  return entries.reduce((sum, entry) => {
    const amount = numeric(entry.amount_delta);
    if (!relevantTypes.has(entry.entry_type) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
}

function hasApprovalAdjustment(entries: LedgerEntry[]): boolean {
  return entries.some((entry) => ["manual_adjustment", "ai_adjustment"].includes(entry.entry_type));
}

function isMissingOptionalTable(error: { code?: string } | null): boolean {
  return !!error && ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "");
}

function storageKey(companyId: string): string {
  return `${LOCAL_COMP_STORAGE_PREFIX}${companyId}`;
}

function readLocalRows(companyId?: string): LocalCompensationRow[] {
  if (!companyId || typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(companyId)) || "[]") as LocalCompensationRow[];
  } catch {
    return [];
  }
}

function writeLocalRows(companyId: string, rows: LocalCompensationRow[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(rows));
}

function shouldUseLocalFallback(error?: { code?: string } | null): boolean {
  if (error) return isMissingOptionalTable(error);
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function makeId(prefix = "local"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusInfoFromStoredStatus(status: string | null | undefined, net: number): VariableCompensationStatusInfo {
  const normalized = status === "cancelled" ? "held" : status;
  if (normalized === "paid") return { status: "paid", label: "Pagata", hint: "Compenso gia liquidato." };
  if (normalized === "payable") return { status: "payable", label: "Pagabile", hint: "Importo pronto per la prossima liquidazione." };
  if (normalized === "matured") return { status: "matured", label: "Maturata", hint: "Importo maturato, con liquidazione pianificata." };
  if (normalized === "approval") return { status: "approval", label: "Da approvare", hint: "Rettifica o compenso da verificare." };
  if (normalized === "disputed") return { status: "disputed", label: "Contestata", hint: "Sono presenti contestazioni o malus." };
  if (normalized === "estimated") return { status: "estimated", label: "Stimata", hint: "Importo stimato, non ancora maturato." };
  if (normalized === "held" || net <= 0) return { status: "held", label: net <= 0 ? "Azzerata" : "Bloccata", hint: "Compenso trattenuto o non liquidabile." };
  return { status: "payable", label: "Pagabile", hint: "Importo pronto per la prossima liquidazione." };
}

function calculateDraftAmounts(args: {
  order: OrderLike | null;
  type: GenericCompensationType;
  value: number;
  bonus: number;
  deduction: number;
}) {
  const totalAmount = numeric(args.order?.total_amount);
  const collectedAmount = args.type === "percentage_collected" && args.order
    ? calculateCollectedNetFromInstallments({
      installments: args.order.installments ?? [],
      totalAmount,
      vatRate: args.order.vat_rate ?? 22,
      financingCost: args.order.financing_cost ?? 0,
    })
    : totalAmount;
  const value = positiveNumeric(args.value);
  const extraBonus = positiveNumeric(args.bonus);
  const extraDeduction = positiveNumeric(args.deduction);
  const gross = args.type === "bonus"
    ? 0
    : args.type === "malus"
      ? 0
      : args.type === "manual"
        ? value
        : calculateCommissionGross({
          commissionType: args.type,
          commissionValue: value,
          totalAmount,
          collectedAmount,
        });
  const bonus = args.type === "bonus" ? value + extraBonus : extraBonus;
  const deduction = args.type === "malus" ? value + extraDeduction : extraDeduction;
  return {
    gross,
    bonus,
    deduction,
    net: calculateStoredCommissionNet(gross + bonus, deduction),
    collectedAmount,
  };
}

function deriveDraftStatus(args: {
  order: OrderLike | null;
  type: GenericCompensationType;
  amounts: ReturnType<typeof calculateDraftAmounts>;
  expectedPaymentDate: string;
}): VariableCompensationStatus {
  const totalAmount = numeric(args.order?.total_amount);
  const hasAdjustment = args.type === "manual"
    || args.type === "bonus"
    || args.type === "malus"
    || args.amounts.bonus > 0
    || args.amounts.deduction > 0;
  return deriveVariableCompensationStatus({
    commissionType: args.type,
    grossAmount: args.amounts.gross + args.amounts.bonus,
    deductionAmount: args.amounts.deduction,
    netAmount: args.amounts.net,
    soldAmount: totalAmount,
    collectedAmount: args.amounts.collectedAmount,
    paymentExpectedDate: args.expectedPaymentDate || null,
    errorCount: args.type === "malus" || args.amounts.deduction > 0 ? 1 : 0,
    hasManualAdjustment: hasAdjustment,
  }).status;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "green" | "orange" | "red" | "blue";
  hint?: string;
}) {
  const toneClass = tone === "green"
    ? "text-emerald-700 bg-emerald-50"
    : tone === "red"
      ? "text-red-700 bg-red-50"
      : tone === "orange"
        ? "text-orange-700 bg-orange-50"
        : tone === "blue"
          ? "text-blue-700 bg-blue-50"
          : "text-slate-700 bg-slate-50";

  return (
    <Card>
      <CardContent className="flex min-h-[80px] sm:min-h-[104px] items-center justify-between gap-2 sm:gap-3 p-2.5 sm:p-4">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-0.5 sm:mt-1 truncate text-base sm:text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="hidden sm:block mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`shrink-0 rounded-md p-1.5 sm:p-2 ${toneClass}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function OrderCommissionsOverview() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");
  const [newBeneficiaryName, setNewBeneficiaryName] = useState("");
  const [newBeneficiaryRole, setNewBeneficiaryRole] = useState("segnalatore");
  const [compensationType, setCompensationType] = useState<GenericCompensationType>("percentage_sold");
  const [compensationValue, setCompensationValue] = useState("3");
  const [bonusAmount, setBonusAmount] = useState("0");
  const [deductionAmount, setDeductionAmount] = useState("0");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [localRows, setLocalRows] = useState<LocalCompensationRow[]>([]);

  useEffect(() => {
    setLocalRows(readLocalRows(effectiveCompany?.id));
  }, [effectiveCompany?.id]);

  const { data: legacyRows = [], isLoading: isLoadingLegacy } = useQuery({
    queryKey: ["orders-commissions-overview", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];

      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id,
          salesperson_id,
          commission_type,
          commission_value,
          commission_amount,
          deduction_amount,
          is_paid,
          paid_date,
          payment_expected_date,
          created_at,
          salesperson:salespeople(id, first_name, last_name, commission_type, commission_value, compensation_mode, fixed_monthly_eur),
          order:orders!inner(
            id,
            order_code,
            description,
            total_amount,
            vat_rate,
            financing_cost,
            created_at,
            company_id,
            customer:profiles!orders_customer_id_fkey(first_name, last_name),
            status:order_statuses!orders_current_status_id_fkey(name, color)
          )
        `)
        .eq("order.company_id", effectiveCompany.id)
        .order("created_at", { ascending: false })
        .limit(2500);

      if (error) throw error;
      return (data ?? []) as unknown as CommissionRow[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const legacyRowIds = useMemo(() => legacyRows.map((row) => row.id), [legacyRows]);

  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ["orders-commissions-overview-ledger", effectiveCompany?.id, legacyRowIds],
    queryFn: async () => {
      if (!effectiveCompany?.id || legacyRowIds.length === 0) return [];

      const { data, error } = await supabase
        .from("order_commission_ledger" as never)
        .select("order_salesperson_id, entry_type, amount_delta")
        .eq("company_id", effectiveCompany.id)
        .in("order_salesperson_id", legacyRowIds as never);

      if (error) {
        if (isMissingOptionalTable(error)) return [];
        throw error;
      }

      return (data ?? []) as unknown as LedgerEntry[];
    },
    enabled: !!effectiveCompany?.id && legacyRowIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: genericRows = [], isLoading: isLoadingGeneric } = useQuery({
    queryKey: ["orders-variable-compensations", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];

      const { data, error } = await (supabase.from("order_variable_compensations" as never) as any)
        .select(`
          id,
          company_id,
          order_id,
          beneficiary_id,
          legacy_order_salesperson_id,
          role,
          compensation_type,
          compensation_value,
          basis,
          gross_amount,
          bonus_amount,
          deduction_amount,
          net_amount,
          status,
          expected_payment_date,
          paid_date,
          created_at,
          beneficiary:compensation_beneficiaries(id, display_name, role, source_type, source_id, default_compensation_type, default_compensation_value),
          order:orders!inner(
            id,
            order_code,
            description,
            total_amount,
            vat_rate,
            financing_cost,
            created_at,
            company_id,
            customer:profiles!orders_customer_id_fkey(first_name, last_name),
            status:order_statuses!orders_current_status_id_fkey(name, color)
          )
        `)
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false })
        .limit(2500);

      if (error) {
        if (shouldUseLocalFallback(error)) return [];
        throw error;
      }

      return (data ?? []) as GenericCompensationRow[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbBeneficiaries = [] } = useQuery({
    queryKey: ["compensation-beneficiaries", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await (supabase.from("compensation_beneficiaries" as never) as any)
        .select("id, display_name, role, source_type, source_id, default_compensation_type, default_compensation_value")
        .eq("company_id", effectiveCompany.id)
        .eq("is_active", true)
        .order("display_name");

      if (error) {
        if (shouldUseLocalFallback(error)) return [];
        throw error;
      }

      return (data ?? []) as CompensationBeneficiary[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: orderOptions = [] } = useQuery({
    queryKey: ["orders-for-variable-compensation", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          description,
          total_amount,
          vat_rate,
          financing_cost,
          created_at,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          installments:order_installments(type, amount, is_paid)
        `)
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) throw error;
      return (data ?? []) as unknown as OrderLike[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const ledgerByLegacyRow = useMemo(() => {
    const groups = new Map<string, LedgerEntry[]>();
    ledgerEntries.forEach((entry) => {
      const existing = groups.get(entry.order_salesperson_id) ?? [];
      existing.push(entry);
      groups.set(entry.order_salesperson_id, existing);
    });
    return groups;
  }, [ledgerEntries]);

  const legacyBeneficiaries = useMemo<CompensationBeneficiary[]>(() => {
    const map = new Map<string, CompensationBeneficiary>();
    legacyRows.forEach((row) => {
      if (map.has(`salesperson:${row.salesperson_id}`)) return;
      map.set(`salesperson:${row.salesperson_id}`, {
        id: `salesperson:${row.salesperson_id}`,
        display_name: fullName(row.salesperson),
        role: "commerciale",
        source_type: "salesperson",
        source_id: row.salesperson_id,
        default_compensation_type: row.salesperson?.commission_type ?? row.commission_type,
        default_compensation_value: row.salesperson?.commission_value ?? row.commission_value,
      });
    });
    return [...map.values()];
  }, [legacyRows]);

  const beneficiaryOptions = useMemo(() => {
    const map = new Map<string, CompensationBeneficiary>();
    dbBeneficiaries.forEach((beneficiary) => map.set(beneficiary.id, beneficiary));
    legacyBeneficiaries.forEach((beneficiary) => {
      if (![...map.values()].some((dbBeneficiary) => dbBeneficiary.source_type === beneficiary.source_type && dbBeneficiary.source_id === beneficiary.source_id)) {
        map.set(beneficiary.id, beneficiary);
      }
    });
    return [...map.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [dbBeneficiaries, legacyBeneficiaries]);

  const viewRows = useMemo<CompensationViewRow[]>(() => {
    const legacyViewRows = legacyRows.map((row): CompensationViewRow => {
      const ledger = ledgerByLegacyRow.get(row.id) ?? [];
      const bonus = positiveAdjustments(ledger);
      const gross = numeric(row.commission_amount);
      const deductions = numeric(row.deduction_amount);
      const net = calculateStoredCommissionNet(gross + bonus, deductions);
      const statusInfo = deriveVariableCompensationStatus({
        commissionType: row.commission_type,
        grossAmount: gross,
        deductionAmount: deductions,
        netAmount: net,
        soldAmount: row.order?.total_amount,
        collectedAmount: row.commission_type === "percentage_collected" ? gross : row.order?.total_amount,
        isPaid: row.is_paid,
        paidDate: row.paid_date,
        paymentExpectedDate: row.payment_expected_date,
        hasManualAdjustment: hasApprovalAdjustment(ledger),
      });

      return {
        id: `legacy:${row.id}`,
        source: "legacy",
        beneficiaryId: row.salesperson_id,
        beneficiaryName: fullName(row.salesperson),
        role: "Commerciale",
        order: row.order,
        customerName: customerName(row.order?.customer),
        ruleLabel: COMMISSION_TYPE_LABELS[row.commission_type] ?? row.commission_type,
        ruleDetail: formatContract(row),
        gross,
        bonus,
        deductions,
        net,
        statusInfo,
        statusDate: row.is_paid ? row.paid_date : row.payment_expected_date,
        createdAt: row.created_at,
        breakdown: buildCommissionBreakdown({
          grossAmount: gross,
          incentivesAmount: bonus,
          deductionAmount: deductions,
          netAmount: net,
        }),
      };
    });

    const genericViewRows = genericRows
      .filter((row) => !row.legacy_order_salesperson_id)
      .map((row): CompensationViewRow => {
        const gross = numeric(row.gross_amount);
        const bonus = numeric(row.bonus_amount);
        const deductions = numeric(row.deduction_amount);
        const net = row.net_amount == null ? calculateStoredCommissionNet(gross + bonus, deductions) : numeric(row.net_amount);
        return {
          id: `generic:${row.id}`,
          source: "generic",
          beneficiaryId: row.beneficiary_id,
          beneficiaryName: row.beneficiary?.display_name || "Beneficiario",
          role: ROLE_LABELS[row.role || row.beneficiary?.role || "manuale"] ?? row.role ?? "Manuale",
          order: row.order,
          customerName: customerName(row.order?.customer),
          ruleLabel: COMMISSION_TYPE_LABELS[row.compensation_type] ?? row.compensation_type,
          ruleDetail: formatRule(row.compensation_type, row.compensation_value),
          gross,
          bonus,
          deductions,
          net,
          statusInfo: statusInfoFromStoredStatus(row.status, net),
          statusDate: row.paid_date || row.expected_payment_date,
          createdAt: row.created_at,
          breakdown: buildCommissionBreakdown({
            grossAmount: gross,
            incentivesAmount: bonus,
            deductionAmount: deductions,
            netAmount: net,
          }),
        };
      });

    const orderMap = new Map<string, OrderLike>();
    [...legacyRows.map((row) => row.order), ...genericRows.map((row) => row.order), ...orderOptions].forEach((order) => {
      if (order) orderMap.set(order.id, order);
    });

    const localViewRows = localRows.map((row): CompensationViewRow => {
      const order = orderMap.get(row.order_id) ?? null;
      return {
        id: `local:${row.id}`,
        source: "local",
        beneficiaryId: row.beneficiary_id,
        beneficiaryName: row.beneficiary_name,
        role: ROLE_LABELS[row.role] ?? row.role,
        order,
        customerName: customerName(order?.customer),
        ruleLabel: COMMISSION_TYPE_LABELS[row.compensation_type] ?? row.compensation_type,
        ruleDetail: formatRule(row.compensation_type, row.compensation_value),
        gross: row.gross_amount,
        bonus: row.bonus_amount,
        deductions: row.deduction_amount,
        net: row.net_amount,
        statusInfo: statusInfoFromStoredStatus(row.status, row.net_amount),
        statusDate: row.paid_date || row.expected_payment_date,
        createdAt: row.created_at,
        breakdown: buildCommissionBreakdown({
          grossAmount: row.gross_amount,
          incentivesAmount: row.bonus_amount,
          deductionAmount: row.deduction_amount,
          netAmount: row.net_amount,
        }),
      };
    });

    return [...genericViewRows, ...localViewRows, ...legacyViewRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [genericRows, ledgerByLegacyRow, legacyRows, localRows, orderOptions]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return viewRows.filter((row) => {
      if (statusFilter === "unpaid" && row.statusInfo.status === "paid") return false;
      if (statusFilter !== "all" && statusFilter !== "unpaid" && row.statusInfo.status !== statusFilter) return false;
      if (beneficiaryFilter !== "all" && row.beneficiaryId !== beneficiaryFilter) return false;
      if (!isInPeriod(rowPeriodDate(row), periodFilter)) return false;

      if (!needle) return true;
      const haystack = [
        row.beneficiaryName,
        row.role,
        row.order?.order_code,
        row.order?.description,
        row.customerName,
        row.statusInfo.label,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [beneficiaryFilter, periodFilter, search, statusFilter, viewRows]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.gross += row.gross;
        acc.bonus += row.bonus;
        acc.deductions += row.deductions;
        acc.net += row.net;
        if (row.statusInfo.status === "paid") acc.paid += row.net;
        else acc.unpaid += row.net;
        if (row.statusInfo.status === "payable") acc.payable += row.net;
        if (["estimated", "matured", "held", "approval", "disputed"].includes(row.statusInfo.status)) acc.held += row.net;
        return acc;
      },
      { gross: 0, bonus: 0, deductions: 0, net: 0, paid: 0, unpaid: 0, payable: 0, held: 0 }
    );
  }, [filteredRows]);

  const beneficiarySummaries = useMemo(() => {
    const map = new Map<string, BeneficiarySummary>();

    filteredRows.forEach((row) => {
      const existing = map.get(row.beneficiaryId) ?? {
        id: row.beneficiaryId,
        name: row.beneficiaryName,
        role: row.role,
        rowsCount: 0,
        net: 0,
        payable: 0,
        paid: 0,
        held: 0,
        bonus: 0,
      };

      existing.rowsCount += 1;
      existing.net += row.net;
      existing.bonus += row.bonus;
      if (row.statusInfo.status === "paid") existing.paid += row.net;
      else if (row.statusInfo.status === "payable") existing.payable += row.net;
      else existing.held += row.net;
      map.set(row.beneficiaryId, existing);
    });

    return [...map.values()].sort((a, b) => b.payable - a.payable || b.net - a.net);
  }, [filteredRows]);

  const selectedRow = selectedRowId ? viewRows.find((row) => row.id === selectedRowId) ?? null : null;
  const selectedOrder = orderOptions.find((order) => order.id === selectedOrderId) ?? viewRows.find((row) => row.order?.id === selectedOrderId)?.order ?? null;
  const draftAmounts = calculateDraftAmounts({
    order: selectedOrder,
    type: compensationType,
    value: numeric(compensationValue),
    bonus: numeric(bonusAmount),
    deduction: numeric(deductionAmount),
  });
  const draftStatus = deriveDraftStatus({
    order: selectedOrder,
    type: compensationType,
    amounts: draftAmounts,
    expectedPaymentDate,
  });
  const hasDraftAmount = draftAmounts.gross + draftAmounts.bonus + draftAmounts.deduction > 0;
  const hasDeferredPercentageRule = compensationType === "percentage_collected"
    && positiveNumeric(compensationValue) > 0
    && numeric(selectedOrder?.total_amount) > 0;
  const hasBeneficiary = selectedBeneficiaryId === "__new__"
    ? newBeneficiaryName.trim().length > 0
    : selectedBeneficiaryId.length > 0;
  const canSaveCompensation = !!selectedOrder && hasBeneficiary && (hasDraftAmount || hasDeferredPercentageRule);

  const isLoading = isLoadingLegacy || isLoadingGeneric;

  useEffect(() => {
    if (!addDialogOpen || selectedOrderId || orderOptions.length === 0) return;
    setSelectedOrderId(orderOptions[0].id);
  }, [addDialogOpen, orderOptions, selectedOrderId]);

  useEffect(() => {
    if (!addDialogOpen || selectedBeneficiaryId) return;
    setSelectedBeneficiaryId(beneficiaryOptions[0]?.id || "__new__");
  }, [addDialogOpen, beneficiaryOptions, selectedBeneficiaryId]);

  const saveCompensationMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("company_missing");
      const order = selectedOrder;
      if (!order) throw new Error("order_missing");
      const role = selectedBeneficiaryId === "__new__"
        ? newBeneficiaryRole
        : beneficiaryOptions.find((beneficiary) => beneficiary.id === selectedBeneficiaryId)?.role || "manuale";
      const displayName = selectedBeneficiaryId === "__new__"
        ? newBeneficiaryName.trim()
        : beneficiaryOptions.find((beneficiary) => beneficiary.id === selectedBeneficiaryId)?.display_name || "";

      if (!displayName) throw new Error("beneficiary_missing");

      const localRow: LocalCompensationRow = {
        id: makeId("comp"),
        company_id: effectiveCompany.id,
        order_id: order.id,
        beneficiary_id: selectedBeneficiaryId === "__new__" ? makeId("beneficiary") : selectedBeneficiaryId,
        beneficiary_name: displayName,
        role,
        compensation_type: compensationType,
        compensation_value: positiveNumeric(compensationValue),
        gross_amount: draftAmounts.gross,
        bonus_amount: draftAmounts.bonus,
        deduction_amount: draftAmounts.deduction,
        net_amount: draftAmounts.net,
        status: draftStatus,
        expected_payment_date: expectedPaymentDate || null,
        paid_date: null,
        created_at: new Date().toISOString(),
      };

      let beneficiaryId = selectedBeneficiaryId;

      if (selectedBeneficiaryId === "__new__" || selectedBeneficiaryId.startsWith("salesperson:")) {
        const beneficiaryPayload = {
          company_id: effectiveCompany.id,
          source_type: selectedBeneficiaryId.startsWith("salesperson:") ? "salesperson" : "manual",
          source_id: selectedBeneficiaryId.startsWith("salesperson:") ? selectedBeneficiaryId.replace("salesperson:", "") : null,
          display_name: displayName,
          role,
          default_compensation_type: compensationType,
          default_compensation_value: positiveNumeric(compensationValue),
          is_active: true,
        };
        const { data, error } = await (supabase.from("compensation_beneficiaries" as never) as any)
          .upsert(beneficiaryPayload, { onConflict: "company_id,source_type,source_id" })
          .select("id")
          .single();

        if (error) {
          if (shouldUseLocalFallback(error)) throw error;
          throw error;
        }
        beneficiaryId = data.id;
      }

      const { error } = await (supabase.from("order_variable_compensations" as never) as any).insert({
        company_id: effectiveCompany.id,
        order_id: order.id,
        beneficiary_id: beneficiaryId,
        role,
        compensation_type: compensationType,
        compensation_value: positiveNumeric(compensationValue),
        basis: compensationType === "percentage_collected"
          ? "collected"
          : compensationType === "percentage_margin"
            ? "margin"
            : compensationType === "malus"
              ? "errors"
              : ["fixed", "manual", "bonus"].includes(compensationType)
                ? "manual"
                : "sold",
        rule_snapshot: {
          source: "overview_dialog",
          compensation_type: compensationType,
          compensation_value: positiveNumeric(compensationValue),
          collected_amount: draftAmounts.collectedAmount,
        },
        gross_amount: draftAmounts.gross,
        bonus_amount: draftAmounts.bonus,
        deduction_amount: draftAmounts.deduction,
        net_amount: draftAmounts.net,
        status: draftStatus,
        expected_payment_date: expectedPaymentDate || null,
      });

      if (error) {
        if (shouldUseLocalFallback(error)) throw error;
        throw error;
      }

      return { savedToDb: true, localRow };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders-variable-compensations", effectiveCompany?.id] });
      await queryClient.invalidateQueries({ queryKey: ["compensation-beneficiaries", effectiveCompany?.id] });
      toast.success("Compenso aggiunto");
      setAddDialogOpen(false);
    },
    onError: (error) => {
      if (!effectiveCompany?.id) {
        toast.error("Impossibile aggiungere il compenso");
        return;
      }

      if (shouldUseLocalFallback(error as { code?: string })) {
        const order = selectedOrder;
        const displayName = selectedBeneficiaryId === "__new__"
          ? newBeneficiaryName.trim()
          : beneficiaryOptions.find((beneficiary) => beneficiary.id === selectedBeneficiaryId)?.display_name || "";
        if (!order || !displayName) {
          toast.error("Seleziona commessa e beneficiario");
          return;
        }
        const role = selectedBeneficiaryId === "__new__"
          ? newBeneficiaryRole
          : beneficiaryOptions.find((beneficiary) => beneficiary.id === selectedBeneficiaryId)?.role || "manuale";
        const localRow: LocalCompensationRow = {
          id: makeId("comp"),
          company_id: effectiveCompany.id,
          order_id: order.id,
          beneficiary_id: selectedBeneficiaryId === "__new__" ? makeId("beneficiary") : selectedBeneficiaryId,
          beneficiary_name: displayName,
          role,
          compensation_type: compensationType,
          compensation_value: positiveNumeric(compensationValue),
          gross_amount: draftAmounts.gross,
          bonus_amount: draftAmounts.bonus,
          deduction_amount: draftAmounts.deduction,
          net_amount: draftAmounts.net,
          status: draftStatus,
          expected_payment_date: expectedPaymentDate || null,
          paid_date: null,
          created_at: new Date().toISOString(),
        };
        const next = [localRow, ...localRows];
        writeLocalRows(effectiveCompany.id, next);
        setLocalRows(next);
        toast.success("Compenso aggiunto in locale", {
          description: "Il DB generico non e ancora disponibile: lo tengo nel browser per la demo locale.",
        });
        setAddDialogOpen(false);
        return;
      }

      toast.error("Impossibile aggiungere il compenso");
    },
  });

  function resetAddDialog() {
    setSelectedOrderId(orderOptions[0]?.id || "");
    setSelectedBeneficiaryId(beneficiaryOptions[0]?.id || "__new__");
    setNewBeneficiaryName("");
    setNewBeneficiaryRole("segnalatore");
    setCompensationType("percentage_sold");
    setCompensationValue("3");
    setBonusAmount("0");
    setDeductionAmount("0");
    setExpectedPaymentDate("");
  }

  function openAddDialog() {
    resetAddDialog();
    setAddDialogOpen(true);
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid gap-2 sm:gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Da liquidare" value={formatCurrency(totals.payable)} icon={WalletCards} tone="green" />
        <KpiCard label="In maturazione" value={formatCurrency(totals.held)} icon={Clock3} tone="orange" />
        <KpiCard label="Pagate" value={formatCurrency(totals.paid)} icon={CheckCircle2} tone="green" />
        <KpiCard label="Totale netto" value={formatCurrency(totals.net)} icon={Euro} tone="blue" />
        <KpiCard label="Premi/Rett." value={formatCurrency(totals.bonus)} icon={Award} tone="green" />
        <KpiCard label="Decurtazioni" value={formatCurrency(totals.deductions)} icon={Percent} tone="red" />
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          {/* Search full-row */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca commessa, cliente o beneficiario"
              aria-label="Cerca commessa, cliente o beneficiario"
              className="pl-9 h-10"
            />
          </div>
          {/* Selects: 2x2 grid mobile, 1 row desktop */}
          <div className="mt-3 grid gap-2 grid-cols-2 lg:grid-cols-[180px_220px_180px] lg:gap-3 min-w-0">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="h-10 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={beneficiaryFilter} onValueChange={setBeneficiaryFilter}>
              <SelectTrigger className="h-10 min-w-0"><SelectValue placeholder="Beneficiario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i beneficiari</SelectItem>
                {beneficiarySummaries.map((summary) => (
                  <SelectItem key={summary.id} value={summary.id}>{summary.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
              <SelectTrigger className="h-10 col-span-2 lg:col-span-1 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="current_month">Mese corrente</SelectItem>
                <SelectItem value="last_month">Mese scorso</SelectItem>
                <SelectItem value="current_year">Anno corrente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Actions: primary full-width mobile, secondary outline */}
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <Button className="gap-2 h-10 flex-1 sm:flex-none" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Compenso</span>
              <span className="hidden sm:inline">Aggiungi compenso</span>
            </Button>
            <Button asChild variant="outline" className="gap-2 h-10 flex-1 sm:flex-none">
              <Link to="/azienda/impostazioni/persone?tab=venditori">
                <Sparkles className="h-4 w-4" />
                Regole AI
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4" />
              Beneficiari
            </CardTitle>
            <CardDescription>Commerciali, partner, tecnici o altri soggetti remunerati.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : beneficiarySummaries.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessun compenso trovato.
              </div>
            ) : (
              beneficiarySummaries.map((summary) => (
                <div key={summary.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{summary.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{summary.role}</p>
                    </div>
                    <Badge variant={summary.payable > 0 ? "default" : "secondary"}>
                      {summary.rowsCount}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Netto</p>
                      <p className="font-semibold tabular-nums">{formatCurrency(summary.net)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Liquidabile</p>
                      <p className="font-semibold tabular-nums text-emerald-700">{formatCurrency(summary.payable)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pagato</p>
                      <p className="font-semibold tabular-nums">{formatCurrency(summary.paid)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Trattenuto</p>
                      <p className="font-semibold tabular-nums text-orange-700">{formatCurrency(summary.held)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Euro className="h-4 w-4" />
              Compensi variabili commesse
            </CardTitle>
            <CardDescription>Include storico venditori e nuovi compensi generici.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Beneficiario</TableHead>
                    <TableHead>Commessa</TableHead>
                    <TableHead>Regola</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="w-[92px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [0, 1, 2, 3, 4].map((i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <div className="h-8 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        Nessun compenso nel periodo selezionato.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{row.beneficiaryName}</p>
                            <p className="text-xs text-muted-foreground">{row.role}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.order ? (
                            <div className="space-y-1">
                              <Link className="font-medium text-primary hover:underline" to={`/azienda/ordini/${row.order.id}`}>
                                {orderName(row.order)}
                              </Link>
                              <p className="text-xs text-muted-foreground">{row.customerName}</p>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline">{row.ruleLabel}</Badge>
                            <p className="text-xs text-muted-foreground">{row.ruleDetail}</p>
                            {row.source !== "legacy" && (
                              <p className="text-xs text-blue-700">Compenso generico</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline" className={STATUS_BADGE_CLASS[row.statusInfo.status]}>
                              {row.statusInfo.label}
                            </Badge>
                            {row.statusDate && <p className="text-xs text-muted-foreground">{formatDate(row.statusDate)}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="space-y-1">
                            <p className="font-semibold tabular-nums">{formatCurrency(row.net)}</p>
                            {row.deductions > 0 && <p className="text-xs tabular-nums text-red-700">-{formatCurrency(row.deductions)}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setSelectedRowId(row.id)}
                          >
                            <FileText className="h-4 w-4" />
                            Dettaglio
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRowId(null)}>
        <DialogContent className="max-w-2xl">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle>Dettaglio compenso</DialogTitle>
                <DialogDescription>
                  {selectedRow.beneficiaryName} · {orderName(selectedRow.order)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Stato</p>
                  <Badge variant="outline" className={`mt-2 ${STATUS_BADGE_CLASS[selectedRow.statusInfo.status]}`}>
                    {selectedRow.statusInfo.label}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">{selectedRow.statusInfo.hint}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Regola</p>
                  <p className="mt-2 font-medium">{selectedRow.ruleLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedRow.ruleDetail}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Origine</p>
                  <p className="mt-2 font-medium">{selectedRow.source === "legacy" ? "Storico venditori" : selectedRow.source === "generic" ? "Compensi generici DB" : "Locale demo"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedRow.role}</p>
                </div>
              </div>
              <div className="space-y-2">
                {selectedRow.breakdown.map((line) => (
                  <div key={line.label} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className={line.kind === "malus" ? "font-medium tabular-nums text-red-700" : line.kind === "bonus" ? "font-medium tabular-nums text-emerald-700" : "font-medium tabular-nums"}>
                      {line.amount < 0 ? `-${formatCurrency(Math.abs(line.amount))}` : formatCurrency(line.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aggiungi compenso variabile</DialogTitle>
            <DialogDescription>
              Assegna un premio, una provvigione o un compenso a qualunque beneficiario collegato alla commessa.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Commessa</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona commessa" />
                </SelectTrigger>
                <SelectContent>
                  {orderOptions.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {orderName(order)} · {formatCurrency(order.total_amount || 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Beneficiario</Label>
              <Select value={selectedBeneficiaryId} onValueChange={setSelectedBeneficiaryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona beneficiario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">Nuovo beneficiario</SelectItem>
                  {beneficiaryOptions.map((beneficiary) => (
                    <SelectItem key={beneficiary.id} value={beneficiary.id}>
                      {beneficiary.display_name} · {ROLE_LABELS[beneficiary.role] ?? beneficiary.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBeneficiaryId === "__new__" && (
              <>
                <div className="space-y-2">
                  <Label>Nome beneficiario</Label>
                  <Input value={newBeneficiaryName} onChange={(event) => setNewBeneficiaryName(event.target.value)} placeholder="Es. Partner Rossi" />
                </div>
                <div className="space-y-2">
                  <Label>Ruolo</Label>
                  <Select value={newBeneficiaryRole} onValueChange={setNewBeneficiaryRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Tipo compenso</Label>
              <Select value={compensationType} onValueChange={(value) => setCompensationType(value as GenericCompensationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Importo fisso</SelectItem>
                  <SelectItem value="percentage_sold">% sul venduto</SelectItem>
                  <SelectItem value="percentage_collected">% sull'incassato</SelectItem>
                  <SelectItem value="bonus">Premio</SelectItem>
                  <SelectItem value="malus">Malus</SelectItem>
                  <SelectItem value="manual">Manuale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{compensationType.includes("percentage") ? "Percentuale" : "Importo"}</Label>
              <Input type="number" min="0" step={compensationType.includes("percentage") ? "0.1" : "0.01"} value={compensationValue} onChange={(event) => setCompensationValue(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Premio extra</Label>
              <Input type="number" min="0" step="0.01" value={bonusAmount} onChange={(event) => setBonusAmount(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Decurtazione</Label>
              <Input type="number" min="0" step="0.01" value={deductionAmount} onChange={(event) => setDeductionAmount(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Data prevista pagamento</Label>
              <Input type="date" value={expectedPaymentDate} onChange={(event) => setExpectedPaymentDate(event.target.value)} />
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Simulazione netto</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(draftAmounts.net)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Base {formatCurrency(draftAmounts.gross)} · Premi {formatCurrency(draftAmounts.bonus)} · Decurt. {formatCurrency(draftAmounts.deduction)}
              </p>
              {compensationType === "percentage_collected" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Incassato netto rilevato {formatCurrency(draftAmounts.collectedAmount)}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => saveCompensationMutation.mutate()} disabled={saveCompensationMutation.isPending || !canSaveCompensation}>
              Salva compenso
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
