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
  Copy, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Globe, Sparkles, AlertTriangle,
} from "lucide-react";
import { ProviderGuideAccordion } from "@/components/email/ProviderGuideAccordion";

interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  /** Priority MX — solo Resend ha record MX per return-path SES. */
  priority?: number;
  provider: "elastic_email" | "sendgrid" | "resend";
  purpose: string;
  verified: boolean;
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
  elastic_email: "Elastic Email",
  sendgrid: "SendGrid",
  resend: "Resend",
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

  // Load current status
  const { data, isLoading, refetch } = useQuery<DomainResponse>({
    queryKey: ["company-email-domain", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "get_status", company_id: companyId },
      });
      if (error) throw error;
      return resp as DomainResponse;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (params: { domain: string; from_email: string; from_name: string | null }) => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "add_domain", company_id: companyId, ...params },
      });
      if (error) throw error;
      return resp as DomainResponse;
    },
    onSuccess: () => {
      toast.success("Dominio registrato. Ora configura i record DNS.");
      qc.invalidateQueries({ queryKey: ["company-email-domain", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore durante l'aggiunta del dominio";
      toast.error(msg);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "verify_domain", company_id: companyId },
      });
      if (error) throw error;
      return resp as DomainResponse;
    },
    onSuccess: (resp) => {
      if (resp.domain?.is_verified) {
        toast.success("Dominio verificato e attivato! Le prossime email usciranno dal tuo dominio.");
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
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "remove_domain", company_id: companyId },
      });
      if (error) throw error;
      return resp;
    },
    onSuccess: () => {
      toast.success("Dominio rimosso");
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
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Dominio email personalizzato</CardTitle>
            </div>
            <CardDescription>
              Invia email marketing e transazionali dal tuo dominio aziendale (es. <code className="text-xs">noreply@tuaazienda.it</code>)
              invece che dal dominio della piattaforma. Migliora deliverability e branding.
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 2+3: domain registered — show DNS records and verify button ─────
  const verifiedCount = records.filter((r) => r.verified).length;
  const totalCount = records.length;

  return (
    <div className="max-w-4xl space-y-6">
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
            <div className="flex items-center gap-2">
              {domain.is_verified && domain.is_active ? (
                <Badge className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Attivo
                </Badge>
              ) : (
                <Badge variant="outline">
                  {verifiedCount}/{totalCount} record verificati
                </Badge>
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
            Il dominio si considera verificato quando <strong>Elastic Email</strong> (marketing) è OK{" "}
            e <strong>almeno uno</strong> fra <strong>Resend</strong> o <strong>SendGrid</strong>{" "}
            (transazionale) è OK. Così puoi migrare in modo graduale da SendGrid a Resend senza perdere lo stato verificato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.map((r, idx) => <DnsRow key={idx} record={r} />)}
          <Separator />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Hai già inserito i record? Clicca "Verifica DNS" per avviare il controllo su tutti i provider configurati.
            </p>
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
          <AlertDescription>
            Dominio attivo. Tutte le prossime email (marketing e transazionali) usciranno da{" "}
            <code className="text-xs">{domain.from_email}@{domain.domain}</code>.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
