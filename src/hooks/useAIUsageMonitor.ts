import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Breakdown per (company × model) — alimenta il drill-down accordion nella tabella.
 * Tutti i numeri sono già aggregati nel periodo richiesto.
 */
export interface AIUsageModelBreakdown {
  model: string;
  provider: string;
  requests: number;
  cost_eur: number;
  revenue_eur: number;
  margin_eur: number;
  share_pct: number; // % del costo totale di quella company
}

/**
 * Punto della timeline giornaliera per una company.
 * Usato dalla sparkline inline nelle row e dal trend overall.
 */
export interface AIUsageDailyPoint {
  date: string; // YYYY-MM-DD
  cost_eur: number;
  requests: number;
}

export interface AIUsageSummary {
  company_id: string;
  company_name: string;
  today_cost_eur: number;
  month_cost_eur: number;
  today_requests: number;
  month_requests: number;
  top_model: string;
  top_provider: string;
  // 🆕 Margine: ricavo (quanto pagato dall'azienda) - costo (quanto pagato all'API)
  month_revenue_eur: number;
  month_margin_eur: number;
  // 🆕 Drill-down (calcolati una volta sola dall'hook, no re-aggregation lato UI)
  models_breakdown: AIUsageModelBreakdown[];
  daily_trend: AIUsageDailyPoint[];
}

/**
 * Top modelli aggregati GLOBALMENTE (cross-company) nel periodo richiesto.
 * Utile per capire quale modello sta consumando più budget complessivo,
 * indipendentemente da chi lo usa. Ordinato per cost_eur desc.
 */
export interface AIUsageTopModel {
  model: string;
  provider: string;
  requests: number;
  cost_eur: number;
  revenue_eur: number;
  margin_eur: number;
  companies_using: number; // n. aziende che lo hanno usato
  share_pct: number;       // % sul costo totale platform
}

export interface AIUsageKPIs {
  total_cost_today: number;
  total_cost_month: number;
  active_companies_today: number;
  total_requests_month: number;
  // 🆕 Aggregati margine
  total_revenue_month: number;
  total_margin_month: number;
  margin_pct_month: number; // (margin/revenue)*100
}

/**
 * Breakdown per categoria di feature AI — utile per capire quale prodotto AI
 * genera più costi e quale ha margine migliore.
 */
export interface AIUsageFeatureBreakdown {
  feature: "render" | "chat" | "voice" | "doc_analysis" | "automation" | "other";
  cost_eur: number;
  revenue_eur: number;
  margin_eur: number;
  requests: number;
}

/**
 * Diagnostica per il super-admin: quante righe sono state lette da quale sorgente.
 * Utile per capire se il merge `render_sessions` sta funzionando o se ci sono
 * problemi RLS/migration sulle tabelle a monte.
 */
export interface AIUsageDiagnostic {
  ai_usage_log_rows: number;
  render_sessions_rows: number;
  render_sessions_completed: number;          // status = completed/succeeded
  render_sessions_with_cost: number;          // hanno cost > 0
  render_sessions_used_legacy_cost: number;   // hanno cost_real_api null → fallback cost_real
  render_sessions_zero_cost: number;          // completed ma cost 0/null (config gratis o miss-tracking)
  render_sessions_error: string | null;
  ai_usage_log_error: string | null;
  /** db_aggregate = somme dal DB; paged_rows = ripiego a pagine (funzione DB assente). */
  ai_usage_source: "db_aggregate" | "paged_rows";
  /** true se si è toccato il tetto di sicurezza delle pagine: numeri parziali. */
  truncated: boolean;
}

export interface AIUsageFilters {
  provider?: string;
  dateFrom?: string;
  dateTo?: string;
  companyId?: string; // 🆕 filtro per singola azienda
}

interface RawUsageRow {
  company_id: string;
  model: string;
  provider: string;
  cost_eur: number;
  feature: string | null;
  created_at: string;
}

/**
 * Riga di consumo già sommata: una per (azienda, provider, modello, feature,
 * giorno). Arriva così dalla funzione DB `admin_ai_usage_aggregato`; nel
 * ripiego le righe grezze vengono ricondotte qui con richieste = 1.
 */
interface UsageAggRow {
  company_id: string;
  provider: string;
  model: string;
  feature: string | null;
  giorno: string; // YYYY-MM-DD (Europe/Rome)
  richieste: number;
  costo_eur: number;
}

/** PostgREST restituisce al massimo 1000 righe per chiamata. */
const PAGE_SIZE = 1000;
/** Tetto di sicurezza: 200 pagine = 200.000 righe. */
const MAX_PAGES = 200;

type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null };

/**
 * Legge TUTTE le righe a blocchi di 1000 con .range(): prima la lettura di
 * ai_usage_log non aveva limite e PostgREST la tagliava a 1000 righe senza
 * dirlo (ottobre 2026: 2.227 righe → costi del mese a metà).
 */
async function leggiTutteLePagine<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; error: { message: string; code?: string } | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const res = await page(from, from + PAGE_SIZE - 1);
    if (res.error) return { rows, error: res.error, truncated: false };
    const chunk = res.data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}

/** La funzione DB non esiste ancora in questo ambiente (migrazione non applicata). */
function isMissingFunction(err: { code?: string; message: string } | null): boolean {
  if (!err) return false;
  return err.code === "PGRST202" || err.code === "42883" || /could not find the function/i.test(err.message);
}

/**
 * Markup di default per stimare il ricavo da `ai_usage_log` quando non c'è
 * un revenue_eur esplicito (a differenza dei render che hanno FIFO accounting).
 * 2.0 = 100% markup (vendiamo al doppio del costo). Configurable in futuro
 * via platform_settings.ai_revenue_markup_factor.
 */
const DEFAULT_AI_MARKUP_FACTOR = 2.0;

/** Categorizza un row in una feature standardizzata */
function categorizeFeature(opts: {
  source: "ai_usage_log" | "render_sessions";
  feature?: string | null;
  model?: string | null;
}): AIUsageFeatureBreakdown["feature"] {
  if (opts.source === "render_sessions") return "render";
  const f = (opts.feature ?? "").toLowerCase();
  if (f === "chat" || f === "voice" || f === "doc_analysis" || f === "automation") return f;
  // Inferenza dal model name come fallback
  const m = (opts.model ?? "").toLowerCase();
  if (m.includes("whisper") || m.includes("transcrib")) return "voice";
  if (m.includes("eleven") || m.includes("tts")) return "voice";
  if (m.includes("embed")) return "doc_analysis";
  if (m.includes("dall-e") || m.includes("image")) return "render";
  return "other";
}

/**
 * Schema minimal della tabella `render_sessions`. I render edge functions
 * scrivono qui via due update consecutivi:
 *   1. legacyUpdate: { cost_real, cost_billed, ... }    ← sempre presente
 *   2. economicsUpdate: { cost_real_api, revenue_eur }  ← solo se migration applicata
 *
 * Quindi `cost_real_api` può essere NULL se la migration economics non è
 * stata applicata sul tenant. Nel merge facciamo fallback a `cost_real`.
 */
interface RawRenderSession {
  company_id: string;
  status: string | null;
  provider_key: string | null;
  provider_model: string | null;
  cost_real_api: number | null;
  cost_real: number | null; // legacy fallback
  revenue_eur: number | null;     // 🆕 ricavo reale (FIFO da credit purchases)
  cost_billed: number | null;     // legacy fallback per revenue
  processing_completed_at: string | null;
  created_at: string;
}

const SUPABASE_TIMEOUT_MS = 15_000;

export function useAIUsageMonitor(filters: AIUsageFilters = {}) {
  return useQuery({
    queryKey: ["admin", "ai-usage-monitor", filters],
    queryFn: async (): Promise<{
      summaries: AIUsageSummary[];
      kpis: AIUsageKPIs;
      diagnostic: AIUsageDiagnostic;
      featureBreakdown: AIUsageFeatureBreakdown[];
      topModels: AIUsageTopModel[];
    }> => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const dateFrom = filters.dateFrom
        ? new Date(filters.dateFrom + "T00:00:00")
        : monthStart;
      // dateTo inclusivo (tutto il giorno)
      const dateTo = filters.dateTo
        ? new Date(filters.dateTo + "T23:59:59.999")
        : now;

      const dayKey = (d: Date) => {
        // YYYY-MM-DD in local timezone (allinea col grouping della UI italiana)
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      };

      // ── Query 1: ai_usage_log ───────────────────────────────────────────
      // Prima scelta: somme fatte dal DB (admin_ai_usage_aggregato), poche
      // centinaia di righe. Ripiego se la funzione non c'è ancora: lettura
      // della tabella a pagine di 1000, ordinata per avere pagine stabili.
      const providerFilter = filters.provider && filters.provider !== "all" ? filters.provider : null;
      const companyFilter = filters.companyId && filters.companyId !== "all" ? filters.companyId : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;

      let usageSource: AIUsageDiagnostic["ai_usage_source"] = "db_aggregate";
      let usageRawRows = 0;
      let usageTruncated = false;
      let usageAgg: UsageAggRow[] = [];

      const aggRes = await leggiTutteLePagine<{
        company_id: string; provider: string; model: string; feature: string | null;
        giorno: string; richieste: number | string; costo_eur: number | string | null;
      }>((from, to) =>
        sp
          .rpc("admin_ai_usage_aggregato", {
            p_da: dateFrom.toISOString(),
            p_a: dateTo.toISOString(),
            p_provider: providerFilter,
            p_company_id: companyFilter,
          })
          .range(from, to),
      );

      if (!aggRes.error) {
        usageTruncated = aggRes.truncated;
        usageAgg = aggRes.rows.map((r) => ({
          company_id: r.company_id,
          provider: r.provider,
          model: r.model,
          feature: r.feature,
          giorno: r.giorno,
          richieste: Number(r.richieste) || 0,
          costo_eur: Number(r.costo_eur) || 0,
        }));
        usageRawRows = usageAgg.reduce((n, r) => n + r.richieste, 0);
      } else if (isMissingFunction(aggRes.error)) {
        usageSource = "paged_rows";
        const pagedRes = await leggiTutteLePagine<RawUsageRow>((from, to) => {
          let q = supabase
            .from("ai_usage_log" as never)
            .select("id, company_id, model, provider, cost_eur, feature, created_at" as never)
            .gte("created_at" as never, dateFrom.toISOString())
            .lte("created_at" as never, dateTo.toISOString());
          if (providerFilter) q = q.eq("provider" as never, providerFilter);
          if (companyFilter) q = q.eq("company_id" as never, companyFilter);
          return q
            .order("created_at" as never, { ascending: true })
            .order("id" as never, { ascending: true })
            .range(from, to) as unknown as PromiseLike<PageResult<RawUsageRow>>;
        });
        // Errore visibile in pagina: prima veniva solo scritto in console e la
        // scheda mostrava costi a zero come se non ci fossero consumi.
        if (pagedRes.error) {
          throw new Error(`Lettura dei consumi AI non riuscita: ${pagedRes.error.message}`);
        }
        usageTruncated = pagedRes.truncated;
        usageRawRows = pagedRes.rows.length;
        usageAgg = pagedRes.rows.map((row) => ({
          company_id: row.company_id,
          provider: row.provider,
          model: row.model,
          feature: row.feature,
          giorno: dayKey(new Date(row.created_at)),
          richieste: 1,
          costo_eur: row.cost_eur == null || Number.isNaN(Number(row.cost_eur)) ? 0 : Number(row.cost_eur),
        }));
      } else {
        throw new Error(`Lettura dei consumi AI non riuscita: ${aggRes.error.message}`);
      }

      // ── Query 2: render_sessions (merge unificato) ──────────────────────
      // Filtra:
      //   - status = 'completed' (i render in-flight non hanno costo reale)
      //   - processing_completed_at nel range OPPURE created_at nel range
      //     (rendering vecchi senza processing_completed_at usano created_at)
      // Il builder di PostgREST si modifica a ogni chiamata: per paginare ne
      // creiamo uno nuovo per ogni blocco.
      // SELECT ampliato: include cost_real (legacy) come fallback se cost_real_api è NULL,
      // + revenue_eur e cost_billed per il calcolo del margine.
      // Filtro range usando created_at come campo principale (sempre presente).
      // Includiamo anche le sessioni completate fuori range ma create dentro
      // (caso edge: render avviato a fine giornata, completato il giorno dopo).
      // Anche i render a pagine di 1000 (stesso taglio silenzioso di PostgREST).
      // L'errore resta nella diagnostica (banner rosso in pagina), non blocca
      // i costi delle chiamate AI.
      const renderPaged = await leggiTutteLePagine<RawRenderSession>((from, to) => {
        let q = supabase
          .from("render_sessions" as never)
          .select(
            "id, company_id, status, provider_key, provider_model, cost_real_api, cost_real, revenue_eur, cost_billed, processing_completed_at, created_at" as never,
          )
          .gte("created_at" as never, dateFrom.toISOString())
          .lte("created_at" as never, dateTo.toISOString());
        if (providerFilter) q = q.eq("provider_key" as never, providerFilter);
        if (companyFilter) q = q.eq("company_id" as never, companyFilter);
        return q
          .order("created_at" as never, { ascending: true })
          .order("id" as never, { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<RawRenderSession>>;
      });
      const renderRes = { error: renderPaged.error };
      const renderRows: RawRenderSession[] = renderPaged.error ? [] : renderPaged.rows;

      // ── Fetch companies for label ───────────────────────────────────────
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("id, name");
      if (companiesError) throw new Error(companiesError.message);

      const companyMap = new Map(
        ((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])
      );

      // ── Aggregate per company ─────────────────────────────────────────
      // models_detail: chiave = `${provider}|${model}` per evitare collisione
      // tra modelli omonimi su provider diversi (es. 'gpt-4o' su openai vs altri)
      type ModelAgg = { provider: string; model: string; requests: number; cost: number; revenue: number };
      type DayAgg = { cost: number; requests: number };
      const byCompany = new Map<
        string,
        {
          today_cost: number;
          month_cost: number;
          month_revenue: number; // 🆕 ricavo
          today_requests: number;
          month_requests: number;
          models: Map<string, number>;        // top_model usage count (legacy)
          providers: Map<string, number>;     // top_provider usage count (legacy)
          // 🆕 drill-down per modello (chiave = `${provider}|${model}`)
          models_detail: Map<string, ModelAgg>;
          // 🆕 timeline giornaliera (chiave = YYYY-MM-DD)
          daily: Map<string, DayAgg>;
        }
      >();

      // 🆕 Top models GLOBALI (cross-company)
      type GlobalModelAgg = ModelAgg & { companies: Set<string> };
      const globalModels = new Map<string, GlobalModelAgg>();


      const trackModelDetail = (
        entry: NonNullable<ReturnType<typeof byCompany.get>>,
        company_id: string,
        provider: string,
        model: string,
        cost: number,
        revenue: number,
        n = 1,
      ) => {
        const key = `${provider}|${model}`;
        const cur = entry.models_detail.get(key) ?? { provider, model, requests: 0, cost: 0, revenue: 0 };
        cur.requests += n;
        cur.cost += cost;
        cur.revenue += revenue;
        entry.models_detail.set(key, cur);

        const gcur = globalModels.get(key) ?? { provider, model, requests: 0, cost: 0, revenue: 0, companies: new Set<string>() };
        gcur.requests += n;
        gcur.cost += cost;
        gcur.revenue += revenue;
        gcur.companies.add(company_id);
        globalModels.set(key, gcur);
      };

      const trackDaily = (
        entry: NonNullable<ReturnType<typeof byCompany.get>>,
        k: string, // YYYY-MM-DD
        cost: number,
        n = 1,
      ) => {
        const cur = entry.daily.get(k) ?? { cost: 0, requests: 0 };
        cur.cost += cost;
        cur.requests += n;
        entry.daily.set(k, cur);
      };

      // Breakdown per feature (aggregato globale, non per company)
      const featureBreakdown = new Map<AIUsageFeatureBreakdown["feature"], {
        cost: number;
        revenue: number;
        requests: number;
      }>();
      const ensureFeature = (f: AIUsageFeatureBreakdown["feature"]) => {
        const e = featureBreakdown.get(f) ?? { cost: 0, revenue: 0, requests: 0 };
        featureBreakdown.set(f, e);
        return e;
      };

      const ensureEntry = (companyId: string) => {
        const entry = byCompany.get(companyId) ?? {
          today_cost: 0,
          month_cost: 0,
          month_revenue: 0,
          today_requests: 0,
          month_requests: 0,
          models: new Map(),
          providers: new Map(),
          models_detail: new Map<string, ModelAgg>(),
          daily: new Map<string, DayAgg>(),
        };
        byCompany.set(companyId, entry);
        return entry;
      };

      // Aggregate ai_usage_log (revenue stimato via markup default).
      // Ogni riga è già una somma: `richieste` chiamate, `costo_eur` totale.
      const todayKey = dayKey(todayStart);
      for (const row of usageAgg) {
        if (!row.company_id) continue;
        const entry = ensureEntry(row.company_id);
        const isToday = row.giorno === todayKey;
        const cost = row.costo_eur;
        const n = row.richieste;
        // ai_usage_log non traccia revenue → stima con markup factor
        const revenue = cost * DEFAULT_AI_MARKUP_FACTOR;

        if (isToday) {
          entry.today_cost += cost;
          entry.today_requests += n;
        }
        entry.month_cost += cost;
        entry.month_revenue += revenue;
        entry.month_requests += n;
        entry.models.set(row.model, (entry.models.get(row.model) ?? 0) + n);
        entry.providers.set(row.provider, (entry.providers.get(row.provider) ?? 0) + n);
        // 🆕 drill-down + timeline
        trackModelDetail(entry, row.company_id, row.provider, row.model, cost, revenue, n);
        trackDaily(entry, row.giorno, cost, n);

        // Feature breakdown
        const feat = categorizeFeature({
          source: "ai_usage_log",
          feature: row.feature,
          model: row.model,
        });
        const fb = ensureFeature(feat);
        fb.cost += cost;
        fb.revenue += revenue;
        fb.requests += n;
      }

      // Aggregate render_sessions (con fallback su cost_real legacy)
      let renderCompletedCount = 0;
      let renderWithCostCount = 0;
      let renderUsedLegacyCost = 0;
      let renderZeroCostCount = 0;
      for (const r of renderRows) {
        if (!r.company_id) continue;
        // Skip render in-flight / falliti (no costo reale ancora)
        const status = (r.status ?? "").toLowerCase();
        if (status && status !== "completed" && status !== "succeeded") continue;
        renderCompletedCount += 1;

        // Cost: prefer cost_real_api (post-migration economics), fallback cost_real (legacy)
        let cost = 0;
        if (r.cost_real_api != null && !Number.isNaN(Number(r.cost_real_api))) {
          cost = Number(r.cost_real_api);
        } else if (r.cost_real != null && !Number.isNaN(Number(r.cost_real))) {
          cost = Number(r.cost_real);
          renderUsedLegacyCost += 1;
        }
        if (cost > 0) renderWithCostCount += 1;
        else renderZeroCostCount += 1;

        // Revenue: prefer revenue_eur (FIFO accounting), fallback cost_billed (legacy)
        let revenue = 0;
        if (r.revenue_eur != null && !Number.isNaN(Number(r.revenue_eur))) {
          revenue = Number(r.revenue_eur);
        } else if (r.cost_billed != null && !Number.isNaN(Number(r.cost_billed))) {
          revenue = Number(r.cost_billed);
        }

        const entry = ensureEntry(r.company_id);
        const ts = r.processing_completed_at ?? r.created_at;
        const isToday = ts ? new Date(ts) >= todayStart : false;
        if (isToday) {
          entry.today_cost += cost;
          entry.today_requests += 1;
        }
        entry.month_cost += cost;
        entry.month_revenue += revenue;
        entry.month_requests += 1;
        const providerLabel = r.provider_key ?? "render";
        const modelLabel = r.provider_model ?? `render:${providerLabel}`;
        entry.models.set(modelLabel, (entry.models.get(modelLabel) ?? 0) + 1);
        entry.providers.set(providerLabel, (entry.providers.get(providerLabel) ?? 0) + 1);
        // 🆕 drill-down + timeline
        trackModelDetail(entry, r.company_id, providerLabel, modelLabel, cost, revenue);
        trackDaily(entry, dayKey(new Date(ts ?? r.created_at)), cost);

        // Feature breakdown: render
        const fb = ensureFeature("render");
        fb.cost += cost;
        fb.revenue += revenue;
        fb.requests += 1;
      }

      const summaries: AIUsageSummary[] = Array.from(byCompany.entries())
        .map(([company_id, agg]) => {
          const topModel = [...agg.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
          const topProvider =
            [...agg.providers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

          // 🆕 models_breakdown ordinato per cost desc, con share %
          const totalCompanyCost = agg.month_cost || 1;
          const models_breakdown: AIUsageModelBreakdown[] = Array.from(agg.models_detail.values())
            .map((m) => ({
              model: m.model,
              provider: m.provider,
              requests: m.requests,
              cost_eur: m.cost,
              revenue_eur: m.revenue,
              margin_eur: m.revenue - m.cost,
              share_pct: Math.round((m.cost / totalCompanyCost) * 1000) / 10,
            }))
            .sort((a, b) => b.cost_eur - a.cost_eur);

          // 🆕 daily_trend riempito anche per giorni "vuoti" nel range richiesto
          // (così la sparkline non ha gap visivi)
          const daily_trend: AIUsageDailyPoint[] = [];
          const cursor = new Date(dateFrom);
          cursor.setHours(0, 0, 0, 0);
          const end = new Date(dateTo);
          end.setHours(0, 0, 0, 0);
          while (cursor <= end) {
            const k = dayKey(cursor);
            const v = agg.daily.get(k);
            daily_trend.push({
              date: k,
              cost_eur: v?.cost ?? 0,
              requests: v?.requests ?? 0,
            });
            cursor.setDate(cursor.getDate() + 1);
            // safety break: non dovremmo mai avere range > 1 anno
            if (daily_trend.length > 366) break;
          }

          return {
            company_id,
            company_name: companyMap.get(company_id) ?? company_id,
            today_cost_eur: agg.today_cost,
            month_cost_eur: agg.month_cost,
            today_requests: agg.today_requests,
            month_requests: agg.month_requests,
            month_revenue_eur: agg.month_revenue,
            month_margin_eur: agg.month_revenue - agg.month_cost,
            top_model: topModel,
            top_provider: topProvider,
            models_breakdown,
            daily_trend,
          };
        })
        .sort((a, b) => b.month_cost_eur - a.month_cost_eur);

      const totalRevenueMonth = summaries.reduce((s, r) => s + r.month_revenue_eur, 0);
      const totalCostMonth = summaries.reduce((s, r) => s + r.month_cost_eur, 0);
      const totalMarginMonth = totalRevenueMonth - totalCostMonth;
      const kpis: AIUsageKPIs = {
        total_cost_today: summaries.reduce((s, r) => s + r.today_cost_eur, 0),
        total_cost_month: totalCostMonth,
        active_companies_today: summaries.filter((r) => r.today_requests > 0).length,
        total_requests_month: summaries.reduce((s, r) => s + r.month_requests, 0),
        total_revenue_month: totalRevenueMonth,
        total_margin_month: totalMarginMonth,
        margin_pct_month: totalRevenueMonth > 0
          ? Math.round((totalMarginMonth / totalRevenueMonth) * 1000) / 10
          : 0,
      };

      // Build feature breakdown array (sorted by cost desc)
      const featureBreakdownArr: AIUsageFeatureBreakdown[] = Array.from(featureBreakdown.entries())
        .map(([feature, agg]) => ({
          feature,
          cost_eur: agg.cost,
          revenue_eur: agg.revenue,
          margin_eur: agg.revenue - agg.cost,
          requests: agg.requests,
        }))
        .sort((a, b) => b.cost_eur - a.cost_eur);

      const diagnostic: AIUsageDiagnostic = {
        ai_usage_log_rows: usageRawRows,
        ai_usage_source: usageSource,
        truncated: usageTruncated || renderPaged.truncated,
        render_sessions_rows: renderRows.length,
        render_sessions_completed: renderCompletedCount,
        render_sessions_with_cost: renderWithCostCount,
        render_sessions_used_legacy_cost: renderUsedLegacyCost,
        render_sessions_zero_cost: renderZeroCostCount,
        render_sessions_error: renderRes.error?.message ?? null,
        ai_usage_log_error: null,
      };

      // 🆕 topModels GLOBALI cross-company
      const totalPlatformCost = totalCostMonth || 1;
      const topModels: AIUsageTopModel[] = Array.from(globalModels.values())
        .map((m) => ({
          model: m.model,
          provider: m.provider,
          requests: m.requests,
          cost_eur: m.cost,
          revenue_eur: m.revenue,
          margin_eur: m.revenue - m.cost,
          companies_using: m.companies.size,
          share_pct: Math.round((m.cost / totalPlatformCost) * 1000) / 10,
        }))
        .sort((a, b) => b.cost_eur - a.cost_eur);

      return { summaries, kpis, diagnostic, featureBreakdown: featureBreakdownArr, topModels };
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// Helper: timeout indicator (non usato direttamente — esposto per debugging)
export const __SUPABASE_TIMEOUT_MS = SUPABASE_TIMEOUT_MS;
