/**
 * SilvioAdminPage — Landing che apre la chat con Silvio Superadmin.
 *
 * Architettura: invece di una chat separata, riusa il canale `silvio-admin`
 * dentro `/admin/chat` (InternalChat sulla platform_admin_company).
 * Questa pagina è una scorciatoia che:
 *   1. Auto-crea il canale silvio-admin (idempotente)
 *   2. Redirect a /admin/chat?channel=silvio-admin
 *
 * Vantaggi: una sola UI di chat (no doppione), riuso completo di tutte le
 * feature di InternalChat (allegati, ricerca, presence, reazioni, ecc.).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

export default function SilvioAdminPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: rpcErr } = await (supabase as any).rpc(
          "ensure_user_silvio_admin_channel"
        );
        if (cancelled) return;

        if (rpcErr) {
          setError(rpcErr.message ?? "Errore creazione canale Silvio Admin");
          return;
        }
        const channelId = data as string | null;
        if (!channelId) {
          setError("Canale silvio-admin non disponibile");
          return;
        }
        // Redirect alla chat team con canale silvio-admin selezionato
        navigate(`/admin/chat?channel=${channelId}`, { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          {error ? (
            <>
              <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Silvio Superadmin
              </h2>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">
                Verifica di avere ruolo <code>super_admin</code> e che la
                platform_admin_company sia configurata.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Silvio Superadmin</h2>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Apertura chat…
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
