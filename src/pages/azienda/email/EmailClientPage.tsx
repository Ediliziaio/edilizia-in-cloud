/**
 * EmailClientPage — Sprint E1 placeholder
 *
 * Pagina del client email integrato. Visibile solo se feature flag
 * 'email_client' è attiva per la company (Beta gate via sidebar).
 *
 * Sprint E1 (questa fase): scheletro vuoto + check connessioni email
 * dell'utente. Se nessuna connessione → empty state con CTA "Collega
 * Gmail/Outlook" che porta alle impostazioni profilo.
 *
 * Sprint E2-E5: 3-pane Gmail-style, threading, compose, IMAP, AI.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Plug, Sparkles, ArrowRight, Inbox } from "lucide-react";

export default function EmailClientPage() {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;

  const { data: connections, isLoading } = useQuery({
    queryKey: ["my-email-connections", userId, companyId],
    enabled: !!userId && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status")
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["my-email-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: total } = await (supabase as any)
        .from("v_my_email_inbox")
        .select("id", { count: "exact", head: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: unread } = await (supabase as any)
        .from("v_my_email_inbox")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return { total: total ?? 0, unread: unread ?? 0 };
    },
  });

  const hasConnections = (connections?.length ?? 0) > 0;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Email</h1>
              <Badge variant="secondary" className="bg-violet-100 text-violet-700 border-violet-200">
                <Sparkles className="h-3 w-3 mr-1" />
                Beta
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Client email integrato con AI: leggi, scrivi, classifica. Solo per i tuoi account.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !hasConnections ? (
        <EmptyConnectionsState />
      ) : (
        <ComingSoonInbox stats={stats} connectionCount={connections!.length} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function EmptyConnectionsState() {
  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50/40 to-fuchsia-50/30">
      <CardContent className="p-10 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white shadow-sm border flex items-center justify-center mb-4">
          <Plug className="h-8 w-8 text-violet-600" />
        </div>
        <h2 className="text-lg font-semibold">Collega la tua prima casella email</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Per usare il client email integrato, collega un account Gmail o Outlook
          dalle impostazioni del tuo profilo. Solo tu vedrai le tue email.
        </p>
        <Button asChild className="mt-6 gap-2">
          <Link to="/azienda/impostazioni/mio-profilo">
            <Mail className="h-4 w-4" />
            Vai alle Impostazioni Email
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-[11px] text-muted-foreground/70 mt-4">
          Sprint E2-E5 (in arrivo): UI Gmail-style 3-pane · Compose/Reply · IMAP/SMTP custom · AI search
        </p>
      </CardContent>
    </Card>
  );
}

function ComingSoonInbox({
  stats,
  connectionCount,
}: {
  stats?: { total: number; unread: number };
  connectionCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={Plug}
          label="Account collegati"
          value={connectionCount.toString()}
          color="text-violet-600"
        />
        <StatCard
          icon={Inbox}
          label="Email totali"
          value={(stats?.total ?? 0).toString()}
          color="text-sky-600"
        />
        <StatCard
          icon={Mail}
          label="Non lette"
          value={(stats?.unread ?? 0).toString()}
          color="text-rose-600"
        />
      </div>

      <Card className="border-dashed border-2 border-violet-200">
        <CardContent className="p-12 text-center">
          <Sparkles className="h-10 w-10 text-violet-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold">Inbox in costruzione</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Le fondazioni sono pronte: storage email, threading, AI triage, RLS per-utente.
            La UI Gmail-style (3-pane con lista, viewer, compose) arriva nello{" "}
            <strong>Sprint E2</strong>.
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-4">
            Le tue email continuano ad essere salvate in background. Quando l'interfaccia
            sarà pronta, le troverai tutte qui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
