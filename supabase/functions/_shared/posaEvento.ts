/**
 * La posa come evento Google, e il ritorno. Funzioni pure, senza Deno né
 * Supabase: le testa vitest da src/test/logic/posaEvento.test.ts.
 *
 * Regole: con orari → evento a orario in Europe/Rome; senza → tutto-il-giorno,
 * dove Google vuole la fine ESCLUSIVA (il giorno dopo l'ultimo). Il legame con
 * la commessa sta in extendedProperties.private, non nella descrizione.
 */
export interface CommessaPerEvento {
  id: string;
  company_id: string;
  order_code: string | null;
  client_name: string | null;
  client_phone?: string | null;
  description: string | null;
  /** Descrizione del lavoro da fare (campo a parte, compilato di rado). */
  work_description?: string | null;
  tipo_lavoro?: string | null;
  /** Indirizzo del cantiere: `indirizzo_lavori`, poi `work_address`, poi quello del cliente. */
  indirizzo_lavori: string | null;
  work_address?: string | null;
  client_address?: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
}

export interface EventoGoogle {
  summary: string;
  description: string;
  location?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  extendedProperties: { private: { eic_order_id: string; eic_company_id: string; eic_kind: "posa" } };
}

const APP_URL = "https://app.ediliziaincloud.com";

/** L'indirizzo del cantiere, con i ripieghi: in 575 commesse solo 96 hanno `indirizzo_lavori`, 557 quello del cliente. */
export function indirizzoCantiere(o: Pick<CommessaPerEvento, "indirizzo_lavori" | "work_address" | "client_address">): string | null {
  for (const v of [o.indirizzo_lavori, o.work_address, o.client_address]) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return null;
}

/**
 * Il testo che la squadra legge sul telefono: chi, dove, cosa, come chiamarlo.
 * Il link alla commessa in fondo, per chi ha l'app.
 */
export function descrizioneEvento(o: CommessaPerEvento): string {
  const righe: string[] = [];
  if (o.client_name?.trim()) righe.push(`Cliente: ${o.client_name.trim()}`);
  const ind = indirizzoCantiere(o);
  if (ind) righe.push(`Indirizzo: ${ind}`);
  const lavoro = [o.tipo_lavoro?.trim(), o.description?.trim(), o.work_description?.trim()].filter((v, i, a) => v && a.indexOf(v) === i);
  if (lavoro.length) righe.push(`Lavoro: ${lavoro.join(" — ")}`);
  if (o.client_phone?.trim()) righe.push(`Telefono: ${o.client_phone.trim()}`);
  righe.push("", `${APP_URL}/azienda/ordini/${o.id}`);
  return righe.join("\n");
}

function normalizzaOra(t: string): string {
  const [h = "00", m = "00", s = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${(s || "00").padStart(2, "0")}`;
}

export function giornoDopo(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function giornoPrima(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function costruisciEventoPosa(o: CommessaPerEvento): EventoGoogle {
  if (!o.work_start_date) throw new Error("Commessa senza data di inizio lavori");
  const fine = o.work_end_date && o.work_end_date >= o.work_start_date ? o.work_end_date : o.work_start_date;
  const conOrari = !!o.work_start_time && !!o.work_end_time;
  // Titolo: prima il cliente (è quello che la squadra cerca), poi il codice.
  const summary = ["Posa", o.client_name?.trim() || null, o.order_code].filter(Boolean).join(" · ");
  const description = descrizioneEvento(o);
  const location = indirizzoCantiere(o);
  return {
    summary,
    description,
    ...(location ? { location } : {}),
    start: conOrari
      ? { dateTime: `${o.work_start_date}T${normalizzaOra(o.work_start_time!)}`, timeZone: "Europe/Rome" }
      : { date: o.work_start_date },
    end: conOrari
      ? { dateTime: `${fine}T${normalizzaOra(o.work_end_time!)}`, timeZone: "Europe/Rome" }
      : { date: giornoDopo(fine) },
    extendedProperties: { private: { eic_order_id: o.id, eic_company_id: o.company_id, eic_kind: "posa" } },
  };
}

export interface DateLavori {
  work_start_date: string;
  work_end_date: string;
  work_start_time: string | null;
  work_end_time: string | null;
}

/** Da un evento Google (a orario o tutto-il-giorno) alle date/ore della commessa. */
export function leggiDateDaEventoGoogle(ev: {
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}): DateLavori | null {
  if (ev.start?.date && ev.end?.date) {
    return { work_start_date: ev.start.date, work_end_date: giornoPrima(ev.end.date), work_start_time: null, work_end_time: null };
  }
  if (ev.start?.dateTime && ev.end?.dateTime) {
    // Google manda l'ora con l'offset del calendario (es. +02:00): la parte
    // "YYYY-MM-DDTHH:MM:SS" è già l'ora locale di quel calendario.
    const s = ev.start.dateTime, e = ev.end.dateTime;
    return {
      work_start_date: s.slice(0, 10),
      work_end_date: e.slice(0, 10),
      work_start_time: s.slice(11, 19),
      work_end_time: e.slice(11, 19),
    };
  }
  return null;
}

/** Vero se le date/ore della commessa e dell'evento coincidono: niente da scrivere. */
export function stesseDate(a: DateLavori, b: DateLavori): boolean {
  return a.work_start_date === b.work_start_date && a.work_end_date === b.work_end_date
    && (a.work_start_time ?? null) === (b.work_start_time ?? null) && (a.work_end_time ?? null) === (b.work_end_time ?? null);
}
