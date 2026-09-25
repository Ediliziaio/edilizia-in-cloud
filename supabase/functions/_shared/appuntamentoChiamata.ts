/**
 * La chiamata conoscitiva (Discovery) fissata da sola quando una risposta
 * all'outreach dice «chiamami oggi alle 15» (25/09/2026, richiesta del founder:
 * «se ho altri appuntamenti mettimi comunque l'appuntamento»).
 *
 * Stessa strada della prenotazione dal calendario pubblico (public-booking-crea):
 * appuntamento nel calendario del brand con il contatto (il trigger del
 * database avvisa le automazioni «appuntamento creato»), subito sul Google /
 * Apple Calendar del responsabile, una riga nel registro della scheda. In più:
 * - tipo «chiamata», così i flussi che fissano la demo lo riconoscono;
 * - ora detta → quella, anche se occupata; solo fascia → il primo slot libero
 *   della fascia, o l'inizio della fascia se non c'è posto;
 * - niente conferma né promemoria al cliente: lo chiami tu, e il messaggio
 *   «ti chiamiamo alle 15» lo manda il flusso appuntamenti;
 * - la scheda passa in «Discovery · chiamata conoscitiva» e il promemoria di
 *   chiamata si sposta all'ora dell'appuntamento.
 */
// deno-lint-ignore-file no-explicit-any
import { dataEstesa, nuovoToken, romaVersoUtc, sincronizzaCalendariEsterni } from "./appuntamentiPubblici.ts";
import { hhmm, primoSlotLibero, telefonoNelTesto, type RichiestaChiamata } from "./outreach-richiesta-chiamata.ts";

const PIATTAFORMA = "00000000-0000-0000-0000-000000000001";
/** Il nome della fase, uguale in tutte le pipeline dei brand (migrazione 20280925211300). */
export const FASE_DISCOVERY = "Discovery · chiamata conoscitiva";

const minuti = (t: string | null | undefined) => {
  const [h, m] = String(t ?? "00:00").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface ChiamataFissata {
  appointmentId: string;
  giorno: string;
  ora: string;
  /** Si accavalla ad altri impegni del responsabile. */
  sovrapposta: boolean;
  calendario: string;
  /** C'era già una chiamata futura: non se ne crea un'altra. */
  esistente?: boolean;
}

export async function fissaChiamataConoscitiva(admin: any, opz: {
  brandId: string;
  contactId: string;
  richiesta: RichiestaChiamata;
  /** Il testo della risposta, per le note. */
  risposta: string;
  email?: string | null;
}): Promise<ChiamataFissata | null> {
  const { data: brand } = await admin.from("outreach_brands")
    .select("name, calendario_chiamate_id, durata_chiamata_min").eq("id", opz.brandId).maybeSingle();
  if (!brand?.calendario_chiamate_id) return null;
  const { data: cal } = await admin.from("public_booking_calendars")
    .select("id, name, company_id, owner_id").eq("id", brand.calendario_chiamate_id).maybeSingle();
  if (!cal?.id) return null;
  const durata = Math.max(5, Number(brand.durata_chiamata_min ?? 15));

  // Una chiamata già fissata e ancora davanti: non se ne crea un'altra.
  const oggiIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const { data: gia } = await admin.from("appointments")
    .select("id, appointment_date, appointment_time")
    .eq("contact_id", opz.contactId).eq("company_id", cal.company_id).eq("appointment_type", "chiamata")
    .gte("appointment_date", oggiIso).not("status", "in", '("annullato","cancelled","canceled")')
    .order("appointment_date").limit(1).maybeSingle();
  if (gia?.id) {
    return { appointmentId: gia.id, giorno: gia.appointment_date, ora: String(gia.appointment_time).slice(0, 5), sovrapposta: false, calendario: cal.name, esistente: true };
  }

  // Gli impegni del responsabile quel giorno: appuntamenti di qualsiasi
  // calendario assegnati a lui, e gli impegni di Google / Apple / Outlook.
  const giorno = opz.richiesta.giorno;
  const occupati: Array<{ da: number; a: number }> = [];
  if (cal.owner_id) {
    const { data: app } = await admin.from("appointments")
      .select("appointment_time, appointment_end_time")
      .eq("assigned_to", cal.owner_id).eq("appointment_date", giorno)
      .not("status", "in", '("annullato","cancelled","canceled")');
    for (const a of app ?? []) {
      const da = minuti(a.appointment_time);
      occupati.push({ da, a: a.appointment_end_time ? minuti(a.appointment_end_time) : da + 30 });
    }
    const inizioGiorno = romaVersoUtc(giorno, "00:00").toISOString();
    const fineGiorno = romaVersoUtc(giorno, "23:59").toISOString();
    const { data: impegni } = await admin.from("unified_calendar_busy_slots")
      .select("start_at, end_at").eq("user_id", cal.owner_id).lt("start_at", fineGiorno).gt("end_at", inizioGiorno);
    const zero = romaVersoUtc(giorno, "00:00").getTime();
    for (const b of impegni ?? []) {
      occupati.push({
        da: Math.max(0, Math.round((new Date(b.start_at).getTime() - zero) / 60_000)),
        a: Math.min(24 * 60, Math.round((new Date(b.end_at).getTime() - zero) / 60_000)),
      });
    }
  }
  const inizio = opz.richiesta.ora != null
    ? minuti(opz.richiesta.ora)
    : (primoSlotLibero(opz.richiesta.fascia, occupati, durata) ?? opz.richiesta.fascia.da);
  const fine = inizio + durata;
  const sovrapposta = occupati.some((o) => inizio < o.a && fine > o.da);

  const { data: contatto } = await admin.from("marketing_contacts")
    .select("first_name, last_name, company_name, phone").eq("id", opz.contactId).maybeSingle();
  const chi = [contatto?.first_name, contatto?.last_name].filter(Boolean).join(" ").trim() || contatto?.company_name || "contatto";
  // Il numero scritto nella risposta va sulla scheda, se la scheda non ce l'ha.
  const telefono = contatto?.phone || telefonoNelTesto(opz.risposta);
  if (!contatto?.phone && telefono) {
    await admin.from("marketing_contacts").update({ phone: telefono }).eq("id", opz.contactId);
  }
  const adesso = new Date().toISOString();
  const { data: creato, error } = await admin.from("appointments").insert({
    calendar_id: cal.id,
    company_id: cal.company_id ?? PIATTAFORMA,
    contact_id: opz.contactId,
    appointment_date: giorno,
    appointment_time: `${hhmm(inizio)}:00`,
    appointment_end_time: `${hhmm(fine)}:00`,
    title: `Chiamata conoscitiva — ${chi}`,
    description: [
      `Fissata da sola dalla risposta all'email di ${brand.name}.`,
      `Ha scritto: «${opz.risposta.replace(/\s+/g, " ").trim().slice(0, 300)}»`,
      telefono && `Tel: ${telefono}`,
      opz.email && `Email: ${opz.email}`,
      contatto?.company_name && `Azienda: ${contatto.company_name}`,
      sovrapposta && "Attenzione: si accavalla a un altro impegno.",
    ].filter(Boolean).join("\n"),
    appointment_type: "chiamata",
    status: "confermato",
    assigned_to: cal.owner_id || null,
    created_by: "00000000-0000-0000-0000-000000000000",
    meeting_provider: "none",
    meeting_status: "none",
    manage_token: nuovoToken(),
    booking_email: opz.email || null,
    // La chiamata la fai tu: niente conferma né promemoria automatici al cliente.
    conferma_inviata_at: adesso,
    reminder_24h_at: adesso,
    reminder_1h_at: adesso,
    reminder_5m_at: adesso,
  }).select("id").single();
  if (error) throw error;

  await sincronizzaCalendariEsterni({ azione: "push-event", appointmentId: creato.id, companyId: cal.company_id, userId: cal.owner_id ?? null });

  const quando = `${dataEstesa(giorno)} alle ${hhmm(inizio)}`;
  await admin.from("marketing_contact_activities").insert({
    company_id: cal.company_id,
    contact_id: opz.contactId,
    activity_type: "appuntamento_prenotato",
    description: `Chiamata conoscitiva fissata da sola per ${quando}: aveva risposto «${opz.richiesta.frase}»`,
    metadata: { appointment_id: creato.id, calendar_id: cal.id, origine: "risposta_outreach", sovrapposta },
  }).then(({ error: e }: any) => e && console.warn("[appuntamentoChiamata] attività non registrata:", e.message));

  // La scheda passa in Discovery (se c'è già: altrimenti ci pensa chi chiama
  // questa funzione, appena la scheda nasce).
  await portaInDiscovery(admin, opz.contactId, cal.company_id, giorno);

  // Il promemoria di chiamata va all'ora dell'appuntamento.
  await admin.from("outreach_call_tasks")
    .update({ due_at: romaVersoUtc(giorno, hhmm(inizio)).toISOString() })
    .eq("company_id", PIATTAFORMA).eq("contact_id", opz.contactId).eq("status", "pending");

  return { appointmentId: creato.id, giorno, ora: hhmm(inizio), sovrapposta, calendario: cal.name };
}

/** La scheda del contatto nella fase Discovery della sua pipeline (se la fase c'è). */
export async function portaInDiscovery(admin: any, contactId: string, companyId: string, giorno: string): Promise<boolean> {
  const { data: opp } = await admin.from("marketing_opportunities")
    .select("id, pipeline_id, stage_id").eq("contact_id", contactId).eq("company_id", companyId)
    .is("deleted_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!opp?.id) return false;
  const { data: fase } = await admin.from("marketing_pipeline_stages")
    .select("id").eq("pipeline_id", opp.pipeline_id).eq("name", FASE_DISCOVERY).maybeSingle();
  if (!fase?.id || fase.id === opp.stage_id) return false;
  await admin.from("marketing_opportunities").update({
    stage_id: fase.id, stage_changed_at: new Date().toISOString(),
    next_action: "Chiamata conoscitiva", next_action_date: giorno,
  }).eq("id", opp.id);
  return true;
}
