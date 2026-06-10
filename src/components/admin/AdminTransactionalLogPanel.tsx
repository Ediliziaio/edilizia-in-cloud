/**
 * AdminTransactionalLogPanel — log REALE delle email transazionali di
 * piattaforma (email_delivery_log: inviti, reset password, dunning, ecc.).
 *
 * Nato dall'audit superadmin: /admin/email mostrava solo l'empty-state del
 * client OAuth con preview demo, mentre le transazionali vere (visibili solo
 * su Resend) non comparivano da nessuna parte nell'app.
 *
 * Best-effort: se la RLS non concede la lettura al ruolo corrente il pannello
 * sparisce senza rumore (return null) — il client email resta pienamente usabile.
 */
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface DeliveryRow {
  id: string;
  recipient: string;
  subject: string | null;
  status: string;
  sent_at: string;
  provider: string | null;
}

const FAILED_STATUSES = ["failed", "bounced", "error"];

function statusBadgeClass(status: string): string {
  if (FAILED_STATUSES.includes(status)) {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }
  if (status === "sent" || status === "delivered") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  return "bg-muted text-muted-foreground border-border";
}

export function AdminTransactionalLogPanel() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["admin-email-delivery-log-recent"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [recentRes, totalRes, failedRes] = await Promise.all([
        sb
          .from("email_delivery_log")
          .select("id, recipient, subject, status, sent_at, provider")
          .order("sent_at", { ascending: false })
          .limit(8),
        sb
          .from("email_delivery_log")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", since),
        sb
          .from("email_delivery_log")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", since)
          .in("status", FAILED_STATUSES),
      ]);
      if (recentRes.error) throw recentRes.error;
      return {
        recent: (recentRes.data ?? []) as DeliveryRow[],
        total7d: totalRes.count ?? 0,
        failed7d: failedRes.count ?? 0,
      };
    },
  });

  // RLS o tabella non leggibile: niente pannello, niente rumore.
  if (isError) return null;

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Send className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Email transazionali piattaforma</p>
              <p className="text-xs text-muted-foreground">
                Inviti, reset password e notifiche di sistema — log reale, non demo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-medium">
              {data.total7d.toLocaleString("it-IT")} <span className="text-muted-foreground">inviate 7gg</span>
            </span>
            <span className={data.failed7d > 0 ? "font-medium text-rose-600" : "text-muted-foreground"}>
              {data.failed7d.toLocaleString("it-IT")} fallite
            </span>
          </div>
        </div>

        {data.recent.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nessuna email transazionale registrata finora.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {data.recent.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="w-32 shrink-0 text-muted-foreground">
                  {new Date(row.sent_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="w-48 shrink-0 truncate font-medium" title={row.recipient}>
                  {row.recipient}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.subject ?? undefined}>
                  {row.subject ?? "—"}
                </span>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${statusBadgeClass(row.status)}`}>
                  {row.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
