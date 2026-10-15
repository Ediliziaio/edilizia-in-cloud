import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Button } from "@/components/ui/button";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

const ChatHub = lazy(() => import("@/pages/azienda/ChatHub"));

function useEnsureSilvioAdminChannel(enabled: boolean, userId: string | undefined) {
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    setFailed(false);
    void (async () => {
      try {
        const { error } = await supabase.rpc("ensure_user_silvio_admin_channel");
        if (error) throw error;
        if (cancelled) return;
        // La creazione può terminare dopo la prima lettura dei canali:
        // aggiorna subito le membership invece di attendere i 5 minuti di cache.
        await queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships", PLATFORM_ADMIN_COMPANY_ID, userId] });
        await queryClient.invalidateQueries({ queryKey: ["internal-chat-channels", PLATFORM_ADMIN_COMPANY_ID] });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, attempt, queryClient]);
  return { failed, retry: () => setAttempt(current => current + 1) };
}

export default function AdminTeamChat() {
  const { permissions } = useSuperAdminPermissions();
  const { user } = useAuth();
  const canAccess = permissions.can_manage_companies;
  const preparation = useEnsureSilvioAdminChannel(canAccess, user?.id);
  if (!canAccess) return <AccessDenied />;
  // Stesso workspace canonico usato dal client email e dalle RPC del team.
  // Nessuna ricerca arbitraria della prima company con un flag amministrativo.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {preparation.failed && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex-1">Non è stato possibile preparare l’assistente personale. Puoi continuare a usare la chat del team.</p>
          <Button size="sm" variant="outline" onClick={preparation.retry}>Riprova</Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Caricamento chat team…</div>}>
          <ChatHub companyIdOverride={PLATFORM_ADMIN_COMPANY_ID} />
        </Suspense>
      </div>
    </div>
  );
}
