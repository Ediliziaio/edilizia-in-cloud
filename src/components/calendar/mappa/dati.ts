import { getOrderWorkPeriods } from "@/lib/calendar/planning";
import type { CalendarOrder } from "@/types/calendar";
import type { MarketingAppointment } from "@/types/marketingCalendar";
import { coordinate, dataAdiacente, minuti, type Coordinate, type Tappa } from "../../../../shared/mappa-operativa/calcoli";

export type Risorsa = { id: string; nome: string; tipo: "commerciale" | "operaio" | "squadra" | "mezzo" };
export type Attivita = { id: string; nome: string; inizio: number | null; fine: number | null; risorse: Risorsa[]; stato?: string };
export type VoceMappa = Tappa & {
  tipo: "appuntamento" | "cantiere";
  indirizzo: string;
  stato: string;
  motivo?: string;
  escluso?: boolean;
  cliente?: string | null;
  attivita: Attivita[];
  link?: string;
  base?: Coordinate | null;
};
export type AppuntamentoMappa = MarketingAppointment & {
  address_line?: string | null; address_postal_code?: string | null; address_city?: string | null;
  address_province?: string | null; address_country?: string | null; place_id?: string | null;
  cancelled_at?: string | null;
};

const annullati = new Set(["annullato","annullata","cancelled","canceled","cancellato","cancellata","disdetto","no_show"]);
export const etichettaStato = (stato: string) => ({
  scheduled: "Pianificato", confirmed: "Confermato", completed: "Completato", cancelled: "Annullato",
  no_show: "Assente", programmato: "Programmato", in_corso: "In corso", da_fare: "Da fare",
}[stato] ?? stato.replaceAll("_", " ").replace(/^./, c => c.toLocaleUpperCase("it")));

function orari(inizio: string | null | undefined, fine: string | null | undefined, defaultDurata?: number) {
  const da = minuti(inizio);
  const a = minuti(fine);
  return { inizio: da, fine: da == null ? a : a == null ? (defaultDurata ? da + defaultDurata : null) : a < da ? a + 1440 : a };
}

export function appuntamentiMappa(
  appuntamenti: AppuntamentoMappa[], giorno: string,
  calendari: { id: string; base_lat: number | null; base_lng: number | null; base_place_id: string | null; duration_minutes: number }[],
): VoceMappa[] {
  const basi = new Map(calendari.map(c => [c.id, c]));
  return appuntamenti.flatMap(a => {
    if (!a.calendar_id || a.is_blocked_slot) return [];
    const base = basi.get(a.calendar_id);
    const fascia = orari(a.appointment_time, a.appointment_end_time, base?.duration_minutes ?? 60);
    const precedente = a.appointment_date === dataAdiacente(giorno, -1) && (fascia.fine ?? 0) > 1440;
    if (a.appointment_date !== giorno && !precedente) return [];
    const stato = a.status.toLowerCase();
    const remoto = !!a.meeting_url || (!!a.meeting_provider && a.meeting_provider !== "none") ||
      ["online", "videochiamata", "telefono", "telefonata"].includes(a.appointment_type);
    const escluso = !!a.cancelled_at || annullati.has(stato) || remoto;
    const indirizzo = a.formatted_address?.trim() || [a.address_line, a.address_postal_code, a.address_city, a.address_province, a.address_country]
      .map(v => v?.trim()).filter(Boolean).join(", ");
    const inizio = precedente ? 0 : fascia.inizio;
    const fine = precedente ? (fascia.fine ?? 1440) - 1440 : fascia.fine;
    return [{
      id: a.id, tipo: "appuntamento", titolo: a.title, cliente: a.contact_name,
      indirizzo, punto: escluso || a.place_id ? null : coordinate(a.lat, a.lng),
      motivo: remoto ? "Appuntamento da remoto" : escluso ? "Appuntamento annullato" : a.place_id ? "Verifica la posizione per questa cartografia" : undefined,
      escluso, stato, inizio, fine,
      base: base && !base.base_place_id ? coordinate(base.base_lat, base.base_lng) : null,
      attivita: [{
        id: a.id, nome: a.title, inizio, fine,
        risorse: a.assigned_to ? [{ id: a.assigned_to, nome: a.assigned_name || "Commerciale assegnato", tipo: "commerciale" }] : [],
      }],
    }];
  });
}

export function cantieriMappa(ordini: CalendarOrder[], giorno: string, personale: boolean, personeVisibili: boolean): VoceMappa[] {
  return ordini.flatMap(o => {
    const attivita = getOrderWorkPeriods(o).flatMap(f => {
      const fascia = orari(f.start_time ?? o.work_start_time, f.end_time ?? o.work_end_time);
      const prima = dataAdiacente(giorno, -1);
      const oggi = giorno >= f.start_date && giorno <= f.end_date;
      const precedente = prima >= f.start_date && prima <= f.end_date && (fascia.fine ?? 0) > 1440;
      const attivita = (data: string, oltreMezzanotte: boolean): Attivita => ({
        id: f.id + (oltreMezzanotte ? ":continua" : ""), nome: f.name, stato: f.status,
        inizio: oltreMezzanotte ? 0 : fascia.inizio, fine: oltreMezzanotte ? (fascia.fine ?? 1440) - 1440 : fascia.fine,
        risorse: personeVisibili ? f.resources.filter(r => r.start_date <= data && r.end_date >= data)
          .map((r): Risorsa => ({
            id: r.resourceId, nome: r.resourceName, tipo: r.resourceType === "team" ? "squadra" : "operaio",
          })) : [],
      });
      return [...(precedente ? [attivita(prima, true)] : []), ...(oggi ? [attivita(giorno, false)] : [])];
    });
    if (!attivita.length) return [];
    const inizi = attivita.flatMap(a => a.inizio == null ? [] : [a.inizio]);
    const fini = attivita.flatMap(a => a.fine == null ? [] : [a.fine]);
    return [{
      id: o.id, tipo: "cantiere", titolo: [o.order_code, o.description].filter(Boolean).join(" · ") || "Cantiere",
      stato: o.status?.name ?? "Pianificato", inizio: inizi.length ? Math.min(...inizi) : null,
      fine: fini.length ? Math.max(...fini) : null,
      indirizzo: o.indirizzo_lavori?.trim() || o.work_address?.trim() || "",
      punto: coordinate(o.work_lat, o.work_lng),
      link: personale ? `/campo/lavoro/${o.id}` : `/azienda/ordini/${o.id}`,
      attivita,
    }];
  });
}
