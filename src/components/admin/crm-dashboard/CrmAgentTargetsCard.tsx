/**
 * CrmAgentTargetsCard — obiettivo vs vinto del mese, per agente.
 *
 * Mostra per ogni venditore il fatturato VINTO nel mese corrente (opportunità
 * status=won) confrontato col TARGET (editabile inline → upsert su
 * marketing_agent_targets). Fail-open: se la tabella target non esiste ancora
 * la lettura va a 0 e il salvataggio dà errore (toast), senza crash.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Goal, Loader2 } from "lucide-react";

const eur = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `€${v}`;
};

export function CrmAgentTargetsCard({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [nowMs] = useState(() => Date.now());
  const queryClient = useQueryClient();

  const monthStart = useMemo(() => {
    const d = new Date(nowMs);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [nowMs]);
  const periodMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const q = useQuery({
    queryKey: ["crm-dash", "agent-targets", companyId, periodMonth],
    staleTime: 60_000,
    queryFn: async () => {
      const opps = await supabase
        .from("marketing_opportunities")
        .select("assigned_to,status,value,updated_at")
        .eq("company_id", companyId)
        .eq("status", "won")
        .is("deleted_at", null)
        .gte("updated_at", monthStart.toISOString())
        .limit(5000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targets = await (supabase.from("marketing_agent_targets") as any)
        .select("agent_id,target_revenue")
        .eq("company_id", companyId)
        .eq("period_month", periodMonth);
      const wonRows = (opps.data ?? []) as { assigned_to: string | null; value: number | null }[];
      const tRows = targets.error
        ? []
        : ((targets.data ?? []) as { agent_id: string; target_revenue: number | null }[]);
      const ids = [
        ...new Set([...wonRows.map((r) => r.assigned_to), ...tRows.map((r) => r.agent_id)].filter(Boolean)),
      ] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
        names = Object.fromEntries(
          (profs ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Agente"]),
        );
      }
      const wonByAgent = new Map<string, number>();
      for (const r of wonRows) if (r.assigned_to) wonByAgent.set(r.assigned_to, (wonByAgent.get(r.assigned_to) ?? 0) + (r.value ?? 0));
      const targetByAgent = new Map(tRows.map((r) => [r.agent_id, r.target_revenue ?? 0]));
      return { ids, names, wonByAgent, targetByAgent };
    },
  });

  const save = useMutation({
    mutationFn: async (vars: { agentId: string; target: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("marketing_agent_targets") as any).upsert(
        {
          company_id: companyId,
          agent_id: vars.agentId,
          period_month: periodMonth,
          target_revenue: vars.target,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: "company_id,agent_id,period_month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crm-dash", "agent-targets", companyId, periodMonth] });
      toast.success("Target aggiornato");
    },
    onError: (e: unknown) => toast.error(`Impossibile salvare il target: ${e instanceof Error ? e.message : ""}`),
  });

  const rows = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    return d.ids
      .map((id) => ({
        id,
        name: d.names[id] ?? "Agente",
        won: d.wonByAgent.get(id) ?? 0,
        target: d.targetByAgent.get(id) ?? 0,
      }))
      .sort((a, b) => b.won - a.won || b.target - a.target);
  }, [q.data]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Goal className="h-4 w-4" aria-hidden="true" /> Obiettivo vs vinto del mese (per agente)
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessun agente con vinti o target nel mese.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {rows.map((r) => (
              <AgentTargetRow
                key={r.id}
                name={r.name}
                won={r.won}
                target={r.target}
                saving={save.isPending}
                onSave={(target) => save.mutate({ agentId: r.id, target })}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentTargetRow({
  name,
  won,
  target,
  onSave,
  saving,
}: {
  name: string;
  won: number;
  target: number;
  onSave: (target: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(target ? String(target) : "");
  const pct = target > 0 ? Math.min(100, Math.round((won / target) * 100)) : 0;
  const commit = () => {
    const n = Math.max(0, Number(val) || 0);
    if (n !== target) onSave(n);
  };
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">
          {eur(won)}
          {target > 0 ? ` / ${eur(target)} · ${pct}%` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded bg-muted">
          <div
            className={"h-2 rounded " + (pct >= 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={saving}
          placeholder="target €"
          className="h-7 w-28 text-xs"
        />
      </div>
    </div>
  );
}
