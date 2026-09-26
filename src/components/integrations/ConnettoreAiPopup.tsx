/**
 * Popup «Collega a Claude · ChatGPT» nella pagina Integrazioni.
 *
 * Un clic crea (una volta) una chiave limitata all'azienda e mostra come
 * incollarla in Claude o in ChatGPT. Il livello decide se l'assistente può solo
 * leggere o anche agire (vedi src/lib/aiConnector.ts). La gestione avanzata
 * (revoca, rotazione, altre chiavi) resta in Impostazioni → API.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Check, Copy, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useApiKeys, useCreateApiKey } from "@/hooks/useApiKeys";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  LIVELLI,
  MCP_ENDPOINT,
  comandoClaudeCode,
  configClaudeDesktop,
  passiChatGpt,
  scopePerLivello,
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

export default function ConnettoreAiPopup({ onClose }: { onClose: () => void }) {
  const { effectiveCompany, profile, role } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? undefined;
  const permissions = usePermissions();
  const puoGestire = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;
  const navigate = useNavigate();

  const { data: chiavi = [] } = useApiKeys(companyId);
  const creaChiave = useCreateApiKey(companyId);

  const [livello, setLivello] = useState<LivelloConnettore>("consulente");
  const [invii, setInvii] = useState(false);
  const [chiaveNuova, setChiaveNuova] = useState<string | null>(null);

  const chiaviAttive = useMemo(
    () => chiavi.filter((k) => k.is_active && (!k.expires_at || new Date(k.expires_at) > new Date())),
    [chiavi],
  );

  const collega = async () => {
    if (!puoGestire) return;
    // Un nome riconoscibile e unico: il vincolo del database è per nome attivo.
    const base = livello === "operativo" ? "Assistente AI (operativo)" : "Assistente AI";
    const nome = chiaviAttive.some((k) => k.name.toLowerCase() === base.toLowerCase())
      ? `${base} · ${new Date().toLocaleDateString("it-IT")}`
      : base;
    try {
      const raw = await creaChiave.mutateAsync({ name: nome, scopes: scopePerLivello(livello, invii), expiryOption: "never" });
      setChiaveNuova(raw);
    } catch (e) {
      toast.error("Collegamento non riuscito", {
        description: e instanceof Error ? e.message : "Riprova tra qualche secondo.",
      });
    }
  };

  // ── Chiave appena creata: le istruzioni per Claude e ChatGPT ────────────────
  if (chiaveNuova) {
    const chatgpt = passiChatGpt(chiaveNuova);
    return (
      <div className="space-y-4">
        <Alert className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-xs text-emerald-900 dark:text-emerald-200">
            Chiave creata e limitata alla tua azienda. <strong>Copiala ora</strong>: dopo la chiusura non sarà più
            visibile (potrai sempre crearne un'altra).
          </AlertDescription>
        </Alert>

        <BloccoCopia testo={chiaveNuova} etichetta="La tua chiave" />

        <Tabs defaultValue="claude">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claude" className="text-xs sm:text-sm">Claude Code</TabsTrigger>
            <TabsTrigger value="desktop" className="text-xs sm:text-sm">Claude Desktop</TabsTrigger>
            <TabsTrigger value="chatgpt" className="text-xs sm:text-sm">ChatGPT</TabsTrigger>
          </TabsList>

          <TabsContent value="claude" className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Incolla questo comando nel terminale (una volta):</p>
            <BloccoCopia testo={comandoClaudeCode(chiaveNuova)} />
          </TabsContent>

          <TabsContent value="desktop" className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Claude Desktop → Impostazioni → Sviluppatore → Modifica config. Aggiungi:
            </p>
            <BloccoCopia testo={configClaudeDesktop(chiaveNuova)} />
          </TabsContent>

          <TabsContent value="chatgpt" className="mt-3 space-y-2">
            <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
              {chatgpt.note.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
            <BloccoCopia testo={chatgpt.url} etichetta="URL del connettore" />
            <BloccoCopia testo={chatgpt.header} etichetta="Header di autenticazione" />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={onClose}>Ho copiato la chiave</Button>
        </div>
      </div>
    );
  }

  // ── Schermata iniziale: scegli il livello e collega ─────────────────────────
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Collega il gestionale a <strong>Claude</strong> o <strong>ChatGPT</strong>: l'assistente lavora solo sui dati
        della tua azienda. Scegli cosa può fare.
      </p>

      {chiaviAttive.length > 0 && (
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Hai già {chiaviAttive.length === 1 ? "una connessione attiva" : `${chiaviAttive.length} connessioni attive`}.
            Puoi crearne un'altra qui sotto, oppure gestirle (revoca, rinnovo) in{" "}
            <button className="underline" onClick={() => { onClose(); navigate("/azienda/impostazioni/api"); }}>
              Impostazioni → API
            </button>.
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
              Manda email, follow-up e solleciti veri e usa gli strumenti con costo AI. Spento di serie: lascialo così se
              vuoi che l'assistente prepari ma non invii nulla.
            </span>
          </span>
        </label>
      )}

      <p className="text-[11px] text-muted-foreground">
        Endpoint: <code className="rounded bg-muted px-1">{MCP_ENDPOINT}</code>
      </p>

      {!puoGestire ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Il collegamento lo attiva un amministratore dell'azienda.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={collega} disabled={creaChiave.isPending} className="gap-2">
            {creaChiave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Collega e crea la chiave
          </Button>
        </div>
      )}
    </div>
  );
}
