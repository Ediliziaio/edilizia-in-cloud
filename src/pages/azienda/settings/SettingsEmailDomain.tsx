import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { puoModificareEmail } from "@/lib/permessi/modificaSegueVisibilita";

import {
  Copy, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Globe, Sparkles, AlertTriangle,
  Mail, Send, Clock, Info,
} from "lucide-react";
import { ProviderGuideAccordion } from "@/components/email/ProviderGuideAccordion";
import { nomeBreve } from "@/lib/email/nomiDns";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import {
  type CanaleEmail,
  type MittenteDelCanale,
  prefissoMittente,
  provenienzaCanale,
  type ProvenienzaCanale,
  verificatoPer,
} from "../../../../supabase/functions/_shared/dominioEmailAzienda";

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
  /** Perche' il record non risulta ancora verificato (controllo sul DNS pubblico, lato server). */
  diagnosi?: { stato: "ok" | "non_trovato" | "nome_doppio" | "valore_diverso" | "non_leggibile"; messaggio: string };
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

/** Il mittente vero di ogni canale, calcolato dal server con resolveSender (get_status). */
type Mittenti = Partial<Record<CanaleEmail, MittenteDelCanale | null>>;

interface DomainResponse {
  domain: DomainStatus | null;
  dnsRecords: DnsRecord[];
  /** Tutti i domini dell'azienda (due marchi = due domini): `domain` è quello mostrato. */
  tutti?: Array<{ domain: DomainStatus; dnsRecords: DnsRecord[] }>;
  /** Errori dei provider durante add/verify (non i record non ancora propagati). */
  providerErrors?: Record<string, string | null>;
  /** Guasto lato piattaforma (es. chiave del provider transazionale): non dipende dai DNS dell'azienda. */
  avvisoPiattaforma?: string | null;
  /** Da dove partono davvero le email di ogni canale (get_status). */
  mittenti?: Mittenti;
  /** I canali di cui il dominio è diventato il mittente con questa verifica (verify). */
  collegati?: CanaleEmail[];
}

/** Perché un canale non esce dal dominio mostrato: la riga sotto il mittente. */
function notaProvenienza(provenienza: ProvenienzaCanale, vaiAlMittente: string): ReactNode {
  const link = <Link to={vaiAlMittente} className="text-primary underline">Mittente e aspetto</Link>;
  switch (provenienza) {
    case "dal_dominio":
      return null;
    case "altro_dominio":
      return <>Esce da un altro tuo dominio, scelto in {link}.</>;
    case "canale_non_verificato":
      return "Passa al tuo dominio quando questo canale risulta verificato.";
    case "dominio_non_attivo":
      return "Passa al tuo dominio quando il dominio si attiva, cioè con le campagne verificate.";
    case "non_scelto":
      return <>Il dominio è pronto: per usarlo sceglilo in {link}.</>;
    default:
      return null;
  }
}

/** Cosa è cambiato con la verifica, detto con i canali collegati davvero. */
function avvisoCollegati(collegati: CanaleEmail[]): string {
  if (collegati.length === 2) return "Da adesso le campagne e i messaggi di servizio escono dal tuo dominio.";
  return collegati[0] === "marketing"
    ? "Da adesso le campagne escono dal tuo dominio."
    : "Da adesso i messaggi di servizio escono dal tuo dominio.";
}

/**
 * Il testo che il server scrive nel campo `purpose` è pensato per un log
 * tecnico (SPF/DKIM/DMARC). Qui si traduce in una riga che un titolare
 * capisce, tenendo la sigla solo come nota piccola: non cambia se il server
 * riformula la frase, perché guarda solo le parole chiave. (21/09/2026: la
 * pagina mostrava le sigle come titolo, e col tracking/DMARC/transazionali
 * tutti sullo stesso piano sembrava — parole del titolare — "un casino".)
 */
function etichettaRecord(purpose: string): { titolo: string; dettaglio?: string; facoltativo: boolean } {
  const p = purpose.toLowerCase();
  if (p.includes("spf")) return { titolo: "Autorizzazione a spedire", dettaglio: "record SPF", facoltativo: false };
  if (p.includes("dkim")) return { titolo: "Firma di sicurezza delle email", dettaglio: "record DKIM", facoltativo: false };
  if (p.includes("dmarc")) return { titolo: "Protezione anti-spam in più", dettaglio: "record DMARC · consigliato", facoltativo: true };
  if (p.includes("tracking")) return { titolo: "Conteggio di chi apre e clicca", dettaglio: "facoltativo", facoltativo: true };
  if (p.includes("legacy")) return { titolo: "Verifica aggiuntiva", dettaglio: "non necessaria, si può saltare", facoltativo: true };
  if (p.includes("transazional")) return { titolo: "Notifiche e documenti del gestionale", dettaglio: undefined, facoltativo: false };
  return { titolo: purpose, dettaglio: undefined, facoltativo: false };
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
    avviso_piattaforma?: string | null;
    mittenti?: Mittenti;
    collegati?: CanaleEmail[];
  } | null;
  if (Array.isArray(r?.domains)) {
    const first = r.domains[0] ?? null;
    return {
      domain: first,
      dnsRecords: first?.dns_records ?? [],
      tutti: r.domains.map((d) => ({ domain: d, dnsRecords: d.dns_records ?? [] })),
      mittenti: r.mittenti,
    };
  }
  if (r?.domain_row) {
    return {
      domain: r.domain_row,
      dnsRecords: r.dns_records ?? [],
      providerErrors: r.provider_errors,
      avvisoPiattaforma: r.avviso_piattaforma ?? null,
      collegati: r.collegati,
    };
  }
  return { domain: null, dnsRecords: [], mittenti: r?.mittenti };
}

// ─── DNS record row with copy-to-clipboard ────────────────────────────────
function DnsRow({ record, dominio }: { record: DnsRecord; dominio: string }) {
  const [copied, setCopied] = useState<"host" | "value" | null>(null);
  const { titolo, dettaglio } = etichettaRecord(record.purpose);
  // Molti registrar (OVH, Aruba…) aggiungono da soli il dominio al nome: da incollare e' la parte breve.
  const breve = nomeBreve(record.host, dominio);
  const mostraBreve = breve !== record.host;

  async function copyText(text: string, which: "host" | "value") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Non sono riuscito a copiare: selezionalo e copialo a mano.");
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs shrink-0">{record.type}</Badge>
          <div>
            <p className="text-sm font-medium leading-tight">{titolo}</p>
            {dettaglio && <p className="text-xs text-muted-foreground leading-tight">{dettaglio}</p>}
          </div>
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
        <code className="font-mono break-all bg-background px-2 py-1 rounded border">{breve}</code>
        <Button variant="ghost" size="sm" onClick={() => copyText(breve, "host")} className="h-11 w-11 p-0 sm:h-7 sm:w-7" aria-label={`Copia il nome: ${titolo}`}>
          {copied === "host" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {mostraBreve && (
        <p className="text-[11px] text-muted-foreground pl-[88px] -mt-1">
          Nome completo: <span className="font-mono">{record.host}</span> — nel pannello del dominio scrivi solo{" "}
          <span className="font-mono">{breve}</span> (il resto lo aggiunge da solo).
        </p>
      )}

      <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
        <span className="text-muted-foreground">Valore</span>
        <code className="font-mono break-all bg-background px-2 py-1 rounded border">{record.value}</code>
        <Button variant="ghost" size="sm" onClick={() => copyText(record.value, "value")} className="h-11 w-11 p-0 sm:h-7 sm:w-7" aria-label={`Copia il valore: ${titolo}`}>
          {copied === "value" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {typeof record.priority === "number" && (
        <p className="text-xs text-muted-foreground">Priorità {record.priority}</p>
      )}

      {!record.verified && record.diagnosi && record.diagnosi.stato !== "ok" && (
        <p
          className={`text-xs rounded border px-2 py-1.5 ${
            record.diagnosi.stato === "nome_doppio" || record.diagnosi.stato === "valore_diverso"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {record.diagnosi.messaggio}
        </p>
      )}

      {record.nota && !record.verified && (
        <p className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1.5">
          {record.nota}
        </p>
      )}
    </div>
  );
}

// ─── Finestra «Invia email di prova» (la stessa nei due passi della pagina) ───────
function DialogProvaEmail({
  open,
  onOpenChange,
  descrizione,
  to,
  onToChange,
  stream,
  onStreamChange,
  mittenti,
  inCorso,
  onInvia,
  conScorrimento,
}: {
  open: boolean;
  onOpenChange: (aperto: boolean) => void;
  descrizione: string;
  to: string;
  onToChange: (valore: string) => void;
  stream: "transactional" | "marketing";
  onStreamChange: (valore: "transactional" | "marketing") => void;
  mittenti?: Mittenti;
  inCorso: boolean;
  onInvia: () => void;
  conScorrimento?: boolean;
}) {
  const scelte: Array<{ valore: "transactional" | "marketing"; titolo: string; sotto: string }> = [
    { valore: "transactional", titolo: "Messaggi di servizio", sotto: "Codici, firme, cambio password" },
    { valore: "marketing", titolo: "Campagne e newsletter", sotto: "Email di marketing" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={conScorrimento ? "sm:max-w-md max-h-[90vh] overflow-y-auto" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invia email di prova
          </DialogTitle>
          <DialogDescription>{descrizione}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="prova-destinatario">Email destinatario *</Label>
            <Input
              id="prova-destinatario"
              type="email"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              placeholder="prova@esempio.it"
            />
          </div>
          <div>
            <Label id="prova-tipo">Tipo di email</Label>
            <div role="radiogroup" aria-labelledby="prova-tipo" className="grid grid-cols-2 gap-2 mt-1">
              {scelte.map((scelta) => (
                <button
                  key={scelta.valore}
                  type="button"
                  role="radio"
                  aria-checked={stream === scelta.valore}
                  onClick={() => onStreamChange(scelta.valore)}
                  className={`border rounded-md p-2 text-left text-xs transition min-h-11 ${stream === scelta.valore ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">{scelta.titolo}</div>
                  <div className="text-muted-foreground text-[10px]">{scelta.sotto}</div>
                </button>
              ))}
            </div>
          </div>
          {mittenti?.[stream] && (
            <p className="text-xs text-muted-foreground">
              Mittente:{" "}
              <code className="text-[11px] break-all">{mittenti[stream]?.from}</code>
            </p>
          )}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Arriva al tuo indirizzo o a quello di un collega dell'azienda e non consuma crediti. Se non la trovi
              entro un minuto, guarda anche nello spam.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={onInvia} disabled={inCorso}>
            {inCorso && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Invia prova
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function SettingsEmailDomain() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const permissions = usePermissions();
  // Registrare, controllare e togliere un dominio lo fa chi amministra l'azienda o chi ha «Email Marketing» e non è in
  // «sola lettura»: la regola del database e di `manage-email-domain`. Prima i pulsanti erano attivi per tutti e il
  // rifiuto («Non autorizzato») arrivava solo dopo il clic. Mandare un'email di prova a sé non cambia niente: resta per tutti.
  const puoModificare = !permissions.isLoading && puoModificareEmail(permissions);
  // La stessa pagina vive in /azienda/impostazioni e in /admin/impostazioni:
  // Preferenze email è la pagina accanto.
  const { pathname } = useLocation();
  const percorsoPreferenze = pathname.replace(/dominio-email\/?$/, "preferenze-email");
  const notaDelCanale = (p: ProvenienzaCanale) => notaProvenienza(p, percorsoPreferenze);

  const [inputDomain, setInputDomain] = useState("");

  // Test email dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testStream, setTestStream] = useState<"transactional" | "marketing">("transactional");
  function apriTest() {
    setTestEmailTo(user?.email ?? "");
    setTestStream("transactional");
    setTestDialogOpen(true);
  }

  // Record DNS: solo gli essenziali (SPF+DKIM) in vista, il resto a comparsa —
  // 21/09/2026, "è un casino e non si capisce" con tutti i record sullo stesso piano.
  const [mostraAltriRecord, setMostraAltriRecord] = useState(false);
  const [mostraGuida, setMostraGuida] = useState(false);

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
  // Il mittente vero di ogni canale (resolveSender, dal server): la pagina
  // non lo ricostruisce più da from_email, che nessuno scrive.
  const mittenti = risposta?.mittenti;
  const prefisso = prefissoMittente(mittenti?.transactional) || prefissoMittente(mittenti?.marketing) || "no-reply";

  const testEmailMutation = useMutation({
    mutationFn: async (input: { to: string; stream: "transactional" | "marketing" }) => {
      // company_id: la prova parte dal mittente di QUESTA azienda, come le
      // email vere. Senza, partiva da quello della piattaforma, che per il
      // marketing Elastic rifiuta: la prova falliva anche col dominio verificato.
      const { data: resp, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          testMode: true,
          company_id: companyId,
          to: input.to,
          stream: input.stream,
          subject: `[TEST] Email di verifica · ${data?.domain?.domain ?? "EdiliziaInCloud"}`,
          html: `<html><body style="font-family:system-ui,sans-serif;padding:24px;background:#f8fafc;">
            <div style="max-width:540px;margin:0 auto;background:white;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
              <h2 style="color:#0f172a;margin:0 0 12px 0;">✅ Email di prova riuscita</h2>
              <p style="color:#334155;line-height:1.6;">
                Questa è una email di prova
                ${input.stream === "transactional" ? "dei messaggi di servizio" : "delle campagne"}.
                Il mittente che vedi è quello da cui partono
                ${input.stream === "transactional" ? "i messaggi di servizio" : "le campagne"} della tua azienda.
              </p>
              <p style="color:#334155;line-height:1.6;">
                Se ricevi questa email l'invio funziona e le prossime email dell'azienda partiranno regolarmente.
              </p>
              ${!data?.domain ? `<p style="color:#64748b;font-size:13px;background:#f1f5f9;padding:12px;border-radius:8px;margin-top:16px;">💡 Con un dominio tuo il mittente è il tuo e le email finiscono meno spesso in spam: lo registri in <strong>Impostazioni → Dominio email</strong>.</p>` : ""}
              <p style="color:#64748b;font-size:12px;margin-top:24px;">
                Inviata il ${new Date().toLocaleString("it-IT")} · EdiliziaInCloud
              </p>
            </div>
          </body></html>`,
        },
      });
      // Il motivo vero (destinatario non ammesso, mittente rifiutato…) sta nel body.
      if (error) throw new Error(await edgeErrorMessage(error, "Errore invio email di test"));
      return resp;
    },
    onSuccess: () => {
      toast.success(`Email di prova inviata a ${testEmailTo}. Controlla la casella (anche lo spam).`);
      setTestDialogOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore invio email di test";
      toast.error(msg);
    },
  });

  const addMutation = useMutation({
    // Il nome e la parte prima della @ non si mandano: add_domain non li ha
    // mai salvati. Si scelgono in Preferenze email e valgono per ogni dominio.
    mutationFn: async (params: { domain: string }) => {
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "add_domain", company_id: companyId, domain: params.domain },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Errore durante l'aggiunta del dominio"));
      return normalizeDomainResponse(resp);
    },
    onSuccess: (resp) => {
      toast.success("Dominio registrato. Ora copia le righe nel pannello del dominio.");
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
      if (!currentDomain) throw new Error("Non c'è nessun dominio registrato da verificare");
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "verify_domain", company_id: companyId, domain: currentDomain },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Errore durante la verifica"));
      return normalizeDomainResponse(resp);
    },
    onSuccess: (resp) => {
      const d = resp.domain;
      const marketingOk = Boolean(d?.ee_spf_verified && d?.ee_dkim_verified);
      // Si dice solo quello che la verifica ha cambiato davvero: da dove
      // escono i canali lo mostrano le due caselle, dopo il ricaricamento.
      const collegati = resp.collegati ?? [];
      if (collegati.length > 0) {
        toast.success(avvisoCollegati(collegati));
      } else if (d?.is_verified) {
        toast.success("Dominio verificato: è tutto a posto.");
      } else if (marketingOk && d?.is_active) {
        toast.success("Campagne verificate. I messaggi di servizio si attivano quando risultano verificate anche le loro righe.");
      } else if (resp.avvisoPiattaforma && !marketingOk) {
        toast.message(resp.avvisoPiattaforma);
      } else if (resp.providerErrors?.elastic_email) {
        // Non sono i record: è il canale marketing che non ha potuto controllare.
        // Prima finiva sotto «record non ancora propagati» e si aspettava per niente.
        toast.error(`Il controllo del dominio per le campagne non è riuscito: ${resp.providerErrors.elastic_email}`);
      } else {
        toast.message("Verifica parziale: alcune righe non risultano ancora attive. Ci può volere fino a 48 ore.");
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
      if (!currentDomain) throw new Error("Non c'è nessun dominio da rimuovere");
      const { data: resp, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "remove_domain", company_id: companyId, domain: currentDomain },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Errore durante la rimozione"));
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
        <AlertDescription>Seleziona un'azienda per registrare un dominio email.</AlertDescription>
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
        {!puoModificare && (
          <AvvisoSolaLettura>
            Stai solo consultando: per registrare o cambiare il dominio serve il permesso «Email Marketing» (o essere amministratore).
          </AvvisoSolaLettura>
        )}
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
                  Le email funzionano già.
                </p>
                <p className="text-xs text-blue-800 mt-0.5">
                  Stai usando il dominio della piattaforma. I messaggi di servizio (codici di firma,
                  cambio password, notifiche) partono come{" "}
                  <code className="text-[11px] bg-white/60 px-1 rounded border border-blue-200 break-all">
                    {mittenti?.transactional?.from ?? "Tua Azienda via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>"}
                  </code>
                  .
                  {mittenti?.marketing && (
                    <>
                      {" "}Le campagne come{" "}
                      <code className="text-[11px] bg-white/60 px-1 rounded border border-blue-200 break-all">
                        {mittenti.marketing.from}
                      </code>
                      : per le campagne serve un dominio tuo.
                    </>
                  )}
                </p>
                <p className="text-xs text-blue-800 mt-2">
                  <strong>Con un dominio tuo</strong> il mittente è il tuo, senza «via
                  EdiliziaInCloud», e le email finiscono meno spesso in spam.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={apriTest}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Invia una prova
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Usa il tuo dominio (facoltativo)</CardTitle>
            </div>
            <CardDescription>
              Le email partono da un indirizzo tuo, per esempio <code className="text-xs">info@tuaazienda.it</code>,
              invece che dal dominio della piattaforma. Ti serve l'accesso al pannello del dominio (Aruba, Register.it,
              Cloudflare, GoDaddy…): dovrai copiare alcune righe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Il tuo dominio</Label>
              <Input
                id="domain"
                placeholder="esempio: tuaazienda.it"
                value={inputDomain}
                onChange={(e) => setInputDomain(e.target.value.trim().toLowerCase())}
                disabled={!puoModificare || addMutation.isPending}
                aria-describedby="domain-aiuto"
              />
              <p id="domain-aiuto" className="text-xs text-muted-foreground">
                Solo il nome, senza <code>https://</code> né <code>www.</code>.
              </p>
              {inputDomain.trim() !== "" && !domainValid && (
                <p className="text-xs text-destructive">
                  Scrivi un dominio valido, per esempio azienda.it
                </p>
              )}
            </div>

            {/* Qui c'erano «Parte locale email» e «Nome mittente»: add_domain non
                li ha mai salvati, e la pagina poi mostrava "noreply@". */}
            <p className="text-xs text-muted-foreground">
              Verificato il dominio, le email partiranno da{" "}
              <code className="text-[11px]">{prefisso}@{inputDomain || "tuaazienda.it"}</code>.
              Il nome e la parte prima della @ si cambiano in{" "}
              <Link to={percorsoPreferenze} className="underline">Mittente e aspetto</Link>{" "}
              e valgono per tutti i tuoi domini.
            </p>

            <Button
              disabled={!puoModificare || !domainValid || addMutation.isPending}
              onClick={() => addMutation.mutate({ domain: inputDomain.trim().toLowerCase() })}
              className="w-full sm:w-auto"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continua
            </Button>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              Dopo il clic ti mostriamo le righe da copiare nel pannello del dominio. Per attivarsi possono servire da
              pochi minuti a 48 ore.
            </div>
          </CardContent>
        </Card>

        {/* Finestra di prova: attiva anche nel passo 1 (parte dal dominio della piattaforma) */}
        <DialogProvaEmail
          open={testDialogOpen}
          onOpenChange={setTestDialogOpen}
          descrizione="Controlla che le email partano. Senza un dominio tuo la prova parte dal dominio della piattaforma, come le email vere."
          to={testEmailTo}
          onToChange={setTestEmailTo}
          stream={testStream}
          onStreamChange={setTestStream}
          mittenti={mittenti}
          inCorso={testEmailMutation.isPending}
          onInvia={() => {
          if (!testEmailTo || !testEmailTo.includes("@")) {
            toast.error("L'indirizzo email non è valido");
            return;
          }
          testEmailMutation.mutate({ to: testEmailTo, stream: testStream });
        }}
          conScorrimento
        />
      </div>
    );
  }

  // ── Step 2+3: domain registered — show DNS records and verify button ─────
  const verifiedCount = records.filter((r) => r.verified).length;
  const totalCount = records.length;
  // Da dove esce ogni canale rispetto a questo dominio: le due caselle lo
  // dicono, e il riquadro verde parla di «marketing e transazionali» solo
  // quando escono davvero tutti e due da qui.
  const provenienza: Record<CanaleEmail, ProvenienzaCanale> = {
    marketing: provenienzaCanale(domain, "marketing", mittenti?.marketing),
    transactional: provenienzaCanale(domain, "transactional", mittenti?.transactional),
  };
  const mittenteDaQui = [mittenti?.marketing, mittenti?.transactional]
    .find((m) => m?.usingCustomDomain && m.customDomainId === domain.id) ?? null;
  const tuttiDaQui = provenienza.marketing === "dal_dominio" && provenienza.transactional === "dal_dominio";

  return (
    <div className="max-w-4xl space-y-6">
      {!puoModificare && (
        <AvvisoSolaLettura>
          Stai solo consultando: per registrare o cambiare il dominio serve il permesso «Email Marketing» (o essere amministratore).
        </AvvisoSolaLettura>
      )}
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
        <Button variant="outline" size="sm" onClick={() => setAggiungeUnAltro(true)} disabled={!puoModificare}>
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
                {mittenteDaQui && (
                  <CardDescription>
                    Mittente:&nbsp;
                    <code className="text-xs break-all">{mittenteDaQui.from}</code>
                  </CardDescription>
                )}
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
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Campagne attive
                </Badge>
              ) : (
                <Badge variant="outline">
                  {verifiedCount}/{totalCount} righe verificate
                </Badge>
              )}
              {(domain.is_verified || (domain.is_active && domain.ee_spf_verified && domain.ee_dkim_verified)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={apriTest}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Invia una prova
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 p-0 sm:h-9 sm:w-9"
                    disabled={!puoModificare || removeMutation.isPending}
                    aria-label={`Rimuovi il dominio ${domain.domain}`}
                    title="Rimuovi il dominio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rimuovere il dominio?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le email torneranno a partire dal dominio della piattaforma.
                      Potrai registrarlo di nuovo quando vuoi.
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
              label="Campagne e newsletter"
              sublabel="Email di marketing"
              // SPF+DKIM bastano per inviare; il tracking CNAME è opzionale
              verified={verificatoPer(domain, "marketing")}
              added={domain.ee_domain_added}
              extra={verificatoPer(domain, "marketing") && !domain.ee_tracking_verified ? "Conteggio aperture e clic: facoltativo, non attivo" : undefined}
              mittente={mittenti?.marketing?.from}
              nota={mittenti?.marketing ? notaDelCanale(provenienza.marketing) : null}
            />
            <ProviderStatusCard
              label="Messaggi di servizio"
              sublabel="Notifiche, documenti, codici di accesso"
              verified={verificatoPer(domain, "transactional")}
              added={!!domain.resend_domain_id}
              extra={domain.resend_status && domain.resend_status !== "verified" ? "In attesa di verifica" : undefined}
              mittente={mittenti?.transactional?.from}
              nota={mittenti?.transactional ? notaDelCanale(provenienza.transactional) : null}
            />
          </div>
        </CardHeader>
      </Card>

      {!domain.is_verified && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p>
              Copia le righe qui sotto nel pannello del tuo dominio (Aruba, Register.it, GoDaddy, Cloudflare…). Nel
              campo «Nome» scrivi solo la parte indicata (per esempio <code>api._domainkey</code>): il pannello aggiunge
              da solo il tuo dominio.
            </p>
            <p className="mt-1">
              Possono servire da pochi minuti a 48 ore. Quando hai finito, premi «Verifica DNS».
            </p>
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Perché devo premere «Verifica DNS»?</summary>
              <p className="mt-1">
                L'aggiornamento automatico della pagina legge soltanto quello che è già stato salvato: per far
                controllare le righe davvero, premi sempre «Verifica DNS».
              </p>
            </details>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Righe da copiare nel pannello del dominio</CardTitle>
          <CardDescription>
            Le <strong>campagne</strong> si attivano quando risultano verificate «Autorizzazione a spedire» e «Firma di
            sicurezza»; i <strong>messaggi di servizio</strong> (notifiche, documenti) quando risultano verificate anche
            le loro righe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.filter((r) => !etichettaRecord(r.purpose).facoltativo).map((r, idx) => (
            <DnsRow key={idx} record={r} dominio={domain.domain} />
          ))}
          {records.some((r) => etichettaRecord(r.purpose).facoltativo) && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ml-2"
                onClick={() => setMostraAltriRecord((v) => !v)}
              >
                {mostraAltriRecord ? "Nascondi le righe facoltative" : "Mostra anche le righe facoltative"}
              </Button>
              {mostraAltriRecord && records.filter((r) => etichettaRecord(r.purpose).facoltativo).map((r, idx) => (
                <DnsRow key={idx} record={r} dominio={domain.domain} />
              ))}
            </>
          )}
          <Separator />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Hai già copiato le righe? Premi «Verifica DNS»: controlliamo se risultano attive.
              </p>
              {!domain.is_verified && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={autoPoll} onCheckedChange={setAutoPoll} className="scale-75" />
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Controlla da solo ogni 30 secondi
                    {autoPoll && dataUpdatedAt && (
                      <span className="text-[10px] opacity-70">
                        (aggiornato alle {new Date(dataUpdatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
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
                disabled={!puoModificare || verifyMutation.isPending}
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
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setMostraGuida((v) => !v)}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Come inserire le righe nel pannello</CardTitle>
                <CardDescription>
                  Scegli dove hai registrato il dominio per vedere le istruzioni passo passo.
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="sm">
                {mostraGuida ? "Nascondi" : "Mostra la guida"}
              </Button>
            </div>
          </CardHeader>
          {mostraGuida && (
            <CardContent>
              <ProviderGuideAccordion />
            </CardContent>
          )}
        </Card>
      )}

      {tuttiDaQui && (
        <Alert className="border-green-600">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
            <span>
              Dominio attivo: le campagne e i messaggi di servizio escono da{" "}
              <code className="text-xs break-all">{mittenti?.marketing?.fromEmail}</code>.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={apriTest}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Invia una prova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Finestra di prova */}
      <DialogProvaEmail
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        descrizione="Controlla che le email partano davvero: la prova usa il mittente vero del tipo che scegli qui sotto, come le email dell'azienda."
        to={testEmailTo}
        onToChange={setTestEmailTo}
        stream={testStream}
        onStreamChange={setTestStream}
        mittenti={mittenti}
        inCorso={testEmailMutation.isPending}
        onInvia={() => {
          if (!testEmailTo || !testEmailTo.includes("@")) {
            toast.error("L'indirizzo email non è valido");
            return;
          }
          testEmailMutation.mutate({ to: testEmailTo, stream: testStream });
        }}
      />
    </div>
  );
}

function ProviderStatusCard({
  label, sublabel, verified, added, extra, mittente, nota,
}: {
  label: string;
  sublabel: string;
  verified: boolean;
  added: boolean;
  extra?: string;
  /** Il mittente vero del canale (resolveSender), quando il server lo dice. */
  mittente?: string;
  /** Perché il canale non esce da questo dominio (può contenere un link a «Mittente e aspetto»). */
  nota?: ReactNode;
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
      {mittente && (
        <div className="text-[10px] mt-1 break-all">
          <span className="text-muted-foreground">Da: </span>
          <code>{mittente}</code>
        </div>
      )}
      {nota && <div className="text-[10px] text-muted-foreground mt-0.5">{nota}</div>}
    </div>
  );
}
