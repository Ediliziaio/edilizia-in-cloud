import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import MargineVociDetail from "@/components/marginalita/MargineVociDetail";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { leggiTutteLeRighe } from "@/lib/impostazioni/usoTag";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeMargineCard } from "@/components/sedi/SedeMargineCard";
import { useSediAnalytics } from "@/hooks/useSediAnalytics";
import { useCompanyStructure } from "@/hooks/controlloGestione/useCompanyStructure";
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { calculateOrderStructureImpact } from "@/lib/controlloGestione/strutturaCommessa";
import { useSedeFilter } from "@/store/sedeFilterStore";
import { OrdersSummaryCard } from "@/components/orders/OrdersSummaryCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  BarChart3,
  ArrowUpRight,
  Info,
  HardHat,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown,
  Lightbulb,
  ShieldAlert,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fasciaMargine,
  margineAffidabile,
  margineRealeSedi,
  nomeClienteCommessa,
  notaAvanzamento,
  type FasciaMargine,
} from "@/lib/marginalita/fasceMargine";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { italiano, type Traduttore } from "@/lib/campo/lingua/traduttore";

const MARGINALITA_FETCH_LIMIT = 1000;

interface MarginalitaRow {
  id: string;
  company_id: string;
  order_code: string | null;
  description: string;
  preventivo_contratto: number;
  variazioni_approvate: number;
  preventivo_totale: number;
  costo_acquisti: number;
  costo_materiali_magazzino: number;
  movimenti_magazzino_senza_costo: number;
  costo_manodopera: number;
  costo_provvigioni: number;
  costo_diretto: number;
  costo_rimborsi_km: number;
  costo_errori: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
  cliente_nome: string;
  work_start_date: string | null;
  work_end_date: string | null;
  percentuale_avanzamento: number | null;
  created_at: string;
}

interface MarginAnomaly {
  id: string;
  order_id: string;
  amount: number | null;
  description: string | null;
  error_type: string | null;
  error_category: string | null;
  detailed_cause?: string | null;
  process_origin?: string | null;
  verify_role?: string | null;
  review_status?: string | null;
}

interface MarginSettings {
  overhead_percentuale?: number | null;
  // Colonna reale di preventivo_impostazioni: prima si chiedevano
  // margine_minimo/target_percentuale (inesistenti → 400, KPI margine muto).
  margine_target_default?: number | null;
  soglia_margine_visibile?: number | null;
}

interface VehicleEstimateRow {
  order_id: string;
  costo_mezzi_stimato: number | null;
  mezzi_usati: number | null;
  giorni_mezzo: number | null;
  mezzi_senza_costo: number | null;
  dati_mezzi_visibili: boolean | null;
}

interface AdjustedMargin {
  /** none: né ripartizione automatica né percentuale dell'azienda, quindi nessuna quota. */
  source: "automatic" | "fallback" | "none";
  structureAmount: number;
  structurePct: number;
  adjustedMargin: number;
  adjustedMarginPct: number;
  months: number | null;
}

type SortDirection = "asc" | "desc";
type MarginalitaSortKey =
  | "order"
  | "cliente"
  | "stato"
  | "preventivo"
  | "consuntivo"
  | "margine"
  | "marginePerc"
  | "overhead"
  | "margineNetto"
  | "acquisti"
  | "errori";

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  const normalizedA = typeof a === "number" ? a : String(a ?? "").toLowerCase();
  const normalizedB = typeof b === "number" ? b : String(b ?? "").toLowerCase();
  if (normalizedA < normalizedB) return -1;
  if (normalizedA > normalizedB) return 1;
  return 0;
}

function safeNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Senza ricavo e almeno un costo registrato il 100% e' solo un falso positivo. */
function hasReliableMargin(row: Pick<MarginalitaRow, "preventivo_totale" | "consuntivo" | "movimenti_magazzino_senza_costo">): boolean {
  return margineAffidabile(row);
}

/**
 * La vista conosce il cliente solo dal profilo collegato: le commesse senza profilo
 * hanno il nome scritto sulla commessa. Se questa lettura fallisce restano i nomi di prima.
 */
async function completaNomiClienti(companyId: string, rows: MarginalitaRow[]): Promise<MarginalitaRow[]> {
  if (!rows.some((row) => !row.cliente_nome?.trim())) return rows;
  let data: { id: string; client_company: string | null; client_name: string | null }[];
  try {
    data = await leggiTutteLeRighe((da, a) => supabase
      .from("orders")
      .select("id, client_company, client_name", { count: "exact" })
      .eq("company_id", companyId)
      .is("customer_id", null)
      .order("id").range(da, a));
  } catch { return rows; }
  const perCommessa = new Map(data.map((order) => [order.id, order]));
  return rows.map((row) => (row.cliente_nome?.trim()
    ? row
    : { ...row, cliente_nome: nomeClienteCommessa(null, perCommessa.get(row.id)) }));
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalizeReviewStatus(value: string | null | undefined) {
  const normalized = String(value ?? "aperta").toLowerCase();
  if (["risolta", "non_imputabile"].includes(normalized)) return normalized;
  if (["in_verifica", "assegnata"].includes(normalized)) return normalized;
  return "aperta";
}

function extractStructuredField(description: string | null | undefined, label: string) {
  if (!description) return null;
  const prefix = `${label}:`;
  const line = description
    .split(/\r?\n/)
    .find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value || null;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />;
  return direction === "asc"
    ? <ArrowUp className="h-3.5 w-3.5" />
    : <ArrowDown className="h-3.5 w-3.5" />;
}

function SortableTableHead({
  children,
  active,
  direction,
  onClick,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <TableHead className={className} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          align === "center" && "mx-auto justify-center",
          align === "right" && "ml-auto justify-end",
        )}
      >
        {children}
        <SortIcon active={active} direction={direction} />
      </button>
    </TableHead>
  );
}

function MargineColorClass(perc: number): string {
  if (perc >= 25) return "text-green-600";
  if (perc >= 10) return "text-amber-600";
  return "text-red-600";
}



function MargineBadge({ perc }: { perc: number }) {
  const isPositive = perc >= 0;
  return (
    <Badge
      className={cn(
        "text-xs font-semibold tabular-nums",
        perc >= 25 && "bg-green-100 text-green-800 border-green-200 border",
        perc >= 10 && perc < 25 && "bg-amber-100 text-amber-800 border-amber-200 border",
        perc < 10 && "bg-red-100 text-red-800 border-red-200 border",
      )}
    >
      {isPositive ? "+" : ""}{perc.toFixed(1)}%
    </Badge>
  );
}

function MarginHealthBadge({ perc, target }: { perc: number; target: number }) {
  const t = useT();
  const fascia = fasciaMargine({ affidabile: true, nettoPct: perc, targetPct: target });
  if (fascia === "perdita") {
    return <Badge className="border border-red-200 bg-red-100 text-red-800">{t("In perdita")}</Badge>;
  }
  if (fascia === "sotto_target") {
    return <Badge className="border border-orange-200 bg-orange-100 text-orange-800">{t("Sotto target")}</Badge>;
  }
  if (fascia === "da_monitorare") {
    return <Badge className="border border-amber-200 bg-amber-100 text-amber-800">{t("Da monitorare")}</Badge>;
  }
  return <Badge className="border border-green-200 bg-green-100 text-green-800">{t("Sano")}</Badge>;
}

export default function MarginalitaCantieri() {
  const companyId = useEffectiveCompanyId();
  return <MarginalitaAzienda key={companyId ?? "nessuna-azienda"} companyId={companyId} />;
}

function MarginalitaAzienda({ companyId }: { companyId: string | null }) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [showCostColumns, setShowCostColumns] = useState(false);
  const [search, setSearch] = useState("");
  const [annoFilter, setAnnoFilter] = useState<string>("tutti");
  const [healthFilter, setHealthFilter] = useState<"tutti" | FasciaMargine>("tutti");
  const [overheadPctOverride, setOverheadPct] = useState<number | null>(null);
  const [targetMarginPctOverride, setTargetMarginPct] = useState<number | null>(null);
  const [drillRow, setDrillRow] = useState<MarginalitaRow | null>(null);
  const [sort, setSort] = useState<{ key: MarginalitaSortKey; direction: SortDirection }>({
    key: "margineNetto",
    direction: "asc",
  });

  const { data: marginalitaData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["marginalita-cantieri", "without-exact-count", companyId],
    queryFn: async () => {
      // La vista applica permessi e calcoli economici: count=exact la riesegue per
      // contare tutte le righe e può mandare in timeout anche una lettura limitata.
      // Leggiamo solo i dati; quando si raggiunge il limite lo dichiariamo nella UI.
      const archivedIds = await loadArchivedOrderIds(companyId!);
      const rich = await excludeArchivedOrders(supabase
        .from("v_ordine_marginalita")
        .select("id, company_id, order_code, description, preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_materiali_magazzino, movimenti_magazzino_senza_costo, costo_manodopera, costo_provvigioni, costo_diretto, costo_rimborsi_km, costo_errori, consuntivo, margine, margine_perc, cliente_nome, work_start_date, work_end_date, percentuale_avanzamento, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(MARGINALITA_FETCH_LIMIT), archivedIds);

      if (rich.error) {
        const isOldView = /schema cache|column|costo_materiali_magazzino|movimenti_magazzino_senza_costo|percentuale_avanzamento/i
          .test(rich.error.message || "");
        if (!isOldView) throw rich.error;

        const fallback = await excludeArchivedOrders(supabase
          .from("v_ordine_marginalita")
          .select("id, company_id, order_code, description, preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_errori, consuntivo, margine, margine_perc, cliente_nome, work_start_date, work_end_date, created_at")
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(MARGINALITA_FETCH_LIMIT), archivedIds);
        if (fallback.error) throw fallback.error;
        return {
          rows: await completaNomiClienti(companyId!, (fallback.data || []).map((row) => ({
            ...row,
            costo_materiali_magazzino: 0,
            movimenti_magazzino_senza_costo: 0,
            costo_manodopera: 0,
            costo_provvigioni: 0,
            costo_diretto: 0,
            costo_rimborsi_km: 0,
            percentuale_avanzamento: null as number | null,
          })) as MarginalitaRow[]),
          totalCount: fallback.count ?? (fallback.data?.length ?? 0),
        };
      }

      return {
        rows: await completaNomiClienti(companyId!, (rich.data || []) as unknown as MarginalitaRow[]),
        totalCount: rich.count ?? (rich.data?.length ?? 0),
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const rows = useMemo(() => marginalitaData?.rows ?? [], [marginalitaData]);
  const totalRows = marginalitaData?.totalCount ?? rows.length;
  const hasMoreRows = totalRows > rows.length || rows.length >= MARGINALITA_FETCH_LIMIT;

  const {
    data: vehicleEstimates = [],
    isLoading: isLoadingVehicleEstimates,
    error: vehicleEstimatesError,
    refetch: refetchVehicleEstimates,
  } = useQuery({
    queryKey: ["marginalita-costi-mezzi-stimati", companyId],
    queryFn: async () => {
      return await leggiTutteLeRighe<VehicleEstimateRow>((da, a) => supabase
        .from("v_ordine_costi_mezzi_stimati")
        .select("order_id, costo_mezzi_stimato, mezzi_usati, giorni_mezzo, mezzi_senza_costo, dati_mezzi_visibili", { count: "exact" })
        .eq("company_id", companyId!)
        .order("order_id").range(da, a));
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const vehicleEstimateByOrder = useMemo(
    () => new Map(vehicleEstimates.map((row) => [row.order_id, row])),
    [vehicleEstimates],
  );
  // Senza il permesso sui mezzi la vista risponde 0: non è un costo zero, è un dato non visibile.
  const vehicleDataHidden = vehicleEstimates.some((row) => row.dati_mezzi_visibili === false);
  // La quota interna dei mezzi nostri: accanto al margine diretto, mai dopo la struttura, che le rate le contiene già.
  const quotaMezzi = (orderId: string): number =>
    vehicleDataHidden || vehicleEstimatesError || isLoadingVehicleEstimates ? 0 : safeNumber(vehicleEstimateByOrder.get(orderId)?.costo_mezzi_stimato);

  const { data: marginSettings, error: marginSettingsError, refetch: refetchMarginSettings } = useQuery({
    queryKey: ["preventivo-impostazioni-margin", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("preventivo_impostazioni") as any)
        .select("overhead_percentuale, margine_target_default, soglia_margine_visibile")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MarginSettings | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const configuredOverheadPct = marginSettings?.overhead_percentuale;
  const configuredTargetMarginPct = marginSettings?.margine_target_default
    ?? marginSettings?.soglia_margine_visibile;
  // Nessuna percentuale di ripiego inventata: vale solo quella scelta dall'azienda.
  const overheadPct = overheadPctOverride
    ?? (configuredOverheadPct === null || configuredOverheadPct === undefined
      ? null
      : clampPercentage(Number(configuredOverheadPct)));
  const targetMarginPct = targetMarginPctOverride
    ?? clampPercentage(Number(configuredTargetMarginPct ?? 10));
  const structure = useCompanyStructure(!!companyId);

  // Avanzamento e proiezione del Controllo di gestione. Se il modulo non è attivo non si mostra
  // nessuna nota: il numero dell'avanzamento sull'ordine da solo non è affidabile.
  const commesseCdg = useMarginalitaCommesse(null);
  const avanzamentoPerCommessa = useMemo(
    () => new Map((commesseCdg.data?.righe ?? []).map((riga) => [riga.id, riga])),
    [commesseCdg.data],
  );

  const getAdjustedMargin = useCallback((row: MarginalitaRow): AdjustedMargin => {
    const revenue = safeNumber(row.preventivo_totale);
    const directMargin = safeNumber(row.margine);
    const automatic = calculateOrderStructureImpact({
      directMargin,
      revenue,
      monthlyPerActiveOrder: structure.data?.monthlyPerActiveOrder ?? null,
      workStartDate: row.work_start_date,
      workEndDate: row.work_end_date,
      progressPercent: row.percentuale_avanzamento,
      today: structure.data?.today ?? new Date().toLocaleDateString("en-CA"),
    });

    if (
      automatic.allocatedStructure !== null
      && automatic.marginAfterStructure !== null
      && automatic.marginAfterStructurePct !== null
    ) {
      return {
        source: "automatic" as const,
        structureAmount: automatic.allocatedStructure,
        structurePct: revenue > 0 ? (automatic.allocatedStructure / revenue) * 100 : 0,
        adjustedMargin: automatic.marginAfterStructure,
        adjustedMarginPct: automatic.marginAfterStructurePct,
        months: automatic.months,
      };
    }

    if (overheadPct === null) {
      return {
        source: "none" as const,
        structureAmount: 0,
        structurePct: 0,
        adjustedMargin: directMargin,
        adjustedMarginPct: revenue > 0 ? (directMargin / revenue) * 100 : 0,
        months: null,
      };
    }

    const structureAmount = revenue * (overheadPct / 100);
    const adjustedMargin = directMargin - structureAmount;
    return {
      source: "fallback" as const,
      structureAmount,
      structurePct: overheadPct,
      adjustedMargin,
      adjustedMarginPct: revenue > 0 ? (adjustedMargin / revenue) * 100 : 0,
      months: null,
    };
  }, [overheadPct, structure.data]);

  const {
    data: anomalies = [],
    isFetching: isFetchingAnomalies,
    isError: anomaliesError,
    refetch: refetchAnomalies,
  } = useQuery({
    queryKey: ["marginalita-anomalie-collegate", companyId],
    // Per azienda, non per elenco di commesse: oltre qualche centinaio di id l'indirizzo
    // della richiesta diventa troppo lungo e il server la rifiuta.
    queryFn: async () => {
      const pagina = 1000;
      const tutte: MarginAnomaly[] = [];
      for (let da = 0; ; da += pagina) {
        const { data, error } = await (supabase.from("order_errors") as any)
          .select("id, order_id, amount, description, error_type, error_category, detailed_cause, process_origin, verify_role, review_status")
          .eq("company_id", companyId!)
          .order("id")
          .range(da, da + pagina - 1);
        if (error) throw error;
        tutte.push(...((data || []) as MarginAnomaly[]));
        if ((data?.length ?? 0) < pagina) return tutte;
      }
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const anomaliesByOrder = useMemo(() => {
    const map = new Map<string, {
      total: number;
      count: number;
      openTotal: number;
      openCount: number;
      causes: Map<string, { amount: number; count: number }>;
    }>();

    anomalies.forEach((item) => {
      const key = item.order_id;
      if (!key) return;
      const amount = safeNumber(item.amount);
      const status = normalizeReviewStatus(item.review_status);
      const isOpen = status !== "risolta" && status !== "non_imputabile";
      const cause =
        item.detailed_cause ||
        extractStructuredField(item.description, "Causa precisa") ||
        item.error_category ||
        item.error_type ||
        "Non classificata";
      const current = map.get(key) ?? {
        total: 0,
        count: 0,
        openTotal: 0,
        openCount: 0,
        causes: new Map<string, { amount: number; count: number }>(),
      };
      current.total += amount;
      current.count += 1;
      if (isOpen) {
        current.openTotal += amount;
        current.openCount += 1;
      }
      if (isOpen) {
        const causeStats = current.causes.get(cause) ?? { amount: 0, count: 0 };
        causeStats.amount += amount;
        causeStats.count += 1;
        current.causes.set(cause, causeStats);
      }
      map.set(key, current);
    });

    return map;
  }, [anomalies]);

  const getOrderAnomalySummary = useCallback((orderId: string) => {
    const summary = anomaliesByOrder.get(orderId);
    if (!summary) return null;
    const topCause = [...summary.causes.entries()]
      .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)[0];
    return {
      ...summary,
      topCause: topCause?.[0] ?? null,
      topCauseAmount: topCause?.[1].amount ?? 0,
      topCauseCount: topCause?.[1].count ?? 0,
    };
  }, [anomaliesByOrder]);

  // tr: senza traduttore resta l'italiano (serve al CSV); a schermo si passa la t della pagina.
  const getMarginDecision = useCallback((row: MarginalitaRow, tr: Traduttore = italiano) => {
    const preventivoTotale = safeNumber(row.preventivo_totale);
    const consuntivo = safeNumber(row.consuntivo);
    const adjusted = getAdjustedMargin(row);
    const margineNetto = adjusted.adjustedMarginPct;
    const conStruttura = adjusted.source !== "none";
    const anomaly = getOrderAnomalySummary(row.id);
    const targetGapPct = Math.max(0, targetMarginPct - margineNetto);
    const recoveryAmount = preventivoTotale * (targetGapPct / 100);

    if (preventivoTotale <= 0) {
      return {
        label: tr("Ricavo mancante"),
        detail: tr("Ordine senza valore contrattuale: margine non affidabile."),
        tone: "red" as const,
        recoveryAmount,
      };
    }
    if (!hasReliableMargin(row)) {
      return {
        label: tr("Costi da completare"),
        detail: safeNumber(row.movimenti_magazzino_senza_costo) > 0
          ? tr(safeNumber(row.movimenti_magazzino_senza_costo) === 1 ? "{n} prelievo di magazzino senza costo: completa la valorizzazione." : "{n} prelievi di magazzino senza costo: completa la valorizzazione.", { n: safeNumber(row.movimenti_magazzino_senza_costo) })
          : tr("Nessun costo registrato: il margine non è ancora calcolabile."),
        tone: "orange" as const,
        recoveryAmount: 0,
      };
    }
    if (margineNetto < 0) {
      return {
        label: tr("Perdita netta"),
        detail: anomaly?.topCause
          ? tr("Prima causa da chiudere: {causa}.", { causa: String(anomaly.topCause ?? "") })
          : adjusted.source === "none"
            ? tr("I costi diretti superano il ricavo.")
            : tr("Costi diretti e struttura stimata superano il ricavo."),
        tone: "red" as const,
        recoveryAmount,
      };
    }
    if ((anomaly?.openCount ?? 0) > 0) {
      return {
        label: tr("Anomalie aperte"),
        detail: tr("{n} anomalie non chiuse impattano per {importo}.", { n: anomaly?.openCount ?? 0, importo: formatCurrency(anomaly?.openTotal ?? 0) }),
        tone: "orange" as const,
        recoveryAmount,
      };
    }
    if (margineNetto < targetMarginPct) {
      return {
        label: tr("Sotto target"),
        detail: conStruttura
          ? tr("Mancano {importo} per arrivare al target dopo struttura {percento}%.", { importo: formatCurrency(recoveryAmount), percento: targetMarginPct.toFixed(1) })
          : tr("Mancano {importo} per arrivare al target {percento}%.", { importo: formatCurrency(recoveryAmount), percento: targetMarginPct.toFixed(1) }),
        tone: "amber" as const,
        recoveryAmount,
      };
    }
    if (fasciaMargine({ affidabile: true, nettoPct: margineNetto, targetPct: targetMarginPct }) === "da_monitorare") {
      return {
        label: tr("Da monitorare"),
        detail: conStruttura
          ? tr("Margine dopo struttura {percento}%: controlla costi e varianti per mantenere il margine.", { percento: margineNetto.toFixed(1) })
          : tr("Margine {percento}%: controlla costi e varianti per mantenere il margine.", { percento: margineNetto.toFixed(1) }),
        tone: "amber" as const,
        recoveryAmount,
      };
    }
    if (consuntivo > preventivoTotale * 0.75) {
      return {
        label: tr("Costi alti"),
        detail: tr("Consuntivo oltre il 75% del ricavo: controlla acquisti e varianti."),
        tone: "amber" as const,
        recoveryAmount,
      };
    }
    return {
      label: tr("Sano"),
      detail: conStruttura ? tr("Margine dopo struttura sopra target nella vista corrente.") : tr("Margine sopra target nella vista corrente."),
      tone: "green" as const,
      recoveryAmount,
    };
  }, [getAdjustedMargin, getOrderAnomalySummary, targetMarginPct]);

  // ── Anni disponibili per il filtro ───────────────────────────
  const anniDisponibili = useMemo(() => {
    const anni = new Set(rows.map((r) => new Date(r.created_at).getFullYear().toString()));
    return ["tutti", ...Array.from(anni).sort((a, b) => Number(b) - Number(a))];
  }, [rows]);

  // ── Filtro ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (annoFilter !== "tutti") {
      result = result.filter((r) => new Date(r.created_at).getFullYear().toString() === annoFilter);
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase().replace(/^#/, "");
      result = result.filter(
        (r) =>
          r.order_code?.toLowerCase().includes(s) ||
          r.description?.toLowerCase().includes(s) ||
          r.cliente_nome?.toLowerCase().includes(s),
      );
    }
    result = result.filter((r) => {
      if (healthFilter === "tutti") return true;
      return fasciaMargine({
        affidabile: hasReliableMargin(r),
        nettoPct: getAdjustedMargin(r).adjustedMarginPct,
        targetPct: targetMarginPct,
      }) === healthFilter;
    });
    const getSortValue = (row: MarginalitaRow, key: MarginalitaSortKey) => {
      const adjusted = getAdjustedMargin(row);
      switch (key) {
        case "order":
          return row.order_code ?? row.description ?? "";
        case "cliente":
          return row.cliente_nome ?? "";
        case "stato":
          return hasReliableMargin(row) ? adjusted.adjustedMarginPct : -Infinity;
        case "preventivo":
          return safeNumber(row.preventivo_totale);
        case "consuntivo":
          return safeNumber(row.consuntivo);
        case "margine":
          return safeNumber(row.margine);
        case "marginePerc":
          return safeNumber(row.margine_perc);
        case "overhead":
          return adjusted.structureAmount;
        case "margineNetto":
          return adjusted.adjustedMargin;
        case "acquisti":
          return safeNumber(row.costo_acquisti) + safeNumber(row.costo_materiali_magazzino);
        case "errori":
          return safeNumber(row.costo_errori);
        default:
          return "";
      }
    };

    // Le righe senza margine mostrano «—»: in fondo, altrimenti le commesse senza ricavo
    // coprono quelle davvero in perdita, che sono il primo motivo per aprire la pagina.
    const ordinaPerMargine = ["margine", "marginePerc", "margineNetto"].includes(sort.key);
    return [...result].sort((a, b) => {
      if (ordinaPerMargine && hasReliableMargin(a) !== hasReliableMargin(b)) {
        return hasReliableMargin(a) ? -1 : 1;
      }
      const order = compareSortValues(getSortValue(a, sort.key), getSortValue(b, sort.key));
      return sort.direction === "asc" ? order : -order;
    });
  }, [rows, annoFilter, search, healthFilter, targetMarginPct, sort, getAdjustedMargin]);

  const handleSort = (key: MarginalitaSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const exportFilteredCsv = () => {
    const headers = [
      "Ordine",
      "Cliente",
      "Preventivo",
      "Consuntivo",
      "Margine diretto",
      "Margine diretto %",
      "Metodo struttura",
      "Quota struttura euro",
      "Quota struttura %",
      "Target dopo struttura %",
      "Margine dopo struttura %",
      "Margine dopo struttura euro",
      "Acquisti ODA",
      "Materiali da scorta",
      "Prelievi da valorizzare",
      "Mezzi stimati fuori consuntivo",
      "Mezzi assegnati",
      "Mezzi senza costo configurato",
      "Margine con i mezzi euro",
      "Costo errori e anomalie",
      "Anomalie aperte",
      "Motivo rischio",
      "Azione",
    ];
    const rowsCsv = filtered.map((row) => {
      const preventivoTotale = safeNumber(row.preventivo_totale);
      const adjusted = getAdjustedMargin(row);
      const decision = getMarginDecision(row);
      const anomaly = getOrderAnomalySummary(row.id);
      const reliable = hasReliableMargin(row);
      return [
        row.order_code ?? "",
        row.cliente_nome ?? "",
        preventivoTotale.toFixed(2),
        safeNumber(row.consuntivo).toFixed(2),
        reliable ? safeNumber(row.margine).toFixed(2) : "",
        reliable ? safeNumber(row.margine_perc).toFixed(1) : "",
        adjusted.source === "automatic" ? "Automatica per tempo" : adjusted.source === "fallback" ? "Percentuale aziendale" : "Non calcolabile",
        adjusted.source === "none" ? "" : adjusted.structureAmount.toFixed(2),
        adjusted.source === "none" ? "" : adjusted.structurePct.toFixed(1),
        targetMarginPct.toFixed(1),
        reliable && adjusted.source !== "none" ? adjusted.adjustedMarginPct.toFixed(1) : "",
        reliable && adjusted.source !== "none" ? adjusted.adjustedMargin.toFixed(2) : "",
        safeNumber(row.costo_acquisti).toFixed(2),
        safeNumber(row.costo_materiali_magazzino).toFixed(2),
        String(safeNumber(row.movimenti_magazzino_senza_costo)),
        vehicleDataHidden || vehicleEstimatesError || isLoadingVehicleEstimates ? "" : safeNumber(vehicleEstimateByOrder.get(row.id)?.costo_mezzi_stimato).toFixed(2),
        vehicleDataHidden || vehicleEstimatesError || isLoadingVehicleEstimates ? "" : String(safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_usati)),
        vehicleDataHidden || vehicleEstimatesError || isLoadingVehicleEstimates ? "" : String(safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_senza_costo)),
        vehicleDataHidden || vehicleEstimatesError || isLoadingVehicleEstimates || !reliable ? "" : (safeNumber(row.margine) - quotaMezzi(row.id)).toFixed(2),
        safeNumber(row.costo_errori).toFixed(2),
        anomaliesError || isFetchingAnomalies ? "" : String(anomaly?.openCount ?? 0),
        decision.label,
        decision.detail,
      ];
    });
    const csv = [headers, ...rowsCsv]
      .map((row) => row.map((cell) => escapeCsvCell(cell, ";")).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marginalita-cantieri-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── KPI aggregati (su filtered) ──────────────────────────────
  const kpi = useMemo(() => {
    const reliableRows = filtered.filter(hasReliableMargin);
    const totPreventivo = filtered.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totConsuntivo = filtered.reduce((s, r) => s + safeNumber(r.consuntivo), 0);
    const reliableRevenue = reliableRows.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totMargine = reliableRows.reduce((s, r) => s + safeNumber(r.margine), 0);
    const avgMarginePerc = reliableRevenue > 0 ? (totMargine / reliableRevenue) * 100 : 0;
    // «Dopo struttura» somma solo le commesse che una quota di struttura ce l'hanno davvero.
    const structuredRows = reliableRows.filter((row) => getAdjustedMargin(row).source !== "none");
    const structuredRevenue = structuredRows.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const adjustedMarginTotal = structuredRows.reduce((sum, row) => sum + getAdjustedMargin(row).adjustedMargin, 0);
    const allocatedStructureTotal = structuredRows.reduce((sum, row) => sum + getAdjustedMargin(row).structureAmount, 0);
    const avgMargineNettoPerc = structuredRevenue > 0 ? (adjustedMarginTotal / structuredRevenue) * 100 : 0;
    const incompleteCount = filtered.length - reliableRows.length;
    // Stessa regola dell'elenco «Azioni operative» e della frase in testata.
    const riskCount = filtered.filter((r) => getMarginDecision(r).tone !== "green").length;
    const errorCost = filtered.reduce((s, r) => s + safeNumber(r.costo_errori), 0);
    const purchaseCost = filtered.reduce(
      (s, r) => s + safeNumber(r.costo_acquisti) + safeNumber(r.costo_materiali_magazzino),
      0,
    );
    const vehicleEstimateTotal = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.costo_mezzi_stimato),
      0,
    );
    const margineConMezzi = totMargine - reliableRows.reduce((sum, row) => sum + quotaMezzi(row.id), 0);
    const vehiclesUsed = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_usati),
      0,
    );
    const vehiclesWithoutCost = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_senza_costo),
      0,
    );
    const targetRecovery = filtered.reduce((sum, row) => sum + getMarginDecision(row).recoveryAmount, 0);
    const openAnomalyCost = filtered.reduce((sum, row) => sum + (getOrderAnomalySummary(row.id)?.openTotal ?? 0), 0);
    const openAnomalyCount = filtered.reduce((sum, row) => sum + (getOrderAnomalySummary(row.id)?.openCount ?? 0), 0);
    return {
      totPreventivo,
      totConsuntivo,
      totMargine,
      avgMarginePerc,
      avgMargineNettoPerc,
      adjustedMarginTotal,
      allocatedStructureTotal,
      reliableCount: reliableRows.length,
      structuredCount: structuredRows.length,
      incompleteCount,
      riskCount,
      errorCost,
      purchaseCost,
      vehicleEstimateTotal,
      margineConMezzi,
      vehiclesUsed,
      vehiclesWithoutCost,
      targetRecovery,
      openAnomalyCost,
      openAnomalyCount,
    };
  }, [filtered, vehicleEstimateByOrder, getAdjustedMargin, getMarginDecision, getOrderAnomalySummary]);

  const marginControl = useMemo(() => {
    const riskRows = filtered
      .map((row) => {
        const decision = getMarginDecision(row, t);
        const margineNetto = getAdjustedMargin(row).adjustedMarginPct;
        return { row, decision, margineNetto };
      })
      .filter((item) => item.decision.tone !== "green")
      .sort((a, b) => b.decision.recoveryAmount - a.decision.recoveryAmount || a.margineNetto - b.margineNetto);

    const insight = filtered.length === 0
      ? t("Nessuna commessa nella vista corrente. Modifica i filtri per visualizzare i risultati.")
      : riskRows.length > 0
      ? `${t(riskRows.length === 1 ? "{n} commessa richiede attenzione." : "{n} commesse richiedono attenzione.", { n: riskRows.length })} ${kpi.reliableCount > 0 ? t("Gap economico calcolabile rispetto al target dopo struttura {percento}%: {importo}.", { percento: targetMarginPct.toFixed(1), importo: formatCurrency(kpi.targetRecovery) }) : t("Gap non calcolabile con dati incompleti.")}${kpi.incompleteCount > 0 ? ` ${t("{n} senza costi completi.", { n: kpi.incompleteCount })}` : ""}`
      : t("Le commesse filtrate sono sopra il target dopo struttura {percento}%.", { percento: targetMarginPct.toFixed(1) });

    return { riskRows: riskRows.slice(0, 5), insight };
  }, [filtered, targetMarginPct, kpi.incompleteCount, kpi.reliableCount, kpi.targetRecovery, getAdjustedMargin, getMarginDecision, t]);

  const { sediSelezionate, periodo, tipoSede } = useSedeFilter();
  const { data: sediData, error: sediError, refetch: refetchSediData } = useSediAnalytics({
    da: periodo.da,
    a:  periodo.a,
  });
  // Con una sola sede il blocco ripeterebbe i totali della pagina: si vede solo con più sedi.
  const piuSedi = (sediData?.sedi?.length ?? 0) > 1;
  const { data: sedePerCommessa, error: sedePerCommessaError, refetch: refetchSedePerCommessa } = useQuery({
    queryKey: ["marginalita-sede-commesse", companyId],
    queryFn: async () => {
      const mappa = new Map<string, string | null>();
      const pagina = 1000;
      for (let da = 0; ; da += pagina) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, sede_id")
          .eq("company_id", companyId!)
          .order("id")
          .range(da, da + pagina - 1);
        if (error) throw error;
        (data ?? []).forEach((order) => mappa.set(order.id, order.sede_id));
        if ((data?.length ?? 0) < pagina) return mappa;
      }
    },
    enabled: !!companyId && piuSedi,
    staleTime: 2 * 60 * 1000,
  });
  // Ricavi e margine dalle commesse della tabella; preventivi e conversione restano quelli della sede.
  const sediVisibili = useMemo(() => {
    if (!piuSedi || !sedePerCommessa) return [];
    const reali = margineRealeSedi(rows, sedePerCommessa, periodo);
    return (sediData?.sedi ?? [])
      .filter((s) => (sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id)) && (!tipoSede || s.tipo === tipoSede))
      .flatMap((s) => {
        const margine = reali.get(s.sede_id);
        return margine ? [{ ...s, ...margine }] : [];
      })
      .sort((a, b) => b.margine_pct - a.margine_pct);
  }, [piuSedi, sedePerCommessa, rows, periodo, sediData, sediSelezionate, tipoSede]);

  return (
    <div className="space-y-3">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 sm:px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">{t("Marginalità Cantieri")}</h1>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              {t("Controlla preventivo, costi diretti e struttura per capire quali commesse stanno erodendo margine.")}
            </p>
          </div>
        </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button variant="outline" size="sm" onClick={exportFilteredCsv} disabled={isLoading || !!error || filtered.length === 0} className="shrink-0" aria-label={t("Esporta vista CSV")}>
              <FileDown className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("Esporta vista")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setRefreshing(true);
                try {
                  await Promise.allSettled([
                    refetch(), refetchVehicleEstimates(), refetchAnomalies(),
                    structure.refetch(), commesseCdg.refetch(), refetchMarginSettings(),
                    refetchSediData(), ...(piuSedi ? [refetchSedePerCommessa()] : []),
                  ]);
                } finally { setRefreshing(false); }
              }}
              disabled={isFetching || refreshing}
              className="shrink-0"
              aria-label={t("Aggiorna dati")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", (isFetching || refreshing) && "animate-spin")} />
              <span className="hidden sm:inline">{t("Aggiorna dati")}</span>
            </Button>
          </div>
        </div>
      </div>

      {(structure.error || marginSettingsError) && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {structure.error ? `${t("Struttura aziendale non caricata: la quota automatica non è disponibile.")} ` : ""}
        {marginSettingsError ? `${t("Impostazioni di margine non caricate: verifica target e percentuale prima di usare la simulazione.")} ` : ""}
        {t("Premi Aggiorna dati per riprovare.")}
      </div>}

      <section aria-label={t("Riepilogo marginalità")} className="rounded-2xl border border-slate-200 bg-eic-navy-deep p-3 text-white shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t("Marginalità della vista")}</h2>
            <p className="mt-0.5 text-xs text-blue-100/80">{t("Importi imponibili · percentuali ponderate sui ricavi")}</p>
          </div>
          <Badge className="border border-white/20 bg-white/10 text-white hover:bg-white/10">{t("Target dopo struttura {percento}%", { percento: targetMarginPct.toLocaleString(intlCampo(), {maximumFractionDigits:1}) })}</Badge>
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-100">{t("Dati non caricati: premi Aggiorna dati per riprovare.")}</p>}
        {anomaliesError && <p role="alert" className="mb-2 text-xs text-amber-100">{t("Anomalie non caricate: premi Aggiorna dati per riprovare.")}</p>}
        <div className="grid gap-2 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <OrdersSummaryCard id="margine-diretto" title={t("Margine diretto")} icon={BarChart3}
            value={error || kpi.reliableCount === 0 ? "—" : formatCurrency(kpi.totMargine)} loading={isLoading}
            note={t("{n} commesse calcolabili", { n: String(kpi.reliableCount ?? "") })}
            ring={!error && kpi.reliableCount > 0 ? {value:kpi.avgMarginePerc,label:t("Margine diretto ponderato"),color:kpi.avgMarginePerc < 0 ? "amber" : "green"} : undefined}
            info={t("Ricavi contrattuali meno costi diretti registrati, senza IVA. La percentuale è ponderata sui ricavi. Le commesse senza costi completi sono escluse; sulle commesse aperte il dato è provvisorio.")} />
          <OrdersSummaryCard id="margine-struttura" title={t("Dopo struttura")} icon={HardHat}
            value={error || kpi.structuredCount === 0 ? "—" : formatCurrency(kpi.adjustedMarginTotal)} loading={isLoading}
            note={kpi.structuredCount === 0 ? (kpi.reliableCount === 0 ? t("margine non calcolabile") : t("struttura non disponibile")) : t("{n} commesse con quota di struttura", { n: String(kpi.structuredCount ?? "") })}
            ring={!error && kpi.structuredCount > 0 ? {value:kpi.avgMargineNettoPerc,label:t("Margine dopo struttura ponderato"),color:kpi.avgMargineNettoPerc < 0 ? "amber" : "green"} : undefined}
            info={t("Margine diretto meno quota di struttura stimata. Si usano soltanto le commesse con una quota calcolabile. La struttura e i mezzi stimati restano separati dal consuntivo contabile.")} />
          <OrdersSummaryCard id="gap-target" title={t("Gap dal target")} icon={Target}
            value={error || kpi.reliableCount === 0 ? "—" : formatCurrency(kpi.targetRecovery)} loading={isLoading}
            note={t("da recuperare o compensare")}
            info={t("Somma degli importi da recuperare per raggiungere il target dopo struttura sulle commesse della vista. È una distanza gestionale dal target, non un debito o un costo già sostenuto.")} />
          <OrdersSummaryCard id="commesse-controllare" title={t("Da controllare")} icon={ShieldAlert}
            value={error ? "—" : String(kpi.riskCount)} loading={isLoading}
            note={t("{n} con dati incompleti", { n: String(kpi.incompleteCount ?? "") })}
            info={error ? t("Dati non caricati: premi Aggiorna dati per riprovare.") : `${marginControl.insight}${isFetchingAnomalies ? ` ${t("Aggiornamento anomalie in corso.")}` : ""}${anomaliesError ? ` ${t("Anomalie non caricate: premi Aggiorna dati per riprovare.")}` : ""}`} />
        </div>
      </section>

      <details className="group rounded-xl border border-orange-100 bg-orange-50/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
          <span className="inline-flex items-center gap-2"><Lightbulb className="h-4 w-4 text-orange-600" />{t("Azioni operative")} <span className="rounded bg-orange-100 px-1.5 text-xs text-orange-800">{error || isLoading ? "—" : kpi.riskCount}</span></span>
          <span className="text-xs font-normal text-slate-500 group-open:hidden">{t("Mostra priorità")}</span><span className="hidden text-xs font-normal text-slate-500 group-open:inline">{t("Nascondi")}</span>
        </summary>
        <div className="grid gap-2 border-t border-orange-100 p-3 lg:grid-cols-3">
          {!isLoading && !error && <p className="text-xs text-slate-600 lg:col-span-3">{marginControl.insight}</p>}
            {isLoading || error ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                {isLoading ? t("Sto caricando le commesse...") : t("Dati non caricati: nessuna indicazione disponibile.")}
              </div>
            ) : filtered.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{t("Nessuna azione disponibile: la vista non contiene commesse.")}</p>
            ) : marginControl.riskRows.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {t("Nessuna commessa sotto soglia nella vista corrente. Mantieni aggiornati acquisti e anomalie.")}
              </div>
            ) : (
              marginControl.riskRows.slice(0, 3).map(({ row, decision }) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDrillRow(row)}
                  className="w-full rounded-xl border border-orange-100 bg-white p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {row.order_code ? `#${row.order_code}` : t("Commessa")} · {row.cliente_nome || t("Cliente non indicato")}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{decision.detail}</p>
                    </div>
                    <Badge className="shrink-0 border border-orange-200 bg-orange-50 text-orange-700">
                      {!hasReliableMargin(row) ? t("Da completare") : decision.recoveryAmount > 0 ? formatCurrency(decision.recoveryAmount) : decision.label}
                    </Badge>
                  </div>
                </button>
              ))
            )}
        </div>
      </details>

      {/* ── Performance per Sede ───────────────────────────── */}
      {sediError && <p role="alert" className="text-sm text-amber-800">{t("Analisi delle sedi non caricata. Premi Aggiorna dati per riprovare.")}</p>}
      {piuSedi && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-eic-navy">{t("Performance per Sede")}</h2>
            <SedeFilterBar />
          </div>
          {sedePerCommessaError ? <p role="alert" className="text-sm text-amber-800">{t("Dati delle sedi non caricati. Premi Aggiorna dati per riprovare.")}</p> : sediVisibili.length === 0 && <p className="text-sm text-muted-foreground">{t("Nessuna sede con commesse calcolabili corrisponde ai filtri. Modifica i filtri delle sedi.")}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sediVisibili.map((sede) => (
              <SedeMargineCard
                key={sede.sede_id}
                sede={sede}
              />
            ))}
          </div>
        </section>
      )}

      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-slate-800">
          <span>{t("Dettagli economici e ipotesi di calcolo")}</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">{t("Mostra")}</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">{t("Nascondi")}</span>
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("Ricavi e consuntivo")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.totPreventivo)} · {formatCurrency(kpi.totConsuntivo)}</p>
            <p className="text-xs text-muted-foreground">{t("preventivo totale · costi registrati")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("Materiali")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.purchaseCost)}</p>
            <p className="text-xs text-muted-foreground">{t("acquisti e prelievi da scorta")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">{t("Mezzi stimati")}</p>
            <p className="mt-1 font-semibold">{isLoadingVehicleEstimates || vehicleDataHidden || vehicleEstimatesError ? "—" : formatCurrency(kpi.vehicleEstimateTotal)}</p>
            <p className="text-xs text-muted-foreground">
              {vehicleEstimatesError ? t("dati non caricati: premi Aggiorna dati") : vehicleDataHidden
                ? t("non visibili con i tuoi permessi")
                : `${t("margine con i mezzi {importo} · {n} assegnazioni", { importo: formatCurrency(kpi.margineConMezzi), n: kpi.vehiclesUsed })}${kpi.vehiclesWithoutCost > 0 ? ` · ${t("{n} senza costo", { n: kpi.vehiclesWithoutCost })}` : ""}`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-red-700">{t("Errori e anomalie")}</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.errorCost)}</p>
            <p className="text-xs text-muted-foreground">{anomaliesError ? t("Anomalie non caricate") : t("{n} ancora da verificare", { n: String(kpi.openAnomalyCount ?? "") })}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">{t("Struttura mensile")}</p>
            <p className="mt-1 font-semibold">{structure.data ? formatCurrency(structure.data.monthlyStructure) : "—"}</p>
            <p className="text-xs text-muted-foreground">{t("costi fissi e personale d'ufficio")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">{t("Quota per commessa")}</p>
            <p className="mt-1 font-semibold">{structure.data?.monthlyPerActiveOrder ? formatCurrency(structure.data.monthlyPerActiveOrder) : "—"}</p>
            <p className="text-xs text-muted-foreground">{structure.data?.activeOrders ?? "—"} {t("commesse attive")}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("Metodo")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("La struttura viene ripartita automaticamente nel tempo.")} {overheadPct === null ? t("Se mancano date o dati la quota non viene calcolata: puoi impostare una percentuale aziendale.") : t("Se mancano date o dati viene applicata la percentuale del {percento}%.", { percento: overheadPct.toFixed(1) })} {t("Mezzi e struttura sono letture gestionali e non modificano il consuntivo contabile.")}
            </p>
          </div>
        </div>
      </details>

      {hasMoreRows && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {totalRows > rows.length
            ? t("Vista limitata alle prime {n} commesse su {totale}. Ricerca, filtri e CSV riguardano solo queste commesse caricate.", { n: rows.length.toLocaleString(intlCampo()), totale: totalRows.toLocaleString(intlCampo()) })
            : t("Vista limitata alle prime {n} commesse: potrebbero esserci altre commesse. Ricerca, filtri e CSV riguardano solo queste commesse caricate.", { n: rows.length.toLocaleString(intlCampo()) })}
        </div>
      )}

      {/* ── Filtri ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-col flex-wrap gap-2.5 sm:flex-row">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("Cerca ordine, cliente...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-slate-200 pl-9 shadow-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="marginalita-overhead" className="text-sm text-muted-foreground whitespace-nowrap">{t("Struttura % se mancano dati")}</label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            id="marginalita-overhead"
            value={overheadPct ?? ""}
            placeholder="—"
            onChange={(e) => setOverheadPct(e.target.value === "" ? null : clampPercentage(Number(e.target.value)))}
            className="w-20 h-8 text-sm"
          />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label={t("Informazioni sulla quota di struttura")} className="shrink-0 text-muted-foreground"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-xs max-w-[240px]">{t("Usato solo quando la ripartizione automatica non può essere calcolata, per esempio se manca la data di inizio commessa.")}</p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="marginalita-target" className="text-sm text-muted-foreground whitespace-nowrap">{t("Target dopo struttura %")}</label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            id="marginalita-target"
            value={targetMarginPct}
            onChange={(e) => setTargetMarginPct(clampPercentage(Number(e.target.value)))}
            className="w-20 h-8 text-sm"
          />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label={t("Informazioni sul target di margine")} className="shrink-0 text-muted-foreground"><Target className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-xs max-w-[220px]">{t("Soglia minima dopo l'incidenza stimata della struttura, usata per calcolare il gap e ordinare le priorità operative.")}</p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label={t("Stato del margine")}>
          {[
            { key: "tutti", label: t("Tutti") },
            { key: "perdita", label: t("In perdita") },
            { key: "sotto_target", label: t("Sotto target") },
            { key: "da_monitorare", label: t("Da monitorare") },
            { key: "sano", label: t("Sani") },
            { key: "incompleto", label: t("Dati incompleti") },
          ].map((item) => (
            <button
              key={item.key}
              aria-pressed={healthFilter === item.key}
              onClick={() => setHealthFilter(item.key as typeof healthFilter)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                healthFilter === item.key
                  ? "border-orange-200 bg-orange-50 font-semibold text-slate-950 shadow-sm"
                  : "border-slate-200 text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label={t("Anno di creazione")}>
          {anniDisponibili.map((anno) => (
            <button
              key={anno}
              aria-pressed={annoFilter === anno}
              onClick={() => setAnnoFilter(anno)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                annoFilter === anno
                  ? "border-orange-200 bg-orange-50 font-semibold text-slate-950 shadow-sm"
                  : "border-slate-200 text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {anno === "tutti" ? t("Tutti gli anni") : anno}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p role="status">{t(filtered.length === 1 ? "{n} commessa visualizzata su {totale} caricate" : "{n} commesse visualizzate su {totale} caricate", { n: filtered.length, totale: rows.length })}</p>
        <div className="flex flex-wrap items-center gap-2">
          {(search || annoFilter !== "tutti" || healthFilter !== "tutti") && <Button variant="ghost" size="sm" onClick={() => {setSearch(""); setAnnoFilter("tutti"); setHealthFilter("tutti");}}>{t("Azzera filtri")}</Button>}
          {(overheadPctOverride !== null || targetMarginPctOverride !== null) && <>
            <span>{t("Simulazione locale: le impostazioni aziendali sono invariate.")}</span>
            <Button variant="outline" size="sm" onClick={() => {setOverheadPct(null); setTargetMarginPct(null);}}>{t("Ripristina valori aziendali")}</Button>
          </>}
        </div>
      </div>

      {/* ── Tabella Desktop ────────────────────────────────── */}
      <Card className="hidden md:block">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {t("Dettaglio per cantiere")}
            {filtered.length !== rows.length && (
              <Badge variant="secondary" className="text-xs">{filtered.length} / {rows.length}</Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-sky-200" />{t("Diretto: ricavi − costi")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-amber-200" />{t("Dopo struttura: diretto − quota stimata")}</span>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-pressed={showCostColumns} onClick={() => setShowCostColumns(value => !value)}>{showCostColumns ? t("Nascondi dettagli costi") : t("Dettagli costi")}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">{t("Errore nel caricamento dati.")}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("Riprova")}
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <HardHat className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("Nessun cantiere trovato")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rows.length === 0
                    ? t("I dati di marginalità appariranno qui una volta creati gli ordini.")
                    : t("Prova a modificare i filtri di ricerca.")}
                </p>
              </div>
              {rows.length === 0 && (
                <Link to="/azienda/ordini/nuovo" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("Crea il primo ordine")}
                </Link>
              )}
            </div>
          ) : (
            <Table aria-label={t("Marginalità per commessa, importi IVA esclusa")} wrapperClassName="max-h-[65vh]" className="text-xs [&_td]:px-2.5 [&_td]:py-2 [&_th]:h-10 [&_th]:px-2.5">
              <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-sm">
                <TableRow>
                  <SortableTableHead active={sort.key === "order"} direction={sort.direction} onClick={() => handleSort("order")}>{t("Ordine")}</SortableTableHead>
                  <SortableTableHead active={sort.key === "cliente"} direction={sort.direction} onClick={() => handleSort("cliente")}>{t("Cliente")}</SortableTableHead>
                  <SortableTableHead active={sort.key === "stato"} direction={sort.direction} onClick={() => handleSort("stato")}>{t("Stato")}</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "preventivo"} direction={sort.direction} onClick={() => handleSort("preventivo")}>{t("Ricavi")}</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "consuntivo"} direction={sort.direction} onClick={() => handleSort("consuntivo")}>{t("Costi diretti")}</SortableTableHead>
                  <SortableTableHead className="border-l border-sky-100 bg-sky-50 text-right" align="right" active={sort.key === "margine"} direction={sort.direction} onClick={() => handleSort("margine")}>{t("Margine diretto €")}</SortableTableHead>
                  <SortableTableHead className="w-20 bg-sky-50 text-center" align="center" active={sort.key === "marginePerc"} direction={sort.direction} onClick={() => handleSort("marginePerc")}>{t("Margine diretto %")}</SortableTableHead>
                  <SortableTableHead className="border-l border-amber-100 bg-amber-50 text-right" align="right" active={sort.key === "overhead"} direction={sort.direction} onClick={() => handleSort("overhead")}>{t("Struttura stimata")}</SortableTableHead>
                  <SortableTableHead className="bg-amber-50 text-right" align="right" active={sort.key === "margineNetto"} direction={sort.direction} onClick={() => handleSort("margineNetto")}>{t("Dopo struttura")}</SortableTableHead>
                  {showCostColumns && <>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "acquisti"} direction={sort.direction} onClick={() => handleSort("acquisti")}>{t("Materiali")}</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "errori"} direction={sort.direction} onClick={() => handleSort("errori")}>{t("Errori")}</SortableTableHead>
                  </>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const preventivoTotale = safeNumber(row.preventivo_totale);
                  const consuntivo = safeNumber(row.consuntivo);
                  const margine = safeNumber(row.margine);
                  const marginePerc = safeNumber(row.margine_perc);
                  const costoAcquisti = safeNumber(row.costo_acquisti);
                  const costoMagazzino = safeNumber(row.costo_materiali_magazzino);
                  const costoErrori = safeNumber(row.costo_errori);
                  const adjusted = getAdjustedMargin(row);
                  const margineNetto = adjusted.adjustedMarginPct;
                  const margineNettoAbs = adjusted.adjustedMargin;
                  const overheadAllocato = adjusted.structureAmount;
                  const decision = getMarginDecision(row, t);
                  const anomaly = getOrderAnomalySummary(row.id);
                  const reliable = hasReliableMargin(row);
                  return (
                    <TableRow
                      key={row.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => setDrillRow(row)}
                    >
                      <TableCell className="min-w-[155px]">
                        <div className="flex items-center gap-1 font-medium text-primary">
                          <button type="button" className="text-left hover:underline focus-visible:underline" aria-label={t("Dettaglio margine {commessa}", { commessa: String(row.order_code ?? row.description ?? "") })} onClick={(event) => { event.stopPropagation(); setDrillRow(row); }}>{row.order_code ? `#${row.order_code}` : "–"}</button>
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p title={row.description} className="max-w-[160px] truncate text-[11px] text-muted-foreground">{row.description}</p>
                      </TableCell>
                      <TableCell><span title={row.cliente_nome || undefined} className="block max-w-[115px] truncate text-slate-600">{row.cliente_nome || "–"}</span></TableCell>
                      <TableCell>
                        <div title={[decision.detail, notaAvanzamento(avanzamentoPerCommessa.get(row.id))].filter(Boolean).join(" · ")} className="space-y-1 [&_.inline-flex]:text-[10px]">
                          {reliable
                            ? <MarginHealthBadge perc={margineNetto} target={targetMarginPct} />
                            : <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">{t("Dati incompleti")}</Badge>}
                          {anomaly?.openCount ? <p className="text-[10px] text-amber-700">{t("{n} anomalie aperte", { n: String(anomaly.openCount ?? "") })}</p> : null}
                          {reliable && notaAvanzamento(avanzamentoPerCommessa.get(row.id)) && <p className="max-w-[150px] truncate text-[10px] text-muted-foreground" title={notaAvanzamento(avanzamentoPerCommessa.get(row.id)) ?? undefined}>{notaAvanzamento(avanzamentoPerCommessa.get(row.id))}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatCurrency(preventivoTotale)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(consuntivo)}</TableCell>
                      <TableCell className={cn("border-l border-sky-100 bg-sky-50/50 text-right font-semibold tabular-nums whitespace-nowrap", MargineColorClass(marginePerc))}>
                        {reliable ? formatCurrency(margine) : "—"}
                        {reliable && quotaMezzi(row.id) > 0 && (
                          <div className="whitespace-nowrap text-xs font-normal text-muted-foreground">{t("con i mezzi {importo}", { importo: formatCurrency(margine - quotaMezzi(row.id)) })}</div>
                        )}
                      </TableCell>
                      <TableCell className="bg-sky-50/50 text-center">
                        {reliable ? <div className="flex flex-col items-center gap-1">
                          <MargineBadge perc={marginePerc} />

                        </div> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="border-l border-amber-100 bg-amber-50/40 text-right text-[11px] tabular-nums text-muted-foreground">
                        {adjusted.source === "none" ? (
                          <span title={t("Mancano le date della commessa o i costi di struttura")}>—</span>
                        ) : (
                          <>
                            <span title={adjusted.source === "automatic"
                              ? t("{mesi} mesi × quota mensile automatica", { mesi: adjusted.months?.toFixed(1) ?? "—" })
                              : t("Percentuale aziendale del {percento}% sul ricavo", { percento: adjusted.structurePct.toFixed(1) })}>
                              {formatCurrency(overheadAllocato)}
                            </span>
                            <span className="mt-0.5 block text-[9px] uppercase text-slate-500">
                              {adjusted.source === "automatic" ? t("auto") : t("% azienda")}
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className={cn("bg-amber-50/40 text-right font-semibold tabular-nums whitespace-nowrap", MargineColorClass(margineNetto))}>
                        {reliable && adjusted.source !== "none" ? <>{formatCurrency(margineNettoAbs)}
                        <span className="mt-0.5 block text-[11px] font-medium">{margineNetto.toLocaleString(intlCampo(), {maximumFractionDigits:1})}%</span></> : "—"}
                      </TableCell>
                      {showCostColumns && <>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {costoAcquisti + costoMagazzino > 0 ? (
                          <span title={t("{acquisti} ODA · {scorta} scorta", { acquisti: formatCurrency(costoAcquisti), scorta: formatCurrency(costoMagazzino) })}>
                            {formatCurrency(costoAcquisti + costoMagazzino)}
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {costoErrori > 0 ? (
                          <span className="text-red-600">{formatCurrency(costoErrori)}</span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      </>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Card Mobile ────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">{t("Errore nel caricamento dati.")}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("Riprova")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? t("Crea il primo ordine per vedere i dati di marginalità.") : t("Nessun cantiere corrisponde ai filtri.")}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const margine = safeNumber(row.margine);
            const marginePerc = safeNumber(row.margine_perc);
            const adjusted = getAdjustedMargin(row);
            const reliable = hasReliableMargin(row);
            return (
            // Da telefono la scheda è stretta: si tocca e si apre il dettaglio dei costi.
            <Card key={row.id} role="button" tabIndex={0} onClick={() => setDrillRow(row)}
              onKeyDown={(e) => { if (e.key === "Enter") setDrillRow(row); }} aria-label={t("Dettaglio costi {commessa}", { commessa: String(row.order_code ?? "") })}>
              <CardContent className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/azienda/ordini/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="tap-compact font-medium text-sm hover:text-primary flex items-center gap-1"
                    >
                      {row.order_code ? `#${row.order_code}` : "–"}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{row.description}</p>
                  </div>
                  {reliable
                    ? <MargineBadge perc={marginePerc} />
                    : <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">{t("Dati incompleti")}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t("Margine diretto")}</p>
                    <p className={cn("font-semibold", MargineColorClass(marginePerc))}>
                      {reliable ? formatCurrency(margine) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("Dopo struttura stimata")}</p>
                    <p className={cn("font-semibold", MargineColorClass(adjusted.adjustedMarginPct))}>
                      {reliable && adjusted.source !== "none" ? formatCurrency(adjusted.adjustedMargin) : "—"}
                    </p>
                  </div>
                </div>

              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      {/* Drill-down sheet */}
      <MargineVociDetail
        open={!!drillRow}
        onClose={() => setDrillRow(null)}
        row={rows.find((row) => row.id === drillRow?.id) ?? null}
        structureImpact={drillRow ? getAdjustedMargin(rows.find((row) => row.id === drillRow.id) ?? drillRow) : undefined}
        targetMarginPct={targetMarginPct}
      />
    </div>
  );
}
