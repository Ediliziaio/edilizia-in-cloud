import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
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
  weightedPipeline: (companyId: string) =>
    [...salesOSKeys.all, 'weighted-pipeline', companyId] as const,
  forecast: (companyId: string, months: number) =>
    [...salesOSKeys.all, 'forecast', companyId, months] as const,
  stalled: (companyId: string) =>
    [...salesOSKeys.all, 'stalled', companyId] as const,
  velocity: (companyId: string, daysBack: number) =>
    [...salesOSKeys.all, 'velocity', companyId, daysBack] as const,
  targets: (companyId: string, year: number) =>
    [...salesOSKeys.all, 'targets', companyId, year] as const,
  sellerPerformance: (companyId: string, dateFrom: string, dateTo: string) =>
    [...salesOSKeys.all, 'seller-perf', companyId, dateFrom, dateTo] as const,
  conversionBySource: (companyId: string, dateFrom: string | null) =>
    [...salesOSKeys.all, 'conversion-source', companyId, dateFrom ?? 'all'] as const,
  topLeads: (companyId: string, limit: number = 10) =>
    [...salesOSKeys.all, 'top-leads', companyId, limit] as const,
  quoteRevenue: (companyId: string, dateFrom: string, dateTo: string) =>
    [...salesOSKeys.all, 'quote-revenue', companyId, dateFrom, dateTo] as const,
};

// ============================================================
// HOOKS
// ============================================================

export function useWeightedPipeline(companyId: string | null) {
  return useQuery({
    queryKey: salesOSKeys.weightedPipeline(companyId ?? ''),
    enabled: !!companyId,
    queryFn: async (): Promise<WeightedPipelineStage[]> => {
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
  return useQuery({
    queryKey: salesOSKeys.forecast(companyId ?? '', monthsAhead),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesForecastMonth[]> => {
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
  return useQuery({
    queryKey: salesOSKeys.stalled(companyId ?? ''),
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
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesVelocity(companyId: string | null, daysBack = 90) {
  return useQuery({
    queryKey: salesOSKeys.velocity(companyId ?? '', daysBack),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesVelocity | null> => {
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
  return useQuery({
    queryKey: salesOSKeys.targets(companyId ?? '', year),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesTarget[]> => {
      const { data, error } = await supabase
        .from('sales_targets')
        .select('*')
        .eq('company_id', companyId!)
        .eq('year', year)
        .order('month', { ascending: true });
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
  return useQuery({
    queryKey: salesOSKeys.sellerPerformance(companyId ?? '', dateFrom, dateTo),
    enabled: !!companyId,
    queryFn: async (): Promise<SellerPerformance[]> => {
      // Sprint 2: derive year/month from range start to look up matching target
      const refDate = new Date(dateFrom);
      const year = refDate.getFullYear();
      const month = refDate.getMonth() + 1;

      // Sprint 1.4: query parallele invece di seriali (-30ms latency)
      const [oppsResult, targetsResult] = await Promise.all([
        supabase
          .from('marketing_opportunities')
          .select('assigned_to, status, value, created_at')
          .eq('company_id', companyId!)
          .gte('updated_at', dateFrom)
          .lt('updated_at', dateTo),
        supabase
          .from('sales_targets')
          .select('assigned_to, target_amount')
          .eq('company_id', companyId!)
          .eq('year', year)
          .eq('month', month),
      ]);
      if (oppsResult.error) throw oppsResult.error;
      if (targetsResult.error) throw targetsResult.error;
      const opps = oppsResult.data;
      const targets = targetsResult.data;

      // Profili utenti — usa first_name + last_name (schema reale del progetto)
      const sellerIds = [...new Set((opps ?? []).map((o) => o.assigned_to).filter(Boolean))];
      let profiles: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
      if (sellerIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', sellerIds as string[]);
        profiles = profileData ?? [];
      }

      const sellerMap = new Map<string | null, SellerPerformance>();

      (opps ?? []).forEach((opp) => {
        const key = opp.assigned_to ?? 'unassigned';
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
        const value = Number(opp.value ?? 0);
        if (opp.status === 'won') {
          seller.won_count++;
          seller.won_value += value;
        } else if (opp.status === 'open') {
          seller.open_count++;
          seller.open_value += value;
        } else {
          seller.lost_count++;
        }
      });

      (targets ?? []).forEach((t) => {
        const key = t.assigned_to ?? 'unassigned';
        const seller = sellerMap.get(key);
        if (seller) {
          seller.target_amount = Number(t.target_amount);
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
  return useQuery({
    queryKey: salesOSKeys.conversionBySource(companyId ?? '', dateFrom),
    enabled: !!companyId,
    queryFn: async (): Promise<ConversionBySource[]> => {
      let q = supabase
        .from('marketing_opportunities')
        .select('source, status, value')
        .eq('company_id', companyId!)
        .not('source', 'is', null);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      const { data, error } = await q;
      if (error) throw error;

      const sourceMap = new Map<string, ConversionBySource>();
      (data ?? []).forEach((opp) => {
        const src = opp.source ?? 'Sconosciuto';
        if (!sourceMap.has(src)) {
          sourceMap.set(src, {
            source: src,
            total_contacts: 0,
            total_opportunities: 0,
            won_opportunities: 0,
            win_rate: 0,
            total_won_value: 0,
            avg_deal_size: 0,
          });
        }
        const s = sourceMap.get(src)!;
        s.total_opportunities++;
        if (opp.status === 'won') {
          s.won_opportunities++;
          s.total_won_value += Number(opp.value ?? 0);
        }
      });

      return Array.from(sourceMap.values())
        .map((s) => ({
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
  return useQuery({
    queryKey: salesOSKeys.topLeads(companyId ?? '', limit),
    enabled: !!companyId,
    queryFn: async (): Promise<LeadScoreContact[]> => {
      const { data, error } = await supabase
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
  return useQuery({
    queryKey: salesOSKeys.quoteRevenue(companyId ?? '', dateFrom, dateTo),
    enabled: !!companyId,
    queryFn: async (): Promise<QuoteRevenueSummary> => {
      // Tutte le quote del periodo (per status) + quote attive open (indipendenti dal periodo)
      const [periodResult, activeResult, oppsWithQuoteResult] = await Promise.all([
        supabase
          .from('quotes')
          .select('status, total, signed_at, created_at')
          .eq('company_id', companyId!)
          .gte('created_at', dateFrom)
          .lt('created_at', dateTo),
        supabase
          .from('quotes')
          .select('status, total')
          .eq('company_id', companyId!)
          .eq('status', 'inviata'),
        supabase
          .from('marketing_opportunities')
          .select('id, quotes!inner(id, status)')
          .eq('company_id', companyId!)
          .eq('status', 'open')
          .in('quotes.status', ['inviata', 'accettata', 'convertita']),
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
        lost_reason_category: string | null;
        competitor_won: string | null;
        status: string;
      }>;
    }) => {
      const { error } = await supabase
        .from('marketing_opportunities')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);
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
  return useMutation({
    mutationFn: async (target: Omit<SalesTarget, 'id'>) => {
      const { error } = await supabase
        .from('sales_targets')
        .upsert(target as any, { onConflict: 'company_id,assigned_to,year,month' });
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

  return useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('companyId mancante');

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
      const { data: contacts, error: cErr } = await supabase
        .from('marketing_contacts')
        .select('id, first_name, last_name, company_name, phone, city, source, address')
        .eq('company_id', companyId);
      if (cErr) throw cErr;
      if (!contacts?.length) return { updated: 0 };

      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      let updated = 0;

      // Process in batches of 10 to avoid overwhelming the DB
      for (let i = 0; i < contacts.length; i += 10) {
        const batch = contacts.slice(i, i + 10);
        await Promise.all(batch.map(async (contact) => {
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
          await supabase.from('marketing_contacts').update({
            lead_score: leadScore,
            icp_score: icpScore,
            icp_tier: icpTier,
            last_score_update: new Date().toISOString(),
          }).eq('id', contact.id);
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

  return useMutation({
    mutationFn: async (contactId: string) => {
      if (!companyId) throw new Error('companyId mancante');

      // 1. Carica i dati del contatto
      const { data: contact, error: contactError } = await supabase
        .from('marketing_contacts')
        .select('id, first_name, last_name, company_name, phone, city, source, address')
        .eq('id', contactId)
        .single();
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
        .eq('id', contactId);
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
