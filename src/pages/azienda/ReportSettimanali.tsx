/**
 * ReportSettimanali — MP-OPS-01 v2
 *
 * Dashboard azienda: visualizza tutti i reportini settimanali generati per la
 * company, con filtri (cantiere, stato delivery, periodo) e pulsante per
 * rigenerare on-demand.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { CheckCircle, Download, ExternalLink, FileText, Mail, MessageSquare, RefreshCw, Search, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  cantiere_id: string;
  customer_id: string | null;
  week_start: string;
  week_end: string;
  pdf_storage_path: string | null;
  ai_persona_used: string | null;
  ai_cost_billed_eur: number | null;
  trigger_source: "cron" | "conversation" | "manual_ui";
  triggered_by_persona: string | null;
  email_sent_at: string | null;
  whatsapp_sent_at: string | null;
  customer_responded: boolean;
  status: "pending" | "generating" | "generated" | "delivered" | "failed";
  error_message: string | null;
  created_at: string;
  cantiere?: {
    order_code: string | null;
    customer?: { first_name?: string | null; last_name?: string | null } | null;
  } | null;
}

function customerLabel(c: ReportRow["cantiere"] extends infer X ? X extends { customer?: infer C } ? C : never : never): string {
  if (!c) return "Cliente";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Cliente";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "In coda",
  generating: "In generazione",
  generated: "Generato",
  delivered: "Consegnato",
  failed: "Fallito",
};

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  pending: "outline",
  generating: "outline",
  generated: "secondary",
  delivered: "default",
  failed: "destructive",
};

export default function ReportSettimanali() {
  const companyId = useEffectiveCompanyId();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_weekly_reports" as never)
        .select(`id, cantiere_id, customer_id, week_start, week_end, pdf_storage_path,
                 ai_persona_used, ai_cost_billed_eur, trigger_source, triggered_by_persona,
                 email_sent_at, whatsapp_sent_at, customer_responded, status, error_message, created_at,
                 cantiere:orders(order_code, customer:profiles!orders_customer_id_fkey(first_name, last_name))`)
        .eq("company_id", companyId!)
        .order("week_start", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      setReports(((data ?? []) as unknown) as ReportRow[]);
    } catch (e) {
      toast.error(`Errore caricamento report: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const { data } = await supabase.storage
        .from("customer-reports")
        .createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener");
      } else {
        toast.error("Link signed non disponibile");
      }
    } catch (e) {
      toast.error(`Errore download: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRegenerate = async (cantiereId: string, weekStart: string) => {
    setRegeneratingId(cantiereId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-customer-report-async", {
        body: {
          cantiere_id: cantiereId,
          week_start: weekStart,
          company_id: companyId,
          send_email: true,
          send_whatsapp: true,
          triggered_by_persona: "manual_ui",
        },
      });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      toast.success("Reportino rigenerato e inviato");
      void loadReports();
    } catch (e) {
      toast.error(`Errore rigenerazione: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter((r) => {
      const code = r.cantiere?.order_code?.toLowerCase() ?? "";
      const customer = customerLabel(r.cantiere?.customer ?? null).toLowerCase();
      return code.includes(q) || customer.includes(q);
    });
  }, [reports, search]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Reportini settimanali committente
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Report PDF inviati automaticamente ogni venerdì 17:00 ai committenti dei cantieri attivi.
          Puoi anche dire a Silvio: <em>"Manda il reportino al cliente del cantiere via Roma 12"</em>.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filtra per cantiere o cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "Nessun report trovato" : "Nessun reportino generato per ora"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {r.cantiere?.order_code ?? "Cantiere"}{" "}
                      <span className="text-muted-foreground font-normal">·{" "}
                        {customerLabel(r.cantiere?.customer ?? null)}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Settimana {r.week_start} → {r.week_end} · Persona:{" "}
                      <code className="bg-muted px-1 text-[11px]">
                        {r.triggered_by_persona ?? r.ai_persona_used ?? "—"}
                      </code>
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {r.email_sent_at
                      ? <CheckCircle className="h-3 w-3 text-green-600" />
                      : <XCircle className="h-3 w-3 text-muted-foreground" />}
                    Email
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {r.whatsapp_sent_at
                      ? <CheckCircle className="h-3 w-3 text-green-600" />
                      : <XCircle className="h-3 w-3 text-muted-foreground" />}
                    WhatsApp
                  </span>
                  {r.ai_cost_billed_eur && (
                    <span>Costo AI: €{Number(r.ai_cost_billed_eur).toFixed(4)}</span>
                  )}
                  <span>Trigger: {r.trigger_source}</span>
                </div>

                {r.error_message && (
                  <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                    {r.error_message}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {r.pdf_storage_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(r.pdf_storage_path!)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Apri report
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRegenerate(r.cantiere_id, r.week_start)}
                    disabled={regeneratingId === r.cantiere_id}
                  >
                    <RefreshCw className={`mr-1 h-3 w-3 ${regeneratingId === r.cantiere_id ? "animate-spin" : ""}`} />
                    Rigenera e invia
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
