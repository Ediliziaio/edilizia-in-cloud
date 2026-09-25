import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, RefreshCw, Settings2, AlertTriangle, Loader2 } from "lucide-react";

export interface BrokenConnection {
  id: string;
  provider: string;
  provider_label?: string | null;
  email_address: string;
  status: string;
  last_sync_error?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokenConnections: BrokenConnection[];
  settingsPath: string;
}

/** Normalizza il provider verso i due supportati da email-oauth-start. */
function oauthProvider(p: string): "gmail" | "outlook" | null {
  const v = (p || "").toLowerCase();
  if (v.includes("gmail") || v.includes("google")) return "gmail";
  if (v.includes("outlook") || v.includes("microsoft") || v.includes("office")) return "outlook";
  return null;
}

/**
 * Popup mirato di riconnessione: mostra le caselle in errore e, per ognuna, un
 * bottone "Riconnetti" che riavvia l'OAuth di QUELLA casella (email-oauth-start →
 * redirect a Google/Microsoft). Per le caselle IMAP/SMTP rimanda alle impostazioni.
 */
export default function ReconnectMailboxDialog({ open, onOpenChange, brokenConnections, settingsPath }: Props) {
  const { effectiveCompany } = useAuth();

  const reconnect = useMutation({
    mutationFn: async (conn: BrokenConnection) => {
      if (!effectiveCompany?.id) throw new Error("Azienda attiva non disponibile");
      const provider = oauthProvider(conn.provider);
      if (!provider) throw new Error("Questa casella usa IMAP/SMTP: verifica le impostazioni manualmente.");

      const isAdmin = window.location.pathname.startsWith("/admin/");
      const callbackPath = isAdmin
        ? "/admin/impostazioni/integrazioni/email-callback"
        : "/azienda/impostazioni/integrazioni/email-callback";
      const redirectUri = `${window.location.origin}${callbackPath}`;

      const { data, error } = await supabase.functions.invoke<{ auth_url: string; state: string; error?: string }>(
        "email-oauth-start",
        { body: { provider, redirect_uri: redirectUri, company_id: effectiveCompany.id } },
      );
      if (error || !data?.auth_url) {
        throw new Error(data?.error ?? error?.message ?? "Errore nell'avvio della riconnessione");
      }
      // Stato per il re-check lato callback + ritorno alla pagina corrente.
      sessionStorage.setItem("oauth_state", data.state);
      sessionStorage.setItem("oauth_provider", provider);
      sessionStorage.setItem("email_oauth_return_to", `${window.location.pathname}${window.location.search}`);
      window.location.href = data.auth_url;
    },
    onError: (e) => toast.error("Riconnessione fallita", { description: (e as Error).message }),
  });

  const pendingId = reconnect.isPending ? (reconnect.variables as BrokenConnection | undefined)?.id : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            Caselle da riconnettere
          </DialogTitle>
          <DialogDescription className="max-sm:sr-only">
            Una o più caselle hanno perso l'autorizzazione. Riconnetti quella interessata per ripristinare la sincronizzazione.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {brokenConnections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nessuna casella da riconnettere.</p>
          ) : (
            brokenConnections.map((conn) => {
              const canOAuth = !!oauthProvider(conn.provider);
              const isThisPending = pendingId === conn.id;
              return (
                <div key={conn.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1 max-sm:mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{conn.email_address}</span>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                      {conn.provider_label ?? conn.provider}
                    </Badge>
                  </div>
                  {conn.last_sync_error && (
                    <p className="text-[11px] text-rose-700 mb-2 line-clamp-2 max-sm:hidden">{conn.last_sync_error}</p>
                  )}
                  {canOAuth ? (
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => reconnect.mutate(conn)}
                      disabled={reconnect.isPending}
                    >
                      {isThisPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Riconnetti {conn.email_address.split("@")[0]}
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="w-full gap-1.5">
                      <Link to={settingsPath} onClick={() => onOpenChange(false)}>
                        <Settings2 className="h-4 w-4" />Verifica impostazioni IMAP/SMTP
                      </Link>
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile: la riconnessione basta; le impostazioni sono lavoro da scrivania. */}
        <div className="pt-1 max-sm:hidden">
          <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground gap-1.5">
            <Link to={settingsPath} onClick={() => onOpenChange(false)}>
              <Settings2 className="h-4 w-4" />Apri tutte le impostazioni email
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
