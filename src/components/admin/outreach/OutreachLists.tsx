import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Tag, Loader2, Layers, Hash } from "lucide-react";
import { OutreachEnrollListDialog } from "./OutreachEnrollListDialog";

/**
 * Le tue liste — i contatti raggruppati per tag (= lista) + breakdown per
 * sorgente. Su marketing_contacts (esistente). Raggruppamento client-side
 * (cap 5000, adeguato al volume admin); a scala servirà un'aggregazione SQL.
 */

interface Row { id: string; tags: string[] | null; source: string | null; }
const CAP = 5000;

export function OutreachLists({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-lists", companyId],
    staleTime: 60_000,
    retry: 3,
    retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts").select("id,tags,source").eq("company_id", companyId).limit(CAP);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const byTag = new Map<string, number>();
      const bySource = new Map<string, number>();
      let untagged = 0;
      for (const r of rows) {
        const tags = r.tags ?? [];
        if (tags.length === 0) untagged++;
        for (const t of tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
        const s = (r.source || "—").trim() || "—";
        bySource.set(s, (bySource.get(s) ?? 0) + 1);
      }
      return {
        total: rows.length,
        capped: rows.length >= CAP,
        untagged,
        lists: [...byTag.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
        sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      };
    },
  });

  const d = q.data;
  const fmt = (n: number) => n.toLocaleString("it-IT");
  const maxList = d ? Math.max(1, ...d.lists.map((l) => l.count), d.untagged) : 1;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* header */}
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Le tue liste</h3>
          <p className="text-xs text-muted-foreground">Contatti raggruppati per tag</p>
        </div>
        {d && (
          <Badge variant="secondary" className="shrink-0 gap-1 font-normal tabular-nums">
            <Layers className="h-3 w-3" />{fmt(d.total)}
          </Badge>
        )}
      </header>

      <div className="p-4">
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !d || (d.lists.length === 0 && d.untagged === 0) ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Tag className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">Nessuna lista ancora</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Importa un CSV con un tag di lista per crearne una.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* righe lista — stile tabella contatti */}
            <div className="overflow-hidden rounded-lg border border-border">
              {d.lists.map((l, i) => (
                <div
                  key={l.tag}
                  className={`group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Tag className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight">{l.tag}</div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round((l.count / maxList) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{fmt(l.count)}</span>
                  <OutreachEnrollListDialog companyId={companyId} tag={l.tag} count={l.count} />
                </div>
              ))}
              {d.untagged > 0 && (
                <div className={`flex items-center gap-3 px-3 py-2.5 text-muted-foreground ${d.lists.length > 0 ? "border-t border-border" : ""}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">Senza lista</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{fmt(d.untagged)}</span>
                </div>
              )}
            </div>

            {/* breakdown sorgente */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Hash className="h-3 w-3" /> Per sorgente
              </p>
              <div className="flex flex-wrap gap-1.5">
                {d.sources.map((s) => (
                  <span
                    key={s.source}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="font-medium text-foreground">{s.source}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(s.count)}</span>
                  </span>
                ))}
              </div>
            </div>

            {d.capped && (
              <p className="text-[11px] text-muted-foreground">Mostrate le prime {fmt(CAP)} righe per il raggruppamento.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
