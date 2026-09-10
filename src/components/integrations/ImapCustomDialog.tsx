/**
 * ImapCustomDialog — form per aggiungere connessione IMAP/SMTP custom
 *
 * Provider con preset: Aruba, Libero, Register, iCloud, Yahoo, Custom.
 * Test-connessione prima del salvataggio (chiama edge email-imap-test).
 */
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, AlertCircle, Server, Save, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PresetConfig {
  label: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  hint?: string;
}

const PRESETS: Record<string, PresetConfig> = {
  aruba: {
    label: "Aruba",
    imap_host: "imaps.aruba.it",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtps.aruba.it",
    smtp_port: 465,
    smtp_secure: true,
    hint: "Account @nome-dominio.it gestiti da Aruba",
  },
  libero: {
    label: "Libero",
    imap_host: "imapmail.libero.it",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtp.libero.it",
    smtp_port: 465,
    smtp_secure: true,
    hint: "Account @libero.it / @inwind.it / @blu.it",
  },
  register: {
    label: "Register.it",
    // I server storici non funzionano più: `imap.register.it` presenta un
    // certificato che non vale per quel nome e `out.register.it` non esiste
    // più nel DNS — chi sceglieva questo preset trovava solo un test fallito.
    // Le caselle Register di oggi stanno su SecureMail, dove l'host si chiama
    // `pop.` ma sulla porta 993 risponde IMAP (verificato: `* OK [CAPABILITY
    // IMAP4rev1 …]`). Non esiste un `imap.securemail.pro`.
    imap_host: "pop.securemail.pro",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "authsmtp.securemail.pro",
    smtp_port: 465,
    smtp_secure: true,
    hint: "Caselle SecureMail di Register.it. Il nome «pop» inganna: sulla porta 993 quel server parla IMAP.",
  },
  icloud: {
    label: "iCloud / Apple Mail",
    imap_host: "imap.mail.me.com",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtp.mail.me.com",
    smtp_port: 587,
    smtp_secure: false, // STARTTLS
    hint: "Richiede 'app-specific password' generata su appleid.apple.com",
  },
  yahoo: {
    label: "Yahoo Mail",
    imap_host: "imap.mail.yahoo.com",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtp.mail.yahoo.com",
    smtp_port: 465,
    smtp_secure: true,
    hint: "Richiede password app dedicata da impostazioni Yahoo",
  },
  custom: {
    label: "Custom (specifica manualmente)",
    imap_host: "",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_secure: false,
  },
};

/**
 * La casella già collegata che si sta rimettendo in piedi: quando il provider
 * rifiuta le credenziali (password cambiata, scaduta, revocata) si riapre
 * questo form con dentro tutto tranne la password, che è l'unica cosa da
 * rifare. Prima l'unica strada era cancellare la casella e ricrearla a mano.
 */
export interface CasellaDaRicollegare {
  id: string;
  email_address: string;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_secure?: boolean | null;
  imap_username?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  provider_label?: string | null;
}

interface ImapCustomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daRicollegare?: CasellaDaRicollegare | null;
}

/**
 * Traduce gli errori grezzi IMAP/SMTP in messaggi azionabili in italiano.
 * Es. "imap_A1 NO [AUTHENTICATIONFAILED] Authentication failed." è corretto
 * ma incomprensibile per un utente non tecnico.
 */
function umanizzaErroreImap(raw: string): { titolo: string; dettaglio: string } {
  const r = raw.toLowerCase();
  if (r.includes("authenticationfailed") || r.includes("authentication failed") ||
      r.includes("invalid credentials") || r.includes("login failed") || r.includes("auth")) {
    return {
      titolo: "Email o password errati",
      dettaglio: "Controlla le credenziali. Attenzione: Libero, Yahoo, iCloud e Gmail richiedono una \"password per app\" dedicata (generata dalle impostazioni di sicurezza del provider), NON la password normale dell'account.",
    };
  }
  if (r.includes("timed out") || r.includes("timeout") || r.includes("etimedout") ||
      r.includes("refused") || r.includes("econnrefused") || r.includes("not found") || r.includes("enotfound")) {
    return {
      titolo: "Server non raggiungibile",
      dettaglio: "Controlla l'host e la porta del server. Se hai scelto un provider dal menu, verifica che l'account sia davvero di quel provider.",
    };
  }
  if (r.includes("certificate") || r.includes("tls") || r.includes("ssl") || r.includes("handshake")) {
    return {
      titolo: "Errore di connessione sicura (SSL/TLS)",
      dettaglio: "Prova a cambiare l'interruttore SSL: porta 993 → SSL attivo, porta 143 → SSL spento (IMAP); porta 465 → SSL attivo, porta 587 → SSL spento (SMTP).",
    };
  }
  return { titolo: "Test fallito", dettaglio: raw };
}

export function ImapCustomDialog({ open, onOpenChange, daRicollegare = null }: ImapCustomDialogProps) {
  const qc = useQueryClient();
  // L'azienda la porta il contesto, non il profilo: nel pannello di piattaforma
  // il super admin ha `profiles.company_id` a NULL e il salvataggio si fermava
  // con «Profilo senza azienda». È la stessa azienda che si passa a
  // `email-oauth-start` per Gmail e Outlook.
  const { effectiveCompany } = useAuth();
  const [preset, setPreset] = useState<string>("custom");
  const [emailAddress, setEmailAddress] = useState("");
  const [imapUsername, setImapUsername] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  // Apply preset al cambio
  useEffect(() => {
    if (preset === "custom") return;
    // In «ricollega» valgono i dati della casella, non quelli del preset:
    // sovrascriverli farebbe perdere le impostazioni di chi ha un server suo.
    if (daRicollegare) return;
    const p = PRESETS[preset];
    if (!p) return;
    setImapHost(p.imap_host);
    setImapPort(p.imap_port);
    setImapSecure(p.imap_secure);
    setSmtpHost(p.smtp_host);
    setSmtpPort(p.smtp_port);
    setSmtpSecure(p.smtp_secure);
    setTestStatus("idle");
  }, [preset, daRicollegare]);

  // Alla chiusura si svuota; all'apertura in modalità «ricollega» si riempie
  // con quello che sappiamo già, così resta da digitare solo la password.
  useEffect(() => {
    if (!open) {
      setPreset("custom");
      setEmailAddress("");
      setImapUsername("");
      setPassword("");
      setImapHost("");
      setImapPort(993);
      setImapSecure(true);
      setSmtpHost("");
      setSmtpPort(587);
      setSmtpSecure(false);
      setTestStatus("idle");
      setTestError(null);
      return;
    }
    if (daRicollegare) {
      setPreset(daRicollegare.provider_label && PRESETS[daRicollegare.provider_label] ? daRicollegare.provider_label : "custom");
      setEmailAddress(daRicollegare.email_address);
      setImapUsername(daRicollegare.imap_username ?? daRicollegare.email_address);
      setImapHost(daRicollegare.imap_host ?? "");
      setImapPort(daRicollegare.imap_port ?? 993);
      setImapSecure(daRicollegare.imap_secure ?? true);
      setSmtpHost(daRicollegare.smtp_host ?? "");
      setSmtpPort(daRicollegare.smtp_port ?? 587);
      setSmtpSecure(daRicollegare.smtp_secure ?? false);
      setPassword("");
      setTestStatus("idle");
      setTestError(null);
    }
  }, [open, daRicollegare]);

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-imap-test", {
        body: {
          email_address: emailAddress,
          imap_host: imapHost,
          imap_port: imapPort,
          imap_secure: imapSecure,
          imap_username: imapUsername || emailAddress,
          password,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_secure: smtpSecure,
        },
      });
      if (error) {
        // BUGFIX: su credenziali errate la funzione risponde 400 con l'errore
        // VERO nel body ({ok:false, error:"...AUTHENTICATIONFAILED..."}), ma
        // functions.invoke lo maschera con il generico "Edge Function returned
        // a non-2xx status code". Leggiamo il body dalla Response in context.
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const j = await ctx.json();
            if (j?.error) detail = String(j.error);
          }
        } catch { /* body non leggibile → tieni il messaggio generico */ }
        throw new Error(detail);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (r?.ok === false) throw new Error(r.error ?? "Test fallito");
      return r;
    },
    onSuccess: (data) => {
      setTestStatus("ok");
      setTestError(null);
      const msg = data && typeof data === "object" && "message" in data
        ? String((data as { message?: string }).message ?? "")
        : "";
      toast.success(msg || "Connessione verificata (ricezione + invio)");
    },
    onError: (e) => {
      setTestStatus("error");
      setTestError(e instanceof Error ? e.message : String(e));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("email_imap_upsert_connection", {
        p_email_address: emailAddress,
        p_imap_host: imapHost,
        p_imap_port: imapPort,
        p_imap_secure: imapSecure,
        p_imap_username: imapUsername || emailAddress,
        p_smtp_host: smtpHost,
        p_smtp_port: smtpPort,
        p_smtp_secure: smtpSecure,
        p_password: password,
        p_provider_label: preset,
        p_existing_id: daRicollegare?.id ?? null,
        p_company_id: effectiveCompany?.id ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      toast.success(daRicollegare ? "Casella ricollegata" : "Account email salvato");
      qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
      qc.invalidateQueries({ queryKey: ["email-client-connections"] });
      qc.invalidateQueries({ queryKey: ["my-email-connections"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: String(e) }),
  });

  const canTest = !!(emailAddress && password && imapHost && imapPort);
  const canSave = canTest && !!smtpHost && !!smtpPort;
  const presetHint = PRESETS[preset]?.hint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-violet-600" />
            {daRicollegare ? "Ricollega la casella" : "Aggiungi account IMAP/SMTP"}
          </DialogTitle>
          <DialogDescription>
            {daRicollegare
              ? "Il server ha rifiutato le credenziali: di solito è la password, cambiata o scaduta. I dati del server sono già qui, reinserisci solo la password."
              : "Per provider non-OAuth (Aruba, Libero, iCloud, Yahoo, Register, custom). La password viene cifrata e usata solo per polling email + invio SMTP."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Provider</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {presetHint && (
              <p className="text-[11px] text-muted-foreground mt-1">{presetHint}</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Indirizzo email</Label>
            <Input
              type="email"
              value={emailAddress}
              onChange={(e) => {
                setEmailAddress(e.target.value);
                if (!imapUsername) setImapUsername(e.target.value);
              }}
              placeholder="nome@dominio.it"
            />
          </div>

          <div>
            <Label className="text-xs">Username IMAP/SMTP</Label>
            <Input
              value={imapUsername}
              onChange={(e) => setImapUsername(e.target.value)}
              placeholder="Lascia vuoto per usare l'email"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Di solito è uguale all'email. Alcuni provider usano un username diverso.
            </p>
          </div>

          <div>
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password account o app-password"
              autoComplete="off"
            />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Server in arrivo (IMAP)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-[10px]">Host</Label>
                <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.dominio.it" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Porta</Label>
                <Input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(parseInt(e.target.value) || 993)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Label htmlFor="imap-secure">SSL/TLS diretto (SSL)</Label>
              <Switch id="imap-secure" checked={imapSecure} onCheckedChange={setImapSecure} />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Server in uscita (SMTP)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-[10px]">Host</Label>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.dominio.it" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Porta</Label>
                <Input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Label htmlFor="smtp-secure">SSL/TLS diretto (SSL su 465 → ON; STARTTLS su 587 → OFF)</Label>
              <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
            </div>
          </div>

          {testStatus === "ok" && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Ricezione (IMAP) e invio (SMTP) verificati. Puoi salvare.
            </div>
          )}
          {testStatus === "error" && testError && (() => {
            const err = umanizzaErroreImap(testError);
            return (
              <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{err.titolo}</p>
                  <p className="text-[11px] mt-0.5 break-words">{err.dettaglio}</p>
                  {err.dettaglio !== testError && (
                    <p className="text-[9px] mt-1 text-rose-400 break-words font-mono">{testError}</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className="gap-2"
          >
            {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Test connessione
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending || testStatus !== "ok"}
            className={cn("gap-2", testStatus === "ok" && "bg-violet-600 hover:bg-violet-700")}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
