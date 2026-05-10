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
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Plug, ArrowRight } from "lucide-react";
import { EmailLayout } from "./EmailLayout";

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

  const hasConnections = (connections?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Skeleton className="h-[calc(100vh-8rem)]" />
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-3xl">
        <EmptyConnectionsState />
      </div>
    );
  }

  return <EmailLayout />;
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

