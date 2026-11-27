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
import { Bot, Building2, Check, Crown, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";
import { LIVELLI, LIVELLI_SUPERADMIN, type AmbitoConnettore, type LivelloConnettore } from "@/lib/aiConnector";
import { testoGrezzoErrore } from "@/lib/messaggioErrore";

// La colonna nuova non è ancora nei tipi generati.
type LetturaAzienda = { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => {
  maybeSingle: () => Promise<{ data: { ai_connettore_dipendenti?: boolean } | null }>;
} } } };

const RUOLI_DIPENDENTI = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];

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

  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const companyName = effectiveCompany?.name ?? "la tua azienda";
  const superAdmin = role === "super_admin";
  const amministratore = role === "company_admin" || superAdmin;
  // I dipendenti collegano il PROPRIO assistente solo se l'azienda lo permette;
  // l'assistente farà solo ciò che il dipendente può fare nell'app (server MCP).
  const [dipendentiAmmessi, setDipendentiAmmessi] = useState(false);
  useEffect(() => {
    if (amministratore || !companyId || !role || !RUOLI_DIPENDENTI.includes(role)) return;
    let vivo = true;
    (supabase as unknown as LetturaAzienda).from("companies")
      .select("ai_connettore_dipendenti").eq("id", companyId).maybeSingle()
      .then(({ data }) => {
        if (vivo) setDipendentiAmmessi(data?.ai_connettore_dipendenti === true);
      });
    return () => { vivo = false; };
  }, [amministratore, companyId, role]);
  const puoAutorizzare = amministratore || dipendentiAmmessi;
  // Il super admin può collegare l'assistente alla propria area (statistiche,
  // aziende, piani, CRM della piattaforma) invece che a un'azienda.
  const [ambitoScelto, setAmbito] = useState<AmbitoConnettore | null>(null);
  const ambito: AmbitoConnettore = ambitoScelto ?? (superAdmin ? "piattaforma" : "azienda");
  const piattaforma = superAdmin && ambito === "piattaforma";
  const livelli = piattaforma ? LIVELLI_SUPERADMIN : LIVELLI;
  const integrazioni = superAdmin ? "/admin/impostazioni/integrazioni" : "/azienda/impostazioni/integrazioni";

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
    if (!dettagli || !puoAutorizzare || (!piattaforma && !companyId)) return;
    setStato("invio");
    setErrore(null);
    let oauthApproved = false;
    try {
      // Approve without auto-navigation. A failed OAuth approval must never
      // create an apparently active application grant.
      const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error) throw new Error(error.message);
      oauthApproved = true;
      // Register the company grant before releasing the authorization code to
      // the client. If this fails, MCP remains closed and we do not redirect.
      const { error: errGrant } = piattaforma
        ? await supabase.rpc("mcp_oauth_upsert_grant_piattaforma" as never, {
          p_client_id: dettagli.clientId,
          p_livello: livello,
          p_invii: livello === "operativo" && invii,
          p_client_name: dettagli.clientName,
        } as never)
        : await supabase.rpc("mcp_oauth_upsert_grant" as never, {
          p_client_id: dettagli.clientId,
          p_company_id: companyId,
          p_livello: livello,
          p_invii: amministratore && livello === "operativo" && invii,
          p_client_name: dettagli.clientName,
        } as never);
      if (errGrant) throw new Error(errGrant.message);
      setStato("concluso");
      window.location.href = data.redirect_url;
    } catch (e) {
      const message = traduciErrore(testoGrezzoErrore(e));
      setErrore(oauthApproved ? `${message} Il collegamento aziendale non è stato salvato. Avvia una nuova connessione dall'assistente.` : message);
      setStato(oauthApproved ? "errore" : "consenso");
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
      navigate(integrazioni, { replace: true });
    }
  };

  const livelloScelto = useMemo(() => livelli.find((l) => l.id === livello), [livelli, livello]);

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
          <Button variant="outline" onClick={() => navigate(integrazioni)}>
            Torna alle integrazioni
          </Button>
        </>
      )}

      {(stato === "consenso" || stato === "invio") && dettagli && (
        <>
          {superAdmin && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Dove lavora l'assistente">
              {([
                { id: "piattaforma" as const, icona: Crown, titolo: "Area superadmin", sotto: "Tutta la piattaforma" },
                { id: "azienda" as const, icona: Building2, titolo: companyName, sotto: "Solo questa azienda" },
              ]).map((o) => {
                const attivo = ambito === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={attivo}
                    disabled={o.id === "azienda" && !companyId}
                    onClick={() => setAmbito(o.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors disabled:opacity-50",
                      attivo ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <o.icona className="h-4 w-4 text-primary" />
                      <span className="truncate text-sm font-semibold">{o.titolo}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{o.sotto}</p>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {piattaforma ? (
              <>
                <strong>{dettagli.clientName}</strong> chiede di collegarsi all'<strong>area superadmin</strong>: potrà
                vedere i numeri della piattaforma e i dati di tutte le aziende. Scegli cosa può fare.
              </>
            ) : (
              <>
                <strong>{dettagli.clientName}</strong> chiede di collegarsi al gestionale di{" "}
                <strong>{companyName}</strong>. L'assistente lavorerà <strong>solo sui dati di questa azienda</strong>.
                Scegli cosa può fare.
              </>
            )}{" "}
            Se questo stesso client era già collegato, il nuovo consenso sostituisce quello precedente.
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
                Il collegamento lo attiva un amministratore dell'azienda, oppure ti permette di collegare il tuo
                assistente da Impostazioni → Integrazioni. Chiedi a chi gestisce le integrazioni.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-2">
              {livelli.map((l) => {
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

          {!amministratore && puoAutorizzare && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              L'assistente farà solo ciò che puoi fare tu nel gestionale, con i tuoi permessi. Gli invii reali restano
              agli amministratori.
            </p>
          )}

          {amministratore && livello === "operativo" && (
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
            Potrai revocare questo collegamento in qualsiasi momento da {piattaforma ? "Impostazioni → Integrazioni" : "Impostazioni → API"}.
            {livelloScelto ? ` Esempio: « ${livelloScelto.esempi[0]} »` : ""}
          </p>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={rifiuta} disabled={stato === "invio"}>
              Rifiuta
            </Button>
            <Button className="flex-1 gap-2" onClick={approva} disabled={stato === "invio" || !puoAutorizzare || (!piattaforma && !companyId)}>
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
