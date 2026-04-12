/**
 * Home dell'area campo — dashboard stile AttivitaStaff.
 * Timbratura integrata, cantieri assegnati, attività e accesso rapido.
 * Condizionale per operaio vs subappaltatore.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isToday, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, startOfDay, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import {
  MapPin, AlertTriangle, ChevronRight, ChevronLeft,
  CheckCircle, Loader2, Clock, PlayCircle, PauseCircle, LogOut,
  ShieldCheck, Mic, QrCode, MessageSquare, FileText,
  CalendarDays, Plus, CreditCard, Receipt, ClipboardCheck,
  Ticket, CalendarDays as CalendarDaysIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Priority config ──
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  urgente: { label: "Urgente", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-700" },
  alta:    { label: "Alta",    dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700" },
  normale: { label: "Normale", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-700" },
  bassa:   { label: "Bassa",   dotClass: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground" },
};

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function CampoHome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isOperaio, isSubappaltatore } = useIsCampo();

  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
      {/* Header — compatto su mobile */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs md:text-sm capitalize">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
          </p>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            {saluto}, {profile?.first_name ?? ""}
          </h1>
        </div>
        {/* Company badge mobile */}
        <div className="md:hidden bg-primary/10 rounded-xl px-3 py-1.5">
          <p className="text-[10px] text-primary font-semibold">
            {isOperaio ? "Operaio" : "Sub"}
          </p>
        </div>
      </div>

      {/* Timbratura — sempre in cima su mobile */}
      {isOperaio && <TimbraturaCampo />}

      {/* Azioni rapide — griglia 4 colonne su mobile */}
      <AccesaoRapido isOperaio={isOperaio} isSubappaltatore={isSubappaltatore} />

      {/* Grid principale — 1 col mobile, 2 col desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Cantieri assegnati */}
        <div className="space-y-4 md:space-y-6">
          {isOperaio && <CantieriAssegnati />}
          {isSubappaltatore && <CantieriSub />}
          {isOperaio && <RapportiniSospesi />}
        </div>

        {/* Colonna destra */}
        <div className="space-y-4 md:space-y-6">
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

  const { data: timbratureOggi = [], isLoading } = useQuery({
    queryKey: ["campo-timbrature-oggi", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .order("timestamp_evento", { ascending: true });
      return data ?? [];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

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
    if (ultimaEntrata) totaleMs += Date.now() - ultimaEntrata.getTime();
    return Math.round((totaleMs / 3_600_000) * 10) / 10;
  }, [timbratureOggi]);

  const lastTimbro = timbratureOggi[timbratureOggi.length - 1] as any;
  const isEntrato = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isInPausa = lastTimbro?.tipo === "pausa_inizio";
  const isUscito = lastTimbro?.tipo === "uscita";
  const nonHaTimbrato = !lastTimbro;

  const timbraMutation = useMutation({
    mutationFn: async (tipo: "entrata" | "uscita" | "pausa_inizio" | "pausa_fine") => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("campo_timbrature").insert({
        company_id: (profile as any)?.company_id,
        user_id: user!.id,
        tipo,
        timestamp_evento: now,
        fonte: "app",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timbratura registrata");
      queryClient.invalidateQueries({ queryKey: ["campo-timbrature-oggi"] });
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
                {isUscito ? "Giornata completata" :
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

            {/* Bottoni azione */}
            {!isUscito && (
              <div className="flex flex-wrap gap-2">
                {nonHaTimbrato && (
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
            )}

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
// Cantieri Assegnati (operaio) — senza importi
// ─────────────────────────────────────────────────────────────────────────────
function CantieriAssegnati() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Cerca employee_id dal profilo
  const { data: employeeId } = useQuery({
    queryKey: ["campo-employee-id", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .eq("company_id", profile!.company_id)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  const { data: lavori = [], isLoading } = useQuery({
    queryKey: ["campo-lavori-assegnati", employeeId],
    queryFn: async () => {
      // Usa order_employees (sempre popolata) come fonte primaria
      const { data } = await supabase
        .from("order_employees")
        .select(`
          id, order_id,
          order:orders(
            id, order_code, description, status,
            indirizzo_lavori,
            percentuale_avanzamento
          )
        `)
        .eq("employee_id", employeeId!);
      // Deduplica per order_id (possono esserci più righe per lo stesso ordine)
      const seen = new Set<string>();
      return (data ?? []).filter((a: any) => {
        if (!a.order?.id || seen.has(a.order.id)) return false;
        seen.add(a.order.id);
        // Filtra ordini completati/annullati
        const status = a.order.status?.toLowerCase();
        if (status === 'annullato' || status === 'chiuso') return false;
        return true;
      });
    },
    enabled: !!employeeId,
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

  const { data: cantieri = [], isLoading } = useQuery({
    queryKey: ["campo-cantieri-sub", user?.id, profile?.company_id],
    queryFn: async () => {
      // Prima prova order_campo_assignments (assegnazioni dirette)
      const { data: ocaData } = await supabase
        .from("order_campo_assignments")
        .select(`
          id, order_id, role_type, note,
          order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento)
        `)
        .eq("user_id", user!.id);

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
      const { data: subData } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!subData?.id) return [];
      const { data } = await supabase
        .from("contratti_subappalto")
        .select(`*, order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento)`)
        .eq("subappaltatore_id", subData.id)
        .eq("stato", "attivo");
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
function RapportiniSospesi() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: rapportini = [] } = useQuery({
    queryKey: ["campo-rapportini-sospesi", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("campo_rapportini")
        .select("id, order_id, data_lavoro, order:orders(order_code, description)")
        .eq("user_id", user!.id)
        .eq("lavoro_completato", false)
        .lt("data_lavoro", today)
        .order("data_lavoro", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  if (rapportini.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {rapportini.length} rapportini da completare
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
              <p className="text-sm text-foreground font-medium">{r.order?.order_code}</p>
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
      const { data } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status")
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Calendario
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
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
                      <Badge className={`text-[9px] px-1 py-0 ${isDone ? "bg-green-100 text-green-700" : cfg.badgeClass}`}>
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
      const { data } = await supabase
        .from("tasks")
        .select(`
          id, title, priority, due_date, status,
          order:orders!tasks_order_id_fkey(order_code)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("priority", { ascending: false })
        .limit(8);
      return data ?? [];
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
                  <Badge className={`text-[9px] px-1.5 py-0 ${cfg.badgeClass}`}>{cfg.label}</Badge>
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

  const items = [
    ...(isOperaio ? [
      { icon: ShieldCheck, label: "Sicurezza", url: "/campo/sicurezza", color: "text-emerald-600 bg-emerald-50" },
      { icon: Mic, label: "Rapportino", url: "/campo/rapportino-vocale", color: "text-violet-600 bg-violet-50" },
      { icon: QrCode, label: "Tesserino", url: "/campo/tesserino", color: "text-blue-600 bg-blue-50" },
      { icon: CalendarDaysIcon, label: "Ferie", url: "/campo/ferie", color: "text-orange-600 bg-orange-50" },
      { icon: Clock, label: "Presenze", url: "/campo/presenze", color: "text-teal-600 bg-teal-50" },
      { icon: Receipt, label: "Cedolini", url: "/campo/cedolini", color: "text-pink-600 bg-pink-50" },
      { icon: FileText, label: "Documenti", url: "/campo/documenti", color: "text-slate-600 bg-slate-50" },
      { icon: Ticket, label: "Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
    ] : []),
    ...(isSubappaltatore ? [
      { icon: ClipboardCheck, label: "SAL", url: "/campo/sal", color: "text-emerald-600 bg-emerald-50" },
      { icon: FileText, label: "Documenti", url: "/campo/documenti", color: "text-blue-600 bg-blue-50" },
      { icon: MessageSquare, label: "Chat", url: "/campo/chat", color: "text-violet-600 bg-violet-50" },
      { icon: Ticket, label: "Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
    ] : []),
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">Azioni rapide</p>
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {items.map((item) => {
          const [textColor, bgColor] = item.color.split(" ");
          return (
            <button
              key={item.url + item.label}
              onClick={() => navigate(item.url)}
              className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl transition-all active:scale-95 hover:bg-muted/60"
            >
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${bgColor} flex items-center justify-center`}>
                <item.icon className={`w-6 h-6 md:w-7 md:h-7 ${textColor}`} />
              </div>
              <span className="text-[11px] md:text-xs font-medium text-foreground text-center leading-tight line-clamp-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
