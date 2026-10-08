/**
 * Popup di collegamento agli assistenti AI nella pagina Integrazioni: una card
 * per Claude e una per ChatGPT, separate perché si collegano in modo diverso.
 *
 * - Claude: dal sito, dall'app e dal telefono si collega col connettore
 *   personalizzato e l'accesso OAuth (nessuna chiave); per Claude Code e Claude
 *   Desktop serve invece una chiave limitata all'azienda, che si crea qui.
 * - ChatGPT: solo connettore personalizzato con accesso OAuth — ChatGPT non sa
 *   mandare chiavi negli header — quindi niente chiavi da creare.
 *
 * Con l'OAuth azienda e livello (consulente/operativo) si scelgono nella pagina
 * di consenso di Edilizia in Cloud. Ogni popup mostra e revoca solo i propri
 * collegamenti; la gestione avanzata delle chiavi resta in Impostazioni → API.
 * Vedi src/lib/aiConnector.ts.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Check, Copy, Info, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useApiKeys, useCreateApiKey } from "@/hooks/useApiKeys";
import { useOAuthGrants, useRevokeOAuthGrant, type OAuthGrant } from "@/hooks/useOAuthGrants";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  LIVELLI,
  MCP_ENDPOINT,
  NOTA_PIANI_CHATGPT,
  PASSI_CHATGPT,
  PASSI_CLAUDE_CONNETTORE,
  assistenteDelClient,
  comandoClaudeCode,
  configClaudeDesktop,
  scopePerLivello,
  type AssistenteAi,
  type LivelloConnettore,
} from "@/lib/aiConnector";

function BloccoCopia({ testo, etichetta }: { testo: string; etichetta?: string }) {
  const [fatto, setFatto] = useState(false);
  const copia = async () => {
    try {
      await navigator.clipboard.writeText(testo);
      setFatto(true);
      setTimeout(() => setFatto(false), 1500);
    } catch {
      toast.error("Copia non riuscita: selezionala a mano.");
    }
  };
  return (
    <div className="relative">
      {etichetta && <p className="mb-1 text-xs font-medium text-muted-foreground">{etichetta}</p>}
      <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/50 p-3 pr-11 text-xs leading-relaxed whitespace-pre-wrap break-all">
        {testo}
      </pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="tap-compact absolute right-1.5 top-1.5 h-8 w-8"
        onClick={copia}
        aria-label="Copia"
      >
        {fatto ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function ElencoPassi({ passi }: { passi: string[] }) {
  return (
    <ol className="ml-4 list-decimal space-y-1.5 text-xs text-muted-foreground">
      {passi.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ol>
  );
}

/** Azienda corrente e se l'utente può collegare e revocare (gli amministratori). */
function useGestioneAzienda() {
  const { effectiveCompany, profile, role } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? undefined;
  const puoGestire = role === "company_admin" || role === "super_admin";
  return { companyId, puoGestire };
}

/** I collegamenti OAuth di QUESTO assistente, ognuno revocabile. */
function CollegamentiAttivi({ assistente }: { assistente: AssistenteAi }) {
  const { companyId, puoGestire } = useGestioneAzienda();
  const { data: tutti = [] } = useOAuthGrants(companyId);
  const revoca = useRevokeOAuthGrant(companyId);
  const collegati = useMemo(
    () => tutti.filter((g) => assistenteDelClient(g.client_name) === assistente
      || (assistente === "claude" && assistenteDelClient(g.client_name) === null)),
    [tutti, assistente],
  );
  if (collegati.length === 0) return null;

  const nomeDiRiserva = assistente === "chatgpt" ? "ChatGPT" : "Assistente AI";
  const revocaCollegamento = async (g: OAuthGrant) => {
    if (!puoGestire) return;
    try {
      const outcome = await revoca.mutateAsync(g.id);
      toast.success(`Collegamento revocato: ${g.client_name ?? nomeDiRiserva}`);
      if (outcome.needsProviderRevocation) toast.info("MCP è bloccato. Per ricollegare, il titolare deve revocare anche il consenso dell'app nel proprio account e avviare una nuova connessione.");
    } catch (e) {
      toast.error("Revoca non riuscita", {
        description: e instanceof Error ? e.message : "Riprova tra qualche secondo.",
      });
    }
  };

  return (
    <div className="rounded-xl border p-2">
      <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Consensi configurati {assistente === "claude" ? "(Claude e altri client MCP)" : "(ChatGPT)"} · {collegati.length}</p>
      <ul className="space-y-1">
        {collegati.map((g) => (
          <li key={g.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{g.client_name ?? nomeDiRiserva}</span>
              <span className="block text-[11px] text-muted-foreground">
                {g.livello === "operativo" ? "Operativo" : "Consulente"}
                {g.invii ? " · invii" : ""}
                {g.last_used_at ? ` · usato il ${new Date(g.last_used_at).toLocaleDateString("it-IT")}` : " · mai usato"}
              </span>
            </span>
            {puoGestire && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="tap-compact h-8 shrink-0 gap-1 text-destructive hover:text-destructive"
                onClick={() => revocaCollegamento(g)}
                disabled={revoca.isPending}
              >
                <Unlink className="h-3.5 w-3.5" /> Revoca
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SoloAmministratori() {
  return (
    <Alert>
      <ShieldCheck className="h-4 w-4" />
      <AlertDescription className="text-xs">Il collegamento lo autorizza un amministratore dell'azienda.</AlertDescription>
    </Alert>
  );
}

// ── ChatGPT: solo accesso OAuth ─────────────────────────────────────────────
export function ConnettoreChatGptPopup({ onClose }: { onClose: () => void }) {
  const { puoGestire } = useGestioneAzienda();
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground max-sm:hidden">
        Collega il gestionale a <strong>ChatGPT</strong>: chiedi i dati della tua azienda direttamente in chat. Nessuna
        chiave da copiare — ChatGPT ti fa entrare in Edilizia in Cloud e scegli tu cosa può fare.
      </p>

      <CollegamentiAttivi assistente="chatgpt" />

      <Alert className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">{NOTA_PIANI_CHATGPT}</AlertDescription>
      </Alert>

      {!puoGestire && <SoloAmministratori />}

      <ElencoPassi passi={PASSI_CHATGPT} />
      <BloccoCopia testo={MCP_ENDPOINT} etichetta="URL del server MCP" />

      <p className="text-[11px] text-muted-foreground">
        Nella pagina di accesso scegli <strong>Consulente</strong> (solo lettura) o <strong>Operativo</strong> (anche
        azioni); gli invii veri partono solo se li attivi.
      </p>

      <div className="flex justify-end">
        <Button onClick={onClose}>Fatto</Button>
      </div>
    </div>
  );
}

// ── Claude: accesso OAuth (sito, app, telefono) o chiave (Code, Desktop) ────
export function ConnettoreClaudePopup({ onClose }: { onClose: () => void }) {
  const { companyId, puoGestire } = useGestioneAzienda();
  const navigate = useNavigate();
  const { data: chiavi = [] } = useApiKeys(companyId);
  const creaChiave = useCreateApiKey(companyId);

  const [livello, setLivello] = useState<LivelloConnettore>("consulente");
  const [invii, setInvii] = useState(false);
  const [chiaveNuova, setChiaveNuova] = useState<string | null>(null);

  const chiaviAttive = useMemo(
    () => chiavi.filter((k) => k.is_active && /claude|assistente ai/i.test(k.name)
      && (!k.expires_at || new Date(k.expires_at) > new Date())),
    [chiavi],
  );

  // Promemoria di rotazione: se la chiave più vecchia è attiva da oltre 90
  // giorni, conviene crearne una nuova e revocare la vecchia. Mesi interi, per
  // un messaggio leggibile.
  const mesiChiavePiuVecchia = useMemo(() => {
    if (chiaviAttive.length === 0) return 0;
    const piuVecchia = Math.min(...chiaviAttive.map((k) => new Date(k.created_at).getTime()));
    return Math.floor((Date.now() - piuVecchia) / (30 * 24 * 60 * 60 * 1000));
  }, [chiaviAttive]);
  const consigliaRotazione = mesiChiavePiuVecchia >= 3;

  const vaiAdApi = () => {
    onClose();
    navigate("/azienda/impostazioni/api");
  };

  const creaLaChiave = async () => {
    if (!puoGestire) return;
    // Un nome riconoscibile e unico: il vincolo del database è per nome attivo.
    const base = livello === "operativo" ? "Claude (operativo)" : "Claude (consulente)";
    let nome = base;
    let suffix = 2;
    while (chiaviAttive.some(k => k.name.toLowerCase() === nome.toLowerCase())) nome = `${base} ${suffix++}`;
    try {
      const raw = await creaChiave.mutateAsync({ name: nome, scopes: scopePerLivello(livello, invii), expiryOption: "90d" });
      setChiaveNuova(raw);
    } catch (e) {
      toast.error("Chiave non creata", {
        description: e instanceof Error ? e.message : "Riprova tra qualche secondo.",
      });
    }
  };

  // ── Chiave appena creata: come incollarla in Claude Code / Claude Desktop ──
  if (chiaveNuova) {
    return (
      <div className="min-w-0 space-y-4">
        <Alert className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-xs text-emerald-900 dark:text-emerald-200">
            Chiave creata e limitata alla tua azienda. <strong>Copiala ora</strong>: dopo la chiusura non sarà più
            visibile (potrai sempre crearne un'altra).
          </AlertDescription>
        </Alert>

        <BloccoCopia testo={chiaveNuova} etichetta="La tua chiave" />

        <Tabs defaultValue="code">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code" className="text-xs sm:text-sm">Claude Code</TabsTrigger>
            <TabsTrigger value="desktop" className="text-xs sm:text-sm">Claude Desktop</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Incolla questo comando nel terminale (una volta):</p>
            <BloccoCopia testo={comandoClaudeCode(chiaveNuova)} />
          </TabsContent>

          <TabsContent value="desktop" className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Claude Desktop → Impostazioni → Sviluppatore → Modifica config. Aggiungi (serve Node.js sul computer):
            </p>
            <BloccoCopia testo={configClaudeDesktop(chiaveNuova)} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={onClose}>Ho copiato la chiave</Button>
        </div>
      </div>
    );
  }

  // ── Schermata iniziale ─────────────────────────────────────────────────────
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground max-sm:hidden">
        Collega il gestionale a <strong>Claude</strong>: l'assistente lavora solo sui dati della tua azienda.
      </p>

      <CollegamentiAttivi assistente="claude" />

      {!puoGestire && <SoloAmministratori />}

      {/* 1. Sito, app e telefono: connettore con accesso, nessuna chiave. */}
      <section className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold">Sito Claude, app e telefono</span>
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary max-sm:hidden">
            Consigliato
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-sm:hidden">
          Nessuna chiave da copiare: entri con il tuo account e scegli azienda e livello.
        </p>
        <ElencoPassi passi={PASSI_CLAUDE_CONNETTORE} />
        <BloccoCopia testo={MCP_ENDPOINT} etichetta="URL del connettore" />
      </section>

      {/* 2. Claude Code e Claude Desktop: serve una chiave limitata all'azienda. */}
      <section className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold">Claude Code e Claude Desktop</span>
        </div>
        <p className="text-xs text-muted-foreground max-sm:hidden">
          Qui serve una chiave limitata alla tua azienda: scegli cosa può fare l'assistente e creala. Scade dopo 90 giorni; puoi rinnovarla in Impostazioni → API.
        </p>

        {chiaviAttive.length > 0 && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Hai già {chiaviAttive.length === 1 ? "una chiave attiva" : `${chiaviAttive.length} chiavi attive`}. Puoi
              crearne un'altra qui sotto, oppure gestirle (revoca, rinnovo) in{" "}
              <button className="underline" onClick={vaiAdApi}>Impostazioni → API</button>.
            </AlertDescription>
          </Alert>
        )}

        {consigliaRotazione && (
          <Alert className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
              Una chiave è attiva da oltre {mesiChiavePiuVecchia} mesi. Per sicurezza conviene ogni tanto crearne una
              nuova e revocare la vecchia in <button className="underline" onClick={vaiAdApi}>Impostazioni → API</button>.
            </AlertDescription>
          </Alert>
        )}

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
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.descrizione}</p>
                <ul className="mt-2 space-y-0.5">
                  {l.esempi.map((e) => (
                    <li key={e} className="text-[11px] text-muted-foreground">« {e} »</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Invii reali / strumenti a pagamento: solo se lo attiva, e solo su «operativo». */}
        {livello === "operativo" && (
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
                Manda email, follow-up e solleciti veri e usa gli strumenti con costo AI. Spento di serie: lascialo così
                se vuoi che l'assistente prepari ma non invii nulla.
              </span>
            </span>
          </label>
        )}

        {puoGestire && (
          <div className="flex justify-end">
            <Button onClick={creaLaChiave} disabled={creaChiave.isPending} className="gap-2">
              {creaChiave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Crea la chiave
            </Button>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>Chiudi</Button>
      </div>
    </div>
  );
}
