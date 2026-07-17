/**
 * TimbraturePersonali — pagina timbratura per dipendente ufficio (company_staff)
 * Riusa i hook HR già esistenti: useMyHrProfilo, useMyTodayTimbrature, useTimbra
 * Nessun GPS richiesto — timbratura sede ufficio
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInMinutes, parseISO, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import {
  LogIn, LogOut, Coffee, PauseCircle, Clock, CalendarDays,
  Building2, AlertTriangle, CheckCircle2, Loader2, UserX, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useMyHrProfilo,
  useMyTodayTimbrature,
  useTimbra,
} from "@/hooks/useTimbratura";
import { useAuth } from "@/contexts/AuthContext";
import { RichiesteHrPersonali } from "@/components/hr/RichiesteHrPersonali";
import type { HrTimbratura, TimbraturaTipo } from "@/types/hr";
import { cn } from "@/lib/utils";

// ── Calcolo ore lavorate da array di timbrature ────────────────────────────
function calcolaOreLavorate(timbrs: HrTimbratura[]): number {
  let minutiPausa = 0;
  const entrata = timbrs.find(t => t.tipo === "entrata");
  const uscita = timbrs.find(t => t.tipo === "uscita");
  if (!entrata) return 0;
  const fine = uscita ? parseISO(uscita.timestamp) : new Date();
  const minuti = differenceInMinutes(fine, parseISO(entrata.timestamp));
  for (let i = 0; i < timbrs.length - 1; i++) {
    const cur = timbrs[i];
    const nxt = timbrs[i + 1];
    const isPausaStart = cur.tipo === "pausa_inizio" || cur.tipo === "inizio_pausa";
    const isPausaEnd = nxt.tipo === "pausa_fine" || nxt.tipo === "fine_pausa";
    if (isPausaStart && isPausaEnd) {
      minutiPausa += differenceInMinutes(parseISO(nxt.timestamp), parseISO(cur.timestamp));
    }
  }
  return Math.max(0, (minuti - minutiPausa) / 60);
}

// ── Stato corrente basato sull'ultima timbratura ───────────────────────────
type StatoTimbratura = "non_timbrato" | "dentro" | "in_pausa" | "uscito";

function getStato(timbrs: HrTimbratura[]): StatoTimbratura {
  if (!timbrs.length) return "non_timbrato";
  const last = timbrs[timbrs.length - 1];
  if (last.tipo === "uscita") return "uscito";
  if (last.tipo === "pausa_inizio" || last.tipo === "inizio_pausa") return "in_pausa";
  if (last.tipo === "entrata" || last.tipo === "pausa_fine" || last.tipo === "fine_pausa") return "dentro";
  return "non_timbrato";
}

// ── Azione successiva logica ───────────────────────────────────────────────
type NextAction = { tipo: TimbraturaTipo; label: string; icon: React.ElementType; variant: string } | null;

function getNextAction(stato: StatoTimbratura, hasEntrata: boolean): NextAction {
  if (stato === "non_timbrato" || (!hasEntrata && stato === "uscito")) {
    return { tipo: "entrata", label: "TIMBRA ENTRATA", icon: LogIn, variant: "bg-green-600 hover:bg-green-700" };
  }
  if (stato === "dentro") {
    return { tipo: "pausa_inizio", label: "INIZIA PAUSA", icon: Coffee, variant: "bg-amber-500 hover:bg-amber-600" };
  }
  if (stato === "in_pausa") {
    return { tipo: "pausa_fine", label: "FINE PAUSA", icon: PauseCircle, variant: "bg-amber-500 hover:bg-amber-600" };
  }
  return null;
}

// ── Badge stato ────────────────────────────────────────────────────────────
const STATO_CONFIG: Record<StatoTimbratura, { label: string; className: string }> = {
  non_timbrato: { label: "Non timbrato", className: "bg-muted text-muted-foreground" },
  dentro: { label: "Dentro", className: "bg-green-100 text-green-800 border-green-200" },
  in_pausa: { label: "In pausa", className: "bg-amber-100 text-amber-800 border-amber-200" },
  uscito: { label: "Uscito", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

// ── Mesi per il selettore ──────────────────────────────────────────────────
function getMesiRecenti(): { value: string; label: string }[] {
  const result = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: it }),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TimbraturePersonali() {
  const companyId = useEffectiveCompanyId();
  const { role } = useAuth();
  const { data: profilo, isLoading: loadingProfilo } = useMyHrProfilo();
  const { data: timbratureOggi = [], isLoading: loadingOggi } = useMyTodayTimbrature(profilo?.id);
  const timbraMutation = useTimbra();

  const mesiRecenti = getMesiRecenti();
  const [meseSelezionato, setMeseSelezionato] = useState(mesiRecenti[0].value);

  // Storico mese
  const { data: storicoMese = [], isLoading: loadingStorico } = useQuery({
    queryKey: ["my-timbrature-mese", profilo?.id, meseSelezionato],
    queryFn: async () => {
      const [y, m] = meseSelezionato.split("-");
      const start = `${y}-${m}-01`;
      const end = format(endOfMonth(new Date(Number(y), Number(m) - 1)), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*")
        .eq("profilo_id", profilo!.id)
        .gte("data_evento", start)
        .lte("data_evento", end)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HrTimbratura[];
    },
    enabled: !!profilo?.id,
    staleTime: 2 * 60 * 1000,
  });

  // ── Guard ruolo: solo company_staff e company_admin ───────────────────
  if (role && !["company_staff", "company_admin"].includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Accesso non autorizzato</h3>
        <p className="text-muted-foreground mt-2">
          Questa sezione non è disponibile per il tuo ruolo.
        </p>
      </div>
    );
  }

  // ── Caricamento ────────────────────────────────────────────────────────
  if (loadingProfilo) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  // ── Nessun profilo HR ─────────────────────────────────────────────────
  if (!profilo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <UserX className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Profilo HR non configurato</h3>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Il tuo profilo HR non è ancora stato configurato.
          Contatta l'amministratore per completare la configurazione.
        </p>
      </div>
    );
  }

  const stato = getStato(timbratureOggi);
  const hasEntrata = timbratureOggi.some(t => t.tipo === "entrata");
  const nextAction = getNextAction(stato, hasEntrata);
  const canExit = (stato === "dentro" || stato === "in_pausa");
  const oreOggi = calcolaOreLavorate(timbratureOggi);
  const { label: statoLabel, className: statoClass } = STATO_CONFIG[stato];

  // Raggruppa storico per giorno
  const storicoByDay: Record<string, HrTimbratura[]> = {};
  storicoMese.forEach(t => {
    const day = t.data_evento;
    if (!storicoByDay[day]) storicoByDay[day] = [];
    storicoByDay[day].push(t);
  });
  const giorni = Object.keys(storicoByDay).sort((a, b) => b.localeCompare(a));

  // Riepilogo mese
  const totalMinutiMese = Object.values(storicoByDay).reduce((acc, ts) => {
    return acc + calcolaOreLavorate(ts) * 60;
  }, 0);
  const oreTotatliMese = totalMinutiMese / 60;
  const giorniPresenti = Object.values(storicoByDay).filter(ts => ts.some(t => t.tipo === "entrata")).length;
  const oreAttese = profilo.ore_giornaliere * giorniPresenti;

  return (
    <div className="space-y-4">
      {/* Header compatto */}
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="h-[18px] w-[18px] text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight">Le mie Timbrature</h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
          </p>
        </div>
      </div>

      {/* Banner sede ufficio */}
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
        <Building2 className="h-4 w-4 shrink-0" />
        <span>Sede ufficio — nessun GPS richiesto</span>
      </div>

      {/* BLOCCO A — Timbratura oggi */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Oggi</CardTitle>
            <Badge variant="outline" className={cn("text-xs font-medium", statoClass)}>
              {statoLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ore lavorate */}
          {hasEntrata && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Ore lavorate oggi:{" "}
                <span className="font-semibold text-foreground">
                  {Math.floor(oreOggi)}h {Math.round((oreOggi % 1) * 60)}m
                </span>
              </span>
            </div>
          )}

          {/* Timeline timbrature di oggi */}
          {loadingOggi ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : timbratureOggi.length > 0 ? (
            <div className="space-y-1">
              {timbratureOggi.map((t) => {
                const tipoLabel: Record<string, string> = {
                  entrata: "Entrata",
                  uscita: "Uscita",
                  pausa_inizio: "Pausa",
                  inizio_pausa: "Pausa",
                  pausa_fine: "Fine pausa",
                  fine_pausa: "Fine pausa",
                };
                const tipoIcon: Record<string, React.ElementType> = {
                  entrata: LogIn,
                  uscita: LogOut,
                  pausa_inizio: Coffee,
                  inizio_pausa: Coffee,
                  pausa_fine: PauseCircle,
                  fine_pausa: PauseCircle,
                };
                const Icon = tipoIcon[t.tipo] ?? Clock;
                return (
                  <div key={t.id} className="flex items-center gap-3 py-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-0.5" />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground w-20">{tipoLabel[t.tipo] ?? t.tipo}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {format(parseISO(t.timestamp), "HH:mm")}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna timbratura oggi</p>
          )}

          {/* Bottoni azione */}
          <div className="flex flex-wrap gap-3 pt-2">
            {nextAction && (
              <Button
                className={cn("text-white font-semibold flex-1 sm:flex-none", nextAction.variant)}
                disabled={timbraMutation.isPending}
                onClick={() =>
                  timbraMutation.mutate({
                    companyId: companyId!,
                    profiloId: profilo.id,
                    tipo: nextAction.tipo,
                    gps: null,
                  })
                }
              >
                {timbraMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <nextAction.icon className="h-4 w-4 mr-2" />
                )}
                {nextAction.label}
              </Button>
            )}
            {canExit && (
              <Button
                variant="outline"
                className="flex-1 sm:flex-none border-red-200 text-red-700 hover:bg-red-50"
                disabled={timbraMutation.isPending}
                onClick={() =>
                  timbraMutation.mutate({
                    companyId: companyId!,
                    profiloId: profilo.id,
                    tipo: "uscita",
                    gps: null,
                  })
                }
              >
                <LogOut className="h-4 w-4 mr-2" />
                TIMBRA USCITA
              </Button>
            )}
            {stato === "uscito" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Giornata completata
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* BLOCCO B + C — Storico e riepilogo mese */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Riepilogo ore mensili */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Riepilogo mese
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Ore lavorate</span>
              <span className="font-semibold">
                {Math.floor(oreTotatliMese)}h {Math.round((oreTotatliMese % 1) * 60)}m
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Giorni presenti</span>
              <span className="font-semibold">{giorniPresenti}</span>
            </div>
            {oreAttese > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ore mancanti</span>
                <span className={cn("font-semibold", oreTotatliMese < oreAttese ? "text-red-600" : "text-green-600")}>
                  {oreTotatliMese < oreAttese
                    ? `${Math.floor(oreAttese - oreTotatliMese)}h ${Math.round(((oreAttese - oreTotatliMese) % 1) * 60)}m`
                    : "Completato"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storico timbrature */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Storico</CardTitle>
              <Select value={meseSelezionato} onValueChange={setMeseSelezionato}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mesiRecenti.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingStorico ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : giorni.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessuna timbratura per questo mese
              </p>
            ) : (
              <div className="space-y-2">
                {giorni.map(giorno => {
                  const ts = storicoByDay[giorno];
                  const ore = calcolaOreLavorate(ts);
                  const hasEntrata = ts.some(t => t.tipo === "entrata");
                  const hasUscita = ts.some(t => t.tipo === "uscita");
                  const isAnomalia = hasEntrata && !hasUscita;
                  const entrata = ts.find(t => t.tipo === "entrata");
                  const uscita = ts.find(t => t.tipo === "uscita");

                  return (
                    <div
                      key={giorno}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                        isAnomalia ? "bg-amber-50 border border-amber-200" : "bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isAnomalia && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                        <span className="font-medium capitalize">
                          {format(parseISO(giorno), "EEE d MMM", { locale: it })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        {entrata && (
                          <span className="tabular-nums text-xs">
                            {format(parseISO(entrata.timestamp), "HH:mm")} →{" "}
                            {uscita ? format(parseISO(uscita.timestamp), "HH:mm") : "—"}
                          </span>
                        )}
                        <span className="font-medium text-foreground tabular-nums">
                          {Math.floor(ore)}h{Math.round((ore % 1) * 60).toString().padStart(2, "0")}
                        </span>
                        {isAnomalia && (
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                            Anomalia
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCCO D — Richieste e segnalazioni all'HR / amministrazione */}
      <RichiesteHrPersonali companyId={companyId!} profiloId={profilo.id} />
    </div>
  );
}
