import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

import {
  Copy, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Globe, Sparkles, AlertTriangle,
  Mail, Send, Clock, Info,
} from "lucide-react";
import { ProviderGuideAccordion } from "@/components/email/ProviderGuideAccordion";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  /** Priority MX — solo Resend ha record MX per return-path SES. */
  priority?: number;
  provider: "elastic_email" | "sendgrid" | "resend";
  purpose: string;
  verified: boolean;
  /** Una riga in più dal server (es. «hai già un SPF: non aggiungerne un secondo»). */
  nota?: string;
}

interface DomainStatus {
  id: string;
  domain: string;
  from_email: string;
  from_name: string | null;
  // Elastic Email (marketing)
  ee_domain_added: boolean;
  ee_spf_verified: boolean;
  ee_dkim_verified: boolean;
  ee_tracking_verified: boolean;
  // SendGrid (transactional legacy)
  sg_domain_id: string | null;
  sg_cname_1_host: string | null;
  sg_cname_1_value: string | null;
  sg_cname_1_valid: boolean;
  sg_cname_2_host: string | null;
  sg_cname_2_value: string | null;
  sg_cname_2_valid: boolean;
  sg_cname_3_host: string | null;
  sg_cname_3_value: string | null;
  sg_cname_3_valid: boolean;
  // Resend (transactional new default)
  resend_domain_id: string | null;
  resend_status:
    | "pending"
    | "verifying"
    | "verified"
    | "failed"
    | "temporary_failure"
    | "not_started";
  resend_region: string;
  // Stato aggregato
  is_verified: boolean;
  is_active: boolean;
  verified_at: string | null;
}

const PROVIDER_LABEL: Record<DnsRecord["provider"], string> = {
  // White-label: i clienti non devono vedere i provider sottostanti
  elastic_email: "Marketing",
  sendgrid: "Transazionale",
  resend: "Transazionale",
};

const PROVIDER_BADGE_VARIANT: Record<
  DnsRecord["provider"],
  "default" | "secondary" | "outline"
> = {
  elastic_email: "secondary", // marketing
  sendgrid: "default",        // transactional legacy
  resend: "default",          // transactional new
};

interface DomainResponse {
  domain: DomainStatus | null;
  dnsRecords: DnsRecord[];
  /** Tutti i domini dell'azienda (due marchi = due domini): `domain` è quello mostrato. */
  tutti?: Array<{ domain: DomainStatus; dnsRecords: DnsRecord[] }>;
  /** Errori dei provider durante add/verify (non i record non ancora propagati). */
  providerErrors?: Record<string, string | null>;
}

/**
 * Adatta le risposte di manage-email-domain alla forma attesa dalla UI.
 * La funzione ritorna shape diverse per azione:
 *   get_status    → { domains: [{ ...row, dns_records }] }
 *   add/verify    → { domain_row, dns_records }
 * Prima la pagina leggeva `resp.domain`/`resp.dnsRecords` (inesistenti) →
 * lo stato non si caricava mai e il form "aggiungi" restava sempre visibile.
 */
function normalizeDomainResponse(resp: unknown): DomainResponse {
  const r = resp as {
    domains?: Array<DomainStatus & { dns_records?: DnsRecord[] }>;
    domain_row?: DomainStatus;
    dns_records?: DnsRecord[];
    provider_errors?: Record<string, string | null>;
  } | null;
  if (Array.isArray(r?.domains)) {
    const first = r.domains[0] ?? null;
    return {
      domain: first,
      dnsRecords: first?.dns_records ?? [],
      tutti: r.domains.map((d) => ({ domain: d, dnsRecords: d.dns_records ?? [] })),
    };
  }
  if (r?.domain_row) {
    return { domain: r.domain_row, dnsRecords: r.dns_records ?? [], providerErrors: r.provider_errors };
  }
  return { domain: null, dnsRecords: [] };
}

// ─── DNS record row with copy-to-clipboard ────────────────────────────────
function DnsRow({ record }: { record: DnsRecord }) {
  const [copied, setCopied] = useState<"host" | "value" | null>(null);

  async function copyText(text: string, which: "host" | "value") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Impossibile copiare negli appunti");
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">{record.type}</Badge>
          <Badge variant={PROVIDER_BADGE_VARIANT[record.provider]} className="text-xs">
            {PROVIDER_LABEL[record.provider]}
          </Badge>
          {typeof record.priority === "number" && (
            <Badge variant="outline" className="text-xs">
              Priorità {record.priority}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{record.purpose}</span>
        </div>
        {record.verified ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Verificato
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="h-3 w-3" /> In attesa
          </span>
        )}
      </div>

      <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
        <span className="text-muted-foreground">Nome</span>
        <code className="font-mono break-all bg-background px-2 py-1 rounded border">{record.host}</code>
        <Button variant="ghost" size="sm" onClick={() => copyText(record.host, "host")} className="h-7 w-7 p-0">
          {copied === "host" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>

      <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
        <span className="text-muted-foreground">Valore</span>
        <code className="font-mono break-all bg-background px-2 py-1 rounded border">{record.value}</code>
        <Button variant="ghost" size="sm" onClick={() => copyText(record.value, "value")} className="h-7 w-7 p-0">
          {copied === "value" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>

      {record.nota && !record.verified && (
        <p className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1.5">
          {record.nota}
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function SettingsEmailDomain() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const [inputDomain, setInputDomain] = useState("");
  const [inputFromEmail, setInputFromEmail] = useState("noreply");
  const [inputFromName, setInputFromName] = useState("");

  // Test email dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testStream, setTestStream] = useState<"transactional" | "marketing">("transactional");

  // Auto-polling toggle (default ON se dominio registrato ma non verificato)
  const [autoPoll, setAutoPoll] = useState(true);

  // Più domini per azienda (20/09/2026): chi ha due marchi spedisce da due
  // domini. La pagina ne mostra uno alla volta; «Aggiungi un altro dominio»
  // riapre il modulo del primo passo.
  const [dominioScelto, setDominioScelto] = useState<string | null>(null);
  const [aggiungeUnAltro, setAggiungeUnAltro] = useState(false);

  // Load current status — auto-refresh ogni 30s se dominio presente e non verificato
  const { data: risposta, isLoading, refetch, dataUpdatedAt } = useQuery<DomainResponse>({
    queryKey: ["company-email-domain", companyId],
    enabled: !!companyId,
    refetchInterval: (query) => {
      const r = query.state.data as DomainResponse | undefined;
      const daVerificare = (r?.tutti ?? []).some((d) => !d.domain.is_verified);
      if (!autoPoll || !daVerificare) return false;
      return 30_000;
    },
    queryFn: async () => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "get_status", company_id: companyId },
      });
      if (error) throw error;
      return normalizeDomainResponse(resp);
    },
  });

  const tuttiIDomini = risposta?.tutti ?? [];
  const mostrato = aggiungeUnAltro
    ? null
    : tuttiIDomini.find((d) => d.domain.domain === dominioScelto) ?? tuttiIDomini[0] ?? null;
  // Stessa forma di prima (un dominio e i suoi record): il resto della pagina non cambia.
  const data: DomainResponse | undefined = risposta
    ? { ...risposta, domain: mostrato?.domain ?? null, dnsRecords: mostrato?.dnsRecords ?? [] }
    : undefined;

  const testEmailMutation = useMutation({
    mutationFn: async (input: { to: string; stream: "transactional" | "marketing" }) => {
      const { data: resp, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          testMode: true,
          to: input.to,
          stream: input.stream,
          subject: `[TEST] Email di verifica · ${data?.domain?.domain ?? "EdiliziaInCloud"}`,
          html: `<html><body style="font-family:system-ui,sans-serif;padding:24px;background:#f8fafc;">
            <div style="max-width:540px;margin:0 auto;background:white;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
              <h2 style="color:#0f172a;margin:0 0 12px 0;">✅ Test email riuscito</h2>
              <p style="color:#334155;line-height:1.6;">
                Questa è una email di test inviata ${data?.domain ? `dal tuo dominio personalizzato <strong>${data.domain.domain}</strong>` : `dal dominio piattaforma <strong>notifiche.ediliziaincloud.it</strong>`}
                sulla pipeline
                <strong>${input.stream === "transactional" ? "transazionale" : "marketing"}</strong>.
              </p>
              <p style="color:#334155;line-height:1.6;">
                Se ricevi questa email significa che il sistema di invio è configurato
                correttamente e le prossime email aziendali partiranno regolarmente.
              </p>
              ${!data?.domain ? `<p style="color:#64748b;font-size:13px;background:#f1f5f9;padding:12px;border-radius:8px;margin-top:16px;">💡 Per un branding completo e maggiore deliverability, puoi configurare il tuo dominio aziendale personalizzato in <strong>Impostazioni → Dominio email</strong>.</p>` : ""}
              <p style="color:#64748b;font-size:12px;margin-top:24px;">
                Inviato il ${new Date().toLocaleString("it-IT")} · piattaforma EdiliziaInCloud
              </p>
            </div>
          </body></html>`,
        },
      });
      if (error) throw error;
      return resp;
    },
    onSuccess: () => {
      toast.success(`Email di test inviata a ${testEmailTo}. Controlla la casella (anche spam).`);
      setTestDialogOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore invio email di test";
      toast.error(msg);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (params: { domain: string; from_email: string; from_name: string | null }) => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "add_domain", company_id: companyId, ...params },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Errore durante l'aggiunta del dominio"));
      return normalizeDomainResponse(resp);
    },
    onSuccess: (resp) => {
      toast.success("Dominio registrato. Ora configura i record DNS.");
      setDominioScelto(resp.domain?.domain ?? null);
      setAggiungeUnAltro(false);
      setInputDomain("");
      qc.invalidateQueries({ queryKey: ["company-email-domain", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore durante l'aggiunta del dominio";
      toast.error(msg);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      // BUGFIX: l'azione verify_domain RICHIEDE il dominio nel body — prima
      // mancava e la verifica falliva sempre con "domain is required".
      const currentDomain = data?.domain?.domain;
      if (!currentDomain) throw new Error("Nessun dominio registrato da verificare");
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "verify_domain", company_id: companyId, domain: currentDomain },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Errore durante la verifica"));
      return normalizeDomainResponse(resp);
    },
    onSuccess: (resp) => {
      const d = resp.domain;
      const marketingOk = Boolean(d?.ee_spf_verified && d?.ee_dkim_verified);
      if (d?.is_verified) {
        toast.success("Dominio verificato e attivato! Le prossime email usciranno dal tuo dominio.");
      } else if (marketingOk && d?.is_active) {
        toast.success("Dominio attivo per l'email marketing! (Il canale transazionale si attiverà quando anche i suoi record saranno propagati.)");
      } else if (resp.providerErrors?.elastic_email) {
        // Non sono i record: è il canale marketing che non ha potuto controllare.
        // Prima finiva sotto «record non ancora propagati» e si aspettava per niente.
        toast.error(`Il canale marketing non ha potuto verificare il dominio: ${resp.providerErrors.elastic_email}`);
      } else {
        toast.message("Verifica parziale — alcuni record DNS non sono ancora propagati");
      }
      qc.invalidateQueries({ queryKey: ["company-email-domain", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore durante la verifica";
      toast.error(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      // BUGFIX: anche remove_domain richiede il dominio nel body.
      const currentDomain = data?.domain?.domain;
      if (!currentDomain) throw new Error("Nessun dominio da rimuovere");
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "remove_domain", company_id: companyId, domain: currentDomain },
      });
      if (error) throw error;
      return resp;
    },
    onSuccess: () => {
      toast.success("Dominio rimosso");
      setDominioScelto(null);
      qc.invalidateQueries({ queryKey: ["company-email-domain", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore durante la rimozione";
      toast.error(msg);
    },
  });

  if (!companyId) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Seleziona un'azienda per configurare il dominio email.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const domain = data?.domain;
  const records = data?.dnsRecords ?? [];

  // ── Step 1: no domain configured yet ─────────────────────────────────────
  if (!domain) {
    const domainValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      inputDomain.trim().toLowerCase()
    );

    return (
      <div className="max-w-3xl space-y-6">
        {aggiungeUnAltro && tuttiIDomini.length > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-sm">
              Stai aggiungendo un altro dominio. Quelli già collegati restano come sono.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAggiungeUnAltro(false)}>
              Annulla
            </Button>
          </div>
        )}
        {/* Banner stato attuale: dominio fallback piattaforma */}
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-blue-900">
                  Le email funzionano già ✅
                </p>
                <p className="text-xs text-blue-800 mt-0.5">
                  Stai usando il dominio di default della piattaforma:{" "}
                  <code className="text-[11px] bg-white/60 px-1 rounded border border-blue-200">
                    notifiche.ediliziaincloud.it
                  </code>
                  . Tutte le email transazionali (OTP firma, password reset, notifiche)
                  partiranno come{" "}
                  <code className="text-[11px] bg-white/60 px-1 rounded border border-blue-200">
                    Tua Azienda via EdiliziaInCloud &lt;no-reply@notifiche.ediliziaincloud.it&gt;
                  </code>
                  .
                </p>
                <p className="text-xs text-blue-800 mt-2">
                  <strong>Configurando il tuo dominio sotto</strong> otterrai mittente
                  personalizzato <em>(senza "via EdiliziaInCloud")</em>, migliore deliverability
                  e branding completo.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => {
                  setTestEmailTo("");
                  setTestStream("transactional");
                  setTestDialogOpen(true);
                }}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Prova ora
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Dominio email personalizzato (opzionale)</CardTitle>
            </div>
            <CardDescription>
              Invia email dal tuo dominio aziendale (es. <code className="text-xs">noreply@tuaazienda.it</code>)
              invece che dal dominio della piattaforma. Consigliato per aziende
              che vogliono massima deliverability e branding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Dominio</Label>
              <Input
                id="domain"
                placeholder="esempio: tuaazienda.it"
                value={inputDomain}
                onChange={(e) => setInputDomain(e.target.value.trim().toLowerCase())}
                disabled={addMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Senza <code>https://</code> o <code>www.</code>. Solo il dominio radice.
              </p>
              {inputDomain.trim() !== "" && !domainValid && (
                <p className="text-xs text-destructive">
                  Inserisci un dominio valido, es. azienda.it
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-email">Parte locale email</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="from-email"
                    placeholder="noreply"
                    value={inputFromEmail}
                    onChange={(e) => setInputFromEmail(e.target.value.trim().toLowerCase())}
                    disabled={addMutation.isPending}
                  />
                  <span className="text-muted-foreground text-sm">@{inputDomain || "tuaazienda.it"}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">Nome mittente (opzionale)</Label>
                <Input
                  id="from-name"
                  placeholder="es. Rossi Costruzioni"
                  value={inputFromName}
                  onChange={(e) => setInputFromName(e.target.value)}
                  disabled={addMutation.isPending}
                />
              </div>
            </div>

            <Button
              disabled={!domainValid || addMutation.isPending}
              onClick={() => addMutation.mutate({
                domain: inputDomain.trim().toLowerCase(),
                from_email: inputFromEmail.trim().toLowerCase() || "noreply",
                from_name: inputFromName.trim() || null,
              })}
              className="w-full sm:w-auto"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registra dominio
            </Button>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              <strong>Richiesto:</strong> accesso al pannello DNS del dominio (Aruba,
              Register.it, Cloudflare, GoDaddy…). Dovrai aggiungere alcuni record TXT/CNAME
              seguendo la procedura guidata che appare dopo la registrazione.
              La propagazione può richiedere da 10 minuti fino a 48h.
            </div>
          </CardContent>
        </Card>

        {/* Dialog test email — attivo anche in step 1 (usa fallback platform) */}
        <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Invia email di test
              </DialogTitle>
              <DialogDescription>
                Verifica che il sistema stia inviando email. Il test partirà dal
                dominio piattaforma <code className="text-[11px]">notifiche.ediliziaincloud.it</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Email destinatario *</Label>
                <Input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="prova@esempio.it"
                />
              </div>
              <div>
                <Label>Pipeline</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setTestStream("transactional")}
                    className={`border rounded-md p-2 text-left text-xs transition ${testStream === "transactional" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                  >
                    <div className="font-medium">Transazionale</div>
                    <div className="text-muted-foreground text-[10px]">OTP, firme, password reset</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestStream("marketing")}
                    className={`border rounded-md p-2 text-left text-xs transition ${testStream === "marketing" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                  >
                    <div className="font-medium">Marketing</div>
                    <div className="text-muted-foreground text-[10px]">Campagne e newsletter</div>
                  </button>
                </div>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Il test non consuma crediti. Controlla anche la cartella spam
                  se non arriva in inbox entro 1 minuto.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Annulla</Button>
              <Button
                onClick={() => {
                  if (!testEmailTo || !testEmailTo.includes("@")) {
                    toast.error("Email non valida");
                    return;
                  }
                  testEmailMutation.mutate({ to: testEmailTo, stream: testStream });
                }}
                disabled={testEmailMutation.isPending}
              >
                {testEmailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Invia test
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Step 2+3: domain registered — show DNS records and verify button ─────
  const verifiedCount = records.filter((r) => r.verified).length;
  const totalCount = records.length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tuttiIDomini.length > 1 && tuttiIDomini.map((d) => (
            <Button
              key={d.domain.id}
              size="sm"
              variant={d.domain.domain === domain.domain ? "default" : "outline"}
              onClick={() => setDominioScelto(d.domain.domain)}
            >
              {d.domain.domain}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setAggiungeUnAltro(true)}>
          <Globe className="h-4 w-4 mr-2" />
          Aggiungi un altro dominio
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{domain.domain}</CardTitle>
                <CardDescription>
                  Mittente:&nbsp;
                  <code className="text-xs">
                    {domain.from_name ? `${domain.from_name} <${domain.from_email}@${domain.domain}>` : `${domain.from_email}@${domain.domain}`}
                  </code>
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {domain.is_verified && domain.is_active ? (
                <Badge className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Attivo
                </Badge>
              ) : domain.is_active && domain.ee_spf_verified && domain.ee_dkim_verified ? (
                // Marketing già operativo (EE SPF+DKIM ok) — transazionale in attesa
                <Badge className="bg-emerald-500 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Marketing attivo
                </Badge>
              ) : (
                <Badge variant="outline">
                  {verifiedCount}/{totalCount} record verificati
                </Badge>
              )}
              {(domain.is_verified || (domain.is_active && domain.ee_spf_verified && domain.ee_dkim_verified)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTestEmailTo("");
                    setTestStream("transactional");
                    setTestDialogOpen(true);
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Invia test
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={removeMutation.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rimuovere il dominio?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le email torneranno ad uscire dal dominio predefinito della piattaforma.
                      Potrai ri-registrarlo in qualsiasi momento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => removeMutation.mutate()}>Rimuovi</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Status per-provider compatto */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {/* White-label: canali, non provider. SendGrid (legacy) nascosto. */}
            <ProviderStatusCard
              label="Email Marketing"
              sublabel="Campagne e newsletter"
              // SPF+DKIM bastano per inviare; il tracking CNAME è opzionale
              verified={domain.ee_spf_verified && domain.ee_dkim_verified}
              added={domain.ee_domain_added}
              extra={domain.ee_spf_verified && domain.ee_dkim_verified && !domain.ee_tracking_verified ? "Tracking opzionale non attivo" : undefined}
            />
            <ProviderStatusCard
              label="Email Transazionali"
              sublabel="Notifiche, documenti, OTP"
              verified={domain.resend_status === "verified"}
              added={!!domain.resend_domain_id}
              extra={domain.resend_status && domain.resend_status !== "verified" ? "In attesa di verifica" : undefined}
            />
          </div>
        </CardHeader>
      </Card>

      {!domain.is_verified && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Aggiungi i record DNS qui sotto nel pannello del tuo registrar (Aruba, Register.it, GoDaddy, Cloudflare…).
            La propagazione può richiedere da pochi minuti fino a 48h. Quando hai finito clicca "Verifica DNS".
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record DNS da inserire</CardTitle>
          <CardDescription>
            Aggiungi questi record nel pannello DNS del tuo registrar. L'<strong>email
            marketing</strong> si attiva con SPF e DKIM verificati; il canale{" "}
            <strong>transazionale</strong> (notifiche, documenti) si attiva quando anche i
            suoi record risultano propagati.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.map((r, idx) => <DnsRow key={idx} record={r} />)}
          <Separator />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Hai già inserito i record? Clicca "Verifica DNS" per avviare il controllo su tutti i provider configurati.
              </p>
              {!domain.is_verified && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={autoPoll} onCheckedChange={setAutoPoll} className="scale-75" />
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Auto-refresh stato ogni 30s
                    {autoPoll && dataUpdatedAt && (
                      <span className="text-[10px] opacity-70">
                        (aggiornato {new Date(dataUpdatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
                      </span>
                    )}
                  </span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={verifyMutation.isPending}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Aggiorna
              </Button>
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verifica DNS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!domain.is_verified && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Come inserire i record DNS</CardTitle>
            <CardDescription>
              Scegli il tuo registrar per vedere istruzioni passo-passo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderGuideAccordion />
          </CardContent>
        </Card>
      )}

      {domain.is_verified && domain.is_active && (
        <Alert className="border-green-600">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
            <span>
              Dominio attivo. Tutte le prossime email (marketing e transazionali) usciranno da{" "}
              <code className="text-xs">{domain.from_email}@{domain.domain}</code>.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTestEmailTo("");
                setTestStream("transactional");
                setTestDialogOpen(true);
              }}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Invia email di test
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Dialog test email */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Invia email di test
            </DialogTitle>
            <DialogDescription>
              Verifica che il dominio <strong>{domain.domain}</strong> stia effettivamente
              inviando email. La mail arriverà all'indirizzo che indichi sotto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email destinatario *</Label>
              <Input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="prova@esempio.it"
              />
            </div>
            <div>
              <Label>Pipeline</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setTestStream("transactional")}
                  className={`border rounded-md p-2 text-left text-xs transition ${testStream === "transactional" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">Transazionale</div>
                  <div className="text-muted-foreground text-[10px]">OTP, firme, password reset</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTestStream("marketing")}
                  className={`border rounded-md p-2 text-left text-xs transition ${testStream === "marketing" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">Marketing</div>
                  <div className="text-muted-foreground text-[10px]">Campagne e newsletter</div>
                </button>
              </div>
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                L'email di test non consuma crediti. Controlla anche la cartella spam
                se non la trovi in inbox entro 1 minuto.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => {
                if (!testEmailTo || !testEmailTo.includes("@")) {
                  toast.error("Email non valida");
                  return;
                }
                testEmailMutation.mutate({ to: testEmailTo, stream: testStream });
              }}
              disabled={testEmailMutation.isPending}
            >
              {testEmailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Invia test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProviderStatusCard({
  label, sublabel, verified, added, extra,
}: {
  label: string;
  sublabel: string;
  verified: boolean;
  added: boolean;
  extra?: string;
}) {
  return (
    <div className={`rounded-md border p-2 ${verified ? "border-green-200 bg-green-50/50" : added ? "border-yellow-200 bg-yellow-50/50" : "border-slate-200"}`}>
      <div className="flex items-center gap-1.5">
        {verified ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : added ? (
          <Clock className="h-3.5 w-3.5 text-yellow-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
      {extra && <div className="text-[10px] text-muted-foreground mt-0.5">{extra}</div>}
    </div>
  );
}
