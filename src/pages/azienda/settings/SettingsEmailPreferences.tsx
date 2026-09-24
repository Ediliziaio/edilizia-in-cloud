// ============================================================================
// SettingsEmailPreferences — Email Dual-Provider FASE 10
// ============================================================================
// Form branding + identità mittente + scelta dominio per stream.
// Popola la tabella `company_email_preferences` usata dal template renderer
// (_shared/renderTemplate.ts) e dal resolveSender delle Edge Function.
//
// Sezioni:
//   1. Branding dinamico   — logo, colori, footer, powered-by
//   2. Identità mittente   — sender_name, sender_prefix, reply-to
//   3. Dominio per stream  — transactional_domain_id + marketing_domain_id
//                            (dropdown da company_email_domains verificati;
//                            NULL = fallback sottodomini EiC)
//   4. Footer unsubscribe  — HTML custom override (solo marketing)
// ============================================================================

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Palette, Mail, Globe2, AlertTriangle, Save, CheckCircle2 } from "lucide-react";
import {
  HEX_REGEX,
  PREFIX_REGEX,
  EMAIL_REGEX,
  isValidLogoUrl,
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

// ── Helpers ──────────────────────────────────────────────────────────────────
// Regex/validators importati da @/lib/email/preferencesValidators per condividere
// la stessa logica con i test unitari.

function HexColorInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const valid = HEX_REGEX.test(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 w-9 rounded border cursor-pointer p-0.5 disabled:opacity-50"
          aria-label={`${label} — selettore colore`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1E3A5F"
          disabled={disabled}
          aria-invalid={!valid}
          className={`font-mono text-sm flex-1 ${!valid ? "border-destructive" : ""}`}
        />
      </div>
      {!valid && (
        <p className="text-xs text-destructive">Formato non valido. Usa il formato esadecimale (es. #1E3A5F).</p>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SettingsEmailPreferences() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

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

  // Default valori se nessuna riga esiste ancora (es. company appena creata,
  // platform admin company, ecc.) — evita crash su .toUpperCase()/.test() su null.
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

  // Local form state (synced from server, con fallback ai default)
  const [form, setForm] = useState<EmailPreferencesRow | null>(null);

  useEffect(() => {
    if (!form && !prefsQuery.isLoading && companyId) {
      // Se data è null (nessuna riga in DB) usiamo i default
      setForm(prefsQuery.data ?? defaultPrefs(companyId));
    }
  }, [prefsQuery.data, prefsQuery.isLoading, form, companyId]);

  const saveMutation = useMutation({
    mutationFn: async (payload: EmailPreferencesRow) => {
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
    onSuccess: () => {
      toast.success("Preferenze email salvate");
      qc.invalidateQueries({ queryKey: ["company-email-preferences", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Errore durante il salvataggio: ${msg}`);
    },
  });

  // ── Guards ─────────────────────────────────────────────────────────────
  if (!companyId) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Seleziona un'azienda per configurare le preferenze email.</AlertDescription>
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

  if (prefsQuery.error) {
    const msg = prefsQuery.error instanceof Error ? prefsQuery.error.message : String(prefsQuery.error);
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Errore caricamento preferenze</AlertTitle>
        <AlertDescription>{msg}</AlertDescription>
      </Alert>
    );
  }

  // ── Validation (robusti a null/undefined per company appena inizializzate) ──
  const primaryValid = HEX_REGEX.test(form.primary_color ?? "");
  const secondaryValid = HEX_REGEX.test(form.secondary_color ?? "");
  const prefixValid = PREFIX_REGEX.test(form.sender_prefix ?? "");
  const replyToValid = EMAIL_REGEX.test(form.reply_to_email ?? "");
  const logoUrlValid = isValidLogoUrl(form.logo_url);

  const canSave =
    primaryValid && secondaryValid && prefixValid && replyToValid && logoUrlValid;

  const domains = domainsQuery.data ?? [];
  const transactionalDomains = domains.filter((d) => d.transactionalReady);
  const marketingDomains = domains.filter((d) => d.marketingReady);

  return (
    <div className="max-w-3xl space-y-6">
      {/* ─── Branding ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>Branding email</CardTitle>
          </div>
          <CardDescription>
            Personalizza l'aspetto dei template email transazionali e marketing con logo,
            colori e testo del footer. Applicato automaticamente a tutti i template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logo_url">URL logo (HTTPS)</Label>
            <Input
              id="logo_url"
              type="url"
              placeholder="https://tuaazienda.it/logo.png"
              value={form.logo_url ?? ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value || null })}
              aria-invalid={!logoUrlValid}
              className={!logoUrlValid ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Massimo 200KB, preferibilmente PNG trasparente. Se vuoto, nelle email va il logo aziendale (Impostazioni → Branding).
            </p>
            {!logoUrlValid && (
              <p className="text-xs text-destructive">Il logo deve essere servito su HTTPS.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HexColorInput
              label="Colore primario"
              value={form.primary_color}
              onChange={(v) => setForm({ ...form, primary_color: v })}
            />
            <HexColorInput
              label="Colore secondario / accento"
              value={form.secondary_color}
              onChange={(v) => setForm({ ...form, secondary_color: v })}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="footer_text">Testo footer (opzionale)</Label>
            <Textarea
              id="footer_text"
              rows={2}
              placeholder="Es. Rossi Costruzioni SRL · Via Roma 1, 20100 Milano · P.IVA 12345678901"
              value={form.footer_text ?? ""}
              onChange={(e) => setForm({ ...form, footer_text: e.target.value || null })}
            />
            <p className="text-xs text-muted-foreground">
              Consigliato per email marketing: include indirizzo legale come richiesto dal GDPR.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="powered_by" className="text-sm font-medium">
                Mostra "Inviato con EdiliziaInCloud" nel footer
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disattivabile solo sui piani con white-label.
              </p>
            </div>
            <Switch
              id="powered_by"
              checked={form.footer_show_powered_by}
              onCheckedChange={(checked) => setForm({ ...form, footer_show_powered_by: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Identità mittente ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Identità mittente</CardTitle>
          </div>
          <CardDescription>
            Come appare il mittente nelle email (nome, prefisso locale, indirizzo di risposta).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sender_name">Nome mittente</Label>
              <Input
                id="sender_name"
                placeholder="es. Rossi Costruzioni"
                value={form.sender_name ?? ""}
                onChange={(e) => setForm({ ...form, sender_name: e.target.value || null })}
              />
              <p className="text-xs text-muted-foreground">
                Se vuoto, viene usato il nome dell'azienda.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender_prefix">Parte locale (prima della @)</Label>
              <Input
                id="sender_prefix"
                placeholder="no-reply"
                value={form.sender_prefix}
                onChange={(e) =>
                  setForm({ ...form, sender_prefix: e.target.value.toLowerCase() })
                }
                aria-invalid={!prefixValid}
                className={!prefixValid ? "border-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Solo lettere minuscole, numeri e <code>. _ -</code> (max 30 caratteri).
              </p>
              {!prefixValid && (
                <p className="text-xs text-destructive">Carattere non consentito nel prefisso.</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reply_to_email">Reply-to</Label>
            <Input
              id="reply_to_email"
              type="email"
              placeholder="info@tuaazienda.it"
              value={form.reply_to_email}
              onChange={(e) => setForm({ ...form, reply_to_email: e.target.value })}
              aria-invalid={!replyToValid}
              className={!replyToValid ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Indirizzo a cui arrivano le risposte dei clienti. Deve essere un indirizzo che controlli tu.
            </p>
            {!replyToValid && (
              <p className="text-xs text-destructive">Email non valida.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Dominio per stream ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" />
            <CardTitle>Dominio per stream</CardTitle>
          </div>
          <CardDescription>
            Scegli quale dominio usare per le email transazionali (fatture, reset password,…)
            e marketing (campagne, newsletter). Se non scegli nulla, le email escono dai
            sottodomini condivisi della piattaforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="transactional_domain">Email transazionali</Label>
            <Select
              value={form.transactional_domain_id ?? "__none__"}
              onValueChange={(v) =>
                setForm({ ...form, transactional_domain_id: v === "__none__" ? null : v })
              }
            >
              <SelectTrigger id="transactional_domain">
                <SelectValue placeholder="Seleziona dominio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  Sottodominio piattaforma (notifiche.ediliziaincloud.it)
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
                Nessun dominio custom verificato per il canale transazionale. Configuralo dalla
                pagina <strong>Dominio email</strong>.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="marketing_domain">Email marketing</Label>
            <Select
              value={form.marketing_domain_id ?? "__none__"}
              onValueChange={(v) =>
                setForm({ ...form, marketing_domain_id: v === "__none__" ? null : v })
              }
            >
              <SelectTrigger id="marketing_domain">
                <SelectValue placeholder="Seleziona dominio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {/* Il valore vero è email_marketing_fallback_subdomain (21/09/2026). */}
                  Sottodominio piattaforma (mkt.eic-mail.com)
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
                Nessun dominio custom verificato per il canale marketing. Configuralo dalla pagina{" "}
                <strong>Dominio email</strong>.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Footer unsubscribe custom (marketing) ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Footer unsubscribe marketing (avanzato)</CardTitle>
          <CardDescription>
            HTML personalizzato per il footer delle email marketing (obbligatorio per legge includere
            link disiscrizione). Se vuoto, viene usato il footer standard EiC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            placeholder='<p style="font-size:11px;color:#94a3b8">...</p>'
            value={form.unsubscribe_footer_html ?? ""}
            onChange={(e) =>
              setForm({ ...form, unsubscribe_footer_html: e.target.value || null })
            }
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Il placeholder <code>{"{{unsubscribe_url}}"}</code> viene sostituito con il link reale.
          </p>
        </CardContent>
      </Card>

      {/* ─── Azioni ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-lg border">
        {saveMutation.isSuccess && !saveMutation.isPending && (
          <span className="text-sm text-green-600 flex items-center gap-1 mr-auto">
            <CheckCircle2 className="h-4 w-4" /> Salvato
          </span>
        )}
        <Button
          variant="outline"
          onClick={() => setForm(prefsQuery.data ?? null)}
          disabled={saveMutation.isPending}
        >
          Annulla modifiche
        </Button>
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salva preferenze
        </Button>
      </div>
    </div>
  );
}
