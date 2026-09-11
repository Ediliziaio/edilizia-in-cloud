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
  win_rate: number | null;        // vinte ÷ (vinte + perse); vuoto se nel periodo non si è chiuso niente
  avg_deal_size: number;
  avg_cycle_days: number | null;  // vuoto se nel periodo non c'è una vinta
  sales_velocity: number | null;  // € al giorno: valore pipeline aperta × tasso di chiusura ÷ ciclo medio
}

export interface ConversionBySource {
  source: string;
  total_contacts: number;
  total_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  win_rate: number;              // tasso di chiusura: vinte ÷ (vinte + perse)
  conversion_rate: number | null; // quante delle create nel periodo sono state vinte
  total_won_value: number;
  avg_deal_size: number;
}

export interface QuoteRevenueSummary {
  actual_revenue: number;            // imponibile (IVA esclusa) dei preventivi firmati nel periodo, per data di firma
  signed_quotes_count: number;       // # preventivi accettati/convertiti
  active_quotes_value: number;       // somma total preventivi inviati (pipeline preventivi)
  active_quotes_count: number;       // # preventivi inviati
  avg_signed_ticket: number;         // ricavo medio per preventivo firmato
  opportunities_with_quote: number;  // # opportunità open con almeno un preventivo attivo
  acceptance_rate: number | null;    // % accettate / (accettate + rifiutate + scadute) tra quelli del periodo
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

// Le funzioni del database rispettano le regole di visibilità (SECURITY
// INVOKER, migrazioni 20280915410002-005): chi vede solo i propri lead riceve
// già solo i propri numeri, dallo stesso calcolo di tutti gli altri. La cache
// resta separata per utente.
function scopeUtente(userId?: string | null) {
  return userId ? `utente:${userId}` : 'anonimo';
}

/** Un tasso o un ciclo che non si può calcolare resta vuoto, non diventa 0. */
function numeroONull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function useWeightedPipeline(companyId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: salesOSKeys.weightedPipeline(companyId ?? '', scopeUtente(user?.id)),
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
  const { user } = useAuth();

  return useQuery({
    queryKey: salesOSKeys.forecast(companyId ?? '', monthsAhead, scopeUtente(user?.id)),
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
  const { user } = useAuth();

  return useQuery({
    queryKey: salesOSKeys.stalled(companyId ?? '', scopeUtente(user?.id)),
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
  const { user } = useAuth();

  return useQuery({
    queryKey: [...salesOSKeys.velocity(companyId ?? '', daysBack), scopeUtente(user?.id)],
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
        win_rate: numeroONull(row.win_rate),
        avg_deal_size: Number(row.avg_deal_size ?? 0),
        avg_cycle_days: numeroONull(row.avg_cycle_days),
        sales_velocity: numeroONull(row.sales_velocity),
      };
    },
    staleTime: 1000 * 60 * 30,
  });
}

/** YYYY-MM-DD in ora locale (toISOString darebbe il giorno UTC, cioè ieri fino alle 2 di notte). */
function dataLocale(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le funzioni del database prendono l'ultimo giorno COMPRESO; i periodi della pagina l'esclusivo. */
function ultimoGiornoCompreso(dateToEsclusivo: string | null) {
  if (!dateToEsclusivo) return dataLocale(new Date());
  const d = new Date(`${dateToEsclusivo}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dataLocale(d);
}

/**
 * Vendite per fonte (vendite_per_fonte, 20280915410005): create, vinte e perse
 * nel periodo con le regole di tutti i report. «win_rate» è il tasso di
 * chiusura, vinte ÷ (vinte + perse); prima era vinte ÷ tutte le opportunità,
 * aperte comprese.
 */
export function useConversionBySource(
  companyId: string | null,
  dateFrom: string | null = null,
  dateTo: string | null = null,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...salesOSKeys.conversionBySource(companyId ?? '', dateFrom, scopeUtente(user?.id)), dateTo ?? 'oggi'],
    enabled: !!companyId,
    queryFn: async (): Promise<ConversionBySource[]> => {
      const { data, error } = await (supabase as any).rpc('vendite_per_fonte', {
        p_company: companyId!,
        p_da: dateFrom ?? '2000-01-01',
        p_a: ultimoGiornoCompreso(dateTo),
      });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((row) => ({
          source: String(row.fonte ?? 'Sconosciuto'),
          total_contacts: Number(row.contatti ?? 0),
          total_opportunities: Number(row.create_n ?? 0),
          won_opportunities: Number(row.vinte ?? 0),
          lost_opportunities: Number(row.perse ?? 0),
          win_rate: Number(row.tasso_chiusura ?? 0),
          conversion_rate: numeroONull(row.conversione),
          total_won_value: Number(row.valore_vinto ?? 0),
          avg_deal_size: Number(row.ticket_medio ?? 0),
        }))
        .sort((a, b) => b.total_won_value - a.total_won_value || b.total_opportunities - a.total_opportunities);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useTopLeads(companyId: string | null, limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: salesOSKeys.topLeads(companyId ?? '', limit, scopeUtente(user?.id)),
    enabled: !!companyId,
    queryFn: async (): Promise<LeadScoreContact[]> => {
      // Chi vede solo i propri contatti li riceve già filtrati dalle regole di
      // visibilità: il vecchio filtro su assigned_to nascondeva quelli che segue
      // come call center o follower.
      const { data, error } = await (supabase as any)
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
        .is('deleted_at', null)
        .is('marketing_opportunities.deleted_at', null)
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
  const { user } = useAuth();

  return useQuery({
    queryKey: salesOSKeys.quoteRevenue(companyId ?? '', dateFrom, dateTo, scopeUtente(user?.id)),
    enabled: !!companyId,
    queryFn: async (): Promise<QuoteRevenueSummary> => {
      // vendite_preventivi (20280915410001): firmati per data di FIRMA e importo
      // SENZA IVA (prima: data di creazione e totale ivato), cancellati esclusi.
      const [riepilogo, conPreventivo] = await Promise.all([
        (supabase as any).rpc('vendite_preventivi', {
          p_company: companyId!,
          p_da: dateFrom,
          p_a: ultimoGiornoCompreso(dateTo),
        }),
        (supabase as any)
          .from('marketing_opportunities')
          .select('id, quotes!inner(id)', { count: 'exact', head: true })
          .eq('company_id', companyId!)
          .eq('status', 'open')
          .is('deleted_at', null)
          .in('quotes.status', ['inviata', 'accettata'])
          .is('quotes.deleted_at', null),
      ]);
      if (riepilogo.error) throw riepilogo.error;
      if (conPreventivo.error) throw conPreventivo.error;

      const r = (Array.isArray(riepilogo.data) ? riepilogo.data[0] : riepilogo.data) ?? {};
      const firmati = Number(r.firmati ?? 0);
      const firmatiValore = Number(r.firmati_valore ?? 0);
      return {
        actual_revenue: firmatiValore,
        signed_quotes_count: firmati,
        active_quotes_value: Number(r.in_attesa_valore ?? 0),
        active_quotes_count: Number(r.in_attesa ?? 0),
        avg_signed_ticket: firmati > 0 ? firmatiValore / firmati : 0,
        opportunities_with_quote: conPreventivo.count ?? 0,
        acceptance_rate: numeroONull(r.tasso_accettazione),
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
