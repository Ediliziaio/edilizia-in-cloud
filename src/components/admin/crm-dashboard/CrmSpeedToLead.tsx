/**
 * CrmSpeedToLead — la velocità sul lead (alla Belfort): tempo dal contatto
 * creato al PRIMO tocco, mediana + distribuzione (≤5min / ≤1h / ≤24h / oltre /
 * mai). "Un lead non chiamato in 5 minuti è quasi morto."
 *
 * Dati reali: marketing_contacts.created_at vs prima marketing_contact_activities
 * del contatto, nel periodo. Cast + fail-open (tabelle non sempre nei tipi).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Timer, Loader2 } from "lucide-react";

const DAY = 24 * 60 * 60 * 1000;
const fmtDur = (ms: number) => {
  const m = ms / 60000;
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1).replace(".", ",")} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} g`;
};

export function CrmSpeedToLead({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - days * DAY).toISOString(), [nowMs, days]);

  const q = useQuery({
    queryKey: ["crm-dash", "speed-to-lead", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [contacts, acts] = await Promise.all([
        supabase.from("marketing_contacts").select("id,created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(5000),
        sb.from("marketing_contact_activities").select("contact_id,created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(8000),
      ]);
      const firstAct = new Map<string, number>();
      for (const a of (acts.error ? [] : acts.data ?? []) as { contact_id: string | null; created_at: string }[]) {
        if (!a.contact_id) continue;
        const t = new Date(a.created_at).getTime();
        const prev = firstAct.get(a.contact_id);
        if (prev == null || t < prev) firstAct.set(a.contact_id, t);
      }
      const deltas: number[] = [];
      let mai = 0;
      for (const c of (contacts.data ?? []) as { id: string; created_at: string }[]) {
        const created = new Date(c.created_at).getTime();
        const f = firstAct.get(c.id);
        if (f != null && f >= created) deltas.push(f - created);
        else mai += 1;
      }
      return { deltas, mai, totale: (contacts.data ?? []).length, activitiesMissing: acts.error };
    },
  });

  const m = useMemo(() => {
    const d = q.data;
    if (!d) return null;
    const sorted = [...d.deltas].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const b5 = d.deltas.filter((x) => x <= 5 * 60000).length;
    const b1h = d.deltas.filter((x) => x > 5 * 60000 && x <= 60 * 60000).length;
    const b24 = d.deltas.filter((x) => x > 60 * 60000 && x <= DAY).length;
    const bOlt = d.deltas.filter((x) => x > DAY).length;
    const contattati = d.deltas.length;
    const entro24 = contattati + d.mai > 0 ? Math.round(((b5 + b1h + b24) / (contattati + d.mai)) * 100) : 0;
    return { median, b5, b1h, b24, bOlt, mai: d.mai, contattati, totale: d.totale, entro24, missing: d.activitiesMissing };
  }, [q.data]);

  const buckets = m
    ? [
        { label: "≤ 5 min", v: m.b5, color: "hsl(160 84% 39%)" },
        { label: "≤ 1 ora", v: m.b1h, color: "hsl(160 60% 50%)" },
        { label: "≤ 24 ore", v: m.b24, color: "hsl(43 96% 56%)" },
        { label: "oltre", v: m.bOlt, color: "hsl(25 95% 53%)" },
        { label: "mai", v: m.mai, color: "hsl(0 84% 60%)" },
      ]
    : [];
  const maxB = Math.max(1, ...buckets.map((b) => b.v));
  const healthColor = !m ? "" : m.entro24 >= 80 ? "hsl(160 84% 39%)" : m.entro24 >= 50 ? "hsl(43 96% 56%)" : "hsl(0 84% 60%)";

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4" aria-hidden="true" /> Velocità sul lead
          <span className="ml-auto text-xs font-normal text-muted-foreground">tempo al 1° contatto</span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : !m || m.totale === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessun lead nel periodo per misurare la reattività.</p>
        ) : (
          <>
            <div className="mb-3 flex items-end gap-4">
              <div>
                <div className="text-[11px] text-muted-foreground">Mediana 1° contatto</div>
                <div className="text-2xl font-bold leading-tight">{m.median != null ? fmtDur(m.median) : "—"}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[11px] text-muted-foreground">Contattati entro 24h</div>
                <div className="text-2xl font-bold leading-tight" style={{ color: healthColor }}>{m.entro24}%</div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-[12px]">
              {buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-muted-foreground">{b.label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded bg-muted/60">
                    <span className="block h-3 rounded" style={{ width: `${Math.max(b.v > 0 ? 4 : 0, (b.v / maxB) * 100)}%`, background: b.color }} />
                  </span>
                  <span className="w-7 shrink-0 text-right font-medium tabular-nums">{b.v}</span>
                </div>
              ))}
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              {m.missing
                ? "Attività non disponibili: la velocità si misura coi log di contatto."
                : m.entro24 >= 80
                  ? "Reattività alta: stai prendendo i lead mentre sono caldi."
                  : "Un lead non contattato in fretta si raffredda: accorcia il tempo al primo tocco."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
