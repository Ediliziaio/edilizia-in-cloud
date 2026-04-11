/**
 * AttivitaStaff — pagina unificata per i dipendenti ufficio (role: company_staff).
 * Accessibile da /azienda/attivita
 *
 * Tab:
 *  1. Attività     — saluto + timbratura sede + task assegnate
 *  2. Timbrature   — storico timbrature personali
 *  3. Ferie        — saldo ferie/permessi e richieste
 *  4. Cedolini     — lista cedolini con download PDF
 */
import { lazy, Suspense, useState } from "react";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock,
  ClipboardCheck,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  LogOut,
  CheckCircle,
  Loader2,
  ExternalLink,
  Palmtree,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { logger } from "@/utils/logger";

// Lazy load delle sotto-pagine
const TimbraturePersonali = lazy(() => import("@/pages/azienda/TimbraturePersonali"));
const FeriePersonali = lazy(() => import("@/pages/azienda/FeriePersonali"));
const CedoliniPersonali = lazy(() => import("@/pages/azienda/CedoliniPersonali"));

// ─────────────────────────────────────────────────────────────────────────────
// Costanti priorità
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  urgente: { label: "Urgente", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  alta:    { label: "Alta",    dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  normale: { label: "Normale", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  bassa:   { label: "Bassa",   dotClass: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Blocco 1 — Header
// ─────────────────────────────────────────────────────────────────────────────
function AttivitaHeader() {
  const { profile } = useAuth();
  const oggi = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div>
      <p className="text-muted-foreground text-sm capitalize">{oggi}</p>
      <h1 className="text-2xl font-bold">
        {saluto}, {profile?.first_name ?? ""}
      </h1>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocco 2 — TimbraturaSede
// ─────────────────────────────────────────────────────────────────────────────
function TimbraturaSede() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Recupera profilo HR del dipendente corrente
  const { data: profilo, isLoading: loadingProfilo } = useQuery({
    queryKey: ["hr-my-profilo", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id)
        .eq("attivo", true)
        .maybeSingle();
      if (error) {
        logger.error("TimbraturaSede — errore fetch profilo HR:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Timbrature di oggi
  const { data: timbratureOggi = [], isLoading: loadingTimbrature } = useQuery({
    queryKey: ["hr-timbrature-today", profilo?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("id, tipo, timestamp, ora_evento")
        .eq("profilo_id", profilo!.id)
        .eq("data_evento", todayStr)
        .order("timestamp", { ascending: true });
      if (error) {
        logger.error("TimbraturaSede — errore fetch timbrature:", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: !!profilo?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Mutation: registra una timbratura
  const timbraMutation = useMutation({
    mutationFn: async (tipo: "entrata" | "uscita" | "pausa_inizio" | "pausa_fine") => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("hr_timbrature").insert({
        company_id: companyId,
        profilo_id: profilo!.id,
        tipo,
        timestamp: now,
        data_evento: now.slice(0, 10),
        ora_evento: now.slice(11, 19),
        lat: null,
        lng: null,
        fonte: "web",
        note: "Sede ufficio",
      } as any);
      if (error) {
        logger.error("TimbraturaSede — errore insert timbratura:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Timbratura registrata");
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature-today"] });
    },
    onError: (err: any) => {
      toast.error("Errore: " + (err.message ?? "Riprovare"));
    },
  });

  // Calcola ore lavorate in tempo reale
  const oreLavorate = useMemo(() => {
    let totaleMs = 0;
    let ultimaEntrata: Date | null = null;
    for (const t of timbratureOggi) {
      const ts = new Date((t as any).timestamp);
      if ((t as any).tipo === "entrata" || (t as any).tipo === "pausa_fine") {
        ultimaEntrata = ts;
      } else if (((t as any).tipo === "uscita" || (t as any).tipo === "pausa_inizio") && ultimaEntrata) {
        totaleMs += ts.getTime() - ultimaEntrata.getTime();
        ultimaEntrata = null;
      }
    }
    if (ultimaEntrata) totaleMs += Date.now() - ultimaEntrata.getTime();
    return Math.round((totaleMs / 3_600_000) * 10) / 10;
  }, [timbratureOggi]);

  // Stato corrente
  const lastTimbro = timbratureOggi[timbratureOggi.length - 1] as any;
  const isEntrato  = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isInPausa  = lastTimbro?.tipo === "pausa_inizio";
  const isUscito   = lastTimbro?.tipo === "uscita";
  const nonHaTimbrato = !lastTimbro;

  const isLoading = loadingProfilo || loadingTimbrature;
  const isMutating = timbraMutation.isPending;

  // Se profilo HR non presente mostra avviso soft
  if (!isLoading && !profilo) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timbratura Sede
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Il tuo profilo HR non è ancora configurato. Contatta l'amministratore.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timbratura Sede
          </CardTitle>
          {isEntrato && (
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {oreLavorate}h lavorate oggi
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {/* Stato corrente */}
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              isEntrato  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" :
              isInPausa  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" :
              isUscito   ? "bg-muted text-muted-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                isEntrato  ? "bg-green-500 animate-pulse" :
                isInPausa  ? "bg-amber-500 animate-pulse" :
                "bg-slate-400"
              }`} />
              <span className="font-medium">
                {isUscito      ? "Giornata completata" :
                 isInPausa     ? "In pausa" :
                 isEntrato     ? "In servizio" :
                 "Non hai ancora timbrato"}
              </span>
              {lastTimbro?.ora_evento && (
                <span className="ml-auto text-xs opacity-75">
                  ultimo: {lastTimbro.ora_evento.slice(0, 5)}
                </span>
              )}
            </div>

            {/* Bottoni azione */}
            {!isUscito && (
              <div className="flex flex-wrap gap-2">
                {nonHaTimbrato && (
                  <Button
                    className="flex-1 min-w-[120px] gap-2 bg-green-600 hover:bg-green-700 text-white"
                    disabled={isMutating}
                    onClick={() => timbraMutation.mutate("entrata")}
                  >
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Entrata
                  </Button>
                )}
                {isEntrato && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("pausa_inizio")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                      Pausa
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("uscita")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Uscita
                    </Button>
                  </>
                )}
                {isInPausa && (
                  <>
                    <Button
                      className="flex-1 min-w-[120px] gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("pausa_fine")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      Fine Pausa
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("uscita")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Uscita
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Timeline timbrature oggi */}
            {timbratureOggi.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Oggi</p>
                {timbratureOggi.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                    <span className="font-medium tabular-nums">{t.ora_evento?.slice(0, 5)}</span>
                    <span>—</span>
                    <span>
                      {t.tipo === "entrata"      ? "Entrata" :
                       t.tipo === "uscita"       ? "Uscita" :
                       t.tipo === "pausa_inizio" ? "Inizio pausa" :
                       t.tipo === "pausa_fine"   ? "Fine pausa" : t.tipo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocco 3 — MieAttivita
// ─────────────────────────────────────────────────────────────────────────────
function MieAttivita() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, description, status, priority, due_date, category,
          order:orders!tasks_order_id_fkey(description, order_code),
          stock_item:warehouse_stock!tasks_stock_item_id_fkey(name)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true });
      if (error) {
        logger.error("MieAttivita — errore fetch tasks:", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const completaTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completata", completed_at: new Date().toISOString() } as any)
        .eq("id", taskId)
        .eq("assigned_to", user!.id);
      if (error) {
        logger.error("MieAttivita — errore completamento task:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Attività completata");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    onError: (err: any) => {
      toast.error("Errore: " + (err.message ?? "Riprovare"));
    },
  });

  // Separa task di oggi / scadute da quelle future
  const today = startOfDay(new Date());
  const taskOggi    = tasks.filter((t: any) => !t.due_date || isBefore(new Date(t.due_date), new Date()) || isToday(new Date(t.due_date)));
  const taskFuture  = tasks.filter((t: any) => t.due_date && !isBefore(new Date(t.due_date), new Date()) && !isToday(new Date(t.due_date)));

  const renderTask = (t: any) => {
    const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
    const scaduta = t.due_date && isBefore(new Date(t.due_date), today);

    return (
      <div
        key={t.id}
        className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dotClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="font-medium text-sm leading-snug">{t.title}</p>
            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${cfg.badgeClass}`}>
              {cfg.label}
            </Badge>
          </div>
          {t.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
            {t.order?.order_code && (
              <Link to="/azienda/ordini" className="flex items-center gap-1 hover:text-foreground transition-colors">
                <ExternalLink className="w-3 h-3" />
                {t.order.order_code}
              </Link>
            )}
            {t.stock_item?.name && (
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {t.stock_item.name}
              </span>
            )}
            {t.due_date && (
              <span className={scaduta ? "text-red-500 font-medium" : ""}>
                {scaduta ? "Scaduta " : "Entro "}
                {format(new Date(t.due_date), "d MMM", { locale: it })}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-green-600"
          disabled={completaTask.isPending}
          onClick={() => completaTask.mutate(t.id)}
          title="Segna come completata"
        >
          {completaTask.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Le mie Attività
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
            <p className="font-medium">Nessuna attività assegnata</p>
            <p className="text-sm mt-1">Ottimo lavoro! Sei in pari con tutto.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {taskOggi.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Da fare oggi
                </p>
                {taskOggi.map(renderTask)}
              </div>
            )}
            {taskFuture.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Prossimamente
                </p>
                {taskFuture.map(renderTask)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content — Attività (Home)
// ─────────────────────────────────────────────────────────────────────────────
function TabAttivita() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TimbraturaSede />
      <MieAttivita />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback loading
// ─────────────────────────────────────────────────────────────────────────────
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagina principale con Tabs
// ─────────────────────────────────────────────────────────────────────────────
export default function AttivitaStaff() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "attivita";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 p-6">
      <AttivitaHeader />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="attivita" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Attività</span>
          </TabsTrigger>
          <TabsTrigger value="timbrature" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Timbrature</span>
          </TabsTrigger>
          <TabsTrigger value="ferie" className="gap-1.5">
            <Palmtree className="h-4 w-4" />
            <span className="hidden sm:inline">Ferie</span>
          </TabsTrigger>
          <TabsTrigger value="cedolini" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Cedolini</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attivita" className="mt-6">
          <TabAttivita />
        </TabsContent>

        <TabsContent value="timbrature" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <TimbraturePersonali />
          </Suspense>
        </TabsContent>

        <TabsContent value="ferie" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <FeriePersonali />
          </Suspense>
        </TabsContent>

        <TabsContent value="cedolini" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <CedoliniPersonali />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
