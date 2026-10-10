// ============================================================================
// SettingsEmailPreferences — Email Dual-Provider FASE 10
// ============================================================================
// Mittente e aspetto delle email dell'azienda. Popola la tabella
// `company_email_preferences` usata dal template renderer (_shared/renderTemplate.ts)
// e dal resolveSender delle Edge Function.
//
// Sezioni (nell'ordine in cui si cercano di più, 09/10/2026):
//   1. Chi scrive          — sender_name, sender_prefix, reply-to
//   2. Dominio             — transactional_domain_id + marketing_domain_id
//                            (dropdown da company_email_domains verificati;
//                            NULL = fallback sottodomini EiC)
//   3. Aspetto             — logo, colori, testo in fondo
//   4. Avanzate (chiusa)   — «Inviato con EdiliziaInCloud», piè di pagina di disiscrizione (HTML)
//                            (non è nell'indice in cima: si apre da sola solo con un clic)
//
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
import { Loader2, AlertTriangle, Save, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AmbitoImpostazione,
  IndiceSezioni,
  RigaImpostazione,
  SezioneImpostazione,
  type VoceIndice,
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

const SEZIONI: VoceIndice[] = [
  { id: "chi-scrive", etichetta: "Chi scrive" },
  { id: "dominio", etichetta: "Dominio" },
  { id: "aspetto", etichetta: "Aspetto" },
];

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

// ── Page ────────────────────────────────────────────────────────────────────
export default function SettingsEmailPreferences() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  // Scrive chi amministra l'azienda o chi ha «Email Marketing» e non è in «sola lettura»: la regola del database
  // (policy «Permesso email: preferenze» e `cep_write`). Prima i campi erano attivi per tutti e il rifiuto arrivava dopo il clic.
  const puoModificare = !permissions.isLoading && puoModificareEmail(permissions);
  // Il dominio e le preferenze sono due pagine sorelle, sia nelle Impostazioni sia nel pannello admin.
  const vaiAlDominio = pathname.replace(/\/preferenze-email\/?$/, "/dominio-email");

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
  const { evidenziata, vai } = useVaiASezione(!prefsQuery.isLoading && !!form);

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

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mittente e aspetto delle email</h2>
        <p className="text-sm text-muted-foreground">
          Chi vede il cliente come mittente, da quale dominio partono le email e che aspetto hanno. Vale per tutte le email dell'azienda.
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

      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset disabled={!puoModificare || saveMutation.isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
        {/* Indice e salvataggio restano in vista mentre si scorre. Il motivo per cui «Salva» è spento sta su una riga
            sua, sotto, per non schiacciare le voci dell'indice. */}
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          {/* Da telefono le voci dell'indice hanno una riga tutta per loro, i pulsanti quella sotto. */}
          <div className="flex min-w-0 basis-full items-start sm:flex-1 sm:basis-auto">
            <IndiceSezioni voci={SEZIONI} onVai={vai} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {dirty && (
              <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={() => setModifiche({})} disabled={saveMutation.isPending}>
                Annulla modifiche
              </Button>
            )}
            <Button size="sm" className="h-11 sm:h-9" onClick={() => saveMutation.mutate(form)} disabled={!dirty || !canSave || saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 sm:mr-2" />
              )}
              <span className="max-sm:sr-only">Salva preferenze</span>
            </Button>
          </div>
          {/* A riposo lo stato lo legge solo il lettore di schermo. */}
          <p
            role="status"
            className={cn(
              "basis-full text-xs",
              saveMutation.isPending || dirty ? "text-muted-foreground" : "sr-only",
              dirty && !saveMutation.isPending && !motivoNonSalva && "font-medium text-amber-700 dark:text-amber-400",
              dirty && !saveMutation.isPending && motivoNonSalva && "font-medium text-destructive",
            )}
          >
            {saveMutation.isPending
              ? "Salvataggio…"
              : dirty
                ? motivoNonSalva ?? "Modifiche non salvate"
                : "Nessuna modifica da salvare"}
          </p>
        </div>

        {/* ─── Chi scrive ─────────────────────────────────────────────── */}
        <SezioneImpostazione
          id="chi-scrive"
          titolo="Chi scrive"
          descrizione="Il nome e l'indirizzo che vede il cliente nelle email."
          evidenziata={evidenziata === "chi-scrive"}
        >
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
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
                Per esempio «info» o «preventivi». Solo lettere minuscole, numeri e <code>. _ -</code> (massimo 30).
              </p>
              {!prefixValid && (
                <p className="text-xs text-destructive">C'è un carattere non consentito.</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
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
                L'indirizzo a cui arrivano le risposte dei clienti. Deve essere una casella che controlli tu. Obbligatorio.
              </p>
              {!replyToValid && !replyToVuoto && (
                <p className="text-xs text-destructive">L'indirizzo non è valido.</p>
              )}
            </div>
          </div>
        </SezioneImpostazione>

        {/* ─── Dominio ────────────────────────────────────────────────── */}
        <SezioneImpostazione
          id="dominio"
          titolo="Da quale dominio partono le email"
          descrizione="Se non scegli niente le email partono dal dominio della piattaforma."
          evidenziata={evidenziata === "dominio"}
        >
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transactional_domain">Messaggi di servizio (notifiche, documenti, codici)</Label>
              <Select
                value={form.transactional_domain_id ?? "__none__"}
                onValueChange={(v) => setCampo("transactional_domain_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger id="transactional_domain">
                  <SelectValue placeholder="Scegli il dominio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Il dominio della piattaforma (notifiche.ediliziaincloud.it)
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

            <div className="space-y-2">
              <Label htmlFor="marketing_domain">Campagne e newsletter</Label>
              <Select
                value={form.marketing_domain_id ?? "__none__"}
                onValueChange={(v) => setCampo("marketing_domain_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger id="marketing_domain">
                  <SelectValue placeholder="Scegli il dominio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {/* Il valore vero è email_marketing_fallback_subdomain (21/09/2026). */}
                    Il dominio della piattaforma (mkt.eic-mail.com)
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
            </div>
          </div>
        </SezioneImpostazione>

        {/* ─── Aspetto ────────────────────────────────────────────────── */}
        <SezioneImpostazione
          id="aspetto"
          titolo="Aspetto delle email"
          descrizione="Logo, colori e testo in fondo: valgono per tutti i modelli di email."
          evidenziata={evidenziata === "aspetto"}
        >
          <div className="space-y-4 px-4 py-4">
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
          </div>
        </SezioneImpostazione>

        {/* ─── Avanzate (chiuse) ──────────────────────────────────────── */}
        <details id="avanzate" className="scroll-mt-28 rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3">
            <span className="text-base font-semibold">Avanzate</span>
            <span className="ml-2 text-sm text-muted-foreground">La scritta «Inviato con» e il piè di pagina delle campagne</span>
          </summary>
          <div className="divide-y border-t">
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
            <div className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="unsubscribe_footer_html" className="text-sm font-medium">Piè di pagina delle campagne</Label>
                <AmbitoImpostazione>Solo campagne</AmbitoImpostazione>
              </div>
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
          </div>
        </details>
      </fieldset>
    </div>
  );
}
