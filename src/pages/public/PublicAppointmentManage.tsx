import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isBefore, startOfDay, parse } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Pagina "gestisci appuntamento": il cliente arriva qui dal link ricevuto via
 * email e puo' spostare o disdire da solo, senza chiamare nessuno. Il token
 * nell'indirizzo e' l'unica chiave: niente account, e vale solo per quel
 * singolo appuntamento.
 */

interface Appuntamento {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  title: string;
  calendar_id: string;
  calendar_name: string;
  calendar_description: string | null;
  duration_minutes: number;
  booking_slug: string;
  min_notice_minutes: number | null;
}

const GIORNI_AVANTI = 60;

export default function PublicAppointmentManage() {
  const { token } = useParams<{ token: string }>();
  const [modo, setModo] = useState<"vista" | "sposta" | "disdici">("vista");
  const [giorno, setGiorno] = useState<Date | undefined>();
  const [slot, setSlot] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [esito, setEsito] = useState<"annullato" | "spostato" | null>(null);
  // Vedi PublicBooking: l'ora non si legge durante il render.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: app, isLoading, error, refetch } = useQuery({
    queryKey: ["appuntamento-gestione", token],
    queryFn: async () => {
      if (!token) return null;
      // Un solo appuntamento, e solo col suo codice. Prima si leggeva la vista
      // public_appointment_manage filtrandola qui: ma la vista era aperta a
      // chiunque, e senza filtro restituiva email e codici di tutte le
      // prenotazioni pubbliche.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc("appuntamento_pubblico_da_token", { p_token: token })
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Appuntamento | null;
    },
    enabled: !!token,
  });

  // Orari liberi del giorno scelto: stessa fonte della pagina di prenotazione.
  const dataStr = giorno ? format(giorno, "yyyy-MM-dd") : null;
  const { data: fasce = [] } = useQuery({
    queryKey: ["gestione-disponibilita", app?.calendar_id],
    queryFn: async () => {
      if (!app?.calendar_id) return [];
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("day_of_week, start_time, end_time, specific_date")
        .eq("calendar_id", app.calendar_id)
        .eq("is_enabled", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!app?.calendar_id && modo === "sposta",
  });
  const { data: presi = [] } = useQuery({
    queryKey: ["gestione-presi", app?.calendar_id, dataStr],
    queryFn: async () => {
      if (!app?.calendar_id || !dataStr) return [];
      const { data, error } = await supabase
        .from("public_appointment_slots")
        .select("id, appointment_time, appointment_end_time")
        .eq("calendar_id", app.calendar_id)
        .eq("appointment_date", dataStr)
        .or("is_blocked_slot.is.null,is_blocked_slot.eq.false");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!app?.calendar_id && !!dataStr && modo === "sposta",
  });

  const orari = useMemo(() => {
    if (!giorno || !app || !dataStr) return [];
    const durata = app.duration_minutes || 30;
    const dow = giorno.getDay();
    const perData = fasce.filter((f) => f.specific_date === dataStr);
    const valide = perData.length ? perData : fasce.filter((f) => f.specific_date === null && f.day_of_week === dow);
    const preavvisoMs = Math.max(0, app.min_notice_minutes ?? 0) * 60_000;
    const out: string[] = [];
    for (const f of valide) {
      const inizio = parse(String(f.start_time).slice(0, 5), "HH:mm", giorno);
      const fine = parse(String(f.end_time).slice(0, 5), "HH:mm", giorno);
      let cur = inizio;
      while (cur.getTime() + durata * 60_000 <= fine.getTime()) {
        const hhmm = format(cur, "HH:mm");
        const s = cur.getTime(), e = s + durata * 60_000;
        const occupato = presi.some((p) => {
          if (p.id === app.id) return false; // il proprio non blocca
          const ps = parse(String(p.appointment_time).slice(0, 5), "HH:mm", giorno).getTime();
          const pe = p.appointment_end_time
            ? parse(String(p.appointment_end_time).slice(0, 5), "HH:mm", giorno).getTime()
            : ps + durata * 60_000;
          return s < pe && e > ps;
        });
        if (!occupato && s > adesso + preavvisoMs) out.push(hhmm);
        cur = new Date(cur.getTime() + durata * 60_000);
      }
    }
    return [...new Set(out)].sort();
  }, [giorno, app, dataStr, fasce, presi, adesso]);

  const azione = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("public-booking-gestisci", {
        body: { token, origin: window.location.origin, ...payload },
      });
      if (error) {
        let msg = "";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) msg = String(((await ctx.clone().json()) as { error?: string })?.error ?? "");
        } catch { /* body non leggibile */ }
        throw new Error(msg || error.message || "Operazione non riuscita");
      }
      if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error?: string }).error));
      return data as { stato: "annullato" | "spostato" };
    },
    onSuccess: (d) => { setEsito(d.stato); void refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Schermo><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Carico l'appuntamento…</p></Schermo>;
  }
  if (error || !app) {
    return <Schermo><XCircle className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-3 text-lg font-semibold">Appuntamento non trovato</h1><p className="mt-1 text-sm text-muted-foreground">Il link potrebbe essere scaduto o già usato. Rispondi all'email di conferma e ti aiutiamo noi.</p></Schermo>;
  }

  const ora = String(app.appointment_time).slice(0, 5);
  const quando = `${format(new Date(`${app.appointment_date}T${ora}:00`), "EEEE d MMMM yyyy", { locale: it })} alle ${ora}`;
  const disdetto = ["annullato", "cancelled"].includes(app.status) || esito === "annullato";

  if (esito === "spostato") {
    return <Schermo><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><h1 className="mt-3 text-lg font-semibold">Appuntamento spostato</h1><p className="mt-1 text-sm text-muted-foreground">Ti abbiamo mandato l'email con il nuovo orario.</p></Schermo>;
  }
  if (disdetto) {
    return (
      <Schermo>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-3 text-lg font-semibold">Appuntamento disdetto</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quando vuoi puoi prenotarne un altro.</p>
        <Button asChild className="mt-4"><a href={`/prenota/${app.booking_slug}`}>Prenota un nuovo appuntamento</a></Button>
      </Schermo>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{app.calendar_name}</h1>
          <p className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> {quando}
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> {app.duration_minutes} minuti
          </p>
        </header>

        {modo === "vista" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModo("sposta")}>Sposta l'appuntamento</Button>
            <Button variant="outline" onClick={() => setModo("disdici")}>Disdici</Button>
          </div>
        )}

        {modo === "sposta" && (
          <div className="space-y-4 rounded-xl border p-4">
            <p className="text-sm font-medium">Scegli il nuovo giorno e orario</p>
            <Calendar
              mode="single" selected={giorno} onSelect={(d) => { setGiorno(d); setSlot(null); }}
              locale={it}
              disabled={(d) => isBefore(d, startOfDay(new Date())) || isBefore(addDays(new Date(), GIORNI_AVANTI), d)}
              className="rounded-md border"
            />
            {giorno && (
              orari.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {orari.map((o) => (
                    <Button key={o} variant={slot === o ? "default" : "outline"} size="sm" onClick={() => setSlot(o)}>{o}</Button>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Nessun orario libero in questo giorno.</p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setModo("vista"); setSlot(null); }}>Annulla</Button>
              <Button
                disabled={!giorno || !slot || azione.isPending}
                onClick={() => azione.mutate({ action: "sposta", date: dataStr, time: slot })}
              >
                {azione.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Conferma nuovo orario
              </Button>
            </div>
          </div>
        )}

        {modo === "disdici" && (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-medium">Vuoi disdire questo appuntamento?</p>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se vuoi, scrivici il motivo (facoltativo)" />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModo("vista")}>Torna indietro</Button>
              <Button variant="destructive" disabled={azione.isPending} onClick={() => azione.mutate({ action: "annulla", reason: motivo })}>
                {azione.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Disdici
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Schermo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  );
}
