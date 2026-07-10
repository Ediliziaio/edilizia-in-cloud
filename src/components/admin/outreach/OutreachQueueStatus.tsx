import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Clock, Users, AlertTriangle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Battito del motore invii ("vedere il flusso" a livello campagna): quanti
 * messaggi sono in coda, inviati oggi, quanti contatti sono in cadenza e quando
 * partirà il prossimo invio. Su outreach_send_queue + outreach_enrollments.
 * Si aggiorna da solo ogni 30s. Errore tabella mancante → silenzioso.
 */

export function OutreachQueueStatus({ companyId }: { companyId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = useQuery({
    queryKey: ["outreach-queue-status", companyId],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const iso = todayStart.toISOString();
      const Q = () => db.from("outreach_send_queue").select("id", { count: "exact", head: true }).eq("company_id", companyId);
      const [queued, sentToday, failed, active, next] = await Promise.all([
        Q().eq("status", "queued"),
        Q().eq("status", "sent").gte("sent_at", iso),
        Q().eq("status", "failed"),
        db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        db.from("outreach_send_queue").select("scheduled_for").eq("company_id", companyId).eq("status", "queued").order("scheduled_for", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (queued.error) throw queued.error;
      // Etichetta "prossimo invio" calcolata QUI (non in render: purezza) e
      // rinfrescata dal refetch 30s. Se scheduled_for è nel PASSATO i messaggi
      // sono già "pronti" e partono al prossimo tick nel limite del cap
      // warm-up — NON sono in ritardo: dire "un giorno fa" faceva sembrare un
      // errore. Solo se è futuro mostriamo il "tra…".
      const nextAt = (next.data?.scheduled_for as string | null) ?? null;
      let nextLabel = "—";
      if (nextAt) {
        const nextMs = new Date(nextAt).getTime();
        if (Number.isFinite(nextMs)) {
          if (nextMs <= Date.now()) {
            nextLabel = "pronte, al prossimo giro";
          } else {
            try { nextLabel = formatDistanceToNow(new Date(nextAt), { addSuffix: true, locale: it }); } catch { /* — */ }
          }
        }
      }
      return {
        queued: queued.count ?? 0,
        sentToday: sentToday.count ?? 0,
        failed: failed.count ?? 0,
        active: active.count ?? 0,
        nextLabel,
      };
    },
  });

  if (q.isLoading) return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (q.error) return null;
  const d = q.data;
  if (!d) return null;

  const idle = d.queued === 0 && d.sentToday === 0 && d.active === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Send className="h-5 w-5 text-orange-500" /> Motore invii — oggi</CardTitle>
      </CardHeader>
      <CardContent>
        {idle ? (
          <p className="py-2 text-sm text-muted-foreground">
            Motore fermo: nessun invio in corso. Arruola una lista in una sequenza (scheda <strong>Sequenze</strong>) per avviare il flusso.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile icon={Users} label="In cadenza" value={d.active} hint="iscrizioni attive" />
            <Tile icon={Clock} label="In coda" value={d.queued} hint={d.queued > 0 ? d.nextLabel : "—"} tone="active" />
            <Tile icon={Send} label="Inviate oggi" value={d.sentToday} tone="good" />
            <Tile icon={AlertTriangle} label="Fallite" value={d.failed} tone={d.failed > 0 ? "warn" : "default"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: typeof Send; label: string; value: number; hint?: string; tone?: "default" | "active" | "good" | "warn";
}) {
  const valCls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "active" ? "text-orange-600" : "";
  const chip =
    tone === "good" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300"
    : tone === "warn" ? "bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300"
    : tone === "active" ? "bg-orange-50 text-orange-600 dark:bg-orange-900/25 dark:text-orange-300"
    : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-lg border p-3 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${chip}`}><Icon className="h-3.5 w-3.5" /></span>
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${valCls}`}>{value.toLocaleString("it-IT")}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
