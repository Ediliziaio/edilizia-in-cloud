/**
 * Pagina di consenso OAuth per il connettore AI.
 *
 * Quando un client (Claude, ChatGPT) vuole collegarsi, Supabase (OAuth 2.1
 * server) rimanda l'utente qui con `?authorization_id=…`. La pagina mostra chi
 * chiede accesso, fa scegliere azienda e livello, salva il consenso nel nostro
 * registro (mcp_oauth_grants via RPC) e poi conferma a Supabase, che emette il
 * token. Da lì il server MCP mappa il token → livello/azienda.
 *
 * Il livello (non gli scope) è ciò che memorizziamo: OAuth non ha scope
 * personalizzati, e gli scope li ricava il server dal livello.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Check, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";
import { LIVELLI, type LivelloConnettore } from "@/lib/aiConnector";

type Dettagli = { clientId: string; clientName: string; scope: string; redirectHost: string | null };

/** Host del redirect_uri del client: mostrato a chi autorizza per riconoscere
 *  un assistente vero da un finto omonimo (la registrazione dei client è aperta). */
function hostDa(uri: string | undefined): string | null {
  try { return uri ? new URL(uri).host : null; } catch { return null; }
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const navigate = useNavigate();
  const { user, isLoading, effectiveCompany, profile, role } = useAuth();
  const permessi = usePermissions();

  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const companyName = effectiveCompany?.name ?? "la tua azienda";
  const puoAutorizzare =
    role === "company_admin" || role === "super_admin" || permessi.canEditSettingsIntegrations;

  const [stato, setStato] = useState<"carico" | "consenso" | "invio" | "errore" | "concluso">("carico");
  const [errore, setErrore] = useState<string | null>(null);
  const [dettagli, setDettagli] = useState<Dettagli | null>(null);
  const [livello, setLivello] = useState<LivelloConnettore>("consulente");
  const [invii, setInvii] = useState(false);

  // Carica i dettagli dell'autorizzazione (o reindirizza se già dato il consenso).
  // Parte solo quando c'è un utente: senza sessione mostriamo il login qui sotto,
  // così l'authorization_id resta nell'URL (il login normale rimanda alla dashboard).
  useEffect(() => {
    if (isLoading || !user) return;
    let vivo = true;
    (async () => {
      if (!authorizationId) {
        setErrore("Richiesta di autorizzazione mancante o non valida.");
        setStato("errore");
        return;
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!vivo) return;
      if (error) {
        setErrore(traduciErrore(error.message));
        setStato("errore");
        return;
      }
      // Consenso già dato in passato: Supabase manda direttamente al client.
      if (!("authorization_id" in data)) {
        window.location.href = (data as { redirect_url: string }).redirect_url;
        return;
      }
      setDettagli({
        clientId: data.client.id,
        clientName: data.client.name || "Assistente AI",
        scope: data.scope,
        redirectHost: hostDa(data.redirect_uri),
      });
      setStato("consenso");
    })();
    return () => { vivo = false; };
  }, [authorizationId, user, isLoading]);

  const approva = async () => {
    if (!dettagli || !companyId) return;
    setStato("invio");
    setErrore(null);
    try {
      // 1) registra il consenso da noi (l'RPC verifica che tu sia admin dell'azienda)
      const { error: errGrant } = await supabase.rpc("mcp_oauth_upsert_grant" as never, {
        p_client_id: dettagli.clientId,
        p_company_id: companyId,
        p_livello: livello,
        p_invii: livello === "operativo" && invii,
        p_client_name: dettagli.clientName,
      } as never);
      if (errGrant) throw new Error(errGrant.message);
      // 2) conferma a Supabase, che emette il token e rimanda al client
      const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId);
      if (error) throw new Error(error.message);
      setStato("concluso");
      window.location.href = data.redirect_url;
    } catch (e) {
      setErrore(traduciErrore(e instanceof Error ? e.message : String(e)));
      setStato("consenso");
    }
  };

  const rifiuta = async () => {
    setStato("invio");
    try {
      const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (error) throw new Error(error.message);
      window.location.href = data.redirect_url;
    } catch {
      // Se il rifiuto non riesce, torna comunque nell'app.
      navigate("/azienda/impostazioni/integrazioni", { replace: true });
    }
  };

  const livelloScelto = useMemo(() => LIVELLI.find((l) => l.id === livello), [livello]);

  // Senza sessione: login qui, restando su /oauth/consent (l'authorization_id resta).
  if (!isLoading && !user) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Accedi per collegare l'assistente</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Entra nel gestionale con il tuo account: il collegamento continuerà da qui.
        </p>
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Collega un assistente AI</h1>
      </div>

      {(isLoading || stato === "carico") && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verifica della richiesta…
        </div>
      )}

      {stato === "errore" && (
        <>
          <Alert variant="destructive">
            <X className="h-4 w-4" />
            <AlertDescription className="text-xs">{errore}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => navigate("/azienda/impostazioni/integrazioni")}>
            Torna alle integrazioni
          </Button>
        </>
      )}

      {(stato === "consenso" || stato === "invio") && dettagli && (
        <>
          <p className="text-sm text-muted-foreground">
            <strong>{dettagli.clientName}</strong> chiede di collegarsi al gestionale di{" "}
            <strong>{companyName}</strong>. L'assistente lavorerà <strong>solo sui dati di questa azienda</strong>.
            Scegli cosa può fare.
          </p>

          {dettagli.redirectHost && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              I dati verranno inviati a <strong className="font-mono">{dettagli.redirectHost}</strong>. Autorizza solo se
              riconosci questo indirizzo (es. <span className="font-mono">claude.ai</span>,{" "}
              <span className="font-mono">chatgpt.com</span>).
            </p>
          )}

          {errore && (
            <Alert variant="destructive">
              <X className="h-4 w-4" />
              <AlertDescription className="text-xs">{errore}</AlertDescription>
            </Alert>
          )}

          {!puoAutorizzare ? (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Il collegamento lo attiva un amministratore dell'azienda. Chiedi a chi gestisce le integrazioni.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-2">
              {LIVELLI.map((l) => {
                const attivo = livello === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLivello(l.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      attivo ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50",
                    )}
                    aria-pressed={attivo}
                  >
                    <div className="flex items-center gap-2">
                      {l.id === "operativo" ? <Sparkles className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-primary" />}
                      <span className="text-sm font-semibold">{l.titolo}</span>
                      {attivo && <Check className="ml-auto h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{l.descrizione}</p>
                  </button>
                );
              })}
            </div>
          )}

          {puoAutorizzare && livello === "operativo" && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:bg-amber-950/20">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={invii}
                onChange={(e) => setInvii(e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Permetti invii reali e strumenti a pagamento</span>
                <span className="block text-xs text-muted-foreground">
                  Manda email, follow-up e solleciti veri e usa gli strumenti con costo AI. Spento di serie.
                </span>
              </span>
            </label>
          )}

          <p className="text-[11px] text-muted-foreground">
            Potrai revocare questo collegamento in qualsiasi momento da Impostazioni → API.
            {livelloScelto ? ` Esempio: « ${livelloScelto.esempi[0]} »` : ""}
          </p>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={rifiuta} disabled={stato === "invio"}>
              Rifiuta
            </Button>
            <Button className="flex-1 gap-2" onClick={approva} disabled={stato === "invio" || !puoAutorizzare || !companyId}>
              {stato === "invio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Autorizza
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function traduciErrore(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("amministratore")) return "Solo un amministratore dell'azienda può collegare un assistente AI.";
  if (m.includes("expired") || m.includes("scadut")) return "La richiesta è scaduta. Riprova dal tuo assistente AI.";
  if (m.includes("not found") || m.includes("invalid")) return "Richiesta non valida o già usata. Riprova dal tuo assistente AI.";
  return msg || "Qualcosa è andato storto. Riprova.";
}
