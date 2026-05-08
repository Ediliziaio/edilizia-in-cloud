/**
 * KbBudgetTab — Token budget e costi della KB per categoria.
 *
 * Legge da v_kb_token_budget:
 *   - n_docs, total_chars, estimated_tokens per categoria
 *   - reembed_cost_usd: stima costo OpenAI per re-ingest full
 *   - embeddings_size_mb: spazio storage embeddings (4 byte * 1536 dim)
 *   - n_orphaned, n_expired
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, FileText, HardDrive, AlertCircle } from "lucide-react";

interface BudgetRow {
  category: string;
  n_docs: number;
  total_chars: number;
  estimated_tokens: number;
  reembed_cost_usd: number;
  embeddings_size_mb: number;
  avg_hits: number | null;
  max_hits: number | null;
  n_orphaned: number;
  n_expired: number;
}

const fmtNum = (v: number) => new Intl.NumberFormat("it-IT").format(v);

export function KbBudgetTab() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-kb-budget"],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_kb_token_budget")
        .select("*");
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
  });

  const totals = rows ? {
    n_docs: rows.reduce((s, r) => s + r.n_docs, 0),
    estimated_tokens: rows.reduce((s, r) => s + r.estimated_tokens, 0),
    reembed_cost_usd: rows.reduce((s, r) => s + Number(r.reembed_cost_usd), 0),
    embeddings_size_mb: rows.reduce((s, r) => s + Number(r.embeddings_size_mb), 0),
    n_orphaned: rows.reduce((s, r) => s + r.n_orphaned, 0),
    n_expired: rows.reduce((s, r) => s + r.n_expired, 0),
  } : null;

  // Tasso USD→EUR approssimativo per il display
  const usdEur = 0.92;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Token Budget & Costi</h3>
        <p className="text-xs text-muted-foreground">
          Dimensione della KB, costo stimato per re-embed full e storage embeddings.
          Modello: <code>text-embedding-3-small</code> (~$0.02/1M token, 1536 dim).
        </p>
      </div>

      {/* Totali */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Documenti"
            value={fmtNum(totals.n_docs)}
            icon={<FileText className="h-5 w-5" />}
          />
          <KpiCard
            label="Token totali"
            value={fmtNum(totals.estimated_tokens)}
            sub="stimati (~4 char/tok)"
            icon={<Coins className="h-5 w-5" />}
          />
          <KpiCard
            label="Re-embed full"
            value={`$${totals.reembed_cost_usd.toFixed(3)}`}
            sub={`≈ €${(totals.reembed_cost_usd * usdEur).toFixed(3)} una tantum`}
            icon={<Coins className="h-5 w-5 text-emerald-600" />}
            tone="emerald"
          />
          <KpiCard
            label="Storage vectors"
            value={`${totals.embeddings_size_mb.toFixed(1)} MB`}
            sub="su pgvector"
            icon={<HardDrive className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Alert orphan/expired */}
      {totals && (totals.n_orphaned > 0 || totals.n_expired > 0) && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Bloat potenziale nella KB
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                {totals.n_orphaned > 0 && (
                  <>
                    <strong>{totals.n_orphaned}</strong> docs orfani (mai usati) →
                    risparmieresti ~${(totals.n_orphaned * (totals.reembed_cost_usd / Math.max(totals.n_docs, 1))).toFixed(4)} di re-embed.
                  </>
                )}
                {totals.n_orphaned > 0 && totals.n_expired > 0 && " · "}
                {totals.n_expired > 0 && (
                  <>
                    <strong>{totals.n_expired}</strong> docs scaduti (valid_until passato).
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabella per categoria */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !rows || rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">KB vuota.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2 text-right">Docs</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Re-embed $</th>
                    <th className="px-3 py-2 text-right">MB</th>
                    <th className="px-3 py-2 text-right">Avg hits</th>
                    <th className="px-3 py-2 text-right">Orphan</th>
                    <th className="px-3 py-2 text-right">Scaduti</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{r.category}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.n_docs)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.estimated_tokens)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        ${Number(r.reembed_cost_usd).toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {Number(r.embeddings_size_mb).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {r.avg_hits !== null ? Number(r.avg_hits).toFixed(1) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${r.n_orphaned > 0 ? "text-amber-600" : ""}`}>
                        {r.n_orphaned}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${r.n_expired > 0 ? "text-rose-600" : ""}`}>
                        {r.n_expired}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "emerald";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 truncate ${tone === "emerald" ? "text-emerald-600" : ""}`}>
              {value}
            </p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
