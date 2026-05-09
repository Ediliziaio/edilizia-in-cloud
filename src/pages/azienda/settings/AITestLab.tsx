/**
 * AITestLab — Dashboard di confronto modelli AI per Demo Azienda.
 *
 * Visibile SOLO se utente=demo@azienda.srl + company=Demo Azienda S.r.l.
 * Per gli altri tenant la rotta non viene esposta in sidebar (gating in
 * sidebarConfig.ts) e questa pagina ritorna null.
 *
 * Mostra:
 *  - KPI per modello: # chiamate, costo medio/totale, latenza p50/p95, rating
 *  - Tabella ai_test_runs filtrata per feature/periodo
 *  - "Imposta come default per task_key" → scrive in ai_demo_default_models
 */
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Beaker, Star, AlertTriangle, Trophy, RefreshCw, Loader2 } from 'lucide-react';
import { ProviderIcon } from '@/components/ai/ProviderIcon';
import { formatCost, formatLatency } from '@/lib/ai/openrouter-models';
import { DEMO_COMPANY_ID, DEMO_USER_EMAIL } from '@/lib/ai/models.config';
import { cn } from '@/lib/utils';

interface KPIRow {
  feature: string;
  model_id: string;
  provider: string;
  total_calls: number;
  avg_cost_usd: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  avg_rating: number | null;
  ratings_count: number;
  errors_count: number;
}

interface DefaultRow {
  task_key: string;
  model_id: string;
  set_at: string;
}

const PERIOD_OPTIONS = [
  { value: '7', label: 'Ultimi 7 giorni' },
  { value: '30', label: 'Ultimi 30 giorni' },
  { value: '90', label: 'Ultimi 90 giorni' },
];

export default function AITestLab() {
  const { user, effectiveCompany } = useAuth();
  const navigate = useNavigate();

  const isAuthorized =
    effectiveCompany?.id === DEMO_COMPANY_ID &&
    user?.email?.toLowerCase() === DEMO_USER_EMAIL;

  // Hard-block: se non autorizzato, redirect via useEffect (per evitare flash UI)
  useEffect(() => {
    if (!isAuthorized) {
      const t = setTimeout(() => navigate('/azienda', { replace: true }), 100);
      return () => clearTimeout(t);
    }
  }, [isAuthorized, navigate]);

  const [period, setPeriod] = useState('30');
  const [featureFilter, setFeatureFilter] = useState<string>('all');

  const fromDate = useMemo(() => {
    const days = parseInt(period, 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [period]);

  // KPI per modello (RPC ai_test_lab_kpi)
  const kpiQuery = useQuery({
    queryKey: ['ai-test-lab-kpi', period],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_test_lab_kpi', {
        p_company_id: DEMO_COMPANY_ID,
        p_from: fromDate,
        p_to: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as KPIRow[];
    },
    staleTime: 30 * 1000,
  });

  // Defaults attualmente impostati per task_key
  const defaultsQuery = useQuery({
    queryKey: ['ai-demo-default-models'],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_demo_default_models')
        .select('task_key, model_id, set_at')
        .eq('company_id', DEMO_COMPANY_ID);
      if (error) throw error;
      return (data ?? []) as DefaultRow[];
    },
    staleTime: 60 * 1000,
  });

  const features = useMemo(() => {
    const set = new Set<string>(['all']);
    (kpiQuery.data ?? []).forEach((r) => set.add(r.feature));
    return Array.from(set);
  }, [kpiQuery.data]);

  const filteredRows = useMemo(() => {
    const rows = kpiQuery.data ?? [];
    if (featureFilter === 'all') return rows;
    return rows.filter((r) => r.feature === featureFilter);
  }, [kpiQuery.data, featureFilter]);

  // Aggregati totali
  const totals = useMemo(() => {
    const rows = filteredRows;
    return {
      calls: rows.reduce((s, r) => s + Number(r.total_calls ?? 0), 0),
      cost: rows.reduce((s, r) => s + Number(r.total_cost_usd ?? 0), 0),
      uniqueModels: new Set(rows.map((r) => r.model_id)).size,
      errors: rows.reduce((s, r) => s + Number(r.errors_count ?? 0), 0),
    };
  }, [filteredRows]);

  const setDefault = async (feature: string, modelId: string) => {
    try {
      // task_key == feature in V1 (silvio-chat usa "persona_silvio" task_key però)
      // Lo mappiamo simply 1:1 per ora; un seed/UI advance può differenziare.
      const taskKey = feature;
      const { error } = await supabase
        .from('ai_demo_default_models')
        .upsert(
          {
            company_id: DEMO_COMPANY_ID,
            task_key: taskKey,
            model_id: modelId,
            set_by: user?.id,
            set_at: new Date().toISOString(),
          },
          { onConflict: 'company_id,task_key' },
        );
      if (error) throw error;
      toast.success(`${modelId} impostato come default per ${feature}`);
      defaultsQuery.refetch();
    } catch (e) {
      toast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const isCurrentDefault = (feature: string, modelId: string) =>
    (defaultsQuery.data ?? []).some(
      (d) => d.task_key === feature && d.model_id === modelId,
    );

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <Beaker className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight flex items-center gap-2">
              AI Test Lab
              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">DEMO</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Confronta costo / latenza / qualità dei modelli OpenRouter su agenti Silvio. Solo Demo Azienda.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => kpiQuery.refetch()} disabled={kpiQuery.isFetching}>
            <RefreshCw className={cn('h-4 w-4', kpiQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Chiamate AI</p>
            <p className="text-2xl font-bold mt-1">{totals.calls.toLocaleString('it-IT')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Costo totale</p>
            <p className="text-2xl font-bold mt-1 text-orange-600">${totals.cost.toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Modelli testati</p>
            <p className="text-2xl font-bold mt-1">{totals.uniqueModels}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Errori</p>
            <p className={cn('text-2xl font-bold mt-1', totals.errors > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {totals.errors}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Feature filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Filtra per feature:</span>
        {features.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFeatureFilter(f)}
            className={cn(
              'px-2.5 py-1 text-[11px] rounded-full border transition-colors',
              featureFilter === f
                ? 'bg-orange-100 border-orange-300 text-orange-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {f === 'all' ? '📊 Tutte' : f}
          </button>
        ))}
      </div>

      {/* KPI table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Confronto modelli</CardTitle>
          <p className="text-xs text-muted-foreground">
            ⏱ tempi · 💰 costi · ⭐ rating · ⚠️ errori. Click "Imposta default" per usare quel modello su task background.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {kpiQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessun dato in questo periodo. Invia messaggi a Silvio cambiando modello per popolare la dashboard.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="text-left px-3 py-2 font-semibold">Feature</th>
                  <th className="text-left px-3 py-2 font-semibold">Modello</th>
                  <th className="text-right px-3 py-2 font-semibold"># Chiamate</th>
                  <th className="text-right px-3 py-2 font-semibold">Costo medio</th>
                  <th className="text-right px-3 py-2 font-semibold">Costo tot.</th>
                  <th className="text-right px-3 py-2 font-semibold">P50</th>
                  <th className="text-right px-3 py-2 font-semibold">P95</th>
                  <th className="text-right px-3 py-2 font-semibold">Token in/out</th>
                  <th className="text-right px-3 py-2 font-semibold">⭐</th>
                  <th className="text-right px-3 py-2 font-semibold">Err</th>
                  <th className="text-right px-3 py-2 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const isDef = isCurrentDefault(r.feature, r.model_id);
                  return (
                    <tr key={`${r.feature}-${r.model_id}`} className={cn(
                      'border-b border-slate-100 hover:bg-orange-50/30 transition-colors',
                      isDef && 'bg-emerald-50/40',
                    )}>
                      <td className="px-3 py-2 text-[12px] font-medium text-slate-700">{r.feature}</td>
                      <td className="px-3 py-2 text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <ProviderIcon provider={r.provider} className="h-3.5 w-3.5" />
                          <span className="font-medium">{r.model_id.split('/').slice(1).join('/')}</span>
                          {isDef && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[9px] h-4 px-1">DEFAULT</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">{Number(r.total_calls).toLocaleString('it-IT')}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-600">{formatCost(Number(r.avg_cost_usd))}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-orange-700 font-semibold">{formatCost(Number(r.total_cost_usd))}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-600">{formatLatency(Number(r.p50_latency_ms))}</td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-600">{formatLatency(Number(r.p95_latency_ms))}</td>
                      <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-500">{Math.round(Number(r.avg_input_tokens))}↗{Math.round(Number(r.avg_output_tokens))}</td>
                      <td className="px-3 py-2 text-right">
                        {r.ratings_count > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px]">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {Number(r.avg_rating).toFixed(1)}
                            <span className="text-[9px] text-slate-400">({r.ratings_count})</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-mono text-[11px]', Number(r.errors_count) > 0 ? 'text-red-600 font-semibold' : 'text-slate-300')}>
                        {Number(r.errors_count) || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isDef && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDefault(r.feature, r.model_id)}>
                            <Trophy className="h-3 w-3 mr-1" />Imposta default
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Defaults attivi */}
      {(defaultsQuery.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-600" />
              Default impostati ({(defaultsQuery.data ?? []).length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Quando un cron/trigger background invoca aiRouterComplete senza forceModel, usa questi.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(defaultsQuery.data ?? []).map((d) => (
              <div key={d.task_key} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-900">{d.task_key}</p>
                  <p className="text-[11px] text-emerald-700 font-mono">{d.model_id}</p>
                </div>
                <span className="text-[10px] text-emerald-600">
                  {new Date(d.set_at).toLocaleString('it-IT')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Warning quota */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Quota di sicurezza attiva</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Limite default: 200 chiamate/24h + cap mensile $50. Modificabile in tabella <code className="bg-white px-1 rounded text-[10px]">ai_test_quota</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
