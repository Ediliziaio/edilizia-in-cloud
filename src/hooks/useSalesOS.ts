import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  calculateLeadScoreWithConfig,
  getIcpTierWithConfig,
  DEFAULT_LEAD_SCORING_CONFIG,
  type LeadScoringConfig,
} from '@/hooks/useLeadScoringConfig';

// ============================================================
// TYPES
// ============================================================

export interface WeightedPipelineStage {
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  stage_position: number;
  opportunity_count: number;
  total_value: number;
  weighted_value: number;
  avg_probability: number;
}

export interface SalesForecastMonth {
  forecast_month: string; // ISO date string
  expected_revenue: number;
  weighted_revenue: number;
  opportunity_count: number;
}

export interface StalledOpportunity {
  opportunity_id: string;
  opportunity_name: string;
  contact_name: string | null;
  stage_name: string;
  assigned_to: string | null;
  last_activity_at: string;
  days_stalled: number;
  stalled_threshold: number;
  value: number;
}

export interface SalesVelocity {
  open_opportunities: number;
  win_rate: number;
  avg_deal_size: number;
  avg_cycle_days: number;
  sales_velocity: number;
}

export interface SalesTarget {
  id: string;
  company_id: string;
  assigned_to: string | null;
  year: number;
  month: number;
  target_amount: number;
  target_deals: number | null;
  notes: string | null;
}

export interface SellerPerformance {
  assigned_to: string | null;
  display_name: string;
  won_count: number;
  won_value: number;
  open_count: number;
  open_value: number;
  lost_count: number;
  win_rate: number;
  avg_deal_size: number;
  target_amount: number;
  target_achievement: number; // percentuale 0-100
}

export interface ConversionBySource {
  source: string;
  total_contacts: number;
  total_opportunities: number;
  won_opportunities: number;
  win_rate: number;
  total_won_value: number;
  avg_deal_size: number;
}

export interface QuoteRevenueSummary {
  actual_revenue: number;            // somma total quote accettate/convertite nel periodo
  signed_quotes_count: number;       // # preventivi accettati/convertiti
  active_quotes_value: number;       // somma total preventivi inviati (pipeline preventivi)
  active_quotes_count: number;       // # preventivi inviati
  avg_signed_ticket: number;         // ricavo medio per preventivo firmato
  opportunities_with_quote: number;  // # opportunità open con almeno un preventivo attivo
  acceptance_rate: number;           // % (accettate / (accettate + rifiutate + scadute))
}

export interface LeadScoreContact {
  id: string;
  full_name: string;
  company_name: string | null;
  lead_score: number;
  icp_score: number;
  icp_tier: string | null;
  source: string | null;
  city: string | null;
  assigned_to: string | null;
  last_activity_at: string | null;
  open_opportunities_count: number;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const salesOSKeys = {
  all: ['sales-os'] as const,
  weightedPipeline: (companyId: string, scope = 'all') =>
    [...salesOSKeys.all, 'weighted-pipeline', companyId, scope] as const,
  forecast: (companyId: string, months: number, scope = 'all') =>
    [...salesOSKeys.all, 'forecast', companyId, months, scope] as const,
  stalled: (companyId: string, scope = 'all') =>
    [...salesOSKeys.all, 'stalled', companyId, scope] as const,
  velocity: (companyId: string, daysBack: number) =>
    [...salesOSKeys.all, 'velocity', companyId, daysBack] as const,
  targets: (companyId: string, year: number) =>
    [...salesOSKeys.all, 'targets', companyId, year] as const,
  sellerPerformance: (companyId: string, dateFrom: string, dateTo: string, scope = 'all') =>
    [...salesOSKeys.all, 'seller-perf', companyId, dateFrom, dateTo, scope] as const,
  conversionBySource: (companyId: string, dateFrom: string | null, scope = 'all') =>
    [...salesOSKeys.all, 'conversion-source', companyId, dateFrom ?? 'all', scope] as const,
  topLeads: (companyId: string, limit: number = 10, scope = 'all') =>
    [...salesOSKeys.all, 'top-leads', companyId, limit, scope] as const,
  quoteRevenue: (companyId: string, dateFrom: string, dateTo: string, scope = 'all') =>
    [...salesOSKeys.all, 'quote-revenue', companyId, dateFrom, dateTo, scope] as const,
};

// ============================================================
// HOOKS
// ============================================================

function shouldRestrictToAssigned(
  permissions: ReturnType<typeof usePermissions>,
  userId?: string | null,
) {
  return permissions.onlyAssigned && !!userId;
}

function salesOSScopeKey(restrictToAssigned: boolean, userId?: string | null) {
  return restrictToAssigned ? `assigned:${userId}` : 'all';
}

function clampProbability(value: unknown, fallback = 50) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function firstDayOfMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

async function fetchAssignedWeightedPipeline(
  companyId: string,
  userId: string,
): Promise<WeightedPipelineStage[]> {
  const { data: opportunities, error } = await supabase
    .from('marketing_opportunities')
    .select('pipeline_id, stage_id, value, probability')
    .eq('company_id', companyId)
    .eq('assigned_to', userId)
    .eq('status', 'open');
  if (error) throw error;
  if (!opportunities?.length) return [];

  const pipelineIds = [...new Set(opportunities.map((opp) => opp.pipeline_id).filter(Boolean))];
  const stageIds = [...new Set(opportunities.map((opp) => opp.stage_id).filter(Boolean))];

  const [pipelinesResult, stagesResult] = await Promise.all([
    supabase.from('marketing_pipelines').select('id, name').eq('company_id', companyId).in('id', pipelineIds),
    supabase
      .from('marketing_pipeline_stages')
      .select('id, pipeline_id, name, position, win_probability')
      .eq('company_id', companyId)
      .in('id', stageIds),
  ]);
  if (pipelinesResult.error) throw pipelinesResult.error;
  if (stagesResult.error) throw stagesResult.error;

  const pipelineMap = new Map((pipelinesResult.data ?? []).map((pipeline) => [pipeline.id, pipeline.name]));
  const stageMap = new Map((stagesResult.data ?? []).map((stage) => [stage.id, stage]));
  const grouped = new Map<string, WeightedPipelineStage & { probability_sum: number }>();

  for (const opp of opportunities) {
    const stage = stageMap.get(opp.stage_id);
    const key = `${opp.pipeline_id}:${opp.stage_id}`;
    const probability = clampProbability(opp.probability ?? stage?.win_probability);
    const value = Number(opp.value ?? 0);
    const current = grouped.get(key) ?? {
      pipeline_id: opp.pipeline_id,
      pipeline_name: pipelineMap.get(opp.pipeline_id) ?? 'Pipeline',
      stage_id: opp.stage_id,
      stage_name: stage?.name ?? 'Fase',
      stage_position: stage?.position ?? 0,
      opportunity_count: 0,
      total_value: 0,
      weighted_value: 0,
      avg_probability: 0,
      probability_sum: 0,
    };
    current.opportunity_count += 1;
    current.total_value += value;
    current.weighted_value += value * (probability / 100);
    current.probability_sum += probability;
    current.avg_probability = current.probability_sum / current.opportunity_count;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map(({ probability_sum: _probabilitySum, ...stage }) => stage)
    .sort((a, b) => a.pipeline_name.localeCompare(b.pipeline_name) || a.stage_position - b.stage_position);
}

async function fetchAssignedSalesForecast(
  companyId: string,
  userId: string,
  monthsAhead: number,
): Promise<SalesForecastMonth[]> {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + monthsAhead + 1, 1);
  const { data, error } = await supabase
    .from('marketing_opportunities')
    .select('expected_close_date, value, probability')
    .eq('company_id', companyId)
    .eq('assigned_to', userId)
    .eq('status', 'open')
    .not('expected_close_date', 'is', null)
    .gte('expected_close_date', firstDayOfMonth(today))
    .lt('expected_close_date', firstDayOfMonth(end));
  if (error) throw error;

  const months = new Map<string, SalesForecastMonth>();
  for (const opp of data ?? []) {
    const date = new Date(opp.expected_close_date!);
    const month = firstDayOfMonth(date);
    const current = months.get(month) ?? {
      forecast_month: month,
      expected_revenue: 0,
      weighted_revenue: 0,
      opportunity_count: 0,
    };
    const value = Number(opp.value ?? 0);
    current.expected_revenue += value;
    current.weighted_revenue += value * (clampProbability(opp.probability) / 100);
    current.opportunity_count += 1;
    months.set(month, current);
  }

  return Array.from(months.values()).sort((a, b) => a.forecast_month.localeCompare(b.forecast_month));
}

async function fetchAssignedSalesVelocity(
  companyId: string,
  userId: string,
  daysBack: number,
): Promise<SalesVelocity | null> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  // won_at/lost_at (migration 20271214000002): la data di chiusura VERA.
  // updated_at resta come fallback per righe ante-backfill: prima qualsiasi
  // edit successivo "spostava" la vittoria nel periodo corrente.
  const { data, error } = await supabase
    .from('marketing_opportunities')
    .select('status, value, created_at, updated_at, won_at, lost_at')
    .eq('company_id', companyId)
    .eq('assigned_to', userId)
    .or(`status.eq.open,updated_at.gte.${since},won_at.gte.${since},lost_at.gte.${since}`);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{ status: string; value: number | null; created_at: string; updated_at: string; won_at?: string | null; lost_at?: string | null }>;
  const open = rows.filter((opp) => opp.status === 'open');
  const won = rows.filter((opp) => opp.status === 'won' && (opp.won_at ?? opp.updated_at) >= since);
  const lost = rows.filter((opp) => opp.status === 'lost' && (opp.lost_at ?? opp.updated_at) >= since);
  const closedCount = won.length + lost.length;
  const wonValue = won.reduce((sum, opp) => sum + Number(opp.value ?? 0), 0);
  const avgDealSize = won.length > 0 ? wonValue / won.length : 0;
  const avgCycleDays = won.length > 0
    ? won.reduce((sum, opp) => {
        const created = new Date(opp.created_at).getTime();
        const closed = new Date(opp.won_at ?? opp.updated_at).getTime();
        return sum + Math.max(1, Math.round((closed - created) / 86400000));
      }, 0) / won.length
    : 0;
  const winRate = closedCount > 0 ? (won.length / closedCount) * 100 : 0;

  return {
    open_opportunities: open.length,
    win_rate: winRate,
    avg_deal_size: avgDealSize,
    avg_cycle_days: avgCycleDays,
    sales_velocity: avgCycleDays > 0 ? (open.length * avgDealSize * (winRate / 100)) / avgCycleDays : 0,
  };
}

export function useWeightedPipeline(companyId: string | null) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.weightedPipeline(companyId ?? '', scope),
    enabled: !!companyId,
    queryFn: async (): Promise<WeightedPipelineStage[]> => {
      if (restrictToAssigned && user?.id) {
        return fetchAssignedWeightedPipeline(companyId!, user.id);
      }
      const { data, error } = await supabase
        .rpc('get_weighted_pipeline', { p_company_id: companyId! });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        opportunity_count: Number(row.opportunity_count),
        total_value: Number(row.total_value),
        weighted_value: Number(row.weighted_value),
        avg_probability: Number(row.avg_probability),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesForecast(companyId: string | null, monthsAhead = 3) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.forecast(companyId ?? '', monthsAhead, scope),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesForecastMonth[]> => {
      if (restrictToAssigned && user?.id) {
        return fetchAssignedSalesForecast(companyId!, user.id, monthsAhead);
      }
      const { data, error } = await supabase
        .rpc('get_sales_forecast', {
          p_company_id: companyId!,
          p_months_ahead: monthsAhead,
        });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        expected_revenue: Number(row.expected_revenue),
        weighted_revenue: Number(row.weighted_revenue),
        opportunity_count: Number(row.opportunity_count),
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useStalledOpportunities(companyId: string | null) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.stalled(companyId ?? '', scope),
    enabled: !!companyId,
    queryFn: async (): Promise<StalledOpportunity[]> => {
      const { data, error } = await supabase
        .rpc('get_stalled_opportunities', { p_company_id: companyId! });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        days_stalled: Number(row.days_stalled),
        stalled_threshold: Number(row.stalled_threshold),
        value: Number(row.value),
      })).filter((row: StalledOpportunity) => !restrictToAssigned || row.assigned_to === user?.id);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesVelocity(companyId: string | null, daysBack = 90) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: [...salesOSKeys.velocity(companyId ?? '', daysBack), scope],
    enabled: !!companyId,
    queryFn: async (): Promise<SalesVelocity | null> => {
      if (restrictToAssigned && user?.id) {
        return fetchAssignedSalesVelocity(companyId!, user.id, daysBack);
      }
      const { data, error } = await supabase
        .rpc('get_sales_velocity', {
          p_company_id: companyId!,
          p_days_back: daysBack,
        });
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const row = data[0];
      return {
        open_opportunities: Number(row.open_opportunities),
        win_rate: Number(row.win_rate),
        avg_deal_size: Number(row.avg_deal_size),
        avg_cycle_days: Number(row.avg_cycle_days),
        sales_velocity: Number(row.sales_velocity),
      };
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useSalesTargets(companyId: string | null, year: number) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: [...salesOSKeys.targets(companyId ?? '', year), scope],
    enabled: !!companyId,
    queryFn: async (): Promise<SalesTarget[]> => {
      let query: any = supabase
        .from('sales_targets')
        .select('*')
        .eq('company_id', companyId!)
        .eq('year', year)
        .order('month', { ascending: true });
      if (restrictToAssigned && user?.id) query = query.eq('assigned_to', user.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSellerPerformance(
  companyId: string | null,
  dateFrom: string, // ISO YYYY-MM-DD inclusive
  dateTo: string    // ISO YYYY-MM-DD exclusive
) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.sellerPerformance(companyId ?? '', dateFrom, dateTo, scope),
    enabled: !!companyId,
    queryFn: async (): Promise<SellerPerformance[]> => {
      // Sprint 2: derive year/month from range start to look up matching target
      const refDate = new Date(dateFrom);
      const year = refDate.getFullYear();
      const month = refDate.getMonth() + 1;

      // Sprint 1.4: query parallele invece di seriali (-30ms latency)
      // Nota: nessun filtro data a livello DB — il filtro per-status viene
      // applicato client-side sotto per usare la data corretta (won_at/lost_at
      // invece di updated_at che cambia a ogni modifica, causando doppi conteggi).
      let oppsQuery: any = supabase
        .from('marketing_opportunities')
        .select('assigned_to, status, value, created_at, won_at, lost_at')
        .eq('company_id', companyId!);
      let targetsQuery: any = supabase
        .from('sales_targets')
        .select('assigned_to, user_id, target_amount, target_revenue, period_type, year, month')
        .eq('company_id', companyId!);
      if (restrictToAssigned && user?.id) {
        oppsQuery = oppsQuery.eq('assigned_to', user.id);
        targetsQuery = targetsQuery.or(`assigned_to.eq.${user.id},user_id.eq.${user.id}`);
      }

      const [oppsResult, targetsResult] = await Promise.all([oppsQuery, targetsQuery]);
      if (oppsResult.error) throw oppsResult.error;
      if (targetsResult.error) throw targetsResult.error;
      const opps = oppsResult.data;
      const targets = targetsResult.data;

      // Profili utenti — usa first_name + last_name (schema reale del progetto)
      const sellerIds = [...new Set((opps ?? []).map((o: any) => o.assigned_to).filter(Boolean))];
      let profiles: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
      if (sellerIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', sellerIds as string[]);
        profiles = profileData ?? [];
      }

      const sellerMap = new Map<string | null, SellerPerformance>();

      (opps ?? []).forEach((opp: any) => {
        const key = opp.assigned_to ?? 'unassigned';
        const value = Number(opp.value ?? 0);

        // Filtro per-status con la data corretta (fix: era updated_at, che cambia
        // a ogni modifica e causava doppi conteggi per deal chiusi fuori periodo).
        if (opp.status === 'won') {
          const d = (opp.won_at ?? opp.created_at) as string | null;
          if (!d || d < dateFrom || d >= dateTo) return;
        } else if (opp.status === 'open') {
          if (opp.created_at < dateFrom || opp.created_at >= dateTo) return;
        } else if (opp.status === 'lost') {
          const d = (opp.lost_at ?? opp.created_at) as string | null;
          if (!d || d < dateFrom || d >= dateTo) return;
        } else {
          return;
        }

        if (!sellerMap.has(key)) {
          const profile = profiles.find((p) => p.id === opp.assigned_to);
          const displayName = profile
            ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
            : opp.assigned_to
            ? 'Venditore'
            : 'Non assegnato';
          sellerMap.set(key, {
            assigned_to: opp.assigned_to,
            display_name: displayName || 'Venditore',
            won_count: 0,
            won_value: 0,
            open_count: 0,
            open_value: 0,
            lost_count: 0,
            win_rate: 0,
            avg_deal_size: 0,
            target_amount: 0,
            target_achievement: 0,
          });
        }
        const seller = sellerMap.get(key)!;
        if (opp.status === 'won') {
          seller.won_count++;
          seller.won_value += value;
        } else if (opp.status === 'open') {
          seller.open_count++;
          seller.open_value += value;
        } else if (opp.status === 'lost') {
          seller.lost_count++;
        }
      });

      (targets ?? []).forEach((t: any) => {
        const key = t.assigned_to ?? t.user_id ?? 'unassigned';
        const seller = sellerMap.get(key);
        if (seller) {
          const isCurrentMonthly = Number(t.year) === year && Number(t.month) === month;
          const isWeeklyFallback = t.period_type === 'weekly' && (t.year == null || t.month == null);
          if (!isCurrentMonthly && !isWeeklyFallback) return;
          const targetAmount = Number(t.target_amount ?? 0);
          const targetRevenue = Number(t.target_revenue ?? 0);
          const monthlyEquivalent = targetAmount > 0
            ? targetAmount
            : isWeeklyFallback
              ? targetRevenue * 4
              : targetRevenue;
          if (isCurrentMonthly || seller.target_amount <= 0) {
            seller.target_amount = monthlyEquivalent;
          }
        }
      });

      return Array.from(sellerMap.values())
        .map((s) => {
          const closedCount = s.won_count + s.lost_count;
          return {
            ...s,
            win_rate: closedCount > 0 ? (s.won_count / closedCount) * 100 : 0,
            avg_deal_size: s.won_count > 0 ? s.won_value / s.won_count : 0,
            target_achievement:
              s.target_amount > 0 ? (s.won_value / s.target_amount) * 100 : 0,
          };
        })
        .sort((a, b) => b.won_value - a.won_value);
    },
    staleTime: 1000 * 60 * 15,
  });
}

export function useConversionBySource(companyId: string | null, dateFrom: string | null = null) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.conversionBySource(companyId ?? '', dateFrom, scope),
    enabled: !!companyId,
    queryFn: async (): Promise<ConversionBySource[]> => {
      let q: any = supabase
        .from('marketing_opportunities')
        .select('contact_id, source, status, value, marketing_contacts(source)')
        .eq('company_id', companyId!);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (restrictToAssigned && user?.id) q = q.eq('assigned_to', user.id);
      const { data, error } = await q;
      if (error) throw error;

      const sourceMap = new Map<string, ConversionBySource & { contact_ids: Set<string> }>();
      (data ?? []).forEach((opp: any) => {
        const contactSource = Array.isArray(opp.marketing_contacts)
          ? opp.marketing_contacts[0]?.source
          : opp.marketing_contacts?.source;
        const src = String(opp.source || contactSource || 'Sconosciuto').trim() || 'Sconosciuto';
        if (!sourceMap.has(src)) {
          sourceMap.set(src, {
            source: src,
            total_contacts: 0,
            total_opportunities: 0,
            won_opportunities: 0,
            win_rate: 0,
            total_won_value: 0,
            avg_deal_size: 0,
            contact_ids: new Set<string>(),
          });
        }
        const s = sourceMap.get(src)!;
        if (opp.contact_id) s.contact_ids.add(opp.contact_id);
        s.total_contacts = s.contact_ids.size;
        s.total_opportunities++;
        if (opp.status === 'won') {
          s.won_opportunities++;
          s.total_won_value += Number(opp.value ?? 0);
        }
      });

      return Array.from(sourceMap.values())
        .map(({ contact_ids: _contactIds, ...s }) => ({
          ...s,
          win_rate:
            s.total_opportunities > 0
              ? (s.won_opportunities / s.total_opportunities) * 100
              : 0,
          avg_deal_size:
            s.won_opportunities > 0
              ? s.total_won_value / s.won_opportunities
              : 0,
        }))
        .sort((a, b) => b.total_won_value - a.total_won_value);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useTopLeads(companyId: string | null, limit = 20) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.topLeads(companyId ?? '', limit, scope),
    enabled: !!companyId,
    queryFn: async (): Promise<LeadScoreContact[]> => {
      let q: any = supabase
        .from('marketing_contacts')
        .select(`
          id,
          first_name,
          last_name,
          company_name,
          lead_score,
          icp_score,
          icp_tier,
          source,
          city,
          assigned_to,
          last_activity_at,
          marketing_opportunities!inner(id, status)
        `)
        .eq('company_id', companyId!)
        .order('lead_score', { ascending: false })
        .limit(limit);
      if (restrictToAssigned && user?.id) q = q.eq('assigned_to', user.id);
      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((c: any) => ({
        id: c.id,
        full_name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        company_name: c.company_name,
        lead_score: c.lead_score ?? 0,
        icp_score: c.icp_score ?? 0,
        icp_tier: c.icp_tier,
        source: c.source,
        city: c.city,
        assigned_to: c.assigned_to,
        last_activity_at: c.last_activity_at,
        open_opportunities_count: (c.marketing_opportunities ?? []).filter(
          (o: any) => o.status === 'open'
        ).length,
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

// ============================================================
// SPRINT 3: QUOTE REVENUE — integrazione preventivi
// ============================================================
/**
 * Calcola ricavo effettivo (dalle quote firmate/convertite) e pipeline
 * preventivi (quote inviate ma non ancora firmate) nel periodo.
 *
 * Chiavi:
 *  - quote.status = 'accettata' | 'convertita' → ricavo effettivo
 *  - quote.status = 'inviata'                  → pipeline preventivi
 *  - quote.status in ('rifiutata','scaduta')   → persa (per acceptance_rate)
 */
export function useQuoteRevenue(
  companyId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const restrictToAssigned = shouldRestrictToAssigned(permissions, user?.id);
  const scope = salesOSScopeKey(restrictToAssigned, user?.id);

  return useQuery({
    queryKey: salesOSKeys.quoteRevenue(companyId ?? '', dateFrom, dateTo, scope),
    enabled: !!companyId,
    queryFn: async (): Promise<QuoteRevenueSummary> => {
      let periodQuery: any = supabase
        .from('quotes')
        .select('status, total, signed_at, created_at')
        .eq('company_id', companyId!)
        .gte('created_at', dateFrom)
        .lt('created_at', dateTo);
      let activeQuery: any = supabase
        .from('quotes')
        .select('status, total')
        .eq('company_id', companyId!)
        .eq('status', 'inviata');
      let oppsWithQuoteQuery: any = supabase
        .from('marketing_opportunities')
        .select('id, quotes!inner(id, status)')
        .eq('company_id', companyId!)
        .eq('status', 'open')
        .in('quotes.status', ['inviata', 'accettata', 'convertita']);
      if (restrictToAssigned && user?.id) {
        periodQuery = periodQuery.eq('assigned_to', user.id);
        activeQuery = activeQuery.eq('assigned_to', user.id);
        oppsWithQuoteQuery = oppsWithQuoteQuery.eq('assigned_to', user.id);
      }

      // Tutte le quote del periodo (per status) + quote attive open (indipendenti dal periodo)
      const [periodResult, activeResult, oppsWithQuoteResult] = await Promise.all([
        periodQuery,
        activeQuery,
        oppsWithQuoteQuery,
      ]);

      if (periodResult.error) throw periodResult.error;
      if (activeResult.error) throw activeResult.error;
      if (oppsWithQuoteResult.error) throw oppsWithQuoteResult.error;

      const period = periodResult.data ?? [];
      const active = activeResult.data ?? [];
      const oppsWithQuote = oppsWithQuoteResult.data ?? [];

      let actual_revenue = 0;
      let signed_quotes_count = 0;
      let rejected_count = 0;
      for (const q of period) {
        const total = Number(q.total ?? 0);
        if (q.status === 'accettata' || q.status === 'convertita') {
          actual_revenue += total;
          signed_quotes_count += 1;
        } else if (q.status === 'rifiutata' || q.status === 'scaduta') {
          rejected_count += 1;
        }
      }

      let active_quotes_value = 0;
      for (const q of active) {
        active_quotes_value += Number(q.total ?? 0);
      }

      const closed_count = signed_quotes_count + rejected_count;

      return {
        actual_revenue,
        signed_quotes_count,
        active_quotes_value,
        active_quotes_count: active.length,
        avg_signed_ticket: signed_quotes_count > 0 ? actual_revenue / signed_quotes_count : 0,
        opportunities_with_quote: oppsWithQuote.length,
        acceptance_rate: closed_count > 0 ? (signed_quotes_count / closed_count) * 100 : 0,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export function useUpdateOpportunityMutation() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        probability: number | null;
        expected_close_date: string | null;
        next_action: string | null;
        next_action_date: string | null;
        lost_reason: string | null;
        // colonna legacy: automazioni/report vecchi leggono loss_reason
        loss_reason: string | null;
        lost_reason_category: string | null;
        competitor_won: string | null;
        status: string;
      }>;
    }) => {
      if (!companyId) throw new Error('Azienda non selezionata');
      if (!(permissions.canEditMarketingOpportunities || permissions.canEditMarketing)) {
        throw new Error('Non hai i permessi per modificare opportunità');
      }
      if (data.probability !== undefined && data.probability !== null) {
        const probability = Number(data.probability);
        if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
          throw new Error('La probabilità deve essere un numero tra 0 e 100');
        }
      }
      if (data.status === 'lost' && !data.lost_reason_category && !data.lost_reason) {
        throw new Error("Indica il motivo prima di segnare l'opportunità come persa");
      }

      let query: any = supabase
        .from('marketing_opportunities')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId);
      if (shouldRestrictToAssigned(permissions, user?.id)) {
        query = query.eq('assigned_to', user!.id);
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOSKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}

export function useUpsertSalesTargetMutation() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (target: Omit<SalesTarget, 'id'>) => {
      if (!companyId) throw new Error('Azienda non selezionata');
      if (!(permissions.canEditMarketingOpportunities || permissions.canEditMarketing)) {
        throw new Error('Non hai i permessi per modificare gli obiettivi commerciali');
      }
      if (target.company_id !== companyId) {
        throw new Error("L'obiettivo non appartiene all'azienda selezionata");
      }
      if (shouldRestrictToAssigned(permissions, user?.id) && target.assigned_to !== user?.id) {
        throw new Error('Puoi modificare solo i tuoi obiettivi commerciali');
      }
      if (!Number.isInteger(target.year) || target.year < 2000 || target.year > 2100) {
        throw new Error("Anno obiettivo non valido");
      }
      if (!Number.isInteger(target.month) || target.month < 1 || target.month > 12) {
        throw new Error("Mese obiettivo non valido");
      }
      if (Number(target.target_amount ?? 0) < 0 || Number(target.target_deals ?? 0) < 0) {
        throw new Error('Gli obiettivi non possono essere negativi');
      }

      const { error } = await supabase
        .from('sales_targets')
        .upsert({ ...target, updated_at: new Date().toISOString() } as any, {
          onConflict: 'company_id,assigned_to,year,month',
        });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: salesOSKeys.targets(variables.company_id, variables.year),
      });
      queryClient.invalidateQueries({ queryKey: salesOSKeys.all });
    },
  });
}

// ============================================================
// HOOK HELPER: companyId dall'AuthContext
// ============================================================
export function useSalesOSCompanyId(): string | null {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.id ?? null;
}

// ============================================================
// SO5: LEAD SCORE RECALCULATION
// ============================================================

export function useRecalculateAllLeadScores(companyId: string | null) {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('companyId mancante');
      if (effectiveCompany?.id !== companyId) throw new Error('Azienda non selezionata');
      if (!(permissions.canEditMarketingContacts || permissions.canEditMarketing)) {
        throw new Error('Non hai i permessi per ricalcolare i lead score');
      }

      // Sprint 4: carica config dinamica (fallback default)
      const { data: cfgRow } = await supabase
        .from('lead_scoring_config')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      const cfg: LeadScoringConfig = (cfgRow as any) ?? {
        company_id: companyId,
        ...DEFAULT_LEAD_SCORING_CONFIG,
      };

      // Fetch all contacts for this company
      let contactsQuery: any = supabase
        .from('marketing_contacts')
        .select('id, first_name, last_name, company_name, phone, city, source, address')
        .eq('company_id', companyId);
      if (shouldRestrictToAssigned(permissions, user?.id)) {
        contactsQuery = contactsQuery.eq('assigned_to', user!.id);
      }
      const { data: contacts, error: cErr } = await contactsQuery;
      if (cErr) throw cErr;
      if (!contacts?.length) return { updated: 0 };

      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      let updated = 0;

      // Process in batches of 10 to avoid overwhelming the DB
      for (let i = 0; i < contacts.length; i += 10) {
        const batch = contacts.slice(i, i + 10);
        await Promise.all(batch.map(async (contact: any) => {
          const [{ count: activitiesCount }, { count: recentCount }, { data: opps }] = await Promise.all([
            supabase.from('marketing_contact_activities').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('company_id', companyId!),
            supabase.from('marketing_contact_activities').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('company_id', companyId!).gte('created_at', fourteenDaysAgo),
            supabase.from('marketing_opportunities').select('id, status').eq('contact_id', contact.id).eq('company_id', companyId!),
          ]);

          const openOpps = (opps ?? []).filter((o) => o.status === 'open');
          const { leadScore, icpScore } = calculateLeadScoreWithConfig({
            hasCompanyName: !!contact.company_name,
            hasPhone: !!contact.phone,
            hasAddress: !!contact.address,
            source: contact.source,
            city: contact.city,
            activitiesCount: activitiesCount ?? 0,
            hasOpenOpportunity: openOpps.length > 0,
            hasRecentActivity: (recentCount ?? 0) > 0,
            opportunitiesCount: (opps ?? []).length,
          }, cfg);

          const icpTier = getIcpTierWithConfig(icpScore, cfg);
          const { error: updateError } = await supabase.from('marketing_contacts').update({
            lead_score: leadScore,
            icp_score: icpScore,
            icp_tier: icpTier,
            last_score_update: new Date().toISOString(),
          }).eq('id', contact.id).eq('company_id', companyId);
          if (updateError) throw updateError;
          updated++;
        }));
      }

      return { updated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOSKeys.topLeads(companyId ?? '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
    },
  });
}

export function useRecalculateLeadScore(companyId: string | null) {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (contactId: string) => {
      if (!companyId) throw new Error('companyId mancante');
      if (effectiveCompany?.id !== companyId) throw new Error('Azienda non selezionata');
      if (!(permissions.canEditMarketingContacts || permissions.canEditMarketing)) {
        throw new Error('Non hai i permessi per ricalcolare il lead score');
      }

      // 1. Carica i dati del contatto
      let contactQuery: any = supabase
        .from('marketing_contacts')
        .select('id, first_name, last_name, company_name, phone, city, source, address')
        .eq('id', contactId)
        .eq('company_id', companyId);
      if (shouldRestrictToAssigned(permissions, user?.id)) {
        contactQuery = contactQuery.eq('assigned_to', user!.id);
      }
      const { data: contact, error: contactError } = await contactQuery.single();
      if (contactError) throw contactError;

      // 2. Conta attività totali
      const { count: activitiesCount } = await supabase
        .from('marketing_contact_activities')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .eq('company_id', companyId);

      // 3. Attività recenti (ultimi 14gg)
      const fourteenDaysAgo = new Date(
        Date.now() - 14 * 86400000
      ).toISOString();
      const { count: recentCount } = await supabase
        .from('marketing_contact_activities')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .eq('company_id', companyId)
        .gte('created_at', fourteenDaysAgo);

      // 4. Opportunità (totali e aperte)
      const { data: opps } = await supabase
        .from('marketing_opportunities')
        .select('id, status')
        .eq('contact_id', contactId)
        .eq('company_id', companyId);

      const openOpps = (opps ?? []).filter((o) => o.status === 'open');

      // Sprint 4: config dinamica per-company
      const { data: cfgRow } = await supabase
        .from('lead_scoring_config')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      const cfg: LeadScoringConfig = (cfgRow as any) ?? {
        company_id: companyId,
        ...DEFAULT_LEAD_SCORING_CONFIG,
      };

      // 5. Calcola score (con config dinamica)
      const { leadScore, icpScore, behavioralScore } = calculateLeadScoreWithConfig({
        hasCompanyName: !!contact.company_name,
        hasPhone: !!contact.phone,
        hasAddress: !!contact.address,
        source: contact.source,
        city: contact.city,
        activitiesCount: activitiesCount ?? 0,
        hasOpenOpportunity: openOpps.length > 0,
        hasRecentActivity: (recentCount ?? 0) > 0,
        opportunitiesCount: (opps ?? []).length,
      }, cfg);

      const icpTier = getIcpTierWithConfig(icpScore, cfg);

      // 6. Aggiorna il contatto
      const { error: updateError } = await supabase
        .from('marketing_contacts')
        .update({
          lead_score: leadScore,
          icp_score: icpScore,
          icp_tier: icpTier,
          last_score_update: new Date().toISOString(),
        })
        .eq('id', contactId)
        .eq('company_id', companyId);
      if (updateError) throw updateError;

      return { leadScore, icpScore, behavioralScore, icpTier };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: salesOSKeys.topLeads(companyId ?? ''),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
    },
  });
}
