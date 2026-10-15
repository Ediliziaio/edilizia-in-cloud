import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useIncludedWhitelabel } from "@/hooks/useIncludedWhitelabel";
import { caricaProfiliPerId, nomeProfilo } from "@/lib/profilesLookup";
import { usesPlatformColors, isValidHexColor } from "@/lib/brandTheme";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Palette, Globe, Crown, Shield, Clock } from "lucide-react";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  none: "Nessuno",
  basic: "Basic",
  full: "Full",
  agency: "Agency",
};
function auditTier(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const tier = payload.manual_tier ?? payload.tier;
  return typeof tier === "string" ? (TIER_LABELS[tier] ?? tier) : null;
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Riprova tra qualche istante.";

export function TabWhiteLabel({ companyId }: { companyId: string }) {
  // Un cambio azienda deve scartare anche un eventuale editor ancora aperto.
  return <WhiteLabelCompany key={companyId} companyId={companyId} />;
}

function WhiteLabelCompany({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [manualDraft, setManualDraft] = useState<string | null>(null);
  const brandingQuery = useQuery({
    queryKey: ["admin", "whitelabel", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_branding")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // La piattaforma legge il marchio da companies: il riepilogo usa la stessa fonte.
  const companyQuery = useQuery({
    queryKey: ["admin", "whitelabel-company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "name, subscription_plan_id, white_label_enabled, logo_url, brand_platform_name, brand_primary_color, brand_accent_color, brand_text_on_primary, brand_hide_powered_by, brand_favicon_url",
        )
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const plan = useIncludedWhitelabel(companyQuery.data?.subscription_plan_id);
  const tiersQuery = useQuery({
    queryKey: ["whitelabel-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whitelabel_tiers")
        .select("*")
        .order("price_monthly");
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
  const auditQuery = useQuery({
    queryKey: ["admin", "whitelabel-audit", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whitelabel_audit_log")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const profiles = await caricaProfiliPerId(
        (data ?? []).map((row) => row.actor_id),
      );
      return (data ?? []).map((row) => ({
        ...row,
        actor: row.actor_id ? profiles.get(row.actor_id) : null,
      }));
    },
  });
  const branding = brandingQuery.data;
  const company = companyQuery.data;
  const manualTier = branding?.whitelabel_manual_tier ?? "none";
  const effectiveTier = branding?.whitelabel_tier ?? "none";
  useBeforeUnload(manualDraft !== null && manualDraft !== manualTier);
  const previewTier =
    manualDraft === "agency"
      ? "agency"
      : plan.isIncluded
        ? "full"
        : (manualDraft ?? effectiveTier);
  const currentTier = tiersQuery.data?.find(
    (tier) => tier.slug === effectiveTier,
  );

  const save = useMutation({
    mutationFn: async (requestedTier: string) => {
      if (!user) throw new Error("Sessione scaduta. Accedi di nuovo.");
      // Il tier effettivo invariato attiva anche il trigger UPDATE OF che sincronizza
      // companies.white_label_enabled; il BEFORE trigger ricalcola il tier dalla concessione.
      // All'inserimento il trigger ricava la concessione dal tier richiesto.
      const request = branding
        ? supabase
            .from("company_branding")
            .update({
              whitelabel_manual_tier: requestedTier,
              whitelabel_tier: effectiveTier,
              is_active: plan.isIncluded || requestedTier !== "none",
            })
            .eq("company_id", companyId)
            .eq("whitelabel_manual_tier", manualTier)
        : supabase.from("company_branding").insert({
            company_id: companyId,
            whitelabel_tier: requestedTier,
            is_active: plan.isIncluded || requestedTier !== "none",
          });
      const { data, error } = await request
        .select("whitelabel_tier, whitelabel_manual_tier")
        .single();
      if (error) {
        if (error.code === "PGRST116") {
          throw new Error(
            "La concessione è cambiata o non è più modificabile. Ricarica la scheda e riprova.",
          );
        }
        throw new Error(error.message);
      }
      const audit = await supabase.from("whitelabel_audit_log").insert({
        company_id: companyId,
        actor_id: user.id,
        action: "tier_changed",
        old_value: { tier: effectiveTier, manual_tier: manualTier },
        new_value: {
          tier: data.whitelabel_tier,
          manual_tier: data.whitelabel_manual_tier,
        },
      });
      return { ...data, auditError: audit.error };
    },
    onSuccess: (data) => {
      setManualDraft(null);
      if (data.auditError)
        toast.warning("Livello salvato, ma lo storico non è stato aggiornato.");
      else
        toast.success(
          `White label ${TIER_LABELS[data.whitelabel_tier] ?? data.whitelabel_tier} salvato`,
        );
      for (const queryKey of [
        ["admin", "whitelabel", companyId],
        ["admin", "whitelabel-company", companyId],
        ["admin", "whitelabel-audit", companyId],
        ["company-detail", companyId],
        ["brand-settings", companyId],
        ["company-branding"],
        ["wl-branding-tier", companyId],
      ])
        void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (brandingQuery.isLoading || companyQuery.isLoading || plan.isLoading)
    return (
      <div role="status" className="flex items-center gap-2 py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
        Caricamento white label…
      </div>
    );
  if (brandingQuery.isError || companyQuery.isError || plan.isError)
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p role="alert">
            Impossibile caricare il white label. Nessuna modifica disponibile
            finché i dati non sono aggiornati.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void brandingQuery.refetch();
              void companyQuery.refetch();
              void plan.refetch();
            }}
          >
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  if (!company) return null;
  const standardColors = usesPlatformColors({
    primaryColor: company.brand_primary_color ?? "#1E40AF",
    accentColor: company.brand_accent_color ?? "#DBEAFE",
    textOnPrimary: company.brand_text_on_primary ?? "#FFFFFF",
  });
  const active = company.white_label_enabled && effectiveTier !== "none";
  const capabilities: ReadonlyArray<readonly [boolean, string]> = currentTier
    ? ([
        [currentTier.can_change_logo, "Logo aziendale"],
        [currentTier.can_change_colors, "Colori personalizzati"],
        [currentTier.can_custom_domain, "Dominio personalizzato"],
        [currentTier.can_hide_powered_by, "Rimozione Powered by"],
        [currentTier.can_custom_email_branding, "Marchio nelle email"],
        [currentTier.can_custom_pdf_branding, "Marchio nei PDF"],
        [currentTier.can_custom_pwa, "App con marchio aziendale"],
        [currentTier.can_custom_css, "CSS personalizzato"],
        [currentTier.can_resell, "Rivendita"],
      ] as const)
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            White label dell’azienda
          </CardTitle>
          <CardDescription>
            Disponibilità, origine del diritto e concessioni manuali.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={active ? "default" : "secondary"}>
              {active ? "Attivo" : "Non attivo"}
            </Badge>
            <Badge variant="outline">
              Livello effettivo: {TIER_LABELS[effectiveTier] ?? effectiveTier}
            </Badge>
            {plan.isIncluded && (
              <Badge className="bg-emerald-100 text-emerald-800">
                Incluso nel piano {plan.planName}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {plan.isIncluded
              ? `Il piano ${plan.planName} include Full automaticamente, senza supplemento White Label. Una concessione Agency mantiene le funzionalità aggiuntive.`
              : `Il piano ${plan.planName ?? "attuale"} non include il white label. L’accesso dipende dalla concessione manuale.`}
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <p className="font-medium">I colori standard restano invariati</p>
            <p className="text-muted-foreground">
              Attivare il white label o cambiare livello non modifica il
              marchio. I colori cambiano solo quando l’azienda li personalizza e
              li salva.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Concessione manuale:{" "}
              <strong>{TIER_LABELS[manualTier] ?? manualTier}</strong>
            </p>
            {manualDraft === null && (
              <Button
                variant="outline"
                onClick={() => setManualDraft(manualTier)}
              >
                Gestisci concessione
              </Button>
            )}
          </div>
          {manualDraft !== null && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                La concessione non modifica il piano né gli addebiti. Resta
                valida anche passando a un piano che non include il white label.
                «Nessuno» rimuove soltanto la concessione manuale; il Full
                incluso in Pro o Enterprise resta disponibile.
              </p>
              {tiersQuery.isError ? (
                <p role="alert">
                  Livelli non disponibili.{" "}
                  <Button
                    variant="link"
                    onClick={() => void tiersQuery.refetch()}
                  >
                    Riprova
                  </Button>
                </p>
              ) : (
                <RadioGroup
                  aria-label="Concessione manuale white label"
                  value={manualDraft}
                  onValueChange={setManualDraft}
                  disabled={save.isPending}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                  {["none", "basic", "full", "agency"].map((slug) => (
                    <Label
                      key={slug}
                      htmlFor={`wl-${slug}`}
                      className="flex items-center gap-2 rounded-lg border p-4 cursor-pointer"
                    >
                      <RadioGroupItem id={`wl-${slug}`} value={slug} />
                      {TIER_LABELS[slug]}
                    </Label>
                  ))}
                </RadioGroup>
              )}
              <p className="text-sm" role="status">
                Livello dopo il salvataggio:{" "}
                <strong>{TIER_LABELS[previewTier]}</strong>. I colori salvati
                restano invariati.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => save.mutate(manualDraft)}
                  disabled={
                    save.isPending ||
                    manualDraft === manualTier ||
                    tiersQuery.isError ||
                    tiersQuery.isLoading
                  }
                >
                  {save.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salva concessione
                </Button>
                <Button
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => setManualDraft(null)}
                >
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" />
              Marchio salvato
            </CardTitle>
            <CardDescription>
              Gli stessi dati usati dalla piattaforma aziendale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <dt className="text-muted-foreground">Nome piattaforma</dt>
              <dd className="break-words">
                {company.brand_platform_name || "EdiliziaInCloud"}
              </dd>
              <dt className="text-muted-foreground">Colori</dt>
              <dd>
                {standardColors ? "Colori standard" : "Colori personalizzati"}
                {!standardColors &&
                  isValidHexColor(company.brand_primary_color) && (
                    <span
                      className="ml-2 inline-block h-3 w-3 rounded-full border"
                      style={{ backgroundColor: company.brand_primary_color }}
                    />
                  )}
              </dd>
              <dt className="text-muted-foreground">Logo aziendale</dt>
              <dd>{company.logo_url ? "Caricato" : "Logo standard"}</dd>
              <dt className="text-muted-foreground">Icona browser</dt>
              <dd>
                {company.brand_favicon_url ? "Personalizzata" : "Standard"}
              </dd>
              <dt className="text-muted-foreground">Powered by</dt>
              <dd>{company.brand_hide_powered_by ? "Nascosto" : "Visibile"}</dd>
            </dl>
            {!active && (
              <p className="text-muted-foreground">
                Colori, nome e preferenza Powered by sono conservati e verranno
                applicati quando il white label sarà attivo.
              </p>
            )}
            <p className="border-t pt-3 text-muted-foreground">
              Per modificare logo, colori e nome usa «Accedi come Admin» nella
              scheda azienda, poi Impostazioni → Marchio e colori.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              Indirizzo web
            </CardTitle>
            <CardDescription>
              Stato del dominio, disponibile anche senza aprire l’editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {branding?.custom_domain ? (
              <>
                <p className="break-all font-medium">
                  {branding.custom_domain}
                </p>
                <Badge
                  variant={
                    branding.custom_domain_verified ? "default" : "secondary"
                  }
                >
                  {branding.custom_domain_verified
                    ? "Dominio verificato"
                    : "In attesa di verifica DNS"}
                </Badge>
                {branding.custom_domain_cname && (
                  <p className="break-all text-muted-foreground">
                    Destinazione CNAME:{" "}
                    <code>{branding.custom_domain_cname}</code>
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Nessun dominio personalizzato configurato.
              </p>
            )}
            <p className="text-muted-foreground">
              La verifica DNS conferma la proprietà del dominio; il collegamento
              e il certificato devono essere operativi prima dell’uso.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Funzionalità del livello{" "}
            {TIER_LABELS[effectiveTier] ?? effectiveTier}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tiersQuery.isError ? (
            <p role="alert">
              Impossibile caricare le funzionalità.{" "}
              <Button variant="link" onClick={() => void tiersQuery.refetch()}>
                Riprova
              </Button>
            </p>
          ) : tiersQuery.isLoading ? (
            <p>Caricamento funzionalità…</p>
          ) : currentTier ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {capabilities.map(([enabled, label]) => (
                <p
                  key={label}
                  className={`text-sm ${enabled ? "" : "text-muted-foreground"}`}
                >
                  <span className={enabled ? "text-emerald-600" : ""}>
                    {enabled ? "✓" : "—"}
                  </span>{" "}
                  {label}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessuna funzionalità white label disponibile per questo livello.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Storico White Label
          </CardTitle>
          <CardDescription>Ultime 20 operazioni registrate.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditQuery.isLoading ? (
            <p className="text-sm">Caricamento storico…</p>
          ) : auditQuery.isError ? (
            <p role="alert">
              Storico non disponibile.{" "}
              <Button variant="link" onClick={() => void auditQuery.refetch()}>
                Riprova
              </Button>
            </p>
          ) : !auditQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nessuna operazione registrata.
            </p>
          ) : (
            <div className="divide-y">
              {auditQuery.data.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm"
                >
                  <Badge variant="outline">
                    {entry.action === "tier_changed"
                      ? "Livello modificato"
                      : entry.action}
                  </Badge>
                  {auditTier(entry.new_value) && (
                    <span>
                      {auditTier(entry.old_value) ?? "—"} →{" "}
                      {auditTier(entry.new_value)}
                    </span>
                  )}
                  <span>
                    {nomeProfilo(entry.actor, "Operatore non disponibile")}
                  </span>
                  <time className="text-muted-foreground sm:ml-auto">
                    {new Date(entry.created_at).toLocaleString("it-IT")}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
