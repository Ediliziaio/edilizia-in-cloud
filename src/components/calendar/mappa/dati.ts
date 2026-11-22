import { getOrderWorkPeriods } from "@/lib/calendar/planning";
import type { CalendarOrder } from "@/types/calendar";
import type { MarketingAppointment } from "@/types/marketingCalendar";
import { coordinate, dataAdiacente, minuti, ordineTappe, partiNelFuso, type Coordinate, type Tappa } from "../../../../shared/mappa-operativa/calcoli";

export type Risorsa = { id: string; nome: string; tipo: "commerciale" | "operaio" | "squadra" | "mezzo" };
export type Attivita = { id: string; nome: string; inizio: number | null; fine: number | null; risorse: Risorsa[]; stato?: string };
export type VoceMappa = Tappa & {
  tipo: "appuntamento" | "cantiere";
  indirizzo: string;
  stato: string;
  motivo?: string;
  orarioIncompleto?: boolean;
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

export type TappaOperativa = Tappa & { voce?: VoceMappa };

export function tappeOperative(voci: VoceMappa[], include: (a: Attivita) => boolean): TappaOperativa[] {
  const singole = ordineTappe(voci.flatMap(v => v.escluso ? [] : v.attivita.filter(include).map(a => ({
    id: v.tipo === "appuntamento" ? v.id : `${v.id}:${a.id}`, titolo: v.titolo, punto: v.punto,
    inizio: a.inizio, fine: a.fine, voce: { ...v, attivita: [a] },
  }))));
  const tappe: typeof singole = [];
  for (const t of singole) {
    const precedente = tappe.at(-1);
    if (t.voce.tipo === "cantiere" && precedente?.voce.id === t.voce.id &&
      precedente.inizio != null && precedente.fine != null && t.inizio != null && t.fine != null &&
      t.inizio <= precedente.fine) {
      precedente.fine = Math.max(precedente.fine, t.fine);
      precedente.voce.attivita.push(...t.voce.attivita);
    } else {
      tappe.push(t);
    }
  }
  return tappe;
}

export function timbratureDellaVisita<T extends { user_id: string; ora: string; tipo: string }>(
  eventi: T[], visita: Pick<VoceMappa, "inizio" | "fine">, giorno: string, utenti: ReadonlySet<string>,
) {
  const { inizio, fine } = visita;
  if (inizio == null || fine == null || !utenti.size) return [];
  const domani = fine >= 1440 ? dataAdiacente(giorno, 1) : "";
  return eventi.filter(evento => {
    if (!utenti.has(evento.user_id)) return false;
    const locale = partiNelFuso(evento.ora);
    if (locale.giorno !== giorno && locale.giorno !== domani) return false;
    const orario = minuti(locale.ora)! + (locale.giorno === domani ? 1440 : 0) +
      (new Date(evento.ora).getTime() % 60_000) / 60_000;
    const chiusura = ["uscita", "pausa_fine", "fine_pausa"].includes(evento.tipo);
    return chiusura ? orario > inizio && orario <= fine : orario >= inizio && orario < fine;
  });
}

export function dettagliTimbratura(tipo: string) {
  switch (tipo) {
    case "entrata": return { label: "Entrata", simbolo: "E" };
    case "uscita": return { label: "Uscita", simbolo: "U" };
    case "pausa_fine":
    case "fine_pausa": return { label: "Fine pausa", simbolo: "P" };
    default: return { label: "Inizio pausa", simbolo: "P" };
  }
}

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
  calendari: { id: string; owner_id?: string | null; calendar_type?: string | null; base_lat: number | null;
    base_lng: number | null; base_place_id: string | null; duration_minutes: number }[],
  utente?: string,
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
    const partiIndirizzo = [a.address_line, a.address_postal_code, a.address_city, a.address_province]
      .map(v => v?.trim()).filter(Boolean);
    const indirizzo = a.formatted_address?.trim() || (partiIndirizzo.length
      ? [...partiIndirizzo, a.address_country?.trim()].filter(Boolean).join(", ") : "");
    const inizio = precedente ? 0 : fascia.inizio;
    const fine = precedente ? (fascia.fine ?? 1440) - 1440 : fascia.fine;
    return [{
      id: a.id, tipo: "appuntamento", titolo: a.title, cliente: a.contact_name,
      indirizzo, punto: escluso || a.place_id ? null : coordinate(a.lat, a.lng),
      motivo: remoto ? "Appuntamento da remoto" : escluso ? "Appuntamento annullato" : a.place_id ? "Verifica la posizione per questa cartografia" : undefined,
      escluso, stato, inizio, fine, orarioIncompleto: !a.appointment_time || (!a.appointment_end_time && !base?.duration_minutes),
      base: utente && a.assigned_to === utente && base?.owner_id === utente && base.calendar_type === "personal" && !base.base_place_id
        ? coordinate(base.base_lat, base.base_lng) : null,
      attivita: [{
        id: a.id, nome: a.title, inizio, fine,
        risorse: a.assigned_to ? [{ id: a.assigned_to, nome: a.assigned_name || "Commerciale assegnato", tipo: "commerciale" }] : [],
      }],
    }];
  });
}

export function cantieriMappa(ordini: CalendarOrder[], giorno: string, personale: boolean, personeVisibili: boolean): VoceMappa[] {
  return ordini.flatMap(o => {
    const ieri = dataAdiacente(giorno, -1);
    const attivita = getOrderWorkPeriods(o).flatMap(f => {
      const segmenti = (data: string, continua: boolean): Attivita[] => {
        if (data < f.start_date || data > f.end_date) return [];
        const inizioLavoro = f.start_time ?? o.work_start_time;
        const fineLavoro = f.end_time ?? o.work_end_time;
        const fasce = new Map<string, { inizio: number | null; fine: number | null; risorse: Risorsa[] }>();
        const prenotazioni = personeVisibili ? f.resources.filter(r => r.start_date <= data && r.end_date >= data) : [];
        for (const r of prenotazioni) {
          const fascia = orari(r.start_time ?? inizioLavoro, r.end_time ?? fineLavoro);
          const chiave = `${fascia.inizio}:${fascia.fine}`;
          const gruppo = fasce.get(chiave) ?? { ...fascia, risorse: [] };
          const tipo = r.resourceType === "team" ? "squadra" : "operaio";
          if (!gruppo.risorse.some(s => s.id === r.resourceId && s.tipo === tipo)) {
            gruppo.risorse.push({ id: r.resourceId, nome: r.resourceName, tipo });
          }
          fasce.set(chiave, gruppo);
        }
        if (!fasce.size) {
          const fascia = orari(inizioLavoro, fineLavoro);
          fasce.set(`${fascia.inizio}:${fascia.fine}`, { ...fascia, risorse: [] });
        }
        return [...fasce].flatMap(([chiave, fascia]) => {
          if (continua && (fascia.fine ?? 0) <= 1440) return [];
          return [{
            id: `${f.id}:${chiave}${continua ? ":continua" : ""}`, nome: f.name, stato: f.status,
            inizio: continua ? 0 : fascia.inizio, fine: continua ? (fascia.fine ?? 1440) - 1440 : fascia.fine,
            risorse: fascia.risorse,
          }];
        });
      };
      return [...segmenti(ieri, true), ...segmenti(giorno, false)];
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
