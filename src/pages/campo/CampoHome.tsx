/**
 * Home dell'area campo — dashboard stile AttivitaStaff.
 * Timbratura integrata, cantieri assegnati, attività e accesso rapido.
 * Condizionale per operaio vs subappaltatore.
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isToday, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, startOfDay, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import {
  MapPin, AlertTriangle, ChevronRight, ChevronLeft,
  CheckCircle, Loader2, Clock, PlayCircle, PauseCircle, LogOut,
  ShieldCheck, Mic, QrCode, MessageSquare, FileText,
  CalendarDays, Receipt, ClipboardCheck,
  ClipboardList,
  Ticket, CalendarDays as CalendarDaysIcon,
  Sparkles, Navigation, Send, FilePenLine, Users
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGPS } from "@/hooks/useGPS";
import { useIsCampo } from "@/hooks/useIsCampo";
// 🆕 GAP 5b: hook cantieri timbrati oggi senza rapportino
import { useCampoRapportiniDaCompilare } from "@/hooks/useCampoRapportiniDaCompilare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PushConsentBanner } from "@/components/hr/PushConsentBanner";
import { MioMezzoCampoCard } from "@/components/mezzi/MioMezzoCampoCard";
import { isNative } from "@/lib/mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Priority config ──
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  urgente: { label: "Urgente", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-700" },
  alta:    { label: "Alta",    dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700" },
  normale: { label: "Normale", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-700" },
  bassa:   { label: "Bassa",   dotClass: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground" },
};

/**
 * Peso di ordinamento della priorità: più basso = più urgente.
 * Serve perché `tasks.priority` è una colonna TESTO — ordinarla nel DB
 * significa ordinare in ordine alfabetico, non per urgenza.
 * ("media" è un valore legacy equivalente a "normale".)
 */
function campoPriorityScore(priority: string | null | undefined): number {
  switch (priority) {
    case "urgente": return 0;
    case "alta": return 1;
    case "bassa": return 3;
    default: return 2; // normale / media / sconosciuta
  }
}

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface CampoAiOrder {
  id: string;
  order_code: string | null;
  description: string | null;
  status?: string | null;
  indirizzo_lavori: string | null;
  percentuale_avanzamento?: number | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
}

interface CampoAiAssignment {
  id: string;
  order_id: string | null;
  is_capocantiere?: boolean | null;
  order: CampoAiOrder | null;
}

interface CampoAiTask {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  order_id: string | null;
  order: Pick<CampoAiOrder, "order_code" | "description" | "indirizzo_lavori"> | null;
}

export default function CampoHome() {
  const { profile, user } = useAuth();
  const { isOperaio, isSubappaltatore } = useIsCampo();
  // Chi è capocantiere di almeno un cantiere lo legge nel saluto, non solo dentro la card.
  const { data: isCapocantiere = false } = useQuery({
    queryKey: ["campo-e-capocantiere", user?.id],
    enabled: !!user?.id && isOperaio,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("id")
        .eq("user_id", user!.id)
        .eq("is_capocantiere", true)
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
  });

  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
  // Banner push: se lo chiude, torna dopo 14 giorni.
  const [pushBannerNascosto, setPushBannerNascosto] = useState<boolean>(() => {
    try {
      const fino = Number(localStorage.getItem("campo-push-banner-fino") ?? 0);
      return fino > Date.now();
    } catch { return false; }
  });
  const nascondiPushBanner = () => {
    try { localStorage.setItem("campo-push-banner-fino", String(Date.now() + 14 * 86400_000)); } catch { /* privato */ }
    setPushBannerNascosto(true);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-3 md:space-y-6">
      {/* Header — compatto su mobile */}
      <div className="rounded-2xl border bg-background p-4 shadow-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
          <p className="text-muted-foreground text-xs md:text-sm capitalize">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
          </p>
          <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">
            {saluto}, {profile?.first_name ?? ""}
          </h1>
        </div>
        {/* Company badge mobile */}
        <div className="shrink-0 rounded-xl bg-primary/10 px-3 py-1.5 md:hidden">
          <p className="text-[10px] text-primary font-semibold">
            {isOperaio ? (isCapocantiere ? "Capocantiere" : "Operaio") : "Sub"}
          </p>
        </div>
        </div>
      </div>

      {/* Consenso alle notifiche: senza, gli avvisi (rapportino approvato, cantiere
          assegnato, promemoria) restano solo nella campanella. Solo web in produzione:
          il service worker c'è solo lì, l'app nativa ha le sue push. */}
      {import.meta.env.PROD && !isNative && !pushBannerNascosto && (
        <PushConsentBanner onDismiss={nascondiPushBanner} />
      )}
      {/* Timbratura — sempre in cima su mobile */}
      {isOperaio && <TimbraturaCampo />}

      {/* Azioni rapide — griglia 4 colonne su mobile */}
      <AccesaoRapido isOperaio={isOperaio} isSubappaltatore={isSubappaltatore} />

      {/* Grid principale — 1 col mobile, 2 col desktop.
          Priorità mobile: prima le cose da FARE (rapportini, cantieri),
          poi l'assistente AI e il resto. */}
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
        {/* Cantieri assegnati */}
        <div className="space-y-3 md:space-y-6">
          {/* 🆕 GAP 5b: prompt rapportini di OGGI non ancora compilati (priorità alta) */}
          {isOperaio && <RapportiniDaCompilareOggi />}
          {isOperaio && <CantieriAssegnati />}
          {isOperaio && <MioMezzoCampoCard />}
          {isSubappaltatore && <CantieriSub />}
          {isOperaio && <RapportiniSospesi />}
        </div>

        {/* Colonna destra */}
        <div className="space-y-3 md:space-y-6">
          {isOperaio && <AssistenteCampoOperaio />}
          <MiniCalendarioCampo />
          <MieAttivitaCampo />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timbratura Campo — integrata nella home
// ─────────────────────────────────────────────────────────────────────────────
function TimbraturaCampo() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const companyId = profile?.company_id ?? null;

  const { data: timbratureOggi = [], isLoading } = useQuery({
    queryKey: ["campo-timbrature-oggi", companyId, user?.id, today],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .order("timestamp_evento", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Tick al minuto: le ore della sessione aperta ticchettano invece di
  // restare congelate fino al refetch (e Date.now() esce dal render, che il
  // compiler vieta come funzione impura).
  const [adesso, setAdesso] = useState(() => new Date().getTime());
  useEffect(() => {
    const id = setInterval(() => setAdesso(new Date().getTime()), 60_000);
    return () => clearInterval(id);
  }, []);

  const oreLavorate = useMemo(() => {
    let totaleMs = 0;
    let ultimaEntrata: Date | null = null;
    for (const t of timbratureOggi) {
      const ts = new Date(t.timestamp_evento);
      if (t.tipo === "entrata" || t.tipo === "pausa_fine") ultimaEntrata = ts;
      else if ((t.tipo === "uscita" || t.tipo === "pausa_inizio") && ultimaEntrata) {
        totaleMs += ts.getTime() - ultimaEntrata.getTime();
        ultimaEntrata = null;
      }
    }
    if (ultimaEntrata) totaleMs += Math.max(0, adesso - ultimaEntrata.getTime());
    return Math.round((totaleMs / 3_600_000) * 10) / 10;
  }, [timbratureOggi, adesso]);

  const lastTimbro = timbratureOggi[timbratureOggi.length - 1] as any;
  const isEntrato = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isInPausa = lastTimbro?.tipo === "pausa_inizio";
  const isUscito = lastTimbro?.tipo === "uscita";
  const nonHaTimbrato = !lastTimbro;


  // GPS come nella pagina Timbratura dedicata: la posizione si chiede quando il
  // widget monta (non al tap, o l'operaio aspetterebbe il fix col dito a
  // mezz'aria) e si allega solo se è arrivata — la timbratura non aspetta mai
  // il GPS. Prima il widget non salvava proprio posizione né cantiere: le
  // timbrature dalla Home erano "di serie B" rispetto alla pagina dedicata.
  const { lat, lng, accuracy, address, status: gpsStatus, requestPosition } = useGPS(companyId);
  useEffect(() => {
    if (companyId) void requestPosition();
  }, [companyId, requestPosition]);

  // Cantiere collegato SOLO se è certo: un'unica assegnazione attiva → quella.
  // Con più cantieri non si indovina (la pagina Timbratura lo collega solo
  // quando ci si arriva dal cantiere stesso — stessa filosofia).
  const { data: cantiereUnico = null } = useQuery({
    queryKey: ["campo-cantiere-unico", companyId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .select("order_id, orders(order_code)")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id);
      if (error) throw error;
      const distinct = [...new Map((data ?? [])
        .filter((r) => r.order_id)
        .map((r) => [r.order_id as string, r])).values()];
      if (distinct.length !== 1) return null;
      const unico = distinct[0] as { order_id: string; orders: { order_code: string | null } | null };
      return { id: unico.order_id, code: unico.orders?.order_code ?? null };
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60_000,
  });

  const timbraMutation = useMutation({
    mutationFn: async (tipo: "entrata" | "uscita" | "pausa_inizio" | "pausa_fine") => {
      if (!companyId) throw new Error("Azienda non disponibile, ricarica la pagina");
      const lastTipo = lastTimbro?.tipo as string | undefined;
      const allowedNext: Record<string, Array<string | undefined>> = {
        entrata: ["uscita", undefined],
        pausa_inizio: ["entrata", "pausa_fine"],
        pausa_fine: ["pausa_inizio"],
        uscita: ["entrata", "pausa_fine", "pausa_inizio"],
      };
      if (!allowedNext[tipo].includes(lastTipo)) {
        throw new Error("Sequenza timbratura non valida per lo stato attuale");
      }
      const now = new Date().toISOString();
      const gpsReady = gpsStatus === "success";
      const note = [
        cantiereUnico ? `Cantiere: ${cantiereUnico.code ?? cantiereUnico.id}` : null,
        address ? `GPS: ${address}` : null,
      ].filter(Boolean).join(" · ") || null;
      const { error } = await supabase.from("campo_timbrature").insert({
        company_id: companyId,
        user_id: user!.id,
        order_id: cantiereUnico?.id ?? null,
        tipo,
        timestamp_evento: now,
        gps_lat: gpsReady ? lat : null,
        gps_lng: gpsReady ? lng : null,
        gps_accuracy: gpsReady ? Math.round(accuracy) : null,
        note,
        fonte: "app",
      });
      if (error) throw error;
      // Registro HR: ci pensa il trigger DB (vedi CampoTimbratura).
    },
    onSuccess: () => {
      toast.success("Timbratura registrata");
      queryClient.invalidateQueries({ queryKey: ["campo-timbrature-oggi", companyId, user?.id, today] });
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature"] });
      queryClient.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
      queryClient.invalidateQueries({ queryKey: ["hr-live-status"] });
      queryClient.invalidateQueries({ queryKey: ["hr-giornate"] });
    },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  const isMutating = timbraMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Timbratura
          </CardTitle>
          {isEntrato && (
            <span className="text-sm font-semibold text-amber-600">
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
            {/* Stato attuale */}
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              isEntrato ? "bg-green-50 text-green-700" :
              isInPausa ? "bg-amber-50 text-amber-700" :
              "bg-muted text-muted-foreground"
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                isEntrato ? "bg-green-500 animate-pulse" :
                isInPausa ? "bg-amber-500 animate-pulse" :
                "bg-slate-400"
              }`} />
              <span className="font-medium">
                {isUscito ? "Fuori servizio" :
                 isInPausa ? "In pausa" :
                 isEntrato ? "In servizio" :
                 "Non hai ancora timbrato"}
              </span>
              {lastTimbro?.timestamp_evento && (
                <span className="ml-auto text-xs opacity-75">
                  ultimo: {format(new Date(lastTimbro.timestamp_evento), "HH:mm")}
                </span>
              )}
            </div>

            {/* Cosa verrà allegato alla timbratura: posizione e cantiere.
                Stessi testi della pagina Timbratura — l'operaio sa PRIMA di
                timbrare se la posizione c'è o no, niente sorprese dopo. */}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {gpsStatus === "success" && <span className="text-green-600">GPS attivo — precisione {Math.round(accuracy)}m{address ? ` · ${address}` : ""}</span>}
              {gpsStatus === "loading" && "Acquisizione GPS..."}
              {(gpsStatus === "denied" || gpsStatus === "error" || gpsStatus === "idle") && "GPS non disponibile — timbratura senza posizione"}
              {cantiereUnico && <span> · Cantiere {cantiereUnico.code ?? ""}</span>}
            </p>

            {/* Bottoni azione */}
            <div className="flex flex-wrap gap-2">
              {(nonHaTimbrato || isUscito) && (
                <Button className="flex-1 min-w-[120px] gap-2 bg-green-600 hover:bg-green-700 text-white"
                  disabled={isMutating} onClick={() => timbraMutation.mutate("entrata")}>
                  {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Entrata
                </Button>
              )}
              {isEntrato && (
                <>
                  <Button variant="outline" className="flex-1 min-w-[120px] gap-2"
                    disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_inizio")}>
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                    Pausa
                  </Button>
                  <Button variant="destructive" className="flex-1 min-w-[120px] gap-2"
                    disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Uscita
                  </Button>
                </>
              )}
              {isInPausa && (
                <>
                  <Button className="flex-1 min-w-[120px] gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_fine")}>
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Fine Pausa
                  </Button>
                  <Button variant="destructive" className="flex-1 min-w-[120px] gap-2"
                    disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Uscita
                  </Button>
                </>
              )}
            </div>

            {/* Timeline timbrature di oggi */}
            {timbratureOggi.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Oggi</p>
                {timbratureOggi.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                    <span className="font-medium tabular-nums">
                      {format(new Date(t.timestamp_evento), "HH:mm")}
                    </span>
                    <span>—</span>
                    <span>
                      {t.tipo === "entrata" ? "Entrata" :
                       t.tipo === "uscita" ? "Uscita" :
                       t.tipo === "pausa_inizio" ? "Inizio pausa" :
                       "Fine pausa"}
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
// Assistente Campo Operaio — guida pratica con dati già presenti
// ─────────────────────────────────────────────────────────────────────────────
function AssistenteCampoOperaio() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: rapportiniMancanti = [] } = useCampoRapportiniDaCompilare(user?.id);

  const { data: employeeId } = useQuery({
    queryKey: ["campo-ai-employee-id", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const { data: lavori = [], isLoading } = useQuery<CampoAiAssignment[]>({
    queryKey: ["campo-ai-lavori-oggi", employeeId, user?.id],
    queryFn: async () => {
      // Doppio binario assegnazioni (come Calendario): un operaio assegnato
      // solo via order_campo_assignments vedeva "Nessun cantiere prioritario
      // trovato" con il cantiere attivo un riquadro più in su.
      // NB: is_capocantiere vive SOLO su order_campo_assignments — chiederlo
      // a order_employees faceva rispondere 400 a tutta la query (era uno dei
      // 400 silenziosi in console) e la card restava sempre "nessun cantiere".
      const orderEmbed = `
          order:orders(
            id, order_code, description, status,
            indirizzo_lavori, percentuale_avanzamento,
            work_start_date, work_end_date
          )
        `;
      const [empRes, campoRes] = await Promise.all([
        employeeId
          ? supabase.from("order_employees").select(`id, order_id, ${orderEmbed}`).eq("employee_id", employeeId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("order_campo_assignments").select(`id, order_id, is_capocantiere, ${orderEmbed}`).eq("user_id", user!.id),
      ]);
      if (empRes.error) throw empRes.error;
      if (campoRes.error) throw campoRes.error;

      const seen = new Set<string>();
      return ([...(empRes.data ?? []), ...(campoRes.data ?? [])] as CampoAiAssignment[]).filter((a) => {
        if (!a.order?.id || seen.has(a.order.id)) return false;
        seen.add(a.order.id);
        const status = String(a.order.status ?? "").toLowerCase();
        return status !== "annullato" && status !== "chiuso";
      });
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: taskAperte = [] } = useQuery<CampoAiTask[]>({
    queryKey: ["campo-ai-task-oggi", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, priority, status, due_date, order_id,
          order:orders!tasks_order_id_fkey(order_code, description, indirizzo_lavori)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("due_date", { ascending: true })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as CampoAiTask[];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const prossimoLavoro = useMemo(() => {
    if (!lavori.length) return null;
    const today = startOfDay(new Date()).getTime();
    const sortable = [...lavori].sort((a, b) => {
      const aStart = a.order?.work_start_date ? startOfDay(new Date(a.order.work_start_date)).getTime() : today;
      const bStart = b.order?.work_start_date ? startOfDay(new Date(b.order.work_start_date)).getTime() : today;
      const aScore = aStart >= today ? aStart : today + Math.abs(today - aStart);
      const bScore = bStart >= today ? bStart : today + Math.abs(today - bStart);
      return aScore - bScore;
    });
    return sortable[0] ?? null;
  }, [lavori]);

  const prossimoTask = useMemo(() => {
    const priorityScore: Record<string, number> = { urgente: 4, alta: 3, normale: 2, bassa: 1 };
    return [...taskAperte].sort((a, b) => {
      const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return (priorityScore[b.priority ?? "normale"] ?? 2) - (priorityScore[a.priority ?? "normale"] ?? 2);
    })[0] ?? null;
  }, [taskAperte]);

  const focusRapportino = rapportiniMancanti[0] ?? null;
  const focusOrder = focusRapportino
    ? { id: focusRapportino.order_id, order_code: focusRapportino.order_code, description: focusRapportino.description, indirizzo_lavori: focusRapportino.indirizzo_lavori }
    : prossimoLavoro?.order ?? null;

  const suggestion = focusRapportino
    ? "Prima chiudi il rapportino: aggiorna ore, diario lavori e avanzamento del cantiere."
    : prossimoTask
      ? "Parti dalla task più urgente, poi timbra sul cantiere e manda il rapportino a fine lavoro."
      : focusOrder
        ? "Vai al cantiere, timbra collegando la commessa e a fine turno invia il rapportino vocale."
        : "Nessun cantiere prioritario trovato: controlla calendario o chiedi indicazioni al responsabile.";

  const openMaps = () => {
    const address = focusOrder?.indirizzo_lavori;
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-blue-50 via-background to-emerald-50/70">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="rounded-xl bg-blue-600 p-2 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              AI Campo
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Ti dice cosa fare adesso e cosa non dimenticare.
            </p>
          </div>
          <Badge className={focusRapportino ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
            {focusRapportino ? "Azione richiesta" : "Pronto"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border bg-background/85 p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
              {focusRapportino ? <FilePenLine className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Prossima mossa
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                {suggestion}
              </p>
              {focusOrder && (
                <div className="mt-2 min-w-0 rounded-xl bg-muted/60 px-3 py-2">
                  <p className="truncate text-sm font-bold">{focusOrder.order_code ?? "Cantiere"}</p>
                  <p className="truncate text-xs text-muted-foreground">{focusOrder.description ?? "Nessuna descrizione"}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {prossimoTask && (
          <button
            type="button"
            onClick={() => navigate("/campo/attivita")}
            className="flex w-full items-center justify-between rounded-xl border border-blue-100 bg-white/70 px-3 py-2 text-left transition-colors hover:bg-white active:scale-[0.99]"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Task consigliata</p>
              <p className="truncate text-sm font-semibold">{prossimoTask.title}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-blue-700" />
          </button>
        )}

        <div className="hidden md:grid md:grid-cols-4 gap-2">
          {focusOrder && (
            <Button
              type="button"
              className="h-10 gap-2"
              onClick={() => navigate(`/campo/lavoro/${focusOrder.id}`)}
            >
              <ClipboardCheck className="h-4 w-4" />
              Lavoro
            </Button>
          )}
          {focusOrder && (
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => navigate(`/campo/timbratura?order_id=${focusOrder.id}`)}
            >
              <Clock className="h-4 w-4" />
              Timbra
            </Button>
          )}
          {focusOrder?.indirizzo_lavori && (
            <Button type="button" variant="outline" className="h-10 gap-2" onClick={openMaps}>
              <Navigation className="h-4 w-4" />
              Maps
            </Button>
          )}
          {focusRapportino ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10 gap-2 bg-violet-100 text-violet-800 hover:bg-violet-200"
              onClick={() => navigate(`/campo/lavoro/${focusRapportino.order_id}/rapportino-vocale`)}
            >
              <Send className="h-4 w-4" />
              Invia
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="h-10 gap-2"
              onClick={() => navigate("/campo/sicurezza")}
            >
              <ShieldCheck className="h-4 w-4" />
              Check
            </Button>
          )}
        </div>

        <div className="hidden md:flex flex-wrap gap-1.5">
          {["Ore", "Diario", "Avanzamento", "Foto"].map((item) => (
            <span key={item} className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              aggiorna {item}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cantieri Assegnati (operaio) — senza importi
// ─────────────────────────────────────────────────────────────────────────────
function CantieriAssegnati() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Cerca employee_id dal profilo
  const { data: employeeId } = useQuery({
    queryKey: ["campo-employee-id", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .eq("company_id", profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  const { data: lavori = [], isLoading } = useQuery({
    queryKey: ["campo-lavori-assegnati", user?.id, employeeId ?? "no-employee"],
    queryFn: async () => {
      const orderSelect = `
          id, order_id,
          order:orders(
            id, order_code, description, status,
            indirizzo_lavori,
            percentuale_avanzamento
          )
        `;
      const rows: any[] = [];

      // Fonte 1: assegnazioni campo dirette (order_campo_assignments) —
      // è la fonte primaria dell'area campo (stessa usata dal dettaglio lavoro).
      // is_capocantiere va chiesto SOLO qui: su order_employees la colonna non
      // esiste (400) — col select condiviso il badge Capocantiere era morto.
      const { data: campoAss, error: campoErr } = await supabase
        .from("order_campo_assignments")
        .select(`is_capocantiere, ${orderSelect}`)
        .eq("user_id", user!.id);
      if (campoErr) throw campoErr;
      rows.push(...(campoAss ?? []));

      // Fonte 2: manodopera (order_employees), se esiste la scheda dipendente
      if (employeeId) {
        const { data, error } = await supabase
          .from("order_employees")
          .select(orderSelect)
          .eq("employee_id", employeeId);
        if (error) throw error;
        rows.push(...(data ?? []));
      }

      // Deduplica per order_id (possono esserci più righe per lo stesso ordine)
      const seen = new Set<string>();
      return rows.filter((a: any) => {
        if (!a.order?.id || seen.has(a.order.id)) return false;
        seen.add(a.order.id);
        // Filtra ordini completati/annullati
        const status = a.order.status?.toLowerCase();
        if (status === 'annullato' || status === 'chiuso') return false;
        return true;
      });
    },
    // employeeId: undefined = ancora in caricamento, null = nessuna scheda
    enabled: !!user?.id && employeeId !== undefined,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cantieri assegnati</CardTitle>
          {lavori.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {lavori.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : lavori.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nessun cantiere assegnato</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lavori.map((a: any) => (
              <button
                key={a.id}
                onClick={() => navigate(`/campo/lavoro/${a.order?.id}`)}
                className="w-full bg-muted/50 border rounded-xl p-3.5 text-left hover:bg-muted transition-all active:scale-[0.98]"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground">{a.order?.order_code}</p>
                      {a.is_capocantiere && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">
                          Capocantiere
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.order?.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                {a.order?.indirizzo_lavori && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{a.order.indirizzo_lavori}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${a.order?.percentuale_avanzamento ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {a.order?.percentuale_avanzamento ?? 0}%
                  </span>
                </div>
                {a.is_capocantiere && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); navigate(`/campo/squadra/${a.order?.id}`); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate(`/campo/squadra/${a.order?.id}`); } }}
                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary"
                  >
                    <Users className="h-3.5 w-3.5" /> Squadra di oggi
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cantieri Sub (subappaltatore)
// ─────────────────────────────────────────────────────────────────────────────
function CantieriSub() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const { data: cantieri = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["campo-cantieri-sub", user?.id, profile?.company_id],
    queryFn: async () => {
      // Prima prova order_campo_assignments (assegnazioni dirette)
      const { data: ocaData, error: ocaErr } = await supabase
        .from("order_campo_assignments")
        .select(`
          id, order_id, role_type, note,
          order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento)
        `)
        .eq("user_id", user!.id);
      if (ocaErr) throw ocaErr;

      if (ocaData && ocaData.length > 0) {
        // Deduplica per order_id e filtra completati
        const seen = new Set<string>();
        return ocaData.filter((a: any) => {
          if (!a.order?.id || seen.has(a.order.id)) return false;
          seen.add(a.order.id);
          const status = a.order.status?.toLowerCase();
          if (status === "annullato" || status === "chiuso") return false;
          return true;
        });
      }

      // Fallback: vecchia logica subappaltatori/contratti_subappalto
      const { data: subData, error: subErr } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (subErr) throw subErr;
      if (!subData?.id) return [];
      const { data, error } = await supabase
        .from("contratti_subappalto")
        .select(`*, order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento)`)
        .eq("subappaltatore_id", subData.id)
        .eq("stato", "attivo");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cantieri attivi</CardTitle>
          {cantieri.length > 0 && (
            <Badge variant="secondary" className="text-xs">{cantieri.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          /* Errore onesto: prima uno errore di rete/permessi restava uno
             skeleton infinito o mentiva con "Nessun cantiere attivo". */
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm font-medium text-foreground">Non riesco a caricare i cantieri</p>
            <p className="text-xs text-muted-foreground">Controlla la connessione e riprova.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Riprovo…" : "Riprova"}
            </Button>
          </div>
        ) : cantieri.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-muted-foreground">Nessun cantiere attivo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cantieri.map((c: any) => (
              <button
                key={c.id}
                onClick={() => navigate(`/campo/lavoro/${c.order?.id}`)}
                className="w-full bg-muted/50 border rounded-lg p-3 text-left hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground">{c.order?.order_code}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.order?.description}</p>
                    {c.order?.indirizzo_lavori && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.order.indirizzo_lavori}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapportini in sospeso (operaio)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🆕 GAP 5b — RapportiniDaCompilareOggi
 *
 * Card prominente "Crea i rapportini di OGGI" per i cantieri in cui l'operaio
 * ha già timbrato oggi ma non ha ancora compilato il rapportino di intervento.
 *
 * Differenza vs RapportiniSospesi (esistente):
 *   - RapportiniSospesi → rapportini DI GIORNI PRECEDENTI ancora aperti (lavoro
 *     non completato)
 *   - RapportiniDaCompilareOggi → cantieri di OGGI senza rapportino — il "promemoria"
 *     proattivo che l'operaio dimentica spesso a fine giornata
 *
 * Il pattern è AI-native: l'app sa cosa hai fatto oggi (timbrature GPS) e
 * ti chiede di chiudere la giornata correttamente.
 */
function RapportiniDaCompilareOggi() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: cantieri = [], isLoading } = useCampoRapportiniDaCompilare(user?.id);

  if (isLoading || cantieri.length === 0) return null;

  return (
    <Card className="border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-violet-800 dark:text-violet-200">
          <ClipboardList className="h-4 w-4" />
          {cantieri.length === 1
            ? "Compila il rapportino di oggi"
            : `Compila ${cantieri.length} rapportini di oggi`}
        </CardTitle>
        <p className="text-xs text-violet-700 dark:text-violet-300 mt-1">
          Hai timbrato in {cantieri.length === 1 ? "questo cantiere" : "questi cantieri"} ma non hai ancora chiuso la giornata.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {cantieri.slice(0, 5).map((c) => (
          <button
            key={c.order_id}
            onClick={() => navigate(`/campo/lavoro/${c.order_id}`)}
            className="w-full flex items-center justify-between text-left rounded-lg px-2 py-2 hover:bg-violet-100/60 dark:hover:bg-violet-900/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground font-medium truncate">
                {c.order_code ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {c.description?.slice(0, 60) ?? "—"} · ~{c.ore_in_cantiere_stimate}h stimate
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-violet-600 shrink-0 ml-2" />
          </button>
        ))}
        {cantieri.length > 5 && (
          <p className="text-[10px] text-muted-foreground text-center pt-1">
            +{cantieri.length - 5} altri cantieri
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RapportiniSospesi() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: rapportini = [] } = useQuery({
    queryKey: ["campo-rapportini-sospesi", user?.id, companyId],
    queryFn: async () => {
      // Filtro azienda: i rapportini sono dell'utente ma restano nel tenant
      // in cui sono nati — cambiando azienda i vecchi non devono riapparire
      // come "da completare" (e il link aprirebbe un cantiere non accessibile).
      //
      // "Da completare" = bozza mai inviata o rapportino RESPINTO dall'ufficio.
      // Prima il filtro era lavoro_completato=false, ma quel flag significa
      // "il CANTIERE è finito": ogni rapportino normale di un cantiere aperto
      // restava segnato per sempre come sospeso, anche se già inviato — la
      // card gridava al lupo tutti i giorni e i veri sospesi si perdevano.
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, order_id, data_lavoro, stato, order:orders(order_code, description)")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .in("stato", ["bozza", "rifiutato"])
        .lt("data_lavoro", today)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
  });

  if (rapportini.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {rapportini.length} {rapportini.length === 1 ? "rapportino" : "rapportini"} da completare
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rapportini.slice(0, 3).map((r: any) => (
          <button
            key={r.id}
            onClick={() => navigate(`/campo/lavoro/${r.order_id}`)}
            className="w-full flex items-center justify-between text-left rounded-lg px-2 py-2 hover:bg-amber-100/50 transition-colors"
          >
            <div>
              <p className="text-sm text-foreground font-medium">
                {r.order?.order_code}
                {r.stato === "rifiutato" && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                    Respinto — da rifare
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(r.data_lavoro), "d MMM", { locale: it })} — {r.order?.description?.slice(0, 40)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini Calendario mensile
// ─────────────────────────────────────────────────────────────────────────────
function MiniCalendarioCampo() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: monthTasks = [] } = useQuery({
    queryKey: ["campo-calendar-tasks", user?.id, companyId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status")
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof monthTasks>();
    for (const t of monthTasks) {
      if (!t.due_date) continue;
      const arr = map.get(t.due_date) ?? [];
      arr.push(t);
      map.set(t.due_date, arr);
    }
    return map;
  }, [monthTasks]);

  const days = useMemo(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    let startDow = getDay(monthStart);
    startDow = startDow === 0 ? 6 : startDow - 1;
    return { allDays, padding: startDow };
  }, [monthStart, monthEnd]);

  const selectedTasks = useMemo(() => {
    if (!selectedDate) return [];
    return tasksByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [];
  }, [selectedDate, tasksByDate]);

  const today = startOfDay(new Date());

  // Sul telefono il mese intero era la card più alta della home: c'è già «Lavori» in basso.
  return (
    <Card className="hidden lg:block">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Calendario
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </span>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Giorni settimana */}
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map(g => (
            <div key={g} className="text-center text-[10px] font-semibold text-muted-foreground py-1 uppercase">
              {g}
            </div>
          ))}
        </div>
        {/* Griglia giorni */}
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: days.padding }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.allDays.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentDay = isToday(day);
            const isPast = isBefore(day, today) && !isCurrentDay;
            return (
              <TooltipProvider key={key} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelectedDate(day)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-all hover:bg-muted/60 ${
                        isSelected ? "bg-primary text-primary-foreground font-bold shadow-sm" :
                        isCurrentDay ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30" :
                        isPast ? "text-muted-foreground/60" : "text-foreground"
                      }`}
                    >
                      <span className="text-xs leading-none">{format(day, "d")}</span>
                      {dayTasks.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayTasks.slice(0, 3).map((t: any, i: number) => {
                            const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                            const isDone = t.status === "completata";
                            return <div key={i} className={`w-1 h-1 rounded-full ${isDone ? "bg-green-400" : cfg.dotClass}`} />;
                          })}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {dayTasks.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="font-medium text-xs mb-1">
                        {format(day, "d MMMM", { locale: it })} — {dayTasks.length} attività
                      </p>
                      {dayTasks.slice(0, 4).map((t: any) => (
                        <p key={t.id} className="text-xs text-muted-foreground truncate">• {t.title}</p>
                      ))}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Task del giorno selezionato */}
        {selectedDate && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {isToday(selectedDate) ? "Oggi" : format(selectedDate, "d MMMM", { locale: it })}
              {selectedTasks.length > 0 && ` — ${selectedTasks.length} attività`}
            </p>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessuna scadenza per questo giorno</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {selectedTasks.map((t: any) => {
                  const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                  const isDone = t.status === "completata";
                  return (
                    <div key={t.id} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${isDone ? "bg-green-50" : "bg-muted/50"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-green-500" : cfg.dotClass}`} />
                      <span className={`flex-1 truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                      <Badge className={`text-[11px] px-1.5 py-0 ${isDone ? "bg-green-100 text-green-700" : cfg.badgeClass}`}>
                        {isDone ? "Fatto" : cfg.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le mie attività
// ─────────────────────────────────────────────────────────────────────────────
function MieAttivitaCampo() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["campo-my-tasks", user?.id, companyId],
    queryFn: async () => {
      // `tasks.priority` è TESTO, non un enum ordinato: ordinarlo lato DB dava
      // un ordine ALFABETICO discendente (urgente → normale → bassa → alta),
      // cioè le attività "alta" finivano ULTIME, sotto quelle "bassa", e con
      // il limite potevano sparire del tutto. Prendiamo una finestra più ampia
      // ordinata per scadenza e ordiniamo per priorità reale lato client.
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, priority, due_date, status,
          order:orders!tasks_order_id_fkey(order_code)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(40);
      if (error) throw error;
      return [...(data ?? [])]
        .sort((a, b) => campoPriorityScore(a.priority) - campoPriorityScore(b.priority))
        .slice(0, 8);
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Le mie attività</CardTitle>
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary"
              onClick={() => navigate("/campo/attivita")}
            >
              Vedi tutte <ChevronRight className="w-3 h-3 ml-0.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna attività in corso
          </p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t: any) => {
              const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
              return (
                <div
                  key={t.id}
                  onClick={() => navigate("/campo/attivita")}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {t.order?.order_code && <span>{t.order.order_code}</span>}
                      {t.due_date && (
                        <span>{format(new Date(t.due_date), "d MMM", { locale: it })}</span>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-[11px] px-1.5 py-0 ${cfg.badgeClass}`}>{cfg.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Accesso rapido
// ─────────────────────────────────────────────────────────────────────────────
function AccesaoRapido({ isOperaio, isSubappaltatore }: { isOperaio: boolean; isSubappaltatore: boolean }) {
  const navigate = useNavigate();

  // Telefono: le prime 4 a vista (il resto è nel menu App); da tablet in su tutte.
  const items = [
    ...(isOperaio ? [
      { icon: ShieldCheck, label: "Sicurezza", url: "/campo/sicurezza", color: "text-emerald-600 bg-emerald-50" },
      { icon: Mic, label: "Rapportino vocale", url: "/campo/rapportino-vocale", color: "text-violet-600 bg-violet-50" },
      { icon: CalendarDaysIcon, label: "Ferie", url: "/campo/ferie", color: "text-orange-600 bg-orange-50" },
      { icon: Ticket, label: "Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
      { icon: QrCode, label: "Tesserino", url: "/campo/tesserino", color: "text-blue-600 bg-blue-50" },
      { icon: Clock, label: "Presenze", url: "/campo/presenze", color: "text-teal-600 bg-teal-50" },
      { icon: Receipt, label: "Cedolini", url: "/campo/cedolini", color: "text-pink-600 bg-pink-50" },
      { icon: FileText, label: "Documenti", url: "/campo/documenti", color: "text-slate-600 bg-slate-50" },
    ] : []),
    ...(isSubappaltatore ? [
      { icon: ShieldCheck, label: "Sicurezza", url: "/campo/sicurezza", color: "text-emerald-600 bg-emerald-50" },
      { icon: Mic, label: "Rapportino vocale", url: "/campo/rapportino-vocale", color: "text-violet-600 bg-violet-50" },
      { icon: ClipboardCheck, label: "Avanzamento", url: "/campo/avanzamento", color: "text-teal-600 bg-teal-50" },
      { icon: Ticket, label: "Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
      { icon: FileText, label: "Documenti", url: "/campo/documenti", color: "text-blue-600 bg-blue-50" },
      { icon: MessageSquare, label: "Chat", url: "/campo/chat", color: "text-indigo-600 bg-indigo-50" },
    ] : []),
  ];

  return (
    <div className="rounded-2xl border bg-background p-3 shadow-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <p className="mb-3 text-sm font-semibold text-foreground">Azioni rapide</p>
      <div className="grid grid-cols-4 gap-1.5 md:gap-3">
        {items.map((item, idx) => {
          const [textColor, bgColor] = item.color.split(" ");
          return (
            <button
              key={item.url + item.label}
              onClick={() => navigate(item.url)}
              className={`${idx >= 4 ? "hidden md:flex" : "flex"} min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 transition-all active:scale-95 hover:bg-muted/60`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl md:h-14 md:w-14 ${bgColor}`}>
                <item.icon className={`h-5 w-5 md:h-7 md:w-7 ${textColor}`} />
              </div>
              <span className="max-w-full text-center text-[10px] font-semibold leading-tight text-foreground md:text-xs">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
