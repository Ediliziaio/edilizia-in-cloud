// ============================================================================
// SettingsEmailPreferences — Email Dual-Provider FASE 10
// ============================================================================
// Mittente e aspetto delle email dell'azienda. Popola la tabella
// `company_email_preferences` usata dal template renderer (_shared/renderTemplate.ts)
// e dal resolveSender delle Edge Function.
//
// Struttura (30/10/2026, divisa per tipo di email e per brand):
//   0. Riepilogo per canale — «Messaggi di servizio» e «Campagne e newsletter» (i due soli
//                             canali che resolveSender conosce): mittente, dominio, stato
//   1. Chi scrive          — sender_name, sender_prefix, reply-to (un valore solo per i due canali)
//   2. Dominio, per canale — transactional_domain_id | marketing_domain_id (+ piè di pagina
//                            di disiscrizione, che vale solo per le campagne)
//   3. Brand               — logo, colori, testo in fondo, «Inviato con», con anteprima a destra.
//                            Un brand solo per azienda: nel database non esistono brand multipli.
//   Barra «Hai modifiche non salvate · Annulla · Salva» in basso, solo con modifiche.
//
// Montata anche nella scheda «Mittente e aspetto» della pagina Email admin (`AdminSettingsEmailPreferences`).
// Stessa pagina del pannello super admin (`AdminSettingsEmailPreferences`).
// ============================================================================

import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Save, Info, Mail, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AmbitoImpostazione,
  RigaImpostazione,
  SezioneImpostazione,
} from "@/components/impostazioni/SezioneImpostazione";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { puoModificareEmail } from "@/lib/permessi/modificaSegueVisibilita";
import { userErrorMessage } from "@/lib/userErrorMessage";
import {
  HEX_REGEX,
  PREFIX_REGEX,
  EMAIL_REGEX,
  isValidLogoUrl,
  isValidUnsubscribeFooter,
} from "@/lib/email/preferencesValidators";

// ── Types ────────────────────────────────────────────────────────────────────
interface EmailPreferencesRow {
  company_id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string | null;
  footer_show_powered_by: boolean;
  sender_name: string | null;
  sender_prefix: string;
  reply_to_email: string;
  transactional_domain_id: string | null;
  marketing_domain_id: string | null;
  unsubscribe_footer_html: string | null;
}

interface DomainOption {
  id: string;
  domain: string;
  is_verified: boolean;
  // flag stream-specific (matching resolveSender logic)
  transactionalReady: boolean;
  marketingReady: boolean;
}

/** I sottodomini della piattaforma da cui partono le email quando l'azienda non ha un dominio suo (resolveSender). */
const DOMINIO_PIATTAFORMA = {
  transactional: "notifiche.ediliziaincloud.it",
  // Il valore vero è email_marketing_fallback_subdomain (21/09/2026).
  marketing: "mkt.eic-mail.com",
} as const;

interface RiepilogoCanale {
  titolo: string;
  mittente: string;
  stato: string;
  tuo: boolean;
  nota: string | null;
}

/**
 * Riepilogo di un canale (messaggi di servizio / campagne) dai campi della pagina. Stessa regola di resolveSender:
 * il dominio scelto vale solo se è verificato per quel canale, altrimenti si parte dal dominio della piattaforma
 * (e lì il mittente è «Nome via EdiliziaInCloud», senza la parte prima della @ scelta qui).
 */
function riepilogoCanale(args: {
  titolo: string;
  sottotitolo: string;
  dominioScelto: string | null;
  pronti: DomainOption[];
  fallback: string;
  nome: string;
  prefisso: string;
}): RiepilogoCanale {
  const scelto = args.dominioScelto ? args.pronti.find((d) => d.id === args.dominioScelto) ?? null : null;
  if (scelto) {
    return {
      titolo: args.titolo,
      mittente: `${args.nome} <${args.prefisso || "noreply"}@${scelto.domain}>`,
      stato: "Dominio tuo, verificato",
      tuo: true,
      nota: null,
    };
  }
  return {
    titolo: args.titolo,
    mittente: `${args.nome} via EdiliziaInCloud · ${args.fallback}`,
    stato: "Dominio della piattaforma",
    tuo: false,
    nota: args.dominioScelto ? "Il dominio scelto non è verificato per questo tipo di email: si parte da quello della piattaforma." : null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Regex/validators importati da @/lib/email/preferencesValidators per condividere
// la stessa logica con i test unitari.

function HexColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX_REGEX.test(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-11 shrink-0 cursor-pointer rounded border p-0.5 disabled:opacity-50 sm:h-9 sm:w-9"
          aria-label={`${label}: scegli dalla tavolozza`}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1E3A5F"
          aria-invalid={!valid}
          aria-describedby={!valid ? `${id}-errore` : undefined}
          className={`font-mono text-sm flex-1 ${!valid ? "border-destructive" : ""}`}
        />
      </div>
      {!valid && (
        <p id={`${id}-errore`} className="text-xs text-destructive">Formato non valido. Scrivi il colore così: #1E3A5F.</p>
      )}
    </div>
  );
}

/** Valori di una azienda che non ha ancora nessuna riga: evita crash su .toUpperCase()/.test() su null. */
const defaultPrefs = (cid: string): EmailPreferencesRow => ({
  company_id: cid,
  logo_url: null,
  primary_color: "#1E3A5F",
  secondary_color: "#F97316",
  footer_text: null,
  footer_show_powered_by: true,
  sender_name: null,
  sender_prefix: "noreply",
  reply_to_email: "",
  transactional_domain_id: null,
  marketing_domain_id: null,
  unsubscribe_footer_html: null,
});

/**
 * Anteprima indicativa: mostra come cambiano logo, colori e testo in fondo mentre si scrive.
 * Non è il modello vero (quello lo compone renderTemplate nelle edge function). Da telefono non c'è: lo spazio serve ai campi.
 */
function AnteprimaEmail({
  logoUrl,
  nomeMittente,
  mittente,
  colorePrincipale,
  coloreRisalto,
  testoInFondo,
  inviatoCon,
}: {
  logoUrl: string | null;
  nomeMittente: string;
  mittente: string;
  colorePrincipale: string;
  coloreRisalto: string;
  testoInFondo: string | null;
  inviatoCon: boolean;
}) {
  return (
    <div className="hidden min-w-0 lg:block" aria-hidden="true">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Anteprima (indicativa)</p>
      <div className="overflow-hidden rounded-lg border bg-white text-slate-800 shadow-sm">
        <div className="border-b bg-slate-50 px-5 py-2 text-[11px] text-slate-500">
          <p className="truncate"><span className="font-medium text-slate-700">Da:</span> {mittente}</p>
        </div>
        <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: colorePrincipale }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-sm font-semibold text-white">{nomeMittente}</span>
          )}
        </div>
        <div className="space-y-3 px-5 py-5 text-sm">
          <p>Gentile cliente,</p>
          <p className="text-slate-600">ti inviamo il preventivo richiesto. Lo trovi qui sotto.</p>
          <span
            className="inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: coloreRisalto }}
          >
            Apri il preventivo
          </span>
          <p className="text-slate-600">{nomeMittente}</p>
        </div>
        <div className="space-y-1 border-t bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
          {testoInFondo && <p className="whitespace-pre-line">{testoInFondo}</p>}
          {inviatoCon && <p>Inviato con EdiliziaInCloud</p>}
          {!testoInFondo && !inviatoCon && <p>Nessun testo in fondo</p>}
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SettingsEmailPreferences({
  linkDominio,
}: {
  /** Dove sta la pagina del dominio quando questa è montata altrove (es. la scheda «Mittente e aspetto» della pagina Email admin). */
  linkDominio?: string;
} = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  // Scrive chi amministra l'azienda o chi ha «Email Marketing» e non è in «sola lettura»: la regola del database
  // (policy «Permesso email: preferenze» e `cep_write`). Prima i campi erano attivi per tutti e il rifiuto arrivava dopo il clic.
  const puoModificare = !permissions.isLoading && puoModificareEmail(permissions);
  // Il dominio e le preferenze sono due pagine sorelle, sia nelle Impostazioni sia nel pannello admin.
  const vaiAlDominio = linkDominio ?? pathname.replace(/\/preferenze-email\/?$/, "/dominio-email");

  // Load current preferences
  const prefsQuery = useQuery<EmailPreferencesRow | null>({
    queryKey: ["company-email-preferences", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_email_preferences")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as EmailPreferencesRow | null) ?? null;
    },
  });

  // Load available verified domains for this company (to pick per-stream)
  const domainsQuery = useQuery<DomainOption[]>({
    queryKey: ["company-email-domains-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_email_domains")
        .select(
          "id, domain, is_verified, is_active, sg_cname_1_valid, sg_cname_2_valid, sg_cname_3_valid, resend_status, ee_spf_verified, ee_dkim_verified",
        )
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as string,
        domain: r.domain as string,
        is_verified: Boolean(r.is_verified),
        transactionalReady:
          (Boolean(r.sg_cname_1_valid) && Boolean(r.sg_cname_2_valid) && Boolean(r.sg_cname_3_valid)) ||
          r.resend_status === "verified",
        marketingReady: Boolean(r.ee_spf_verified) && Boolean(r.ee_dkim_verified),
      }));
    },
  });

  // Il form è il valore salvato (o i valori di partenza, se l'azienda non ha ancora una riga) con sopra le modifiche
  // fatte qui: niente copia dello stato del server da tenere allineata.
  const saved = useMemo(() => (companyId ? prefsQuery.data ?? defaultPrefs(companyId) : null), [companyId, prefsQuery.data]);
  const [modifiche, setModifiche] = useState<Partial<EmailPreferencesRow>>({});
  const form = useMemo(() => (saved ? { ...saved, ...modifiche } : null), [saved, modifiche]);
  const setCampo = <K extends keyof EmailPreferencesRow>(campo: K, valore: EmailPreferencesRow[K]) =>
    setModifiche((m) => ({ ...m, [campo]: valore }));
  const dirty = !!saved && (Object.keys(modifiche) as (keyof EmailPreferencesRow)[]).some((k) => modifiche[k] !== saved[k]);
  useSettingsDraftGuard(puoModificare && dirty);
  const { evidenziata } = useVaiASezione(!prefsQuery.isLoading && !!form);

  const saveMutation = useMutation({
    mutationFn: async (payload: EmailPreferencesRow) => {
      if (!puoModificare) throw new Error("Per cambiare le preferenze serve il permesso «Email Marketing».");
      // upsert: crea la riga se non esiste, altrimenti la aggiorna
      const { error } = await supabase
        .from("company_email_preferences")
        .upsert({
          company_id: payload.company_id,
          logo_url: payload.logo_url,
          primary_color: payload.primary_color.toUpperCase(),
          secondary_color: payload.secondary_color.toUpperCase(),
          footer_text: payload.footer_text,
          footer_show_powered_by: payload.footer_show_powered_by,
          sender_name: payload.sender_name,
          sender_prefix: payload.sender_prefix,
          reply_to_email: payload.reply_to_email,
          transactional_domain_id: payload.transactional_domain_id,
          marketing_domain_id: payload.marketing_domain_id,
          unsubscribe_footer_html: payload.unsubscribe_footer_html,
        }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["company-email-preferences", companyId] });
      setModifiche({});
      toast.success("Preferenze email salvate");
    },
    onError: (err: unknown) => {
      toast.error("Non sono riuscito a salvare", { description: userErrorMessage(err, "Riprova tra poco.") });
    },
  });

  // ── Guards ─────────────────────────────────────────────────────────────
  if (!companyId) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Seleziona un'azienda per cambiare mittente e aspetto delle email.</AlertDescription>
      </Alert>
    );
  }

  if (prefsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Non riesco a leggere le preferenze</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          {userErrorMessage(prefsQuery.error, "Ricarica la pagina tra poco.")}
          <Button size="sm" variant="outline" onClick={() => prefsQuery.refetch()}>Riprova</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (prefsQuery.isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Validation (robusti a null/undefined per company appena inizializzate) ──
  const primaryValid = HEX_REGEX.test(form.primary_color ?? "");
  const secondaryValid = HEX_REGEX.test(form.secondary_color ?? "");
  const prefixValid = PREFIX_REGEX.test(form.sender_prefix ?? "");
  const replyToVuoto = !(form.reply_to_email ?? "").trim();
  const replyToValid = EMAIL_REGEX.test(form.reply_to_email ?? "");
  const logoUrlValid = isValidLogoUrl(form.logo_url);
  // Il piè di pagina di disiscrizione sostituisce quello standard così com'è: senza il segnaposto le campagne
  // partirebbero senza il link per disiscriversi, che è obbligatorio per legge.
  const footerValid = isValidUnsubscribeFooter(form.unsubscribe_footer_html);

  const canSave = primaryValid && secondaryValid && prefixValid && replyToValid && logoUrlValid && footerValid;
  // Perché «Salva» è spento (il primo problema che l'utente deve sistemare).
  const motivoNonSalva = !replyToValid
    ? replyToVuoto ? "Manca l'indirizzo per le risposte." : "L'indirizzo per le risposte non è valido."
    : !prefixValid ? "Controlla la parte prima della @."
    : !primaryValid || !secondaryValid ? "Controlla i colori (si scrivono così: #1E3A5F)."
    : !logoUrlValid ? "Il logo deve cominciare con https://"
    : !footerValid ? "Manca il link per disiscriversi: scrivi {{unsubscribe_url}} nel testo."
    : null;

  const domains = domainsQuery.data ?? [];
  const transactionalDomains = domains.filter((d) => d.transactionalReady);
  const marketingDomains = domains.filter((d) => d.marketingReady);
  const nomeMittente = form.sender_name || effectiveCompany?.name || "La tua azienda";
  const riepilogo: RiepilogoCanale[] = [
    riepilogoCanale({
      titolo: "Messaggi di servizio",
      sottotitolo: "Notifiche, documenti, codici",
      dominioScelto: form.transactional_domain_id,
      pronti: transactionalDomains,
      fallback: DOMINIO_PIATTAFORMA.transactional,
      nome: nomeMittente,
      prefisso: form.sender_prefix,
    }),
    riepilogoCanale({
      titolo: "Campagne e newsletter",
      sottotitolo: "Email di marketing",
      dominioScelto: form.marketing_domain_id,
      pronti: marketingDomains,
      fallback: DOMINIO_PIATTAFORMA.marketing,
      nome: nomeMittente,
      prefisso: form.sender_prefix,
    }),
  ];
  const testoStato = saveMutation.isPending
    ? "Salvataggio…"
    : dirty
      ? motivoNonSalva ?? "Modifiche non salvate"
      : "Nessuna modifica da salvare";

  return (
    // Tutta la larghezza (fino a 1600px): le sezioni stanno affiancate invece di lasciare metà pagina vuota.
    <div className="max-w-[1600px] space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mittente e aspetto delle email</h2>
        <p className="text-sm text-muted-foreground max-sm:hidden">
          Chi vede il cliente come mittente, da quale dominio parte ogni tipo di email e che aspetto hanno.
        </p>
      </div>

      {!puoModificare && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Stai solo consultando: per cambiare mittente e aspetto serve il permesso «Email Marketing» (o essere amministratore).
          </AlertDescription>
        </Alert>
      )}

      {/* Riepilogo per canale: chi scrive, da quale dominio, e se il dominio è il tuo o quello della piattaforma.
          Segue quello che c'è nei campi qui sotto, modifiche non salvate comprese. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Riepilogo per tipo di email">
        {riepilogo.map((c) => (
          <div key={c.titolo} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5">
            <div className={cn("mt-0.5 rounded-md p-1.5", c.tuo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
              {c.titolo === "Campagne e newsletter" ? <Megaphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{c.titolo}</p>
                <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px] font-normal", c.tuo && "border-emerald-300 text-emerald-700 dark:text-emerald-300")}>
                  {c.stato}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground" title={c.mittente}>{c.mittente}</p>
              {c.nota && <p className="text-xs text-amber-700 dark:text-amber-400">{c.nota}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset disabled={!puoModificare || saveMutation.isPending} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* ─── Chi scrive (vale per tutti e due i canali: nel database è un valore solo) ─── */}
        <SezioneImpostazione
          id="chi-scrive"
          titolo="Chi scrive"
          descrizione="Il nome e l'indirizzo che vede il cliente. Valgono per i messaggi di servizio e per le campagne."
          evidenziata={evidenziata === "chi-scrive"}
        >
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sender_name">Nome che vede il cliente</Label>
              <Input
                id="sender_name"
                placeholder="es. Rossi Costruzioni"
                value={form.sender_name ?? ""}
                onChange={(e) => setCampo("sender_name", e.target.value || null)}
                aria-describedby="sender_name-aiuto"
              />
              <p id="sender_name-aiuto" className="text-xs text-muted-foreground">
                Se lo lasci vuoto usiamo il nome dell'azienda.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender_prefix">Prima della @</Label>
              <Input
                id="sender_prefix"
                placeholder="info"
                value={form.sender_prefix}
                onChange={(e) => setCampo("sender_prefix", e.target.value.toLowerCase())}
                aria-invalid={!prefixValid}
                aria-describedby="sender_prefix-aiuto"
                className={!prefixValid ? "border-destructive" : ""}
              />
              <p id="sender_prefix-aiuto" className="text-xs text-muted-foreground">
                Per esempio «info» o «preventivi». Solo lettere minuscole, numeri e <code>. _ -</code> (massimo 30). Vale
                quando le email partono da un dominio tuo.
              </p>
              {!prefixValid && (
                <p className="text-xs text-destructive">C'è un carattere non consentito.</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2 xl:col-span-1">
              <Label htmlFor="reply_to_email">Risposte a</Label>
              <Input
                id="reply_to_email"
                type="email"
                placeholder="info@tuaazienda.it"
                value={form.reply_to_email}
                onChange={(e) => setCampo("reply_to_email", e.target.value)}
                aria-invalid={!replyToValid}
                aria-required="true"
                aria-describedby="reply_to_email-aiuto"
                className={!replyToValid ? "border-destructive" : ""}
              />
              <p id="reply_to_email-aiuto" className="text-xs text-muted-foreground">
                Dove arrivano le risposte dei clienti: una casella che controlli tu. Obbligatorio.
              </p>
              {!replyToValid && !replyToVuoto && (
                <p className="text-xs text-destructive">L'indirizzo non è valido.</p>
              )}
            </div>
          </div>
        </SezioneImpostazione>

        {/* ─── Dominio, per canale ─────────────────────────────────────── */}
        <SezioneImpostazione
          id="dominio"
          titolo="Da quale dominio partono le email"
          descrizione="Uno per tipo di email. Se non scegli niente partono dal dominio della piattaforma."
          evidenziata={evidenziata === "dominio"}
        >
          <div className="grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="space-y-2 px-4 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="h-4 w-4 text-muted-foreground" /> Messaggi di servizio
              </h3>
              <p className="text-xs text-muted-foreground">Notifiche, documenti da firmare, codici di accesso.</p>
              <Label htmlFor="transactional_domain" className="sr-only">Dominio dei messaggi di servizio</Label>
              <Select
                value={form.transactional_domain_id ?? "__none__"}
                onValueChange={(v) => setCampo("transactional_domain_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger id="transactional_domain" aria-label="Dominio dei messaggi di servizio">
                  <SelectValue placeholder="Scegli il dominio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Il dominio della piattaforma ({DOMINIO_PIATTAFORMA.transactional})
                  </SelectItem>
                  {transactionalDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.domain} <span className="text-muted-foreground">· verificato</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transactionalDomains.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nessun tuo dominio è ancora verificato per questi messaggi. Registralo in{" "}
                  <Link to={vaiAlDominio} className="text-primary underline">Dominio</Link>.
                </p>
              )}
            </div>

            <div className="space-y-2 px-4 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="h-4 w-4 text-muted-foreground" /> Campagne e newsletter
                <AmbitoImpostazione>Solo campagne</AmbitoImpostazione>
              </h3>
              <p className="text-xs text-muted-foreground">Le email di marketing mandate a liste di contatti.</p>
              <Label htmlFor="marketing_domain" className="sr-only">Dominio delle campagne</Label>
              <Select
                value={form.marketing_domain_id ?? "__none__"}
                onValueChange={(v) => setCampo("marketing_domain_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger id="marketing_domain" aria-label="Dominio delle campagne">
                  <SelectValue placeholder="Scegli il dominio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {/* Il valore vero è email_marketing_fallback_subdomain (21/09/2026). */}
                    Il dominio della piattaforma ({DOMINIO_PIATTAFORMA.marketing})
                  </SelectItem>
                  {marketingDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.domain} <span className="text-muted-foreground">· verificato</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {marketingDomains.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nessun tuo dominio è ancora verificato per le campagne. Registralo in{" "}
                  <Link to={vaiAlDominio} className="text-primary underline">Dominio</Link>.
                </p>
              )}

              {/* Il piè di pagina di disiscrizione vale solo per le campagne: sta qui, non in «Avanzate». Chiuso finché
                  non serve, ma si apre da solo se il testo scritto non va bene. */}
              <details className="rounded-md border" open={!footerValid || undefined}>
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  Piè di pagina delle campagne <span className="text-xs text-muted-foreground">(facoltativo)</span>
                </summary>
                <div className="space-y-2 border-t px-3 py-3">
                  <Label htmlFor="unsubscribe_footer_html" className="text-sm font-medium">Piè di pagina delle campagne</Label>
                  <p className="text-xs text-muted-foreground">
                    Testo con il link per disiscriversi, obbligatorio per legge. Se lo lasci vuoto usiamo quello standard.
                  </p>
                  <Textarea
                    id="unsubscribe_footer_html"
                    rows={4}
                    placeholder='<p style="font-size:11px;color:#94a3b8">…</p>'
                    value={form.unsubscribe_footer_html ?? ""}
                    onChange={(e) => setCampo("unsubscribe_footer_html", e.target.value || null)}
                    aria-invalid={!footerValid}
                    aria-describedby="unsubscribe_footer_html-aiuto"
                    className={cn("font-mono text-xs", !footerValid && "border-destructive")}
                  />
                  <p id="unsubscribe_footer_html-aiuto" className="text-xs text-muted-foreground">
                    Scrivi <code>{"{{unsubscribe_url}}"}</code> dove vuoi il link: al suo posto compare quello vero.
                  </p>
                  {!footerValid && (
                    <p className="text-xs text-destructive">
                      Manca il link per disiscriversi: scrivi <code>{"{{unsubscribe_url}}"}</code> nel testo.
                    </p>
                  )}
                </div>
              </details>
            </div>
          </div>
        </SezioneImpostazione>

        {/* ─── Brand ──────────────────────────────────────────────────────
            Un'identità sola per azienda: company_email_preferences ha una riga per azienda, non esistono più brand
            per mittente. Si presenta come «Brand» per leggerla come tale. */}
        <SezioneImpostazione
          id="aspetto"
          titolo="Brand"
          descrizione="Logo, colori e testo in fondo: valgono per tutte le email. L'anteprima a destra cambia mentre scrivi."
          evidenziata={evidenziata === "aspetto"}
        >
          <div className="grid grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logo_url">Indirizzo del logo (https://)</Label>
                <Input
                  id="logo_url"
                  type="url"
                  placeholder="https://tuaazienda.it/logo.png"
                  value={form.logo_url ?? ""}
                  onChange={(e) => setCampo("logo_url", e.target.value || null)}
                  aria-invalid={!logoUrlValid}
                  aria-describedby="logo_url-aiuto"
                  className={!logoUrlValid ? "border-destructive" : ""}
                />
                <p id="logo_url-aiuto" className="text-xs text-muted-foreground">
                  Massimo 200 KB, meglio un PNG con sfondo trasparente. Se lo lasci vuoto usiamo il logo dell'azienda.
                </p>
                {!logoUrlValid && (
                  <p className="text-xs text-destructive">L'indirizzo del logo deve cominciare con https://</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HexColorInput
                  id="primary_color"
                  label="Colore principale"
                  value={form.primary_color}
                  onChange={(v) => setCampo("primary_color", v)}
                />
                <HexColorInput
                  id="secondary_color"
                  label="Colore di risalto"
                  value={form.secondary_color}
                  onChange={(v) => setCampo("secondary_color", v)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer_text">Testo in fondo alle email (facoltativo)</Label>
                <Textarea
                  id="footer_text"
                  rows={2}
                  placeholder="Es. Rossi Costruzioni SRL · Via Roma 1, 20100 Milano · P.IVA 12345678901"
                  value={form.footer_text ?? ""}
                  onChange={(e) => setCampo("footer_text", e.target.value || null)}
                  aria-describedby="footer_text-aiuto"
                />
                <p id="footer_text-aiuto" className="text-xs text-muted-foreground">
                  Per le campagne conviene metterci i dati dell'azienda (indirizzo, partita IVA).
                </p>
              </div>

              <div className="-mx-4 border-t">
                <RigaImpostazione
                  titolo="Scrivi «Inviato con EdiliziaInCloud» in fondo alle email"
                  htmlFor="powered_by"
                  descrizione="Se lo spegni la scritta sparisce dalle email."
                  comando={
                    <Switch
                      id="powered_by"
                      checked={form.footer_show_powered_by}
                      onCheckedChange={(checked) => setCampo("footer_show_powered_by", checked)}
                      aria-describedby="powered_by-descrizione"
                    />
                  }
                />
              </div>
            </div>
            <AnteprimaEmail
              logoUrl={logoUrlValid ? form.logo_url : null}
              nomeMittente={nomeMittente}
              mittente={riepilogo[0].mittente}
              colorePrincipale={primaryValid ? form.primary_color : "#1E3A5F"}
              coloreRisalto={secondaryValid ? form.secondary_color : "#F97316"}
              testoInFondo={form.footer_text}
              inviatoCon={form.footer_show_powered_by}
            />
          </div>
        </SezioneImpostazione>

        {/* Lo stato lo legge sempre il lettore di schermo; la barra si vede solo con modifiche da salvare. */}
        <p role="status" className="sr-only">{testoStato}</p>

        {/* ─── Barra di salvataggio: compare solo con modifiche non salvate ─── */}
        {puoModificare && (dirty || saveMutation.isPending) && (
          <div className="sticky bottom-2 max-md:bottom-20 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
            <p
              aria-hidden="true"
              className={cn(
                "min-w-0 flex-1 text-sm",
                motivoNonSalva && !saveMutation.isPending ? "font-medium text-destructive" : "text-amber-700 dark:text-amber-400",
              )}
            >
              {saveMutation.isPending ? "Salvataggio…" : motivoNonSalva ?? "Hai modifiche non salvate"}
            </p>
            <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
              <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={() => setModifiche({})} disabled={saveMutation.isPending}>
                Annulla modifiche
              </Button>
              <Button size="sm" className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={() => saveMutation.mutate(form)} disabled={!canSave || saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salva preferenze
              </Button>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
