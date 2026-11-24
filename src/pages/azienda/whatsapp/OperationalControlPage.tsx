import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";
import {
  classifyWhatsAppOperationalMessage,
  priorityClass,
  type WhatsAppOperationalIntent,
  type WhatsAppOperationalTriage,
} from "@/lib/whatsappOperationalTriage";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  normalizeWAOperationalSettings,
  useWhatsAppNumbersByPurpose,
  type WANumber,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import CarichiDaRegistrareCard from "./CarichiDaRegistrareCard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppOperationsReview } from "@/components/whatsapp/WhatsAppOperationsReview";
import { usePermissions } from "@/hooks/usePermissions";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

type OrderMini = { order_code?: string | null; description?: string | null };

type OperationalSignal = {
  id: string;
  created_at: string | null;
  descrizione: string;
  tipo_problema: string | null;
  urgenza: string | null;
  stato: string | null;
  order_id: string | null;
  orders?: OrderMini | null;
};

type OperationalReport = {
  id: string;
  created_at: string | null;
  data_lavoro: string;
  descrizione_lavori: string | null;
  ore_lavorate: number | null;
  materiali_usati: unknown;
  foto_urls: string[] | null;
  stato: string;
  approvato: boolean | null;
  order_id: string;
  orders?: OrderMini | null;
};

type OperationalMessage = {
  metadata: Json | null;
  ai_confidence: number | null;
  ai_extracted_data: Json | null;
  ai_intent: string | null;
  cantiere_id: string | null;
  id: string;
  created_at: string | null;
  from_phone: string;
  linked_record_id: string | null;
  linked_record_type: string | null;
  media_storage_path: string | null;
  message_type: string;
  content_text: string | null;
  processing_status: string | null;
  processing_error: string | null;
  wa_number_id: string | null;
};

type TriagedMessage = {
  message: OperationalMessage;
  triage: WhatsAppOperationalTriage;
};

type ToolCall = {
  id: string;
  ts: string | null;
  tool_name: string;
  result_ok: boolean | null;
  result_summary: string | null;
  duration_ms: number | null;
  role_kind: string | null;
};

function isOpenSignal(signal: OperationalSignal) {
  const stato = (signal.stato ?? "").toLowerCase();
  return !["risolto", "chiuso", "archiviato", "resolved", "closed"].includes(stato);
}

function materialCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

type Traduci = ReturnType<typeof useT>;

function relativeDate(value: string | null, t: Traduci) {
  if (!value) return t("data non disponibile");
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateFnsCampo() });
  } catch {
    return t("data non disponibile");
  }
}

function orderLabel(order: OrderMini | null | undefined, t: Traduci) {
  if (!order) return t("Commessa non collegata");
  return [order.order_code, order.description].filter(Boolean).join(" · ") || t("Commessa");
}

function failedResult<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function failureLabel(result: PromiseSettledResult<unknown>, label: string) {
  return result.status === "rejected" ? `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}` : null;
}

const REVIEW_STATUSES = new Set(["failed", "failed_max_retries", "requires_confirmation", "received", "processing"]);

function intentLabel(intent: WhatsAppOperationalIntent, t: Traduci) {
  const labels = {
    rapportino: "Rapportini",
    ddt: "DDT",
    foto_cantiere: "Foto",
    attivita_ufficio: "Attività ufficio",
    presenze: "Presenze",
    segnalazione: "Segnalazioni",
    scontrino: "Scontrini",
    domanda: "Domande",
    conferma: "Conferme",
    annulla: "Annullamenti",
    unknown: "Da smistare",
  } satisfies Record<WhatsAppOperationalIntent, string>;
  return t(labels[intent]);
}

export default function OperationalControlPage() {
  const t = useT();
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const { user, role } = useAuth();
  const { canEditOrders } = usePermissions();
  // Approvare un rapportino: come in commessa (useDecisioneRapportino) e nel database.
  const puoApprovare = !!canEditOrders && (role === "company_admin" || role === "company_staff" || role === "super_admin");
  const queryClient = useQueryClient();
  const numbersQuery = useWhatsAppNumbersByPurpose();
  const operativoNumbers = numbersQuery.byPurpose.bot_operativo ?? [];
  const primaryOperativo = operativoNumbers[0] as WANumber | undefined;
  const operationalSettings = normalizeWAOperationalSettings(primaryOperativo?.operational_settings);
  const operativeNumberIds = operativoNumbers.map((n) => n.id);

  const controlQuery = useQuery({
    queryKey: ["whatsapp-operational-control", companyId, operativeNumberIds.join("|")],
    enabled: !!companyId,
    queryFn: async () => {
      const signalsTask = withClientTimeout(
        supabase
          .from("cantiere_segnalazioni")
          .select("id, created_at, descrizione, tipo_problema, urgenza, stato, order_id, orders(order_code, description)")
          .eq("company_id", companyId!)
          .eq("source", "whatsapp")
          .order("created_at", { ascending: false })
          .limit(30),
        "Regia WhatsApp: segnalazioni",
      ).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as OperationalSignal[];
      });

      const reportsTask = withClientTimeout(
        supabase
          .from("campo_rapportini")
          .select("id, created_at, data_lavoro, descrizione_lavori, ore_lavorate, materiali_usati, foto_urls, stato, approvato, order_id, orders(order_code, description)")
          .eq("company_id", companyId!)
          .eq("source", "whatsapp")
          .order("created_at", { ascending: false })
          .limit(30),
        "Regia WhatsApp: rapportini",
      ).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as OperationalReport[];
      });

      const messagesTask = operativeNumberIds.length === 0
        ? Promise.resolve([] as OperationalMessage[])
        : withClientTimeout(
          supabase
            .from("whatsapp_messages")
            .select("id, metadata, created_at, from_phone, message_type, content_text, processing_status, processing_error, wa_number_id, ai_intent, ai_confidence, ai_extracted_data, linked_record_type, linked_record_id, cantiere_id, media_storage_path")
            .eq("company_id", companyId!)
            .eq("direction", "inbound")
            .in("wa_number_id", operativeNumberIds)
            .order("created_at", { ascending: false })
            .limit(40),
          "Regia WhatsApp: messaggi",
        ).then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as OperationalMessage[];
        });

      const toolsTask = withClientTimeout(
        supabase
          .from("wa_tool_calls")
          .select("id, ts, tool_name, result_ok, result_summary, duration_ms, role_kind")
          .eq("company_id", companyId!)
          .order("ts", { ascending: false })
          .limit(30),
        "Regia WhatsApp: tool AI",
      ).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ToolCall[];
      });

      const [signalsResult, reportsResult, messagesResult, toolsResult] = await Promise.allSettled([
        signalsTask,
        reportsTask,
        messagesTask,
        toolsTask,
      ]);

      return {
        signals: failedResult(signalsResult, [] as OperationalSignal[]),
        reports: failedResult(reportsResult, [] as OperationalReport[]),
        messages: failedResult(messagesResult, [] as OperationalMessage[]),
        tools: failedResult(toolsResult, [] as ToolCall[]),
        failures: [
          failureLabel(signalsResult, t("Segnalazioni")),
          failureLabel(reportsResult, t("Rapportini")),
          failureLabel(messagesResult, t("Messaggi")),
          failureLabel(toolsResult, t("Tool AI")),
        ].filter(Boolean) as string[],
      };
    },
    staleTime: 30_000,
  });

  const resolveSignal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cantiere_segnalazioni")
        .update({ stato: "risolto", resolved_at: new Date().toISOString() })
        .eq("company_id", companyId!)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-operational-control"] });
      toast.success(t("Elemento chiuso"));
    },
    onError: (error: Error) => toast.error(t("Errore chiusura"), { description: error.message }),
  });

  const approveReport = useMutation({
    mutationFn: async (id: string) => {
      // Si approva solo un rapportino inviato (non una bozza del bot né uno respinto), come in commessa.
      const { data: aggiornati, error } = await supabase
        .from("campo_rapportini")
        .update({ stato: "approvato", approvato: true, approvato_at: new Date().toISOString(), approvato_da: user?.id ?? null, pdf_url: null })
        .eq("company_id", companyId!)
        .eq("id", id)
        .eq("stato", "inviato")
        .select("id");
      if (error) throw error;
      if (!aggiornati || aggiornati.length === 0) throw new Error(t("Non approvato: il rapportino non è più da approvare, oppure non hai il permesso."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-operational-control"] });
      toast.success(t("Rapportino approvato"));
    },
    onError: (error: Error) => toast.error(t("Errore approvazione"), { description: error.message }),
  });

  const markMessageReviewed = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc("whatsapp_message_review", { p_company: companyId!, p_message: id });
      if (error) throw error;
      if (data !== true) throw new Error(t("Messaggio ancora in elaborazione o non disponibile. Nessuno stato modificato."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-operational-control"] });
      toast.success(t("Verifica manuale registrata; l’esito originale resta conservato"));
    },
    onError: (error: Error) => toast.error(t("Errore aggiornamento"), { description: error.message }),
  });

  const data = controlQuery.data;
  const openSignals = useMemo(() => (data?.signals ?? []).filter(isOpenSignal), [data?.signals]);
  const reportsToReview = useMemo(
    () => (data?.reports ?? []).filter((r) => r.stato === "inviato"),
    [data?.reports],
  );
  const triagedMessages = useMemo<TriagedMessage[]>(
    () => (data?.messages ?? []).map((message) => ({
      message,
      triage: classifyWhatsAppOperationalMessage(message),
    })),
    [data?.messages],
  );
  const messagesToReview = useMemo(
    () => triagedMessages.filter(({ message, triage }) =>
      (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata) || !message.metadata.manually_reviewed_at) &&
      !(message.linked_record_id && ["campo_acquisti", "prima_nota_entries", "tickets", "mezzi_segnalazioni"].includes(message.linked_record_type ?? "")) &&
      (triage.requiresReview || REVIEW_STATUSES.has(message.processing_status ?? "")),
    ),
    [triagedMessages],
  );
  const intentCounts = useMemo(() => {
    return triagedMessages.reduce<Record<WhatsAppOperationalIntent, number>>((acc, item) => {
      acc[item.triage.intent] += 1;
      return acc;
    }, {
      rapportino: 0,
      ddt: 0,
      foto_cantiere: 0,
      attivita_ufficio: 0,
      presenze: 0,
      segnalazione: 0,
      scontrino: 0,
      domanda: 0,
      conferma: 0,
      annulla: 0,
      unknown: 0,
    });
  }, [triagedMessages]);
  const highPriorityMessages = triagedMessages.filter(({ triage }) => triage.priority === "alta").length;
  const okTools = (data?.tools ?? []).filter((tool) => tool.result_ok).length;
  const toolSuccessRate = data?.tools?.length ? Math.round((okTools / data.tools.length) * 100) : null;
  const pendingCount = openSignals.length + reportsToReview.length + messagesToReview.length;

  return (
    // Da 768 niente margine proprio: lo dà l'hub (prima si sommava a quello
    // della card che conteneva la pagina).
    <div className="space-y-6 p-4 md:p-0">
      {/* Solo «Aggiorna», a destra: il titolo «Regia WhatsApp Operativa» e la
          frase ripetevano la scheda, e «Numeri WhatsApp» apriva la scheda Numeri
          che sta già qui sopra. I due bottoni erano uno sotto l'altro a 1024. */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => controlQuery.refetch()} disabled={controlQuery.isFetching}>
          {controlQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t("Aggiorna")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Clock3} label={t("Da controllare")} value={pendingCount} tone={pendingCount > 0 ? "amber" : "emerald"} />
        <MetricCard icon={AlertTriangle} label={t("Priorità alte")} value={highPriorityMessages + openSignals.length} tone={highPriorityMessages + openSignals.length > 0 ? "amber" : "emerald"} />
        <MetricCard icon={FileText} label={t("Rapportini WhatsApp")} value={data?.reports?.length ?? 0} />
        <MetricCard icon={Bot} label={t("Azioni AI riuscite")} value={toolSuccessRate == null ? "—" : `${toolSuccessRate}%`} tone={toolSuccessRate != null && toolSuccessRate < 85 ? "amber" : "emerald"} />
      </div>

      {data?.failures?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("Alcuni dati non sono stati caricati.")}</p>
              <p className="mt-1 text-xs">{data.failures.join(" · ")}</p>
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("Setup operativo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SetupItem
            ok={!!primaryOperativo}
            title={primaryOperativo ? t("Numero cantieri collegato") : t("Numero cantieri mancante")}
            text={primaryOperativo ? `${primaryOperativo.display_name ?? t("Operativo / Cantieri")} · ${primaryOperativo.numero}` : t("Collega il numero Operativo / Cantieri per far lavorare Silvio su rapportini, DDT e foto.")}
          />
          <SetupItem
            ok={operationalSettings.daily_rapportino_enabled}
            title={operationalSettings.daily_rapportino_enabled ? t("Reminder alle {ora}", { ora: operationalSettings.daily_rapportino_time }) : t("Reminder rapportino spento")}
            text={operationalSettings.daily_rapportino_target === "assigned_workers" ? t("Destinatari: operai assegnati ai cantieri del giorno.") : t("Destinatari: tutti gli operativi.")}
          />
          <SetupItem
            ok={operationalSettings.ddt_requires_confirmation && operationalSettings.media_save_to_diary}
            title={t("DDT e media controllati")}
            text={operationalSettings.ddt_requires_confirmation ? t("I DDT richiedono conferma prima di scrivere dati critici.") : t("Silvio può registrare DDT chiari senza conferma: usare solo se il processo è maturo.")}
          />
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              {t("Centro smistamento operativo")}
            </span>
            <Badge variant="secondary">{t("{n} messaggi letti", { n: triagedMessages.length })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["rapportino", "ddt", "scontrino", "foto_cantiere", "presenze", "segnalazione", "domanda", "conferma", "unknown"] as WhatsAppOperationalIntent[])
              .filter((intent) => intentCounts[intent] > 0 || ["rapportino", "ddt", "foto_cantiere", "segnalazione"].includes(intent))
              .map((intent) => (
                <div key={intent} className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{intentLabel(intent, t)}</p>
                  <p className="mt-1 text-xl font-bold">{intentCounts[intent]}</p>
                </div>
              ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t("Coda prossime azioni")}</p>
                <Badge variant={messagesToReview.length > 0 ? "default" : "outline"}>{t("{n} da gestire", { n: messagesToReview.length })}</Badge>
              </div>
              {controlQuery.isLoading ? <LoadingRows /> : null}
              {!controlQuery.isLoading && messagesToReview.length === 0 ? (
                <EmptyState text={t("Nessun messaggio operativo da smistare: Silvio ha capito e processato tutto.")} />
              ) : null}
              {messagesToReview.slice(0, 6).map(({ message, triage }) => (
                <TriageQueueItem
                  key={message.id}
                  message={message}
                  triage={triage}
                  onOpenLinked={() => {
                    const linkedId = message.cantiere_id || (message.linked_record_type === "orders" ? message.linked_record_id : null);
                    if (linkedId) navigate(`/azienda/ordini/${linkedId}`);
                  }}
                  onOpenAttachment={message.media_storage_path?.startsWith(companyId + "/") ? async () => {
                    const path = message.media_storage_path!;
                    const { data, error } = await supabase.storage.from("whatsapp-media").createSignedUrl(path, 300);
                    if (error || !data?.signedUrl) toast.error(t("Allegato non disponibile"));
                    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                  } : undefined}
                  onMarkDone={() => markMessageReviewed.mutate(message.id)}
                  marking={markMessageReviewed.isPending}
                />
              ))}
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">{t("Regole attive")}</p>
              <div className="mt-3 space-y-3 text-xs text-muted-foreground">
                <RoutingRule label={t("Rapportini")} text={t("audio/testo di fine giornata -> rapportino da approvare.")} />
                <RoutingRule label="DDT" text={t("Originale in Documenti in ingresso, lettura delle righe in background.")} />
                <RoutingRule label={t("Scontrini")} text={t("Foto archiviata. Chi ha pagato e commessa determinano la pratica da verificare.")} />
                <RoutingRule label={t("Foto")} text={t("immagini cantiere -> diario commessa se il cantiere è chiaro.")} />
                <RoutingRule label={t("Sicurezza")} text={t("incidenti o rischi -> priorità alta e escalation.")} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t("Da confermare")}
              </span>
              <Badge variant="secondary">{openSignals.length + messagesToReview.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {controlQuery.isLoading ? <LoadingRows /> : null}
            {!controlQuery.isLoading && openSignals.length === 0 && messagesToReview.length === 0 ? (
              <EmptyState text={t("Nessun DDT, alert o messaggio operativo da confermare.")} />
            ) : null}
            {openSignals.slice(0, 6).map((signal) => (
              <div key={signal.id} className="rounded-xl border bg-background p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{signal.tipo_problema ?? t("segnalazione")}</Badge>
                      <span className="text-xs text-muted-foreground">{relativeDate(signal.created_at, t)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm font-medium text-foreground">{signal.descrizione}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{orderLabel(signal.orders, t)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {signal.order_id ? (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/ordini/${signal.order_id}`)}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        {t("Apri")}
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => resolveSignal.mutate(signal.id)} disabled={resolveSignal.isPending}>
                      {t("Chiudi")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {messagesToReview.slice(0, 4).map(({ message, triage }) => (
              <div key={message.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-start gap-3">
                  <MessageSquare className="mt-1 h-4 w-4 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{triage.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{message.from_phone} · {relativeDate(message.created_at, t)}</p>
                    <p className="mt-2 line-clamp-2 text-sm">{message.processing_error || triage.summary || t("Messaggio senza testo")}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t("Rapportini via WhatsApp")}
              </span>
              <Badge variant="secondary">{t("{n} da review", { n: reportsToReview.length })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {controlQuery.isLoading ? <LoadingRows /> : null}
            {!controlQuery.isLoading && reportsToReview.length === 0 ? (
              <EmptyState text={t("Nessun rapportino WhatsApp in attesa di approvazione.")} />
            ) : null}
            {reportsToReview.slice(0, 7).map((report) => (
              <div key={report.id} className="rounded-xl border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{orderLabel(report.orders, t)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("{data} · {ore}h · {materiali} materiali · {foto} foto", { data: report.data_lavoro, ore: report.ore_lavorate ?? "—", materiali: materialCount(report.materiali_usati), foto: report.foto_urls?.length ?? 0 })}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {report.descrizione_lavori || t("Rapportino senza descrizione")}
                    </p>
                  </div>
                  {puoApprovare ? <Button size="sm" onClick={() => approveReport.mutate(report.id)} disabled={approveReport.isPending}>
                    {t("Approva")}
                  </Button> : <span className="text-xs text-muted-foreground">{t("Lo approva chi ha «Modifica commesse»")}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <CarichiDaRegistrareCard companyId={companyId} />
      <WhatsAppOperationsReview companyId={companyId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            {t("Telemetria Silvio")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.tools ?? []).length === 0 ? (
            <EmptyState text={t("Nessuna azione AI registrata per ora.")} />
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(data?.tools ?? []).slice(0, 9).map((tool) => (
                <div key={tool.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{tool.tool_name}</p>
                    <Badge variant={tool.result_ok ? "outline" : "destructive"}>
                      {tool.result_ok ? t("ok") : t("errore")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeDate(tool.ts, t)} · {tool.duration_ms ?? 0}ms · {tool.role_kind ?? t("ruolo n/d")}
                  </p>
                  {tool.result_summary ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{tool.result_summary}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TriageQueueItem({
  message,
  triage,
  onOpenLinked,
  onOpenAttachment,
  onMarkDone,
  marking,
}: {
  message: OperationalMessage;
  triage: WhatsAppOperationalTriage;
  onOpenLinked: () => void;
  onOpenAttachment?: () => void;
  onMarkDone: () => void;
  marking: boolean;
}) {
  const t = useT();
  const hasLinkedOrder = !!message.cantiere_id || (message.linked_record_type === "orders" && !!message.linked_record_id);
  return (
    <div className={`rounded-xl border p-3 ${priorityClass(triage.priority)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{triage.title}</Badge>
            <Badge variant="outline">{Math.round(triage.confidence * 100)}%</Badge>
            <span className="text-xs text-muted-foreground">{relativeDate(message.created_at, t)}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{triage.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {message.from_phone} · {triage.route} · {message.processing_status ?? t("stato n/d")}
          </p>
          <p className="mt-2 text-xs font-medium">{triage.suggestedAction}</p>
          {triage.signals.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{t("Segnali: {elenco}", { elenco: triage.signals.slice(0, 4).join(", ") })}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onOpenAttachment && (
            <Button size="sm" variant="outline" onClick={onOpenAttachment}>
              <FileText className="mr-1 h-3.5 w-3.5" />{t("Apri allegato")}
            </Button>
          )}
          {hasLinkedOrder ? (
            <Button size="sm" variant="outline" onClick={onOpenLinked}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              {t("Apri")}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onMarkDone} disabled={marking || ["received", "processing"].includes(message.processing_status ?? "")}>
            {t("Ho verificato")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoutingRule({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 leading-relaxed">{text}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "emerald";
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-lg p-2 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SetupItem({ ok, title, text }: { ok: boolean; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
