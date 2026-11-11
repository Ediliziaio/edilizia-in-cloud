import { OperationalSummary, OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
import { CommissionContractDetails } from "./CommissionContractDetails";
import { leggiModalitaCommesse } from "@/lib/finanziamenti/leggiModalitaCommesse";
import type { ModalitaCostoFinanziaria } from "@/lib/finanziamenti/costoFinanziaria";
import { useEffect, useMemo, useState } from "react";
import { identitaBeneficiario } from "@/lib/orders/identitaBeneficiario";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  Euro,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Undo2,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { agreedContractValue, variantiApprovateDatate } from "@/lib/orders/contractValue";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCSV, type CsvColumn } from "@/lib/csvExport";

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
  financing_cost_mode?: ModalitaCostoFinanziaria | null;
  payment_type?: string | null;
  created_at: string | null;
  installments?: InstallmentLike[] | null;
  variazioni?: Parameters<typeof variantiApprovateDatate>[0] | null;
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
  currentAgreement?: string;
  gross: number;
  bonus: number;
  deductions: number;
  net: number;
  statusInfo: VariableCompensationStatusInfo;
  statusDate: string | null;
  createdAt: string;
  expectedDate: string | null;
  paidDate: string | null;
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
    // Stessa base dell'incassato della scheda commessa: contratto più varianti, saldo come residuo,
    // rata della finanziaria compresa e il suo costo solo se il pagamento è a finanziamento.
    ? calculateCollectedNetFromInstallments({
      installments: args.order.installments ?? [],
      totalAmount: agreedContractValue(totalAmount, args.order.variazioni ?? []),
      vatRate: args.order.vat_rate ?? 22,
      financingCostMode: args.order.financing_cost_mode,
      financingCost: args.order.payment_type === "financing" ? args.order.financing_cost ?? 0 : 0,
      includeFinancing: true,
      varianti: variantiApprovateDatate(args.order.variazioni ?? []),
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

export function OrderCommissionsOverview() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const readOnly = searchParams.get("commercialistaMode") === "1";
  const [liquidateTarget, setLiquidateTarget] = useState<{ name: string; rows: CompensationViewRow[]; amount: number } | null>(null);
  const [view, setView] = useState<"rows" | "beneficiaries">("rows");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateBasis, setDateBasis] = useState<"expected" | "paid" | "created">("expected");
  const [page, setPage] = useState(1);
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

  const { data: legacyRows = [], isLoading: isLoadingLegacy, error: legacyError } = useQuery({
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

  const { data: ledgerEntries = [], error: ledgerError } = useQuery({
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

  const { data: genericRows = [], isLoading: isLoadingGeneric, error: genericError } = useQuery({
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
          payment_type,
          created_at,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          installments:order_installments(position, type, amount, is_paid, paid_date, fattura:documenti_fiscali(id, importo_pagato)),
          variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)
        `)
        .eq("company_id", effectiveCompany.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) throw error;
      return leggiModalitaCommesse(effectiveCompany.id, (data ?? []) as unknown as OrderLike[]);
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
        beneficiaryId: identitaBeneficiario(row.salesperson_id, { source_type: "salesperson", source_id: row.salesperson_id }),
        beneficiaryName: fullName(row.salesperson),
        role: "Commerciale",
        order: row.order,
        customerName: customerName(row.order?.customer),
        ruleLabel: COMMISSION_TYPE_LABELS[row.commission_type] ?? row.commission_type,
        ruleDetail: formatRule(row.commission_type, row.commission_value),
        currentAgreement: row.salesperson?.compensation_mode === "fixed_only" ? "Solo fisso"
          : `${row.salesperson?.compensation_mode === "fixed_plus_commission" ? `${formatCurrency(row.salesperson.fixed_monthly_eur || 0)}/mese + ` : ""}${formatRule(row.salesperson?.commission_type, row.salesperson?.commission_value)}`,
        gross,
        bonus,
        deductions,
        net,
        statusInfo,
        statusDate: row.is_paid ? row.paid_date : row.payment_expected_date,
        createdAt: row.created_at,
        expectedDate: row.payment_expected_date,
        paidDate: row.paid_date,
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
          beneficiaryId: identitaBeneficiario(row.beneficiary_id, row.beneficiary),
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
          expectedDate: row.expected_payment_date,
          paidDate: row.paid_date,
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
        beneficiaryId: identitaBeneficiario(row.beneficiary_id, beneficiaryOptions.find((b) => b.id === row.beneficiary_id)),
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
        expectedDate: row.expected_payment_date,
        paidDate: row.paid_date,
        breakdown: buildCommissionBreakdown({
          grossAmount: row.gross_amount,
          incentivesAmount: row.bonus_amount,
          deductionAmount: row.deduction_amount,
          netAmount: row.net_amount,
        }),
      };
    });

    return [...genericViewRows, ...localViewRows, ...legacyViewRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [genericRows, ledgerByLegacyRow, legacyRows, localRows, orderOptions, beneficiaryOptions]);

  const filterBeneficiaries = useMemo(() => {
    const options = new Map<string, string>();
    viewRows.forEach((row) => options.set(row.beneficiaryId, row.beneficiaryName));
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [viewRows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return viewRows.filter((row) => {
      if (statusFilter === "unpaid" && row.statusInfo.status === "paid") return false;
      if (statusFilter !== "all" && statusFilter !== "unpaid" && row.statusInfo.status !== statusFilter) return false;
      if (beneficiaryFilter !== "all" && row.beneficiaryId !== beneficiaryFilter) return false;
      if (!isInPeriod(dateBasis === "expected" ? row.expectedDate : dateBasis === "paid" ? row.paidDate : row.createdAt, periodFilter)) return false;

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
  }, [beneficiaryFilter, periodFilter, dateBasis, search, statusFilter, viewRows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * 25, currentPage * 25);

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

  // ── Liquidazione: segna pagato/annulla per riga, gestendo le 3 sorgenti ──
  const setPaidMutation = useMutation({
    mutationFn: async ({ rows, paid, date }: { rows: CompensationViewRow[]; paid: boolean; date?: string }) => {
      if (!effectiveCompany?.id) throw new Error("company_missing");
      if (paid && rows.some((row) => row.statusInfo.status !== "payable")) throw new Error("not_payable");
      if (paid && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > format(new Date(), "yyyy-MM-dd"))) throw new Error("invalid_payment_date");
      const today = paid ? date! : null;

      if (legacyError || genericError || ledgerError) throw new Error("incomplete_data");
      const dbTargets = rows.filter((row) => row.source !== "local");
      await Promise.all(
        dbTargets.map(async (row) => {
          if (row.source === "legacy") {
            const id = row.id.replace("legacy:", "");
            const { error } = await supabase
              .from("order_salespeople")
              .update({ is_paid: paid, paid_date: today })
              .eq("id", id);
            if (error) throw error;
          } else {
            const id = row.id.replace("generic:", "");
            const { error } = await (supabase.from("order_variable_compensations" as never) as any)
              .update({ status: paid ? "paid" : "payable", paid_date: today })
              .eq("id", id);
            if (error) throw error;
          }
        }),
      );

      // Sorgente locale (demo / DB generico non disponibile)
      const localTargets = rows.filter((row) => row.source === "local").map((row) => row.id.replace("local:", ""));
      if (localTargets.length > 0) {
        const next = readLocalRows(effectiveCompany.id).map((localRow) =>
          localTargets.includes(localRow.id)
            ? { ...localRow, status: (paid ? "paid" : "payable") as VariableCompensationStatus, paid_date: today }
            : localRow,
        );
        writeLocalRows(effectiveCompany.id, next);
        setLocalRows(next);
      }

      return { count: rows.length, paid };
    },
    onSuccess: ({ count, paid }) => {
      queryClient.invalidateQueries({ queryKey: ["orders-commissions-overview", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["orders-variable-compensations", effectiveCompany?.id] });
      setLiquidateTarget(null);
      toast.success(
        paid
          ? `${count} compenso${count === 1 ? "" : "i"} segnat${count === 1 ? "o" : "i"} come pagat${count === 1 ? "o" : "i"}`
          : "Pagamento annullato",
      );
    },
    onError: () => toast.error("Operazione non riuscita"),
  });

  const openLiquidateBeneficiary = (summaryId: string, name: string) => {
    const rows = filteredRows.filter((row) => row.beneficiaryId === summaryId && row.statusInfo.status === "payable");
    if (rows.length === 0) {
      toast.info("Nessun compenso pagabile per questo beneficiario");
      return;
    }
    const amount = rows.reduce((sum, row) => sum + row.net, 0);
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setLiquidateTarget({ name, rows, amount });
  };

  // ── Export CSV ──
  const exportCompensationsCsv = () => {
    const columns: CsvColumn[] = [
      { key: "beneficiario", label: "Beneficiario" },
      { key: "ruolo", label: "Ruolo" },
      { key: "commessa", label: "Commessa" },
      { key: "cliente", label: "Cliente" },
      { key: "regola", label: "Regola" },
      { key: "lordo", label: "Lordo" },
      { key: "premi", label: "Premi" },
      { key: "decurtazioni", label: "Decurtazioni" },
      { key: "netto", label: "Netto" },
      { key: "stato", label: "Stato" },
      { key: "creato", label: "Inserito il" },
      { key: "previsto", label: "Pagamento previsto" },
      { key: "pagato", label: "Pagato il" },
    ];
    const data = filteredRows.map((row) => ({
      beneficiario: row.beneficiaryName,
      ruolo: row.role,
      commessa: orderName(row.order),
      cliente: row.customerName,
      regola: row.ruleDetail,
      lordo: String(row.gross),
      premi: String(row.bonus),
      decurtazioni: String(row.deductions),
      netto: String(row.net),
      stato: row.statusInfo.label,
      creato: formatDate(row.createdAt) ?? "",
      previsto: formatDate(row.expectedDate) ?? "",
      pagato: formatDate(row.paidDate) ?? "",
    }));
    exportToCSV(data, columns, `provvigioni_${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  const exportBeneficiariesCsv = () => {
    const columns: CsvColumn[] = [
      { key: "beneficiario", label: "Beneficiario" },
      { key: "ruolo", label: "Ruolo" },
      { key: "righe", label: "Compensi" },
      { key: "netto", label: "Netto" },
      { key: "pagabile", label: "Da liquidare" },
      { key: "pagato", label: "Pagato" },
      { key: "trattenuto", label: "Trattenuto" },
    ];
    const data = beneficiarySummaries.map((summary) => ({
      beneficiario: summary.name,
      ruolo: summary.role,
      righe: String(summary.rowsCount),
      netto: String(summary.net),
      pagabile: String(summary.payable),
      pagato: String(summary.paid),
      trattenuto: String(summary.held),
    }));
    exportToCSV(data, columns, `provvigioni_riepilogo_beneficiari_${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Provvigioni e compensi</h2>
          <p className="mt-1 text-sm text-muted-foreground">Controlla quanto spetta a ogni venditore o beneficiario e registra i pagamenti.</p>
        </div>
        {!readOnly && <Button asChild variant="outline" size="sm"><Link to="/azienda/impostazioni/persone?tab=venditori">Configura venditori</Link></Button>}
      </div>
      {(legacyError || genericError || ledgerError) && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Non è stato possibile caricare tutti i compensi. Gli importi potrebbero essere incompleti.
        <Button variant="outline" size="sm" className="ml-3" onClick={() => { queryClient.invalidateQueries({ queryKey: ["orders-commissions-overview"] }); queryClient.invalidateQueries({ queryKey: ["orders-variable-compensations"] }); queryClient.invalidateQueries({ queryKey: ["orders-commissions-overview-ledger"] }); }}>Riprova</Button>
      </div>}
      <OperationalSummary label="Riepilogo provvigioni" title="Compensi e pagamenti" icon={WalletCards} columns={3} error={!!legacyError || !!genericError || !!ledgerError} note="Importi riferiti ai filtri attivi.">
        <OperationalSummaryMetric label="Da pagare ora" isLoading={isLoading} value={formatCurrency(totals.payable)} icon={WalletCards} tone="green" />
        <OperationalSummaryMetric label="In attesa" isLoading={isLoading} value={formatCurrency(totals.held)} icon={Clock3} tone="orange" />
        <OperationalSummaryMetric label="Già pagato" isLoading={isLoading} value={formatCurrency(totals.paid)} icon={CheckCircle2} tone="blue" />
      </OperationalSummary>
      <p className="text-xs text-muted-foreground">Importi riferiti ai filtri attivi · Totale netto {formatCurrency(totals.net)} · Premi {formatCurrency(totals.bonus)} · Decurtazioni {formatCurrency(totals.deductions)}. In attesa include stime, scadenze future, verifiche e blocchi.</p>

      <Card>
        <CardContent className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:overflow-x-auto">
          <div className="relative min-w-0 lg:min-w-[180px] lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Cerca commessa, cliente o beneficiario"
              aria-label="Cerca commessa, cliente o beneficiario"
              className="pl-9 h-9"
            />
          </div>
          {/* Keep desktop filters and actions on a single line. */}
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:contents">
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); setPage(1); }}>
              <SelectTrigger aria-label="Stato del compenso" className="h-9 min-w-0 lg:w-[140px] lg:shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={beneficiaryFilter} onValueChange={(value) => { setBeneficiaryFilter(value); setPage(1); }}>
              <SelectTrigger aria-label="Beneficiario" className="h-9 min-w-0 lg:w-[170px] lg:shrink-0"><SelectValue placeholder="Beneficiario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i beneficiari</SelectItem>
                {filterBeneficiaries.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={(value) => { setPeriodFilter(value as PeriodFilter); setPage(1); }}>
              <SelectTrigger aria-label="Periodo" className="h-9 col-span-2 min-w-0 lg:w-[145px] lg:shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="current_month">Mese corrente</SelectItem>
                <SelectItem value="last_month">Mese scorso</SelectItem>
                <SelectItem value="current_year">Anno corrente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground lg:contents">
            <span className="lg:sr-only">Date riferite a:</span>
            <Select value={dateBasis} onValueChange={(value) => { setDateBasis(value as typeof dateBasis); setPage(1); }}>
              <SelectTrigger aria-label="Data di riferimento del periodo" className="h-9 w-full lg:w-[180px] lg:shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="expected">Pagamento previsto</SelectItem><SelectItem value="paid">Pagamento effettuato</SelectItem><SelectItem value="created">Inserimento compenso</SelectItem></SelectContent>
            </Select>
          </div>
          {/* Actions share the filter row on desktop. */}
          <div className="flex gap-2 lg:contents">
            {!readOnly && (
              <Button className="h-9 shrink-0 gap-2 whitespace-nowrap" onClick={openAddDialog}>
                <Plus className="h-4 w-4" />
                <span className="sm:hidden">Compenso</span>
                <span className="hidden sm:inline">Aggiungi compenso</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 shrink-0 gap-2 whitespace-nowrap" disabled={filteredRows.length === 0}>
                  <Download className="h-4 w-4" />
                  Esporta
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={exportCompensationsCsv}>
                  <FileText className="h-4 w-4 mr-2" />
                  Compensi (righe filtrate) CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportBeneficiariesCsv}>
                  <UsersRound className="h-4 w-4 mr-2" />
                  Riepilogo per beneficiario CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(search || statusFilter !== "all" || beneficiaryFilter !== "all" || periodFilter !== "all") && <Button variant="ghost" className="h-9 shrink-0 whitespace-nowrap" onClick={() => { setSearch(""); setStatusFilter("all"); setBeneficiaryFilter("all"); setPeriodFilter("all"); setPage(1); }}>Azzera filtri</Button>}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex shrink-0 gap-1 whitespace-nowrap rounded-lg border p-1" aria-label="Vista provvigioni">
          <Button size="sm" variant={view === "rows" ? "secondary" : "ghost"} aria-pressed={view === "rows"} onClick={() => setView("rows")}>Elenco compensi</Button>
          <Button size="sm" variant={view === "beneficiaries" ? "secondary" : "ghost"} aria-pressed={view === "beneficiaries"} onClick={() => setView("beneficiaries")}>Per venditore / beneficiario</Button>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">{filteredRows.length} compensi · {beneficiarySummaries.length} beneficiari</span>
      </div>
      {periodFilter !== "all" && dateBasis === "expected" && <p className="text-xs text-muted-foreground">I compensi senza una data prevista non rientrano nel periodo scelto. Seleziona “Tutti i periodi” per vederli.</p>}
      <div className="min-w-0">
        {view === "beneficiaries" && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4" />
              Beneficiari
            </CardTitle>
            <CardDescription>Commerciali, partner, tecnici o altri soggetti remunerati.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader><TableRow><TableHead>Venditore / beneficiario</TableHead><TableHead>Compensi</TableHead><TableHead className="text-right">Da pagare ora</TableHead><TableHead className="text-right">In attesa</TableHead><TableHead className="text-right">Pagato</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={6}>Caricamento…</TableCell></TableRow> : beneficiarySummaries.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center">Nessun beneficiario per questi filtri.</TableCell></TableRow> : beneficiarySummaries.map((summary) => <TableRow key={summary.id}>
                  <TableCell><div className="flex items-center gap-2"><button className="text-left font-medium text-primary hover:underline" onClick={() => { setBeneficiaryFilter(summary.id); setPage(1); setView("rows"); }}>{summary.name}</button><p className="text-xs text-muted-foreground">{summary.role}</p></div></TableCell>
                  <TableCell>{summary.rowsCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(summary.payable)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(summary.held)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(summary.paid)}</TableCell>
                  <TableCell>{!readOnly && summary.payable > 0 && <Button size="sm" variant="outline" onClick={() => openLiquidateBeneficiary(summary.id, summary.name)} disabled={setPaidMutation.isPending}>Registra pagamento</Button>}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}

        {view === "rows" && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Euro className="h-4 w-4" />
              Elenco compensi
            </CardTitle>
            <CardDescription>Una riga per compenso. Apri il dettaglio per vedere calcolo, date e situazione del pagamento.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
              <Table className="min-w-[1100px] [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td]:py-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Venditore / beneficiario</TableHead>
                    <TableHead>Commessa / contratto</TableHead>
                    <TableHead>Modalità compenso</TableHead>
                    <TableHead>Inserito il</TableHead>
                    <TableHead>Pagamento previsto</TableHead>
                    <TableHead>Pagato il</TableHead>
                    <TableHead className="text-right">Base + premi</TableHead>
                    <TableHead className="text-right">Decurtazioni</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="w-[92px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [0, 1, 2, 3, 4].map((i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={11}>
                          <div className="h-8 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                        Nessun compenso nel periodo selezionato.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button className="text-left font-medium text-primary hover:underline" onClick={() => setSelectedRowId(row.id)}>{row.beneficiaryName}</button>
                            <p className="text-xs text-muted-foreground">{row.role}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.order ? (
                            <div className="flex items-center gap-2">
                              <Link className="font-medium text-primary hover:underline" to={`/azienda/ordini/${row.order.id}`}>
                                {orderName(row.order)}
                              </Link>
                              <p className="text-xs text-muted-foreground">{row.customerName}</p>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{row.ruleDetail}</span>
                            {row.source === "local" && <Badge variant="outline">Solo su questo browser</Badge>}

                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.expectedDate) || "Da definire"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.paidDate) || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.gross + row.bonus)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.deductions)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline" className={STATUS_BADGE_CLASS[row.statusInfo.status]}>
                              {row.statusInfo.label}
                            </Badge>

                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="space-y-1">
                            <p className="font-semibold tabular-nums">{formatCurrency(row.net)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setSelectedRowId(row.id)}>Apri dettaglio</Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Azioni compenso">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setSelectedRowId(row.id)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Dettaglio
                              </DropdownMenuItem>
                              {!readOnly && (
                                <>
                                  <DropdownMenuSeparator />
                                  {row.statusInfo.status === "paid" ? (
                                    <DropdownMenuItem
                                      onClick={() => setPaidMutation.mutate({ rows: [row], paid: false })}
                                      disabled={setPaidMutation.isPending}
                                    >
                                      <Undo2 className="h-4 w-4 mr-2" />
                                      Annulla pagamento
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => { setPaymentDate(format(new Date(), "yyyy-MM-dd")); setLiquidateTarget({ name: row.beneficiaryName, rows: [row], amount: row.net }); }}
                                      disabled={setPaidMutation.isPending || row.statusInfo.status !== "payable"}
                                    >
                                      <BadgeCheck className="h-4 w-4 mr-2 text-emerald-600" />
                                      Segna come pagato
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {pageCount > 1 && <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Pagina {currentPage} di {pageCount} · {filteredRows.length} compensi</span>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Precedente</Button><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Successiva</Button></div>
            </div>}
          </CardContent>
        </Card>}
      </div>

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRowId(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          {selectedRow && (
            <>
              <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                <DialogTitle>Dettaglio compenso</DialogTitle>
                <DialogDescription>
                  {selectedRow.beneficiaryName} · {orderName(selectedRow.order)}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {selectedRow.order && <CommissionContractDetails key={selectedRow.order.id} orderId={selectedRow.order.id} />}
              <div className="border-t pt-5"><h3 className="font-semibold">Provvigione del beneficiario</h3><p className="mt-1 text-sm text-muted-foreground">{selectedRow.beneficiaryName} · {selectedRow.role}</p></div>
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
                  <p className="text-xs text-muted-foreground">Netto provvigione</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{formatCurrency(selectedRow.net)}</p>

                </div>
              </div>
              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-3">
                <div><p className="text-muted-foreground">Inserito il</p><p className="mt-1 font-medium">{formatDate(selectedRow.createdAt)}</p></div>
                <div><p className="text-muted-foreground">Pagamento previsto</p><p className="mt-1 font-medium">{formatDate(selectedRow.expectedDate) || "Da definire"}</p></div>
                <div><p className="text-muted-foreground">Pagato il</p><p className="mt-1 font-medium">{formatDate(selectedRow.paidDate) || "Non registrato"}</p></div>
              </div>
              {selectedRow.currentAgreement && <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Accordo attuale del venditore</summary><p className="mt-2">{selectedRow.currentAgreement}</p><p className="mt-1 text-xs text-muted-foreground">La riga riguarda il compenso della commessa con la regola riportata sopra; l'accordo attuale può essere diverso da quello assegnato alla commessa.</p></details>}
              {selectedRow.source === "local" && <p role="note" className="rounded-md border p-3 text-sm">Compenso di prova salvato solo in questo browser, non condiviso con gli altri dispositivi.</p>}
              {selectedRow.source !== "legacy" && <p className="text-xs text-muted-foreground">Il dettaglio mostra il calcolo registrato all'inserimento. Verifica eventuali incassi o variazioni successivi prima del pagamento.</p>}
              <div className="space-y-2">
                {selectedRow.breakdown.map((line) => (
                  <div key={line.label} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className={line.kind === "malus" ? "font-medium tabular-nums text-red-700" : line.kind === "bonus" ? "font-medium tabular-nums text-emerald-700" : "font-medium tabular-nums"}>
                      {Math.abs(line.amount) < 0.005 ? formatCurrency(0) : line.amount < 0 ? `-${formatCurrency(Math.abs(line.amount))}` : formatCurrency(line.amount)}
                    </span>
                  </div>
                ))}
              </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-6 py-4">
                {selectedRow.order && <Button asChild variant="outline"><Link to={`/azienda/ordini/${selectedRow.order.id}`}>Apri commessa / contratto</Link></Button>}
                {!readOnly && selectedRow.statusInfo.status === "payable" && <Button onClick={() => { setPaymentDate(format(new Date(), "yyyy-MM-dd")); setLiquidateTarget({ name: selectedRow.beneficiaryName, rows: [selectedRow], amount: selectedRow.net }); setSelectedRowId(null); }}>Registra pagamento</Button>}
                {!readOnly && selectedRow.statusInfo.status === "paid" && <Button variant="outline" disabled={setPaidMutation.isPending} onClick={() => setPaidMutation.mutate({ rows: [selectedRow], paid: false })}>Annulla registrazione pagamento</Button>}
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

      <Dialog open={!!liquidateTarget} onOpenChange={(open) => !open && !setPaidMutation.isPending && setLiquidateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registra pagamento</DialogTitle>
            <DialogDescription>
              Registra il pagamento già effettuato a <strong>{liquidateTarget?.name}</strong>. Questa operazione non esegue bonifici e si può annullare dal dettaglio.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Compensi pagabili</span>
              <span className="font-medium tabular-nums">{liquidateTarget?.rows.length ?? 0}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-muted-foreground">Totale netto</span>
              <span className="font-semibold tabular-nums text-emerald-700">{formatCurrency(liquidateTarget?.amount ?? 0)}</span>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm space-y-2">
            {liquidateTarget?.rows.map((row) => <div key={row.id} className="flex justify-between gap-3"><span>{orderName(row.order)}</span><span className="tabular-nums">{formatCurrency(row.net)}</span></div>)}
          </div>
          <div className="space-y-2"><Label htmlFor="commission-payment-date">Data del pagamento</Label><Input id="commission-payment-date" type="date" max={format(new Date(), "yyyy-MM-dd")} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={setPaidMutation.isPending} onClick={() => setLiquidateTarget(null)}>Annulla</Button>
            <Button
              className="gap-1.5"
              onClick={() => liquidateTarget && setPaidMutation.mutate({ rows: liquidateTarget.rows, paid: true, date: paymentDate })}
              disabled={setPaidMutation.isPending || !!legacyError || !!genericError || !!ledgerError || !paymentDate || paymentDate > format(new Date(), "yyyy-MM-dd")}
            >
              {setPaidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Conferma pagamento {formatCurrency(liquidateTarget?.amount ?? 0)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
