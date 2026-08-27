/**
 * AICostHealthPanel — "costi AI sotto controllo" per il super_admin.
 *
 * Sopra al monitor costi mostra a colpo d'occhio:
 *  - SPIKE: spesa AI di oggi vs ieri vs media 7 giorni (banner rosso se anomala)
 *  - SALUTE PER MODELLO: error-rate, costo, latenza e % fallback per modello
 *    (badge rosso se error-rate alto → individua i modelli che "sprecano" token).
 *
 * Dati reali da RPC admin_ai_cost_health (gated super_admin/service_role).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface ModelRow {
  model: string;
  chiamate: number;
  errori: number;
  error_rate_pct: number | null;
  costo_eur: number;
  durata_media_ms: number;
  fallback_pct: number | null;
}
interface CostHealth {
  ok: boolean;
  finestra_giorni: number;
  spike: {
    oggi_eur: number;
    ieri_eur: number;
    media_7g_eur: number;
    delta_vs_media_pct: number | null;
    is_spike: boolean;
  };
  per_modello: ModelRow[];
  totali: { chiamate: number; errori: number; error_rate_pct: number | null; costo_eur: number };
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Math.abs(n ?? 0) < 1 ? 4 : 2, useGrouping: "always" }).format(n ?? 0);

export function AICostHealthPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "ai-cost-health", 14],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ai_cost_health", { p_days: 14 } as never);
      if (error) throw error;
      return data as unknown as CostHealth;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="mb-4 h-40 w-full" />;
  // Errore visibile: prima il pannello spariva in silenzio e un fallimento
  // era indistinguibile da "costi sotto controllo".
  if (isError || !data?.ok) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Impossibile caricare la salute costi AI{data && !data.ok ? " (risposta non valida)" : ""}. Riprova più tardi.
      </div>
    );
  }

  const s = data.spike;
  const models = data.per_modello ?? [];
  const tot = data.totali;

  return (
    <div className="mb-4 space-y-3">
      {/* Spike banner */}
      <Card className={`p-3 ${s.is_spike ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
            {s.is_spike && <AlertTriangle className="h-4 w-4 text-red-600" />}
            Spesa AI oggi: {eur(s.oggi_eur)}
          </span>
          <span className="text-slate-500">ieri {eur(s.ieri_eur)}</span>
          <span className="text-slate-500">media 7g {eur(s.media_7g_eur)}</span>
          {s.delta_vs_media_pct != null && (
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                s.delta_vs_media_pct > 0 ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {s.delta_vs_media_pct > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {s.delta_vs_media_pct > 0 ? "+" : ""}
              {s.delta_vs_media_pct}% vs media
            </span>
          )}
          {s.is_spike && <Badge variant="destructive">Spike costi</Badge>}
        </div>
      </Card>

      {/* Salute per modello */}
      <Card className="overflow-hidden p-0">
        <div className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          Salute per modello · ultimi {data.finestra_giorni} giorni
          {tot?.error_rate_pct != null && (
            <span className="ml-2 font-normal text-slate-500">
              (totale {tot.chiamate} chiamate, {tot.error_rate_pct}% errori, {eur(tot.costo_eur)})
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="px-3 py-1.5 text-left font-medium">Modello</th>
                <th className="px-3 py-1.5 text-right font-medium">Chiamate</th>
                <th className="px-3 py-1.5 text-right font-medium">Error-rate</th>
                <th className="px-3 py-1.5 text-right font-medium">Costo</th>
                <th className="px-3 py-1.5 text-right font-medium">Latenza media</th>
                <th className="px-3 py-1.5 text-right font-medium">% fallback</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                    Nessuna chiamata AI nel periodo.
                  </td>
                </tr>
              )}
              {models.map((m) => {
                const er = m.error_rate_pct ?? 0;
                const bad = er >= 20;
                const warn = er >= 5 && er < 20;
                return (
                  <tr key={m.model} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">{m.model}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.chiamate}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${
                          bad
                            ? "bg-red-100 font-semibold text-red-700"
                            : warn
                              ? "bg-amber-100 text-amber-700"
                              : "text-slate-600"
                        }`}
                      >
                        {er}%{m.errori > 0 ? ` (${m.errori})` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{eur(m.costo_eur)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {m.durata_media_ms ? `${Math.round(m.durata_media_ms)} ms` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{m.fallback_pct ?? 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
