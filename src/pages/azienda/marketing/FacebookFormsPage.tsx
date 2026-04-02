import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, RefreshCw, AlertTriangle, Copy, Check, ShieldCheck, ExternalLink, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useState } from "react";
import { queryKeys } from "@/lib/queryKeys";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rsbrguhkodgnqfomrevo.supabase.co";

export default function FacebookFormsPage() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const [backfillingFormId, setBackfillingFormId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // M10 — App Review checklist
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewChecked, setReviewChecked] = useState<Record<string, boolean>>({});

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Get integration
  const { data: integration } = useQuery({
    queryKey: queryKeys.metaForms.integration(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

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

  // Get lead counts per form from webhook events
  const { data: leadCounts = {} } = useQuery({
    queryKey: queryKeys.metaForms.leadCounts(companyId),
    queryFn: async () => {
      if (!companyId) return {};
      const { data } = await supabase
        .from("integration_webhook_events")
        .select("id, payload, received_at")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("event_type", "leadgen")
        .eq("status", "processed");
      
      const counts: Record<string, { total: number; lastAt: string | null }> = {};
      for (const ev of data || []) {
        const formId = (ev.payload as any)?.form_id;
        if (!formId) continue;
        if (!counts[formId]) counts[formId] = { total: 0, lastAt: null };
        counts[formId].total++;
        if (!counts[formId].lastAt || ev.received_at > counts[formId].lastAt!) {
          counts[formId].lastAt = ev.received_at;
        }
      }
      return counts;
    },
    enabled: !!companyId,
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

  // Webhook health: last event + count in last 7 days
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
    setBackfillingFormId(formId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-api-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "backfill-leads", form_id: formId, company_id: companyId, integration_id: integration?.id }),
      });
      if (!res.ok) throw new Error("Backfill failed");
      toast.success("Backfill avviato", { description: "I lead storici verranno importati a breve." });
    } catch (err: any) {
      toast.error("Errore durante il backfill", { description: err.message });
    } finally {
      setBackfillingFormId(null);
    }
  };

  if (!integration) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Moduli Lead Ads</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Integrazione Meta non connessa. Vai in Impostazioni → Integrazioni per connettere il tuo account Meta.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moduli Lead Ads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestisci i moduli di lead generation di Facebook collegati al tuo account.
          </p>
        </div>
      </div>

      {/* Webhook health status */}
      {webhookHealth && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Stato Webhook Meta</CardTitle>
              {webhookHealth.health === "healthy" && (
                <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Attivo
                </span>
              )}
              {webhookHealth.health === "warn" && (
                <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <Clock className="h-3.5 w-3.5" /> Nessun evento recente
                </span>
              )}
              {webhookHealth.health === "unknown" && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Nessun evento ricevuto
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Ultimi 7 giorni</p>
                <p className="font-semibold">{webhookHealth.recentCount} eventi</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Ultimo evento ricevuto</p>
                <p className="font-semibold">
                  {webhookHealth.lastEvent
                    ? format(parseISO(webhookHealth.lastEvent.received_at), "dd/MM/yyyy HH:mm", { locale: it })
                    : "—"}
                </p>
              </div>
              {webhookHealth.health === "warn" && (
                <div className="text-amber-600 text-xs self-center">
                  Verifica che il webhook sia correttamente configurato in Meta Business Manager.
                </div>
              )}
              {webhookHealth.health === "unknown" && (
                <div className="text-muted-foreground text-xs self-center">
                  Nessun lead ricevuto negli ultimi 7 giorni. Il webhook potrebbe non essere attivo.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* M10 — Meta App Review Banner */}
      {!reviewDismissed && (() => {
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

      <Card>
        <CardHeader>
          <CardTitle>Moduli attivi</CardTitle>
          <CardDescription>
            {forms.length} modul{forms.length === 1 ? "o" : "i"} collegat{forms.length === 1 ? "o" : "i"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nessun modulo Lead Ads trovato. Completa la configurazione dell'integrazione Meta per importare i moduli.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome modulo</TableHead>
                  <TableHead>Form ID</TableHead>
                  <TableHead>Pagina</TableHead>
                  <TableHead className="text-center">Stato</TableHead>
                  <TableHead className="text-right">Lead totali</TableHead>
                  <TableHead>Ultimo lead</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form: any) => {
                  const counts = leadCounts[form.form_id];
                  return (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={form.form_name}>
                        {form.form_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-muted-foreground">{form.form_id}</span>
                          <button
                            type="button"
                            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
                            onClick={() => handleCopyId(form.form_id)}
                            title="Copia Form ID"
                          >
                            {copiedId === form.form_id
                              ? <Check className="h-3 w-3 text-emerald-500" />
                              : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getPageName(form.page_asset_id)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={form.status === "active" ? "default" : "secondary"}>
                          {form.status === "active" ? "Attivo" : "Inattivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {counts?.total || 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {counts?.lastAt
                          ? format(parseISO(counts.lastAt), "dd/MM/yyyy HH:mm", { locale: it })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleBackfill(form.form_id)}
                            disabled={backfillingFormId === form.form_id}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${backfillingFormId === form.form_id ? "animate-spin" : ""}`} />
                            Backfill
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
