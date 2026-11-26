/**
 * Home dell'area campo — dashboard stile AttivitaStaff.
 * Timbratura integrata, cantieri assegnati, attività e accesso rapido.
 * Condizionale per operaio vs subappaltatore.
 */
import { InterventiDelGiorno } from "@/components/campo/InterventiDelGiorno";
import { giornoRoma } from "@/lib/campo/interventi";
import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, startOfDay, isBefore, addDays, startOfWeek } from "date-fns";
import {
  MapPin, ChevronRight, ChevronLeft,
  CheckCircle, Clock,
  CalendarDays, ClipboardCheck, CloudUpload,
  Sparkles, Navigation, Send, FilePenLine, Users
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useIsMobile } from "@/hooks/use-mobile";
import { CampoCrewAgenda } from "@/components/campo/CampoCrewAgenda";
import { CampoOggi } from "@/components/campo/CampoOggi";
import { CantieriTecniciLink } from "@/components/campo/CantieriTecniciLink";
import { AzioniAlVolo } from "@/components/campo/AzioniAlVolo";
import { FineGiornataCaposquadra } from "@/components/campo/FineGiornataCaposquadra";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { InterventiCampo } from "@/components/campo/InterventiCampo";
import { useMiaGiornata } from "@/hooks/campo/useCampoGiornata";
import { CampoTimbroCard } from "@/components/campo/CampoTimbroCard";
import { useTimbraDallApp } from "@/hooks/campo/useTimbraDallApp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvvisiCampo } from "@/components/campo/AvvisiCampo";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { MioMezzoCampoCard } from "@/components/mezzi/MioMezzoCampoCard";
import { RapportiniDaCompilareOggi, RapportiniSospesi } from "@/components/campo/RapportiniDaFare";
import { useCampoRapportiniDaCompilare } from "@/hooks/useCampoRapportiniDaCompilare";
import { isNative } from "@/lib/mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { giorniRitardoCantiere, testoRitardoCantiere } from "@/lib/campo/ritardoCantiere";
import { AvvisoScadenzePersonali } from "@/components/campo/AvvisoScadenzePersonali";
import { dateFnsCampo, intlCampo, useLinguaCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CHIP, PILLOLA_PICCOLA, TITOLO_RIQUADRO } from "@/lib/campo/stileCampo";
import { useDaFareOggi } from "@/hooks/campo/useDaFareOggi";

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

/** Iniziali dei giorni, da lunedì, nella lingua dell'operaio (in italiano: Lun, Mar, Mer…). */
const giorniSettimana = () => {
  const lunedi = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => format(addDays(lunedi, i), "EEE", { locale: dateFnsCampo() }).replace(/\.$/, ""))
    .map(g => g.charAt(0).toLocaleUpperCase(intlCampo()) + g.slice(1));
};

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
  const { profile, user, effectiveCompany } = useAuth();
  const { t, lingua } = useLinguaCampo();
  const { isOperaio, isSubappaltatore } = useIsCampo();
  const magazzino = useCampoMagazzinoConfig(isOperaio);
  const timbraApp = useTimbraDallApp();
  const azienda = effectiveCompany?.id ?? profile?.company_id;
  // Sul telefono i blocchi nascosti col CSS (`hidden md:block`) erano comunque montati: ognuno faceva le sue
  // richieste a vuoto a ogni apertura della Home. Qui non si montano proprio.
  const isMobile = useIsMobile();
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

  // «Oggi» e l'elenco dei cantieri dicono la stessa cosa: sul telefono, se «Oggi» c'è, l'elenco sta in «Lavori».
  // Stessa richiesta di CampoOggi (stessa chiave): non costa niente in più.
  const giornata = useMiaGiornata(14);
  const dayTime = useCampoDayTime(user?.id, profile?.company_id ?? null);
  const giorni = giornata.data?.giorni ?? [];
  const isCaposquadra = giorni.some(g => g.cantieri.some(c => c.squadra?.sono_caposquadra));
  const oggiVisibile = giornata.isLoading
    || (!giornata.isError && !!giorni[0] && (giorni[0].cantieri.length > 0 || giorni.slice(1).some(g => g.cantieri.length > 0)));

  const ora = new Date().getHours();
  const saluto = t(ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera");
  const sera = ora >= 15;
  return (
    <div className="mx-auto max-w-4xl space-y-3 md:space-y-6">
      {/* Header — compatto su mobile */}
      <div className="rounded-2xl border bg-background p-4 shadow-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="capitalize text-xs text-muted-foreground md:text-sm">
                {lingua.codice === "it" ? format(new Date(), "EEEE d MMMM yyyy", { locale: dateFnsCampo() })
                  : new Intl.DateTimeFormat(intlCampo(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
              </p>
              {isOperaio && isCapocantiere && (
                <span className={cn(CHIP, "bg-primary/10 text-primary md:hidden")}>{t("Capocantiere")}</span>
              )}
              {isOperaio && isCaposquadra && (
                <span className={cn(CHIP, "bg-orange-100 text-orange-800 md:hidden")}>{t("Caposquadra")}</span>
              )}
            </div>
            <h1 className="truncate text-[17px] font-bold tracking-tight md:text-2xl">{saluto}, {profile?.first_name ?? ""}</h1>
          </div>
          <Link to="/campo/invii" aria-label={t("Invii e bozze")} className={cn(PILLOLA_PICCOLA, "min-h-11 min-w-11 shrink-0 px-3")}>
            <CloudUpload className="size-4" aria-hidden="true" /><span className="max-[355px]:sr-only">{t("Invii")}</span>
          </Link>
        </div>
      </div>

      {/* Timbratura: l'azione di ogni mattina, in cima. Un tocco per iniziare, un tocco per ogni posto. */}
      {/* Chi non timbra dall'app (scelta dell'ufficio nella scheda persona) non vede il riquadro: una riga lo dice. */}
      {/* Azienda e persona: una regola sola (useTimbraDallApp, 26/11/2026). */}
      {isOperaio && (!timbraApp.timbra
        ? <p className="px-1 text-xs text-muted-foreground">{timbraApp.motivo === "azienda"
            ? t("In questa azienda non si timbra dall'app: le ore le segna il caposquadra o l'ufficio.")
            : t("Non timbri dall'app: le tue ore le segna il caposquadra o l'ufficio.")}</p>
        : <CampoTimbroCard />)}

      {/* Visita medica, corsi, patentini scaduti o in scadenza: solo se c'è qualcosa (collaudo 23/11). */}
      {isOperaio && <AvvisoScadenzePersonali />}

      {/* Senza il permesso gli avvisi restano nella campanella. L'app nativa ha le sue push. */}
      {import.meta.env.PROD && !isNative && (
        <AvvisiCampo momentoGiusto={isSubappaltatore || dayTime.todayPunches.length > 0} />
      )}

      {/* A fine giornata il rapportino è la cosa che aspetta: sta sopra, non in fondo alla pagina. */}
      {/* La sera il caposquadra vede la fine giornata guidata (24/11): rapportino, materiale, uscita. */}
      {isOperaio && sera && (isCaposquadra || isCapocantiere) && <FineGiornataCaposquadra timbra={timbraApp.timbra} />}
      {isOperaio && sera && <RapportiniDaCompilareOggi />}

      {/* Gli interventi brevi di oggi (manutenzioni, assistenze), in ordine di orario: prima dei cantieri lunghi. */}
      {isOperaio && <InterventiDelGiorno giorno={giornoRoma(new Date().toISOString())} />}

      {/* Oggi: dove vai, cosa fai, con chi e chi chiamare — le TUE date */}
      {(isOperaio || isSubappaltatore) && <CampoOggi memoria={azienda && user?.id ? `${azienda}:${user.id}` : undefined}
        puoPrelevare={isOperaio && !magazzino.isError && magazzino.data?.livello === "prelievi"} />}

      {/* Mezzo col QR, scontrino, materiale, problema: a un tocco (24/11). */}
      {isOperaio && <AzioniAlVolo />}

      {isOperaio && <CantieriTecniciLink />}
      {isOperaio && <CampoCrewAgenda />}

      {/* Da fare: prima le cose che aspettano te */}
      <div className="space-y-3 md:space-y-6">
        {isOperaio && !sera && <RapportiniDaCompilareOggi />}
        {isOperaio && <RapportiniSospesi />}
        {(isOperaio || isSubappaltatore) && <InterventiCampo />}
        {isOperaio && <MioMezzoCampoCard />}
        {isSubappaltatore && <CantieriSub />}
      </div>

      {/* Niente griglia «Azioni rapide»: ripeteva il menu Altro (e la sidebar da desktop).
          La Home dice solo: timbra, dove vai oggi, cosa aspetta te. */}

      {/* Sul telefono bastano Oggi e Da fare: l'elenco dei cantieri è in «Lavori», il calendario
          e l'assistente da tablet in su. Quando «Oggi» non c'è, l'elenco dei cantieri resta. */}
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
        {!(isMobile && oggiVisibile) && (
          <div className="space-y-3 md:space-y-6">
            {isOperaio && <CantieriAssegnati />}
          </div>
        )}
        <div className="space-y-3 md:space-y-6">
          {!isMobile && isOperaio && <AssistenteCampoOperaio />}
          {!isMobile && <MiniCalendarioCampo />}
          <MieAttivitaCampo />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Assistente Campo Operaio — guida pratica con dati già presenti
// ─────────────────────────────────────────────────────────────────────────────
function AssistenteCampoOperaio() {
  const timbraQui = useTimbraDallApp().timbra;
  const t = useT();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: rapportiniMancanti = [] } = useCampoRapportiniDaCompilare(user?.id);

  // The home, calendar and assistant share one tenant/user-scoped assignment model.
  const { data: lavori = [], isLoading } = useCampoAssignments();

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

  // Il cantiere di oggi secondo le MIE date (fasi e squadra), se c'è.
  const { data: giornata } = useMiaGiornata(14);
  const cantiereDiOggi = giornata?.giorni?.[0]?.cantieri?.[0]?.order_id ?? null;
  const prossimoLavoro = useMemo(() => {
    if (!lavori.length) return null;
    const diOggi = cantiereDiOggi ? lavori.find((l) => l.order?.id === cantiereDiOggi) : undefined;
    if (diOggi) return diOggi;
    const today = startOfDay(new Date()).getTime();
    const sortable = [...lavori].sort((a, b) => {
      const aStart = a.order?.work_start_date ? startOfDay(new Date(a.order.work_start_date)).getTime() : today;
      const bStart = b.order?.work_start_date ? startOfDay(new Date(b.order.work_start_date)).getTime() : today;
      const aScore = aStart >= today ? aStart : today + Math.abs(today - aStart);
      const bScore = bStart >= today ? bStart : today + Math.abs(today - bStart);
      return aScore - bScore;
    });
    return sortable[0] ?? null;
  }, [lavori, cantiereDiOggi]);

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
    ? t("Prima chiudi il rapportino: aggiorna ore, diario lavori e avanzamento del cantiere.")
    : prossimoTask
      ? t("Parti dalla task più urgente, poi timbra sul cantiere e manda il rapportino a fine lavoro.")
      : focusOrder
        ? t("Vai al cantiere e timbra collegando la commessa. Nel giornaliero trovi le indicazioni scelte dalla tua azienda: puoi scrivere o parlare.")
        : t("Nessun cantiere prioritario trovato: controlla calendario o chiedi indicazioni al responsabile.");

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
              {t("AI Campo")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Ti dice cosa fare adesso e cosa non dimenticare.")}
            </p>
          </div>
          <Badge className={focusRapportino ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
            {focusRapportino ? t("Azione richiesta") : t("Pronto")}
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
                {t("Prossima mossa")}
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                {suggestion}
              </p>
              {focusOrder && (
                <div className="mt-2 min-w-0 rounded-xl bg-muted/60 px-3 py-2">
                  <p className="truncate text-sm font-bold">{focusOrder.order_code ?? t("Cantiere")}</p>
                  <p dir="auto" className="truncate text-xs text-muted-foreground">{focusOrder.description ?? t("Nessuna descrizione")}</p>
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
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("Task consigliata")}</p>
              <p dir="auto" className="truncate text-sm font-semibold">{prossimoTask.title}</p>
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
              {t("Lavoro")}
            </Button>
          )}
          {focusOrder && timbraQui && (
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => navigate(`/campo/timbratura?order_id=${focusOrder.id}`)}
            >
              <Clock className="h-4 w-4" />
              {t("Timbra")}
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
              className="h-10 gap-2 bg-primary/10 text-primary hover:bg-primary/15"
              onClick={() => navigate(`/campo/lavoro/${focusRapportino.order_id}/rapportino?data=${focusRapportino.data_lavoro}`)}
            >
              <Send className="h-4 w-4" />
              {t("Invia")}
            </Button>
          ) : null}
        </div>

        <div className="hidden md:flex flex-wrap gap-1.5">
          {["aggiorna Ore", "aggiorna Diario", "aggiorna Avanzamento", "aggiorna Foto"].map((item) => (
            <span key={item} className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {t(item)}
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
  const t = useT();
  const { data: lavori = [], isLoading, isError, refetch, isFetching } = useCampoAssignments();
  const oggiCampo = useCampoWorkDay();
  // Cosa c'è da fare oggi su ogni cantiere (collaudo 23/11): le fasi in corso o già partite.
  const daFare = useDaFareOggi(lavori.map(a => a.order?.id));
  return (
    <section aria-labelledby="cantieri-assegnati" className="rounded-2xl border bg-background p-3 shadow-sm md:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="cantieri-assegnati" className={TITOLO_RIQUADRO}>{t("I tuoi cantieri")}</h2>
        {lavori.length > 0 && <span className={cn(CHIP, "bg-muted text-muted-foreground")}>{lavori.length}</span>}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <div role="alert" className="space-y-2 py-4 text-center">
          <p className="text-sm">{t("Non riesco a caricare i cantieri assegnati.")}</p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => refetch()} disabled={isFetching}>{t("Riprova")}</Button>
        </div>
      ) : lavori.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t("Nessun cantiere assegnato")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lavori.map(a => {
            const giorni = giorniRitardoCantiere(a.order?.work_end_date, oggiCampo, a.order?.status);
            const perc = a.order?.percentuale_avanzamento ?? 0;
            const fasi = daFare.get(a.order?.id ?? "")?.fasi ?? [];
            return (
              <li key={a.id} className="rounded-2xl border bg-muted/30">
                <button type="button" onClick={() => navigate(`/campo/lavoro/${a.order?.id}`)}
                  className="flex w-full items-start gap-2 p-3 text-left active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">{a.order?.order_code}</span>
                      {a.is_capocantiere && <span className={cn(CHIP, "bg-primary/10 text-primary")}>{t("Capocantiere")}</span>}
                    </span>
                    <span dir="auto" className="mt-0.5 line-clamp-2 block text-[15px] font-bold leading-snug">{a.order?.description}</span>
                    {a.order?.indirizzo_lavori && (
                      <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span dir="auto" className="truncate">{a.order.indirizzo_lavori}</span>
                      </span>
                    )}
                    {fasi.length > 0 && (
                      <span className="mt-1.5 block text-[13px]">
                        <span className="text-muted-foreground">{t("Da fare oggi")}: </span>
                        <span dir="auto" className="font-semibold">{fasi.join(", ")}</span>
                      </span>
                    )}
                    <span className="mt-2 flex items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full bg-muted">
                        <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${perc}%` }} />
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{perc}%</span>
                    </span>
                    {giorni != null && <span className="mt-1 block text-xs font-semibold text-red-700 dark:text-red-400">{t(testoRitardoCantiere(giorni).replace(/\d+/, "{n}"), { n: giorni })}</span>}
                  </span>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                </button>
                {a.is_capocantiere && (
                  <div className="px-3 pb-3">
                    <Link to={`/campo/squadra/${a.order?.id}`}
                      className="flex min-h-11 items-center gap-2 rounded-full bg-orange-50 px-4 text-sm font-semibold text-orange-800 active:bg-orange-100">
                      <Users className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{t("Chi c'è oggi")}</span>
                      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cantieri Sub (subappaltatore)
// ─────────────────────────────────────────────────────────────────────────────
function CantieriSub() {
  const t = useT();
  const navigate = useNavigate();
  const { data: cantieri = [], isLoading, isError, refetch, isFetching } = useCampoAssignments();
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("Cantieri attivi")}</CardTitle>
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
            <p className="text-sm font-medium text-foreground">{t("Non riesco a caricare i cantieri")}</p>
            <p className="text-xs text-muted-foreground">{t("Controlla la connessione e riprova.")}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? t("Riprovo…") : t("Riprova")}
            </Button>
          </div>
        ) : cantieri.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-muted-foreground">{t("Nessun cantiere attivo")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cantieri.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/campo/lavoro/${c.order?.id}`)}
                className="w-full bg-muted/50 border rounded-lg p-3 text-left hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground">{c.order?.order_code}</p>
                    <p dir="auto" className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.order?.description}</p>
                    {c.order?.indirizzo_lavori && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span dir="auto" className="truncate">{c.order.indirizzo_lavori}</span>
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
// Mini Calendario mensile
// ─────────────────────────────────────────────────────────────────────────────
function MiniCalendarioCampo() {
  // «tr» e non «t»: qui sotto «t» è il nome di ogni attività nei .map.
  const tr = useT();
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
            <CalendarDays className="h-4 w-4" /> {tr("Calendario")}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: dateFnsCampo() })}
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
          {giorniSettimana().map(g => (
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
                        {tr("{data} — {n} attività", { data: format(day, "d MMMM", { locale: dateFnsCampo() }), n: dayTasks.length })}
                      </p>
                      {dayTasks.slice(0, 4).map((t: any) => (
                        <p key={t.id} dir="auto" className="text-xs text-muted-foreground truncate">• {t.title}</p>
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
              {isToday(selectedDate) ? tr("Oggi") : format(selectedDate, "d MMMM", { locale: dateFnsCampo() })}
              {selectedTasks.length > 0 && ` — ${tr("{n} attività", { n: selectedTasks.length })}`}
            </p>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{tr("Nessuna scadenza per questo giorno")}</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {selectedTasks.map((t: any) => {
                  const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                  const isDone = t.status === "completata";
                  return (
                    <div key={t.id} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${isDone ? "bg-green-50" : "bg-muted/50"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-green-500" : cfg.dotClass}`} />
                      <span dir="auto" className={`flex-1 truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                      <Badge className={`text-[11px] px-1.5 py-0 ${isDone ? "bg-green-100 text-green-700" : cfg.badgeClass}`}>
                        {isDone ? tr("Fatto") : tr(cfg.label)}
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
  const tr = useT();
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

  // Niente scheda «Nessuna attività in corso»: una scheda vuota è solo rumore.
  if (!isLoading && tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{tr("Le mie attività")}</CardTitle>
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
              {tr("Vedi tutte")} <ChevronRight className="w-3 h-3 ml-0.5" />
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
            {tr("Nessuna attività in corso")}
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
                    <p dir="auto" className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {t.order?.order_code && <span>{t.order.order_code}</span>}
                      {t.due_date && (
                        <span>{format(new Date(t.due_date), "d MMM", { locale: dateFnsCampo() })}</span>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-[11px] px-1.5 py-0 ${cfg.badgeClass}`}>{tr(cfg.label)}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

