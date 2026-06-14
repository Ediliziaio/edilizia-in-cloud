import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Tag, Loader2 } from "lucide-react";

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-5 w-5 text-orange-500" /> Le tue liste
          {d && <Badge variant="secondary">{fmt(d.total)} contatti</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !d || (d.lists.length === 0 && d.untagged === 0) ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nessuna lista ancora. Importa un CSV con un tag di lista per crearne una.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {d.lists.map((l) => (
                <div key={l.tag} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.tag}</span>
                  <Badge variant="outline" className="shrink-0">{fmt(l.count)}</Badge>
                </div>
              ))}
              {d.untagged > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-muted-foreground">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">Senza lista</span>
                  <Badge variant="outline" className="shrink-0">{fmt(d.untagged)}</Badge>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Per sorgente</p>
              <div className="flex flex-wrap gap-1.5">
                {d.sources.map((s) => (
                  <Badge key={s.source} variant="secondary" className="font-normal">{s.source}: {fmt(s.count)}</Badge>
                ))}
              </div>
            </div>

            {d.capped && <p className="text-[11px] text-muted-foreground">Mostrate le prime {fmt(CAP)} righe per il raggruppamento.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
