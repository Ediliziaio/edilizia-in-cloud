import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, RefreshCw, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useState } from "react";
import { queryKeys } from "@/lib/queryKeys";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://guqgszwelffntrgtsycm.supabase.co";

export default function FacebookFormsPage() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const [backfillingFormId, setBackfillingFormId] = useState<string | null>(null);

  // Get integration
  const { data: integration } = useQuery({
    queryKey: ["meta-integration-forms", companyId],
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
    queryKey: ["meta-lead-forms", companyId, integration?.id],
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
    queryKey: ["meta-form-lead-counts", companyId],
    queryFn: async () => {
      if (!companyId) return {};
      const { data } = await supabase
        .from("integration_webhook_events")
        .select("id, payload, received_at")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("event_type", "leadgen");
      
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
    queryKey: ["meta-pages", companyId, integration?.id],
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
        body: JSON.stringify({ action: "backfill-leads", formId }),
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
                      <TableCell className="font-medium max-w-[250px] truncate" title={form.form_name}>
                        {form.form_name}
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
