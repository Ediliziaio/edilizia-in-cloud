/**
 * Sopralluoghi: elenco per la bacheca e pianificazione con appuntamento in calendario.
 * Pianificare crea (o sposta) l'appuntamento nel calendario del tecnico, collegato al
 * sopralluogo con surveys.appointment_id: da lì arriva su Google con la scheda cliente.
 */
import { supabase } from "@/integrations/supabase/client";
import { oraFine, type SopralluogoBacheca } from "@/lib/sopralluoghi/bacheca";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const nomePersona = (p: { first_name?: string | null; last_name?: string | null } | undefined | null) =>
  [p?.first_name, p?.last_name].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || null;

/** Tutti i sopralluoghi dell'azienda, con nome e telefono del cliente, tecnico e stato dell'appuntamento. */
export async function listaSopralluoghiBacheca(companyId: string): Promise<SopralluogoBacheca[]> {
  const { data, error } = await db
    .from("surveys")
    .select("id, code, status, scheduled_at, address, city, contact_id, client_id, technician_id, estimate_id, order_id, appointment_id, created_at, updated_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[surveys] listaSopralluoghiBacheca failed", error);
    throw new Error("Errore caricamento sopralluoghi");
  }
  const righe = (data ?? []) as SopralluogoBacheca[];
  const uniq = (xs: Array<string | null | undefined>) => Array.from(new Set(xs.filter((x): x is string => !!x)));

  const contatti = uniq(righe.map((r) => r.contact_id));
  const persone = uniq(righe.flatMap((r) => [r.client_id, r.technician_id]));
  const appuntamenti = uniq(righe.map((r) => r.appointment_id));

  // Arricchimenti: se uno fallisce, la bacheca si vede lo stesso (senza quel dato).
  const [cRes, pRes, aRes] = await Promise.all([
    contatti.length ? db.from("marketing_contacts").select("id, first_name, last_name, phone, company_name").in("id", contatti) : { data: [] },
    persone.length ? db.from("profiles").select("id, first_name, last_name, phone").in("id", persone) : { data: [] },
    appuntamenti.length ? db.from("appointments").select("id, status").in("id", appuntamenti) : { data: [] },
  ]);
  type Persona = { id: string; first_name: string | null; last_name: string | null; phone?: string | null; company_name?: string | null };
  const mappa = <T extends { id: string }>(x: { data?: T[] | null }) => new Map((x.data ?? []).map((r) => [r.id, r]));
  const c = mappa<Persona>(cRes);
  const p = mappa<Persona>(pRes);
  const a = mappa<{ id: string; status: string | null }>(aRes);

  return righe.map((r) => {
    const contatto = r.contact_id ? c.get(r.contact_id) : undefined;
    const cliente = r.client_id ? p.get(r.client_id) : undefined;
    return {
      ...r,
      cliente_nome: nomePersona(contatto) ?? contatto?.company_name ?? nomePersona(cliente),
      cliente_telefono: contatto?.phone ?? cliente?.phone ?? null,
      tecnico_nome: r.technician_id ? nomePersona(p.get(r.technician_id)) : null,
      appuntamento_stato: r.appointment_id ? a.get(r.appointment_id)?.status ?? null : null,
    };
  });
}

export interface PianificaInput {
  surveyId: string;
  companyId: string;
  /** yyyy-MM-dd e HH:mm. */
  data: string;
  ora: string;
  durataMin: number;
  tecnicoId: string | null;
  userId: string;
}

export interface PianificaEsito {
  appointmentId: string;
  /** true = l'appuntamento esisteva già ed è stato spostato (serve update-event su Google). */
  spostato: boolean;
}

/** Il calendario del tecnico: quello suo e attivo, preferendo uno «rilievo» o «sopralluogo». */
async function calendarioDelTecnico(companyId: string, tecnicoId: string | null): Promise<string | null> {
  if (!tecnicoId) return null;
  const { data } = await db
    .from("marketing_calendars")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("owner_id", tecnicoId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const lista = (data ?? []) as Array<{ id: string; name: string }>;
  return (lista.find((x) => /rilievo|sopralluog/i.test(x.name)) ?? lista[0])?.id ?? null;
}

/**
 * Fissa data, ora e tecnico del sopralluogo e il relativo appuntamento in calendario:
 * lo crea, o lo sposta se già c'è. La data del sopralluogo e quella dell'appuntamento
 * restano la stessa (il database le allinea anche se si sposta dal calendario).
 */
export async function pianificaSopralluogo(i: PianificaInput): Promise<PianificaEsito> {
  const { data: s, error: e1 } = await db
    .from("surveys")
    .select("id, code, address, address_number, city, zip, province, latitude, longitude, contact_id, opportunity_id, order_id, appointment_id")
    .eq("id", i.surveyId).eq("company_id", i.companyId).maybeSingle();
  if (e1 || !s) throw new Error("Sopralluogo non trovato");

  let nomeCliente = "";
  if (s.contact_id) {
    const { data: c } = await db.from("marketing_contacts").select("first_name, last_name, company_name").eq("id", s.contact_id).maybeSingle();
    nomeCliente = nomePersona(c) ?? c?.company_name ?? "";
  }
  const via = [s.address, s.address_number].filter(Boolean).join(" ");
  const indirizzo = [via, [s.zip, s.city].filter(Boolean).join(" "), s.province ? `(${s.province})` : ""].filter(Boolean).join(", ");
  const campi = {
    appointment_date: i.data,
    appointment_time: `${i.ora}:00`,
    appointment_end_time: `${oraFine(i.ora, i.durataMin)}:00`,
    assigned_to: i.tecnicoId,
  };
  const scheduledAt = new Date(`${i.data}T${i.ora}:00`).toISOString();

  let appointmentId: string | null = s.appointment_id ?? null;
  let spostato = false;
  if (appointmentId) {
    const { error } = await db.from("appointments").update({ ...campi, status: "confermato" }).eq("id", appointmentId).eq("company_id", i.companyId);
    if (error) throw new Error("Appuntamento non aggiornato: " + error.message);
    spostato = true;
  } else {
    const calendarId = await calendarioDelTecnico(i.companyId, i.tecnicoId);
    const { data: nuovo, error } = await db.from("appointments").insert({
      company_id: i.companyId,
      calendar_id: calendarId,
      contact_id: s.contact_id ?? null,
      opportunity_id: s.opportunity_id ?? null,
      order_id: s.order_id ?? null,
      title: `Sopralluogo${nomeCliente ? ` · ${nomeCliente}` : ""} (${s.code})`,
      description: `Sopralluogo ${s.code}`,
      appointment_type: "sopralluogo_preventivo",
      status: "confermato",
      created_by: i.userId,
      address_line: via || null,
      address_city: s.city ?? null,
      address_postal_code: s.zip ?? null,
      address_province: s.province ?? null,
      address_country: "IT",
      formatted_address: indirizzo || null,
      lat: s.latitude ?? null,
      lng: s.longitude ?? null,
      ...campi,
    }).select("id").single();
    if (error || !nuovo) throw new Error("Appuntamento non creato: " + (error?.message ?? "errore"));
    appointmentId = nuovo.id as string;
  }

  const { error: e3 } = await db.from("surveys")
    .update({ scheduled_at: scheduledAt, technician_id: i.tecnicoId, appointment_id: appointmentId })
    .eq("id", i.surveyId).eq("company_id", i.companyId);
  if (e3) throw new Error("Sopralluogo non aggiornato: " + e3.message);
  return { appointmentId, spostato };
}
