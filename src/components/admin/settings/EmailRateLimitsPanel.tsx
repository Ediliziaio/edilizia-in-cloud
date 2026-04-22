// ============================================================================
// EmailRateLimitsPanel — Email Dual-Provider FASE 11
// ============================================================================
// Pannello SuperAdmin con i limiti di rate attualmente configurati sulle
// Edge Functions email + un conteggio delle chiamate nell'ultima ora per
// spot-check del carico.
//
// I limiti sono costanti hardcoded nelle Edge Functions (non in DB) quindi
// qui mostriamo solo un riassunto read-only. Per modificarli serve deploy.
//
// Conteggio chiamate: public.edge_function_rate_limits (1 riga per chiamata
// consentita, TTL di cleanup definito in altra migrazione).
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, Info, Loader2 } from "lucide-react";

// ── Config: limiti noti da codice (single source of truth: Edge Functions) ──
interface RateLimitEntry {
  functionName: string;
  humanName: string;
  maxCalls: number;
  windowSeconds: number;
  scope: "per-user" | "per-company" | "per-domain";
  purpose: string;
  source: string; // file path per audit
}

const LIMITS: RateLimitEntry[] = [
  {
    functionName: "send-transactional-v2",
    humanName: "Invio email transazionali (v2)",
    maxCalls: 120,
    windowSeconds: 60,
    scope: "per-user",
    purpose: "Bulk-friendly (fattura run, invito massivo). 2 email/sec sostenute.",
    source: "supabase/functions/send-transactional-v2/index.ts",
  },
  {
    functionName: "manage-email-domain:add",
    humanName: "Aggiunta dominio personalizzato",
    maxCalls: 3,
    windowSeconds: 3600,
    scope: "per-company",
    purpose: "Limita abuso registrazione domini. 3 nuovi domini/ora per azienda.",
    source: "RPC check_email_domain_rate_limit",
  },
  {
    functionName: "manage-email-domain:verify",
    humanName: "Verifica DNS dominio personalizzato",
    maxCalls: 10,
    windowSeconds: 3600,
    scope: "per-domain",
    purpose: "Evita hammering dei provider DNS durante propagazione.",
    source: "RPC check_email_domain_rate_limit",
  },
];

function formatWindow(seconds: number): string {
  if (seconds < 60)    return `${seconds} s`;
  if (seconds < 3600)  return `${Math.round(seconds / 60)} min`;
  if (seconds === 3600) return "1 ora";
  return `${(seconds / 3600).toFixed(1)} ore`;
}

function formatRate(calls: number, seconds: number): string {
  const perSec = calls / seconds;
  if (perSec >= 1)     return `~${perSec.toFixed(1)}/sec`;
  if (perSec >= 1/60)  return `~${(perSec * 60).toFixed(1)}/min`;
  return `~${(perSec * 3600).toFixed(1)}/ora`;
}

export function EmailRateLimitsPanel() {
  // Conteggio chiamate nell'ultima ora dalla tabella edge_function_rate_limits
  const usageQuery = useQuery({
    queryKey: ["admin-email-rate-limit-usage"],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("edge_function_rate_limits")
        .select("function_name")
        .gte("called_at", oneHourAgo)
        .in("function_name", ["send-transactional-v2"]) // l'unica registrata in questa tabella
        .limit(10000);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.function_name] = (counts[row.function_name] ?? 0) + 1;
      }
      return counts;
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          I limiti di rate sono costanti di codice nelle Edge Functions per
          predicibilità e resilienza. Per modificarli serve un deploy.
          Questa pagina è di sola lettura e serve a controllare il carico
          corrente.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Rate limit Edge Functions email
          </CardTitle>
          <CardDescription>
            Limiti correnti + chiamate nell'ultima ora (tracciate in
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded mx-1">
              edge_function_rate_limits
            </code>
            ).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-4">Funzione</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4 text-right">Limite</th>
                  <th className="py-2 pr-4 text-right">Throughput</th>
                  <th className="py-2 text-right">Ultima ora</th>
                </tr>
              </thead>
              <tbody>
                {LIMITS.map((l) => {
                  const usage = usageQuery.data?.[l.functionName];
                  const hasUsageTracking = l.functionName === "send-transactional-v2";
                  return (
                    <tr key={l.functionName} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{l.humanName}</p>
                        <p className="text-xs text-muted-foreground">{l.purpose}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {l.source}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-xs font-normal">
                          {l.scope}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-sm whitespace-nowrap">
                        {l.maxCalls.toLocaleString("it-IT")} / {formatWindow(l.windowSeconds)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatRate(l.maxCalls, l.windowSeconds)}
                      </td>
                      <td className="py-3 text-right font-mono text-sm whitespace-nowrap">
                        {hasUsageTracking ? (
                          usageQuery.isLoading ? (
                            <Skeleton className="h-4 w-10 ml-auto" />
                          ) : (
                            <span
                              className={
                                (usage ?? 0) > l.maxCalls * 0.8
                                  ? "text-destructive font-semibold"
                                  : "text-muted-foreground"
                              }
                            >
                              {(usage ?? 0).toLocaleString("it-IT")}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            RPC-based
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {usageQuery.isFetching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aggiornamento conteggi…
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note operative</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">send-transactional-v2</strong> conta
            per-utente: una fattura run batch di 100 email consuma 100 chiamate
            dello stesso utente. Oltre 120/min attendere 60 secondi.
          </p>
          <p>
            <strong className="text-foreground">manage-email-domain</strong> usa una
            RPC dedicata ({""}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              check_email_domain_rate_limit
            </code>
            ) che conta separatamente add vs verify e si resetta automaticamente
            allo scadere della finestra di 1 ora.
          </p>
          <p className="text-xs">
            Se una company viene rate-limitata persistentemente, verificare log
            Supabase Edge Functions per pattern di abuso o bug nel retry del client.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
