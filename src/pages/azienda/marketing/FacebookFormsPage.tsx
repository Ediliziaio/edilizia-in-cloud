import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertTriangle, Copy, Check, ShieldCheck, ExternalLink, Activity, CheckCircle2, XCircle, Clock, Loader2, Inbox, Facebook } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { queryKeys } from "@/lib/queryKeys";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import { RientroLeadCard } from "@/components/integrations/RientroLeadCard";
import type { Integration } from "@/types/integrations";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Impostazioni → Lead Facebook e Instagram: i moduli dei tuoi annunci, quanti contatti sono arrivati, importare quelli
 * passati. La pagina LEGGE da Meta e scrive solo nel CRM: gli annunci e i moduli contatto di Meta non si toccano mai.
 *
 * `comeAdmin`: la stessa pagina è montata nel pannello super admin (`AdminFacebookForms`), dove non c'è la testata
 * delle Impostazioni: lì tiene il suo titolo e la lista di controllo per la revisione dell'app Meta, che serve a chi
 * sviluppa l'app e non al cliente.
 */
export default function FacebookFormsPage({ comeAdmin = false }: { comeAdmin?: boolean }) {
  const { effectiveCompany, role } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  // La pagina si apre con «Integrazioni» (route in companyRoutes.tsx), ma
  // gestiva i moduli lead solo per il ruolo admin: il database (migration
  // 20280921153700, «Permesso integrazioni») accetta da tempo anche chi ha
  // «Modifica» su Integrazioni — qui restava un permesso morto (21/09/2026).
  const canManageMeta = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [metaConfigMissing, setMetaConfigMissing] = useState(false);
  const [backfillingFormId, setBackfillingFormId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // M10 — App Review checklist (solo pannello admin)
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewChecked, setReviewChecked] = useState<Record<string, boolean>>({});

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const checkMetaCredentials = async (): Promise<boolean> => {
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .eq("key", "meta_app_id")
        .maybeSingle();
      if (!data?.value) {
        setMetaConfigMissing(true);
        toast.error("L'integrazione Meta non è ancora configurata dall'amministratore della piattaforma.");
        return false;
      }
      setMetaConfigMissing(false);
      return true;
    } catch {
      return true;
    }
  };

  const handleMetaConnect = async () => {
    if (!canManageMeta) {
      toast.error("Per collegare Meta serve il permesso «Integrazioni & Canali» in modifica (o essere amministratore).");
      return;
    }
    const ok = await checkMetaCredentials();
    if (ok) setWizardOpen(true);
  };

  // Get integration
  const { data: integration, refetch: refetchIntegration } = useQuery({
    queryKey: queryKeys.metaForms.integration(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .maybeSingle();
      return (data || null) as Integration | null;
    },
    enabled: !!companyId,
  });

  const handleWizardComplete = () => {
    refetchIntegration();
    queryClient.invalidateQueries({ queryKey: queryKeys.metaForms.all });
    setWizardOpen(false);
  };

  // Get forms
  const { data: forms = [], isLoading } = useQuery({
    queryKey: queryKeys.metaForms.forms(companyId, integration?.id),
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data } = await supabase
        .from("meta_lead_forms")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("form_name");
      return data || [];
    },
    enabled: !!companyId && !!integration?.id,
  });

  // Quanti contatti ha portato ogni modulo, e quando è arrivato l'ultimo. Una richiesta piccola per modulo (un
  // conteggio esatto e la data più recente) invece di scaricare tutti gli eventi con il loro contenuto: una risposta si
  // ferma a 1.000 righe e un'azienda ne ha 1.726, quindi i totali erano troppo bassi e la pagina pesante.
  const formIds = useMemo(() => forms.map((f: any) => String(f.form_id)), [forms]);
  const { data: leadCounts = {}, isError: leadCountsError } = useQuery({
    queryKey: [...queryKeys.metaForms.leadCounts(companyId), "per-modulo", formIds],
    queryFn: async () => {
      const coppie = await Promise.all(
        formIds.map(async (formId) => {
          const totale = await supabase
            .from("integration_webhook_events")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("provider", "meta")
            .eq("event_type", "leadgen")
            .eq("status", "processed")
            .eq("payload->>form_id", formId);
          const ultimo = await supabase
            .from("integration_webhook_events")
            .select("received_at")
            .eq("company_id", companyId)
            .eq("provider", "meta")
            .eq("event_type", "leadgen")
            .eq("status", "processed")
            .eq("payload->>form_id", formId)
            .order("received_at", { ascending: false })
            .limit(1);
          if (totale.error) throw totale.error;
          if (ultimo.error) throw ultimo.error;
          return [formId, { total: totale.count ?? 0, lastAt: (ultimo.data?.[0]?.received_at as string | undefined) ?? null }] as const;
        }),
      );
      return Object.fromEntries(coppie) as Record<string, { total: number; lastAt: string | null }>;
    },
    enabled: !!companyId && formIds.length > 0,
  });

  // Get pages for name lookup
  const { data: pages = [] } = useQuery({
    queryKey: queryKeys.metaForms.pages(companyId, integration?.id),
    queryFn: async () => {
      if (!companyId || !integration?.id) return [];
      const { data } = await supabase
        .from("meta_assets")
        .select("id, asset_id, asset_name")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .eq("asset_type", "page");
      return data || [];
    },
    enabled: !!companyId && !!integration?.id,
  });

  // Ricezione dei contatti: l'ultimo contatto arrivato da Meta e quanti negli ultimi 7 giorni (solo contatti già
  // entrati nel CRM, gli stessi che si contano per modulo).
  const { data: webhookHealth } = useQuery({
    queryKey: [...queryKeys.metaForms.leadCounts(companyId), "health"],
    queryFn: async () => {
      if (!companyId) return null;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, count } = await supabase
        .from("integration_webhook_events")
        .select("id, received_at, status", { count: "exact" })
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("event_type", "leadgen")
        .eq("status", "processed")
        .gte("received_at", sevenDaysAgo)
        .order("received_at", { ascending: false })
        .limit(1);
      const lastEvent = data?.[0] || null;
      const recentCount = count ?? 0;
      // Health determination: >0 events in 7d = healthy; no events = unknown; last event >48h = warn
      const hoursSinceLast = lastEvent
        ? (Date.now() - new Date(lastEvent.received_at).getTime()) / 3600000
        : null;
      const health: "healthy" | "warn" | "unknown" =
        !lastEvent ? "unknown" :
        hoursSinceLast !== null && hoursSinceLast > 48 ? "warn" : "healthy";
      return { lastEvent, recentCount, hoursSinceLast, health };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const getPageName = (pageAssetId: string | null) => {
    if (!pageAssetId) return "—";
    const page = pages.find((p) => p.id === pageAssetId);
    return page?.asset_name || "Pagina sconosciuta";
  };

  const handleBackfill = async (formId: string) => {
    // Importare i contatti passati scrive nel CRM: lo fa chi gestisce le integrazioni (il pulsante è spento per gli altri).
    if (!canManageMeta) {
      toast.error("Per importare i contatti passati serve il permesso «Integrazioni & Canali» in modifica (o essere amministratore).");
      return;
    }
    setBackfillingFormId(formId);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error("Sessione scaduta, ricarica la pagina");
      if (!integration?.id) throw new Error("Integrazione non trovata");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-api-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "backfill-leads",
          form_id: formId,
          company_id: companyId,
          integration_id: integration.id,
        }),
      });
      if (!res.ok) {
        let msg = `Meta non ha risposto (errore ${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* no-op */ }
        throw new Error(msg);
      }
      toast.success("Importazione avviata", {
        description: "I contatti passati arrivano nei prossimi minuti: ricarica la pagina tra un paio di minuti.",
      });
    } catch (err) {
      toast.error("Importazione non riuscita", {
        description: userErrorMessage(err, "Riprova tra poco."),
      });
    } finally {
      setBackfillingFormId(null);
    }
  };

  if (!integration) {
    return (
      <div className="space-y-5">
        {comeAdmin && (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Facebook className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Moduli Lead Ads</h1>
              <p className="text-sm text-muted-foreground">
                Gestione lead generation Facebook/Instagram
              </p>
            </div>
          </div>
        )}
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Facebook e Instagram non sono collegati</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Per ricevere i contatti dai moduli dei tuoi annunci devi prima collegare il tuo account Meta da questa pagina.
            </p>
            <Button onClick={handleMetaConnect} disabled={!canManageMeta}>
              Configura Meta
            </Button>
            {!canManageMeta && (
              <p className="mt-3 text-xs text-muted-foreground">
                Per collegare Meta serve il permesso «Integrazioni &amp; Canali» in modifica (o essere amministratore).
              </p>
            )}
          </CardContent>
        </Card>
        {metaConfigMissing && (
          <Alert variant="destructive" className="max-w-xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configurazione Meta mancante</AlertTitle>
            <AlertDescription>
              L'integrazione Meta non è ancora configurata dall'amministratore della piattaforma. Contatta il supporto per abilitare App ID e credenziali.
            </AlertDescription>
          </Alert>
        )}
        <MetaIntegrationWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          integration={null}
          onComplete={handleWizardComplete}
        />
      </div>
    );
  }

  const activeFormsCount = forms.filter((f: any) => f.status === "active").length;

  return (
    <div className="space-y-5">
      {/* Riepilogo. Il titolo della pagina lo mette già la testata delle Impostazioni (un solo h1): lo scrive da sé
          solo il pannello admin, che non ha la testata. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {comeAdmin && (
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Facebook className="h-5 w-5 text-blue-600" />
            </div>
          )}
          <div>
            {comeAdmin && <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Moduli Lead Ads</h1>}
            <p className="text-sm text-muted-foreground">
              {forms.length === 0
                ? "Nessun modulo collegato"
                : <>
                  <span className="font-medium text-foreground">{activeFormsCount}</span> attivi
                  <span className="text-muted-foreground"> su {forms.length}</span>
                  {webhookHealth && (
                    <> · <span className="font-medium text-foreground">{webhookHealth.recentCount}</span> contatti negli ultimi 7 giorni</>
                  )}
                </>
              }
            </p>
          </div>
        </div>
      </div>

      {/* Ricezione dei contatti — border-l-4 dinamico per stato */}
      {webhookHealth && (
        <Card className={cn(
          "overflow-hidden border-l-4 transition-colors",
          webhookHealth.health === "healthy" ? "border-l-emerald-500"
          : webhookHealth.health === "warn" ? "border-l-amber-500"
          : "border-l-slate-300"
        )}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-medium">Ricezione dei contatti</h2>
              {webhookHealth.health === "healthy" && (
                <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Attiva
                </Badge>
              )}
              {webhookHealth.health === "warn" && (
                <Badge variant="outline" className="ml-auto gap-1 border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                  <Clock className="h-3 w-3" /> Nessun contatto da più di 48 ore
                </Badge>
              )}
              {webhookHealth.health === "unknown" && (
                <Badge variant="outline" className="ml-auto gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" /> Nessun contatto ricevuto
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-6 text-sm flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ultimi 7 giorni</p>
                <p className="text-lg font-bold tabular-nums">{webhookHealth.recentCount} <span className="text-xs font-normal text-muted-foreground">contatt{webhookHealth.recentCount === 1 ? "o" : "i"}</span></p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ultimo contatto</p>
                <p className="text-sm font-semibold tabular-nums">
                  {webhookHealth.lastEvent
                    ? format(parseISO(webhookHealth.lastEvent.received_at), "dd MMM HH:mm", { locale: it })
                    : "—"}
                </p>
                {webhookHealth.hoursSinceLast !== null && webhookHealth.hoursSinceLast < 48 && (
                  <p className="text-[10px] text-muted-foreground">
                    {webhookHealth.hoursSinceLast < 1
                      ? `${Math.round(webhookHealth.hoursSinceLast * 60)} min fa`
                      : `${Math.round(webhookHealth.hoursSinceLast)} ore fa`}
                  </p>
                )}
              </div>
              {(webhookHealth.health === "warn" || webhookHealth.health === "unknown") && (
                <div className="flex-1 text-xs self-center rounded px-3 py-2 border bg-muted/40 text-muted-foreground">
                  {comeAdmin ? (
                    "Se ti aspettavi dei contatti, controlla il collegamento con Meta."
                  ) : (
                    <>
                      Se ti aspettavi dei contatti, apri{" "}
                      <Link to="/azienda/impostazioni/integrazioni" className="text-primary underline">
                        Integrazioni → Facebook e Instagram → Risolvi problemi
                      </Link>.
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold leading-none tracking-tight">Moduli collegati</h2>
          <p className="text-sm text-muted-foreground">
            {forms.length} modul{forms.length === 1 ? "o" : "i"} collegat{forms.length === 1 ? "o" : "i"}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-10">
              <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Nessun modulo dei tuoi annunci è collegato</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Completa il collegamento con Meta scegliendo almeno una pagina:
                i moduli arrivano poi da soli.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleMetaConnect}
                disabled={!canManageMeta}
              >
                Configura integrazione Meta
              </Button>
            </div>
          ) : (
            // Da telefono ogni modulo è una scheda (la tabella con sei colonne usciva dallo schermo e il numero dei
            // contatti e il pulsante restavano fuori); da 768 px in su è la tabella di sempre.
            <Table className="block md:table">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Modulo</TableHead>
                  <TableHead>Pagina</TableHead>
                  <TableHead className="text-center">Stato</TableHead>
                  <TableHead className="text-right">Contatti ricevuti</TableHead>
                  <TableHead>Ultimo contatto</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block md:table-row-group">
                {forms.map((form: any) => {
                  const counts = leadCounts[String(form.form_id)];
                  return (
                    <TableRow key={form.id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 p-3 md:table-row md:p-0">
                      <TableCell className="col-span-2 min-w-0 p-0 font-medium md:max-w-[240px] md:p-4">
                        <p className="truncate" title={form.form_name}>{form.form_name}</p>
                        {/* Il codice che Meta dà al modulo serve a chi lo cerca in Meta: sta chiuso. */}
                        <details className="mt-0.5 text-xs font-normal text-muted-foreground">
                          <summary className="cursor-pointer">Codice del modulo in Meta</summary>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="font-mono">{form.form_id}</span>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors"
                              onClick={() => handleCopyId(form.form_id)}
                              aria-label={`Copia il codice del modulo ${form.form_name}`}
                              title="Copia il codice"
                            >
                              {copiedId === form.form_id
                                ? <Check className="h-3 w-3 text-emerald-500" />
                                : <Copy className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          </div>
                        </details>
                      </TableCell>
                      <TableCell className="p-0 text-sm text-muted-foreground md:p-4">
                        {getPageName(form.page_asset_id)}
                      </TableCell>
                      <TableCell className="p-0 text-right md:p-4 md:text-center">
                        <Badge variant={form.status === "active" ? "default" : "secondary"}>
                          {form.status === "active" ? "Attivo" : "Inattivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-0 font-semibold md:p-4 md:text-right">
                        <span className="mr-1 text-xs font-normal text-muted-foreground md:hidden">Contatti ricevuti:</span>{leadCountsError ? "–" : counts?.total || 0}
                      </TableCell>
                      <TableCell className="p-0 text-right text-sm text-muted-foreground md:p-4 md:text-left">
                        <span className="mr-1 text-xs md:hidden">Ultimo:</span>{counts?.lastAt
                          ? format(parseISO(counts.lastAt), "dd/MM/yyyy HH:mm", { locale: it })
                          : "—"}
                      </TableCell>
                      <TableCell className="col-span-2 p-0 md:p-4 md:text-right">
                        <div className="flex items-center gap-1 md:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11 w-full text-xs md:h-9 md:w-auto"
                            onClick={() => handleBackfill(form.form_id)}
                            disabled={!canManageMeta || !!backfillingFormId}
                            title={canManageMeta ? "Porta nel CRM i contatti che questo modulo ha già raccolto" : "Serve il permesso «Integrazioni & Canali» in modifica"}
                          >
                            {backfillingFormId === form.form_id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            )}
                            Importa i contatti passati
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {leadCountsError && (
            <p className="mt-2 text-xs text-muted-foreground">Non riesco a contare i contatti di ogni modulo: ricarica la pagina tra poco.</p>
          )}
        </CardContent>
      </Card>

      {/* Lead che rientrano dopo una chiusura: impostazione dell'integrazione Meta. Sta sotto l'elenco dei moduli
          (è la cosa che si guarda di più) e si apre da sola solo se è già attiva. */}
      <RientroLeadCard
        key={`${integration.rientro_lead_modo ?? "off"}:${integration.rientro_lead_giorni ?? 90}`}
        integration={integration}
        canManage={canManageMeta}
      />

      {/* Lista di controllo per la revisione dell'app Meta: serve a chi sviluppa l'app, non al cliente. Solo admin. */}
      {comeAdmin && !reviewDismissed && (() => {
        const CHECKLIST = [
          { id: "privacy_policy", label: "Privacy Policy pubblica raggiungibile da URL", required: true },
          { id: "lead_ads_tos", label: "Accettazione Lead Ads Terms of Service in Business Manager", required: true },
          { id: "dati_campi", label: "Campi del modulo configurati correttamente (nome, email, tel)", required: true },
          { id: "webhook_url", label: "Webhook URL verificato in Meta Developer Console", required: true },
          { id: "test_lead", label: "Test lead inviato e ricevuto con successo", required: false },
          { id: "cta_form", label: "CTA del modulo chiara e conforme alle policy Meta", required: false },
          { id: "disclaimer", label: "Disclaimer GDPR presente nel modulo lead", required: true },
        ];
        const checkedCount = Object.values(reviewChecked).filter(Boolean).length;
        const requiredChecklist = CHECKLIST.filter((c) => c.required);
        const allRequiredDone = requiredChecklist.every((c) => reviewChecked[c.id]);
        return (
          <Alert className="border-blue-200 bg-blue-50">
            <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <AlertTitle className="text-blue-800">Meta App Review — Checklist</AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="text-xs text-blue-700 mb-3">
                    Per evitare blocchi all'app in fase di review Meta, verifica questi requisiti prima di andare in produzione.
                  </p>
                  <div className="space-y-2">
                    {CHECKLIST.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`review-${item.id}`}
                          checked={!!reviewChecked[item.id]}
                          onCheckedChange={(v) => setReviewChecked((prev) => ({ ...prev, [item.id]: !!v }))}
                          className="mt-0.5 shrink-0"
                        />
                        <label htmlFor={`review-${item.id}`} className="text-xs text-blue-800 cursor-pointer leading-relaxed">
                          {item.label}
                          {item.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-blue-200">
                    <div className="text-xs text-blue-700">
                      {checkedCount}/{CHECKLIST.length} completati
                      {allRequiredDone && (
                        <span className="ml-2 text-green-700 font-medium">✓ Tutti i requisiti richiesti soddisfatti</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <a
                        href="https://developers.facebook.com/docs/graph-api/overview/access-levels"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        Guida Meta <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:text-blue-800" onClick={() => setReviewDismissed(true)}>
                        Chiudi
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        );
      })()}

      {metaConfigMissing && (
        <Alert variant="destructive" className="max-w-xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configurazione Meta mancante</AlertTitle>
          <AlertDescription>
            L'integrazione Meta non è ancora configurata dall'amministratore della piattaforma. Contatta il supporto per abilitare App ID e credenziali.
          </AlertDescription>
        </Alert>
      )}
      <MetaIntegrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        integration={integration || null}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
