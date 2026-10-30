/**
 * CrmVelocityCard — tempo medio che le opportunità passano in ciascuno stadio
 * (velocity), calcolato dallo storico `marketing_opportunity_stage_history`.
 *
 * Fail-open: se la tabella non esiste ancora (migration non applicata) o non
 * c'è storico, mostra un empty-state — niente crash. La tabella non è nei tipi
 * generati finché la migration non è applicata → query non tipizzata.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Gauge, Loader2 } from "lucide-react";

interface StageRow {
  id: string;
  name: string | null;
  position: number | null;
  pipeline_id: string | null;
}

interface HistRow {
  opportunity_id: string;
  stage_id: string | null;
  entered_at: string;
}

export function CrmVelocityCard({ companyId }: { companyId: string }) {
  const [nowMs] = useState(() => Date.now());

  const q = useQuery({
    queryKey: ["crm-dash", "velocity", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      // Gli stadi hanno nomi ripetuti tra una pipeline e l'altra («Nuovo» in
      // 13 pipeline): servono anche le pipeline per distinguerli.
      const [stages, pipelines] = await Promise.all([
        supabase
          .from("marketing_pipeline_stages")
          .select("id,name,position,pipeline_id")
          .eq("company_id", companyId)
          .order("position", { ascending: true }),
        supabase.from("marketing_pipelines").select("id,name,position").eq("company_id", companyId),
      ]);
      const stRows = (stages.data ?? []) as StageRow[];
      const plRows = (pipelines.data ?? []) as { id: string; name: string | null; position: number | null }[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hist = await (supabase.from("marketing_opportunity_stage_history") as any)
        .select("opportunity_id,stage_id,entered_at")
        .eq("company_id", companyId)
        .limit(10000);
      // Fail-open: tabella assente o errore → nessuno storico.
      return { hist: hist.error ? ([] as HistRow[]) : ((hist.data ?? []) as HistRow[]), stages: stRows, pipelines: plRows };
    },
  });

  const rows = useMemo(() => {
    const d = q.data;
    if (!d || d.hist.length === 0) return [];
    const pipe = new Map(d.pipelines.map((p) => [p.id, { name: p.name ?? "—", pos: p.position ?? 0 }]));
    const stageName = new Map(
      d.stages.map((s) => [
        s.id,
        { name: s.name ?? "—", pos: s.position ?? 0, pipeline: s.pipeline_id ? pipe.get(s.pipeline_id) : undefined },
      ]),
    );
    const byOpp = new Map<string, HistRow[]>();
    for (const h of d.hist) {
      if (!byOpp.has(h.opportunity_id)) byOpp.set(h.opportunity_id, []);
      byOpp.get(h.opportunity_id)!.push(h);
    }
    const agg = new Map<string, { sum: number; n: number }>();
    for (const list of byOpp.values()) {
      list.sort((a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime());
      for (let i = 0; i < list.length; i++) {
        const sid = list[i].stage_id;
        if (!sid) continue;
        const start = new Date(list[i].entered_at).getTime();
        const end = i + 1 < list.length ? new Date(list[i + 1].entered_at).getTime() : nowMs;
        const dur = Math.max(0, end - start);
        const cur = agg.get(sid) ?? { sum: 0, n: 0 };
        cur.sum += dur;
        cur.n += 1;
        agg.set(sid, cur);
      }
    }
    const out = [...agg.entries()].map(([sid, { sum, n }]) => {
      const st = stageName.get(sid);
      return {
        id: sid,
        name: st?.name ?? "—",
        pipeline: st?.pipeline?.name ?? null,
        pipelinePos: st?.pipeline?.pos ?? 999,
        pos: st?.pos ?? 999,
        days: n > 0 ? sum / n / 86_400_000 : 0,
      };
    });
    // Nome della pipeline accanto allo stadio solo se nello storico ce n'è più d'una.
    const piuPipeline = new Set(out.map((r) => r.pipeline)).size > 1;
    return out
      .map((r) => ({ ...r, label: piuPipeline && r.pipeline ? `${r.pipeline} · ${r.name}` : r.name }))
      .sort((a, b) => a.pipelinePos - b.pipelinePos || a.pos - b.pos);
  }, [q.data, nowMs]);

  const max = Math.max(1, ...rows.map((r) => r.days));

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4" aria-hidden="true" /> Velocity — giorni medi per stadio
          <span className="ml-auto text-xs font-normal text-muted-foreground">tutto lo storico, indipendente dal periodo</span>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Storico stadi non ancora disponibile (si popola con i cambi di stadio).
          </p>
        ) : (
          <div className="flex flex-col gap-2.5 text-[13px]">
            {rows.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex justify-between">
                  <span>{r.label}</span>
                  <span className="text-muted-foreground">{r.days >= 10 ? Math.round(r.days) : r.days.toFixed(1)} g</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-[hsl(var(--chart-4))]" style={{ width: `${Math.max(2, (r.days / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
